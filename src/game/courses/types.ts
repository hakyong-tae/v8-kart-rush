// Course definitions. Coordinates are 2D (x, z) on a flat plane, closed loops.
// Track geometry, checkpoints, boost pads and item boxes are all derived from these.

import type { GimmickDef } from '../gimmicks'

export interface BoostPadDef {
  t: number // spline position 0..1 (pad start)
  len: number // length along spline in t units
}

export interface ItemBoxRowDef {
  t: number // spline position of the row
  lanes: number[] // lateral offsets (fraction of half width, -1..1)
}

export interface JumpPadDef {
  t: number // ramp start (spline position 0..1)
  len: number // ramp length in t units
}

// A cliff section: falling off this side of the road drops you into the void
// (the cloud rescuer brings you back). Open water maps pit everything beyond the boundary.
export interface PitDef {
  t0: number
  t1: number
  side: 1 | -1 | 0 // 1 = left of travel, -1 = right, 0 = both
}

export interface CourseTheme {
  sky: number
  fog: number
  fogDensity: number
  ground: number
  road: number
  curbA: number
  curbB: number
  rail: number
  railAccent: number
  line: number
  sun: number
  sunIntensity: number
  ambient: number
  night?: boolean
}

export interface CourseDef {
  id: string
  name: string
  nameKo: string
  difficulty: 1 | 2 | 3
  laps: number
  width: number // full road width
  shoulder: number // off-road strip between curb and boundary wall
  surface: 'road' | 'ice'
  open?: boolean // open map (Mario-Kart-style): no guardrails, wide cuttable off-road
  offroadMax: number // max speed on the off-road strip
  offroadDrag: number // extra drag off-road
  ocean?: number // ocean color — open island maps render water beyond the ground
  points: [number, number][]
  boostPads: BoostPadDef[]
  jumpPads: JumpPadDef[]
  pits: PitDef[]
  itemRows: ItemBoxRowDef[]
  decorSeed: number
  theme: CourseTheme
  gimmicks?: GimmickDef[] // 코스 기믹 (gimmicks.ts가 해석)
  /** 높이 프로필 — t(0..1)별 도로 높이. 코사인 보간 + 랩 래핑. 없으면 평지 */
  elevation?: { t: number; h: number }[]
  /** 뱅크 코너 — 구간 내 lat 1당 높이 기울기(slope). 가장자리 30샘플 이즈 */
  bank?: { t0: number; t1: number; slope: number }[]
  /** 하늘 맵: 지면 평면을 구름바다로 멀리 내림 */
  skyMap?: boolean
}
