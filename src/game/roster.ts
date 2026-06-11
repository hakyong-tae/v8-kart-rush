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
  hover?: boolean // no wheels — floats with a bob
  ui: string // css color matching the body (minimap dots / UI chips)
  stats: StatPoints
  tagline: string
  taglineEn: string
  riderPos: [number, number, number]
  riderScale: number
}

// All karts sum to +10 points — balance comes purely from distribution (5-unit grid).
export const KARTS: KartDef[] = [
  {
    id: 'red',
    name: 'Spark R',
    nameKo: '스파크 R',
    model: 'karts/formula', // detailed open-wheel F1 (scaranto, CC0)
    modelYaw: Math.PI,
    ui: '#e04438',
    stats: { speed: 5, accel: 5, grip: 0, gauge: 0 },
    tagline: '올라운드 (속도+5 가속+5)',
    taglineEn: 'All-round (Spd+5 Acc+5)',
    riderPos: [0, 0.42, -0.18],
    riderScale: 0.62,
  },
  {
    id: 'green',
    name: 'Turbo G',
    nameKo: '터보 G',
    model: 'karts/gokart', // proper go-kart, separated wheels (Zsky, CC-BY)
    modelYaw: Math.PI,
    ui: '#3a6df0',
    stats: { speed: -5, accel: 10, grip: 5, gauge: 0 },
    tagline: '가속 특화 (가속+10)',
    taglineEn: 'Acceleration (Acc+10)',
    riderPos: [0, 0.28, -0.05],
    riderScale: 0.6,
  },
  {
    id: 'orange',
    name: 'Max O',
    nameKo: '맥스 O',
    model: 'karts/hotrod', // exposed-engine hot rod (Chris Tarello, CC-BY)
    modelYaw: -Math.PI / 2,
    ui: '#9fe8d9',
    stats: { speed: 10, accel: -5, grip: 0, gauge: 5 },
    tagline: '최고속 특화 (속도+10)',
    taglineEn: 'Top speed (Spd+10)',
    riderPos: [0, 1.18, -0.5],
    riderScale: 0.55,
  },
  {
    id: 'white',
    name: 'Comet X',
    nameKo: '코멧 X',
    model: 'karts/kartred', // classic go-kart with pennant (Google Poly, CC-BY)
    modelYaw: 0,
    ui: '#ff8c5a',
    stats: { speed: -10, accel: 0, grip: 10, gauge: 10 },
    tagline: '드리프트 특화 (드리프트+10 게이지+10)',
    taglineEn: 'Drift (Drift+10 Gauge+10)',
    riderPos: [0, 0.52, -0.1],
    riderScale: 0.62,
  },
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
