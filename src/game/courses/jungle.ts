// src/game/courses/jungle.ts — 정글 사원: 갈림길 2개 + 강 위 출렁다리 + 흔들리는 통나무
// 레이아웃 사전 검증: minSep 19.5 (필요 ≥ 17.2), 지름길 절약 각 19유닛, 본선과 충돌 없음
import type { CourseDef } from './types'

export const jungle: CourseDef = {
  id: 'jungle',
  name: 'Jungle Temple',
  nameKo: '정글 템플',
  difficulty: 3,
  laps: 3,
  width: 12,
  shoulder: 2.6,
  surface: 'road',
  offroadMax: 10,
  offroadDrag: 2.4,
  points: [
    [0, 0], [90, -8], [150, -32], [175, -78],   // 스타트 → 숲 진입
    [150, -122], [95, -140],                    // 남쪽 커브
    [40, -120], [5, -152], [-45, -168], [-105, -140], // 굽이치는 S (지름길2가 자름)
    [-150, -105], [-175, -55], [-160, -5],      // 서쪽 → 강변 북상
    [-180, 40], [-150, 85], [-95, 105],         // 사원 접근
    [-40, 90], [-5, 128], [45, 152], [105, 130], // 사원 지그재그 (지름길1이 자름)
    [150, 95], [170, 45], [125, 22], [60, 28], [25, 18], // 복귀
  ],
  boostPads: [
    { t: 0.148, len: 0.014 },
    { t: 0.428, len: 0.014 },
    { t: 0.826, len: 0.014 },
  ],
  jumpPads: [{ t: 0.227, len: 0.012 }],
  pits: [],
  itemRows: [
    { t: 0.064, lanes: [-0.6, 0, 0.6] },
    { t: 0.468, lanes: [-0.6, 0, 0.6] },
    { t: 0.7, lanes: [-0.6, 0, 0.6] },
    { t: 0.902, lanes: [-0.6, 0, 0.6] },
  ],
  gimmicks: [
    // 사원 지그재그를 가로지르는 좁은 샛길 vs 굽이치는 S를 가로지르는 강변 샛길
    { type: 'shortcut', entryT: 0.663, exitT: 0.785, via: [[15, 95], [60, 102]], width: 5 },
    { type: 'shortcut', entryT: 0.269, exitT: 0.388, via: [[-15, -118], [-65, -122]], width: 5 },
    // 강 위 출렁다리 — 주기적으로 잠긴다 (floor: 강물색)
    { type: 'sinkroad', t0: 0.482, t1: 0.519, period: 8, duty: 0.6, floor: 0x2e86c0 },
    // 흔들리는 통나무
    { type: 'hammer', t: 0.602, lane: 0, period: 3.6, variant: 'log' },
    { type: 'hammer', t: 0.11, lane: 0.25, period: 4.4, variant: 'log' },
  ],
  decorSeed: 67,
  theme: {
    sky: 0x9fd8b8, fog: 0xa8d8b8, fogDensity: 0.0024,
    ground: 0x3f6a38, road: 0x6a6052, curbA: 0xd0b060, curbB: 0x4a5a40,
    rail: 0x8a7a5a, railAccent: 0xd0b060,
    line: 0xe8e0c0, sun: 0xfff0d0, sunIntensity: 1.05, ambient: 0.9,
  },
}
