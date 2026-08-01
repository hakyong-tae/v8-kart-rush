import { useEffect, useRef } from 'react'
import type { Game, HudSnapshot } from '../game/Game'

/**
 * 모바일 컨트롤 — 왼쪽 플로팅 아날로그 조이스틱 + 오른쪽 드리프트/아이템 버튼.
 *   조이스틱: 좌우=조향, 12시(위)=부스터, 6시(아래)=브레이크, 중립=자동 전진.
 *   오른쪽: DRIFT(홀드) + 아이템전 아이템 버튼.
 */
export function TouchControls({
  gameRef,
  raceMode,
  snap,
}: {
  gameRef: React.MutableRefObject<Game | null>
  raceMode: 'speed' | 'item'
  snap: HudSnapshot | null
}) {
  const zoneRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const active = useRef(false)
  const base = useRef({ x: 0, y: 0 })
  const vec = useRef({ dx: 0, dy: 0 }) // 반경 R로 클램프된 조이스틱 벡터
  const R = 62

  // 매 틱 입력 반영 (손가락을 움직이지 않고 밀고 있어도 유지)
  useEffect(() => {
    const iv = setInterval(() => {
      const inp = gameRef.current?.input
      if (!inp) return
      inp.touch.active = true
      if (active.current) {
        const nx = vec.current.dx / R
        const ny = vec.current.dy / R
        inp.touch.steer = Math.max(-1, Math.min(1, -nx)) // 오른쪽 밀면 우회전
        inp.touch.throttle = ny > 0.4 ? -1 : 1 // 아래=브레이크, 그 외=자동 전진
        if (raceMode === 'speed' && ny < -0.5) inp.state.useItem = true // 위=부스터
      } else {
        inp.touch.steer = 0
        inp.touch.throttle = 1 // 중립: 자동 전진
      }
    }, 50)
    return () => {
      clearInterval(iv)
      const inp = gameRef.current?.input
      if (inp) inp.touch.active = false
    }
  }, [gameRef, raceMode])

  const showBase = (x: number, y: number) => {
    const b = baseRef.current
    if (b) {
      b.style.left = `${x}px`
      b.style.top = `${y}px`
      b.style.opacity = '1'
    }
    moveKnob(0, 0)
  }
  const moveKnob = (dx: number, dy: number) => {
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`
  }
  const hideBase = () => {
    if (baseRef.current) baseRef.current.style.opacity = '0'
  }

  const capture = (el: HTMLElement | null, id: number) => {
    try {
      el?.setPointerCapture?.(id)
    } catch {
      /* 합성 이벤트/비활성 포인터에서 예외 무시 */
    }
  }
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault()
    active.current = true
    base.current = { x: e.clientX, y: e.clientY }
    vec.current = { dx: 0, dy: 0 }
    showBase(e.clientX, e.clientY)
    capture(zoneRef.current, e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!active.current) return
    let dx = e.clientX - base.current.x
    let dy = e.clientY - base.current.y
    const m = Math.hypot(dx, dy)
    if (m > R) {
      dx = (dx / m) * R
      dy = (dy / m) * R
    }
    vec.current = { dx, dy }
    moveKnob(dx, dy)
  }
  const endJoy = () => {
    active.current = false
    vec.current = { dx: 0, dy: 0 }
    hideBase()
  }

  const setDrift = (v: boolean) => {
    const inp = gameRef.current?.input
    if (inp) inp.touch.drift = v
  }
  const fireItem = () => {
    const inp = gameRef.current?.input
    if (inp) inp.state.useItem = true
  }
  const hasItem = raceMode === 'item' && !!snap?.items?.some((i) => i)
  const holdBtn = (on: () => void, off: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      on()
      capture(e.target as HTMLElement, e.pointerId)
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault()
      off()
    },
    onPointerCancel: () => off(),
    onLostPointerCapture: () => off(),
  })

  return (
    <div className="touch-controls">
      {/* 왼쪽: 만지는 위치에 뜨는 플로팅 조이스틱 */}
      <div
        ref={zoneRef}
        className="tc-joyzone"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={endJoy}
        onPointerCancel={endJoy}
        onLostPointerCapture={endJoy}
      >
        <div ref={baseRef} className="tc-joy-base" style={{ opacity: 0 }}>
          <span className="tc-joy-mark up">🚀</span>
          <span className="tc-joy-mark down">◇</span>
          <div ref={knobRef} className="tc-joy-knob" />
        </div>
      </div>

      {/* 오른쪽: 아이템(아이템전) + 드리프트 */}
      <div className="tc-right">
        {raceMode === 'item' && (
          <button
            className={`tc-btn tc-item ${hasItem ? 'hot' : ''}`}
            aria-label="item"
            onPointerDown={(e) => {
              e.preventDefault()
              fireItem()
            }}
          >
            🎁
          </button>
        )}
        <button
          className="tc-btn tc-drift"
          aria-label="drift"
          {...holdBtn(
            () => setDrift(true),
            () => setDrift(false),
          )}
        >
          DRIFT
        </button>
      </div>
    </div>
  )
}
