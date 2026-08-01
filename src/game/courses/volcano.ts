// src/game/courses/volcano.ts — 화산 스위치백: 헤어핀 2개 + 무너지는 용암 다리
// 레이아웃 사전 검증: minSep 24.4 (필요 ≥ 17.2), t값은 CatmullRom getPointAt 기준
import type { CourseDef } from './types'

export const volcano: CourseDef = {
  id: 'volcano',
  name: 'Volcano Run',
  nameKo: '볼케이노 런',
  difficulty: 2,
  laps: 3,
  width: 12,
  shoulder: 2.6,
  surface: 'road',
  offroadMax: 10,
  offroadDrag: 2.4,
  points: [
    [0, 0], [80, 6], [150, 20], [180, 70],      // 오프닝: 동쪽 → 북쪽 스윕
    [150, 120], [80, 140], [0, 130],            // 정상 플라토 (간헐천 지대)
    [-70, 145], [-140, 130], [-175, 90],        // 북서 코너
    [-185, 45], [-160, 25], [-110, 20],         // 레벨1: 동쪽으로
    [-85, 10], [-80, -10], [-105, -20],         // 헤어핀 A (180° → 서쪽)
    [-160, -28], [-185, -45],                   // 레벨2: 서쪽
    [-195, -80], [-170, -95], [-135, -85],      // 헤어핀 B (180° → 동쪽)
    [-90, -75], [-40, -80],                     // 레벨3: 동쪽으로
    [10, -95], [60, -110],                      // 용암 다리 구간
    [120, -120], [170, -95],                    // 하강 커브
    [185, -45], [150, -22], [90, -22], [30, -26],
    [-47.5, -43], [-58, -20],                   // 복귀 — 이음새 스무딩 (스폰존 r3→r12, 유턴 apex를 출발선 서쪽으로)
  ],
  // 이음새 스무딩(2026-07-08)으로 L 1644→1733 — 모든 t 앵커에 ×0.9484 적용 (월드 위치 보존)
  boostPads: [
    { t: 0.480, len: 0.014 }, // 헤어핀 A 탈출
    { t: 0.591, len: 0.014 }, // 헤어핀 B 탈출
    { t: 0.742, len: 0.016 }, // 하강 직선
  ],
  // 다리 직전 점프대 — 타면 타이밍 무관하게 다리(0.676~0.707) 전체를 날아서 보장 크로싱
  jumpPads: [{ t: 0.658, len: 0.012, lane: 0, w: 0.45, launchTo: 0.712 }],
  pits: [],
  itemRows: [
    { t: 0.157, lanes: [-0.6, 0, 0.6] },
    { t: 0.436, lanes: [-0.6, 0, 0.6] },
    { t: 0.646, lanes: [-0.6, 0, 0.6] },
    { t: 0.865, lanes: [-0.6, 0, 0.6] },
  ],
  gimmicks: [
    { type: 'sinkroad', t0: 0.676, t1: 0.707, period: 9, duty: 0.55 },
    { type: 'geyser', t: 0.199, lane: -0.4, period: 6, warnSec: 1 },
    { type: 'geyser', t: 0.247, lane: 0.4, period: 7.5, warnSec: 1 },
    { type: 'hammer', t: 0.775, lane: -0.25, period: 3.4 },
    { type: 'hammer', t: 0.805, lane: 0.25, period: 4.2 },
    // 헤어핀 A 스킵 용암재 늪길 (절약 50u) — 무부스트 +0.6s 손해 / 풀부스터 -2.9s 이득
    { type: 'shortcut', entryT: 0.436, exitT: 0.512, via: [[-105, -2], [-130, -14], [-148, -20]], width: 5, swamp: [0.2, 0.85] },
  ],
  decorSeed: 83,
  theme: {
    sky: 0xff8a5c, fog: 0x9a5340, fogDensity: 0.0019,
    ground: 0x4a3a34, road: 0x575055, curbA: 0xff5a26, curbB: 0x2b2226,
    rail: 0x6b5a55, railAccent: 0xff5a26,
    line: 0xffd9b0, sun: 0xffb37a, sunIntensity: 1.1, ambient: 0.8,
  },
}
