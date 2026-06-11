// KartVisual — wraps a kart body + rider and brings it to life:
// rolling wheels, steering front axle, body roll/pitch, suspension bob,
// rider lean and per-kart accessories. Used by the player, AIs, remotes
// and the ghost alike.
import * as THREE from 'three'
import { Assets, makeRider } from './assets'
import { getKart, getCharacter } from './roster'

// Some poly.pizza models bake a flat display mat into the body mesh.
// Strip triangles that lie flat on the model's lowest plane.
function stripBasePlate(root: THREE.Object3D) {
  const whole = new THREE.Box3().setFromObject(root)
  const size = new THREE.Vector3()
  whole.getSize(size)
  root.updateWorldMatrix(true, true)
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    let geo = mesh.geometry as THREE.BufferGeometry
    if (!geo.index) return stripNonIndexed(mesh, whole, size)
    const pos = geo.attributes.position
    const idx = geo.index.array
    const keep: number[] = []
    const v = new THREE.Vector3()
    const ys: number[] = []
    for (let i = 0; i < idx.length; i += 3) {
      let flat = true
      for (let j = 0; j < 3; j++) {
        v.fromBufferAttribute(pos, idx[i + j])
        mesh.localToWorld(v)
        ys[j] = v.y
        if (v.y > whole.min.y + size.y * 0.075) flat = false
      }
      if (!flat) keep.push(idx[i], idx[i + 1], idx[i + 2])
    }
    if (keep.length < idx.length) geo.setIndex(keep)
  })
}

function stripNonIndexed(mesh: THREE.Mesh, whole: THREE.Box3, size: THREE.Vector3) {
  const geo = mesh.geometry as THREE.BufferGeometry
  const pos = geo.attributes.position
  const v = new THREE.Vector3()
  const keepIdx: number[] = []
  for (let i = 0; i < pos.count; i += 3) {
    let flat = true
    for (let j = 0; j < 3; j++) {
      v.fromBufferAttribute(pos, i + j)
      mesh.localToWorld(v)
      if (v.y > whole.min.y + size.y * 0.075) flat = false
    }
    if (!flat) keepIdx.push(i, i + 1, i + 2)
  }
  if (keepIdx.length < pos.count) geo.setIndex(keepIdx)
}

export class KartVisual {
  group = new THREE.Group() // world transform (position + heading)
  body = new THREE.Group() // rolls / pitches inside the group
  private wheels: { node: THREE.Object3D; front: boolean; radius: number; baseY: number }[] = []
  private rider: THREE.Group | null = null
  private hover = false
  private spin = 0
  private roll = 0
  private pitch = 0
  private steerVis = 0
  private prevSpeed = 0
  private bobT = Math.random() * 10

  constructor(assets: Assets, kartId: string, charId: string) {
    const def = getKart(kartId)
    this.hover = !!def.hover
    const model = assets.spawn(def.model, 2.4, 'z')
    if (model) {
      model.rotation.y += def.modelYaw
      this.body.add(model)
      // remove any baked-in display mat lying on the lowest plane.
      // Geometry is cloned first — spawn() shares geometry between clones.
      model.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.isMesh) mesh.geometry = mesh.geometry.clone()
      })
      stripBasePlate(model)
      // collect wheel nodes (Car Kit ships them as named children)
      model.traverse((o) => {
        if (o.name.startsWith('wheel-')) {
          const box = new THREE.Box3().setFromObject(o)
          const size = new THREE.Vector3()
          box.getSize(size)
          this.wheels.push({
            node: o,
            front: o.name.includes('front'),
            radius: Math.max(0.12, size.y / 2),
            baseY: o.position.y,
          })
        }
      })
    } else {
      const fallback = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.8, 2.4),
        new THREE.MeshLambertMaterial({ color: 0xe04438 }),
      )
      fallback.position.y = 0.5
      this.body.add(fallback)
    }

    const rider = makeRider(getCharacter(charId))
    rider.scale.setScalar(def.riderScale)
    rider.position.set(...def.riderPos)
    this.rider = rider
    this.body.add(rider)

    this.addAccessories(kartId)
    this.group.add(this.body)
  }

  /** small per-kart flair so each body reads as "tuned" */
  private addAccessories(kartId: string) {
    switch (kartId) {
      case 'red': {
        // tiny pennant flag on an antenna
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4),
          new THREE.MeshBasicMaterial({ color: 0xdddddd }),
        )
        pole.position.set(-0.55, 1.0, -0.9)
        this.body.add(pole)
        const flag = new THREE.Mesh(
          new THREE.ConeGeometry(0.16, 0.4, 3),
          new THREE.MeshLambertMaterial({ color: 0xffe14d, side: THREE.DoubleSide }),
        )
        flag.rotation.z = Math.PI / 2
        flag.position.set(-0.42, 1.36, -0.9)
        this.body.add(flag)
        break
      }
      case 'green': {
        // rally roof spoiler
        const wing = new THREE.Mesh(
          new THREE.BoxGeometry(1.3, 0.07, 0.34),
          new THREE.MeshLambertMaterial({ color: 0x26233a }),
        )
        wing.position.set(0, 1.06, -0.95)
        wing.rotation.x = -0.18
        this.body.add(wing)
        for (const sx of [-0.5, 0.5]) {
          const strut = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.22, 0.06),
            new THREE.MeshLambertMaterial({ color: 0x26233a }),
          )
          strut.position.set(sx, 0.92, -0.95)
          this.body.add(strut)
        }
        break
      }
      case 'orange': {
        // chrome twin exhausts
        const mat = new THREE.MeshLambertMaterial({ color: 0xc9ccd6 })
        for (const sx of [-0.34, 0.34]) {
          const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.4, 8), mat)
          pipe.rotation.x = Math.PI / 2
          pipe.position.set(sx, 0.3, -1.25)
          this.body.add(pipe)
        }
        break
      }
      case 'white':
        // the classic go-kart already comes with its own pennant — no extras
        break
    }
  }

  /**
   * Animate. speed in world units/s, steer -1..1 (1 = left), drift -1|0|1.
   * Call every frame for any kart (player / AI / remote / ghost).
   */
  update(dt: number, speed: number, steer: number, drift: number, airborne: boolean) {
    // wheels roll with travel and the front axle steers
    this.spin += (speed / 0.3) * dt
    const steerTarget = steer * 0.42
    this.steerVis += (steerTarget - this.steerVis) * Math.min(1, 10 * dt)
    for (const w of this.wheels) {
      w.node.rotation.x = this.spin * (0.3 / w.radius) * 0.5
      if (w.front) w.node.rotation.y = this.steerVis
    }

    // body roll into corners (drift leans harder), pitch under accel/brake
    const accel = (speed - this.prevSpeed) / Math.max(dt, 0.001)
    this.prevSpeed = speed
    const speedK = Math.min(1, Math.abs(speed) / 24)
    const rollTarget =
      -steer * 0.06 * speedK - drift * 0.1 + (drift !== 0 ? -steer * 0.03 : 0)
    const pitchTarget = THREE.MathUtils.clamp(-accel * 0.0035, -0.06, 0.085)
    this.roll += (rollTarget - this.roll) * Math.min(1, 8 * dt)
    this.pitch += (pitchTarget - this.pitch) * Math.min(1, 6 * dt)
    this.body.rotation.z = this.roll
    this.body.rotation.x = this.pitch

    // suspension bob — hover karts float higher with a slow drift
    this.bobT += dt * (this.hover ? 2.2 : 4 + speedK * 14)
    const bob = this.hover
      ? 0.22 + Math.sin(this.bobT) * 0.07
      : airborne
        ? 0
        : Math.sin(this.bobT) * 0.012 * (0.3 + speedK)
    this.body.position.y = bob

    // rider leans against the roll and braces in drifts
    if (this.rider) {
      this.rider.rotation.z = -this.roll * 1.8
      this.rider.rotation.x = -this.pitch * 1.2 + (drift !== 0 ? 0.06 : 0)
    }
  }
}
