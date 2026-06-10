// Course definitions. Coordinates are 2D (x, z) on a flat plane, closed loops.
// Track geometry, checkpoints, boost pads and item boxes are all derived from these.

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
}

export const COURSES: CourseDef[] = [
  {
    id: 'sunny',
    name: 'Sunny Circuit',
    nameKo: '써니 서킷',
    difficulty: 1,
    laps: 3,
    width: 14,
    shoulder: 3,
    surface: 'road',
    offroadMax: 10,
    offroadDrag: 2.4,
    points: [
      [-60, 0], [40, 0], [100, 8], [140, 45], [132, 95],
      [85, 122], [25, 112], [-30, 132], [-90, 126], [-132, 85],
      [-138, 32], [-105, 4],
    ],
    boostPads: [
      { t: 0.30, len: 0.018 },
      { t: 0.78, len: 0.018 },
    ],
    jumpPads: [{ t: 0.55, len: 0.012 }],
    pits: [],
    itemRows: [
      { t: 0.16, lanes: [-0.6, 0, 0.6] },
      { t: 0.48, lanes: [-0.6, 0, 0.6] },
      { t: 0.82, lanes: [-0.6, 0, 0.6] },
    ],
    decorSeed: 11,
    theme: {
      sky: 0x6ecbff, fog: 0xcdeeff, fogDensity: 0.0013,
      ground: 0x7ed957, road: 0x5d6273, curbA: 0xff5d4d, curbB: 0xffffff,
      rail: 0xffffff, railAccent: 0xff5d4d,
      line: 0xffffff, sun: 0xfff4da, sunIntensity: 1.3, ambient: 0.95,
    },
  },
  {
    id: 'canyon',
    name: 'Canyon Twist',
    nameKo: '캐니언 트위스트',
    difficulty: 2,
    laps: 3,
    width: 12,
    shoulder: 2.6,
    surface: 'road',
    offroadMax: 10,
    offroadDrag: 2.4,
    points: [
      [0, 0], [80, 2], [128, -18], [158, -60], [148, -110],
      [100, -132], [62, -100], [42, -62], [0, -52], [-40, -82],
      [-58, -130], [-110, -148], [-158, -118], [-168, -62], [-138, -12],
      [-78, 8],
    ],
    boostPads: [
      { t: 0.07, len: 0.016 },
      { t: 0.52, len: 0.016 },
      { t: 0.86, len: 0.016 },
    ],
    jumpPads: [{ t: 0.3, len: 0.012 }],
    pits: [
      { t0: 0.42, t1: 0.5, side: -1 },
      { t0: 0.76, t1: 0.84, side: 1 },
    ],
    itemRows: [
      { t: 0.22, lanes: [-0.6, 0, 0.6] },
      { t: 0.58, lanes: [-0.6, 0, 0.6] },
      { t: 0.9, lanes: [-0.6, 0, 0.6] },
    ],
    decorSeed: 23,
    theme: {
      sky: 0xffd089, fog: 0xffe3b3, fogDensity: 0.0016,
      ground: 0xe8b066, road: 0x6b6258, curbA: 0xff8c2e, curbB: 0xfff4e0,
      rail: 0xf5e3c8, railAccent: 0xd96b26,
      line: 0xfff3da, sun: 0xffd9a0, sunIntensity: 1.35, ambient: 0.85,
    },
  },
  {
    id: 'ice',
    name: 'Ice Valley',
    nameKo: '아이스 밸리',
    difficulty: 2,
    laps: 3,
    width: 12.5,
    shoulder: 2.8,
    surface: 'ice', // slippery! lower grip
    offroadMax: 10,
    offroadDrag: 2.4,
    points: [
      [0, 0], [90, -5], [150, 20], [170, 70], [140, 115],
      [90, 125], [55, 95], [10, 105], [-30, 140], [-85, 150],
      [-135, 120], [-150, 70], [-120, 30], [-150, -10], [-120, -45],
      [-60, -40],
    ],
    boostPads: [
      { t: 0.12, len: 0.016 },
      { t: 0.6, len: 0.016 },
    ],
    jumpPads: [{ t: 0.45, len: 0.012 }],
    pits: [],
    itemRows: [
      { t: 0.25, lanes: [-0.6, 0, 0.6] },
      { t: 0.55, lanes: [-0.6, 0, 0.6] },
      { t: 0.88, lanes: [-0.6, 0, 0.6] },
    ],
    decorSeed: 31,
    theme: {
      sky: 0xa9e4ff, fog: 0xe2f4ff, fogDensity: 0.0015,
      ground: 0xf0f7fc, road: 0xa9d3e6, curbA: 0x3f8fe0, curbB: 0xffffff,
      rail: 0xdff0fa, railAccent: 0x3f8fe0,
      line: 0xffffff, sun: 0xeaf6ff, sunIntensity: 1.2, ambient: 1.0,
    },
  },
  {
    id: 'beach',
    name: 'Sunset Beach',
    nameKo: '선셋 비치',
    difficulty: 1,
    laps: 3,
    width: 15,
    shoulder: 17, // wide open sand — cut across if you dare
    surface: 'road',
    open: true, // no guardrails, island map
    offroadMax: 18, // sand barely slows you (shortcuts are a real option)
    offroadDrag: 0.25, // equilibrium ≈ 15 — cuts trade ~45% speed for distance
    ocean: 0x2e9fd8,
    points: [
      [0, 0], [100, 0], [170, 28], [202, 88], [182, 150],
      [122, 182], [42, 172], [-28, 192], [-110, 182], [-172, 132],
      [-192, 62], [-162, 0], [-92, -28],
    ],
    boostPads: [
      { t: 0.2, len: 0.018 },
      { t: 0.68, len: 0.018 },
    ],
    jumpPads: [
      { t: 0.35, len: 0.014 },
      { t: 0.8, len: 0.014 },
    ],
    pits: [], // open water map: everything beyond the buoy line is the sea
    itemRows: [
      { t: 0.14, lanes: [-0.6, 0, 0.6] },
      { t: 0.42, lanes: [-0.6, 0, 0.6] },
      { t: 0.72, lanes: [-0.6, 0, 0.6] },
      { t: 0.92, lanes: [-0.6, 0, 0.6] },
    ],
    decorSeed: 77,
    theme: {
      sky: 0xffc1a1, fog: 0xffe0c2, fogDensity: 0.0012,
      ground: 0xf2dca8, road: 0x8a7f72, curbA: 0xff8c5a, curbB: 0xfff4e0,
      rail: 0xfff4e0, railAccent: 0xff8c5a,
      line: 0xfff8ea, sun: 0xffc890, sunIntensity: 1.25, ambient: 0.95,
    },
  },
  {
    id: 'neon',
    name: 'Neon Night',
    nameKo: '네온 나이트',
    difficulty: 3,
    laps: 3,
    width: 11,
    shoulder: 2.4,
    surface: 'road',
    offroadMax: 10,
    offroadDrag: 2.4,
    points: [
      [0, 0], [70, 4], [112, 38], [102, 88], [62, 110],
      [52, 158], [92, 198], [62, 248], [0, 258], [-52, 230],
      [-42, 182], [-82, 152], [-132, 170], [-172, 128], [-150, 78],
      [-100, 60], [-112, 22], [-58, -8],
    ],
    boostPads: [
      { t: 0.05, len: 0.014 },
      { t: 0.37, len: 0.014 },
      { t: 0.7, len: 0.014 },
    ],
    jumpPads: [{ t: 0.6, len: 0.012 }],
    pits: [{ t0: 0.26, t1: 0.34, side: -1 }],
    itemRows: [
      { t: 0.18, lanes: [-0.6, 0, 0.6] },
      { t: 0.5, lanes: [-0.6, 0, 0.6] },
      { t: 0.84, lanes: [-0.6, 0, 0.6] },
    ],
    decorSeed: 47,
    theme: {
      sky: 0x131a45, fog: 0x232c63, fogDensity: 0.002,
      ground: 0x1d4030, road: 0x3c3c4d, curbA: 0x00d9ff, curbB: 0xff2d95,
      rail: 0x4d5580, railAccent: 0x00d9ff,
      line: 0x9fe8ff, sun: 0x8aa6ff, sunIntensity: 0.65, ambient: 0.6,
      night: true,
    },
  },
]

export function getCourse(id: string): CourseDef {
  const c = COURSES.find((c) => c.id === id)
  if (!c) throw new Error(`unknown course: ${id}`)
  return c
}

// kart & character rosters moved to roster.ts
