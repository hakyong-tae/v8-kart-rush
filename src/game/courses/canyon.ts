import type { CourseDef } from './types'

export const canyon: CourseDef = {
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
}
