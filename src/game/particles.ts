// Sprite particle system using Kenney Particle Pack textures (CC0, public/fx/).
import * as THREE from 'three'
import { preset } from './perf'

const TEXTURES = {
  smokeA: 'fx/smoke_04.png',
  smokeB: 'fx/smoke_07.png',
  dirt: 'fx/dirt_02.png',
  fire: 'fx/fire_01.png',
  flame: 'fx/flame_05.png',
  star: 'fx/star_06.png',
  spark: 'fx/spark_05.png',
  glow: 'fx/circle_05.png',
} as const

type TexName = keyof typeof TEXTURES

interface Particle {
  sprite: THREE.Sprite
  vel: THREE.Vector3
  life: number
  maxLife: number
  startScale: number
  endScale: number
  startOpacity: number
  spin: number
  gravity: number
}

const MAX_PARTICLES = Math.round(160 * preset().particleScale)

export class Particles {
  private textures = new Map<TexName, THREE.Texture>()
  private pool: Particle[] = []
  private active: Particle[] = []
  group = new THREE.Group()

  constructor() {
    const loader = new THREE.TextureLoader()
    for (const [name, url] of Object.entries(TEXTURES)) {
      const tex = loader.load(url)
      tex.colorSpace = THREE.SRGBColorSpace
      this.textures.set(name as TexName, tex)
    }
  }

  private obtain(tex: TexName, additive: boolean): Particle | null {
    let p = this.pool.pop()
    if (!p) {
      if (this.active.length >= MAX_PARTICLES) return null
      const mat = new THREE.SpriteMaterial({
        transparent: true,
        depthWrite: false,
      })
      p = {
        sprite: new THREE.Sprite(mat),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        startScale: 1,
        endScale: 1,
        startOpacity: 1,
        spin: 0,
        gravity: 0,
      }
      this.group.add(p.sprite)
    }
    const mat = p.sprite.material as THREE.SpriteMaterial
    mat.map = this.textures.get(tex) ?? null
    mat.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending
    mat.needsUpdate = true
    p.sprite.visible = true
    return p
  }

  emit(opts: {
    tex: TexName
    pos: THREE.Vector3
    vel?: THREE.Vector3
    life?: number
    scale?: number
    endScale?: number
    color?: number
    opacity?: number
    additive?: boolean
    spin?: number
    gravity?: number
  }) {
    const p = this.obtain(opts.tex, opts.additive ?? false)
    if (!p) return
    p.sprite.position.copy(opts.pos)
    p.vel.copy(opts.vel ?? new THREE.Vector3())
    p.maxLife = p.life = opts.life ?? 0.6
    p.startScale = opts.scale ?? 1
    p.endScale = opts.endScale ?? p.startScale * 2
    p.startOpacity = opts.opacity ?? 0.8
    p.spin = opts.spin ?? (Math.random() - 0.5) * 2
    p.gravity = opts.gravity ?? 0
    const mat = p.sprite.material as THREE.SpriteMaterial
    mat.color.setHex(opts.color ?? 0xffffff)
    mat.rotation = Math.random() * Math.PI * 2
    p.sprite.scale.setScalar(p.startScale)
    this.active.push(p)
  }

  // ---------- canned effects ----------

  driftSmoke(pos: THREE.Vector3, tier: number) {
    this.emit({
      tex: Math.random() < 0.5 ? 'smokeA' : 'smokeB',
      pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.15, (Math.random() - 0.5) * 0.5)),
      vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, 1 + Math.random(), (Math.random() - 0.5) * 1.5),
      life: 0.55 + Math.random() * 0.25,
      scale: 0.9,
      endScale: 2.4,
      color: tier >= 2 ? 0xffd9a8 : tier >= 1 ? 0xcfe4ff : 0xeeeeee,
      opacity: 0.5,
    })
  }

  boostFlame(pos: THREE.Vector3, strong: boolean) {
    this.emit({
      tex: 'fire',
      pos,
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6),
      life: 0.3,
      scale: strong ? 1.4 : 1.0,
      endScale: 0.3,
      color: strong ? 0x55ccff : 0xffaa33,
      opacity: 0.9,
      additive: true,
    })
  }

  landingDust(pos: THREE.Vector3) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      this.emit({
        tex: 'dirt',
        pos: pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.6, 0.1, Math.sin(a) * 0.6)),
        vel: new THREE.Vector3(Math.cos(a) * 3, 1.2, Math.sin(a) * 3),
        life: 0.5,
        scale: 0.7,
        endScale: 1.8,
        color: 0xd9c49a,
        opacity: 0.55,
        gravity: -4,
      })
    }
  }

  explosion(pos: THREE.Vector3) {
    for (let i = 0; i < 6; i++) {
      this.emit({
        tex: i % 2 === 0 ? 'fire' : 'flame',
        pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.8 + Math.random() * 1.4, (Math.random() - 0.5) * 1.6)),
        vel: new THREE.Vector3((Math.random() - 0.5) * 4, 2.5 + Math.random() * 2.5, (Math.random() - 0.5) * 4),
        life: 0.45 + Math.random() * 0.2,
        scale: 1.6,
        endScale: 3.2,
        color: 0xffb347,
        opacity: 0.95,
        additive: true,
      })
    }
    for (let i = 0; i < 5; i++) {
      this.emit({
        tex: 'smokeB',
        pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 1.2, (Math.random() - 0.5) * 2)),
        vel: new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2),
        life: 0.9,
        scale: 1.8,
        endScale: 4.5,
        color: 0x555555,
        opacity: 0.6,
      })
    }
  }

  gaugeBurst(pos: THREE.Vector3) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      this.emit({
        tex: 'star',
        pos: pos.clone().add(new THREE.Vector3(0, 0.8, 0)),
        vel: new THREE.Vector3(Math.cos(a) * 4, 2.5, Math.sin(a) * 4),
        life: 0.6,
        scale: 0.55,
        endScale: 0.1,
        color: 0x7dffd9,
        opacity: 1,
        additive: true,
        gravity: -5,
      })
    }
  }

  splash(pos: THREE.Vector3) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      this.emit({
        tex: 'smokeA',
        pos: pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.8, 0.2, Math.sin(a) * 0.8)),
        vel: new THREE.Vector3(Math.cos(a) * 4, 4 + Math.random() * 2, Math.sin(a) * 4),
        life: 0.6,
        scale: 1,
        endScale: 2.2,
        color: 0x9fd8f0,
        opacity: 0.8,
        gravity: -9,
      })
    }
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i]
      p.life -= dt
      if (p.life <= 0) {
        p.sprite.visible = false
        this.active.splice(i, 1)
        this.pool.push(p)
        continue
      }
      const k = 1 - p.life / p.maxLife
      p.vel.y += p.gravity * dt
      p.sprite.position.addScaledVector(p.vel, dt)
      p.sprite.scale.setScalar(THREE.MathUtils.lerp(p.startScale, p.endScale, k))
      const mat = p.sprite.material as THREE.SpriteMaterial
      mat.opacity = p.startOpacity * (1 - k)
      mat.rotation += p.spin * dt
    }
  }

  dispose() {
    this.group.clear()
    this.active = []
    this.pool = []
  }
}
