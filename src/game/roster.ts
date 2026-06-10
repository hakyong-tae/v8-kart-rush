// Character & kart rosters — independent, mix-and-match.
// Characters are pure cosmetics; karts carry small stat differences (KartRider-style).

export type HatType = 'helmet' | 'cap' | 'ribbon' | 'sunglasses' | 'antenna'

export interface CharacterDef {
  id: string
  nameKo: string
  suit: number // suit/helmet color
  skin: number
  hat: HatType
  emoji: string // for UI cards
}

export const CHARACTERS: CharacterDef[] = [
  { id: 'moka', nameKo: '모카', suit: 0xffe14d, skin: 0xffd9b3, hat: 'cap', emoji: '🧢' },
  { id: 'coco', nameKo: '코코', suit: 0xff5d8a, skin: 0xffd9b3, hat: 'ribbon', emoji: '🎀' },
  { id: 'pico', nameKo: '피코', suit: 0x4aa8ff, skin: 0xffe3c4, hat: 'helmet', emoji: '🪖' },
  { id: 'lime', nameKo: '라임', suit: 0x84e063, skin: 0xf2c9a0, hat: 'sunglasses', emoji: '🕶️' },
  { id: 'toto', nameKo: '토토', suit: 0xff8c2e, skin: 0xffd9b3, hat: 'antenna', emoji: '📡' },
]

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]
}

export interface KartStats {
  speed: number // top speed multiplier
  accel: number // acceleration multiplier
  grip: number // steering grip multiplier
  gauge: number // booster gauge charge rate multiplier
}

export interface KartDef {
  id: string // also the network color id (red/green/orange/white)
  nameKo: string
  model: 'raceCarRed' | 'raceCarGreen' | 'raceCarOrange' | 'raceCarWhite'
  ui: string // css color
  stats: KartStats
  tagline: string
}

export const KARTS: KartDef[] = [
  {
    id: 'red',
    nameKo: '스파크 R',
    model: 'raceCarRed',
    ui: '#ff5d4d',
    stats: { speed: 1.0, accel: 1.0, grip: 1.0, gauge: 1.0 },
    tagline: '밸런스형',
  },
  {
    id: 'green',
    nameKo: '터보 G',
    model: 'raceCarGreen',
    ui: '#43c463',
    stats: { speed: 0.97, accel: 1.09, grip: 1.02, gauge: 1.0 },
    tagline: '가속형',
  },
  {
    id: 'orange',
    nameKo: '맥스 O',
    model: 'raceCarOrange',
    ui: '#ff9d2e',
    stats: { speed: 1.04, accel: 0.93, grip: 0.97, gauge: 1.0 },
    tagline: '최고속형',
  },
  {
    id: 'white',
    nameKo: '코멧 W',
    model: 'raceCarWhite',
    ui: '#f2f2f2',
    stats: { speed: 0.99, accel: 1.0, grip: 1.07, gauge: 1.18 },
    tagline: '드리프트형',
  },
]

export function getKart(id: string): KartDef {
  return KARTS.find((k) => k.id === id) ?? KARTS[0]
}
