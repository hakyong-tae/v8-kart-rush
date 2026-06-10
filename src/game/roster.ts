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
  nameKo: string
  suit: number // suit/helmet color
  skin: number
  hat: HatType
  emoji: string // for UI cards
  stats: StatPoints // additive bonus points
  tagline: string
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'moka', nameKo: '모카', suit: 0xffe14d, skin: 0xffd9b3, hat: 'cap', emoji: '🧢',
    stats: { speed: 0, accel: 0, grip: 0, gauge: 0 }, tagline: '밸런스',
  },
  {
    id: 'coco', nameKo: '코코', suit: 0xff5d8a, skin: 0xffd9b3, hat: 'ribbon', emoji: '🎀',
    stats: { speed: -1, accel: 0, grip: 0, gauge: 6 }, tagline: '게이지 +6',
  },
  {
    id: 'pico', nameKo: '피코', suit: 0x4aa8ff, skin: 0xffe3c4, hat: 'helmet', emoji: '🪖',
    stats: { speed: -2, accel: 0, grip: 5, gauge: 0 }, tagline: '드리프트 +5',
  },
  {
    id: 'lime', nameKo: '라임', suit: 0x84e063, skin: 0xf2c9a0, hat: 'sunglasses', emoji: '🕶️',
    stats: { speed: 3, accel: -2, grip: -2, gauge: 0 }, tagline: '속도 +3',
  },
  {
    id: 'toto', nameKo: '토토', suit: 0xff8c2e, skin: 0xffd9b3, hat: 'antenna', emoji: '📡',
    stats: { speed: -2, accel: 5, grip: 0, gauge: 0 }, tagline: '가속 +5',
  },
]

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]
}

export interface KartDef {
  id: string // network id (kept stable for protocol)
  nameKo: string
  model: string // GLB in public/models/ — each kart is a DIFFERENT body
  ui: string // css color matching the body (minimap dots / UI chips)
  stats: StatPoints
  tagline: string
  riderPos: [number, number, number]
  riderScale: number
}

export const KARTS: KartDef[] = [
  {
    id: 'red',
    nameKo: '스파크 R',
    model: 'race', // red open-wheel formula
    ui: '#ff5d4d',
    stats: { speed: 0, accel: 0, grip: 0, gauge: 0 },
    tagline: '밸런스',
    riderPos: [0, 0.35, -0.3],
    riderScale: 0.75,
  },
  {
    id: 'green',
    nameKo: '터보 G',
    model: 'hatchback-sports', // green hot hatch
    ui: '#43c463',
    stats: { speed: -3, accel: 9, grip: 2, gauge: 0 },
    tagline: '가속 +9',
    riderPos: [0, 0.62, -0.25],
    riderScale: 0.72,
  },
  {
    id: 'orange',
    nameKo: '맥스 O',
    model: 'sedan-sports', // orange muscle car
    ui: '#ff9d2e',
    stats: { speed: 4, accel: -7, grip: -3, gauge: 0 },
    tagline: '최고속 +4',
    riderPos: [0, 0.55, -0.35],
    riderScale: 0.72,
  },
  {
    id: 'white',
    nameKo: '코멧 X',
    model: 'race-future', // blue hover-style racer
    ui: '#4a8dff',
    stats: { speed: -1, accel: 0, grip: 7, gauge: 18 },
    tagline: '드리프트 +7 · 게이지 +18',
    riderPos: [0, 0.5, -0.25],
    riderScale: 0.72,
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
