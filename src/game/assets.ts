import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Track, rng } from './track'

// Kenney Racing Kit (CC0) models, served from /models/
const MODEL_NAMES = [
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
  spawn(name: ModelName, target: number, axis: 'x' | 'y' | 'z' = 'y'): THREE.Group | null {
    const src = this.models.get(name)
    if (!src) return null
    const clone = src.clone(true)
    const box = new THREE.Box3().setFromObject(clone)
    const size = new THREE.Vector3()
    box.getSize(size)
    const s = target / Math.max(size[axis], 0.0001)
    clone.scale.setScalar(s)
    // sit on ground
    const box2 = new THREE.Box3().setFromObject(clone)
    clone.position.y -= box2.min.y
    return clone
  }
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
  place(assets.spawn('flagCheckers', 6), N - 2, hw + 2.2)
  place(assets.spawn('flagCheckers', 6), N - 2, -(hw + 2.2))
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

  // Light posts for night courses
  if (track.course.theme.night) {
    for (let k = 0; k < 14; k++) {
      const idx = Math.floor((k / 14) * N)
      place(assets.spawn('lightPostModern', 6), idx, (k % 2 === 0 ? 1 : -1) * (hw + 3.5), true)
    }
  }

  // Pylons + barriers on outside of sharp corners
  for (let i = 0; i < N; i += 10) {
    const s0 = track.sampleAt(i)
    const s1 = track.sampleAt(i + 10)
    const turn = s0.tan.angleTo(s1.tan)
    if (turn > 0.22) {
      const side = Math.sign(s0.tan.x * s1.tan.z - s0.tan.z * s1.tan.x) || 1
      // barrier on the outside of the turn
      const barrier = assets.spawn(turn > 0.34 ? 'barrierRed' : 'barrierWhite', 0.9)
      if (barrier) {
        const s = track.sampleAt(i + 5)
        const lat = -side * (hw + 2.0)
        barrier.position.x += s.pos.x + s.nor.x * lat
        barrier.position.z += s.pos.z + s.nor.z * lat
        barrier.rotation.y = Math.atan2(s.tan.x, s.tan.z)
        barrier.scale.x *= 3
        group.add(barrier)
      }
      if (rand() < 0.5) place(assets.spawn('pylon', 0.8), i + 3, -side * (hw + 1.6))
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
