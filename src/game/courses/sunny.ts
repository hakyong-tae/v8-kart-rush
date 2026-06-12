import type { CourseDef } from './types'

export const sunny: CourseDef = {
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
}
