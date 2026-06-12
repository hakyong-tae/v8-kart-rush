import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Track, rng } from './track'
import type { CharacterDef } from './roster'
import { ADS, makeAdBoard } from './ads'
import { preset } from './perf'

// Kart bodies (poly.pizza, see public/models/karts/CREDITS.md) + Kenney kits
const MODEL_NAMES = [
  // kart bodies — each kart type is a different vehicle
  'karts/formula',
  'karts/gokart',
  'karts/hotrod',
  'karts/kartred',
  'karts/race',
  'karts/hatchback-sports',
  'karts/sedan-sports',
  'karts/race-future',
  'karts/boxkart',
  'karts/hover',
  'karts/sportscar',
  'karts/sedan',
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

// Per-course scenery model sets (loaded on demand before a race).
// Subfolders matter: each Kenney kit ships its own Textures/colormap.png.
export const SCENERY_MODELS: Record<string, string[]> = {
  sunny: [
    'nature/tree_default', 'nature/tree_detailed', 'nature/tree_oak', 'nature/tree_fat',
    'nature/tree_pineRoundA', 'nature/plant_bushLarge', 'nature/plant_bushDetailed',
    'nature/flower_redA', 'nature/flower_yellowA', 'nature/rock_smallA', 'nature/rock_smallE',
    'nature/mushroom_redGroup', 'nature/grass_large',
  ],
  canyon: [
    'nature/rock_tallA', 'nature/rock_tallD', 'nature/rock_tallG', 'nature/rock_largeA',
    'nature/rock_largeD', 'nature/cactus_short', 'nature/cactus_tall', 'nature/rock_smallA',
    'nature/rock_smallE',
  ],
  ice: [
    'holiday/tree-snow-a', 'holiday/tree-snow-b', 'holiday/tree-snow-c',
    'holiday/tree-decorated-snow', 'holiday/snowman', 'holiday/snow-pile',
    'holiday/candy-cane-red', 'holiday/candy-cane-green', 'nature/rock_smallA',
  ],
  beach: [
    'pirate/palm-detailed-bend', 'pirate/palm-detailed-straight', 'pirate/palm-bend',
    'pirate/palm-straight', 'pirate/rocks-sand-a', 'pirate/rocks-sand-b', 'pirate/rocks-sand-c',
    'pirate/ship-pirate-medium', 'pirate/boat-row-large',
  ],
  neon: [
    'city/building-a', 'city/building-c', 'city/building-e', 'city/building-g',
    'city/building-i', 'city/building-k', 'city/building-n',
    'city/building-skyscraper-a', 'city/building-skyscraper-c', 'city/building-skyscraper-e',
  ],
}

export class Assets {
  models = new Map<string, THREE.Group>()
  private loadPromise: Promise<void> | null = null
  private pending = new Map<string, Promise<void>>()

  load(onProgress?: (frac: number) => void): Promise<void> {
    if (!this.loadPromise) this.loadPromise = this.doLoad(onProgress)
    return this.loadPromise
  }

  private loadOne(loader: GLTFLoader, name: string): Promise<void> {
    if (this.models.has(name)) return Promise.resolve()
    const existing = this.pending.get(name)
    if (existing) return existing
    const p = new Promise<void>((resolve) => {
      loader.load(
        `models/${name}.glb`,
        (gltf) => {
          const g = gltf.scene
          g.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) {
              const m = o as THREE.Mesh
              m.castShadow = false
              m.receiveShadow = false
              // old Kenney exports default to metallic=1 which renders black
              // without an environment map — force dielectric
              const mats = Array.isArray(m.material) ? m.material : [m.material]
              for (const mat of mats) {
                const std = mat as THREE.MeshStandardMaterial
                if (std.isMeshStandardMaterial) {
                  std.metalness = 0
                  std.roughness = Math.max(std.roughness, 0.85)
                }
              }
            }
          })
          this.models.set(name, g)
          resolve()
        },
        undefined,
        (err) => {
          console.warn(`failed to load model ${name}`, err)
          resolve() // missing models degrade gracefully
        },
      )
    })
    this.pending.set(name, p)
    return p
  }

  /** Load an extra model set on demand (per-course scenery). */
  async loadSet(names: string[]): Promise<void> {
    const loader = new GLTFLoader()
    await Promise.all(names.map((n) => this.loadOne(loader, n)))
  }

  private async doLoad(onProgress?: (frac: number) => void): Promise<void> {
    const loader = new GLTFLoader()
    let done = 0
    await Promise.all(
      MODEL_NAMES.map((name) =>
        this.loadOne(loader, name).then(() => {
          done++
          onProgress?.(done / MODEL_NAMES.length)
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

// The cloud rescuer ("구름이") — fishes fallen karts out of pits, Lakitu-style.
export function makeRescuer(): THREE.Group {
  const g = new THREE.Group()
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  for (const [x, z, r] of [
    [-0.5, 0, 0.45],
    [0.45, 0.1, 0.5],
    [0, -0.15, 0.55],
  ] as const) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), cloudMat)
    puff.position.set(x, 0, z)
    puff.scale.y = 0.7
    g.add(puff)
  }
  // tiny pilot
  const suit = new THREE.MeshLambertMaterial({ color: 0xffe14d })
  const skin = new THREE.MeshLambertMaterial({ color: 0xffd9b3 })
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 7), suit)
  body.position.set(0, 0.4, 0)
  g.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin)
  head.position.set(0, 0.78, 0)
  g.add(head)
  const dark = new THREE.MeshBasicMaterial({ color: 0x26233a })
  for (const sx of [-0.08, 0.08]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 5), dark)
    eye.position.set(sx, 0.8, 0.21)
    g.add(eye)
  }
  // fishing rod
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.035, 1.6, 5),
    new THREE.MeshLambertMaterial({ color: 0x9c6b3f }),
  )
  rod.position.set(0.45, 0.6, 0.5)
  rod.rotation.set(0.9, 0, -0.4)
  g.add(rod)
  // fishing line hanging down to the kart
  const line = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 1, 4),
    new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }),
  )
  line.name = 'line'
  line.position.set(0.85, -1.4, 1.05)
  line.scale.y = 3.2
  g.add(line)
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
  // MeshBasic: clouds stay white instead of picking up green hemisphere bounce
  const mat = new THREE.MeshBasicMaterial({ color: 0xf4f8ff })
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

  // Trackside ad boards (real ads / Verse8 games — see ads.ts)
  {
    const slots = 5
    for (let i = 0; i < slots; i++) {
      const idx = Math.floor(((i + 0.5) / slots) * N)
      const side = i % 2 === 0 ? 1 : -1
      // keep boards away from cliff pit edges
      if (!track.course.open && track.pitAtIndex(idx, side as 1 | -1)) continue
      const board = makeAdBoard(ADS[i % ADS.length])
      const s = track.sampleAt(idx)
      const lat = side * (wall + (track.course.open ? -6 : 3.2))
      board.position.set(s.pos.x + s.nor.x * lat, 0, s.pos.z + s.nor.z * lat)
      // face the road
      board.rotation.y = Math.atan2(-s.nor.x * side, -s.nor.z * side)
      group.add(board)
    }
  }

  // Generic scatter helper: drop models in a lateral band, avoiding the road.
  const scatter = (
    names: string[],
    size: [number, number],
    count: number,
    latMin: number,
    latMax: number,
    y = 0,
  ) => {
    for (let k = 0; k < Math.max(1, Math.round(count * preset().decorScale)); k++) {
      const idx = Math.floor(rand() * N)
      const side = rand() < 0.5 ? 1 : -1
      const lat = side * (latMin + rand() * (latMax - latMin))
      const s = track.sampleAt(idx)
      const p = new THREE.Vector3(s.pos.x + s.nor.x * lat, 0, s.pos.z + s.nor.z * lat)
      const nearIdx = track.nearestIndex(p)
      if (Math.abs(track.lateral(p, nearIdx)) < hw + 3.5) continue // never on the road
      const obj = assets.spawn(
        names[Math.floor(rand() * names.length)],
        size[0] + rand() * (size[1] - size[0]),
      )
      if (!obj) continue
      obj.position.set(p.x, y, p.z)
      obj.rotation.y = rand() * Math.PI * 2
      group.add(obj)
    }
  }

  // Open island maps (beach): buoys mark the boundary; pirate-kit palms,
  // sand rocks, beached boats and ships anchored offshore.
  if (track.course.open) {
    for (let k = 0; k < 50; k++) {
      const idx = Math.floor((k / 50) * N)
      for (const side of [1, -1]) {
        const buoy = makeBuoy()
        const s = track.sampleAt(idx)
        buoy.position.set(
          s.pos.x + s.nor.x * side * (wall + 1.6),
          -0.9, // bobbing in the water just past the sand edge
          s.pos.z + s.nor.z * side * (wall + 1.6),
        )
        group.add(buoy)
      }
    }
    scatter(
      ['pirate/palm-detailed-bend', 'pirate/palm-detailed-straight', 'pirate/palm-bend', 'pirate/palm-straight'],
      [7, 10],
      48,
      hw + 5,
      wall - 3,
    )
    scatter(['pirate/rocks-sand-a', 'pirate/rocks-sand-b', 'pirate/rocks-sand-c'], [1.5, 3.2], 18, hw + 4, wall - 2)
    // umbrellas keep the beach lively
    for (let k = 0; k < 14; k++) {
      const idx = Math.floor(rand() * N)
      const side = rand() < 0.5 ? 1 : -1
      const lat = side * (hw + 6 + rand() * (wall - hw - 10))
      const s = track.sampleAt(idx)
      const p = new THREE.Vector3(s.pos.x + s.nor.x * lat, 0, s.pos.z + s.nor.z * lat)
      if (Math.abs(track.lateral(p, track.nearestIndex(p))) < hw + 4) continue
      const obj = makeUmbrella(rand)
      obj.position.set(p.x, 0, p.z)
      obj.rotation.y = rand() * Math.PI * 2
      group.add(obj)
    }
    // pirate ships anchored out in the water + beached rowing boats
    for (let k = 0; k < 2; k++) {
      const ship = assets.spawn('pirate/ship-pirate-medium', 16, 'z')
      if (!ship) continue
      const idx = Math.floor(((k + 0.3) / 2) * N)
      const side = k % 2 === 0 ? 1 : -1
      const s = track.sampleAt(idx)
      ship.position.set(
        s.pos.x + s.nor.x * side * (wall + 26),
        -1.2,
        s.pos.z + s.nor.z * side * (wall + 26),
      )
      ship.rotation.y = rand() * Math.PI * 2
      group.add(ship)
    }
    for (let k = 0; k < 3; k++) {
      const boat = assets.spawn('pirate/boat-row-large', 4.5, 'z')
      if (!boat) continue
      const idx = Math.floor(rand() * N)
      const side = rand() < 0.5 ? 1 : -1
      const s = track.sampleAt(idx)
      const lat = side * (wall - 4)
      boat.position.set(s.pos.x + s.nor.x * lat, 0, s.pos.z + s.nor.z * lat)
      boat.rotation.y = rand() * Math.PI * 2
      group.add(boat)
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

  // Per-course scenery (premium Kenney kits — see SCENERY_MODELS)
  switch (track.course.id) {
    case 'sunny':
      scatter(
        ['nature/tree_default', 'nature/tree_detailed', 'nature/tree_oak', 'nature/tree_fat', 'nature/tree_pineRoundA'],
        [5.5, 9],
        55,
        wall + 4,
        wall + 55,
      )
      scatter(['nature/plant_bushLarge', 'nature/plant_bushDetailed'], [1.6, 2.6], 24, wall + 2, wall + 22)
      scatter(['nature/flower_redA', 'nature/flower_yellowA'], [0.9, 1.3], 36, wall + 1.5, wall + 12)
      scatter(['nature/rock_smallA', 'nature/rock_smallE'], [1, 1.8], 12, wall + 3, wall + 30)
      scatter(['nature/mushroom_redGroup'], [0.9, 1.4], 8, wall + 2, wall + 16)
      scatter(['nature/grass_large'], [0.8, 1.2], 30, wall + 1.5, wall + 18)
      break
    case 'canyon':
      // mesa country: towering rock formations + cacti
      scatter(['nature/rock_tallA', 'nature/rock_tallD', 'nature/rock_tallG'], [9, 18], 26, wall + 8, wall + 55)
      scatter(['nature/rock_largeA', 'nature/rock_largeD'], [4, 7], 16, wall + 4, wall + 35)
      scatter(['nature/cactus_short', 'nature/cactus_tall'], [2, 3.6], 22, wall + 2, wall + 28)
      scatter(['nature/rock_smallA', 'nature/rock_smallE'], [1, 2], 16, wall + 2, wall + 20)
      break
    case 'ice':
      scatter(['holiday/tree-snow-a', 'holiday/tree-snow-b', 'holiday/tree-snow-c'], [5.5, 9], 52, wall + 3, wall + 50)
      scatter(['holiday/snow-pile'], [1.2, 2.4], 16, wall + 2, wall + 24)
      scatter(['nature/rock_smallA'], [1, 1.8], 10, wall + 3, wall + 26)
      // friendly faces near the road
      scatter(['holiday/snowman'], [2, 2.4], 8, wall + 1.5, wall + 7)
      scatter(['holiday/tree-decorated-snow'], [5.5, 6.5], 6, wall + 2, wall + 10)
      // candy-cane posts alternating along the track
      for (let k = 0; k < 18; k++) {
        const idx = Math.floor((k / 18) * N)
        const side = k % 2 === 0 ? 1 : -1
        const cane = assets.spawn(k % 4 < 2 ? 'holiday/candy-cane-red' : 'holiday/candy-cane-green', 2.4)
        if (!cane) continue
        const s = track.sampleAt(idx)
        const lat = side * (wall + 1.3)
        cane.position.set(s.pos.x + s.nor.x * lat, 0, s.pos.z + s.nor.z * lat)
        cane.rotation.y = rand() * Math.PI * 2
        group.add(cane)
      }
      break
    case 'neon': {
      // city skyline ringing the night course
      const skyline = [
        'city/building-a', 'city/building-c', 'city/building-e', 'city/building-g',
        'city/building-i', 'city/building-k', 'city/building-n',
        'city/building-skyscraper-a', 'city/building-skyscraper-c', 'city/building-skyscraper-e',
      ]
      for (let k = 0; k < 30; k++) {
        const idx = Math.floor((k / 30) * N + rand() * 14)
        const side = k % 2 === 0 ? 1 : -1
        const name = skyline[Math.floor(rand() * skyline.length)]
        const tall = name.includes('skyscraper')
        const b = assets.spawn(name, tall ? 22 + rand() * 18 : 9 + rand() * 7)
        if (!b) continue
        const s = track.sampleAt(idx)
        const lat = side * (wall + 10 + rand() * 22)
        const p = new THREE.Vector3(s.pos.x + s.nor.x * lat, 0, s.pos.z + s.nor.z * lat)
        if (Math.abs(track.lateral(p, track.nearestIndex(p))) < hw + 8) continue
        b.position.set(p.x, 0, p.z)
        b.rotation.y = Math.atan2(-s.nor.x * side, -s.nor.z * side)
        // night city: make the windows glow
        b.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (!mesh.isMesh) return
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          for (const m of mats) {
            const std = m as THREE.MeshStandardMaterial
            if (std.isMeshStandardMaterial && std.map) {
              std.emissiveMap = std.map
              std.emissive.setHex(0x9a93b8)
            }
          }
        })
        group.add(b)
      }
      break
    }
    case 'volcano': {
      // 원거리 화산 콘 (꼭대기 글로우) — 트랙을 빙 둘러 배치
      const rockMat = new THREE.MeshLambertMaterial({ color: 0x3a2c28 })
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xff7a3a })
      for (let k = 0; k < 6; k++) {
        const idx = Math.floor((k / 6) * N + rand() * 60)
        const side = k % 2 === 0 ? 1 : -1
        const s = track.sampleAt(idx)
        const lat = side * (wall + 45 + rand() * 30)
        const p = new THREE.Vector3(s.pos.x + s.nor.x * lat, 0, s.pos.z + s.nor.z * lat)
        if (Math.abs(track.lateral(p, track.nearestIndex(p))) < hw + 20) continue
        const h = 20 + rand() * 14
        const cone = new THREE.Mesh(new THREE.ConeGeometry(h * 0.62, h, 7), rockMat)
        cone.position.set(p.x, h / 2, p.z)
        cone.rotation.y = rand() * Math.PI
        const glow = new THREE.Mesh(new THREE.SphereGeometry(h * 0.1, 6, 5), glowMat)
        glow.position.set(p.x, h + h * 0.02, p.z)
        group.add(cone, glow)
      }
      // 검은 현무암 바위
      for (let k = 0; k < Math.round(26 * preset().decorScale); k++) {
        const idx = Math.floor(rand() * N)
        const side = rand() < 0.5 ? 1 : -1
        const lat = side * (wall + 3 + rand() * 28)
        const s = track.sampleAt(idx)
        const p = new THREE.Vector3(s.pos.x + s.nor.x * lat, 0, s.pos.z + s.nor.z * lat)
        if (Math.abs(track.lateral(p, track.nearestIndex(p))) < hw + 3.5) continue
        const r = 0.9 + rand() * 2.2
        const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), rockMat)
        rock.position.set(p.x, r * 0.55, p.z)
        rock.rotation.set(rand() * Math.PI, rand() * Math.PI, 0)
        group.add(rock)
      }
      // 용암 글로우 웅덩이
      const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff5a26, transparent: true, opacity: 0.55 })
      for (let k = 0; k < Math.round(10 * preset().decorScale); k++) {
        const idx = Math.floor(rand() * N)
        const side = rand() < 0.5 ? 1 : -1
        const lat = side * (wall + 5 + rand() * 22)
        const s = track.sampleAt(idx)
        const p = new THREE.Vector3(s.pos.x + s.nor.x * lat, 0, s.pos.z + s.nor.z * lat)
        if (Math.abs(track.lateral(p, track.nearestIndex(p))) < hw + 4) continue
        const pool = new THREE.Mesh(new THREE.CircleGeometry(2 + rand() * 2.5, 10), lavaMat)
        pool.rotation.x = -Math.PI / 2
        pool.position.set(p.x, 0.02, p.z)
        group.add(pool)
      }
      break
    }
    case 'factory': {
      // 컨테이너 스택
      const palette = [0x4a6da0, 0xb0563a, 0x6a7a4a, 0x6e7480]
      for (let k = 0; k < Math.round(12 * preset().decorScale); k++) {
        const idx = Math.floor(rand() * N)
        const side = rand() < 0.5 ? 1 : -1
        const lat = side * (wall + 4 + rand() * 26)
        const s = track.sampleAt(idx)
        const p = new THREE.Vector3(s.pos.x + s.nor.x * lat, 0, s.pos.z + s.nor.z * lat)
        if (Math.abs(track.lateral(p, track.nearestIndex(p))) < hw + 5) continue
        const layers = 1 + Math.floor(rand() * 3)
        for (let l = 0; l < layers; l++) {
          const box = new THREE.Mesh(
            new THREE.BoxGeometry(6, 3, 3),
            new THREE.MeshLambertMaterial({ color: palette[Math.floor(rand() * palette.length)] }),
          )
          box.position.set(p.x + (rand() - 0.5) * 1.2, 1.5 + l * 3, p.z + (rand() - 0.5) * 1.2)
          box.rotation.y = rand() * 0.4 - 0.2
          group.add(box)
        }
      }
      // 원통 탱크 + 원거리 굴뚝
      const tankMat = new THREE.MeshLambertMaterial({ color: 0x8a8f9a })
      const stackMat = new THREE.MeshLambertMaterial({ color: 0x4a4f5a })
      for (let k = 0; k < 5; k++) {
        const idx = Math.floor(rand() * N)
        const side = rand() < 0.5 ? 1 : -1
        const s = track.sampleAt(idx)
        const lat = side * (wall + 8 + rand() * 18)
        const p = new THREE.Vector3(s.pos.x + s.nor.x * lat, 0, s.pos.z + s.nor.z * lat)
        if (Math.abs(track.lateral(p, track.nearestIndex(p))) < hw + 6) continue
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 6, 12), tankMat)
        tank.position.set(p.x, 3, p.z)
        group.add(tank)
      }
      for (let k = 0; k < 4; k++) {
        const idx = Math.floor(((k + 0.4) / 4) * N)
        const side = k % 2 === 0 ? 1 : -1
        const s = track.sampleAt(idx)
        const lat = side * (wall + 34 + rand() * 14)
        const p = new THREE.Vector3(s.pos.x + s.nor.x * lat, 0, s.pos.z + s.nor.z * lat)
        if (Math.abs(track.lateral(p, track.nearestIndex(p))) < hw + 16) continue
        const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 18, 10), stackMat)
        stack.position.set(p.x, 9, p.z)
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 1.2, 10), tankMat)
        rim.position.set(p.x, 17.6, p.z)
        group.add(stack, rim)
      }
      break
    }
    default:
      scatter(['treeLarge', 'treeSmall'], [4.5, 7], 50, wall + 4, wall + 50)
  }

  return group
}
