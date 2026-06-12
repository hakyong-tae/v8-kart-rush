import * as THREE from 'three'
import { Track } from './track'
import { Kart } from './kart'

export type ItemType = 'boost' | 'missile' | 'banana' | 'bomb' | 'shield' | 'lightning'

export function rollItem(rand: () => number): ItemType {
  const r = rand()
  if (r < 0.25) return 'boost'
  if (r < 0.45) return 'missile'
  if (r < 0.625) return 'banana'
  if (r < 0.775) return 'bomb'
  if (r < 0.9) return 'shield'
  return 'lightning'
}

export interface ItemBox {
  id: number
  pos: THREE.Vector3
  takenUntil: number
  mesh: THREE.Mesh
}

export interface Banana {
  id: string
  pos: THREE.Vector3
  mesh: THREE.Object3D
}

export interface Bomb {
  id: string
  pos: THREE.Vector3
  fuse: number
  mesh: THREE.Group
  coreMat: THREE.MeshLambertMaterial
}

export interface Missile {
  id: string
  owner: string // actor id ('me', 'ai0'.. or remote account)
  trackPos: number
  lat: number
  ttl: number
  mesh: THREE.Object3D
  armed: number
}

interface Explosion {
  mesh: THREE.Mesh
  t: number
}

// Any locally-simulated kart that can interact with items (player or AI)
export interface ItemActor {
  id: string
  kart: Kart
  wantsPickup: boolean // has an empty slot
}

export interface ItemCallbacks {
  onPickup: (actorId: string, boxId: number) => void
  onHitBanana: (actorId: string, id: string) => void
  onHitMissile: (actorId: string, id: string) => void
  onBlast: (actorId: string, bombId: string) => void
}

const BOX_RESPAWN_MS = 3500
const BOMB_FUSE = 2.2
const BOMB_RADIUS = 4.5

export class ItemManager {
  /** optional VFX hook — the game attaches the particle system here */
  onExplode?: (pos: THREE.Vector3) => void
  boxes: ItemBox[] = []
  bananas = new Map<string, Banana>()
  bombs = new Map<string, Bomb>()
  missiles = new Map<string, Missile>()
  private explosions: Explosion[] = []
  group = new THREE.Group()
  private boxGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5)
  private boxMat = new THREE.MeshLambertMaterial({
    color: 0xffc81e,
    transparent: true,
    opacity: 0.85,
    emissive: 0x66520a,
  })
  private bananaMat = new THREE.MeshLambertMaterial({ color: 0xffd633, emissive: 0x4d3d05 })
  private missileMat = new THREE.MeshLambertMaterial({ color: 0xff3b30, emissive: 0x661511 })

  constructor(public track: Track, public enabled: boolean) {
    if (!enabled) return
    let id = 0
    for (const row of track.course.itemRows) {
      for (const lane of row.lanes) {
        const pos = track.worldAt(row.t, lane * track.halfWidth)
        pos.y += 1.1
        const mesh = new THREE.Mesh(this.boxGeo, this.boxMat.clone())
        mesh.position.copy(pos)
        this.group.add(mesh)
        this.boxes.push({ id: id++, pos, takenUntil: 0, mesh })
      }
    }
  }

  /** 임의 월드 좌표의 도로 표면 높이 (평지 코스는 0) */
  private groundAt(x: number, z: number): number {
    const v = new THREE.Vector3(x, 0, z)
    const idx = this.track.nearestIndex(v)
    return this.track.groundY(idx, this.track.lateral(v, idx))
  }

  spawnBanana(id: string, x: number, z: number) {
    if (this.bananas.has(id)) return
    const g = new THREE.Group()
    // curved banana: torus arc lying flat-ish
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.16, 8, 12, Math.PI * 0.9), this.bananaMat)
    arc.rotation.x = Math.PI / 2.4
    arc.rotation.z = Math.PI * 0.55
    arc.position.y = 0.3
    g.add(arc)
    const gyB = this.groundAt(x, z)
    g.position.set(x, gyB, z)
    this.group.add(g)
    this.bananas.set(id, { id, pos: new THREE.Vector3(x, gyB, z), mesh: g })
  }

  removeBanana(id: string) {
    const b = this.bananas.get(id)
    if (!b) return
    this.group.remove(b.mesh)
    this.bananas.delete(id)
  }

  spawnBomb(id: string, x: number, z: number) {
    if (this.bombs.has(id)) return
    const g = new THREE.Group()
    const coreMat = new THREE.MeshLambertMaterial({ color: 0x26233a, emissive: 0x000000 })
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), coreMat)
    core.position.y = 0.55
    g.add(core)
    const fuseTip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.3, 5),
      new THREE.MeshBasicMaterial({ color: 0xffaa33 }),
    )
    fuseTip.position.y = 1.15
    g.add(fuseTip)
    const gyO = this.groundAt(x, z)
    g.position.set(x, gyO, z)
    this.group.add(g)
    this.bombs.set(id, { id, pos: new THREE.Vector3(x, gyO, z), fuse: BOMB_FUSE, mesh: g, coreMat })
  }

  spawnMissile(id: string, owner: string, trackPos: number, lat: number) {
    if (this.missiles.has(id)) return
    const mesh = new THREE.Group()
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.4, 4, 8), this.missileMat)
    body.rotation.x = Math.PI / 2
    mesh.add(body)
    const m: Missile = { id, owner, trackPos, lat, ttl: 7, mesh, armed: 0.45 }
    const p = this.track.worldAt((trackPos / this.track.N) % 1, lat)
    mesh.position.set(p.x, p.y + 0.8, p.z)
    this.group.add(mesh)
    this.missiles.set(id, m)
  }

  removeMissile(id: string) {
    const m = this.missiles.get(id)
    if (!m) return
    this.group.remove(m.mesh)
    this.missiles.delete(id)
  }

  private explode(pos: THREE.Vector3, bombId: string, actors: ItemActor[], cb: ItemCallbacks) {
    this.onExplode?.(pos)
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xff9a33, transparent: true, opacity: 0.85 }),
    )
    mesh.position.set(pos.x, pos.y + 1, pos.z)
    this.group.add(mesh)
    this.explosions.push({ mesh, t: 0 })
    for (const a of actors) {
      if (a.kart.spinT > 0) continue
      const dx = a.kart.pos.x - pos.x
      const dz = a.kart.pos.z - pos.z
      if (dx * dx + dz * dz < BOMB_RADIUS * BOMB_RADIUS) cb.onBlast(a.id, bombId)
    }
  }

  update(dt: number, now: number, actors: ItemActor[], cb: ItemCallbacks) {
    if (!this.enabled) return

    // boxes: spin + pickup
    for (const b of this.boxes) {
      const active = now >= b.takenUntil
      b.mesh.visible = active
      if (!active) continue
      b.mesh.rotation.y += dt * 2
      b.mesh.rotation.x += dt * 1.3
      for (const a of actors) {
        if (!a.wantsPickup) continue
        const dx = a.kart.pos.x - b.pos.x
        const dz = a.kart.pos.z - b.pos.z
        if (dx * dx + dz * dz < 1.9 * 1.9) {
          b.takenUntil = now + BOX_RESPAWN_MS
          cb.onPickup(a.id, b.id)
          break
        }
      }
    }

    // bananas
    for (const banana of [...this.bananas.values()]) {
      banana.mesh.rotation.y += dt
      for (const a of actors) {
        if (a.kart.spinT > 0) continue
        const dx = a.kart.pos.x - banana.pos.x
        const dz = a.kart.pos.z - banana.pos.z
        if (dx * dx + dz * dz < 1.5 * 1.5) {
          cb.onHitBanana(a.id, banana.id)
          break
        }
      }
    }

    // bombs: fuse + blink + blast
    for (const bomb of [...this.bombs.values()]) {
      bomb.fuse -= dt
      const urgency = Math.max(0, 1 - bomb.fuse / BOMB_FUSE)
      const blink = Math.sin(now * (0.01 + urgency * 0.04)) > 0
      bomb.coreMat.emissive.setHex(blink ? 0x992211 : 0x000000)
      bomb.mesh.scale.setScalar(1 + urgency * 0.25)
      if (bomb.fuse <= 0) {
        this.group.remove(bomb.mesh)
        this.bombs.delete(bomb.id)
        this.explode(bomb.pos, bomb.id, actors, cb)
      }
    }

    // explosion visuals
    for (const ex of [...this.explosions]) {
      ex.t += dt
      const k = ex.t / 0.45
      if (k >= 1) {
        this.group.remove(ex.mesh)
        this.explosions.splice(this.explosions.indexOf(ex), 1)
        continue
      }
      ex.mesh.scale.setScalar(1 + k * BOMB_RADIUS)
      ;(ex.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k)
    }

    // missiles: advance along centerline
    for (const m of [...this.missiles.values()]) {
      m.ttl -= dt
      m.armed -= dt
      if (m.ttl <= 0) {
        this.removeMissile(m.id)
        continue
      }
      const speed = 52
      const samplesPerUnit = this.track.N / this.track.totalLength
      m.trackPos = (m.trackPos + speed * samplesPerUnit * dt) % this.track.N
      m.lat *= Math.exp(-1.2 * dt)
      const t = (m.trackPos / this.track.N) % 1
      const p = this.track.worldAt(t, m.lat)
      const s = this.track.sampleAt(Math.floor(m.trackPos))
      m.mesh.position.set(p.x, p.y + 0.8, p.z)
      m.mesh.rotation.y = Math.atan2(s.tan.x, s.tan.z)

      for (const a of actors) {
        if (a.kart.spinT > 0) continue
        if (m.owner === a.id && m.armed > -1.2) continue // grace vs own missile
        if (m.armed > 0) continue
        const dx = a.kart.pos.x - p.x
        const dz = a.kart.pos.z - p.z
        if (dx * dx + dz * dz < 1.9 * 1.9) {
          cb.onHitMissile(a.id, m.id)
          break
        }
      }
    }
  }

  markBoxTaken(boxId: number, now: number) {
    const b = this.boxes.find((b) => b.id === boxId)
    if (b) b.takenUntil = now + BOX_RESPAWN_MS
  }

  dispose() {
    this.group.clear()
    this.boxes = []
    this.bananas.clear()
    this.bombs.clear()
    this.missiles.clear()
    this.explosions = []
  }
}
