import type { CourseDef } from './types'

export const neon: CourseDef = {
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
  // 0.6은 코너라 착지가 도로 밖 → 0.62 직선으로. 최고난도라 램프도 가장 좁다
  jumpPads: [{ t: 0.62, len: 0.012, lane: 0, w: 0.28 }],
  pits: [{ t0: 0.26, t1: 0.34, side: -1 }],
  itemRows: [
    { t: 0.18, lanes: [-0.6, 0, 0.6] },
    { t: 0.5, lanes: [-0.6, 0, 0.6] },
    { t: 0.84, lanes: [-0.6, 0, 0.6] },
  ],
  gimmicks: [
    // 점프대 뒤 오일 슬릭 (틈은 왼쪽 가장자리)
    { type: 'mud', t0: 0.632, t1: 0.643, lane: -0.15, w: 0.85 },
    { type: 'teleport', t: 0.27, exitT: 0.345 },
    { type: 'spinbar', t: 0.55, period: 4 },
    { type: 'turntable', t: 0.9, lane: 0, radius: 4.5, spin: 0.9 },
  ],
  decorSeed: 47,
  theme: {
    sky: 0x131a45, fog: 0x232c63, fogDensity: 0.002,
    ground: 0x1d4030, road: 0x3c3c4d, curbA: 0x00d9ff, curbB: 0xff2d95,
    rail: 0x4d5580, railAccent: 0x00d9ff,
    line: 0x9fe8ff, sun: 0x8aa6ff, sunIntensity: 0.65, ambient: 0.6,
    night: true,
  },
}
