// 기기/화면 환경 감지 — 터치 컨트롤 표시 및 세로 레이아웃 판단에 사용.
// ?touch=1 쿼리로 데스크톱에서도 모바일 UI 미리보기 가능 (테스트/데모용).
export const isTouch =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window ||
    (navigator.maxTouchPoints ?? 0) > 0 ||
    /[?&]touch=1/.test(location.search))

export function isPortrait(): boolean {
  return typeof window !== 'undefined' && window.innerHeight > window.innerWidth
}
