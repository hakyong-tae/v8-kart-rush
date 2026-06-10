import * as THREE from 'three'
import { Track } from './track'
import { Kart } from './kart'

export type ItemType = 'boost' | 'missile' | 'trap'

export interface ItemBox {
  id: number
  pos: THREE.Vector3
  takenUntil: number // timestamp (ms, performance.now-based game clock)
  mesh: THREE.Mesh
}

export interface Trap {
  id: string // `${ownerAccount}:${n}`
  pos: THREE.Vector3
  mesh: THREE.Object3D
}

export interface Missile {
  id: string
  owner: string // account ('' = local solo)
  trackPos: number // fractional sample index along centerline
  lat: number
  ttl: number
  mesh: THREE.Object3D
  armed: number // time until it can hit (avoid hitting shooter at launch)
}

export function rollItem(rand: () => number): ItemType {
  const r = rand()
  if (r < 0.4) return 'boost'
  if (r < 0.7) return 'missile'
  return 'trap'
}

const BOX_RESPAWN_MS = 3500

export class ItemManager {
  boxes: ItemBox[] = []
  traps = new Map<string, Trap>()
  missiles = new Map<string, Missile>()
  group = new THREE.Group()
  private boxGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5)
  private boxMat = new THREE.MeshLambertMaterial({
    color: 0xffc81e,
    transparent: true,
    opacity: 0.85,
    emissive: 0x66520a,
  })
  private trapMat = new THREE.MeshLambertMaterial({ color: 0x7a4dff, emissive: 0x2a1a66 })
  private missileMat = new THREE.MeshLambertMaterial({ color: 0xff3b30, emissive: 0x661511 })

  constructor(public track: Track, public enabled: boolean) {
    if (!enabled) return
    let id = 0
    for (const row of track.course.itemRows) {
      for (const lane of row.lanes) {
        const pos = track.worldAt(row.t, lane * track.halfWidth)
        pos.y = 1.1
        const mesh = new THREE.Mesh(this.boxGeo, this.boxMat.clone())
        mesh.position.copy(pos)
        this.group.add(mesh)
        this.boxes.push({ id: id++, pos, takenUntil: 0, mesh })
      }
    }
  }

  spawnTrap(id: string, x: number, z: number) {
    if (this.traps.has(id)) return
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.2, 8), this.trapMat)
    mesh.position.set(x, 0.6, z)
    this.group.add(mesh)
    this.traps.set(id, { id, pos: new THREE.Vector3(x, 0, z), mesh })
  }

  removeTrap(id: string) {
    const t = this.traps.get(id)
    if (!t) return
    this.group.remove(t.mesh)
    this.traps.delete(id)
  }

  spawnMissile(id: string, owner: string, trackPos: number, lat: number) {
    if (this.missiles.has(id)) return
    const mesh = new THREE.Group()
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.4, 4, 8), this.missileMat)
    body.rotation.x = Math.PI / 2
    mesh.add(body)
    const m: Missile = { id, owner, trackPos, lat, ttl: 7, mesh, armed: 0.45 }
    const p = this.track.worldAt((trackPos / this.track.N) % 1, lat)
    mesh.position.set(p.x, 0.8, p.z)
    this.group.add(mesh)
    this.missiles.set(id, m)
  }

  removeMissile(id: string) {
    const m = this.missiles.get(id)
    if (!m) return
    this.group.remove(m.mesh)
    this.missiles.delete(id)
  }

  /**
   * Per-frame update. Local-authority rules:
   * - box pickup detected for the local kart -> callbacks.onBoxTaken
   * - the LOCAL kart being hit by any trap/missile -> callbacks.onLocalHit (victim authority)
   * Missiles are simulated on every client deterministically enough for casual play.
   */
  update(
    dt: number,
    now: number,
    localKart: Kart | null,
    hasItem: boolean,
    cb: {
      onPickup: (boxId: number) => void
      onLocalHitTrap: (trapId: string) => void
      onLocalHitMissile: (missileId: string) => void
    },
  ) {
    if (!this.enabled) return
    // boxes: spin + pickup
    for (const b of this.boxes) {
      const active = now >= b.takenUntil
      b.mesh.visible = active
      if (active) {
        b.mesh.rotation.y += dt * 2
        b.mesh.rotation.x += dt * 1.3
        if (localKart && !hasItem) {
          const dx = localKart.pos.x - b.pos.x
          const dz = localKart.pos.z - b.pos.z
          if (dx * dx + dz * dz < 1.9 * 1.9) {
            b.takenUntil = now + BOX_RESPAWN_MS
            cb.onPickup(b.id)
          }
        }
      }
    }

    // traps: local kart collision
    if (localKart && localKart.spinT <= 0) {
      for (const t of this.traps.values()) {
        const dx = localKart.pos.x - t.pos.x
        const dz = localKart.pos.z - t.pos.z
        if (dx * dx + dz * dz < 1.5 * 1.5) {
          cb.onLocalHitTrap(t.id)
          break
        }
      }
    }

    // missiles: advance along centerline
    for (const m of [...this.missiles.values()]) {
      m.ttl -= dt
      m.armed -= dt
      if (m.ttl <= 0) {
        this.removeMissile(m.id)
        continue
      }
      const speed = 52 // world units/sec converted to samples
      const samplesPerUnit = this.track.N / this.track.totalLength
      m.trackPos = (m.trackPos + speed * samplesPerUnit * dt) % this.track.N
      m.lat *= Math.exp(-1.2 * dt) // drift toward centerline
      const t = (m.trackPos / this.track.N) % 1
      const p = this.track.worldAt(t, m.lat)
      const s = this.track.sampleAt(Math.floor(m.trackPos))
      m.mesh.position.set(p.x, 0.8, p.z)
      m.mesh.rotation.y = Math.atan2(s.tan.x, s.tan.z)

      if (localKart && m.armed <= 0 && localKart.spinT <= 0) {
        const dx = localKart.pos.x - p.x
        const dz = localKart.pos.z - p.z
        if (dx * dx + dz * dz < 1.9 * 1.9) {
          cb.onLocalHitMissile(m.id)
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
    this.traps.clear()
    this.missiles.clear()
  }
}
