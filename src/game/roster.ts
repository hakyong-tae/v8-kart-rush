// Character & kart rosters — independent, mix-and-match.
//
// MK8식 7스탯 모델 (2026-06 밸런스 기획 확정):
//   보이는 4스탯 (UI): 속도 speed · 가속 accel · 핸들 handling · 드리프트 drift
//   숨은 3스탯 (차체/플레이 느낌으로 짐작): 무게 weight · 미니터보 miniturbo · 무적 invinc
//
// 밸런스 규칙:
//   - 카트: 1~10 스케일, "보이는 4스탯 합 = 24" 전 카트 고정 (UI 공정성)
//     클래스 개성(Light/Medium/Heavy)은 숨은 스탯이 담당 — MK8 대각선:
//     Light = 민첩/터보 ↔ Heavy = 무게/무적. 숨은 합은 클래스별로 약간 다름(허용).
//   - 캐릭터: 카트 값에 더해지는 보정. 보이는 4합 = 0, 숨은 3합 = +2 (전원 동일 황벨)
//   - 6 = 중립(×1.00). 물리 환산은 pointsToMultipliers 참조.

export type HatType = 'helmet' | 'cap' | 'ribbon' | 'sunglasses' | 'antenna'

/** 7스탯 — 카트는 절대값(1~10), 캐릭터는 보정치(-2~+2) */
export interface StatPoints {
  speed: number
  accel: number
  handling: number // 일반 코너링 정확도 (안 미끄러짐)
  drift: number // 드리프트 제어/안정성
  weight: number // [숨김] 충돌에서 밀어냄/안 밀림
  miniturbo: number // [숨김] 드리프트 충전·릴리스 부스트·게이지
  invinc: number // [숨김] 스핀 짧게 + 피격 후 무적창
}

/** 물리 엔진이 소비하는 최종 배율/파라미터 */
export interface KartStats {
  speed: number // 최고속도 배율
  accel: number // 가속 배율
  handling: number // 일반 그립 배율
  drift: number // 드리프트 그립 배율
  gauge: number // 게이지 충전 배율 (miniturbo)
  boost: number // 릴리스 부스트 지속 배율 (miniturbo)
  mass: number // 카트끼리 충돌 질량 (weight)
  spin: number // 스핀 시간 배율 (invinc — 낮을수록 빨리 회복)
  grace: number // 피격 후 무적 시간(초) (invinc)
}

export interface CharacterDef {
  id: string
  name: string
  nameKo: string
  suit: number
  skin: number
  hat: HatType
  emoji: string
  stats: StatPoints // 보정치
  tagline: string
  taglineEn: string
}

// 캐릭터 보정 — 보이는 4합 0, 숨은 3합 +2 (전원 총합 +2)
export const CHARACTERS: CharacterDef[] = [
  {
    id: 'moka', name: 'Moka', nameKo: '모카', suit: 0xffe14d, skin: 0xffd9b3, hat: 'cap', emoji: '🧢',
    stats: { speed: 0, accel: 0, handling: 0, drift: 0, weight: 1, miniturbo: 0, invinc: 1 },
    tagline: '밸런스', taglineEn: 'Balanced',
  },
  {
    id: 'coco', name: 'Coco', nameKo: '코코', suit: 0xff5d8a, skin: 0xffd9b3, hat: 'ribbon', emoji: '🎀',
    stats: { speed: -1, accel: -1, handling: 0, drift: 2, weight: 0, miniturbo: 2, invinc: 0 },
    tagline: '터보', taglineEn: 'Turbo',
  },
  {
    id: 'pico', name: 'Pico', nameKo: '피코', suit: 0x4aa8ff, skin: 0xffe3c4, hat: 'helmet', emoji: '🪖',
    stats: { speed: -1, accel: -1, handling: 2, drift: 0, weight: 0, miniturbo: 0, invinc: 2 },
    tagline: '안정', taglineEn: 'Steady',
  },
  {
    id: 'lime', name: 'Lime', nameKo: '라임', suit: 0x84e063, skin: 0xf2c9a0, hat: 'sunglasses', emoji: '🕶️',
    stats: { speed: 2, accel: 0, handling: -1, drift: -1, weight: 1, miniturbo: 1, invinc: 0 },
    tagline: '스피드', taglineEn: 'Speed',
  },
  {
    id: 'toto', name: 'Toto', nameKo: '토토', suit: 0xff8c2e, skin: 0xffd9b3, hat: 'antenna', emoji: '📡',
    stats: { speed: -1, accel: 2, handling: -1, drift: 0, weight: 0, miniturbo: 1, invinc: 1 },
    tagline: '가속', taglineEn: 'Accel',
  },
]

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]
}

export type WeightClass = 'light' | 'medium' | 'heavy'

export interface KartDef {
  id: string
  name: string
  nameKo: string
  model: string
  modelYaw: number
  size: number
  hover?: boolean
  stripBase?: boolean
  ui: string
  weightClass: WeightClass
  stats: StatPoints // 1~10 절대값 (보이는 4합 = 24)
  tagline: string
  taglineEn: string
  riderPos: [number, number, number]
  riderScale: number
}

// ============================================================================
// 카트 차고 — 스탯 수정 가이드
//   stats 7개 숫자만 바꾸면 됩니다 (1~10, 6=중립).
//   규칙: 보이는 4개(speed/accel/handling/drift) 합 = 24 고정.
//   숨은 3개(weight/miniturbo/invinc)는 클래스 개성 — Light 민첩/터보, Heavy 무게/무적.
// ============================================================================
function kart(
  id: string,
  name: string,
  nameKo: string,
  model: string,
  modelYaw: number,
  size: number,
  ui: string,
  weightClass: WeightClass,
  stats: StatPoints,
  riderPos: [number, number, number],
  riderScale: number,
  opts: { hover?: boolean; stripBase?: boolean } = {},
): KartDef {
  const tag = `S${stats.speed} A${stats.accel} H${stats.handling} D${stats.drift}`
  return {
    id, name, nameKo, model, modelYaw, size, hover: opts.hover, stripBase: opts.stripBase,
    ui, weightClass, stats, tagline: tag, taglineEn: tag, riderPos, riderScale,
  }
}

const Y = Math.PI
const Y2 = Math.PI / 2
const S = (
  speed: number, accel: number, handling: number, drift: number,
  weight: number, miniturbo: number, invinc: number,
): StatPoints => ({ speed, accel, handling, drift, weight, miniturbo, invinc })

export const KARTS: KartDef[] = [
  // ── Light: 민첩·터보형 (가볍고 충돌에 약함) ──────────────────────────────
  kart('red',    'Spark R',  '스파크 R',  'karts/formula',          Y2, 1.2,  '#e04438', 'light',  S(5, 7, 8, 4, 2, 7, 2), [0, 0.42, -0.18], 0.62),
  kart('white',  'Comet X',  '코멧 X',    'karts/kartred',          Y2, 1.2,  '#ff8c5a', 'light',  S(4, 6, 5, 9, 2, 9, 3), [0, 0.52, -0.1],  0.62, { stripBase: true }),
  kart('green',  'Turbo G',  '터보 G',    'karts/gokart',            0, 2.4,  '#3a6df0', 'light',  S(3, 9, 7, 5, 3, 8, 3), [0, 0.28, -0.05], 0.6),
  kart('hover',  'Volt V',   '볼트 V',    'karts/hover',             0, 2.4,  '#b33960', 'light',  S(4, 5, 9, 6, 1, 7, 4), [0, 0.42, -0.1],  0.5,  { hover: true, stripBase: true }),
  // ── Medium: 균형형 ───────────────────────────────────────────────────────
  kart('race',   'Racer K',  '레이서 K',  'karts/race',              0, 2.4,  '#ff5d4d', 'medium', S(6, 6, 6, 6, 5, 6, 5), [0, 0.35, -0.3],  0.75),
  kart('future', 'Nova F',   '노바 F',    'karts/race-future',       0, 2.4,  '#4a8dff', 'medium', S(6, 5, 6, 7, 4, 7, 5), [0, 0.5, -0.25],  0.72),
  kart('sporty', 'Zoom Z',   '줌 Z',      'karts/sportscar',         0, 2.4,  '#d8e6f2', 'medium', S(8, 5, 6, 5, 5, 5, 5), [0, 0.78, -0.15], 0.58, { stripBase: true }),
  kart('sedan',  'AE86',     'AE86',      'karts/sedan',             0, 2.4,  '#8fb8c9', 'medium', S(6, 4, 6, 8, 5, 8, 4), [0, 0.42, -0.15], 0.6),
  // ── Heavy: 무게·무적형 (충돌 탱크, 굼뜸) ────────────────────────────────
  kart('orange', 'Max O',    '맥스 O',    'karts/hotrod',          -Y2, 1.68, '#9fe8d9', 'heavy',  S(9, 4, 6, 5, 8, 4, 7), [0, 1.18, -0.5],  0.55),
  kart('hatch',  'Dash H',   '대시 H',    'karts/hatchback-sports',  0, 2.4,  '#43c463', 'heavy',  S(8, 6, 5, 5, 7, 4, 6), [0, 0.62, -0.25], 0.72),
  kart('muscle', 'Boss M',   '보스 M',    'karts/sedan-sports',      0, 2.4,  '#ff9d2e', 'heavy',  S(9, 5, 5, 5, 9, 3, 8), [0, 0.55, -0.35], 0.72),
  kart('boxy',   'Boxy B',   '박시 B',    'karts/boxkart',           Y, 1.92, '#c0392b', 'heavy',  S(8, 4, 6, 6, 10, 2, 7), [0, 1.0, -0.15],  0.55),
]

export function getKart(id: string): KartDef {
  return KARTS.find((k) => k.id === id) ?? KARTS[0]
}

/** 최종 스탯 = 카트(1~10) + 캐릭터 보정, 1~10 클램프 */
export function combinePoints(char: CharacterDef, kart: KartDef): StatPoints {
  const c = (v: number) => Math.max(1, Math.min(10, v))
  return {
    speed: c(kart.stats.speed + char.stats.speed),
    accel: c(kart.stats.accel + char.stats.accel),
    handling: c(kart.stats.handling + char.stats.handling),
    drift: c(kart.stats.drift + char.stats.drift),
    weight: c(kart.stats.weight + char.stats.weight),
    miniturbo: c(kart.stats.miniturbo + char.stats.miniturbo),
    invinc: c(kart.stats.invinc + char.stats.invinc),
  }
}

/**
 * 1~10 → 물리 배율. 6 = 중립.
 *   보이는 스탯: 1당 ±2.5% (범위 0.875 ~ 1.10)
 *   miniturbo: 게이지 ±5%/pt, 부스트 지속 ±6%/pt (단일 목적이라 체감 크게)
 *   weight: 질량 1 ± 0.12/pt (0.4 ~ 1.48)
 *   invinc: 스핀시간 ∓5%/pt, 피격 후 무적 0.5s ± 0.1s/pt
 */
export function pointsToMultipliers(p: StatPoints): KartStats {
  const m = (v: number, per: number) => 1 + (v - 6) * per
  return {
    speed: m(p.speed, 0.025),
    accel: m(p.accel, 0.025),
    handling: m(p.handling, 0.025),
    drift: m(p.drift, 0.025),
    gauge: m(p.miniturbo, 0.05),
    boost: m(p.miniturbo, 0.06),
    mass: m(p.weight, 0.12),
    spin: m(p.invinc, -0.05),
    grace: Math.max(0.2, 0.5 + (p.invinc - 6) * 0.1),
  }
}

export function combineStats(char: CharacterDef, kart: KartDef): KartStats {
  return pointsToMultipliers(combinePoints(char, kart))
}
