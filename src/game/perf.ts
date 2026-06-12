// src/game/perf.ts — 품질 자동 감지 + 수동 오버라이드 (localStorage)
export type Quality = 'low' | 'mid' | 'high'

export interface QualityPreset {
  pixelRatio: number // devicePixelRatio 상한
  particleScale: number // MAX_PARTICLES 배율
  decorScale: number // 풍경 데코 밀도 배율
  gimmickCullDist: number // 이 거리 밖 기믹은 시각 갱신 생략
}

export const PRESETS: Record<Quality, QualityPreset> = {
  low: { pixelRatio: 1, particleScale: 0.5, decorScale: 0.5, gimmickCullDist: 90 },
  mid: { pixelRatio: 1.5, particleScale: 0.75, decorScale: 0.8, gimmickCullDist: 140 },
  high: { pixelRatio: 2, particleScale: 1, decorScale: 1, gimmickCullDist: 220 },
}

function detect(): Quality {
  // node/vitest에는 navigator가 없다 — 테스트 체인에서 안전해야 함
  if (typeof navigator === 'undefined') return 'high'
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
  const cores = navigator.hardwareConcurrency ?? 4
  if (mobile && cores <= 4) return 'low'
  if (mobile || cores <= 4) return 'mid'
  return 'high'
}

function loadStored(): Quality | null {
  if (typeof localStorage === 'undefined') return null
  const stored = localStorage.getItem('v8kart_quality')
  return stored && stored in PRESETS ? (stored as Quality) : null
}

let quality: Quality = loadStored() ?? detect()

export function getQuality(): Quality {
  return quality
}

export function setQuality(q: Quality) {
  quality = q
  localStorage.setItem('v8kart_quality', q)
}

export function preset(): QualityPreset {
  return PRESETS[quality]
}
