// Ambient atmosphere particles — per-course weather/mood motes that drift
// around the camera (volcanic ash, snow, fireflies, sparks...). Purely
// visual and local; never affects physics or sync.
import * as THREE from 'three'
import { preset } from './perf'

interface AmbientConf {
  color: number
  size: number
  fall: number // +아래로 떨어짐 / -위로 떠오름 (units/s)
  drift: number // 수평 흔들림 강도
  opacity: number
  additive?: boolean // 발광 입자 (재/반딧불/스파크)
  yMax?: number
}

const CONFS: Record<string, AmbientConf> = {
  volcano: { color: 0xffa050, size: 0.6, fall: 1.4, drift: 1.4, opacity: 0.85, additive: true }, // 화산재 불씨
  ice: { color: 0xffffff, size: 0.55, fall: 2.4, drift: 0.8, opacity: 0.95 }, // 눈
  jungle: { color: 0xb6ff7a, size: 0.45, fall: -0.18, drift: 0.6, opacity: 0.8, additive: true, yMax: 9 }, // 반딧불
  canyon: { color: 0xd8b890, size: 0.5, fall: 0.35, drift: 3.0, opacity: 0.45 }, // 모래먼지
  neon: { color: 0x57e6ff, size: 0.42, fall: 2.6, drift: 0.4, opacity: 0.65, additive: true }, // 네온 비
  beach: { color: 0xfff0c0, size: 0.38, fall: 0.25, drift: 1.6, opacity: 0.5 }, // 햇살 모트
  factory: { color: 0xffd070, size: 0.4, fall: -0.5, drift: 0.9, opacity: 0.7, additive: true, yMax: 12 }, // 떠오르는 불꽃
  sunny: { color: 0xffffff, size: 0.36, fall: 0.45, drift: 1.1, opacity: 0.5 }, // 꽃가루
  sky: { color: 0xffffff, size: 0.7, fall: 0.2, drift: 2.6, opacity: 0.45 }, // 흘러가는 구름 결
}

const RANGE = 55 // 카메라 주변 박스 반경

// 부드러운 원형 점 텍스처 (정사각 PointsMaterial 기본형 방지)
let dotTex: THREE.Texture | null = null
function getDotTexture(): THREE.Texture {
  if (dotTex) return dotTex
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const ctx = c.getContext('2d')!
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.6)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 32, 32)
  dotTex = new THREE.CanvasTexture(c)
  return dotTex
}

export class AmbientFX {
  points: THREE.Points | null = null
  private vel: Float32Array = new Float32Array(0)
  private sway: Float32Array = new Float32Array(0)
  private conf: AmbientConf | null = null
  private t = 0

  constructor(courseId: string) {
    const conf = CONFS[courseId]
    if (!conf) return
    this.conf = conf
    const n = Math.max(24, Math.round(110 * preset().particleScale))
    const pos = new Float32Array(n * 3)
    this.vel = new Float32Array(n * 3)
    this.sway = new Float32Array(n)
    const yMax = conf.yMax ?? 26
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * RANGE
      pos[i * 3 + 1] = Math.random() * yMax
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * RANGE
      this.vel[i * 3] = (Math.random() - 0.5) * conf.drift
      this.vel[i * 3 + 1] = -conf.fall * (0.6 + Math.random() * 0.8)
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * conf.drift
      this.sway[i] = Math.random() * Math.PI * 2
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({
      color: conf.color,
      size: conf.size,
      map: getDotTexture(),
      transparent: true,
      opacity: conf.opacity,
      depthWrite: false,
      blending: conf.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
  }

  /** 매 프레임 — center(카메라) 주변 박스로 입자를 재순환 */
  update(dt: number, center: THREE.Vector3) {
    if (!this.points || !this.conf) return
    this.t += dt
    const attr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    const yMax = this.conf.yMax ?? 26
    const n = arr.length / 3
    for (let i = 0; i < n; i++) {
      const j = i * 3
      arr[j] += (this.vel[j] + Math.sin(this.t * 1.3 + this.sway[i]) * this.conf.drift * 0.4) * dt
      arr[j + 1] += this.vel[j + 1] * dt
      arr[j + 2] += this.vel[j + 2] * dt
      // 박스 밖으로 나가면 반대편에서 재진입
      if (arr[j] < center.x - RANGE) arr[j] += RANGE * 2
      else if (arr[j] > center.x + RANGE) arr[j] -= RANGE * 2
      if (arr[j + 2] < center.z - RANGE) arr[j + 2] += RANGE * 2
      else if (arr[j + 2] > center.z + RANGE) arr[j + 2] -= RANGE * 2
      if (arr[j + 1] < 0) arr[j + 1] += yMax
      else if (arr[j + 1] > yMax + 2) arr[j + 1] -= yMax
    }
    attr.needsUpdate = true
  }
}
