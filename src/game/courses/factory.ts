// src/game/courses/factory.ts — 공장 내부: 직각 코너 + 시케인 + 컨베이어 + 프레스
// 레이아웃 사전 검증: minSep 32.4 (필요 ≥ 18.6)
import type { CourseDef } from './types'

export const factory: CourseDef = {
  id: 'factory',
  name: 'Gear Factory',
  nameKo: '기어 팩토리',
  difficulty: 2,
  laps: 3,
  width: 13,
  shoulder: 2.8,
  surface: 'road',
  offroadMax: 10,
  offroadDrag: 2.4,
  points: [
    [0, 0], [105, 0],                  // 스타트 직선 (순방향 컨베이어)
    [138, -18], [148, -60],            // 직각 SE
    [140, -105], [100, -125],          // 직각 S
    [45, -128],                        // 프레스 복도
    [-5, -110], [-25, -75],            // 시케인 ↑
    [-65, -60], [-105, -75],           // 시케인 ↓
    [-130, -110], [-170, -120],        // 남서 딥
    [-198, -85], [-195, -35],          // 직각 W
    [-170, 5], [-120, 18],             // 동쪽으로 (역방향 컨베이어)
    [-75, 8], [-45, 28],               // 슬라럼
    [-15, 12],                         // 클로즈
  ],
  boostPads: [
    { t: 0.597, len: 0.016 }, // 시케인 탈출
    { t: 0.945, len: 0.014 }, // 피니시 진입 (스폰 그리드 0.974~ 와 겹치지 않게)
  ],
  jumpPads: [],
  pits: [],
  itemRows: [
    { t: 0.2, lanes: [-0.6, 0, 0.6] },
    { t: 0.641, lanes: [-0.6, 0, 0.6] },
    { t: 0.94, lanes: [-0.6, 0, 0.6] },
  ],
  gimmicks: [
    { type: 'conveyor', t0: 0.011, t1: 0.101, dir: 1, push: 7 },
    { type: 'conveyor', t0: 0.852, t1: 0.9, dir: -1, push: 5 },
    { type: 'press', t: 0.298, lane: -0.35, period: 2.6 },
    { type: 'press', t: 0.331, lane: 0.35, period: 3.4 },
    { type: 'press', t: 0.357, lane: 0, period: 3.0 },
    { type: 'crates', t: 0.458, lane: 0.5, count: 4 },
    { type: 'crates', t: 0.504, lane: -0.5, count: 3 },
  ],
  decorSeed: 91,
  theme: {
    sky: 0x39404f, fog: 0x4a5160, fogDensity: 0.0022,
    ground: 0x2f333d, road: 0x52555f, curbA: 0xffc81e, curbB: 0x26233a,
    rail: 0xb8bcc8, railAccent: 0xffc81e,
    line: 0xfff3b0, sun: 0xdfe6ff, sunIntensity: 0.9, ambient: 0.85,
  },
}
