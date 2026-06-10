// Keyboard + touch input with configurable bindings (see keymap.ts).
import { keysFor, allBoundKeys } from './keymap'

export interface InputState {
  throttle: number // -1..1
  steer: number // -1..1 (1 = left)
  drift: boolean
  useItem: boolean // edge-triggered, consumed by game
  reset: boolean // edge-triggered
}

export class Input {
  state: InputState = { throttle: 0, steer: 0, drift: false, useItem: false, reset: false }
  private keys = new Set<string>()
  private disposed = false
  // touch zones state
  touch = { active: false, throttle: 0, steer: 0, drift: false }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return
    this.keys.add(e.code)
    if (keysFor('item').includes(e.code)) this.state.useItem = true
    if (keysFor('reset').includes(e.code)) this.state.reset = true
    if (allBoundKeys().has(e.code)) e.preventDefault()
  }
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
  }

  attach() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
  }

  consumeUseItem(): boolean {
    const v = this.state.useItem
    this.state.useItem = false
    return v
  }

  consumeReset(): boolean {
    const v = this.state.reset
    this.state.reset = false
    return v
  }

  private down(action: 'accel' | 'brake' | 'left' | 'right' | 'drift'): boolean {
    return keysFor(action).some((c) => this.keys.has(c))
  }

  update() {
    let throttle = 0
    let steer = 0
    if (this.down('accel')) throttle += 1
    if (this.down('brake')) throttle -= 1
    if (this.down('left')) steer += 1
    if (this.down('right')) steer -= 1
    const drift = this.down('drift')

    if (this.touch.active) {
      throttle = this.touch.throttle
      steer = this.touch.steer
      this.state.drift = this.touch.drift
    } else {
      this.state.drift = drift
    }
    this.state.throttle = throttle
    this.state.steer = steer
  }
}
