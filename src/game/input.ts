// Keyboard + touch input. Arrows/WASD drive, Shift/Space drift, Ctrl/E uses item, R resets.
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
    if (e.code === 'ControlLeft' || e.code === 'KeyE') this.state.useItem = true
    if (e.code === 'KeyR') this.state.reset = true
    if (
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)
    )
      e.preventDefault()
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

  update() {
    const k = this.keys
    let throttle = 0
    let steer = 0
    if (k.has('ArrowUp') || k.has('KeyW')) throttle += 1
    if (k.has('ArrowDown') || k.has('KeyS')) throttle -= 1
    if (k.has('ArrowLeft') || k.has('KeyA')) steer += 1
    if (k.has('ArrowRight') || k.has('KeyD')) steer -= 1
    const drift = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('Space')

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
