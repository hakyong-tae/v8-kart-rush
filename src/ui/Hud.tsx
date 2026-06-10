import { useEffect, useRef } from 'react'
import type { HudSnapshot } from '../game/Game'
import { fmtTime } from '../util'

const ITEM_ICON: Record<string, string> = {
  boost: '🚀',
  missile: '🎯',
  trap: '🟣',
}

export function Hud({
  snap,
  outline,
  mode,
  raceMode,
}: {
  snap: HudSnapshot | null
  outline: { x: number; z: number }[]
  mode: 'time' | 'multi'
  raceMode: 'speed' | 'item'
}) {
  const mapRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = mapRef.current
    if (!cv || !snap || outline.length === 0) return
    const ctx = cv.getContext('2d')!
    const W = (cv.width = 150)
    const H = (cv.height = 150)
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity
    for (const p of outline) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z)
      maxZ = Math.max(maxZ, p.z)
    }
    const pad = 14
    const sc = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ))
    const tx = (x: number) => pad + (x - minX) * sc + (W - pad * 2 - (maxX - minX) * sc) / 2
    const tz = (z: number) => pad + (z - minZ) * sc + (H - pad * 2 - (maxZ - minZ) * sc) / 2
    ctx.clearRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'
    ctx.lineWidth = 5
    ctx.lineJoin = 'round'
    ctx.beginPath()
    outline.forEach((p, i) => {
      if (i === 0) ctx.moveTo(tx(p.x), tz(p.z))
      else ctx.lineTo(tx(p.x), tz(p.z))
    })
    ctx.closePath()
    ctx.stroke()
    for (const d of snap.dots) {
      ctx.beginPath()
      ctx.arc(tx(d.x), tz(d.z), d.self ? 5 : 4, 0, Math.PI * 2)
      ctx.fillStyle = d.self ? '#ffe14d' : d.color
      ctx.fill()
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }, [snap, outline])

  if (!snap) return null

  const cd = Math.ceil(snap.countdown)

  return (
    <div className="hud">
      {/* top-left: lap & times */}
      <div className="hud-panel hud-topleft">
        <div className="hud-lap">
          LAP <b>{snap.lap}</b>/{snap.totalLaps}
        </div>
        <div className="hud-time">⏱ {fmtTime(snap.totalMs)}</div>
        <div className="hud-time small">
          현재 랩 {fmtTime(snap.currentLapMs)}
          {snap.lapTimes.length > 0 && (
            <> · 베스트 {fmtTime(Math.min(...snap.lapTimes))}</>
          )}
        </div>
      </div>

      {/* top-right: rank (multi) */}
      {mode === 'multi' && (
        <div className="hud-panel hud-topright">
          <span className="hud-rank">{snap.rank}</span>
          <span className="hud-rank-total">/{snap.totalRacers}</span>
        </div>
      )}

      {/* item slot (item mode) */}
      {raceMode === 'item' && (
        <div className={`hud-item ${snap.item ? 'has' : ''}`}>
          {snap.item ? ITEM_ICON[snap.item] : ''}
        </div>
      )}

      {/* booster gauge (speed mode, KartRider-style) */}
      {raceMode === 'speed' && (
        <div className={`hud-gauge ${snap.boostGauge >= 1 ? 'full' : ''}`}>
          <div className="hud-gauge-fill" style={{ width: `${Math.round(snap.boostGauge * 100)}%` }} />
          <span className="hud-gauge-label">
            {snap.boostGauge >= 1 ? '⚡ 부스터 준비! (E/Ctrl)' : 'BOOST'}
          </span>
        </div>
      )}

      {/* speed lines while boosting */}
      {snap.boosting && <div className={`speedlines ${snap.boosterActive ? 'strong' : ''}`} />}

      {/* bottom-right: speed */}
      <div className="hud-speed">
        <b>{Math.round(snap.speed * 4.4)}</b> km/h
        {snap.boosting && <span className="hud-boost">BOOST!</span>}
        {snap.drifting && snap.driftTier > 0 && (
          <span className={`hud-drift t${snap.driftTier}`}>
            {snap.driftTier >= 2 ? '★★ TURBO' : '★ TURBO'}
          </span>
        )}
      </div>

      {/* minimap */}
      <canvas ref={mapRef} className="hud-map" />

      {/* center overlays */}
      {snap.phase === 'countdown' && (
        <div className="hud-center countdown">{cd > 3 ? '' : cd > 0 ? cd : 'GO!'}</div>
      )}
      {snap.phase === 'racing' && snap.countdown <= 0 && snap.totalMs < 1200 && (
        <div className="hud-center countdown go">GO!</div>
      )}
      {snap.wrongWay && <div className="hud-center wrongway">⟲ 반대 방향!</div>}
      {snap.finished && <div className="hud-center finish">FINISH!</div>}

      <div className="hud-controls">
        ↑↓←→ 주행 · Shift/Space 드리프트{' '}
        {raceMode === 'speed' ? '(게이지 충전) · E/Ctrl 부스터' : '· E/Ctrl 아이템'} · R 리셋
      </div>
    </div>
  )
}
