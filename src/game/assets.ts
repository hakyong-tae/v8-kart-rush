import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Track, rng } from './track'
import type { CharacterDef } from './roster'

// Kenney Racing Kit + Car Kit (CC0) models, served from /models/
const MODEL_NAMES = [
  // kart bodies (Car Kit — each kart type is a different vehicle)
  'race',
  'hatchback-sports',
  'sedan-sports',
  'race-future',
  // legacy racing-kit cars (kept for decoration use)
  'raceCarRed',
  'raceCarGreen',
  'raceCarOrange',
  'raceCarWhite',
  'treeLarge',
  'treeSmall',
  'grandStand',
  'grandStandCovered',
  'flagCheckers',
  'bannerTowerRed',
  'bannerTowerGreen',
  'pylon',
  'billboard',
  'barrierRed',
  'barrierWhite',
  'tentLong',
  'lightPostModern',
  'overheadLights',
] as const

export type ModelName = (typeof MODEL_NAMES)[number]

export class Assets {
  models = new Map<string, THREE.Group>()
  private loadPromise: Promise<void> | null = null

  load(onProgress?: (frac: number) => void): Promise<void> {
    if (!this.loadPromise) this.loadPromise = this.doLoad(onProgress)
    return this.loadPromise
  }

  private async doLoad(onProgress?: (frac: number) => void): Promise<void> {
    const loader = new GLTFLoader()
    let done = 0
    await Promise.all(
      MODEL_NAMES.map(
        (name) =>
          new Promise<void>((resolve) => {
            loader.load(
              `models/${name}.glb`,
              (gltf) => {
                const g = gltf.scene
                g.traverse((o) => {
                  if ((o as THREE.Mesh).isMesh) {
                    const m = o as THREE.Mesh
                    m.castShadow = false
                    m.receiveShadow = false
                  }
                })
                this.models.set(name, g)
                done++
                onProgress?.(done / MODEL_NAMES.length)
                resolve()
              },
              undefined,
              (err) => {
                console.warn(`failed to load model ${name}`, err)
                done++
                onProgress?.(done / MODEL_NAMES.length)
                resolve() // missing models degrade gracefully
              },
            )
          }),
      ),
    )
  }

  // Clone a model scaled so its bounding-box size along `axis` equals `target`.
  spawn(name: ModelName | string, target: number, axis: 'x' | 'y' | 'z' = 'y'): THREE.Group | null {
    const src = this.models.get(name)
    if (!src) return null
    const clone = src.clone(true)
    const box = new THREE.Box3().setFromObject(clone)
    const size = new THREE.Vector3()
    box.getSize(size)
    const s = target / Math.max(size[axis], 0.0001)
    clone.scale.setScalar(s)
    // center on origin (x/z) and sit on ground — some GLBs have offset pivots.
    // The offset lives INSIDE a wrapper group so rotating the result keeps it centered.
    const box2 = new THREE.Box3().setFromObject(clone)
    const c = new THREE.Vector3()
    box2.getCenter(c)
    clone.position.x -= c.x
    clone.position.z -= c.z
    clone.position.y -= box2.min.y
    const wrapper = new THREE.Group()
    wrapper.add(clone)
    return wrapper
  }
}

// ---------- procedural extras (no asset files needed) ----------

// Cute chibi rider that sits on top of the kart (KartRider vibe).
// Characters are independent from karts — pass any CharacterDef.
export function makeRider(char: CharacterDef): THREE.Group {
  const g = new THREE.Group()
  const suit = new THREE.MeshLambertMaterial({ color: char.suit })
  const skin = new THREE.MeshLambertMaterial({ color: char.skin })
  const dark = new THREE.MeshBasicMaterial({ color: 0x26233a })

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), suit)
  body.scale.set(1, 0.9, 0.8)
  body.position.y = 0.55
  g.add(body)

  // big round head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), skin)
  head.position.y = 1.08
  g.add(head)

  // hat variants
  switch (char.hat) {
    case 'helmet': {
      const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
        suit,
      )
      helmet.position.y = 1.12
      g.add(helmet)
      break
    }
    case 'cap': {
      const top = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.45),
        suit,
      )
      top.position.y = 1.16
      g.add(top)
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.3), suit)
      brim.position.set(0, 1.28, 0.38)
      brim.rotation.x = 0.12
      g.add(brim)
      break
    }
    case 'ribbon': {
      const hair = new THREE.Mesh(
        new THREE.SphereGeometry(0.39, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
        new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
      )
      hair.position.y = 1.12
      g.add(hair)
      for (const sx of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 6), suit)
        wing.position.set(sx * 0.26, 1.44, 0)
        wing.rotation.z = sx * (Math.PI / 2 + 0.4)
        g.add(wing)
      }
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), suit)
      knot.position.set(0, 1.44, 0)
      g.add(knot)
      break
    }
    case 'sunglasses': {
      const hair = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
        new THREE.MeshLambertMaterial({ color: 0x2e2a26 }),
      )
      hair.position.y = 1.13
      g.add(hair)
      const shades = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, 0.06), dark)
      shades.position.set(0, 1.14, 0.32)
      g.add(shades)
      break
    }
    case 'antenna': {
      const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
        suit,
      )
      helmet.position.y = 1.12
      g.add(helmet)
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), dark)
      rod.position.y = 1.55
      g.add(rod)
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff4d4d }),
      )
      ball.position.y = 1.72
      g.add(ball)
      break
    }
  }

  // face: two eyes + smile (front of the head, +Z)
  for (const sx of [-0.13, 0.13]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), dark)
    eye.position.set(sx, char.hat === 'sunglasses' ? 1.02 : 1.08, 0.33)
    if (char.hat !== 'sunglasses') g.add(eye)
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 6, 10, Math.PI), dark)
  smile.position.set(0, 0.98, 0.33)
  smile.rotation.set(0.2, 0, Math.PI)
  g.add(smile)

  // little arms reaching the wheel
  for (const sx of [-0.3, 0.3]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.3, 4, 6), suit)
    arm.position.set(sx, 0.62, 0.25)
    arm.rotation.x = -1.0
    g.add(arm)
  }
  return g
}

// Beach decorations (procedural — Kenney kit has no palms)
export function makePalm(rand: () => number): THREE.Group {
  const g = new THREE.Group()
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x9c6b3f })
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3da653 })
  const h = 5 + rand() * 3
  const lean = (rand() - 0.5) * 0.5
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, h, 7), trunkMat)
  trunk.position.y = h / 2
  trunk.rotation.z = lean
  g.add(trunk)
  const topX = Math.sin(lean) * -h * 0.5 * 0 + -lean * h * 0.5
  for (let i = 0; i < 6; i++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.6, 5), leafMat)
    const ang = (i / 6) * Math.PI * 2
    frond.position.set(topX + Math.cos(ang) * 1.0, h + 0.2, Math.sin(ang) * 1.0)
    frond.rotation.set(Math.sin(ang) * 1.25, 0, Math.cos(ang) * -1.25)
    frond.scale.y = 1.2
    g.add(frond)
  }
  const coco = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 6), trunkMat)
  coco.position.set(topX, h - 0.1, 0)
  g.add(coco)
  return g
}

export function makeUmbrella(rand: () => number): THREE.Group {
  const g = new THREE.Group()
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6),
    new THREE.MeshLambertMaterial({ color: 0xeeeeee }),
  )
  pole.position.y = 1.3
  g.add(pole)
  const colors = [0xff5d4d, 0x37c8ff, 0xffe14d, 0xff8c5a]
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(1.7, 0.8, 10),
    new THREE.MeshLambertMaterial({ color: colors[Math.floor(rand() * colors.length)] }),
  )
  canopy.position.y = 2.7
  g.add(canopy)
  return g
}

export function makeBuoy(): THREE.Group {
  const g = new THREE.Group()
  const base = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 8, 7),
    new THREE.MeshLambertMaterial({ color: 0xff5d4d }),
  )
  base.position.y = 0.45
  g.add(base)
  const top = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
  )
  top.position.y = 0.95
  g.add(top)
  return g
}

// Puffy cartoon clouds floating in the sky
export function makeClouds(seed: number): THREE.Group {
  const g = new THREE.Group()
  const rand = rng(seed * 7 + 3)
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Group()
    const puffs = 3 + Math.floor(rand() * 3)
    for (let p = 0; p < puffs; p++) {
      const r = 6 + rand() * 7
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 7), mat)
      puff.position.set((p - puffs / 2) * r * 0.9, rand() * 3, (rand() - 0.5) * 6)
      puff.scale.y = 0.6
      cloud.add(puff)
    }
    const ang = rand() * Math.PI * 2
    const dist = 180 + rand() * 260
    cloud.position.set(Math.cos(ang) * dist, 55 + rand() * 45, Math.sin(ang) * dist)
    g.add(cloud)
  }
  return g
}

// Scatter trackside decorations deterministically
export function buildDecorations(track: Track, assets: Assets): THREE.Group {
  const group = new THREE.Group()
  const rand = rng(track.course.decorSeed)
  const hw = track.halfWidth
  const N = track.N

  const place = (obj: THREE.Group | null, idx: number, lat: number, faceTrack = false) => {
    if (!obj) return
    const s = track.sampleAt(idx)
    obj.position.x += s.pos.x + s.nor.x * lat
    obj.position.z += s.pos.z + s.nor.z * lat
    if (faceTrack) {
      obj.rotation.y = Math.atan2(-s.nor.x * Math.sign(lat), -s.nor.z * Math.sign(lat))
    } else {
      obj.rotation.y = rand() * Math.PI * 2
    }
    group.add(obj)
  }

  // Start area: grandstands + flags + overhead gate
  place(assets.spawn('grandStandCovered', 6), N - 6, hw + 14, true)
  place(assets.spawn('grandStand', 5), N - 26, -(hw + 12), true)
  place(assets.spawn('flagCheckers', 6), N - 2, track.wallDist + 1.2)
  place(assets.spawn('flagCheckers', 6), N - 2, -(track.wallDist + 1.2))
  {
    // overhead start gate spanning the road (model spans along its local X)
    const gate = assets.spawn('overheadLights', (hw + 2) * 2, 'x')
    if (gate) {
      const s = track.sampleAt(N - 1)
      gate.position.x += s.pos.x
      gate.position.z += s.pos.z
      gate.rotation.y = Math.atan2(s.nor.x, s.nor.z) + Math.PI / 2
      group.add(gate)
    }
  }

  // Banner towers at quarter points
  place(assets.spawn('bannerTowerRed', 7), Math.floor(N * 0.25), hw + 6, true)
  place(assets.spawn('bannerTowerGreen', 7), Math.floor(N * 0.5), -(hw + 6), true)
  place(assets.spawn('billboard', 5), Math.floor(N * 0.66), hw + 9, true)
  place(assets.spawn('tentLong', 4), Math.floor(N * 0.75), -(hw + 13), true)

  const wall = track.wallDist

  // Open island maps (beach): buoys mark the boundary, palms & umbrellas on the sand
  if (track.course.open) {
    for (let k = 0; k < 50; k++) {
      const idx = Math.floor((k / 50) * N)
      for (const side of [1, -1]) {
        const buoy = makeBuoy()
        const s = track.sampleAt(idx)
        buoy.position.set(
          s.pos.x + s.nor.x * side * (wall + 1.2),
          0,
          s.pos.z + s.nor.z * side * (wall + 1.2),
        )
        group.add(buoy)
      }
    }
    for (let k = 0; k < 60; k++) {
      const idx = Math.floor(rand() * N)
      const side = rand() < 0.5 ? 1 : -1
      const lat = side * (hw + 5 + rand() * (wall - hw - 8))
      const s = track.sampleAt(idx)
      const p = new THREE.Vector3(s.pos.x + s.nor.x * lat, 0, s.pos.z + s.nor.z * lat)
      // keep clear of the road itself
      const nearIdx = track.nearestIndex(p)
      if (Math.abs(track.lateral(p, nearIdx)) < hw + 4) continue
      const obj = rand() < 0.65 ? makePalm(rand) : makeUmbrella(rand)
      obj.position.set(p.x, 0, p.z)
      obj.rotation.y = rand() * Math.PI * 2
      group.add(obj)
    }
    return group
  }

  // Light posts for night courses (outside the guardrail)
  if (track.course.theme.night) {
    for (let k = 0; k < 14; k++) {
      const idx = Math.floor((k / 14) * N)
      place(assets.spawn('lightPostModern', 6), idx, (k % 2 === 0 ? 1 : -1) * (wall + 1.5), true)
    }
  }

  // Pylons + barriers behind the guardrail on the outside of sharp corners
  for (let i = 0; i < N; i += 10) {
    const s0 = track.sampleAt(i)
    const s1 = track.sampleAt(i + 10)
    const turn = s0.tan.angleTo(s1.tan)
    if (turn > 0.22) {
      const side = Math.sign(s0.tan.x * s1.tan.z - s0.tan.z * s1.tan.x) || 1
      const barrier = assets.spawn(turn > 0.34 ? 'barrierRed' : 'barrierWhite', 0.9)
      if (barrier) {
        const s = track.sampleAt(i + 5)
        const lat = -side * (wall + 1.4)
        barrier.position.x += s.pos.x + s.nor.x * lat
        barrier.position.z += s.pos.z + s.nor.z * lat
        barrier.rotation.y = Math.atan2(s.tan.x, s.tan.z)
        barrier.scale.x *= 3
        group.add(barrier)
      }
      if (rand() < 0.5) place(assets.spawn('pylon', 0.8), i + 3, -side * (hw + 1.4))
    }
  }

  // Trees scattered around (avoid the road)
  const isNearRoad = (p: THREE.Vector3) => {
    const idx = track.nearestIndex(p)
    return Math.abs(track.lateral(p, idx)) < hw + 7
  }
  const treeCount = 70
  for (let k = 0; k < treeCount; k++) {
    const idx = Math.floor(rand() * N)
    const side = rand() < 0.5 ? 1 : -1
    const lat = side * (hw + 10 + rand() * 50)
    const s = track.sampleAt(idx)
    const p = new THREE.Vector3(s.pos.x + s.nor.x * lat, 0, s.pos.z + s.nor.z * lat)
    if (isNearRoad(p)) continue
    const tree = assets.spawn(rand() < 0.4 ? 'treeLarge' : 'treeSmall', rand() < 0.4 ? 7 : 4.5)
    if (tree) {
      tree.position.x += p.x
      tree.position.z += p.z
      tree.rotation.y = rand() * Math.PI * 2
      group.add(tree)
    }
  }

  return group
}
