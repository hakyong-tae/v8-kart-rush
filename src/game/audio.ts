// Tiny WebAudio synth — no audio assets needed.

// 카트별 엔진 음색 — 무게 클래스/차체 크기로 아이들 피치·회전·필터가 달라진다.
export interface EngineProfile {
  idleFreq: number // 정지 시 기본 Hz (무거울수록 낮음 = 굵은 배기음)
  revFreq: number // 풀회전에서 더해지는 Hz
  harmonic: number // 2번 오실레이터 배음비 (높을수록 날카로움)
  filterBase: number
  filterRev: number
  vol: number // 음량 배율
}

/** 무게 클래스 + 차체 크기로 엔진 프로파일 생성 (hover=전기 톤) */
export function engineProfileFor(
  weightClass: 'light' | 'medium' | 'heavy',
  size: number,
  hover = false,
): EngineProfile {
  if (hover)
    return { idleFreq: 92, revFreq: 250, harmonic: 3.0, filterBase: 900, filterRev: 2600, vol: 0.8 }
  const base: Record<string, EngineProfile> = {
    light: { idleFreq: 72, revFreq: 210, harmonic: 2.0, filterBase: 620, filterRev: 2200, vol: 0.9 },
    medium: { idleFreq: 55, revFreq: 175, harmonic: 1.5, filterBase: 500, filterRev: 1800, vol: 1.0 },
    heavy: { idleFreq: 43, revFreq: 145, harmonic: 1.25, filterBase: 380, filterRev: 1450, vol: 1.18 },
  }
  const p = { ...base[weightClass] }
  // 같은 클래스 안에서도 차체 크기로 미세 차등 (큰 차체 = 살짝 더 낮게)
  const k = 1 - (size - 1.8) * 0.035
  p.idleFreq *= k
  p.revFreq *= k
  return p
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private engineOsc: OscillatorNode | null = null
  private engineOsc2: OscillatorNode | null = null
  private engineGain: GainNode | null = null
  private engineFilter: BiquadFilterNode | null = null
  muted = false
  // 현재 카트 엔진 프로파일 (기본 = medium). Game이 카트 선택 시 설정.
  private engineProfile: EngineProfile = engineProfileFor('medium', 2.4)
  private engineRev = 0 // 현재 회전(rev) — 부드러운 하강용
  sfxVol = Number(localStorage.getItem('v8kart_sfxvol') ?? 0.8)
  bgmVol = Number(localStorage.getItem('v8kart_bgmvol') ?? 0.7)

  setSfxVol(v: number) {
    this.sfxVol = Math.max(0, Math.min(1, v))
    localStorage.setItem('v8kart_sfxvol', String(this.sfxVol))
  }

  setBgmVol(v: number) {
    this.bgmVol = Math.max(0, Math.min(1, v))
    localStorage.setItem('v8kart_bgmvol', String(this.bgmVol))
  }

  // real CC0 samples (Kenney audio packs) with synth fallback
  private buffers = new Map<string, AudioBuffer>()
  private samplesRequested = false

  private loadSamples() {
    if (this.samplesRequested || !this.ctx) return
    this.samplesRequested = true
    const files: Record<string, string> = {
      pickup: 'sfx/confirmation_001.ogg',
      gaugeFull: 'sfx/confirmation_002.ogg',
      click: 'sfx/click_002.ogg',
      hit: 'sfx/impactGeneric_light_001.ogg',
      wall: 'sfx/impactMetal_heavy_002.ogg',
      finish: 'sfx/finish_jingle.ogg',
    }
    for (const [name, url] of Object.entries(files)) {
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((b) => this.ctx!.decodeAudioData(b))
        .then((buf) => this.buffers.set(name, buf))
        .catch(() => {}) // fall back to synth
    }
  }

  private playSample(name: string, vol = 1, channel: 'sfx' | 'bgm' = 'sfx'): boolean {
    const buf = this.buffers.get(name)
    if (!this.ctx || !buf || this.muted) return false
    const mul = channel === 'bgm' ? this.bgmVol : this.sfxVol
    if (mul <= 0.001) return true // muted by volume — handled
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    const g = this.ctx.createGain()
    g.gain.value = vol * mul
    src.connect(g)
    g.connect(this.ctx.destination)
    src.start()
    return true
  }

  uiClick() {
    if (!this.playSample('click', 0.5)) this.blip(500, 0.05, 'square', 0.05)
  }

  ensure() {
    if (this.ctx) return
    try {
      this.ctx = new AudioContext()
      this.loadSamples()
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

  setEngineProfile(p: EngineProfile) {
    this.engineProfile = p
  }

  /**
   * @param speed   현재 속도
   * @param baseMax 부스터 없는 기본 최고속도 (rev>1 = 부스터로 오버스피드)
   * @param throttle 스로틀 입력
   * rev를 1로 클램프하지 않아서 부스터로 넘겼다가 원속도로 떨어질 때 피치가 내려온다(RPM 다운).
   */
  setEngine(speed: number, baseMax: number, throttle: number) {
    if (!this.ctx || !this.engineOsc || !this.engineGain || this.muted) return
    const p = this.engineProfile
    // rev: 0~약1.6 (부스터 구간 1 초과). 목표를 향해 부드럽게 따라가 급변 방지.
    const target = Math.min(1.6, Math.abs(speed) / baseMax)
    this.engineRev += (target - this.engineRev) * 0.5
    const rev = this.engineRev
    const f = p.idleFreq + rev * p.revFreq
    this.engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05)
    this.engineOsc2!.frequency.setTargetAtTime(f * p.harmonic + 3, this.ctx.currentTime, 0.05)
    // 오버스피드(부스터) 구간엔 살짝 더 크게 — 회전이 붙은 느낌
    const over = Math.max(0, rev - 1)
    const vol = (0.018 + Math.min(1, rev) * 0.05 + over * 0.03 + Math.abs(throttle) * 0.015) * p.vol * this.sfxVol
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : vol, this.ctx.currentTime, 0.08)
    this.engineFilter!.frequency.setTargetAtTime(p.filterBase + rev * p.filterRev, this.ctx.currentTime, 0.1)
  }

  stopEngine() {
    if (this.ctx && this.engineGain)
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1)
  }

  private blip(
    freq: number,
    dur: number,
    type: OscillatorType = 'sine',
    vol = 0.12,
    slideTo?: number,
    channel: 'sfx' | 'bgm' = 'sfx',
  ) {
    if (!this.ctx || this.muted) return
    const mul = channel === 'bgm' ? this.bgmVol : this.sfxVol
    if (mul <= 0.001) return
    const t = this.ctx.currentTime
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
    g.gain.setValueAtTime(vol * mul, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g)
    g.connect(this.ctx.destination)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  countdownBeep(final: boolean) {
    this.blip(final ? 880 : 440, final ? 0.5 : 0.18, 'square', 0.1)
  }
  gaugeFull() {
    if (this.playSample('gaugeFull', 0.6)) return
    this.blip(784, 0.09, 'square', 0.12)
    setTimeout(() => this.blip(1175, 0.18, 'square', 0.12), 90)
  }
  booster() {
    this.blip(180, 0.7, 'sawtooth', 0.14, 1320)
  }
  wallBump() {
    if (!this.playSample('wall', 0.4)) this.blip(110, 0.16, 'square', 0.14, 70)
  }
  pickup() {
    if (!this.playSample('pickup', 0.55)) this.blip(660, 0.1, 'triangle', 0.12, 990)
  }
  boost() {
    this.blip(220, 0.45, 'sawtooth', 0.1, 880)
  }
  driftTick(tier: number) {
    this.blip(tier >= 2 ? 1320 : 990, 0.08, 'square', 0.06)
  }
  hit() {
    this.playSample('hit', 0.85)
    this.blip(160, 0.4, 'sawtooth', 0.1, 60) // layered thud
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
    if (this.playSample('finish', 0.8, 'bgm')) return
    const notes = [523, 659, 784, 1047]
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.22, 'triangle', 0.13), i * 140))
  }

  // ---------- chiptune BGM (step sequencer, no audio assets) ----------
  private musicTimer: number | null = null
  private musicStep = 0

  startMusic() {
    this.ensure()
    if (!this.ctx || this.musicTimer !== null) return
    const BPM = 138
    const stepDur = 60 / BPM / 2 // 8th notes
    // cheerful 32-step loop (KartRider-ish upbeat major) — freqs in Hz
    const E4 = 329.6, G4 = 392, A4 = 440, B4 = 493.9, C5 = 523.3, D5 = 587.3, E5 = 659.3, G5 = 784
    const lead = [
      E5, 0, G5, 0, E5, D5, C5, 0, B4, 0, C5, D5, E5, 0, C5, 0,
      A4, 0, C5, 0, E5, 0, D5, C5, B4, C5, D5, 0, G4, 0, B4, 0,
    ]
    const bassNotes = [82.4, 82.4, 110, 110, 65.4, 65.4, 98, 98] // E A C G
    this.musicStep = 0
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || this.muted) {
        this.musicStep++
        return
      }
      const s = this.musicStep % 32
      const n = lead[s]
      if (n) this.blip(n, stepDur * 0.9, 'square', 0.035, undefined, 'bgm')
      if (s % 2 === 0)
        this.blip(bassNotes[Math.floor(s / 4) % 8], stepDur * 1.6, 'triangle', 0.06, undefined, 'bgm')
      if (s % 4 === 2) this.blip(8000, 0.03, 'square', 0.012, undefined, 'bgm') // hat-ish tick
      this.musicStep++
    }, stepDur * 1000)
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer)
      this.musicTimer = null
    }
  }
}

export const audio = new AudioEngine()
// 디버그/테스트용 핸들 (window.__game 패턴과 동일) — 뮤트 토글 등
if (typeof window !== 'undefined') (window as any).__audio = audio
