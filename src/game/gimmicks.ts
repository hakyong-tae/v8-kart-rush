// Gimmick system — courses declare gimmicks as data, GimmickManager runs them.
// All moving parts are PURE FUNCTIONS of race time → every client / ghost / AI
// sees the same state with zero network sync.
import * as THREE from 'three'
import type { Track } from './track'
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

// ---- runtime ----
interface BumperRT { def: Extract<GimmickDef, { type: 'bumper' }>; mesh: THREE.Mesh; center: THREE.Vector3 }
interface CrateRT { pos: THREE.Vector3; brokenUntil: number }
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
  private cooldown = new Map<string, number>() // `${actor}:${i}` → raceSec until // used by applyToActor (next task)

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
            crates.push({ pos: p, brokenUntil: -1 })
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

  /** 매 프레임 시각 갱신 — raceSec의 순수 함수. camPos에서 먼 것은 컬링. */
  updateVisuals(raceSec: number, camPos: THREE.Vector3) {
    const cull = preset().gimmickCullDist
    const near = (p: THREE.Vector3) =>
      (p.x - camPos.x) ** 2 + (p.z - camPos.z) ** 2 < cull * cull

    for (const sb of this.spinbars) {
      if (!near(sb.center)) continue
      sb.pivot.rotation.y = spinbarAngle(raceSec, sb.def.period)
    }
    for (const tt of this.turntables) {
      if (!near(tt.center)) continue
      tt.mesh.rotation.y = raceSec * tt.def.spin
    }
    for (const rf of this.rockfalls) {
      if (!near(rf.impact)) { rf.rock.visible = false; rf.shadow.visible = false; continue }
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
      cg.crates.forEach((c, k) => {
        const broken = c.brokenUntil > raceSec
        dummy.position.set(c.pos.x, broken ? -5 : 0.55, c.pos.z)
        dummy.rotation.y = k * 0.6
        dummy.updateMatrix()
        cg.mesh.setMatrixAt(k, dummy.matrix)
      })
      cg.mesh.instanceMatrix.needsUpdate = true
    }
    if (this.tide && this.ocean) {
      const lvl = Math.sin((raceSec / this.tide.def.period) * Math.PI * 2) // -1..1
      this.ocean.position.y = -1.4 + lvl * this.tide.def.range * 0.4
      this.track.pitLatShift = -lvl * this.tide.def.range // 만조 = 모래 폭 감소
    }
  }
}
