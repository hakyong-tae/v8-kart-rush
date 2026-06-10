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
      sky: 0x87ceeb, fog: 0xbfe3f2, fogDensity: 0.0016,
      ground: 0x6abe4f, road: 0x4a4a52, curbA: 0xe04438, curbB: 0xf2f2f2,
      line: 0xffffff, sun: 0xfff2d8, sunIntensity: 1.15, ambient: 0.75,
    },
  },
  {
    id: 'canyon',
    name: 'Canyon Twist',
    nameKo: '캐니언 트위스트',
    difficulty: 2,
    laps: 3,
    width: 12,
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
      sky: 0xf5c87a, fog: 0xf0d3a0, fogDensity: 0.0019,
      ground: 0xc89455, road: 0x55504e, curbA: 0xd97a26, curbB: 0xf5ead6,
      line: 0xfff3da, sun: 0xffd9a0, sunIntensity: 1.25, ambient: 0.65,
    },
  },
  {
    id: 'neon',
    name: 'Neon Night',
    nameKo: '네온 나이트',
    difficulty: 3,
    laps: 3,
    width: 11,
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
      sky: 0x0a0e2a, fog: 0x131a40, fogDensity: 0.0024,
      ground: 0x16331e, road: 0x33333d, curbA: 0x00d9ff, curbB: 0xff2d95,
      line: 0x9fe8ff, sun: 0x8aa6ff, sunIntensity: 0.5, ambient: 0.45,
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
  { id: 'red', model: 'raceCarRed', ui: '#e04438' },
  { id: 'green', model: 'raceCarGreen', ui: '#3fa84c' },
  { id: 'orange', model: 'raceCarOrange', ui: '#f08c1e' },
  { id: 'white', model: 'raceCarWhite', ui: '#e8e8e8' },
] as const

export type KartColorId = (typeof KART_COLORS)[number]['id']

export function kartModelFor(
  color: string,
): 'raceCarRed' | 'raceCarGreen' | 'raceCarOrange' | 'raceCarWhite' {
  return KART_COLORS.find((k) => k.id === color)?.model ?? 'raceCarRed'
}
