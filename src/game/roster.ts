// Character & kart rosters — independent, mix-and-match.
// Stats are ADDITIVE points: final = 100(base) + character bonus + kart bonus.
// Physics uses statsToMultipliers (1 point = +1%).

export type HatType = 'helmet' | 'cap' | 'ribbon' | 'sunglasses' | 'antenna'

export interface StatPoints {
  speed: number
  accel: number
  grip: number
  gauge: number
}

export interface KartStats {
  speed: number // multipliers used by physics
  accel: number
  grip: number
  gauge: number
}

export interface CharacterDef {
  id: string
  name: string // English
  nameKo: string
  suit: number // suit/helmet color
  skin: number
  hat: HatType
  emoji: string // for UI cards
  stats: StatPoints // additive bonus points
  tagline: string
  taglineEn: string
}

// All characters sum to 0 points — balance comes purely from distribution (5-unit grid).
export const CHARACTERS: CharacterDef[] = [
  {
    id: 'moka', name: 'Moka', nameKo: '모카', suit: 0xffe14d, skin: 0xffd9b3, hat: 'cap', emoji: '🧢',
    stats: { speed: 0, accel: 0, grip: 0, gauge: 0 }, tagline: '밸런스', taglineEn: 'Balanced',
  },
  {
    id: 'coco', name: 'Coco', nameKo: '코코', suit: 0xff5d8a, skin: 0xffd9b3, hat: 'ribbon', emoji: '🎀',
    stats: { speed: -5, accel: 0, grip: 0, gauge: 5 }, tagline: '게이지 +5 · 속도 -5', taglineEn: 'Gauge +5 · Speed -5',
  },
  {
    id: 'pico', name: 'Pico', nameKo: '피코', suit: 0x4aa8ff, skin: 0xffe3c4, hat: 'helmet', emoji: '🪖',
    stats: { speed: -5, accel: 0, grip: 5, gauge: 0 }, tagline: '드리프트 +5 · 속도 -5', taglineEn: 'Drift +5 · Speed -5',
  },
  {
    id: 'lime', name: 'Lime', nameKo: '라임', suit: 0x84e063, skin: 0xf2c9a0, hat: 'sunglasses', emoji: '🕶️',
    stats: { speed: 5, accel: 0, grip: -5, gauge: 0 }, tagline: '속도 +5 · 드리프트 -5', taglineEn: 'Speed +5 · Drift -5',
  },
  {
    id: 'toto', name: 'Toto', nameKo: '토토', suit: 0xff8c2e, skin: 0xffd9b3, hat: 'antenna', emoji: '📡',
    stats: { speed: -5, accel: 5, grip: 0, gauge: 0 }, tagline: '가속 +5 · 속도 -5', taglineEn: 'Accel +5 · Speed -5',
  },
]

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]
}

export interface KartDef {
  id: string // network id (kept stable for protocol)
  name: string // English
  nameKo: string
  model: string // GLB in public/models/ — each kart is a DIFFERENT body
  modelYaw: number // yaw to make the model face +Z (sources vary)
  size: number // target body length (world units) — tune freely
  hover?: boolean // no wheels — floats with a bob
  stripBase?: boolean // remove baked-in display mat (only for models that have one)
  ui: string // css color matching the body (minimap dots / UI chips)
  stats: StatPoints
  tagline: string
  taglineEn: string
  riderPos: [number, number, number]
  riderScale: number
}

// ============================================================================
// 카트 차고 — 스탯 수정 가이드
//   stats: { speed, accel, grip, gauge }  ← 이 숫자만 바꾸면 됩니다.
//   컨벤션: 5단위 / 4개 합계 +10 권장 (모든 카트 총점 동일 = 밸런스)
//   speed=최고속도, accel=가속, grip=드리프트 안정성, gauge=부스터 게이지 충전
//   1포인트 = +1% (물리에 곱연산으로 반영)
// ============================================================================
function kart(
  id: string,
  name: string,
  nameKo: string,
  model: string,
  modelYaw: number,
  size: number,
  ui: string,
  stats: StatPoints,
  riderPos: [number, number, number],
  riderScale: number,
  opts: { hover?: boolean; stripBase?: boolean } = {},
): KartDef {
  const tag = `S${stats.speed} A${stats.accel} D${stats.grip} G${stats.gauge}`
  return {
    id, name, nameKo, model, modelYaw, size, hover: opts.hover, stripBase: opts.stripBase,
    ui, stats, tagline: tag, taglineEn: tag, riderPos, riderScale,
  }
}

const Y = Math.PI // 180°
const Y2 = Math.PI / 2 // 90°

export const KARTS: KartDef[] = [
  //   id        name        한글이름     model glb                 yaw  크기   UI색      { speed, accel, grip, gauge }                라이더 위치        크기   옵션
  kart('red',    'Spark R',  '스파크 R',  'karts/formula',          Y2, 1.2,  '#e04438', { speed: 5,   accel: 5,  grip: 0,  gauge: 0 },  [0, 0.42, -0.18], 0.62),
  kart('green',  'Turbo G',  '터보 G',    'karts/gokart',            0, 2.4,  '#3a6df0', { speed: -5,  accel: 10, grip: 5,  gauge: 0 },  [0, 0.28, -0.05], 0.6),
  kart('orange', 'Max O',    '맥스 O',    'karts/hotrod',          -Y2, 1.68, '#9fe8d9', { speed: 10,  accel: -5, grip: 0,  gauge: 5 },  [0, 1.18, -0.5],  0.55),
  kart('white',  'Comet X',  '코멧 X',    'karts/kartred',          Y2, 1.2,  '#ff8c5a', { speed: -10, accel: 0,  grip: 10, gauge: 10 }, [0, 0.52, -0.1],  0.62, { stripBase: true }),
  kart('race',   'Racer K',  '레이서 K',  'karts/race',              0, 2.4,  '#ff5d4d', { speed: 5,   accel: 0,  grip: 5,  gauge: 0 },  [0, 0.35, -0.3],  0.75),
  kart('hatch',  'Dash H',   '대시 H',    'karts/hatchback-sports',  0, 2.4,  '#43c463', { speed: 0,   accel: 10, grip: 0,  gauge: 0 },  [0, 0.62, -0.25], 0.72),
  kart('muscle', 'Boss M',   '보스 M',    'karts/sedan-sports',      0, 2.4,  '#ff9d2e', { speed: 10,  accel: 0,  grip: -5, gauge: 5 },  [0, 0.55, -0.35], 0.72),
  kart('future', 'Nova F',   '노바 F',    'karts/race-future',       0, 2.4,  '#4a8dff', { speed: -5,  accel: 5,  grip: 5,  gauge: 5 },  [0, 0.5, -0.25],  0.72),
  kart('boxy',   'Boxy B',   '박시 B',    'karts/boxkart',           Y, 1.92, '#c0392b', { speed: -10, accel: 15, grip: 5,  gauge: 0 },  [0, 1.0, -0.15],  0.55),
  kart('hover',  'Volt V',   '볼트 V',    'karts/hover',             0, 2.4,  '#b33960', { speed: -5,  accel: 0,  grip: 15, gauge: 0 },  [0, 0.42, -0.1],  0.5,  { hover: true, stripBase: true }),
  kart('sporty', 'Zoom Z',   '줌 Z',      'karts/sportscar',         0, 2.4,  '#d8e6f2', { speed: 15,  accel: -5, grip: 0,  gauge: 0 },  [0, 0.78, -0.15], 0.58, { stripBase: true }),
  kart('sedan',  'AE86',     'AE86',      'karts/sedan',             0, 2.4,  '#8fb8c9', { speed: 0,   accel: 0,  grip: 5,  gauge: 5 },  [0, 0.42, -0.15], 0.6),
]

export function getKart(id: string): KartDef {
  return KARTS.find((k) => k.id === id) ?? KARTS[0]
}

// Final stats = base 100 + character points + kart points (additive)
export function combinePoints(char: CharacterDef, kart: KartDef): StatPoints {
  return {
    speed: char.stats.speed + kart.stats.speed,
    accel: char.stats.accel + kart.stats.accel,
    grip: char.stats.grip + kart.stats.grip,
    gauge: char.stats.gauge + kart.stats.gauge,
  }
}

export function pointsToMultipliers(p: StatPoints): KartStats {
  return {
    speed: 1 + p.speed / 100,
    accel: 1 + p.accel / 100,
    grip: 1 + p.grip / 100,
    gauge: 1 + p.gauge / 100,
  }
}

export function combineStats(char: CharacterDef, kart: KartDef): KartStats {
  return pointsToMultipliers(combinePoints(char, kart))
}
