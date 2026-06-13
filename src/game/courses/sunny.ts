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
  // 콩팥(kidney) 실루엣 — 가운데가 안으로 패여 비치의 볼록 덩어리와 구분. minSep 31.7
  points: [
    [-130, -20], [-30, -30], [70, -22], [140, 15],  // 긴 남쪽 완만 스윕
    [165, 75], [120, 110], [60, 92],                 // 동쪽 → 안으로 (오목 진입)
    [25, 55], [-20, 70],                             // 가운데 패임 (kidney)
    [-70, 110], [-130, 100], [-165, 45],             // 서쪽 와이드 헤어핀
    [-160, -15],                                     // 남서 복귀
  ],
  boostPads: [
    { t: 0.10, len: 0.018 }, // 남쪽 직선
    { t: 0.72, len: 0.018 }, // 서쪽 헤어핀 탈출
  ],
  jumpPads: [{ t: 0.18, len: 0.012 }], // 남쪽 직선 위
  pits: [],
  itemRows: [
    { t: 0.05, lanes: [-0.6, 0, 0.6] },
    { t: 0.46, lanes: [-0.6, 0, 0.6] },
    { t: 0.80, lanes: [-0.6, 0, 0.6] },
  ],
  gimmicks: [
    { type: 'mud', t0: 0.40, t1: 0.44, side: 0 as const }, // 동쪽 스윕
    { type: 'crates', t: 0.62, lane: -0.5, count: 4 },      // 오목 탈출
    { type: 'crates', t: 0.63, lane: 0.5, count: 3 },
  ],
  decorSeed: 11,
  theme: {
    sky: 0x6ecbff, fog: 0xcdeeff, fogDensity: 0.0013,
    ground: 0x7ed957, road: 0x5d6273, curbA: 0xff5d4d, curbB: 0xffffff,
    rail: 0xffffff, railAccent: 0xff5d4d,
    line: 0xffffff, sun: 0xfff4da, sunIntensity: 1.3, ambient: 0.95,
  },
}
