# Plan 2: 볼케이노 런 + 기어 팩토리 (신규 코스 2종 + 기믹 4타입)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기믹 4타입(sinkroad/geyser/hammer/press)을 추가하고, 헤어핀 스위치백의 볼케이노 런과 직각·시케인의 기어 팩토리 코스를 출시한다.

**Architecture:** Plan 1의 GimmickManager 확장(타입 추가 = union + 생성자 case + updateVisuals + applyToActor). 무너지는 다리는 Track.dynamicPitFn 훅으로 기존 pit→구조대 흐름을 재사용. 코스 레이아웃은 사전 검증 완료(자기교차 없음: volcano minSep 24.4, factory 32.4; 모든 t값은 CatmullRom getPointAt 기준 산출).

**Tech Stack:** Three.js r165, TypeScript, vitest

**Spec:** `docs/superpowers/specs/2026-06-12-courses-gimmicks-design.md` · **선행:** Plan 1 완료 (cda4f69)

**전제:** `/Users/hytae/Downloads/v8-kart-rush`, `export PATH="$HOME/.nvm/versions/node/v23.11.0/bin:$PATH"`, 커밋은 main에 `-c user.name="hakyong-tae" -c user.email="hy.tae@kakao.com"`, 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## 파일 맵

| 파일 | 변경 |
|---|---|
| `src/game/gimmicks.ts` | 4타입 union 추가, 순수 헬퍼 2개(TDD), RT+메시+시각+효과, GimmickHit.launched, 텔레포트 가드 정확식 교체 |
| `src/game/gimmicks.test.ts` | bridgeY/pressY 테스트 |
| `src/game/track.ts` | `dynamicPitFn` 훅, sinkroad 구간 도로/커브/센터라인 스킵 |
| `src/game/Game.ts` | launched 효과음 1줄 |
| `src/game/courses/volcano.ts`, `factory.ts` (신규), `index.ts` | 코스 데이터 + 등록 |
| `src/game/assets.ts` | buildDecorations에 volcano/factory 풍경 브랜치 |

---

### Task 1: 순수 헬퍼 (TDD) + 텔레포트 가드 정확식

**Files:** Modify `src/game/gimmicks.ts`, `src/game/gimmicks.test.ts`

- [ ] **Step 1: 실패하는 테스트** — gimmicks.test.ts에 추가:

```ts
import { bridgeY, bridgeSolid, pressY } from './gimmicks' // 기존 import에 병합

describe('sinkroad bridge', () => {
  it('solid while phase < duty', () => {
    expect(bridgeY(0.0, 0.55)).toBe(0)
    expect(bridgeY(0.54, 0.55)).toBe(0)
    expect(bridgeSolid(0.3, 0.55)).toBe(true)
  })
  it('sunk mid-cycle, rises at end', () => {
    expect(bridgeY(0.8, 0.55)).toBe(-6)
    expect(bridgeSolid(0.8, 0.55)).toBe(false)
    expect(bridgeY(0.96, 0.55)).toBeGreaterThan(-6)
    expect(bridgeY(1.0 - 1e-9, 0.55)).toBeCloseTo(0, 1)
  })
})

describe('press', () => {
  it('up most of the cycle, slams in window', () => {
    expect(pressY(0.3)).toBe(3.2)
    expect(pressY(0.83)).toBeLessThan(3.2)
    expect(pressY(0.9)).toBe(0.5)
    expect(pressY(0.97)).toBeGreaterThan(0.5)
  })
})
```

- [ ] **Step 2:** `npx vitest run` → 신규 테스트 FAIL 확인
- [ ] **Step 3: 헬퍼 구현** — gimmicks.ts 헬퍼 섹션에 추가:

```ts
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
```

- [ ] **Step 4: 텔레포트 가드 정확식** (Plan 1 최종리뷰 이월) — 생성자 teleport case의 `Math.floor(def.t * NUM_CHECKPOINTS) % NUM_CHECKPOINTS` 두 줄을 런타임 checkpointOf와 동일식으로 교체:

```ts
          const cpOf = (t: number) =>
            Math.floor((Math.floor(t * track.N) / track.N) * NUM_CHECKPOINTS) % NUM_CHECKPOINTS
          const cpIn = cpOf(def.t)
          const cpOut = cpOf(def.exitT)
```

- [ ] **Step 5:** `npx vitest run` 전부 PASS, `npx tsc --noEmit` 0 → Commit `feat: bridge/press helpers (TDD) + exact teleport sector guard`

---

### Task 2: track.ts — 동적 pit 훅 + sinkroad 도로 절개

**Files:** Modify `src/game/track.ts`

- [ ] **Step 1:** Track 클래스에 필드 추가 (pitLatShift 옆):

```ts
  /** 동적 pit (가라앉은 다리 등) — GimmickManager가 설정. true면 폭 전체가 pit */
  dynamicPitFn: ((idx: number) => boolean) | null = null
```

- [ ] **Step 2:** `isPit()` 맨 앞에 추가:

```ts
    const i0 = ((idx % this.N) + this.N) % this.N
    if (this.dynamicPitFn?.(i0)) return true
```

(기존 본문의 `const i = ...` 정규화와 중복되면 변수 재사용으로 정리)

- [ ] **Step 3: 도로 절개** — `buildTrackMeshes()` 상단에서 sinkroad 구간 수집 후, 도로·양쪽 커브·센터라인 strip의 `skip` 파라미터로 전달 (makeStrip은 이미 skip을 지원):

```ts
  const sinkRanges = (course.gimmicks ?? [])
    .filter((g): g is Extract<NonNullable<CourseDef['gimmicks']>[number], { type: 'sinkroad' }> => g.type === 'sinkroad')
    .map((g) => [Math.floor(g.t0 * track.N), Math.floor(g.t1 * track.N)] as const)
  const inGap = (i: number) => sinkRanges.some(([a, b]) => i >= a && i <= b)
```

도로 strip 생성 호출에 `skip` 인자로 `sinkRanges.length ? inGap : undefined` 전달. 커브 좌/우와 센터라인도 동일하게 — 단 커브는 기존 skip이 없으므로 그대로 추가, 센터라인도 동일. (시작/피니시 체커, 부스트패드, 점프램프는 건드리지 않는다.)

- [ ] **Step 4:** `npx tsc --noEmit` 0, `npm run build` 성공, `npx vitest run` PASS → Commit `feat: dynamic pit hook + road gap over sinkroad`

---

### Task 3: GimmickManager — sinkroad/geyser/hammer/press 구현 + Game 효과음

**Files:** Modify `src/game/gimmicks.ts`, `src/game/Game.ts`

- [ ] **Step 1: union에 4타입 추가:**

```ts
  | { type: 'sinkroad'; t0: number; t1: number; period: number; duty: number; floor?: number } // 무너지는 다리 (floor: 아래 용암/물 색)
  | { type: 'geyser'; t: number; lane: number; period: number; warnSec: number } // 간헐천 — 분출 타면 점프
  | { type: 'hammer'; t: number; lane: number; period: number; variant?: 'hammer' | 'log' } // 진자
  | { type: 'press'; t: number; lane: number; period: number } // 프레스
```

`GimmickHit`에 `launched: boolean` 추가 (geyser에 발사됨 — 효과음용). applyToActor의 hit 초기화에도 추가.

- [ ] **Step 2: RT 인터페이스 + 필드:**

```ts
interface SinkroadRT { def: Extract<GimmickDef, { type: 'sinkroad' }>; mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; i0: number; i1: number }
interface GeyserRT { def: Extract<GimmickDef, { type: 'geyser' }>; column: THREE.Mesh; bubble: THREE.Mesh; center: THREE.Vector3 }
interface HammerRT { def: Extract<GimmickDef, { type: 'hammer' }>; pivot: THREE.Group; center: THREE.Vector3; tanAxis: THREE.Vector3; norDir: THREE.Vector3 }
interface PressRT { def: Extract<GimmickDef, { type: 'press' }>; plate: THREE.Mesh; center: THREE.Vector3 }
```

클래스 필드: `private sinkroads: SinkroadRT[] = []` 등 4개 + `private raceSecNow = 0`.

- [ ] **Step 3: 생성자 case 4개:**

```ts
        case 'sinkroad': {
          const i0 = Math.floor(def.t0 * track.N)
          const i1 = Math.floor(def.t1 * track.N)
          // 돌다리 strip (도로보다 살짝 어두운 현무암 판)
          const mat = new THREE.MeshLambertMaterial({ color: 0x6e6258 })
          const positions: number[] = []
          const indices: number[] = []
          for (let k = i0; k <= i1; k++) {
            const s = track.sampleAt(k)
            const w = hw + 1.0
            positions.push(s.pos.x - s.nor.x * w, 0, s.pos.z - s.nor.z * w)
            positions.push(s.pos.x + s.nor.x * w, 0, s.pos.z + s.nor.z * w)
            if (k < i1) {
              const a = (k - i0) * 2
              indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
            }
          }
          const geo = new THREE.BufferGeometry()
          geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
          geo.setIndex(indices)
          geo.computeVertexNormals()
          const mesh = new THREE.Mesh(geo, mat)
          this.group.add(mesh)
          // 아래 용암/물 바닥
          const mid = track.sampleAt(Math.floor((i0 + i1) / 2))
          const span = (i1 - i0) / track.N * track.totalLength + 30
          const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(span, span),
            new THREE.MeshBasicMaterial({ color: def.floor ?? 0xff5a26 }),
          )
          floor.rotation.x = -Math.PI / 2
          floor.position.set(mid.pos.x, -7.5, mid.pos.z)
          this.group.add(floor)
          this.sinkroads.push({ def, mesh, mat, i0, i1 })
          break
        }
        case 'geyser': {
          const center = track.worldAt(def.t, def.lane * hw)
          const column = new THREE.Mesh(
            new THREE.CylinderGeometry(1.0, 1.3, 7, 10, 1, true),
            new THREE.MeshLambertMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.65 }),
          )
          column.position.set(center.x, 0, center.z)
          column.scale.y = 0.001
          column.visible = false
          const bubble = new THREE.Mesh(
            new THREE.CircleGeometry(1.3, 14),
            new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.5 }),
          )
          bubble.rotation.x = -Math.PI / 2
          bubble.position.set(center.x, 0.045, center.z)
          bubble.visible = false
          this.group.add(column, bubble)
          this.geysers.push({ def, column, bubble, center })
          break
        }
        case 'hammer': {
          const idx = Math.floor(def.t * track.N)
          const s = track.sampleAt(idx)
          const center = track.worldAt(def.t, def.lane * hw)
          const isLog = def.variant === 'log'
          const pivot = new THREE.Group()
          pivot.position.set(center.x, 6, center.z)
          const arm = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 4.6, 6),
            new THREE.MeshLambertMaterial({ color: 0x8a8694 }),
          )
          arm.position.y = -2.3
          const head = new THREE.Mesh(
            isLog
              ? new THREE.CylinderGeometry(0.55, 0.55, 3.4, 8)
              : new THREE.SphereGeometry(1.1, 10, 8),
            new THREE.MeshLambertMaterial({ color: isLog ? 0x7a5230 : 0x5a5f6e }),
          )
          if (isLog) head.rotation.z = Math.PI / 2
          head.position.y = -4.6
          pivot.add(arm, head)
          this.group.add(pivot)
          this.hammers.push({
            def, pivot, center,
            tanAxis: new THREE.Vector3(s.tan.x, 0, s.tan.z).normalize(),
            norDir: new THREE.Vector3(s.nor.x, 0, s.nor.z).normalize(),
          })
          break
        }
        case 'press': {
          const center = track.worldAt(def.t, def.lane * hw)
          const frameMat = new THREE.MeshLambertMaterial({ color: 0x3c4250 })
          for (const sx of [-1.9, 1.9]) {
            const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.4, 0.6), frameMat)
            const idx2 = Math.floor(def.t * track.N)
            const s2 = track.sampleAt(idx2)
            pillar.position.set(center.x + s2.nor.x * sx, 2.2, center.z + s2.nor.z * sx)
            this.group.add(pillar)
          }
          const plate = new THREE.Mesh(
            new THREE.BoxGeometry(3.2, 0.7, 2.6),
            new THREE.MeshLambertMaterial({ color: 0xffc81e }),
          )
          const idx3 = Math.floor(def.t * track.N)
          const s3 = track.sampleAt(idx3)
          plate.position.set(center.x, 3.2, center.z)
          plate.rotation.y = Math.atan2(s3.tan.x, s3.tan.z)
          this.group.add(plate)
          this.presses.push({ def, plate, center })
          break
        }
```

- [ ] **Step 4: 생성자 끝에서 dynamicPitFn 등록** (sinkroad가 있을 때만):

```ts
    if (this.sinkroads.length) {
      track.dynamicPitFn = (idx: number) =>
        this.sinkroads.some(
          (sr) =>
            idx >= sr.i0 && idx <= sr.i1 &&
            !bridgeSolid(cyclePhase(this.raceSecNow, sr.def.period), sr.def.duty),
        )
    }
```

- [ ] **Step 5: updateVisuals 추가분** (`this.raceSecNow = raceSec`를 메서드 첫 줄에):

```ts
    for (const sr of this.sinkroads) {
      const phase = cyclePhase(raceSec, sr.def.period)
      sr.mesh.position.y = bridgeY(phase, sr.def.duty)
      // 침하 12% 전부터 빨갛게 경고
      const warn = phase > sr.def.duty - 0.12 && phase < sr.def.duty
      sr.mat.color.setHex(warn ? 0xc04a38 : 0x6e6258)
    }
    for (const gy of this.geysers) {
      if (!this.isNear(gy.center, camPos, cull)) { gy.column.visible = false; gy.bubble.visible = false; continue }
      const phase = cyclePhase(raceSec, gy.def.period) * gy.def.period
      const tToErupt = gy.def.period - phase
      gy.bubble.visible = tToErupt <= gy.def.warnSec + 0.45 && tToErupt > 0.45
      const erupting = tToErupt <= 0.45
      gy.column.visible = erupting
      if (erupting) {
        const k = 1 - tToErupt / 0.45
        gy.column.scale.y = Math.max(0.001, Math.sin(k * Math.PI))
        gy.column.position.y = 3.5 * gy.column.scale.y
      }
    }
    for (const hm of this.hammers) {
      if (!this.isNear(hm.center, camPos, cull)) continue
      const ang = Math.sin(cyclePhase(raceSec, hm.def.period) * Math.PI * 2) * 1.05
      hm.pivot.quaternion.setFromAxisAngle(hm.tanAxis, ang)
    }
    for (const pr of this.presses) {
      if (!this.isNear(pr.center, camPos, cull)) continue
      pr.plate.position.y = pressY(cyclePhase(raceSec, pr.def.period))
    }
```

- [ ] **Step 6: applyToActor 추가분** (`this.raceSecNow = raceSec`도 메서드 첫 줄에 — kart.step의 isPit이 최신 시간을 읽도록):

```ts
    // F 간헐천: 분출 중 위에 있으면 발사
    for (const gy of this.geysers) {
      if (kart.airborne) break
      const phase = cyclePhase(raceSec, gy.def.period) * gy.def.period
      if (gy.def.period - phase > 0.45) continue
      const dx = kart.pos.x - gy.center.x
      const dz = kart.pos.z - gy.center.z
      if (dx * dx + dz * dz < 1.6 * 1.6) {
        kart.applyJump(13)
        hit.launched = true
      }
    }

    // A 해머/통나무: 헤드 위치는 시간의 순수 함수 — 거리 체크 → 스핀
    this.hammers.forEach((hm, i) => {
      const key = `${actorKey}:hm${i}`
      if ((this.cooldown.get(key) ?? -1) > raceSec || kart.spinT > 0 || kart.y > 1.2) return
      const ang = Math.sin(cyclePhase(raceSec, hm.def.period) * Math.PI * 2) * 1.05
      const headY = 6 - 4.6 * Math.cos(ang)
      if (headY > 1.7) return // 스윙 끝단은 높아서 안 맞음
      const hx = hm.center.x + hm.norDir.x * Math.sin(ang) * 4.6
      const hz = hm.center.z + hm.norDir.z * Math.sin(ang) * 4.6
      const dx = kart.pos.x - hx
      const dz = kart.pos.z - hz
      if (dx * dx + dz * dz < 1.6 * 1.6) {
        this.cooldown.set(key, raceSec + 2)
        kart.applySpin()
        hit.spun = true
      }
    })

    // A 프레스: 플레이트가 내려와 있을 때 아래 있으면 스핀
    this.presses.forEach((pr, i) => {
      const key = `${actorKey}:pr${i}`
      if ((this.cooldown.get(key) ?? -1) > raceSec || kart.spinT > 0 || kart.y > 0.9) return
      if (pressY(cyclePhase(raceSec, pr.def.period)) > 1.0) return
      const dx = kart.pos.x - pr.center.x
      const dz = kart.pos.z - pr.center.z
      if (dx * dx + dz * dz < 1.7 * 1.7) {
        this.cooldown.set(key, raceSec + 2)
        kart.applySpin()
        hit.spun = true
      }
    })
```

- [ ] **Step 7: Game.ts 한 줄** — 기존 'me' 효과 훅 블록에 `if (gh.launched) audio.driftTick(1)` 추가.
- [ ] **Step 8:** `npx vitest run` PASS, `npx tsc --noEmit` 0, `npm run build` 성공 → Commit `feat: sinkroad/geyser/hammer/press gimmicks`

---

### Task 4: 볼케이노 런 코스

**Files:** Create `src/game/courses/volcano.ts`, Modify `src/game/courses/index.ts`, Modify `src/game/assets.ts`

- [ ] **Step 1: volcano.ts** (포인트·t값은 사전 검증 완료 — 그대로 사용):

```ts
// src/game/courses/volcano.ts — 화산 스위치백: 헤어핀 2개 + 무너지는 용암 다리
import type { CourseDef } from './types'

export const volcano: CourseDef = {
  id: 'volcano',
  name: 'Volcano Run',
  nameKo: '볼케이노 런',
  difficulty: 2,
  laps: 3,
  width: 12,
  shoulder: 2.6,
  surface: 'road',
  offroadMax: 10,
  offroadDrag: 2.4,
  points: [
    [0, 0], [80, 6], [150, 20], [180, 70],      // 오프닝: 동쪽 → 북쪽 스윕
    [150, 120], [80, 140], [0, 130],            // 정상 플라토 (간헐천 지대)
    [-70, 145], [-140, 130], [-175, 90],        // 북서 코너
    [-185, 45], [-160, 25], [-110, 20],         // 레벨1: 동쪽으로
    [-85, 10], [-80, -10], [-105, -20],         // 헤어핀 A (180° 서쪽으로)
    [-160, -28], [-185, -45],                   // 레벨2: 서쪽
    [-195, -80], [-170, -95], [-135, -85],      // 헤어핀 B (180° 동쪽으로)
    [-90, -75], [-40, -80],                     // 레벨3: 동쪽으로
    [10, -95], [60, -110],                      // 용암 다리 구간
    [120, -120], [170, -95],                    // 하강 커브
    [185, -45], [150, -22], [90, -22], [30, -26], [-22, -16], // 복귀
  ],
  boostPads: [
    { t: 0.506, len: 0.014 }, // 헤어핀 A 탈출
    { t: 0.623, len: 0.014 }, // 헤어핀 B 탈출
    { t: 0.782, len: 0.016 }, // 하강 직선
  ],
  jumpPads: [{ t: 0.694, len: 0.012 }], // 다리 직전 — 점프로 갬블 가능
  pits: [],
  itemRows: [
    { t: 0.166, lanes: [-0.6, 0, 0.6] },
    { t: 0.46, lanes: [-0.6, 0, 0.6] },
    { t: 0.681, lanes: [-0.6, 0, 0.6] },
    { t: 0.912, lanes: [-0.6, 0, 0.6] },
  ],
  gimmicks: [
    { type: 'sinkroad', t0: 0.713, t1: 0.745, period: 9, duty: 0.55 },
    { type: 'geyser', t: 0.21, lane: -0.4, period: 6, warnSec: 1 },
    { type: 'geyser', t: 0.26, lane: 0.4, period: 7.5, warnSec: 1 },
    { type: 'hammer', t: 0.817, lane: -0.25, period: 3.4 },
    { type: 'hammer', t: 0.849, lane: 0.25, period: 4.2 },
  ],
  decorSeed: 83,
  theme: {
    sky: 0xff8a5c, fog: 0x9a5340, fogDensity: 0.0019,
    ground: 0x4a3a34, road: 0x575055, curbA: 0xff5a26, curbB: 0x2b2226,
    rail: 0x6b5a55, railAccent: 0xff5a26,
    line: 0xffd9b0, sun: 0xffb37a, sunIntensity: 1.1, ambient: 0.8,
  },
}
```

- [ ] **Step 2: index.ts 등록** — import + `COURSES` 배열 끝에 `volcano` 추가.
- [ ] **Step 3: 풍경 브랜치** — assets.ts `buildDecorations`에서 기존 코스 분기 패턴(캐니언 메사 등)을 따라 `volcano` 분기 추가: ① 어두운 현무암 콘 화산(ConeGeometry, 0x3a2c28, 꼭대기에 MeshBasicMaterial 0xff7a3a 작은 구체 글로우) 4~6개를 트랙 바깥 원거리에, ② 검은 바위(기존 rock 패턴 색만 0x4a3a34) 다수, ③ 용암 글로우 디스크(CircleGeometry r 2~4, MeshBasicMaterial 0xff5a26 opacity 0.5, y 0.02) 8~12개를 wallDist 밖에 산포. 전부 `rng(decorSeed)` 결정론 배치, 기존 scatter 헬퍼 재사용.
- [ ] **Step 4:** `npx tsc --noEmit` 0, `npm run build` 성공, `npx vitest run` PASS (sinkroad 가드/teleport 가드 throw 없음 확인 — COURSES 전체에 대해 `new GimmickManager(new Track(c))`를 도는 즉석 스모크는 프리뷰 검증 단계에서 수행).
- [ ] **Step 5:** Commit `feat: Volcano Run — hairpin switchbacks, lava bridge, geysers, hammers`

---

### Task 5: 기어 팩토리 코스

**Files:** Create `src/game/courses/factory.ts`, Modify `src/game/courses/index.ts`, Modify `src/game/assets.ts`

- [ ] **Step 1: factory.ts:**

```ts
// src/game/courses/factory.ts — 공장 내부: 직각 코너 + 시케인 + 컨베이어 + 프레스
import type { CourseDef } from './types'

export const factory: CourseDef = {
  id: 'factory',
  name: 'Gear Factory',
  nameKo: '기어 팩토리',
  difficulty: 2,
  laps: 3,
  width: 13,
  shoulder: 2.8,
  surface: 'road',
  offroadMax: 10,
  offroadDrag: 2.4,
  points: [
    [0, 0], [105, 0],                  // 스타트 직선 (순방향 컨베이어)
    [138, -18], [148, -60],            // 직각 SE
    [140, -105], [100, -125],          // 직각 S
    [45, -128],                        // 프레스 복도
    [-5, -110], [-25, -75],            // 시케인 ↑
    [-65, -60], [-105, -75],           // 시케인 ↓
    [-130, -110], [-170, -120],        // 남서 딥
    [-198, -85], [-195, -35],          // 직각 W
    [-170, 5], [-120, 18],             // 동쪽으로 (역방향 컨베이어)
    [-75, 8], [-45, 28],               // 슬라럼
    [-15, 12],                         // 클로즈
  ],
  boostPads: [
    { t: 0.597, len: 0.016 }, // 시케인 탈출
    { t: 0.977, len: 0.014 }, // 피니시 직전
  ],
  jumpPads: [],
  pits: [],
  itemRows: [
    { t: 0.2, lanes: [-0.6, 0, 0.6] },
    { t: 0.641, lanes: [-0.6, 0, 0.6] },
    { t: 0.94, lanes: [-0.6, 0, 0.6] },
  ],
  gimmicks: [
    { type: 'conveyor', t0: 0.011, t1: 0.101, dir: 1, push: 7 },
    { type: 'conveyor', t0: 0.852, t1: 0.9, dir: -1 as const, push: 5 },
    { type: 'press', t: 0.298, lane: -0.35, period: 2.6 },
    { type: 'press', t: 0.331, lane: 0.35, period: 3.4 },
    { type: 'press', t: 0.357, lane: 0, period: 3.0 },
    { type: 'crates', t: 0.458, lane: 0.5, count: 4 },
    { type: 'crates', t: 0.504, lane: -0.5, count: 3 },
  ],
  decorSeed: 91,
  theme: {
    sky: 0x39404f, fog: 0x4a5160, fogDensity: 0.0022,
    ground: 0x2f333d, road: 0x52555f, curbA: 0xffc81e, curbB: 0x26233a,
    rail: 0xb8bcc8, railAccent: 0xffc81e,
    line: 0xfff3b0, sun: 0xdfe6ff, sunIntensity: 0.9, ambient: 0.85,
  },
}
```

(주의: `dir: 1`이 리터럴 추론 안 되면 `as const` — 첫 conveyor에도 필요 시 적용.)

- [ ] **Step 2: index.ts 등록** — `factory`를 COURSES 끝에 추가 (volcano 다음).
- [ ] **Step 3: 풍경 브랜치** — assets.ts에 `factory` 분기: ① 컨테이너 스택(BoxGeometry 6×3×3, 팔레트 [0x4a6da0, 0xb0563a, 0x6a7a4a, 0x6e7480], 1~3단 적층) 8~12곳, ② 원통 탱크(CylinderGeometry r2 h6, 0x8a8f9a) 4~6개, ③ 원거리 굴뚝(CylinderGeometry r1.2 h18, 0x4a4f5a, 상단에 어두운 링) 3~4개. rng(decorSeed) 결정론.
- [ ] **Step 4:** `npx tsc --noEmit` 0, `npm run build` 성공 → Commit `feat: Gear Factory — right-angle corners, chicane, conveyors, presses`

---

### Task 6: 프리뷰 검증 + 푸시 (컨트롤러 직접 수행)

- [ ] 로직: Track+GimmickManager 직접 생성으로 sinkroad(solid→sunk→isPit true→rescue 흐름), geyser 발사(applyJump), hammer/press 스핀 타이밍, 7코스 전체 생성 스모크(가드 throw 없음)
- [ ] 비주얼: 볼케이노 헤어핀/다리/간헐천, 팩토리 직각 코너/프레스/컨베이어 스크린샷
- [ ] 코스 선택 화면에 7코스 노출 + 미니맵 확인
- [ ] `npm run build` + `git push`

## 비고

- 레이아웃 t값 산출 근거: CatmullRomCurve3(getPointAt, N=2000)로 사전 계산. 볼케이노 minSep 24.4 (필요 ≥ 2×(6+2.6)=17.2), 팩토리 32.4 (필요 ≥ 2×(6.5+2.8)=18.6).
- 점프대(0.694~0.706)→다리(0.713~0.745): 점프 착지가 다리 중간 — 다리가 가라앉는 타이밍이면 낙하. 의도된 갬블.
- Plan 3(정글)에서 sinkroad를 floor 색만 바꿔 출렁다리로 재사용 예정.
