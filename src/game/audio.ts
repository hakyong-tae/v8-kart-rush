// Tiny WebAudio synth — no audio assets needed.
export class AudioEngine {
  private ctx: AudioContext | null = null
  private engineOsc: OscillatorNode | null = null
  private engineOsc2: OscillatorNode | null = null
  private engineGain: GainNode | null = null
  private engineFilter: BiquadFilterNode | null = null
  muted = false

  ensure() {
    if (this.ctx) return
    try {
      this.ctx = new AudioContext()
      const g = this.ctx.createGain()
      g.gain.value = 0
      const f = this.ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 900
      const o1 = this.ctx.createOscillator()
      o1.type = 'sawtooth'
      const o2 = this.ctx.createOscillator()
      o2.type = 'square'
      o1.connect(f)
      o2.connect(f)
      f.connect(g)
      g.connect(this.ctx.destination)
      o1.start()
      o2.start()
      this.engineOsc = o1
      this.engineOsc2 = o2
      this.engineGain = g
      this.engineFilter = f
    } catch {
      this.ctx = null
    }
  }

  resume() {
    this.ensure()
    this.ctx?.resume().catch(() => {})
  }

  setEngine(speed: number, maxSpeed: number, throttle: number) {
    if (!this.ctx || !this.engineOsc || !this.engineGain || this.muted) return
    const r = Math.min(1, Math.abs(speed) / maxSpeed)
    const f = 55 + r * 165
    this.engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05)
    this.engineOsc2!.frequency.setTargetAtTime(f * 1.5 + 3, this.ctx.currentTime, 0.05)
    const vol = 0.018 + r * 0.05 + Math.abs(throttle) * 0.015
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : vol, this.ctx.currentTime, 0.08)
    this.engineFilter!.frequency.setTargetAtTime(500 + r * 1800, this.ctx.currentTime, 0.1)
  }

  stopEngine() {
    if (this.ctx && this.engineGain)
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1)
  }

  private blip(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.12, slideTo?: number) {
    if (!this.ctx || this.muted) return
    const t = this.ctx.currentTime
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g)
    g.connect(this.ctx.destination)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  countdownBeep(final: boolean) {
    this.blip(final ? 880 : 440, final ? 0.5 : 0.18, 'square', 0.1)
  }
  pickup() {
    this.blip(660, 0.1, 'triangle', 0.12, 990)
  }
  boost() {
    this.blip(220, 0.45, 'sawtooth', 0.1, 880)
  }
  driftTick(tier: number) {
    this.blip(tier >= 2 ? 1320 : 990, 0.08, 'square', 0.06)
  }
  hit() {
    this.blip(160, 0.4, 'sawtooth', 0.16, 60)
  }
  fire() {
    this.blip(520, 0.25, 'square', 0.1, 130)
  }
  lap() {
    this.blip(523, 0.12, 'triangle', 0.12)
    setTimeout(() => this.blip(659, 0.12, 'triangle', 0.12), 110)
    setTimeout(() => this.blip(784, 0.2, 'triangle', 0.12), 220)
  }
  finish() {
    const notes = [523, 659, 784, 1047]
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.22, 'triangle', 0.13), i * 140))
  }
}

export const audio = new AudioEngine()
