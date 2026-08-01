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
  // 동쪽 계곡 직선 — 0.3은 코너라 착지가 도로 밖 (부호 있는 착지 스캔으로 0.344 확정)
  jumpPads: [{ t: 0.344, len: 0.012, lane: 0, w: 0.3 }],
  pits: [
    { t0: 0.42, t1: 0.5, side: -1 },
    { t0: 0.76, t1: 0.84, side: 1 },
  ],
  itemRows: [
    { t: 0.22, lanes: [-0.6, 0, 0.6] },
    { t: 0.58, lanes: [-0.6, 0, 0.6] },
    { t: 0.9, lanes: [-0.6, 0, 0.6] },
  ],
  gimmicks: [
    // 점프대 뒤 머드 (틈은 왼쪽 가장자리)
    { type: 'mud', t0: 0.356, t1: 0.369, lane: -0.15, w: 0.85 },
    { type: 'rockfall', t: 0.18, lane: -0.3, period: 5, warnSec: 1 },
    { type: 'rockfall', t: 0.62, lane: 0.4, period: 6.5, warnSec: 1 },
    // 남서 딥을 가로지르는 좁은 협곡길 — 중간이 늪: 무부스트 +0.7s 손해 / 풀부스터 -3.0s 이득
    { type: 'shortcut', entryT: 0.53, exitT: 0.714, via: [[-95, -102]], width: 5, swamp: [0.3, 0.75] },
  ],
  decorSeed: 23,
  theme: {
    sky: 0xffd089, fog: 0xffe3b3, fogDensity: 0.0016,
    ground: 0xe8b066, road: 0x6b6258, curbA: 0xff8c2e, curbB: 0xfff4e0,
    rail: 0xf5e3c8, railAccent: 0xd96b26,
    line: 0xfff3da, sun: 0xffd9a0, sunIntensity: 1.35, ambient: 0.85,
  },
}
