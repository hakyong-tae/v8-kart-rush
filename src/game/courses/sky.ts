// src/game/courses/sky.ts — 스카이 하이웨이: 긴 출발직선 + 고저차 + 대포 협곡(아래는 mud)
// 정글(둥근 덩어리)과 대비되는 대각으로 늘어진 루프. minSep 43.4 (필요 ≥ 17.8)
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
    [-160, -50], [-70, -52], [30, -50], [120, -46],  // 긴 출발 직선 (서→동, 남쪽)
    [205, -30], [250, 40], [240, 110],               // 동쪽 와이드 스윕 (오르막)
    [195, 165], [120, 185],                          // 북동 정점 → 대포 발사대
    [40, 180], [-30, 165],                           // 협곡 하강 구간 (대포가 가로지름)
    [-95, 140], [-150, 95],                          // 북서 코너
    [-205, 45], [-235, -25],                         // 서쪽 다운힐
    [-205, -70], [-185, -62],                        // 남서 복귀
  ],
  // 높이 프로필 — 동쪽 오르막 정점에서 협곡 평지로 하강, 대포 구간은 평탄(탄도 착지 안정),
  // 서쪽에서 다시 다운힐. 코사인 보간
  elevation: [
    { t: 0, h: 0 }, { t: 0.15, h: 3 }, { t: 0.3, h: 10 },
    { t: 0.4, h: 15 }, { t: 0.49, h: 16 },          // 동쪽 정점
    { t: 0.55, h: 5 }, { t: 0.6, h: 5 }, { t: 0.66, h: 5 }, // 대포/mud 평지 (하강 후 평탄)
    { t: 0.73, h: 9 }, { t: 0.85, h: 4 }, { t: 0.93, h: 0 },
  ],
  bank: [
    { t0: 0.3, t1: 0.4, slope: 0.12 },   // 동쪽 오르막 스윕
    { t0: 0.83, t1: 0.9, slope: -0.1 },  // 남서 다운힐 코너
  ],
  boostPads: [
    { t: 0.073, len: 0.016 }, // 출발 직선
    { t: 0.368, len: 0.016 }, // 동쪽 오르막
    { t: 0.85, len: 0.016 },  // 북서 다운힐
  ],
  jumpPads: [{ t: 0.486, len: 0.012 }], // 동쪽 정점 빅점프
  pits: [],
  itemRows: [
    { t: 0.155, lanes: [-0.6, 0, 0.6] },
    { t: 0.299, lanes: [-0.6, 0, 0.6] },
    { t: 0.731, lanes: [-0.6, 0, 0.6] },
    { t: 0.912, lanes: [-0.6, 0, 0.6] },
  ],
  gimmicks: [
    // 대포: 발사대(0.55)에서 진흙 평지를 가로질러 그 너머(≈0.66)에 착지
    { type: 'cannon', t: 0.55, landT: 0.66, flightSec: 1.7 },
    // 진흙 평지 = 감속 구간 (대포를 안 타면 여기로 내려가 손해 — 페널티 적당히)
    { type: 'mud', t0: 0.585, t1: 0.625, side: 0 },
    // 북서 구름다리 (주기적으로 걷힘)
    { type: 'sinkroad', t0: 0.78, t1: 0.81, period: 8, duty: 0.6, floor: 0xcfe8fa },
  ],
  decorSeed: 73,
  theme: {
    sky: 0x7ec8ff, fog: 0xbfe2fa, fogDensity: 0.0012,
    ground: 0xe8f4ff, road: 0x8fa3c8, curbA: 0xffffff, curbB: 0x4a90d8,
    rail: 0xeaf4ff, railAccent: 0x4a90d8,
    line: 0xffffff, sun: 0xfff4da, sunIntensity: 1.3, ambient: 1.0,
  },
}
