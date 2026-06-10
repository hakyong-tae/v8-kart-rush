import * as THREE from 'three'
import { Track, NUM_CHECKPOINTS } from './track'
import type { InputState } from './input'

// Arcade kart tuning
const MAX_SPEED = 27
const BOOST_SPEED = 38
const GRASS_SPEED = 9.5
const ACCEL = 22
const BRAKE = 34
const REVERSE_MAX = 9
const COAST_DRAG = 1.1
const GRASS_DRAG = 2.6
const TURN_RATE = 2.35
const GRIP_NORMAL = 8.0
const GRIP_DRIFT = 2.2
const DRIFT_MIN_SPEED = 13
const MT_TIER1 = 0.85 // seconds of drift for blue spark boost
const MT_TIER2 = 1.7 // orange spark boost
const SPIN_TIME = 1.1

export type DriftTier = 0 | 1 | 2

export class Kart {
  pos = new THREE.Vector3()
  heading = 0 // facing angle (rad), atan2(x, z)
  velDir = 0 // direction of travel; lags heading while drifting
  speed = 0
  vertVel = 0
  hop = 0 // visual hop height

  trackIdx = 0
  lap = 0 // completed laps
  nextCp = 0 // next checkpoint index expected
  cpTotal = 0 // total checkpoints passed (monotonic progress)
  finished = false

  boostT = 0
  spinT = 0
  driftDir: 0 | 1 | -1 = 0
  driftCharge = 0
  offroad = false
  wrongWayT = 0

  // race progress metric for ranking: laps + fraction
  progress = 0

  constructor(public track: Track, slot = 0) {
    this.respawnAtSlot(slot)
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
    this.pos.set(s.pos.x, 0, s.pos.z)
    this.heading = Math.atan2(s.tan.x, s.tan.z)
    this.velDir = this.heading
    this.speed = 0
    this.trackIdx = idx
    this.boostT = 0
    this.spinT = 0
    this.driftDir = 0
    this.driftCharge = 0
  }

  applyBoost(sec: number) {
    this.boostT = Math.max(this.boostT, sec)
  }

  applySpin() {
    if (this.spinT > 0) return
    this.spinT = SPIN_TIME
    this.driftDir = 0
    this.driftCharge = 0
    this.boostT = 0
  }

  /** Returns events that happened this step (for sfx / race logic) */
  step(dt: number, input: InputState, canDrive: boolean): { lapCrossed: boolean; driftReleased: DriftTier; driftStarted: boolean } {
    const ev = { lapCrossed: false, driftReleased: 0 as DriftTier, driftStarted: false }

    if (this.spinT > 0) {
      this.spinT -= dt
      this.speed *= Math.exp(-3.2 * dt)
    }

    const spinning = this.spinT > 0
    const throttle = canDrive && !spinning ? input.throttle : 0
    const steer = canDrive && !spinning ? input.steer : 0
    const driftBtn = canDrive && !spinning && input.drift

    // surface
    const lat = this.track.lateral(this.pos, this.trackIdx)
    this.offroad = Math.abs(lat) > this.track.halfWidth + 0.6

    const boosting = this.boostT > 0
    if (boosting) this.boostT -= dt

    let maxFwd = boosting ? BOOST_SPEED : MAX_SPEED
    if (this.offroad && !boosting) maxFwd = GRASS_SPEED

    // longitudinal
    if (boosting) {
      this.speed += (maxFwd - this.speed) * Math.min(1, 4 * dt)
    } else if (throttle > 0) {
      const sat = Math.max(0, 1 - this.speed / maxFwd)
      this.speed += ACCEL * sat * throttle * dt
      if (this.speed > maxFwd) this.speed += (maxFwd - this.speed) * Math.min(1, 3 * dt)
    } else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= BRAKE * dt
      else this.speed = Math.max(-REVERSE_MAX, this.speed + ACCEL * 0.6 * throttle * dt)
    } else {
      this.speed *= Math.exp(-COAST_DRAG * dt)
    }
    if (this.offroad && !boosting) this.speed *= Math.exp(-GRASS_DRAG * dt)

    // drift state machine
    if (this.driftDir === 0) {
      if (driftBtn && Math.abs(steer) > 0.3 && this.speed > DRIFT_MIN_SPEED) {
        this.driftDir = steer > 0 ? 1 : -1
        this.driftCharge = 0
        this.hop = 1
        ev.driftStarted = true
      }
    } else {
      const tooSlow = this.speed < DRIFT_MIN_SPEED * 0.7
      if (!driftBtn || tooSlow) {
        ev.driftReleased = this.driftTier
        if (this.driftTier === 1) this.applyBoost(0.9)
        else if (this.driftTier === 2) this.applyBoost(1.6)
        this.driftDir = 0
        this.driftCharge = 0
      } else {
        this.driftCharge += dt * (1 + 0.5 * Math.abs(steer))
      }
    }
    this.hop = Math.max(0, this.hop - dt * 4)

    // steering
    const fwd = this.speed >= 0 ? 1 : -1
    let turn: number
    if (this.driftDir !== 0) {
      const steerBlend = this.driftDir * 0.6 + steer * 0.5
      turn = steerBlend * TURN_RATE * 1.3
    } else {
      const speedFactor =
        Math.min(1, Math.abs(this.speed) / 7) *
        (1 - 0.4 * Math.min(1, Math.abs(this.speed) / MAX_SPEED))
      turn = steer * TURN_RATE * speedFactor
    }
    if (spinning) turn = 0
    this.heading += turn * fwd * dt

    // velocity direction chases heading (low grip while drifting => slide)
    const grip = this.driftDir !== 0 ? GRIP_DRIFT : GRIP_NORMAL
    let dAng = this.heading - this.velDir
    while (dAng > Math.PI) dAng -= Math.PI * 2
    while (dAng < -Math.PI) dAng += Math.PI * 2
    const maxChase = grip * dt
    this.velDir += THREE.MathUtils.clamp(dAng, -maxChase, maxChase)

    // integrate
    this.pos.x += Math.sin(this.velDir) * this.speed * dt
    this.pos.z += Math.cos(this.velDir) * this.speed * dt

    // world bounds: soft wall far off-track
    const prevIdx = this.trackIdx
    this.trackIdx = this.track.nearestIndex(this.pos, this.trackIdx)
    const lat2 = this.track.lateral(this.pos, this.trackIdx)
    const bound = this.track.halfWidth + 26
    if (Math.abs(lat2) > bound) {
      const s = this.track.sampleAt(this.trackIdx)
      const over = Math.abs(lat2) - bound
      this.pos.x -= s.nor.x * Math.sign(lat2) * over
      this.pos.z -= s.nor.z * Math.sign(lat2) * over
      this.speed *= 0.6
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
    if (this.speed > 4 && movDot < -0.3) this.wrongWayT += dt
    else this.wrongWayT = 0

    // progress metric (for rank): completed checkpoints + fraction within sector
    const frac = ((this.trackIdx / this.track.N) * NUM_CHECKPOINTS) % 1
    this.progress = this.cpTotal + Math.max(0, Math.min(0.999, frac))

    return ev
  }
}

// circle collision between two karts; only `a` (local) is corrected
export function resolveKartCollision(a: Kart, bPos: THREE.Vector3) {
  const dx = a.pos.x - bPos.x
  const dz = a.pos.z - bPos.z
  const d2 = dx * dx + dz * dz
  const minD = 2.0
  if (d2 > minD * minD || d2 < 1e-6) return false
  const d = Math.sqrt(d2)
  const push = (minD - d) * 0.6
  a.pos.x += (dx / d) * push
  a.pos.z += (dz / d) * push
  a.speed *= 0.92
  return true
}
