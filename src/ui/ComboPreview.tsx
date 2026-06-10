import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Assets, makeRider } from '../game/assets'
import { getCharacter, getKart, combinePoints } from '../game/roster'

const STAT_LABELS: { key: 'speed' | 'accel' | 'grip' | 'gauge'; label: string }[] = [
  { key: 'speed', label: '최고속도' },
  { key: 'accel', label: '가속' },
  { key: 'grip', label: '드리프트' },
  { key: 'gauge', label: '게이지' },
]

// additive points land in ~-10..+24 — map onto a readable bar (0pt = center)
function barWidth(points: number): string {
  return `${Math.round(THREE.MathUtils.clamp(((points + 15) / 40) * 100, 8, 100))}%`
}

function fmtPts(s: { speed: number; accel: number; grip: number; gauge: number }): string {
  const sum = s.speed + s.accel + s.grip + s.gauge
  return sum > 0 ? `+${sum}` : `${sum}`
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
    const kart = getKart(kartId)
    const char = getCharacter(charId)
    const model = assets.spawn(kart.model, 2.4, 'z')
    if (model) group.add(model)
    const rider = makeRider(char)
    rider.scale.setScalar(kart.riderScale)
    rider.position.set(...kart.riderPos)
    group.add(rider)
  }, [assets, charId, kartId])

  const char = getCharacter(charId)
  const kart = getKart(kartId)
  const points = combinePoints(char, kart)

  return (
    <div className="card combo">
      <div className="combo-left">
        <canvas ref={canvasRef} className="combo-canvas" />
        <p className="combo-name">
          <b>{char.nameKo}</b> × <b>{kart.nameKo}</b>
        </p>
      </div>
      <div className="combo-stats">
        <h4>최종 스탯</h4>
        {STAT_LABELS.map(({ key, label }) => (
          <div key={key} className="stat-row">
            <span className="stat-label">{label}</span>
            <span className="stat-track">
              <i style={{ width: barWidth(points[key]) }} />
              <em className="stat-base" />
            </span>
            <span className={`stat-val ${points[key] > 0 ? 'up' : points[key] < 0 ? 'down' : ''}`}>
              {100 + points[key]}
            </span>
          </div>
        ))}
        <p className="dim combo-hint">
          최종 = 100 + 캐릭터({fmtPts(char.stats)}) + 카트({fmtPts(kart.stats)})
        </p>
      </div>
    </div>
  )
}
