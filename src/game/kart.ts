import * as THREE from 'three'
import { Track, NUM_CHECKPOINTS } from './track'
import type { InputState } from './input'
import type { KartStats } from './roster'

const DEFAULT_STATS: KartStats = {
  speed: 1, accel: 1, handling: 1, drift: 1, gauge: 1, boost: 1, mass: 1, spin: 1, grace: 0.5,
}

// Arcade kart tuning — KartRider-style: drift charges a booster gauge,
// full gauge fires a long manual boost.
const MAX_SPEED = 27
const BOOSTER_SPEED = 41 // manual booster (strongest)
const BOOST_SPEED = 37 // pads / items / release turbo
const GRASS_SPEED = 10
const ACCEL = 22
const BRAKE = 34
const REVERSE_MAX = 9
const COAST_DRAG = 1.1
const GRASS_DRAG = 2.4
const TURN_RATE = 2.35
const GRIP_NORMAL = 8.0
const GRIP_DRIFT = 1.55 // strong kick-out slide
const GRIP_ICE = 3.2
const GRIP_DRIFT_ICE = 1.1
const DRIFT_MIN_SPEED = 13
const MT_TIER1 = 0.7 // short drift -> tiny release boost (순간부스트 느낌)
const MT_TIER2 = 1.5
const SPIN_TIME = 1.1
const GAUGE_RATE = 0.3 // gauge/sec while drifting (~3.3s of drift = full)
const BOOSTER_TIME = 2.3

export type DriftTier = 0 | 1 | 2

// step()이 반환하는 이벤트 — 매 스텝 재사용 (반환 직후 읽고 버릴 것)
const STEP_EV = {
  lapCrossed: false,
  driftReleased: 0 as DriftTier,
  driftStarted: false,
  gaugeFilled: false,
  wallBumped: false,
  fell: false,
  landed: false,
}

export class Kart {
  pos = new THREE.Vector3()
  heading = 0 // facing angle (rad), atan2(x, z)
  velDir = 0 // direction of travel; lags heading while drifting
  speed = 0
  y = 0 // height above the road (jumps / falls)
  vy = 0
  airborne = false
  hop = 0 // visual hop height

  trackIdx = 0
  lap = 0 // completed laps
  nextCp = 0 // next checkpoint index expected
  cpTotal = 0 // total checkpoints passed (monotonic progress)
  finished = false

  boostT = 0
  boosterT = 0 // manual booster (stronger top speed)
  boostGauge = 0 // 0..1, charged by drifting (speed mode)
  spinT = 0
  driftDir: 0 | 1 | -1 = 0
  driftCharge = 0
  offroad = false
  wallHit = 0 // >0 right after a wall impact (for sfx/fx)
  wrongWayT = 0

  // race progress metric for ranking: laps + fraction
  progress = 0

  constructor(
    public track: Track,
    slot = 0,
    public stats: KartStats = DEFAULT_STATS,
  ) {
    this.respawnAtSlot(slot)
  }

  get ice(): boolean {
    return this.track.course.surface === 'ice'
  }

  respawnAtSlot(slot: number) {
    const sp = this.track.spawnPose(slot)
    this.pos.copy(sp.pos)
    this.heading = sp.heading
    this.velDir = sp.heading
    this.speed = 0
    this.trackIdx = sp.idx
    this.nextCp = 0
    this.cpTotal = 0
    this.lap = 0
    this.boostGauge = 0
  }

  get driftTier(): DriftTier {
    if (this.driftDir === 0) return 0
    if (this.driftCharge >= MT_TIER2) return 2
    if (this.driftCharge >= MT_TIER1) return 1
    return 0
  }

  resetToTrack() {
    // respawn at last checkpoint center
    const cpIdx = Math.floor(((this.nextCp - 1 + NUM_CHECKPOINTS) % NUM_CHECKPOINTS) / NUM_CHECKPOINTS * this.track.N)
    const idx = this.cpTotal === 0 ? this.track.spawnPose(0).idx : cpIdx
    const s = this.track.sampleAt(idx)
    this.pos.set(s.pos.x, s.pos.y, s.pos.z)
    this.heading = Math.atan2(s.tan.x, s.tan.z)
    this.velDir = this.heading
    this.speed = 0
    this.trackIdx = idx
    this.boostT = 0
    this.boosterT = 0
    this.spinT = 0
    this.driftDir = 0
    this.driftCharge = 0
    this.y = 0
    this.vy = 0
    this.airborne = false
  }

  applyBoost(sec: number) {
    this.boostT = Math.max(this.boostT, sec)
  }

  /** Jump ramp launch. Cancels any drift (you can't slide in the air). */
  applyJump(v = 10.5) {
    if (this.airborne) return
    this.airborne = true
    this.vy = v
    this.y = Math.max(this.y, 0.01)
    this.driftDir = 0
    this.driftCharge = 0
  }

  // ballistic cannon launch — flies a fixed horizontal velocity (ignores the
  // throttle / booster speed cap) and lands at the target after flightSec.
  launched = false
  private launchVX = 0
  private launchVZ = 0

  /** 대포 발사: tx,tz로 flightSec 만에 정확히 착지하는 탄도 비행 */
  launch(tx: number, tz: number, flightSec: number) {
    const dx = tx - this.pos.x
    const dz = tz - this.pos.z
    this.launchVX = dx / flightSec
    this.launchVZ = dz / flightSec
    this.heading = Math.atan2(dx, dz)
    this.velDir = this.heading
    this.speed = Math.hypot(dx, dz) / flightSec
    this.vy = 0.5 * 26 * flightSec // g=26 → y가 정확히 flightSec 후 0으로 복귀
    this.y = Math.max(this.y, 0.01)
    this.airborne = true
    this.launched = true
    this.driftDir = 0
    this.driftCharge = 0
    this.boostT = 0
    this.boosterT = 0
  }

  /** KartRider manual booster: consumes a full gauge. Returns true if fired. */
  fireBooster(): boolean {
    if (this.boostGauge < 1 || this.spinT > 0) return false
    this.boostGauge = 0
    this.boosterT = BOOSTER_TIME
    return true
  }

  hitGraceT = 0 // 피격 후 무적창 (invinc 스탯) — 연속 피격 방지

  applySpin() {
    if (this.spinT > 0 || this.hitGraceT > 0) return
    this.spinT = SPIN_TIME * this.stats.spin
    this.driftDir = 0
    this.driftCharge = 0
    this.boostT = 0
    this.boosterT = 0
  }

  /** Returns events that happened this step (for sfx / race logic) */
  step(
    dt: number,
    input: InputState,
    canDrive: boolean,
    gaugeEnabled: boolean,
  ): {
    lapCrossed: boolean
    driftReleased: DriftTier
    driftStarted: boolean
    gaugeFilled: boolean
    wallBumped: boolean
    fell: boolean
    landed: boolean
  } {
    // 재사용 이벤트 객체 (호출 직후 소비됨 — GC 압력 감소)
    const ev = STEP_EV
    ev.lapCrossed = false
    ev.driftReleased = 0
    ev.driftStarted = false
    ev.gaugeFilled = false
    ev.wallBumped = false
    ev.fell = false
    ev.landed = false

    if (this.wallHit > 0) this.wallHit -= dt
    if (this.hitGraceT > 0) this.hitGraceT -= dt
    if (this.spinT > 0) {
      this.spinT -= dt
      this.speed *= Math.exp(-3.2 * dt)
      if (this.spinT <= 0) this.hitGraceT = this.stats.grace // 회복 직후 잠깐 무적
    }

    const spinning = this.spinT > 0
    const throttle = canDrive && !spinning ? input.throttle : 0
    const steer = canDrive && !spinning ? input.steer : 0
    const driftBtn = canDrive && !spinning && input.drift

    // surface — 지름길(보조 도로) 위에서는 오프로드가 아니다
    const lat = this.track.lateral(this.pos, this.trackIdx)
    const onAux = this.track.auxRoadFn?.(this.pos) ?? false
    this.offroad = !onAux && Math.abs(lat) > this.track.halfWidth + 0.6

    const boosting = this.boostT > 0 || this.boosterT > 0
    if (this.boostT > 0) this.boostT -= dt
    if (this.boosterT > 0) this.boosterT -= dt

    const course = this.track.course
    let maxFwd =
      (this.boosterT > 0 ? BOOSTER_SPEED : this.boostT > 0 ? BOOST_SPEED : MAX_SPEED) *
      this.stats.speed
    if (this.offroad && !boosting) maxFwd = course.offroadMax

    // longitudinal
    const accel = ACCEL * this.stats.accel
    if (boosting) {
      this.speed += (maxFwd - this.speed) * Math.min(1, 4 * dt)
    } else if (throttle > 0) {
      const sat = Math.max(0, 1 - this.speed / maxFwd)
      this.speed += accel * sat * throttle * dt
      if (this.speed > maxFwd) this.speed += (maxFwd - this.speed) * Math.min(1, 3 * dt)
    } else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= BRAKE * dt
      else this.speed = Math.max(-REVERSE_MAX, this.speed + accel * 0.6 * throttle * dt)
    } else {
      this.speed *= Math.exp(-COAST_DRAG * dt)
    }
    if (this.offroad && !boosting && this.y < 0.2) this.speed *= Math.exp(-course.offroadDrag * dt)

    // drift state machine (no drifting mid-air, none while cannon-launched)
    if (this.launched) {
      // ballistic flight: ignore steering/drift, move by fixed launch velocity
    } else if (this.driftDir === 0) {
      if (!this.airborne && driftBtn && Math.abs(steer) > 0.3 && this.speed > DRIFT_MIN_SPEED) {
        this.driftDir = steer > 0 ? 1 : -1
        this.driftCharge = 0
        this.hop = 1
        ev.driftStarted = true
      }
    } else {
      const tooSlow = this.speed < DRIFT_MIN_SPEED * 0.7
      if (!driftBtn || tooSlow) {
        ev.driftReleased = this.driftTier
        // small release kick (순간부스트). The real reward is the gauge.
        if (this.driftTier === 1) this.applyBoost(0.45 * this.stats.boost)
        else if (this.driftTier === 2) this.applyBoost(0.85 * this.stats.boost)
        this.driftDir = 0
        this.driftCharge = 0
      } else {
        this.driftCharge += dt * (1 + 0.5 * Math.abs(steer))
        if (gaugeEnabled && this.boostGauge < 1) {
          const before = this.boostGauge
          this.boostGauge = Math.min(
            1,
            this.boostGauge + GAUGE_RATE * this.stats.gauge * dt * (1 + 0.4 * Math.abs(steer)),
          )
          if (before < 1 && this.boostGauge >= 1) ev.gaugeFilled = true
        }
      }
    }
    this.hop = Math.max(0, this.hop - dt * 4)

    // steering
    const fwd = this.speed >= 0 ? 1 : -1
    let turn: number
    if (this.driftDir !== 0) {
      // counter-steer shapes the drift: push into it to tighten, away to widen.
      // Eased entry — the kart leans into the slide instead of snapping.
      const ease = Math.min(1, 0.35 + this.driftCharge * 2.6)
      const steerBlend = this.driftDir * 0.45 + steer * 0.55
      turn = steerBlend * TURN_RATE * 1.2 * ease
    } else {
      const speedFactor =
        Math.min(1, Math.abs(this.speed) / 7) *
        (1 - 0.4 * Math.min(1, Math.abs(this.speed) / MAX_SPEED))
      turn = steer * TURN_RATE * speedFactor
    }
    if (spinning) turn = 0
    if (this.airborne) turn *= 0.35 // limited mid-air control
    this.heading += turn * fwd * dt

    // velocity direction chases heading (low grip while drifting => slide)
    const grip = this.driftDir !== 0
      ? (this.ice ? GRIP_DRIFT_ICE : GRIP_DRIFT) * this.stats.drift
      : (this.ice ? GRIP_ICE : GRIP_NORMAL) * this.stats.handling
    let dAng = this.heading - this.velDir
    while (dAng > Math.PI) dAng -= Math.PI * 2
    while (dAng < -Math.PI) dAng += Math.PI * 2
    const maxChase = grip * dt
    this.velDir += THREE.MathUtils.clamp(dAng, -maxChase, maxChase)

    // integrate — cannon flight uses its fixed launch velocity
    if (this.launched) {
      this.pos.x += this.launchVX * dt
      this.pos.z += this.launchVZ * dt
    } else {
      this.pos.x += Math.sin(this.velDir) * this.speed * dt
      this.pos.z += Math.cos(this.velDir) * this.speed * dt
    }

    // vertical: jumps, and falling into pits (cliffs / water)
    this.trackIdx = this.track.nearestIndex(this.pos, this.trackIdx)
    const lat2 = this.track.lateral(this.pos, this.trackIdx)
    // pos.y = 발밑 도로 표면 높이 (고저차/뱅크 코스). kart.y는 그 위 상대 높이
    this.pos.y = this.track.groundY(this.trackIdx, lat2)
    const onAux2 = this.track.auxRoadFn?.(this.pos) ?? false
    const overPit = this.track.isPit(this.trackIdx, lat2) && !onAux2
    if (!this.airborne && overPit && this.y <= 0.01) {
      this.airborne = true // drove off an edge — start falling
      this.vy = Math.min(this.vy, 0)
    }
    if (this.airborne) {
      this.vy -= 26 * dt
      this.y += this.vy * dt
      if (this.y <= 0) {
        if (this.launched) {
          // cannon touchdown — land on the road, keep a punchy exit speed
          this.y = 0
          this.vy = 0
          this.airborne = false
          this.launched = false
          this.speed = Math.min(this.speed, BOOST_SPEED)
          this.applyBoost(0.4)
          ev.landed = true
        } else if (!overPit) {
          this.y = 0
          this.vy = 0
          this.airborne = false
          ev.landed = true
        } else if (this.y < -7) {
          ev.fell = true // splash / into the void — call the rescuer
        }
      }
    }

    // guardrail walls (KartRider tracks are walled) — no wall along pit edges,
    // and open water maps have no wall at all (the sea IS the boundary)
    const wallD = this.track.wallDist
    const openWater = course.open && course.ocean
    if (Math.abs(lat2) > wallD && !overPit && !openWater && !onAux2) {
      const s = this.track.sampleAt(this.trackIdx)
      const side = Math.sign(lat2)
      // clamp back inside
      const over = Math.abs(lat2) - wallD
      this.pos.x -= s.nor.x * side * over
      this.pos.z -= s.nor.z * side * over
      // reflect the lateral velocity component, lose speed by impact angle
      const vx = Math.sin(this.velDir) * this.speed
      const vz = Math.cos(this.velDir) * this.speed
      const vn = vx * s.nor.x + vz * s.nor.z // toward-wall component
      if (vn * side > 0) {
        const bounce = 0.35
        const nvx = vx - (1 + bounce) * vn * s.nor.x
        const nvz = vz - (1 + bounce) * vn * s.nor.z
        const newSpeed = Math.hypot(nvx, nvz)
        const impact = Math.abs(vn) / Math.max(1, Math.abs(this.speed))
        this.velDir = Math.atan2(nvx, nvz)
        this.speed = newSpeed * (1 - 0.45 * impact)
        if (impact > 0.25 && this.wallHit <= 0) {
          this.wallHit = 0.5
          ev.wallBumped = true
        }
        // hard hits kill the drift
        if (impact > 0.5) {
          this.driftDir = 0
          this.driftCharge = 0
        }
      }
    }

    // checkpoint / lap logic
    const cp = this.track.checkpointOf(this.trackIdx)
    if (cp === this.nextCp % NUM_CHECKPOINTS) {
      // only accept forward motion through checkpoints
      this.nextCp++
      this.cpTotal++
      if (this.cpTotal > 1 && (this.cpTotal - 1) % NUM_CHECKPOINTS === 0) {
        // crossed the start line again
        this.lap++
        ev.lapCrossed = true
      } else if (this.cpTotal === 1) {
        ev.lapCrossed = true // initial line cross right after GO (starts lap 1)
      }
    } else if (cp === (this.nextCp - 2 + NUM_CHECKPOINTS) % NUM_CHECKPOINTS && this.cpTotal > 0) {
      // moved backwards across previous checkpoint — undo
      this.nextCp--
      this.cpTotal--
    }

    // wrong-way detection
    const s = this.track.sampleAt(this.trackIdx)
    const movDot = Math.sin(this.velDir) * s.tan.x + Math.cos(this.velDir) * s.tan.z
    if (this.speed > 4 && movDot < -0.3 && !onAux2) this.wrongWayT += dt
    else this.wrongWayT = 0

    // progress metric (for rank): completed checkpoints + fraction within sector
    const frac = ((this.trackIdx / this.track.N) * NUM_CHECKPOINTS) % 1
    this.progress = this.cpTotal + Math.max(0, Math.min(0.999, frac))

    return ev
  }
}

// circle collision between two karts; only `a` (local) is corrected.
// bMass: 상대 질량 (모르면 1). 무거운 카트는 덜 밀리고 덜 감속한다 (weight 스탯).
export function resolveKartCollision(a: Kart, bPos: THREE.Vector3, bMass = 1) {
  const dx = a.pos.x - bPos.x
  const dz = a.pos.z - bPos.z
  const d2 = dx * dx + dz * dz
  const minD = 2.0
  if (d2 > minD * minD || d2 < 1e-6) return false
  const d = Math.sqrt(d2)
  const share = bMass / (a.stats.mass + bMass) // 상대가 무거울수록 내가 더 밀림
  const push = (minD - d) * 1.2 * share
  a.pos.x += (dx / d) * push
  a.pos.z += (dz / d) * push
  a.speed *= 1 - 0.16 * share * 2
  return true
}
