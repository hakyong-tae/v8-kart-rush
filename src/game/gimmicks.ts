// Gimmick system — courses declare gimmicks as data, GimmickManager runs them.
// All moving parts are PURE FUNCTIONS of race time → every client / ghost / AI
// sees the same state with zero network sync.

export type GimmickDef =
  | { type: 'mud'; t0: number; t1: number; side?: 1 | -1 | 0 } // 감속 노면
  | { type: 'conveyor'; t0: number; t1: number; dir: 1 | -1; push: number } // 급류/벨트
  | { type: 'tide'; period: number; range: number } // 밀물/썰물 (open 맵 전용)
  | { type: 'bumper'; t: number; lane: number } // 핀볼 범퍼 (lane: halfWidth 비율 -1..1)
  | { type: 'crates'; t: number; lane: number; count: number } // 부서지는 상자
  | { type: 'turntable'; t: number; lane: number; radius: number; spin: number } // 회전 바닥 (rad/s)
  | { type: 'spinbar'; t: number; period: number } // 회전 바 (period: 1회전 초)
  | { type: 'teleport'; t: number; exitT: number } // 게이트 (같은 체크포인트 구간 내만!)
  | { type: 'rockfall'; t: number; lane: number; period: number; warnSec: number } // 낙석

/** 스플라인 t(0..1) 범위 판정 — 랩 경계(1→0) 래핑 지원 */
export function inSplineRange(tFrac: number, t0: number, t1: number): boolean {
  if (t0 <= t1) return tFrac >= t0 && tFrac <= t1
  return tFrac >= t0 || tFrac <= t1
}

/** 주기 위상 0..1 — 음수 시간(카운트다운 중)에도 안전 */
export function cyclePhase(raceSec: number, period: number): number {
  return ((raceSec % period) + period) % period / period
}

/** 회전 바 각도(rad) */
export function spinbarAngle(raceSec: number, period: number): number {
  return cyclePhase(raceSec, period) * Math.PI * 2
}
