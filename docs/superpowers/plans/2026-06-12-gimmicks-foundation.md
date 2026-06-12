# 기믹 시스템 기반 + 기존 5코스 기믹 구현 계획 (Plan 1/4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** courses.ts를 코스당 파일 1개로 분리하고, 결정론적 기믹 시스템(`gimmicks.ts`)과 품질 프리셋(`perf.ts`)을 구축한 뒤 기존 5코스에 기믹을 배치한다.

**Architecture:** 기믹은 `CourseDef.gimmicks` 데이터 배열로 선언되고, `GimmickManager`가 메시 생성·시각 갱신(레이스 시간의 순수 함수)·카트 효과 적용을 전담한다. 물리 효과는 기존 Kart 메서드(applySpin/applyBoost) 및 Game.ts의 padActors 패턴을 재사용한다.

**Tech Stack:** Three.js r165, TypeScript, Vite, vitest(신규 devDep — 순수 로직 테스트용)

**Spec:** `docs/superpowers/specs/2026-06-12-courses-gimmicks-design.md`

**이 계획의 범위 밖 (후속 계획):** 신규 코스 4종(Plan 2~4), 지름길 C 시스템(Plan 3 — 캐니언/아이스 지름길도 그때 추가), 수직 H 시스템(Plan 4), sinkroad/hammer/press/platform/cannon/geyser 타입(Plan 2~4에서 추가).

**전제:** 작업 디렉토리 `/Users/hytae/Downloads/v8-kart-rush`. Node는 `export PATH="$HOME/.nvm/versions/node/v23.11.0/bin:$PATH"` 후 사용. 커밋 author는 `-c user.name="hakyong-tae" -c user.email="hy.tae@kakao.com"`.

---

## 파일 맵

| 파일 | 역할 |
|---|---|
| Create `src/game/courses/types.ts` | CourseDef·CourseTheme 등 인터페이스 (+`gimmicks?` 필드) |
| Create `src/game/courses/{sunny,canyon,ice,beach,neon}.ts` | 코스 1개 = 파일 1개 (데이터만) |
| Create `src/game/courses/index.ts` | COURSES 조립 + getCourse |
| Delete `src/game/courses.ts` | 디렉토리 인덱스 해석으로 기존 `'./courses'` import 유지됨 |
| Create `src/game/gimmicks.ts` | GimmickDef 유니온 + 순수 헬퍼 + GimmickManager |
| Create `src/game/gimmicks.test.ts` | 순수 헬퍼 결정론 테스트 (vitest) |
| Create `src/game/perf.ts` | low/mid/high 품질 프리셋 |
| Modify `src/game/track.ts` | `pitLatShift` 필드(밀물), TrackMeshes에 `ocean` 반환 |
| Modify `src/game/Game.ts` | GimmickManager 연결(생성·갱신·효과·연출) |
| Modify `src/game/particles.ts` | MAX_PARTICLES에 품질 스케일 적용 |
| Modify `src/game/assets.ts` | buildDecorations 밀도에 품질 스케일 적용 |
| Modify `src/ui/SettingsScreen.tsx`, `src/i18n.ts` | 그래픽 품질 설정 UI + 키 |

---

### Task 1: courses.ts → courses/ 분리 (동작 변화 없음)

**Files:**
- Create: `src/game/courses/types.ts`, `src/game/courses/sunny.ts`, `src/game/courses/canyon.ts`, `src/game/courses/ice.ts`, `src/game/courses/beach.ts`, `src/game/courses/neon.ts`, `src/game/courses/index.ts`
- Delete: `src/game/courses.ts`

- [ ] **Step 1: types.ts 작성** — 기존 `courses.ts` 1~64행의 인터페이스(BoostPadDef, ItemBoxRowDef, JumpPadDef, PitDef, CourseTheme, CourseDef)를 그대로 옮기되, CourseDef에 한 줄 추가:

```ts
// src/game/courses/types.ts — 기존 인터페이스 전체 이동 + 아래 import/필드 추가
import type { GimmickDef } from '../gimmicks'

export interface CourseDef {
  // ... 기존 필드 전부 유지 ...
  gimmicks?: GimmickDef[] // 코스 기믹 (gimmicks.ts가 해석)
}
```

주의: `gimmicks.ts`는 Task 4에서 생성되므로, 이 시점에는 임시로 `export type GimmickDef = never`를 담은 빈 `src/game/gimmicks.ts`를 먼저 만들어 둔다:

```ts
// src/game/gimmicks.ts (임시 — Task 4에서 본 구현으로 교체)
export type GimmickDef = { type: 'placeholder' }
```

- [ ] **Step 2: 코스 5파일 작성** — 기존 COURSES 배열의 각 원소를 파일별로 이동. 형식(써니 예시 — 나머지 4개도 동일 패턴으로 기존 데이터 그대로):

```ts
// src/game/courses/sunny.ts
import type { CourseDef } from './types'

export const sunny: CourseDef = {
  id: 'sunny',
  // ... 기존 courses.ts의 sunny 객체 내용 그대로 ...
}
```

- [ ] **Step 3: index.ts 작성**

```ts
// src/game/courses/index.ts
export * from './types'
import type { CourseDef } from './types'
import { sunny } from './sunny'
import { canyon } from './canyon'
import { ice } from './ice'
import { beach } from './beach'
import { neon } from './neon'

export const COURSES: CourseDef[] = [sunny, canyon, ice, beach, neon]

export function getCourse(id: string): CourseDef {
  const c = COURSES.find((c) => c.id === id)
  if (!c) throw new Error(`unknown course: ${id}`)
  return c
}
```

- [ ] **Step 4: courses.ts 삭제 후 타입체크** — `rm src/game/courses.ts` 후:

Run: `npx tsc --noEmit`
Expected: 에러 0 (track.ts·Game.ts 등의 `from './courses'`가 디렉토리 인덱스로 해석됨)

- [ ] **Step 5: 빌드+프리뷰 스모크** — `npm run build` 성공 확인, 프리뷰에서 타이틀→코스 선택에 5코스가 그대로 보이는지 확인.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "refactor: split courses.ts into one file per course"`

---

### Task 2: vitest 도입

- [ ] **Step 1: 설치** — `npm install --save-dev vitest`

- [ ] **Step 2: package.json scripts에 추가** — `"test": "vitest run"`

- [ ] **Step 3: 스모크 테스트** — 임시 파일 없이 Task 4의 테스트가 첫 테스트가 되므로, 여기서는 `npx vitest run --passWithNoTests`가 0 exit인지만 확인.

- [ ] **Step 4: Commit** — `git add package.json package-lock.json && git commit -m "chore: add vitest"`

---

### Task 3: perf.ts 품질 프리셋 + 적용

**Files:**
- Create: `src/game/perf.ts`
- Modify: `src/game/Game.ts:258` (setPixelRatio), `src/game/particles.ts:29,49`, `src/game/assets.ts` buildDecorations 내 count 사용처, `src/ui/SettingsScreen.tsx`, `src/i18n.ts`

- [ ] **Step 1: perf.ts 작성**

```ts
// src/game/perf.ts — 품질 자동 감지 + 수동 오버라이드 (localStorage)
export type Quality = 'low' | 'mid' | 'high'

export interface QualityPreset {
  pixelRatio: number // devicePixelRatio 상한
  particleScale: number // MAX_PARTICLES 배율
  decorScale: number // 풍경 데코 밀도 배율
  gimmickCullDist: number // 이 거리 밖 기믹은 시각 갱신 생략
}

export const PRESETS: Record<Quality, QualityPreset> = {
  low: { pixelRatio: 1, particleScale: 0.5, decorScale: 0.5, gimmickCullDist: 90 },
  mid: { pixelRatio: 1.5, particleScale: 0.75, decorScale: 0.8, gimmickCullDist: 140 },
  high: { pixelRatio: 2, particleScale: 1, decorScale: 1, gimmickCullDist: 220 },
}

function detect(): Quality {
  // node/vitest에는 navigator가 없다 — 테스트 체인(gimmicks.test.ts→gimmicks.ts→perf.ts)에서 안전해야 함
  if (typeof navigator === 'undefined') return 'high'
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
  const cores = navigator.hardwareConcurrency ?? 4
  if (mobile && cores <= 4) return 'low'
  if (mobile || cores <= 4) return 'mid'
  return 'high'
}

let quality: Quality =
  (typeof localStorage !== 'undefined' &&
    (localStorage.getItem('v8kart_quality') as Quality | null)) ||
  detect()

export function getQuality(): Quality {
  return quality
}

export function setQuality(q: Quality) {
  quality = q
  localStorage.setItem('v8kart_quality', q)
}

export function preset(): QualityPreset {
  return PRESETS[quality]
}
```

- [ ] **Step 2: Game.ts 적용** — 258행 `this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` 를:

```ts
this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset().pixelRatio))
```

상단 import에 `import { preset } from './perf'` 추가.

- [ ] **Step 3: particles.ts 적용** — `const MAX_PARTICLES = 160` 을:

```ts
import { preset } from './perf'
const MAX_PARTICLES = Math.round(160 * preset().particleScale)
```

- [ ] **Step 4: assets.ts 적용** — `buildDecorations` 안에서 데코 개수를 정하는 `count` 인자 사용부(485행 부근 `count: number` 를 받아 `for (let k = 0; k < count; k++)` 도는 내부 헬퍼)에서:

```ts
import { preset } from './perf' // 파일 상단
// 내부 헬퍼의 루프를:
for (let k = 0; k < Math.max(1, Math.round(count * preset().decorScale)); k++) {
```

- [ ] **Step 5: 설정 UI** — `src/i18n.ts` DICT에 키 추가:

```ts
  graphics: { en: 'Graphics', ko: '그래픽 품질' },
  qLow: { en: 'Low', ko: '낮음' },
  qMid: { en: 'Medium', ko: '중간' },
  qHigh: { en: 'High', ko: '높음' },
  qualityNote: { en: 'Applied on next race', ko: '다음 레이스부터 적용' },
```

`src/ui/SettingsScreen.tsx`의 언어 선택 행(81행 부근 `setting-label` + 버튼 그룹 패턴)을 그대로 복제해 그래픽 품질 행 추가:

```tsx
import { getQuality, setQuality, type Quality } from '../game/perf'
// 컴포넌트 안:
const [quality, setQualityState] = useState<Quality>(getQuality())
// JSX — 언어 행 아래:
<div className="setting-row">
  <span className="setting-label">{t('graphics')}</span>
  <div>
    {(['low', 'mid', 'high'] as Quality[]).map((q) => (
      <button
        key={q}
        className={`btn small ${quality === q ? 'on' : ''}`}
        onClick={() => { setQuality(q); setQualityState(q) }}
      >
        {t(q === 'low' ? 'qLow' : q === 'mid' ? 'qMid' : 'qHigh')}
      </button>
    ))}
  </div>
  <span className="setting-note">{t('qualityNote')}</span>
</div>
```

(주의: SettingsScreen의 실제 row 클래스명은 파일의 기존 BGM 볼륨 행과 동일하게 맞출 것 — 다르면 기존 마크업을 따른다.)

- [ ] **Step 6: 검증** — `npx tsc --noEmit` 통과, 프리뷰 설정 화면에서 품질 토글 동작(localStorage `v8kart_quality` 변경) 확인.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: quality presets (low/mid/high) for mobile & low-end"`

---

### Task 4: gimmicks.ts — 타입 + 순수 헬퍼 (TDD)

**Files:**
- Modify: `src/game/gimmicks.ts` (Task 1의 임시 파일 교체)
- Create: `src/game/gimmicks.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/game/gimmicks.test.ts
import { describe, it, expect } from 'vitest'
import { inSplineRange, cyclePhase, spinbarAngle } from './gimmicks'

describe('inSplineRange', () => {
  it('plain range', () => {
    expect(inSplineRange(0.5, 0.4, 0.6)).toBe(true)
    expect(inSplineRange(0.3, 0.4, 0.6)).toBe(false)
  })
  it('wrapping range (e.g. 0.95..0.05)', () => {
    expect(inSplineRange(0.98, 0.95, 0.05)).toBe(true)
    expect(inSplineRange(0.02, 0.95, 0.05)).toBe(true)
    expect(inSplineRange(0.5, 0.95, 0.05)).toBe(false)
  })
})

describe('determinism', () => {
  it('cyclePhase is a pure function of time (negative-safe)', () => {
    expect(cyclePhase(7.5, 5)).toBeCloseTo(0.5)
    expect(cyclePhase(-2.5, 5)).toBeCloseTo(0.5)
    expect(cyclePhase(12.5, 5)).toBe(cyclePhase(2.5, 5))
  })
  it('spinbarAngle same input → same output', () => {
    expect(spinbarAngle(3.3, 4)).toBe(spinbarAngle(3.3, 4))
    expect(spinbarAngle(0, 4)).toBeCloseTo(0)
    expect(spinbarAngle(2, 4)).toBeCloseTo(Math.PI)
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run` / Expected: FAIL (`inSplineRange` 미정의)

- [ ] **Step 3: 타입 + 헬퍼 구현** — `src/game/gimmicks.ts` 전체를 다음으로 교체:

```ts
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
  return ((raceSec % period) + period) % period / period
}

/** 회전 바 각도(rad) */
export function spinbarAngle(raceSec: number, period: number): number {
  return cyclePhase(raceSec, period) * Math.PI * 2
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run` / Expected: PASS (4 tests)

- [ ] **Step 5: Commit** — `git add src/game/gimmicks.ts src/game/gimmicks.test.ts && git commit -m "feat: gimmick defs + deterministic phase helpers (TDD)"`

---

### Task 5: track.ts — 밀물 지원 + ocean 반환

**Files:**
- Modify: `src/game/track.ts`

- [ ] **Step 1: Track에 pitLatShift 추가** — 클래스 필드에 `pitLatShift = 0` 추가하고, `isPit()`의 open-water 분기(123행)를:

```ts
if (c.open && c.ocean) return Math.abs(lat) > this.wallDist + 0.5 + this.pitLatShift
```

- [ ] **Step 2: TrackMeshes에 ocean 추가** — 인터페이스를:

```ts
export interface TrackMeshes {
  group: THREE.Group
  boostPadMats: THREE.MeshBasicMaterial[]
  ocean?: THREE.Mesh
}
```

`buildTrackMeshes`의 open-water 분기에서 만든 `ocean` Mesh를 리턴 객체에 포함: `return { group, boostPadMats, ocean }` (open 맵이 아닐 때는 undefined — 기존 `const ocean` 변수를 분기 밖으로 끌어올린다).

- [ ] **Step 3: 검증 + Commit** — `npx tsc --noEmit` 통과 후 `git add src/game/track.ts && git commit -m "feat: track tide support (pitLatShift) + expose ocean mesh"`

---

### Task 6: GimmickManager — 메시 생성 + 시각 갱신

**Files:**
- Modify: `src/game/gimmicks.ts` (헬퍼 아래에 추가)

- [ ] **Step 1: Manager 골격 + 메시 생성 코드 추가**

```ts
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
  spun: boolean // 스핀 당함 (해머/낙석/회전바)
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
    defs.forEach((def, i) => {
      switch (def.type) {
        case 'mud': {
          this.mud.push(def)
          // 갈색 반투명 스트립 (시각)
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
          break // 시각은 화살표 데칼 수준 — 생략 가능 (커브 색으로 충분)
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
```

- [ ] **Step 2: updateVisuals 추가** (같은 클래스 안)

```ts
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
      // 부서진 상자는 숨겼다가 시간이 지나면 복구
      let dirty = false
      cg.crates.forEach((c, k) => {
        const broken = c.brokenUntil > raceSec
        dummy.position.set(c.pos.x, broken ? -5 : 0.55, c.pos.z)
        dummy.rotation.y = k * 0.6
        dummy.updateMatrix()
        cg.mesh.setMatrixAt(k, dummy.matrix)
        dirty = true
      })
      if (dirty) cg.mesh.instanceMatrix.needsUpdate = true
    }
    if (this.tide && this.ocean) {
      const lvl = Math.sin((raceSec / this.tide.def.period) * Math.PI * 2) // -1..1
      this.ocean.position.y = -1.4 + lvl * this.tide.def.range * 0.4
      this.track.pitLatShift = -lvl * this.tide.def.range // 만조 = 모래 폭 감소
    }
  }
```

- [ ] **Step 3: 타입체크** — `npx tsc --noEmit` 통과 (applyToActor는 다음 Task)

- [ ] **Step 4: Commit** — `git add src/game/gimmicks.ts && git commit -m "feat: GimmickManager meshes + deterministic visuals"`

---

### Task 7: GimmickManager — 카트 효과 (applyToActor)

**Files:**
- Modify: `src/game/gimmicks.ts` (클래스에 메서드 추가)

- [ ] **Step 1: applyToActor 구현**

```ts
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
      if (m.side && m.side !== 0 && Math.sign(lat) !== m.side) continue
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
      const bx = Math.sin(ang + Math.PI / 2) // bar local +X 방향의 월드 방향
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
```

- [ ] **Step 2: 타입체크** — `npx tsc --noEmit` 통과

- [ ] **Step 3: Commit** — `git add src/game/gimmicks.ts && git commit -m "feat: gimmick kart effects (mud/conveyor/bumper/crates/turntable/spinbar/teleport/rockfall)"`

---

### Task 8: Game.ts 연결

**Files:**
- Modify: `src/game/Game.ts`

- [ ] **Step 1: 생성 연결** — 상단 import에 `import { GimmickManager } from './gimmicks'` 추가. 271행 부근을:

```ts
const { group, ocean } = buildTrackMeshes(this.track)
this.scene.add(group)
this.gimmicks = new GimmickManager(this.track, ocean)
this.scene.add(this.gimmicks.group)
```

클래스 필드 선언 추가: `private gimmicks!: GimmickManager`

- [ ] **Step 2: raceSec 계산 + 시각 갱신** — update 루프(physics while문 앞)에:

```ts
const raceSec = this.goTime > 0 ? (now - this.goTime) / 1000 : 0
```

렌더 직전(카메라 위치 확정 후)에:

```ts
this.gimmicks.updateVisuals(raceSec, this.camera.position)
```

- [ ] **Step 3: 효과 적용** — 기존 boost pads + jump ramps 블록(873행 `if (this.phase === 'racing')` 내부, padActors 루프 끝)에 추가:

```ts
        // gimmicks (player + AIs; remotes are victim-authoritative on their end)
        const gh = this.gimmicks.applyToActor(pa.key, pa.kart, raceSec, dt)
        if (pa.key === 'me') {
          if (gh.spun) {
            audio.hit()
            this.camShake = Math.max(this.camShake, 0.3)
          }
          if (gh.bounced) {
            audio.wallBump()
            this.camShake = Math.max(this.camShake, 0.22)
          }
          if (gh.teleported) audio.boost()
          if (gh.smashedCrate) {
            audio.wallBump()
            this.particles.landingDust(gh.smashedCrate)
          }
        }
```

(주의: padActors 루프는 `dt`가 아니라 프레임 단위로 돈다 — 이 위치는 물리 스텝 밖이므로 `dt`(프레임 시간)를 그대로 쓰면 된다. 머드/컨베이어/턴테이블은 연속 효과라 프레임 dt 적용이 맞다.)

- [ ] **Step 4: 검증** — `npx tsc --noEmit` + `npm run build` 통과.

- [ ] **Step 5: Commit** — `git add src/game/Game.ts && git commit -m "feat: wire GimmickManager into game loop"`

---

### Task 9: 기존 5코스에 기믹 데이터 배치

**Files:**
- Modify: `src/game/courses/sunny.ts`, `beach.ts`, `canyon.ts`, `ice.ts`, `neon.ts`

- [ ] **Step 1: 각 코스 파일에 `gimmicks` 필드 추가** (배치는 기존 boost/jump/pit과 안 겹치게 검증된 값):

```ts
// sunny.ts — 입문: 머드존 1 + 상자
gimmicks: [
  { type: 'mud', t0: 0.40, t1: 0.445, side: 0 },
  { type: 'crates', t: 0.65, lane: -0.5, count: 4 },
  { type: 'crates', t: 0.66, lane: 0.5, count: 3 },
],

// beach.ts — 시그니처: 밀물/썰물 + 급류
gimmicks: [
  { type: 'tide', period: 46, range: 1.6 },
  { type: 'conveyor', t0: 0.46, t1: 0.54, dir: 1, push: 6 },
],

// canyon.ts — 시그니처: 낙석 2 (pit 0.42-0.5, 0.76-0.84 회피)
gimmicks: [
  { type: 'rockfall', t: 0.18, lane: -0.3, period: 5, warnSec: 1 },
  { type: 'rockfall', t: 0.62, lane: 0.4, period: 6.5, warnSec: 1 },
],

// ice.ts — 시그니처: 핀볼 범퍼 클러스터 (빙판 저그립과 시너지)
gimmicks: [
  { type: 'bumper', t: 0.32, lane: -0.45 },
  { type: 'bumper', t: 0.345, lane: 0.4 },
  { type: 'bumper', t: 0.37, lane: 0 },
],

// neon.ts — 시그니처: 텔레포트 + 회전바 + 턴테이블
// teleport 제약: floor(0.27*8)=2 == floor(0.345*8)=2 (같은 체크포인트 구간) ✓
gimmicks: [
  { type: 'teleport', t: 0.27, exitT: 0.345 },
  { type: 'spinbar', t: 0.55, period: 4 },
  { type: 'turntable', t: 0.9, lane: 0, radius: 4.5, spin: 0.9 },
],
```

- [ ] **Step 2: 결정론 회귀 확인** — Run: `npx vitest run` / Expected: PASS

- [ ] **Step 3: Commit** — `git add src/game/courses && git commit -m "feat: gimmicks on all 5 existing courses"`

---

### Task 10: 프리뷰 검증 + 푸시

- [ ] **Step 1: 코스별 주행 검증** (프리뷰 + `window.__game` 동기 시뮬레이션):
  - 써니: 머드존 위에서 speed가 ~11로 떨어지는지, 상자 충돌 시 speed*0.84 + 파티클 + 6초 후 복구
  - 비치: 46초 주기로 ocean.y와 모래 경계 변화(만조 때 pitLatShift<0), 급류 구간 통과 시간 단축
  - 캐니언: 낙석 경고 그림자 → 낙하 → 임팩트 창에서 스핀
  - 아이스: 범퍼 접촉 시 바깥으로 튕김 + velDir 갱신
  - 네온: 게이트 통과 → exitT 순간이동(랩 카운트 정상 — 같은 cp 구간), 회전바 타이밍 스핀, 턴테이블 위 heading 회전
  - AI 3명 아이템전 1판: AI가 기믹에 맞아도 레이스 정상 진행
  - 고스트(타임어택) 1판: 고스트 기록/재생 어긋남 없음
- [ ] **Step 2: 성능 확인** — 설정에서 low 선택 후 재시작 → pixelRatio 1 적용, 프레임 타임 확인
- [ ] **Step 3: 빌드 + 푸시** — `npm run build` 후 `git push`

---

## 후속 계획 (별도 문서로 작성 예정)

- **Plan 2** `2026-06-xx-volcano-factory.md`: sinkroad/geyser/hammer/press 타입 + 볼케이노 런 + 기어 팩토리 (코스 데이터 + 테마 + 풍경)
- **Plan 3** `2026-06-xx-jungle-shortcuts.md`: 지름길(C) 서브 스플라인 시스템 + 정글 템플 + 캐니언/아이스 지름길 소급 적용
- **Plan 4** `2026-06-xx-sky-vertical.md`: 높이 프로필/뱅크(H) + cannon/platform 타입 + 스카이 하이웨이
