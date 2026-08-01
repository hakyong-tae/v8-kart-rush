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
    [150, 95], [170, 45], [125, 22], [60, 28],
    [6, 46], [-60, 28], [-58, 0],               // 복귀 — 이음새 스무딩 (출발선 유턴 r2→r13, apex를 서쪽으로)
  ],
  // 이음새 스무딩(2026-07-08)으로 L 1413→1559 — 모든 t 앵커에 ×0.9067 적용 (월드 위치 보존)
  boostPads: [
    { t: 0.134, len: 0.014 },
    { t: 0.388, len: 0.014 },
    { t: 0.749, len: 0.014 },
  ],
  jumpPads: [{ t: 0.206, len: 0.012, lane: 0.1, w: 0.3 }],
  pits: [],
  itemRows: [
    { t: 0.058, lanes: [-0.6, 0, 0.6] },
    { t: 0.424, lanes: [-0.6, 0, 0.6] },
    { t: 0.635, lanes: [-0.6, 0, 0.6] },
    { t: 0.818, lanes: [-0.6, 0, 0.6] },
  ],
  gimmicks: [
    // 점프대 뒤 늪 진흙 (틈은 오른쪽 가장자리) — 강변 샛길 진입 직전이라 선택 압박
    { type: 'mud', t0: 0.217, t1: 0.222, lane: 0.15, w: 0.85 },
    // 사원 지그재그를 가로지르는 좁은 샛길 vs 굽이치는 S를 가로지르는 강변 샛길
    { type: 'shortcut', entryT: 0.601, exitT: 0.712, via: [[15, 95], [60, 102]], width: 5 },
    // 강변 샛길은 중간이 늪지: 무부스트 +1.2s 손해 / 풀부스터 -2.0s 이득 (사원 샛길은 클린 유지)
    { type: 'shortcut', entryT: 0.244, exitT: 0.352, via: [[-15, -118], [-65, -122]], width: 5, swamp: [0.35, 0.65] },
    // 강 위 출렁다리 — 주기적으로 잠긴다 (floor: 강물색)
    { type: 'sinkroad', t0: 0.437, t1: 0.471, period: 8, duty: 0.6, floor: 0x2e86c0 },
    // 흔들리는 통나무
    { type: 'hammer', t: 0.546, lane: 0, period: 3.6, variant: 'log' },
    { type: 'hammer', t: 0.1, lane: 0.25, period: 4.4, variant: 'log' },
  ],
  decorSeed: 67,
  theme: {
    sky: 0x9fd8b8, fog: 0xa8d8b8, fogDensity: 0.0024,
    ground: 0x3f6a38, road: 0x6a6052, curbA: 0xd0b060, curbB: 0x4a5a40,
    rail: 0x8a7a5a, railAccent: 0xd0b060,
    line: 0xe8e0c0, sun: 0xfff0d0, sunIntensity: 1.05, ambient: 0.9,
  },
}
