import * as THREE from 'three'
import { getCourse, kartModelFor, riderColorFor, type CourseDef } from './courses'
import { Track, buildTrackMeshes } from './track'
import { Assets, buildDecorations, makeRider, makeClouds } from './assets'
import { Kart, resolveKartCollision } from './kart'
import { Input } from './input'
import { ItemManager, rollItem, type ItemType } from './items'
import { audio } from './audio'
import { net, type PosMsg, type ItemMsg, type PlayerInfo } from '../net/net'
import { rng } from './track'

// Kenney race car GLBs face +Z after GLTF import; tweak here if needed.
const KART_MODEL_YAW = 0

export type GamePhase = 'countdown' | 'racing' | 'finished'

export interface MinimapDot {
  x: number
  z: number
  color: string
  self?: boolean
}

export interface HudSnapshot {
  phase: GamePhase
  countdown: number
  lap: number // 1-based display lap
  totalLaps: number
  lapTimes: number[]
  currentLapMs: number
  totalMs: number
  rank: number
  totalRacers: number
  speed: number
  item: ItemType | null
  driftTier: number
  drifting: boolean
  boosting: boolean
  boostGauge: number
  boosterActive: boolean
  wrongWay: boolean
  finished: boolean
  finalTotalMs: number
  finalBestLapMs: number
  dots: MinimapDot[]
}

export interface GameOpts {
  courseId: string
  mode: 'time' | 'multi'
  raceMode: 'speed' | 'item' // speed = booster gauge (KartRider 스피드전), item = items
  startAt?: number // server-clock ms (multi)
  players?: Record<string, PlayerInfo> // multi: account -> info
  onSnapshot: (snap: HudSnapshot) => void
  onFinish: (totalMs: number, bestLapMs: number) => void
}

interface RemoteKart {
  account: string
  group: THREE.Group
  // interpolation buffer
  from: { x: number; z: number; h: number; t: number }
  to: { x: number; z: number; h: number; t: number }
  speed: number
  lap: number
  prog: number
  spin: number
  boost: number
  drift: number
  lastSeen: number
  spinVis: number
  color: string
}

const PHYS_DT = 1 / 120

export class Game {
  course: CourseDef
  track: Track
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  input = new Input()
  kart: Kart
  kartGroup = new THREE.Group()
  kartModel: THREE.Group | null = null
  items: ItemManager
  remotes = new Map<string, RemoteKart>()

  phase: GamePhase = 'countdown'
  goTime = 0 // performance.now() ms when race starts
  lapStart = 0
  lapTimes: number[] = []
  heldItem: ItemType | null = null
  finalTotalMs = 0
  finalBestLapMs = 0
  private itemCounter = 0
  private itemRand = rng(Math.floor(Math.random() * 1e9))

  private raf = 0
  private last = 0
  private acc = 0
  private snapAcc = 0
  private disposed = false
  private padCooldown = new Map<number, number>()
  private boostFlame: THREE.Mesh
  private sparkL: THREE.Mesh
  private sparkR: THREE.Mesh
  private netUnsubs: (() => void)[] = []

  constructor(
    private canvas: HTMLCanvasElement,
    private assets: Assets,
    public opts: GameOpts,
  ) {
    this.course = getCourse(opts.courseId)
    this.track = new Track(this.course)
    const theme = this.course.theme

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 900)
    this.resize()
    window.addEventListener('resize', this.resize)

    this.scene.background = new THREE.Color(theme.sky)
    this.scene.fog = new THREE.FogExp2(theme.fog, theme.fogDensity)
    const hemi = new THREE.HemisphereLight(theme.sky, theme.ground, theme.ambient)
    this.scene.add(hemi)
    const sun = new THREE.DirectionalLight(theme.sun, theme.sunIntensity)
    sun.position.set(80, 120, 40)
    this.scene.add(sun)

    const { group } = buildTrackMeshes(this.track)
    this.scene.add(group)
    this.scene.add(buildDecorations(this.track, this.assets))

    // sky clouds (daytime courses)
    if (!theme.night) this.scene.add(makeClouds(this.course.decorSeed))

    // local kart
    const slot = this.mySlot()
    this.kart = new Kart(this.track, slot)
    const model = this.assets.spawn(kartModelFor(net.color), 2.4, 'z')
    if (model) {
      model.rotation.y += KART_MODEL_YAW
      this.kartModel = model
      this.kartGroup.add(model)
    } else {
      const fallback = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.8, 2.4),
        new THREE.MeshLambertMaterial({ color: 0xe04438 }),
      )
      fallback.position.y = 0.5
      this.kartGroup.add(fallback)
    }
    // chibi rider on top
    const rider = makeRider(riderColorFor(net.color))
    rider.scale.setScalar(0.85)
    rider.position.set(0, 0.45, -0.3)
    this.kartGroup.add(rider)
    this.scene.add(this.kartGroup)

    // boost flame + drift sparks
    this.boostFlame = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 1.6, 10),
      new THREE.MeshBasicMaterial({ color: 0x37c8ff, transparent: true, opacity: 0.85 }),
    )
    this.boostFlame.rotation.x = -Math.PI / 2
    this.boostFlame.position.set(0, 0.65, -1.8)
    this.boostFlame.visible = false
    this.kartGroup.add(this.boostFlame)
    const sparkGeo = new THREE.SphereGeometry(0.22, 6, 6)
    this.sparkL = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0x4aa8ff }))
    this.sparkR = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0x4aa8ff }))
    this.sparkL.position.set(-0.8, 0.25, -1.2)
    this.sparkR.position.set(0.8, 0.25, -1.2)
    this.sparkL.visible = this.sparkR.visible = false
    this.kartGroup.add(this.sparkL, this.sparkR)

    // items only in item mode — speed mode (incl. Time Attack) uses the booster gauge
    this.items = new ItemManager(this.track, opts.raceMode === 'item')
    this.scene.add(this.items.group)

    // remote players
    if (opts.mode === 'multi' && opts.players) {
      for (const [account, info] of Object.entries(opts.players)) {
        if (account === net.account) continue
        this.addRemote(account, info.color)
      }
      this.netUnsubs.push(net.onPos((m) => this.onRemotePos(m)))
      this.netUnsubs.push(net.onItem((m) => this.onRemoteItem(m)))
    }

    // countdown timing
    const nowPerf = performance.now()
    if (opts.mode === 'multi' && opts.startAt) {
      const msUntil = opts.startAt - net.serverNow()
      this.goTime = nowPerf + Math.max(300, msUntil)
    } else {
      this.goTime = nowPerf + 3600
    }

    this.input.attach()
    audio.resume()
    this.last = nowPerf
    this.raf = requestAnimationFrame(this.loop)
    ;(window as any).__game = this
  }

  private mySlot(): number {
    if (this.opts.mode !== 'multi' || !this.opts.players) return 0
    const accounts = Object.keys(this.opts.players).sort(
      (a, b) => (this.opts.players![a].joinedAt ?? 0) - (this.opts.players![b].joinedAt ?? 0),
    )
    const i = accounts.indexOf(net.account)
    return i < 0 ? accounts.length : i
  }

  private addRemote(account: string, color: string) {
    const group = new THREE.Group()
    const model = this.assets.spawn(kartModelFor(color), 2.4, 'z')
    if (model) {
      model.rotation.y += KART_MODEL_YAW
      group.add(model)
    }
    const rider = makeRider(riderColorFor(color))
    rider.scale.setScalar(0.85)
    rider.position.set(0, 0.45, -0.3)
    group.add(rider)
    const slot = Object.keys(this.opts.players ?? {})
      .sort((a, b) => (this.opts.players![a].joinedAt ?? 0) - (this.opts.players![b].joinedAt ?? 0))
      .indexOf(account)
    const sp = this.track.spawnPose(Math.max(0, slot))
    group.position.copy(sp.pos)
    group.rotation.y = sp.heading
    this.scene.add(group)
    const now = performance.now()
    this.remotes.set(account, {
      account,
      group,
      from: { x: sp.pos.x, z: sp.pos.z, h: sp.heading, t: now },
      to: { x: sp.pos.x, z: sp.pos.z, h: sp.heading, t: now },
      speed: 0,
      lap: 0,
      prog: 0,
      spin: 0,
      boost: 0,
      drift: 0,
      lastSeen: now,
      spinVis: 0,
      color,
    })
  }

  private onRemotePos(m: PosMsg) {
    if (m.a === net.account) return
    let r = this.remotes.get(m.a)
    if (!r) {
      this.addRemote(m.a, this.opts.players?.[m.a]?.color ?? 'white')
      r = this.remotes.get(m.a)!
    }
    const now = performance.now()
    r.from = { x: r.group.position.x, z: r.group.position.z, h: r.group.rotation.y, t: now }
    r.to = { x: m.x, z: m.z, h: m.h, t: now + 110 }
    r.speed = m.s
    r.lap = m.lap
    r.prog = m.prog
    r.spin = m.spin
    r.boost = m.boost
    r.drift = m.drift
    r.lastSeen = now
  }

  private onRemoteItem(m: ItemMsg) {
    if (m.a === net.account) return
    const now = performance.now()
    switch (m.kind) {
      case 'boxTaken':
        if (m.boxId !== undefined) this.items.markBoxTaken(m.boxId, now)
        break
      case 'trap':
        if (m.id && m.x !== undefined && m.z !== undefined) this.items.spawnTrap(m.id, m.x, m.z)
        break
      case 'missile':
        if (m.id && m.trackPos !== undefined)
          this.items.spawnMissile(m.id, m.a, m.trackPos, m.lat ?? 0)
        break
      case 'trapHit':
        if (m.id) this.items.removeTrap(m.id)
        break
      case 'missileHit':
        if (m.id) this.items.removeMissile(m.id)
        break
    }
  }

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private useHeldItem() {
    if (!this.heldItem || this.phase !== 'racing') return
    const item = this.heldItem
    this.heldItem = null
    if (item === 'boost') {
      this.kart.applyBoost(1.5)
      audio.boost()
    } else if (item === 'trap') {
      const id = `${net.account}:${this.itemCounter++}`
      const back = 2.4
      const x = this.kart.pos.x - Math.sin(this.kart.heading) * back
      const z = this.kart.pos.z - Math.cos(this.kart.heading) * back
      this.items.spawnTrap(id, x, z)
      net.sendItem({ kind: 'trap', id, x, z })
      audio.fire()
    } else if (item === 'missile') {
      const id = `${net.account}:${this.itemCounter++}`
      const trackPos = (this.kart.trackIdx + 6) % this.track.N
      const lat = this.track.lateral(this.kart.pos, this.kart.trackIdx)
      this.items.spawnMissile(id, net.account, trackPos, lat)
      net.sendItem({ kind: 'missile', id, trackPos, lat })
      audio.fire()
    }
  }

  private countdownStage = 4

  private loop = (now: number) => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    let dt = (now - this.last) / 1000
    this.last = now
    if (dt > 0.1) dt = 0.1

    this.input.update()

    // phase transitions
    if (this.phase === 'countdown') {
      const remain = (this.goTime - now) / 1000
      const stage = Math.ceil(remain)
      if (stage < this.countdownStage && stage >= 0 && stage <= 3) {
        this.countdownStage = stage
        audio.countdownBeep(stage === 0)
      }
      if (remain <= 0) {
        this.phase = 'racing'
        this.lapStart = this.goTime
        audio.startMusic()
      }
    }

    const canDrive = this.phase === 'racing' || (this.phase === 'finished' && false)

    // physics fixed-step
    this.acc += dt
    while (this.acc >= PHYS_DT) {
      this.acc -= PHYS_DT
      const ev = this.kart.step(
        PHYS_DT,
        this.input.state,
        canDrive && !this.kart.finished,
        this.opts.raceMode === 'speed',
      )
      if (ev.driftStarted) audio.driftTick(0)
      if (ev.driftReleased === 1 || ev.driftReleased === 2) audio.boost()
      if (ev.gaugeFilled) audio.gaugeFull()
      if (ev.wallBumped) audio.wallBump()
      if (ev.lapCrossed && this.phase === 'racing' && !this.kart.finished) {
        if (this.kart.cpTotal > 1) {
          const lapMs = now - this.lapStart
          this.lapTimes.push(lapMs)
          this.lapStart = now
          if (this.kart.lap >= this.course.laps) {
            this.finishLocal(now)
          } else {
            audio.lap()
          }
        }
      }
    }

    if (this.input.consumeReset()) this.kart.resetToTrack()
    if (this.input.consumeUseItem()) {
      if (this.opts.raceMode === 'speed') {
        if (this.phase === 'racing' && this.kart.fireBooster()) audio.booster()
      } else {
        this.useHeldItem()
      }
    }

    // boost pads
    if (this.phase === 'racing') {
      const tNow = now
      const tFrac = this.kart.trackIdx / this.track.N
      this.course.boostPads.forEach((pad, i) => {
        const within = tFrac >= pad.t && tFrac <= pad.t + pad.len
        const lat = Math.abs(this.track.lateral(this.kart.pos, this.kart.trackIdx))
        const cool = this.padCooldown.get(i) ?? 0
        if (within && lat < this.track.halfWidth && tNow > cool) {
          this.padCooldown.set(i, tNow + 1500)
          this.kart.applyBoost(1.3)
          audio.boost()
        }
      })
    }

    // items
    this.items.update(dt, now, this.phase === 'racing' ? this.kart : null, this.heldItem !== null, {
      onPickup: (boxId) => {
        this.heldItem = rollItem(this.itemRand)
        audio.pickup()
        net.sendItem({ kind: 'boxTaken', boxId })
      },
      onLocalHitTrap: (id) => {
        this.kart.applySpin()
        this.items.removeTrap(id)
        audio.hit()
        net.sendItem({ kind: 'trapHit', id })
      },
      onLocalHitMissile: (id) => {
        const m = this.items.missiles.get(id)
        if (m && m.owner === net.account && m.armed > -1.2) return // grace vs own missile
        this.kart.applySpin()
        this.items.removeMissile(id)
        audio.hit()
        net.sendItem({ kind: 'missileHit', id })
      },
    })

    // remote karts: interpolate + collide
    for (const r of this.remotes.values()) {
      const span = Math.max(1, r.to.t - r.from.t)
      const k = THREE.MathUtils.clamp((now - r.from.t) / span, 0, 1.35) // slight extrapolation
      r.group.position.x = THREE.MathUtils.lerp(r.from.x, r.to.x, k)
      r.group.position.z = THREE.MathUtils.lerp(r.from.z, r.to.z, k)
      let dh = r.to.h - r.from.h
      while (dh > Math.PI) dh -= Math.PI * 2
      while (dh < -Math.PI) dh += Math.PI * 2
      r.group.rotation.y = r.from.h + dh * Math.min(k, 1)
      if (r.spin) {
        r.spinVis += dt * 8
        r.group.rotation.y += r.spinVis
      } else r.spinVis = 0
      r.group.visible = now - r.lastSeen < 5000
      if (r.group.visible && this.phase === 'racing') {
        resolveKartCollision(this.kart, r.group.position)
      }
    }

    // broadcast my pos
    if (this.opts.mode === 'multi') {
      net.sendPos({
        x: this.kart.pos.x,
        z: this.kart.pos.z,
        h: this.kart.heading,
        s: this.kart.speed,
        lap: this.kart.lap,
        prog: this.kart.progress,
        boost: this.kart.boostT > 0 ? 1 : 0,
        spin: this.kart.spinT > 0 ? 1 : 0,
        drift: this.kart.driftDir,
      })
    }

    // visuals
    this.updateKartVisual(now, dt)
    this.updateCamera(dt)
    audio.setEngine(this.kart.speed, 27, this.input.state.throttle)
    this.renderer.render(this.scene, this.camera)

    // HUD snapshot ~15Hz
    this.snapAcc += dt
    if (this.snapAcc >= 1 / 15) {
      this.snapAcc = 0
      this.opts.onSnapshot(this.snapshot(now))
    }
  }

  private finishLocal(now: number) {
    this.kart.finished = true
    this.phase = 'finished'
    this.finalTotalMs = now - this.goTime
    this.finalBestLapMs = Math.min(...this.lapTimes)
    audio.finish()
    audio.stopEngine()
    audio.stopMusic()
    this.opts.onFinish(this.finalTotalMs, this.finalBestLapMs)
  }

  private updateKartVisual(now: number, dt: number) {
    const k = this.kart
    this.kartGroup.position.set(k.pos.x, k.hop * 0.45 * Math.sin(Math.min(1, 1 - k.hop) * Math.PI + 0.001), k.pos.z)
    let yaw = k.heading + k.driftDir * 0.38
    if (k.spinT > 0) yaw += k.spinT * 12
    // smooth visual yaw
    let dh = yaw - this.kartGroup.rotation.y
    while (dh > Math.PI) dh -= Math.PI * 2
    while (dh < -Math.PI) dh += Math.PI * 2
    this.kartGroup.rotation.y += dh * Math.min(1, 14 * dt)

    this.boostFlame.visible = k.boostT > 0 || k.boosterT > 0
    if (this.boostFlame.visible) {
      const big = k.boosterT > 0 ? 1.8 : 1 // manual booster = huge flame
      const s = (0.8 + 0.4 * Math.sin(now * 0.04)) * big
      this.boostFlame.scale.set(s, s, s * 1.3)
      ;(this.boostFlame.material as THREE.MeshBasicMaterial).color.setHex(
        k.boosterT > 0 ? 0x37c8ff : 0xffb028,
      )
    }
    const drifting = k.driftDir !== 0
    this.sparkL.visible = this.sparkR.visible = drifting && k.driftTier > 0
    if (drifting) {
      const col = k.driftTier >= 2 ? 0xffa028 : 0x4aa8ff
      ;(this.sparkL.material as THREE.MeshBasicMaterial).color.setHex(col)
      ;(this.sparkR.material as THREE.MeshBasicMaterial).color.setHex(col)
      const s = 0.7 + 0.5 * Math.sin(now * 0.05)
      this.sparkL.scale.setScalar(s)
      this.sparkR.scale.setScalar(s)
    }
  }

  private camPos = new THREE.Vector3()
  private camInit = false

  private fovPunch = 0

  private updateCamera(dt: number) {
    const k = this.kart
    // KartRider-ish: lower and closer chase cam
    const back = 7.0
    const fwdX = Math.sin(k.heading)
    const fwdZ = Math.cos(k.heading)
    const target = new THREE.Vector3(k.pos.x - fwdX * back, 3.4, k.pos.z - fwdZ * back)
    if (!this.camInit) {
      this.camPos.copy(target)
      this.camInit = true
    }
    const boosting = k.boostT > 0 || k.boosterT > 0
    this.fovPunch += ((boosting ? 1 : 0) - this.fovPunch) * Math.min(1, 6 * dt)
    const speedZoom = 1 + Math.min(0.2, Math.abs(k.speed) / 140)
    this.camPos.lerp(target, Math.min(1, 6 * dt))
    this.camera.position.copy(this.camPos)
    this.camera.fov = 72 * speedZoom + this.fovPunch * 13
    this.camera.updateProjectionMatrix()
    this.camera.lookAt(k.pos.x + fwdX * 6, 1.2, k.pos.z + fwdZ * 6)
  }

  private snapshot(now: number): HudSnapshot {
    const k = this.kart
    let rank = 1
    for (const r of this.remotes.values()) {
      if (r.group.visible && r.prog > k.progress) rank++
    }
    const dots: MinimapDot[] = [{ x: k.pos.x, z: k.pos.z, color: '#fff', self: true }]
    for (const r of this.remotes.values()) {
      if (r.group.visible)
        dots.push({
          x: r.group.position.x,
          z: r.group.position.z,
          color: r.color,
        })
    }
    return {
      phase: this.phase,
      countdown: Math.max(0, (this.goTime - now) / 1000),
      lap: Math.min(this.course.laps, Math.max(1, k.lap + 1)),
      totalLaps: this.course.laps,
      lapTimes: [...this.lapTimes],
      currentLapMs: this.phase === 'racing' && !k.finished ? now - this.lapStart : 0,
      totalMs:
        this.phase === 'racing' && !k.finished
          ? now - this.goTime
          : k.finished
            ? this.finalTotalMs
            : 0,
      rank,
      totalRacers: 1 + [...this.remotes.values()].filter((r) => r.group.visible).length,
      speed: Math.abs(k.speed),
      item: this.heldItem,
      driftTier: k.driftTier,
      drifting: k.driftDir !== 0,
      boosting: k.boostT > 0 || k.boosterT > 0,
      boostGauge: k.boostGauge,
      boosterActive: k.boosterT > 0,
      wrongWay: k.wrongWayT > 0.8,
      finished: k.finished,
      finalTotalMs: this.finalTotalMs,
      finalBestLapMs: this.finalBestLapMs,
      dots,
    }
  }

  // outline for minimap rendering (normalized later by HUD)
  minimapOutline(): { x: number; z: number }[] {
    const pts: { x: number; z: number }[] = []
    for (let i = 0; i <= 100; i++) {
      const s = this.track.sampleAt(Math.floor((i / 100) * this.track.N))
      pts.push({ x: s.pos.x, z: s.pos.z })
    }
    return pts
  }

  dispose() {
    this.disposed = true
    if ((window as any).__game === this) (window as any).__game = null
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.resize)
    this.input.dispose()
    this.netUnsubs.forEach((u) => u())
    audio.stopEngine()
    audio.stopMusic()
    this.items.dispose()
    this.renderer.dispose()
  }
}
