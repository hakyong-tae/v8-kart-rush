// KartVisual — wraps a kart body + rider and brings it to life:
// rolling wheels, steering front axle, body roll/pitch, suspension bob,
// rider lean and per-kart accessories. Used by the player, AIs, remotes
// and the ghost alike.
import * as THREE from 'three'
import { Assets, makeRider } from './assets'
import { getKart, getCharacter } from './roster'

const KART_MODEL_YAW = 0 // Car Kit vehicles natively face +Z

export class KartVisual {
  group = new THREE.Group() // world transform (position + heading)
  body = new THREE.Group() // rolls / pitches inside the group
  private wheels: { node: THREE.Object3D; front: boolean; radius: number; baseY: number }[] = []
  private rider: THREE.Group | null = null
  private spin = 0
  private roll = 0
  private pitch = 0
  private steerVis = 0
  private prevSpeed = 0
  private bobT = Math.random() * 10

  constructor(assets: Assets, kartId: string, charId: string) {
    const def = getKart(kartId)
    const model = assets.spawn(def.model, 2.4, 'z')
    if (model) {
      model.rotation.y += KART_MODEL_YAW
      this.body.add(model)
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
      case 'white': {
        // neon underglow
        const glow = new THREE.Mesh(
          new THREE.PlaneGeometry(2.0, 3.0),
          new THREE.MeshBasicMaterial({
            color: 0x37c8ff,
            transparent: true,
            opacity: 0.32,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        )
        glow.rotation.x = -Math.PI / 2
        glow.position.y = 0.06
        this.body.add(glow)
        break
      }
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

    // suspension bob (settles when airborne)
    this.bobT += dt * (4 + speedK * 14)
    const bob = airborne ? 0 : Math.sin(this.bobT) * 0.012 * (0.3 + speedK)
    this.body.position.y = bob

    // rider leans against the roll and braces in drifts
    if (this.rider) {
      this.rider.rotation.z = -this.roll * 1.8
      this.rider.rotation.x = -this.pitch * 1.2 + (drift !== 0 ? 0.06 : 0)
    }
  }
}
