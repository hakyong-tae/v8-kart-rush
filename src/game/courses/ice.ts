import type { CourseDef } from './types'

export const ice: CourseDef = {
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
  gimmicks: [
    { type: 'bumper', t: 0.32, lane: -0.45 },
    { type: 'bumper', t: 0.345, lane: 0.4 },
    { type: 'bumper', t: 0.37, lane: 0 },
  ],
  decorSeed: 31,
  theme: {
    sky: 0xa9e4ff, fog: 0xe2f4ff, fogDensity: 0.0015,
    ground: 0xf0f7fc, road: 0xa9d3e6, curbA: 0x3f8fe0, curbB: 0xffffff,
    rail: 0xdff0fa, railAccent: 0x3f8fe0,
    line: 0xffffff, sun: 0xeaf6ff, sunIntensity: 1.2, ambient: 1.0,
  },
}
