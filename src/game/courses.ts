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
  shoulder: number // grass strip between curb and guardrail
  surface: 'road' | 'ice'
  points: [number, number][]
  boostPads: BoostPadDef[]
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
    points: [
      [-60, 0], [40, 0], [100, 8], [140, 45], [132, 95],
      [85, 122], [25, 112], [-30, 132], [-90, 126], [-132, 85],
      [-138, 32], [-105, 4],
    ],
    boostPads: [
      { t: 0.30, len: 0.018 },
      { t: 0.78, len: 0.018 },
    ],
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
    id: 'neon',
    name: 'Neon Night',
    nameKo: '네온 나이트',
    difficulty: 3,
    laps: 3,
    width: 11,
    shoulder: 2.4,
    surface: 'road',
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

export const KART_COLORS = [
  { id: 'red', model: 'raceCarRed', ui: '#ff5d4d', rider: 0xffe14d },
  { id: 'green', model: 'raceCarGreen', ui: '#43c463', rider: 0xff8c2e },
  { id: 'orange', model: 'raceCarOrange', ui: '#ff9d2e', rider: 0x4aa8ff },
  { id: 'white', model: 'raceCarWhite', ui: '#f2f2f2', rider: 0xff5d8a },
] as const

export type KartColorId = (typeof KART_COLORS)[number]['id']

export function kartModelFor(
  color: string,
): 'raceCarRed' | 'raceCarGreen' | 'raceCarOrange' | 'raceCarWhite' {
  return KART_COLORS.find((k) => k.id === color)?.model ?? 'raceCarRed'
}

export function riderColorFor(color: string): number {
  return KART_COLORS.find((k) => k.id === color)?.rider ?? 0xffe14d
}
