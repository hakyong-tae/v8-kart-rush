// src/game/courses/sky.ts — 스카이 하이웨이: 고저차 + 뱅크 코너 + 구름다리 + 대포 비행
// 레이아웃 사전 검증: minSep 23.2 (필요 ≥ 18.2)
import type { CourseDef } from './types'

export const sky: CourseDef = {
  id: 'sky',
  name: 'Sky Highway',
  nameKo: '스카이 하이웨이',
  difficulty: 3,
  laps: 3,
  width: 13,
  shoulder: 2.4,
  surface: 'road',
  offroadMax: 10,
  offroadDrag: 2.4,
  skyMap: true,
  points: [
    [0, 0], [100, -4], [170, -24], [210, -70],   // 스타트 → 동쪽 뱅크 스위퍼
    [200, -130], [140, -165], [70, -160],        // 남쪽 고속 구간
    [10, -130],                                  // 구름다리1 진입
    [-60, -120], [-120, -140], [-180, -110],     // 서쪽 딥
    [-210, -50], [-195, 15], [-150, 55],         // 오르막 — 대포 발사대
    [-90, 75], [-30, 60], [20, 85], [60, 130],   // 능선 S
    [130, 150], [190, 120], [200, 60],           // 북쪽 뱅크 스위퍼
    [150, 30], [80, 34], [25, 22],               // 복귀 다운힐 (구름다리2)
  ],
  // 높이 프로필 — 코사인 보간 (h: 월드 유닛)
  elevation: [
    { t: 0, h: 0 }, { t: 0.11, h: 8 }, { t: 0.19, h: 10 },
    { t: 0.3, h: 2 }, { t: 0.4, h: 0 }, { t: 0.5, h: 6 },
    { t: 0.56, h: 14 }, { t: 0.61, h: 8 }, { t: 0.69, h: 10 },
    { t: 0.78, h: 12 }, { t: 0.86, h: 6 }, { t: 0.94, h: 1 },
  ],
  // 뱅크 코너 — slope: lat 1당 높이 (부호는 코너 방향에 맞춰 튜닝)
  bank: [
    { t0: 0.1, t1: 0.19, slope: 0.1 },
    { t0: 0.72, t1: 0.82, slope: -0.1 },
  ],
  boostPads: [
    { t: 0.063, len: 0.016 },
    { t: 0.406, len: 0.016 },
    { t: 0.773, len: 0.016 },
  ],
  jumpPads: [{ t: 0.278, len: 0.012 }],
  pits: [],
  itemRows: [
    { t: 0.149, lanes: [-0.6, 0, 0.6] },
    { t: 0.449, lanes: [-0.6, 0, 0.6] },
    { t: 0.653, lanes: [-0.6, 0, 0.6] },
    { t: 0.857, lanes: [-0.6, 0, 0.6] },
  ],
  gimmicks: [
    // 구름다리 — 주기적으로 걷히는 구간 (빠지면 구름이 구조)
    { type: 'sinkroad', t0: 0.298, t1: 0.333, period: 8, duty: 0.62, floor: 0xcfe8fa },
    { type: 'sinkroad', t0: 0.894, t1: 0.932, period: 7.5, duty: 0.58, floor: 0xcfe8fa },
    // 대포 — 오르막 정점에서 능선으로 발사
    { type: 'cannon', t: 0.534, landT: 0.58, flightSec: 1.6 },
  ],
  decorSeed: 73,
  theme: {
    sky: 0x7ec8ff, fog: 0xbfe2fa, fogDensity: 0.0012,
    ground: 0xe8f4ff, road: 0x8fa3c8, curbA: 0xffffff, curbB: 0x4a90d8,
    rail: 0xeaf4ff, railAccent: 0x4a90d8,
    line: 0xffffff, sun: 0xfff4da, sunIntensity: 1.3, ambient: 1.0,
  },
}
