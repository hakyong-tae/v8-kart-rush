import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Assets } from '../game/assets'
import { getCharacter, getKart, combinePoints } from '../game/roster'
import { KartVisual } from '../game/kartVisual'
import { useI18n } from '../i18n'

const STAT_KEYS = [
  { key: 'speed', label: 'statSpeed' },
  { key: 'accel', label: 'statAccel' },
  { key: 'handling', label: 'statHandling' },
  { key: 'drift', label: 'statDrift' },
] as const

// 1~10 스케일 (6=중립) → 막대 폭
function barWidth(points: number): string {
  return `${Math.round(THREE.MathUtils.clamp((points / 10) * 100, 8, 100))}%`
}


export function ComboPreview({
  assets,
  charId,
  kartId,
}: {
  assets: Assets
  charId: string
  kartId: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const groupRef = useRef<THREE.Group | null>(null)
  const visRef = useRef<KartVisual | null>(null)

  // renderer/scene created once; the combo group is rebuilt on selection change
  useEffect(() => {
    const canvas = canvasRef.current!
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(250, 190, false)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 250 / 190, 0.1, 50)
    camera.position.set(2.8, 2.0, 3.6)
    camera.lookAt(0, 0.75, 0)
    scene.add(new THREE.HemisphereLight(0xbdd4ff, 0x4a4a66, 1.1))
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.2)
    sun.position.set(3, 5, 2)
    scene.add(sun)
    // soft ground disc
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 32),
      new THREE.MeshBasicMaterial({ color: 0x10142e, transparent: true, opacity: 0.55 }),
    )
    disc.rotation.x = -Math.PI / 2
    scene.add(disc)
    const group = new THREE.Group()
    scene.add(group)
    groupRef.current = group

    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      group.rotation.y += dt * 0.9
      // idle life: wheels creep, gentle steering wiggle
      visRef.current?.update(dt, 2.5, Math.sin(now * 0.0012) * 0.6, 0, false)
      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      groupRef.current = null
      renderer.dispose()
    }
  }, [])

  // rebuild the kart+rider combo when selection changes
  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    group.clear()
    const vis = new KartVisual(assets, kartId, charId)
    visRef.current = vis
    group.add(vis.group)
  }, [assets, charId, kartId])

  const { t, lang } = useI18n()
  const char = getCharacter(charId)
  const kart = getKart(kartId)
  const points = combinePoints(char, kart)

  return (
    <div className="card combo">
      <div className="combo-left">
        <canvas ref={canvasRef} className="combo-canvas" />
        <p className="combo-name">
          <b>{lang === 'ko' ? char.nameKo : char.name}</b> ×{' '}
          <b>{lang === 'ko' ? kart.nameKo : kart.name}</b>
        </p>
      </div>
      <div className="combo-stats">
        <h4>{t('finalStats')}</h4>
        {STAT_KEYS.map(({ key, label }) => (
          <div key={key} className="stat-row">
            <span className="stat-label">{t(label)}</span>
            <span className="stat-track">
              <i style={{ width: barWidth(points[key]) }} />
              <em className="stat-base" />
            </span>
            <span className={`stat-val ${points[key] > 6 ? 'up' : points[key] < 6 ? 'down' : ''}`}>
              {points[key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
