// Gimmick system — courses declare gimmicks as data, GimmickManager runs them.
// All moving parts are PURE FUNCTIONS of race time → every client / ghost / AI
// sees the same state with zero network sync.
import * as THREE from 'three'
import { NUM_CHECKPOINTS, type Track } from './track'
import type { Kart } from './kart'
import { preset } from './perf'

export type GimmickDef =
  | { type: 'mud'; t0: number; t1: number; side?: 1 | -1 | 0 } // 감속 노면
  | { type: 'conveyor'; t0: number; t1: number; dir: 1 | -1; push: number } // 급류/벨트
  | { type: 'tide'; period: number; range: number } // 밀물/썰물 (open 맵 전용)
  | { type: 'bumper'; t: number; lane: number } // 핀볼 범퍼 (lane: halfWidth 비율 -1..1)
  | { type: 'crates'; t: number; lane: number; count: number } // 부서지는 상자
  | { type: 'turntable'; t: number; lane: number; radius: number; spin: number } // 회전 바닥 (rad/s)
  | { type: 'spinbar'; t: number; period: number } // 회전 바 (period: 1회전 초)
  | { type: 'teleport'; t: number; exitT: number } // 게이트 (같은 체크포인트 구간 내만!)
  | { type: 'rockfall'; t: number; lane: number; period: number; warnSec: number } // 낙석

/** 스플라인 t(0..1) 범위 판정 — 랩 경계(1→0) 래핑 지원 */
export function inSplineRange(tFrac: number, t0: number, t1: number): boolean {
  if (t0 <= t1) return tFrac >= t0 && tFrac <= t1
  return tFrac >= t0 || tFrac <= t1
}

/** 주기 위상 0..1 — 음수 시간(카운트다운 중)에도 안전 */
export function cyclePhase(raceSec: number, period: number): number {
  return (((raceSec % period) + period) % period) / period
}

/** 회전 바 각도(rad) */
export function spinbarAngle(raceSec: number, period: number): number {
  return cyclePhase(raceSec, period) * Math.PI * 2
}

/** 가라앉는 다리 높이: phase<duty 동안 0(견고), 0.08 동안 침하 → -6, 0.92부터 복귀 */
export function bridgeY(phase: number, duty: number): number {
  const SINK = 0.08
  if (phase < duty) return 0
  if (phase < duty + SINK) return -6 * ((phase - duty) / SINK)
  if (phase < 0.92) return -6
  return -6 * (1 - (phase - 0.92) / 0.08)
}

/** 다리를 밟고 달릴 수 있는가 (살짝 가라앉는 중까지는 OK) */
export function bridgeSolid(phase: number, duty: number): boolean {
  return bridgeY(phase, duty) > -1.2
}

/** 프레스 플레이트 높이: 대부분 3.2(위), phase 0.8~0.86 급강하 → 0.5, 0.94부터 복귀 */
export function pressY(phase: number): number {
  if (phase < 0.8) return 3.2
  if (phase < 0.86) return 3.2 - 2.7 * ((phase - 0.8) / 0.06)
  if (phase < 0.94) return 0.5
  return 0.5 + 2.7 * ((phase - 0.94) / 0.06)
}

// ---- runtime ----
interface BumperRT { def: Extract<GimmickDef, { type: 'bumper' }>; mesh: THREE.Mesh; center: THREE.Vector3 }
interface CrateRT { pos: THREE.Vector3; brokenUntil: number; shownBroken: boolean }
interface CratesRT { def: Extract<GimmickDef, { type: 'crates' }>; mesh: THREE.InstancedMesh; crates: CrateRT[] }
interface TurntableRT { def: Extract<GimmickDef, { type: 'turntable' }>; mesh: THREE.Mesh; center: THREE.Vector3 }
interface SpinbarRT { def: Extract<GimmickDef, { type: 'spinbar' }>; pivot: THREE.Group; center: THREE.Vector3; halfLen: number }
interface TeleportRT { def: Extract<GimmickDef, { type: 'teleport' }>; gateIn: THREE.Mesh; gateOut: THREE.Mesh }
interface RockfallRT { def: Extract<GimmickDef, { type: 'rockfall' }>; rock: THREE.Mesh; shadow: THREE.Mesh; impact: THREE.Vector3 }
interface TideRT { def: Extract<GimmickDef, { type: 'tide' }> }

export interface GimmickHit {
  spun: boolean // 스핀 당함 (회전바/낙석)
  bounced: boolean // 범퍼에 튕김
  teleported: boolean
  smashedCrate: THREE.Vector3 | null // 상자 파괴 위치 (파티클용)
}

const ROCK_DROP = 0.4 // 낙하 연출 구간(주기 끝 0.4초)
const dummy = new THREE.Object3D()

export class GimmickManager {
  group = new THREE.Group()
  private mud: Extract<GimmickDef, { type: 'mud' }>[] = []
  private conveyor: Extract<GimmickDef, { type: 'conveyor' }>[] = []
  private bumpers: BumperRT[] = []
  private crates: CratesRT[] = []
  private turntables: TurntableRT[] = []
  private spinbars: SpinbarRT[] = []
  private teleports: TeleportRT[] = []
  private rockfalls: RockfallRT[] = []
  private tide: TideRT | null = null
  private cooldown = new Map<string, number>() // `${actor}:${i}` → raceSec until

  constructor(
    private track: Track,
    private ocean?: THREE.Mesh,
  ) {
    const defs = track.course.gimmicks ?? []
    const hw = track.halfWidth
    defs.forEach((def) => {
      switch (def.type) {
        case 'mud': {
          this.mud.push(def)
          const mat = new THREE.MeshLambertMaterial({ color: 0x6b4a26, transparent: true, opacity: 0.85 })
          const i0 = Math.floor(def.t0 * track.N)
          const i1 = Math.floor(def.t1 * track.N)
          const positions: number[] = []
          const indices: number[] = []
          for (let k = i0; k <= i1; k++) {
            const s = track.sampleAt(k)
            const w = hw * 0.92
            positions.push(s.pos.x - s.nor.x * w, 0.035, s.pos.z - s.nor.z * w)
            positions.push(s.pos.x + s.nor.x * w, 0.035, s.pos.z + s.nor.z * w)
            if (k < i1) {
              const a = (k - i0) * 2
              indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
            }
          }
          const geo = new THREE.BufferGeometry()
          geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
          geo.setIndex(indices)
          geo.computeVertexNormals()
          this.group.add(new THREE.Mesh(geo, mat))
          break
        }
        case 'conveyor':
          this.conveyor.push(def)
          break // 시각 데칼 생략 — 물살은 코스 테마가 표현
        case 'tide':
          this.tide = { def }
          break
        case 'bumper': {
          const center = track.worldAt(def.t, def.lane * hw)
          const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(1.1, 1.3, 0.9, 12),
            new THREE.MeshLambertMaterial({ color: 0xe04438 }),
          )
          mesh.position.set(center.x, 0.45, center.z)
          this.group.add(mesh)
          this.bumpers.push({ def, mesh, center })
          break
        }
        case 'crates': {
          const mesh = new THREE.InstancedMesh(
            new THREE.BoxGeometry(1.1, 1.1, 1.1),
            new THREE.MeshLambertMaterial({ color: 0xc08a40 }),
            def.count,
          )
          const crates: CrateRT[] = []
          for (let k = 0; k < def.count; k++) {
            const p = this.track.worldAt(def.t + k * 0.004, def.lane * hw)
            crates.push({ pos: p, brokenUntil: -1, shownBroken: false })
            dummy.position.set(p.x, 0.55, p.z)
            dummy.rotation.y = k * 0.6
            dummy.updateMatrix()
            mesh.setMatrixAt(k, dummy.matrix)
          }
          mesh.instanceMatrix.needsUpdate = true
          this.group.add(mesh)
          this.crates.push({ def, mesh, crates })
          break
        }
        case 'turntable': {
          const center = track.worldAt(def.t, def.lane * hw)
          const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(def.radius, def.radius, 0.1, 24),
            new THREE.MeshLambertMaterial({ color: 0x4a8dff }),
          )
          mesh.position.set(center.x, 0.05, center.z)
          this.group.add(mesh)
          this.turntables.push({ def, mesh, center })
          break
        }
        case 'spinbar': {
          const center = track.worldAt(def.t, 0)
          const halfLen = hw * 0.9
          const pivot = new THREE.Group()
          pivot.position.set(center.x, 0.55, center.z)
          const bar = new THREE.Mesh(
            new THREE.BoxGeometry(halfLen * 2, 0.5, 0.5),
            new THREE.MeshLambertMaterial({ color: 0xff9d2e }),
          )
          pivot.add(bar)
          const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.4, 1.2, 8),
            new THREE.MeshLambertMaterial({ color: 0x666a78 }),
          )
          post.position.set(center.x, 0.6, center.z)
          this.group.add(pivot, post)
          this.spinbars.push({ def, pivot, center, halfLen })
          break
        }
        case 'teleport': {
          // 게이트는 같은 체크포인트 구간 안에서만 이동해야 랩/역주행 로직이 안전하다
          const cpOf = (t: number) =>
            Math.floor((Math.floor(t * track.N) / track.N) * NUM_CHECKPOINTS) % NUM_CHECKPOINTS
          const cpIn = cpOf(def.t)
          const cpOut = cpOf(def.exitT)
          if (cpIn !== cpOut)
            throw new Error(`teleport gimmick crosses checkpoint sectors (${cpIn}→${cpOut})`)
          const mkGate = (t: number, color: number) => {
            const p = this.track.worldAt(t, 0)
            const g = new THREE.Mesh(
              new THREE.TorusGeometry(2.4, 0.3, 8, 24),
              new THREE.MeshBasicMaterial({ color }),
            )
            const s = this.track.sampleAt(Math.floor(t * this.track.N))
            g.position.set(p.x, 2.4, p.z)
            g.rotation.y = Math.atan2(s.tan.x, s.tan.z)
            this.group.add(g)
            return g
          }
          this.teleports.push({
            def,
            gateIn: mkGate(def.t, 0xb350e0),
            gateOut: mkGate(def.exitT, 0x35e6ff),
          })
          break
        }
        case 'rockfall': {
          const impact = this.track.worldAt(def.t, def.lane * hw)
          const rock = new THREE.Mesh(
            new THREE.IcosahedronGeometry(1.0, 0),
            new THREE.MeshLambertMaterial({ color: 0x8a7a60 }),
          )
          rock.visible = false
          const shadow = new THREE.Mesh(
            new THREE.CircleGeometry(1.4, 16),
            new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
          )
          shadow.rotation.x = -Math.PI / 2
          shadow.position.set(impact.x, 0.04, impact.z)
          shadow.visible = false
          this.group.add(rock, shadow)
          this.rockfalls.push({ def, rock, shadow, impact })
          break
        }
      }
    })
  }

  private isNear(p: THREE.Vector3, camPos: THREE.Vector3, cullDist: number): boolean {
    return (p.x - camPos.x) ** 2 + (p.z - camPos.z) ** 2 < cullDist * cullDist
  }

  /** 매 프레임 시각 갱신 — raceSec의 순수 함수. camPos에서 먼 것은 컬링. */
  updateVisuals(raceSec: number, camPos: THREE.Vector3) {
    const cull = preset().gimmickCullDist

    for (const sb of this.spinbars) {
      if (!this.isNear(sb.center, camPos, cull)) continue
      sb.pivot.rotation.y = spinbarAngle(raceSec, sb.def.period)
    }
    for (const tt of this.turntables) {
      if (!this.isNear(tt.center, camPos, cull)) continue
      tt.mesh.rotation.y = raceSec * tt.def.spin
    }
    for (const rf of this.rockfalls) {
      if (!this.isNear(rf.impact, camPos, cull)) { rf.rock.visible = false; rf.shadow.visible = false; continue }
      const phase = cyclePhase(raceSec, rf.def.period) * rf.def.period // 초 단위
      const tToImpact = rf.def.period - phase
      rf.shadow.visible = tToImpact <= rf.def.warnSec + ROCK_DROP && tToImpact > 0.05
      if (tToImpact <= ROCK_DROP) {
        rf.rock.visible = true
        const k = 1 - tToImpact / ROCK_DROP // 0→1 낙하 진행
        rf.rock.position.set(rf.impact.x, 18 * (1 - k * k), rf.impact.z)
      } else {
        rf.rock.visible = false
      }
    }
    for (const cg of this.crates) {
      let dirty = false
      for (let k = 0; k < cg.crates.length; k++) {
        const c = cg.crates[k]
        const broken = c.brokenUntil > raceSec
        if (broken === c.shownBroken) continue
        c.shownBroken = broken
        dummy.position.set(c.pos.x, broken ? -5 : 0.55, c.pos.z)
        dummy.rotation.y = k * 0.6
        dummy.updateMatrix()
        cg.mesh.setMatrixAt(k, dummy.matrix)
        dirty = true
      }
      if (dirty) cg.mesh.instanceMatrix.needsUpdate = true
    }
    if (this.tide && this.ocean) {
      const lvl = Math.sin((raceSec / this.tide.def.period) * Math.PI * 2) // -1..1
      this.ocean.position.y = -1.4 + lvl * this.tide.def.range * 0.4
      this.track.pitLatShift = -lvl * this.tide.def.range // 만조 = 모래 폭 감소
    }
  }

  /**
   * 물리 스텝마다 호출 — kart를 변형하고 발생 이벤트를 돌려준다.
   * actorKey는 쿨다운 키 ('me', AI id 등). 원격 카트에는 호출하지 않는다(피해자 권한).
   */
  applyToActor(actorKey: string, kart: Kart, raceSec: number, dt: number): GimmickHit {
    const hit: GimmickHit = { spun: false, bounced: false, teleported: false, smashedCrate: null }
    const tr = this.track
    const tFrac = kart.trackIdx / tr.N
    const lat = tr.lateral(kart.pos, kart.trackIdx)
    const onRoad = Math.abs(lat) < tr.halfWidth

    // E 머드: 노면 감속 (부스터 중에는 절반만)
    for (const m of this.mud) {
      if (!inSplineRange(tFrac, m.t0, m.t1) || !onRoad || kart.y > 0.2) continue
      if (m.side && Math.sign(lat) !== m.side) continue
      const boosting = kart.boostT > 0 || kart.boosterT > 0
      if (kart.speed > 11) kart.speed *= Math.exp(-(boosting ? 1.1 : 2.4) * dt)
    }

    // E 컨베이어/급류: 트랙 접선 방향으로 민다
    for (const c of this.conveyor) {
      if (!inSplineRange(tFrac, c.t0, c.t1) || !onRoad || kart.y > 0.2) continue
      const s = tr.sampleAt(kart.trackIdx)
      kart.pos.x += s.tan.x * c.dir * c.push * dt
      kart.pos.z += s.tan.z * c.dir * c.push * dt
    }

    // G 범퍼: 중심에서 바깥으로 튕겨냄
    for (const b of this.bumpers) {
      const dx = kart.pos.x - b.center.x
      const dz = kart.pos.z - b.center.z
      const d2 = dx * dx + dz * dz
      if (d2 > 2.3 * 2.3 || d2 < 1e-6 || kart.y > 0.8) continue
      const d = Math.sqrt(d2)
      // pos를 직접 밀어내도 다음 물리 스텝의 가드레일 클램프가 잡아준다 (호출 순서 의존)
      kart.pos.x += (dx / d) * (2.3 - d)
      kart.pos.z += (dz / d) * (2.3 - d)
      kart.velDir = Math.atan2(dx, dz)
      kart.speed = Math.max(13, kart.speed * 0.75)
      kart.driftDir = 0
      kart.driftCharge = 0
      hit.bounced = true
    }

    // G 상자: 부수면 살짝 감속, 6초 후 리스폰
    for (const cg of this.crates) {
      for (const c of cg.crates) {
        if (c.brokenUntil > raceSec) continue
        const dx = kart.pos.x - c.pos.x
        const dz = kart.pos.z - c.pos.z
        if (dx * dx + dz * dz > 1.4 * 1.4 || kart.y > 0.9) continue
        c.brokenUntil = raceSec + 6
        kart.speed *= 0.84
        hit.smashedCrate = c.pos
      }
    }

    // G 턴테이블: 위에 있으면 회전당함
    for (const tt of this.turntables) {
      const dx = kart.pos.x - tt.center.x
      const dz = kart.pos.z - tt.center.z
      if (dx * dx + dz * dz > tt.def.radius * tt.def.radius || kart.y > 0.3) continue
      kart.heading += tt.def.spin * dt
      kart.velDir += tt.def.spin * dt * 0.75
    }

    // A 회전 바: 바 선분과 거리 체크 → 스핀 (개인 쿨다운 2초)
    this.spinbars.forEach((sb, i) => {
      const key = `${actorKey}:sb${i}`
      if ((this.cooldown.get(key) ?? -1) > raceSec || kart.spinT > 0 || kart.y > 0.9) return
      const ang = spinbarAngle(raceSec, sb.def.period)
      const bx = Math.sin(ang + Math.PI / 2) // bar local +X의 월드 방향
      const bz = Math.cos(ang + Math.PI / 2)
      const dx = kart.pos.x - sb.center.x
      const dz = kart.pos.z - sb.center.z
      const along = dx * bx + dz * bz // 바 축 투영
      if (Math.abs(along) > sb.halfLen) return
      const px = sb.center.x + bx * along
      const pz = sb.center.z + bz * along
      const dist = Math.hypot(kart.pos.x - px, kart.pos.z - pz)
      if (dist < 1.0) {
        this.cooldown.set(key, raceSec + 2)
        kart.applySpin()
        hit.spun = true
      }
    })

    // D 텔레포트: 게이트 통과 → exitT로 (같은 체크포인트 구간 내 전제)
    this.teleports.forEach((tp, i) => {
      const key = `${actorKey}:tp${i}`
      if ((this.cooldown.get(key) ?? -1) > raceSec) return
      if (!inSplineRange(tFrac, tp.def.t, tp.def.t + 0.005) || Math.abs(lat) > tr.halfWidth * 0.6) return
      this.cooldown.set(key, raceSec + 3)
      const idx = Math.floor(tp.def.exitT * tr.N)
      const s = tr.sampleAt(idx)
      kart.pos.set(s.pos.x, 0, s.pos.z)
      kart.trackIdx = idx
      kart.heading = Math.atan2(s.tan.x, s.tan.z)
      kart.velDir = kart.heading
      kart.y = 0
      kart.vy = 0
      kart.airborne = false
      hit.teleported = true
    })

    // F 낙석: 임팩트 순간(0.25초 창) 반경 안이면 스핀
    this.rockfalls.forEach((rf, i) => {
      const key = `${actorKey}:rf${i}`
      if ((this.cooldown.get(key) ?? -1) > raceSec || kart.spinT > 0) return
      const phase = cyclePhase(raceSec, rf.def.period) * rf.def.period
      const tToImpact = rf.def.period - phase
      if (tToImpact > 0.25) return
      const dx = kart.pos.x - rf.impact.x
      const dz = kart.pos.z - rf.impact.z
      if (dx * dx + dz * dz < 1.8 * 1.8 && kart.y < 1.0) {
        this.cooldown.set(key, raceSec + 2)
        kart.applySpin()
        hit.spun = true
      }
    })

    return hit
  }
}
