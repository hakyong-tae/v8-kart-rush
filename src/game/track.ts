import * as THREE from 'three'
import type { CourseDef } from './courses'

export interface TrackSample {
  pos: THREE.Vector3
  tan: THREE.Vector3 // unit tangent (direction of travel)
  nor: THREE.Vector3 // unit left normal (up x tangent)
}

export const NUM_CHECKPOINTS = 8

// mulberry32 deterministic PRNG for decoration placement
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class Track {
  course: CourseDef
  curve: THREE.CatmullRomCurve3
  samples: TrackSample[] = []
  N = 1000
  halfWidth: number
  wallDist: number // guardrail distance from centerline
  totalLength: number

  constructor(course: CourseDef) {
    this.course = course
    this.halfWidth = course.width / 2
    this.wallDist = this.halfWidth + course.shoulder
    const pts = course.points.map(([x, z]) => new THREE.Vector3(x, 0, z))
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5)
    this.totalLength = this.curve.getLength()
    const up = new THREE.Vector3(0, 1, 0)
    for (let i = 0; i < this.N; i++) {
      const t = i / this.N
      const pos = this.curve.getPointAt(t)
      const tan = this.curve.getTangentAt(t).normalize()
      const nor = new THREE.Vector3().crossVectors(up, tan).normalize()
      this.samples.push({ pos, tan, nor })
    }
  }

  sampleAt(idx: number): TrackSample {
    return this.samples[((idx % this.N) + this.N) % this.N]
  }

  // Find nearest sample index. With a hint, only search locally (fast path).
  nearestIndex(pos: THREE.Vector3, hint?: number): number {
    if (hint === undefined) {
      let best = 0
      let bestD = Infinity
      for (let i = 0; i < this.N; i += 4) {
        const d = this.samples[i].pos.distanceToSquared(pos)
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
      // refine
      let fbest = best
      let fbestD = bestD
      for (let i = best - 4; i <= best + 4; i++) {
        const s = this.sampleAt(i)
        const d = s.pos.distanceToSquared(pos)
        if (d < fbestD) {
          fbestD = d
          fbest = ((i % this.N) + this.N) % this.N
        }
      }
      return fbest
    }
    let best = hint
    let bestD = this.sampleAt(hint).pos.distanceToSquared(pos)
    for (let off = 1; off <= 30; off++) {
      for (const i of [hint + off, hint - off]) {
        const d = this.sampleAt(i).pos.distanceToSquared(pos)
        if (d < bestD) {
          bestD = d
          best = ((i % this.N) + this.N) % this.N
        }
      }
    }
    return best
  }

  // Signed lateral offset from centerline at given sample (positive = left)
  lateral(pos: THREE.Vector3, idx: number): number {
    const s = this.sampleAt(idx)
    const dx = pos.x - s.pos.x
    const dz = pos.z - s.pos.z
    return dx * s.nor.x + dz * s.nor.z
  }

  onRoad(pos: THREE.Vector3, idx: number): boolean {
    return Math.abs(this.lateral(pos, idx)) <= this.halfWidth + 0.6
  }

  // World position at spline t with lateral offset
  worldAt(t: number, lat: number): THREE.Vector3 {
    const idx = Math.floor((((t % 1) + 1) % 1) * this.N)
    const s = this.sampleAt(idx)
    return new THREE.Vector3(
      s.pos.x + s.nor.x * lat,
      0,
      s.pos.z + s.nor.z * lat,
    )
  }

  checkpointOf(idx: number): number {
    return Math.floor((idx / this.N) * NUM_CHECKPOINTS) % NUM_CHECKPOINTS
  }

  /** Is this position over a pit (cliff / open water)? Falling here calls the rescuer. */
  isPit(idx: number, lat: number): boolean {
    const c = this.course
    if (c.open && c.ocean) return Math.abs(lat) > this.wallDist + 0.5
    if (Math.abs(lat) <= this.halfWidth + 1.6) return false
    const i = ((idx % this.N) + this.N) % this.N
    for (const p of c.pits) {
      const i0 = p.t0 * this.N
      const i1 = p.t1 * this.N
      if (i >= i0 && i <= i1 && (p.side === 0 || Math.sign(lat) === p.side)) return true
    }
    return false
  }

  /** Any sample index inside a pit range on the given side (used to skip rails/clamp visuals). */
  pitAtIndex(i: number, side: 1 | -1): boolean {
    const idx = ((i % this.N) + this.N) % this.N
    for (const p of this.course.pits) {
      if (idx >= p.t0 * this.N && idx <= p.t1 * this.N && (p.side === 0 || p.side === side))
        return true
    }
    return false
  }

  // Spawn grid: 2 columns, behind the start line
  spawnPose(slot: number): { pos: THREE.Vector3; heading: number; idx: number } {
    const back = 12 + Math.floor(slot / 2) * 7 // samples behind start
    const idx = this.N - back
    const s = this.sampleAt(idx)
    const lat = slot % 2 === 0 ? -this.halfWidth * 0.4 : this.halfWidth * 0.4
    const pos = new THREE.Vector3(
      s.pos.x + s.nor.x * lat,
      0,
      s.pos.z + s.nor.z * lat,
    )
    const heading = Math.atan2(s.tan.x, s.tan.z)
    return { pos, heading, idx }
  }
}

// ---------- Mesh building ----------

function makeStrip(
  track: Track,
  latInner: (i: number) => number,
  latOuter: (i: number) => number,
  y: number,
  colorFn: (i: number) => THREE.Color,
  skip?: (i: number) => boolean,
): THREE.BufferGeometry {
  const N = track.N
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= N; i++) {
    const s = track.sampleAt(i)
    const collapsed = skip?.(i) ?? false
    const li = latInner(i)
    const lo = collapsed ? li : latOuter(i)
    positions.push(s.pos.x + s.nor.x * li, y, s.pos.z + s.nor.z * li)
    positions.push(s.pos.x + s.nor.x * lo, y, s.pos.z + s.nor.z * lo)
    const c = colorFn(i)
    colors.push(c.r, c.g, c.b, c.r, c.g, c.b)
    if (i < N) {
      const a = i * 2
      // wind upward-facing (counter-clockwise seen from +Y)
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

// vertical guardrail strip along the spline at fixed lateral distance
function makeWall(
  track: Track,
  lat: number,
  y0: number,
  y1: number,
  colorFn: (i: number) => THREE.Color,
  skip?: (i: number) => boolean,
): THREE.BufferGeometry {
  const N = track.N
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= N; i++) {
    const s = track.sampleAt(i)
    const x = s.pos.x + s.nor.x * lat
    const z = s.pos.z + s.nor.z * lat
    const collapsed = skip?.(i) ?? false
    positions.push(x, y0, z, x, collapsed ? y0 : y1, z)
    const c = colorFn(i)
    colors.push(c.r, c.g, c.b, c.r, c.g, c.b)
    if (i < N) {
      const a = i * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

export interface TrackMeshes {
  group: THREE.Group
  boostPadMats: THREE.MeshBasicMaterial[]
}

export function buildTrackMeshes(track: Track): TrackMeshes {
  const { course } = track
  const theme = course.theme
  const group = new THREE.Group()
  const hw = track.halfWidth

  // Ground — open island maps are a sand RING around the course; beyond the
  // buoy line (and across the deep infield) is open water you can fall into.
  if (course.open && course.ocean) {
    const sandCol = new THREE.Color(theme.ground)
    const sand = new THREE.Mesh(
      makeStrip(track, () => -(track.wallDist + 0.5), () => track.wallDist + 0.5, -0.05, () => sandCol),
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    )
    group.add(sand)
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000),
      new THREE.MeshLambertMaterial({ color: course.ocean }),
    )
    ocean.rotation.x = -Math.PI / 2
    ocean.position.y = -1.4
    group.add(ocean)
  } else {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600),
      new THREE.MeshLambertMaterial({ color: theme.ground }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.06
    group.add(ground)
  }

  // Road surface
  const roadCol = new THREE.Color(theme.road)
  const roadCol2 = roadCol.clone().multiplyScalar(1.12)
  const road = new THREE.Mesh(
    makeStrip(
      track,
      () => -hw,
      () => hw,
      0,
      (i) => (Math.floor(i / 12) % 2 === 0 ? roadCol : roadCol2),
    ),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  )
  group.add(road)

  // Curbs (red/white alternating) on both edges
  const curbA = new THREE.Color(theme.curbA)
  const curbB = new THREE.Color(theme.curbB)
  const curbColor = (i: number) => (Math.floor(i / 7) % 2 === 0 ? curbA : curbB)
  const curbL = new THREE.Mesh(
    makeStrip(track, () => hw, () => hw + 1.1, 0.02, curbColor),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  )
  const curbR = new THREE.Mesh(
    makeStrip(track, () => -hw - 1.1, () => -hw, 0.02, curbColor),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  )
  group.add(curbL, curbR)

  // Guardrails (KartRider-style walls) on both sides — open maps have none,
  // and rails are skipped along pit (cliff) sections so you can fall off.
  if (!course.open) {
    const railA = new THREE.Color(theme.rail)
    const railB = new THREE.Color(theme.railAccent)
    const railColor = (i: number) => (Math.floor(i / 9) % 2 === 0 ? railA : railB)
    const railMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    })
    const skipL = (i: number) => track.pitAtIndex(i, 1)
    const skipR = (i: number) => track.pitAtIndex(i, -1)
    const railL = new THREE.Mesh(makeWall(track, track.wallDist, 0, 0.95, railColor, skipL), railMat)
    const railR = new THREE.Mesh(makeWall(track, -track.wallDist, 0, 0.95, railColor, skipR), railMat)
    group.add(railL, railR)
    // rail top edge (brighter cap line for readability)
    const capMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
    const capColor = () => new THREE.Color(0xffffff)
    group.add(
      new THREE.Mesh(makeWall(track, track.wallDist, 0.95, 1.05, capColor, skipL), capMat),
      new THREE.Mesh(makeWall(track, -track.wallDist, 0.95, 1.05, capColor, skipR), capMat),
    )

    // cliff sections: dark drop face + canyon floor far below
    if (course.pits.length > 0) {
      const cliffMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
      const cliffCol = new THREE.Color(theme.road).multiplyScalar(0.45)
      const floorCol = new THREE.Color(theme.ground).multiplyScalar(0.3)
      for (const side of [1, -1] as const) {
        const inPit = (i: number) => track.pitAtIndex(i, side)
        const noPit = (i: number) => !inPit(i)
        // vertical drop face at the road edge
        group.add(
          new THREE.Mesh(
            makeWall(track, side * (track.halfWidth + 1.6), -10, 0, () => cliffCol, noPit),
            cliffMat,
          ),
        )
        // pit floor far below
        group.add(
          new THREE.Mesh(
            makeStrip(
              track,
              () => side * (track.halfWidth + 1.6),
              () => side * (track.halfWidth + 34),
              -10,
              () => floorCol,
              noPit,
            ),
            cliffMat,
          ),
        )
      }
    }
  }

  // Jump ramps: inclined launch pads across the road
  for (const pad of course.jumpPads) {
    const i0 = Math.floor(pad.t * track.N)
    const i1 = Math.floor((pad.t + pad.len) * track.N)
    const w = hw * 0.8
    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []
    const colA = new THREE.Color(0xffc81e)
    const colB = new THREE.Color(0xff8c2e)
    for (let i = i0; i <= i1; i++) {
      const s = track.sampleAt(i)
      const k = (i - i0) / Math.max(1, i1 - i0)
      const y = k * 1.15 // rises to launch height
      positions.push(s.pos.x - s.nor.x * w, y, s.pos.z - s.nor.z * w)
      positions.push(s.pos.x + s.nor.x * w, y, s.pos.z + s.nor.z * w)
      const c = Math.floor((i - i0) / 4) % 2 === 0 ? colA : colB
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b)
      if (i < i1) {
        const a = (i - i0) * 2
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
    // back face of the ramp (so it doesn't look hollow from behind)
    {
      const s = track.sampleAt(i1)
      const base = positions.length / 3
      positions.push(s.pos.x - s.nor.x * w, 0, s.pos.z - s.nor.z * w)
      positions.push(s.pos.x + s.nor.x * w, 0, s.pos.z + s.nor.z * w)
      colors.push(colB.r, colB.g, colB.b, colB.r, colB.g, colB.b)
      const topA = (i1 - i0) * 2
      indices.push(topA, base, topA + 1, topA + 1, base, base + 1)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    group.add(
      new THREE.Mesh(
        geo,
        new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      ),
    )
  }

  // Center dashed line
  const lineCol = new THREE.Color(theme.line)
  const line = new THREE.Mesh(
    makeStrip(track, () => -0.18, () => 0.18, 0.015, () => lineCol),
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
    }),
  )
  // dashed: hide via alternating degenerate? simpler: keep subtle solid line
  group.add(line)

  // Start/finish line (checker band)
  {
    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []
    const cells = 10
    const rows = 3
    const white = new THREE.Color(0xffffff)
    const black = new THREE.Color(0x222222)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cells; c++) {
        const s0 = track.sampleAt(track.N - 2 + r)
        const s1 = track.sampleAt(track.N - 1 + r)
        const l0 = -hw + (c / cells) * 2 * hw
        const l1 = -hw + ((c + 1) / cells) * 2 * hw
        const col = (r + c) % 2 === 0 ? white : black
        const base = positions.length / 3
        for (const [s, l] of [
          [s0, l0],
          [s0, l1],
          [s1, l0],
          [s1, l1],
        ] as const) {
          positions.push(s.pos.x + s.nor.x * l, 0.025, s.pos.z + s.nor.z * l)
          colors.push(col.r, col.g, col.b)
        }
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.setIndex(indices)
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true }),
    )
    group.add(mesh)
  }

  // Boost pads — striped chevron strips (bright/deep cyan bands)
  const boostPadMats: THREE.MeshBasicMaterial[] = []
  for (const pad of course.boostPads) {
    const i0 = Math.floor(pad.t * track.N)
    const i1 = Math.floor((pad.t + pad.len) * track.N)
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92 })
    boostPadMats.push(mat)
    const bright = new THREE.Color(0x35e6ff)
    const deep = new THREE.Color(0x0d5e8c)
    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []
    for (let i = i0; i <= i1; i++) {
      const s = track.sampleAt(i)
      const w = hw * 0.55
      positions.push(s.pos.x - s.nor.x * w, 0.03, s.pos.z - s.nor.z * w)
      positions.push(s.pos.x + s.nor.x * w, 0.03, s.pos.z + s.nor.z * w)
      const c = Math.floor((i - i0) / 3) % 2 === 0 ? bright : deep
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b)
      if (i < i1) {
        const a = (i - i0) * 2
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.setIndex(indices)
    group.add(new THREE.Mesh(geo, mat))
  }

  return { group, boostPadMats }
}
