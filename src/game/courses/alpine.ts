// src/game/courses/alpine.ts — 알파인 드롭: 산 정상에서 바닥까지 스키 활강 (P2P, 1랩)
// 루프가 아닌 포인트-투-포인트: 결승선 t=0.640, 이후는 숨은 복귀 레그(도로 미표시).
// 레이아웃 사전 검증: minSep 36.1, 전장 2110 (주행 구간 ~1350)
import type { CourseDef } from './types'

export const alpine: CourseDef = {
  id: 'alpine',
  name: 'Alpine Drop',
  nameKo: '알파인 드롭',
  difficulty: 2,
  laps: 1, // 다운힐 원런
  width: 15, // 넓은 슬로프
  shoulder: 3,
  surface: 'ice', // 설면 = 저그립 (스키 감각)
  offroadMax: 10,
  offroadDrag: 2.4,
  p2pFinishT: 0.64,
  ridge: true, // 산비탈 옆면
  points: [
    [0, 0], [90, -8], [160, -40],              // 정상 출발 직선 + 첫 카빙
    [175, -105], [130, -160], [50, -175],      // 와이드 헤어핀 좌 (레벨2)
    [-40, -165], [-115, -135],                 // 역방향 가로지르기 (슬라럼)
    [-165, -170], [-180, -235], [-125, -280],  // 헤어핀 우 (레벨3)
    [-30, -295], [60, -310],                   // 크레바스 직선
    [125, -345], [140, -405], [85, -450],      // 마지막 카빙
    [-10, -465], [-95, -455],                  // 피니시 활주로 (바닥)
    // ── 숨은 복귀 레그 (동쪽 멀리, 도로/레일 미표시 — 주행 불가) ──
    [-150, -420], [-200, -300], [-230, -150], [-215, 0], [-140, 60], [-50, 35],
  ],
  // 정상 55 → 바닥 0 활강. 숨은 레그가 다시 정상으로 올라간다(보이지 않음)
  elevation: [
    { t: 0, h: 55 }, { t: 0.06, h: 51 }, { t: 0.13, h: 43 },
    { t: 0.2, h: 35 }, { t: 0.27, h: 28 }, { t: 0.33, h: 22 },
    { t: 0.4, h: 15 }, { t: 0.46, h: 9 }, { t: 0.53, h: 4 },
    { t: 0.6, h: 1 }, { t: 0.66, h: 0 },
    { t: 0.78, h: 18 }, { t: 0.9, h: 42 }, { t: 0.97, h: 52 },
  ],
  boostPads: [
    { t: 0.043, len: 0.014 }, // 출발 직선
    { t: 0.397, len: 0.014 }, // 크레바스 직전 (점프 콤보용)
  ],
  jumpPads: [
    { t: 0.08, len: 0.012 },  // 첫 킥커
    { t: 0.489, len: 0.012 }, // 마지막 카빙 킥커
  ],
  pits: [],
  itemRows: [
    { t: 0.113, lanes: [-0.6, 0, 0.6] },
    { t: 0.297, lanes: [-0.6, 0, 0.6] },
    { t: 0.519, lanes: [-0.6, 0, 0.6] },
  ],
  gimmicks: [
    // 크레바스 — 주기적으로 벌어지는 빙하 균열 (빠지면 구조)
    { type: 'sinkroad', t0: 0.41, t1: 0.445, period: 7, duty: 0.62, floor: 0xbfe8ff },
    // 슬라럼 게이트 (상자 기문)
    { type: 'crates', t: 0.222, lane: -0.5, count: 3 },
    { type: 'crates', t: 0.234, lane: 0.5, count: 3 },
    { type: 'crates', t: 0.246, lane: -0.5, count: 3 },
  ],
  decorSeed: 57,
  theme: {
    sky: 0xa9d8ff, fog: 0xe8f4ff, fogDensity: 0.0016,
    ground: 0xf4f9fd, road: 0xdfe9f2, curbA: 0xff5d4d, curbB: 0x2b3a55,
    rail: 0xff7a3a, railAccent: 0xffffff, // 스키장 안전네트 주황
    line: 0x9fb8d0, sun: 0xffffff, sunIntensity: 1.35, ambient: 1.0,
  },
}
