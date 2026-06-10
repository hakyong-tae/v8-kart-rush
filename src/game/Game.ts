import * as THREE from 'three'
import { getCourse, type CourseDef } from './courses'
import { getKart, getCharacter, combineStats, CHARACTERS, KARTS } from './roster'
import { Track, buildTrackMeshes, rng } from './track'
import { Assets, buildDecorations, makeRider, makeClouds, makeRescuer } from './assets'
import { Kart, resolveKartCollision } from './kart'
import { Input } from './input'
import { ItemManager, rollItem, type ItemType, type ItemActor } from './items'
import { audio } from './audio'
import { net, type PosMsg, type ItemMsg, type PlayerInfo } from '../net/net'

const KART_MODEL_YAW = Math.PI // Car Kit vehicles face -Z; flip to +Z forward

export type GamePhase = 'countdown' | 'racing' | 'finished'

export interface MinimapDot {
  x: number
  z: number
  color: string
  self?: boolean
}

export interface GhostData {
  dt: number // ms between samples
  samples: number[] // flat [x, z, heading, ...]
  nickname?: string
  totalMs?: number
  kart?: string
  char?: string
}

export interface Placement {
  name: string
  totalMs: number | null // null = did not finish before player
  isPlayer: boolean
  color: string
}

export interface FinishExtra {
  placements?: Placement[]
  ghost?: GhostData
}

export interface HudSnapshot {
  phase: GamePhase
  countdown: number
  startCharge: number // 0..1.05 start-boost charge during countdown
  lap: number
  totalLaps: number
  lapTimes: number[]
  currentLapMs: number
  totalMs: number
  rank: number
  totalRacers: number
  speed: number
  items: (ItemType | null)[]
  shieldT: number
  driftTier: number
  drifting: boolean
  boosting: boolean
  boostGauge: number
  boosterActive: boolean
  wrongWay: boolean
  rescuing: boolean
  finished: boolean
  finalTotalMs: number
  finalBestLapMs: number
  dots: MinimapDot[]
}

export interface GameOpts {
  courseId: string
  mode: 'time' | 'multi'
  raceMode: 'speed' | 'item'
  aiCount?: number // single item race: number of CPU karts
  ghost?: GhostData | null // single speed race: ghost to race against
  startAt?: number // server-clock ms (multi)
  players?: Record<string, PlayerInfo>
  onSnapshot: (snap: HudSnapshot) => void
  onFinish: (totalMs: number, bestLapMs: number, extra: FinishExtra) => void
}

interface RemoteKart {
  account: string
  group: THREE.Group
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

interface AiActor {
  id: string
  name: string
  color: string // kart id
  kart: Kart
  group: THREE.Group
  slot: ItemType | null
  shieldT: number
  nextItemAt: number
  laneOffset: number
  steer: number
  throttle: number
  stuckT: number
  finished: boolean
  finishMs: number | null
  baseSpeedStat: number
  startCharge: number
}

const PHYS_DT = 1 / 120
const AI_NAMES = ['로키', '제트', '핀', '루나', '볼트', '치치']

function makeKartVisual(assets: Assets, kartId: string, charId: string): THREE.Group {
  const group = new THREE.Group()
  const def = getKart(kartId)
  const model = assets.spawn(def.model, 2.4, 'z')
  if (model) {
    model.rotation.y += KART_MODEL_YAW
    group.add(model)
  } else {
    const fallback = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.8, 2.4),
      new THREE.MeshLambertMaterial({ color: 0xe04438 }),
    )
    fallback.position.y = 0.5
    group.add(fallback)
  }
  const rider = makeRider(getCharacter(charId))
  rider.scale.setScalar(def.riderScale)
  rider.position.set(...def.riderPos)
  group.add(rider)
  return group
}

function makeTranslucent(obj: THREE.Object3D, opacity: number) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    mesh.material = mats.map((m) => {
      const c = (m as THREE.Material).clone()
      c.transparent = true
      c.opacity = opacity
      c.depthWrite = false
      return c
    }) as any
    if (!Array.isArray(mesh.material) && mats.length === 1) mesh.material = (mesh.material as any)[0]
  })
}

export class Game {
  course: CourseDef
  track: Track
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  input = new Input()
  kart: Kart
  kartGroup: THREE.Group
  items: ItemManager
  remotes = new Map<string, RemoteKart>()
  ais: AiActor[] = []

  phase: GamePhase = 'countdown'
  goTime = 0
  lapStart = 0
  lapTimes: number[] = []
  slots: (ItemType | null)[] = [null, null]
  shieldT = 0
  shieldBubble: THREE.Mesh
  startCharge = 0
  finalTotalMs = 0
  finalBestLapMs = 0
  private itemCounter = 0
  private itemRand = rng(Math.floor(Math.random() * 1e9))

  // ghost
  private ghostGroup: THREE.Group | null = null
  private ghostRec: number[] = []
  private ghostRecAcc = 0

  // cloud rescuer (구름이)
  private rescuer: THREE.Group
  private rescue: {
    t: number
    dur: number
    from: THREE.Vector3
    fromY: number
    to: THREE.Vector3
    toHeading: number
  } | null = null

  private raf = 0
  private last = 0
  private acc = 0
  private snapAcc = 0
  private disposed = false
  private padCooldown = new Map<string, number>()
  private boostFlame: THREE.Mesh
  private sparkL: THREE.Mesh
  private sparkR: THREE.Mesh
  private netUnsubs: (() => void)[] = []
  private countdownStage = 4

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
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 900)
    this.resize()
    window.addEventListener('resize', this.resize)

    this.scene.background = new THREE.Color(theme.sky)
    this.scene.fog = new THREE.FogExp2(theme.fog, theme.fogDensity)
    this.scene.add(new THREE.HemisphereLight(theme.sky, theme.ground, theme.ambient))
    const sun = new THREE.DirectionalLight(theme.sun, theme.sunIntensity)
    sun.position.set(80, 120, 40)
    this.scene.add(sun)

    const { group } = buildTrackMeshes(this.track)
    this.scene.add(group)
    this.scene.add(buildDecorations(this.track, this.assets))
    if (!theme.night) this.scene.add(makeClouds(this.course.decorSeed))

    // local kart — final stats are the additive character + kart combination
    const slot = this.mySlot()
    this.kart = new Kart(
      this.track,
      slot,
      combineStats(getCharacter(net.character), getKart(net.color)),
    )
    this.kartGroup = makeKartVisual(assets, net.color, net.character)
    this.scene.add(this.kartGroup)

    this.shieldBubble = new THREE.Mesh(
      new THREE.SphereGeometry(2.0, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x7df0ff, transparent: true, opacity: 0.22 }),
    )
    this.shieldBubble.position.y = 1
    this.shieldBubble.visible = false
    this.kartGroup.add(this.shieldBubble)

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

    // items only in item mode
    this.items = new ItemManager(this.track, opts.raceMode === 'item')
    this.scene.add(this.items.group)

    // cloud rescuer (hidden until needed)
    this.rescuer = makeRescuer()
    this.rescuer.visible = false
    this.scene.add(this.rescuer)

    // single-player item race: CPU karts
    if (opts.mode === 'time' && opts.raceMode === 'item') {
      this.spawnAis(opts.aiCount ?? 3, slot)
    }

    // single-player speed race: ghost of the record holder
    if (opts.mode === 'time' && opts.raceMode === 'speed' && opts.ghost?.samples?.length) {
      const g = makeKartVisual(assets, opts.ghost.kart ?? 'red', opts.ghost.char ?? 'moka')
      makeTranslucent(g, 0.38)
      this.ghostGroup = g
      this.scene.add(g)
    }

    // remote players (multi)
    if (opts.mode === 'multi' && opts.players) {
      for (const [account, info] of Object.entries(opts.players)) {
        if (account === net.account) continue
        this.addRemote(account, info.color, info.char)
      }
      this.netUnsubs.push(net.onPos((m) => this.onRemotePos(m)))
      this.netUnsubs.push(net.onItem((m) => this.onRemoteItem(m)))
    }

    const nowPerf = performance.now()
    if (opts.mode === 'multi' && opts.startAt) {
      const msUntil = opts.startAt - net.serverNow()
      this.goTime = nowPerf + Math.max(300, msUntil)
    } else {
      this.goTime = nowPerf + 4000 // enough time to charge a start boost
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

  private spawnAis(count: number, playerSlot: number) {
    const myKart = net.color
    const kartPool = KARTS.map((k) => k.id).filter((id) => id !== myKart)
    const charPool = CHARACTERS.map((c) => c.id).filter((id) => id !== net.character)
    for (let i = 0; i < Math.min(count, 5); i++) {
      const color = kartPool[i % kartPool.length]
      const charId = charPool[i % charPool.length]
      const stats = combineStats(getCharacter(charId), getKart(color))
      const slotIdx = i >= playerSlot ? i + 1 : i // player keeps their grid slot
      const kart = new Kart(this.track, slotIdx, { ...stats })
      const group = makeKartVisual(this.assets, color, charId)
      this.scene.add(group)
      this.ais.push({
        id: `ai${i}`,
        name: AI_NAMES[i % AI_NAMES.length],
        color,
        kart,
        group,
        slot: null,
        shieldT: 0,
        nextItemAt: 0,
        laneOffset: (this.itemRand() - 0.5) * 0.9,
        steer: 0,
        throttle: 0,
        stuckT: 0,
        finished: false,
        finishMs: null,
        baseSpeedStat: stats.speed,
        startCharge: 0.4 + this.itemRand() * 0.5,
      })
    }
  }

  private addRemote(account: string, color: string, charId?: string) {
    const group = makeKartVisual(
      this.assets,
      color,
      charId ?? this.opts.players?.[account]?.char ?? 'moka',
    )
    const slotIdx = Object.keys(this.opts.players ?? {})
      .sort((a, b) => (this.opts.players![a].joinedAt ?? 0) - (this.opts.players![b].joinedAt ?? 0))
      .indexOf(account)
    const sp = this.track.spawnPose(Math.max(0, slotIdx))
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
      this.addRemote(m.a, this.opts.players?.[m.a]?.color ?? 'red')
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
      case 'banana':
        if (m.id && m.x !== undefined && m.z !== undefined) this.items.spawnBanana(m.id, m.x, m.z)
        break
      case 'bomb':
        if (m.id && m.x !== undefined && m.z !== undefined) this.items.spawnBomb(m.id, m.x, m.z)
        break
      case 'missile':
        if (m.id && m.trackPos !== undefined)
          this.items.spawnMissile(m.id, m.a, m.trackPos, m.lat ?? 0)
        break
      case 'bananaHit':
        if (m.id) this.items.removeBanana(m.id)
        break
      case 'missileHit':
        if (m.id) this.items.removeMissile(m.id)
        break
      case 'lightning':
        if (this.phase === 'racing' && !this.kart.finished) {
          if (this.shieldT > 0) {
            this.shieldT = 0
            audio.pickup()
          } else {
            this.kart.applySpin()
            audio.hit()
          }
        }
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

  // ---------- items ----------

  private useItem(actor: 'me' | AiActor) {
    const isMe = actor === 'me'
    let item: ItemType | null
    if (isMe) {
      const idx = this.slots.findIndex((s) => s !== null)
      if (idx < 0) return
      item = this.slots[idx]
      this.slots[idx] = null
      this.slots = [...this.slots.filter((s) => s !== null), null, null].slice(0, 2) as (ItemType | null)[]
    } else {
      item = (actor as AiActor).slot
      if (!item) return
      ;(actor as AiActor).slot = null
    }
    if (!item) return
    const kart = isMe ? this.kart : (actor as AiActor).kart
    const id = `${isMe ? net.account || 'me' : (actor as AiActor).id}:${this.itemCounter++}`
    const actorId = isMe ? 'me' : (actor as AiActor).id

    switch (item) {
      case 'shield':
        if (isMe) this.shieldT = 10
        else (actor as AiActor).shieldT = 10
        if (isMe) audio.pickup()
        break
      case 'lightning':
        if (isMe) {
          net.sendItem({ kind: 'lightning' })
          // single-player: zap the AI field
          for (const ai of this.ais) this.zapActor(ai)
          audio.hit()
        } else {
          // AI lightning hits player and other AIs
          this.zapMe()
          for (const other of this.ais) if (other !== actor) this.zapActor(other)
        }
        break
      case 'boost':
        kart.applyBoost(1.5)
        if (isMe) audio.boost()
        break
      case 'banana': {
        const back = 2.4
        const x = kart.pos.x - Math.sin(kart.heading) * back
        const z = kart.pos.z - Math.cos(kart.heading) * back
        this.items.spawnBanana(id, x, z)
        if (isMe) {
          net.sendItem({ kind: 'banana', id, x, z })
          audio.fire()
        }
        break
      }
      case 'bomb': {
        const ahead = 12
        const x = kart.pos.x + Math.sin(kart.heading) * ahead
        const z = kart.pos.z + Math.cos(kart.heading) * ahead
        this.items.spawnBomb(id, x, z)
        if (isMe) {
          net.sendItem({ kind: 'bomb', id, x, z })
          audio.fire()
        }
        break
      }
      case 'missile': {
        const trackPos = (kart.trackIdx + 6) % this.track.N
        const lat = this.track.lateral(kart.pos, kart.trackIdx)
        this.items.spawnMissile(id, actorId, trackPos, lat)
        if (isMe) {
          net.sendItem({ kind: 'missile', id, trackPos, lat })
          audio.fire()
        }
        break
      }
    }
  }

  private zapMe() {
    if (this.phase !== 'racing' || this.kart.finished) return
    if (this.shieldT > 0) {
      this.shieldT = 0
      audio.pickup()
    } else {
      this.kart.applySpin()
      audio.hit()
    }
  }

  private zapActor(ai: AiActor) {
    if (ai.shieldT > 0) ai.shieldT = 0
    else ai.kart.applySpin()
  }

  private hitActor(actorId: string, removeFn?: () => void, broadcastKind?: 'bananaHit' | 'missileHit', id?: string) {
    removeFn?.()
    if (actorId === 'me') {
      if (broadcastKind && id) net.sendItem({ kind: broadcastKind, id })
      if (this.shieldT > 0) {
        this.shieldT = 0
        audio.pickup()
      } else {
        this.kart.applySpin()
        audio.hit()
      }
    } else {
      const ai = this.ais.find((a) => a.id === actorId)
      if (ai) this.zapActor(ai)
    }
  }

  // ---------- AI ----------

  private updateAiInputs(now: number) {
    for (const ai of this.ais) {
      if (ai.finished) {
        ai.throttle = 0
        ai.steer = 0
        continue
      }
      const k = ai.kart
      const lookahead = 16 + Math.min(10, Math.abs(k.speed) * 0.3)
      const target = this.track.sampleAt(k.trackIdx + Math.round(lookahead))
      const lat = ai.laneOffset * this.track.halfWidth * 0.55
      const tx = target.pos.x + target.nor.x * lat
      const tz = target.pos.z + target.nor.z * lat
      let want = Math.atan2(tx - k.pos.x, tz - k.pos.z)
      let diff = want - k.heading
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      ai.steer = THREE.MathUtils.clamp(diff * 2.3, -1, 1)
      ai.throttle = this.phase === 'racing' ? 1 : 0

      // unstick
      if (this.phase === 'racing' && Math.abs(k.speed) < 2) {
        ai.stuckT += 0.05
        if (ai.stuckT > 2.5) {
          k.resetToTrack()
          ai.stuckT = 0
        }
      } else ai.stuckT = 0

      // shield timer
      if (ai.shieldT > 0) ai.shieldT -= 0.05

      // rubber band: keep the race close
      const diffProg = this.kart.progress - k.progress
      const adj = diffProg > 1.4 ? 7 : diffProg < -1.4 ? -5 : 0
      k.stats.speed = ai.baseSpeedStat * (1 + adj / 100)

      // item use
      if (ai.slot && now > ai.nextItemAt && this.phase === 'racing') {
        this.useItem(ai)
        ai.nextItemAt = now + 1500 + this.itemRand() * 2500
      }
    }
  }

  // ---------- main loop ----------

  private loop = (now: number) => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    let dt = (now - this.last) / 1000
    this.last = now
    if (dt > 0.1) dt = 0.1

    this.input.update()

    // countdown + start-boost charge
    if (this.phase === 'countdown') {
      const remain = (this.goTime - now) / 1000
      const stage = Math.ceil(remain)
      if (stage < this.countdownStage && stage >= 0 && stage <= 3) {
        this.countdownStage = stage
        audio.countdownBeep(stage === 0)
      }
      // hold throttle to charge the launch boost (max 3s); overcharge blows the engine
      if (this.input.state.throttle > 0) {
        this.startCharge = Math.min(1.05, this.startCharge + dt / 3)
      } else {
        this.startCharge = Math.max(0, this.startCharge - dt * 0.8)
      }
      if (remain <= 0) {
        this.phase = 'racing'
        this.lapStart = this.goTime
        audio.startMusic()
        // resolve start boost
        if (this.startCharge >= 0.97) {
          this.kart.applySpin() // engine blown — too greedy!
          audio.hit()
        } else if (this.startCharge >= 0.35) {
          this.kart.applyBoost(0.5 + this.startCharge * 1.7)
          audio.booster()
        }
        for (const ai of this.ais) {
          if (ai.startCharge >= 0.35) ai.kart.applyBoost(0.5 + ai.startCharge * 1.4)
        }
      }
    }

    const canDrive = this.phase !== 'countdown'

    this.updateAiInputs(now)

    // physics
    this.acc += dt
    while (this.acc >= PHYS_DT) {
      this.acc -= PHYS_DT
      if (!this.rescue) {
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
        if (ev.fell) this.startRescue()
        if (ev.lapCrossed && this.phase === 'racing' && !this.kart.finished) {
          if (this.kart.cpTotal > 1) {
            const lapMs = now - this.lapStart
            this.lapTimes.push(lapMs)
            this.lapStart = now
            if (this.kart.lap >= this.course.laps) this.finishLocal(now)
            else audio.lap()
          }
        }
      }
      // AI physics
      for (const ai of this.ais) {
        const aev = ai.kart.step(
          PHYS_DT,
          { throttle: ai.throttle, steer: ai.steer, drift: false, useItem: false, reset: false },
          canDrive && !ai.finished,
          false,
        )
        if (aev.fell) ai.kart.resetToTrack() // AIs get an instant rescue
        if (aev.lapCrossed && ai.kart.cpTotal > 1 && ai.kart.lap >= this.course.laps && !ai.finished) {
          ai.finished = true
          ai.finishMs = now - this.goTime
        }
      }
    }

    // the rescuer also drags you back if you insist on driving the wrong way
    if (!this.rescue && this.phase === 'racing' && this.kart.wrongWayT > 4.5) {
      this.startRescue()
    }
    this.updateRescue(dt)

    if (this.input.consumeReset()) this.kart.resetToTrack()
    if (this.input.consumeUseItem()) {
      if (this.opts.raceMode === 'speed') {
        if (this.phase === 'racing' && this.kart.fireBooster()) audio.booster()
      } else if (this.phase === 'racing') {
        this.useItem('me')
      }
    }

    // boost pads + jump ramps (player + AI)
    if (this.phase === 'racing') {
      const padActors: { key: string; kart: Kart }[] = [
        { key: 'me', kart: this.kart },
        ...this.ais.map((a) => ({ key: a.id, kart: a.kart })),
      ]
      for (const pa of padActors) {
        if (pa.key === 'me' && this.rescue) continue
        const tFrac = pa.kart.trackIdx / this.track.N
        const lat = Math.abs(this.track.lateral(pa.kart.pos, pa.kart.trackIdx))
        this.course.boostPads.forEach((pad, i) => {
          const within = tFrac >= pad.t && tFrac <= pad.t + pad.len
          const cool = this.padCooldown.get(`${pa.key}:b${i}`) ?? 0
          if (within && lat < this.track.halfWidth && now > cool && pa.kart.y < 0.2) {
            this.padCooldown.set(`${pa.key}:b${i}`, now + 1500)
            pa.kart.applyBoost(1.3)
            if (pa.key === 'me') audio.boost()
          }
        })
        this.course.jumpPads.forEach((pad, i) => {
          // launch at the ramp's top edge
          const within = tFrac >= pad.t + pad.len * 0.55 && tFrac <= pad.t + pad.len + 0.004
          const cool = this.padCooldown.get(`${pa.key}:j${i}`) ?? 0
          if (within && lat < this.track.halfWidth * 0.85 && now > cool && !pa.kart.airborne) {
            this.padCooldown.set(`${pa.key}:j${i}`, now + 1200)
            pa.kart.applyJump(10.5)
            if (pa.key === 'me') audio.driftTick(1)
          }
        })
      }
    }

    // shield
    if (this.shieldT > 0) this.shieldT = Math.max(0, this.shieldT - dt)
    this.shieldBubble.visible = this.shieldT > 0
    if (this.shieldBubble.visible) {
      this.shieldBubble.scale.setScalar(1 + 0.05 * Math.sin(now * 0.01))
    }

    // items
    if (this.items.enabled) {
      const actors: ItemActor[] = [
        { id: 'me', kart: this.kart, wantsPickup: this.slots.some((s) => s === null) },
        ...this.ais.map((a) => ({ id: a.id, kart: a.kart, wantsPickup: a.slot === null })),
      ]
      this.items.update(dt, now, this.phase === 'racing' ? actors : [], {
        onPickup: (actorId, boxId) => {
          if (actorId === 'me') {
            const empty = this.slots.findIndex((s) => s === null)
            if (empty >= 0) this.slots[empty] = rollItem(this.itemRand)
            audio.pickup()
            net.sendItem({ kind: 'boxTaken', boxId })
          } else {
            const ai = this.ais.find((a) => a.id === actorId)
            if (ai) {
              ai.slot = rollItem(this.itemRand)
              if (ai.nextItemAt < now) ai.nextItemAt = now + 800 + this.itemRand() * 2000
            }
          }
        },
        onHitBanana: (actorId, id) =>
          this.hitActor(actorId, () => this.items.removeBanana(id), 'bananaHit', id),
        onHitMissile: (actorId, id) =>
          this.hitActor(actorId, () => this.items.removeMissile(id), 'missileHit', id),
        onBlast: (actorId) => this.hitActor(actorId),
      })
    }

    // remote karts
    for (const r of this.remotes.values()) {
      const span = Math.max(1, r.to.t - r.from.t)
      const k = THREE.MathUtils.clamp((now - r.from.t) / span, 0, 1.35)
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

    // kart-vs-kart collisions with AIs (both sides corrected)
    if (this.phase === 'racing') {
      for (const ai of this.ais) {
        resolveKartCollision(this.kart, ai.kart.pos)
        resolveKartCollision(ai.kart, this.kart.pos)
        for (const other of this.ais) {
          if (other !== ai) resolveKartCollision(ai.kart, other.kart.pos)
        }
      }
    }

    // broadcast my pos (multi)
    if (this.opts.mode === 'multi') {
      net.sendPos({
        x: this.kart.pos.x,
        z: this.kart.pos.z,
        h: this.kart.heading,
        s: this.kart.speed,
        lap: this.kart.lap,
        prog: this.kart.progress,
        boost: this.kart.boostT > 0 || this.kart.boosterT > 0 ? 1 : 0,
        spin: this.kart.spinT > 0 ? 1 : 0,
        drift: this.kart.driftDir,
      })
    }

    // ghost: record + playback
    if (this.opts.mode === 'time' && this.opts.raceMode === 'speed' && this.phase === 'racing' && !this.kart.finished) {
      this.ghostRecAcc += dt * 1000
      while (this.ghostRecAcc >= 100) {
        this.ghostRecAcc -= 100
        this.ghostRec.push(
          Math.round(this.kart.pos.x * 100) / 100,
          Math.round(this.kart.pos.z * 100) / 100,
          Math.round(this.kart.heading * 1000) / 1000,
        )
      }
    }
    if (this.ghostGroup && this.opts.ghost) {
      const gd = this.opts.ghost
      const elapsed = this.phase === 'countdown' ? 0 : now - this.goTime
      const fi = elapsed / gd.dt
      const i0 = Math.floor(fi) * 3
      const i1 = i0 + 3
      if (i1 + 2 < gd.samples.length) {
        const f = fi - Math.floor(fi)
        const s = gd.samples
        this.ghostGroup.visible = true
        this.ghostGroup.position.x = THREE.MathUtils.lerp(s[i0], s[i1], f)
        this.ghostGroup.position.z = THREE.MathUtils.lerp(s[i0 + 1], s[i1 + 1], f)
        let dh = s[i1 + 2] - s[i0 + 2]
        while (dh > Math.PI) dh -= Math.PI * 2
        while (dh < -Math.PI) dh += Math.PI * 2
        this.ghostGroup.rotation.y = s[i0 + 2] + dh * f
      } else if (gd.samples.length >= 3) {
        // ghost finished — park at its last sample
        const n = gd.samples.length
        this.ghostGroup.position.x = gd.samples[n - 3]
        this.ghostGroup.position.z = gd.samples[n - 2]
        this.ghostGroup.rotation.y = gd.samples[n - 1]
      }
    }

    // AI visuals
    for (const ai of this.ais) {
      ai.group.position.set(ai.kart.pos.x, ai.kart.y, ai.kart.pos.z)
      let yaw = ai.kart.heading
      if (ai.kart.spinT > 0) yaw += ai.kart.spinT * 12
      ai.group.rotation.y = yaw
    }

    this.updateKartVisual(now, dt)
    this.updateCamera(dt)
    audio.setEngine(this.kart.speed, 27, this.input.state.throttle)
    this.renderer.render(this.scene, this.camera)

    this.snapAcc += dt
    if (this.snapAcc >= 1 / 15) {
      this.snapAcc = 0
      this.opts.onSnapshot(this.snapshot(now))
    }
  }

  // ---------- cloud rescuer ----------

  private startRescue() {
    if (this.rescue) return
    const k = this.kart
    // same target as resetToTrack: center of the last passed checkpoint
    const NCP = 8
    const cpIdx = Math.floor((((k.nextCp - 1 + NCP) % NCP) / NCP) * this.track.N)
    const idx = k.cpTotal === 0 ? this.track.spawnPose(0).idx : cpIdx
    const s = this.track.sampleAt(idx)
    this.rescue = {
      t: 0,
      dur: 2.3,
      from: k.pos.clone(),
      fromY: k.y,
      to: new THREE.Vector3(s.pos.x, 0, s.pos.z),
      toHeading: Math.atan2(s.tan.x, s.tan.z),
    }
    k.speed = 0
    k.vy = 0
    k.driftDir = 0
    k.driftCharge = 0
    k.boostT = 0
    k.boosterT = 0
    k.spinT = 0
    this.rescuer.visible = true
    audio.pickup()
  }

  private updateRescue(dt: number) {
    if (!this.rescue) return
    const r = this.rescue
    r.t += dt
    const p = Math.min(1, r.t / r.dur)
    const ease = p * p * (3 - 2 * p) // smoothstep
    const k = this.kart
    k.pos.lerpVectors(r.from, r.to, ease)
    k.y = THREE.MathUtils.lerp(r.fromY, 0, ease) + Math.sin(ease * Math.PI) * 5
    let dh = r.toHeading - k.heading
    while (dh > Math.PI) dh -= Math.PI * 2
    while (dh < -Math.PI) dh += Math.PI * 2
    k.heading += dh * Math.min(1, 3 * dt)
    k.velDir = k.heading
    k.trackIdx = this.track.nearestIndex(k.pos, k.trackIdx)
    // rescuer floats above the kart, line down to it
    this.rescuer.position.set(k.pos.x, k.y + 4.2, k.pos.z)
    this.rescuer.rotation.y = k.heading
    if (p >= 1) {
      k.pos.copy(r.to)
      k.y = 0
      k.vy = 0
      k.airborne = false
      k.heading = r.toHeading
      k.velDir = r.toHeading
      k.wrongWayT = 0
      k.trackIdx = this.track.nearestIndex(k.pos)
      this.rescue = null
      this.rescuer.visible = false
    }
  }

  private placements(now: number): Placement[] {
    const rows: Placement[] = [
      {
        name: net.nickname || 'Racer',
        totalMs: this.kart.finished ? this.finalTotalMs : null,
        isPlayer: true,
        color: net.color,
      },
      ...this.ais.map((ai) => ({
        name: ai.name,
        totalMs: ai.finishMs,
        isPlayer: false,
        color: ai.color,
      })),
    ]
    // finished karts first by time, then unfinished by progress
    const progOf = (p: Placement) =>
      p.isPlayer ? this.kart.progress : this.ais.find((a) => a.name === p.name)!.kart.progress
    return rows.sort((a, b) => {
      if (a.totalMs !== null && b.totalMs !== null) return a.totalMs - b.totalMs
      if (a.totalMs !== null) return -1
      if (b.totalMs !== null) return 1
      return progOf(b) - progOf(a)
    })
  }

  private finishLocal(now: number) {
    this.kart.finished = true
    this.phase = 'finished'
    this.finalTotalMs = now - this.goTime
    this.finalBestLapMs = Math.min(...this.lapTimes)
    audio.finish()
    audio.stopEngine()
    audio.stopMusic()
    const extra: FinishExtra = {}
    if (this.opts.mode === 'time' && this.opts.raceMode === 'item') {
      extra.placements = this.placements(now)
    }
    if (this.opts.mode === 'time' && this.opts.raceMode === 'speed' && this.ghostRec.length > 0) {
      extra.ghost = {
        dt: 100,
        samples: this.ghostRec,
        kart: net.color,
        char: net.character,
        totalMs: this.finalTotalMs,
      }
    }
    this.opts.onFinish(this.finalTotalMs, this.finalBestLapMs, extra)
  }

  private updateKartVisual(now: number, dt: number) {
    const k = this.kart
    this.kartGroup.position.set(
      k.pos.x,
      k.y + k.hop * 0.45 * Math.sin(Math.min(1, 1 - k.hop) * Math.PI + 0.001),
      k.pos.z,
    )
    let yaw = k.heading + k.driftDir * 0.38
    if (k.spinT > 0) yaw += k.spinT * 12
    let dh = yaw - this.kartGroup.rotation.y
    while (dh > Math.PI) dh -= Math.PI * 2
    while (dh < -Math.PI) dh += Math.PI * 2
    this.kartGroup.rotation.y += dh * Math.min(1, 14 * dt)

    this.boostFlame.visible = k.boostT > 0 || k.boosterT > 0
    if (this.boostFlame.visible) {
      const big = k.boosterT > 0 ? 1.8 : 1
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
    for (const ai of this.ais) {
      if (ai.kart.progress > k.progress) rank++
    }
    const dots: MinimapDot[] = [{ x: k.pos.x, z: k.pos.z, color: '#fff', self: true }]
    for (const r of this.remotes.values()) {
      if (r.group.visible)
        dots.push({ x: r.group.position.x, z: r.group.position.z, color: getKart(r.color).ui })
    }
    for (const ai of this.ais) {
      dots.push({ x: ai.kart.pos.x, z: ai.kart.pos.z, color: getKart(ai.color).ui })
    }
    return {
      phase: this.phase,
      countdown: Math.max(0, (this.goTime - now) / 1000),
      startCharge: this.startCharge,
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
      totalRacers:
        1 +
        [...this.remotes.values()].filter((r) => r.group.visible).length +
        this.ais.length,
      speed: Math.abs(k.speed),
      items: [...this.slots],
      shieldT: this.shieldT,
      driftTier: k.driftTier,
      drifting: k.driftDir !== 0,
      boosting: k.boostT > 0 || k.boosterT > 0,
      boostGauge: k.boostGauge,
      boosterActive: k.boosterT > 0,
      wrongWay: k.wrongWayT > 0.8 && !this.rescue,
      rescuing: !!this.rescue,
      finished: k.finished,
      finalTotalMs: this.finalTotalMs,
      finalBestLapMs: this.finalBestLapMs,
      dots,
    }
  }

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
