import type { CourseDef } from './types'

export const beach: CourseDef = {
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
  gimmicks: [
    { type: 'tide', period: 46, range: 1.6 },
    { type: 'conveyor', t0: 0.46, t1: 0.54, dir: 1 as const, push: 6 },
  ],
  decorSeed: 77,
  theme: {
    sky: 0xffc1a1, fog: 0xffe0c2, fogDensity: 0.0012,
    ground: 0xf2dca8, road: 0x8a7f72, curbA: 0xff8c5a, curbB: 0xfff4e0,
    rail: 0xfff4e0, railAccent: 0xff8c5a,
    line: 0xfff8ea, sun: 0xffc890, sunIntensity: 1.25, ambient: 0.95,
  },
}
