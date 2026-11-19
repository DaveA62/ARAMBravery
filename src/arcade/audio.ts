export type ArcadeSound =
  | 'hover'
  | 'tap'
  | 'roll'
  | 'champion'
  | 'spin'
  | 'stop'
  | 'spell'
  | 'level'
  | 'skill'
  | 'cards'
  | 'confirm'
  | 'warning'
  | 'complete'
  | 'copy'
  | 'mode'

export type AudioPreferences = {
  muted: boolean
  master: number
  effects: number
}

type AudioGraph = {
  context: AudioContext
  master: GainNode
  effects: GainNode
  noise: AudioBuffer
}

const quiet = 0.0001
const bounded = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0

export class ArcadeAudio {
  private graph: AudioGraph | undefined
  private active = new Set<AudioScheduledSourceNode>()
  private preferences: AudioPreferences
  private hoverTime = -Infinity

  constructor(preferences: AudioPreferences) {
    this.preferences = preferences
  }

  configure(preferences: AudioPreferences) {
    this.preferences = preferences
    const graph = this.graph
    if (!graph) return

    const now = graph.context.currentTime
    graph.master.gain.cancelScheduledValues(now)
    graph.effects.gain.cancelScheduledValues(now)
    graph.master.gain.setTargetAtTime(preferences.muted ? 0 : bounded(preferences.master), now, 0.015)
    graph.effects.gain.setTargetAtTime(bounded(preferences.effects), now, 0.015)
    if (preferences.muted) this.stop()
  }

  unlock() {
    if (this.preferences.muted || typeof window === 'undefined') return
    const fallback = (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    const Context = window.AudioContext ?? fallback
    if (!Context) return

    try {
      if (!this.graph) {
        const context = new Context()
        const master = context.createGain()
        const effects = context.createGain()
        const limiter = context.createDynamicsCompressor()
        const noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.6), context.sampleRate)
        const samples = noise.getChannelData(0)

        for (let index = 0; index < samples.length; index++) {
          samples[index] = Math.random() * 2 - 1
        }

        master.gain.value = bounded(this.preferences.master)
        effects.gain.value = bounded(this.preferences.effects)
        limiter.threshold.value = -13
        limiter.ratio.value = 6
        effects.connect(limiter).connect(master).connect(context.destination)
        this.graph = { context, master, effects, noise }
      }

      if (this.graph.context.state !== 'running') {
        void this.graph.context.resume().catch(() => {})
      }
    } catch {
      // Audio devices may be unavailable. The visual sequence still runs.
    }
  }

  stop() {
    for (const source of this.active) {
      try { source.stop() } catch { /* Already ended. */ }
    }
    this.active.clear()
  }

  dispose() {
    this.stop()
    const context = this.graph?.context
    this.graph = undefined
    if (context && context.state !== 'closed') void context.close().catch(() => {})
  }

  private schedule(source: AudioScheduledSourceNode, nodes: AudioNode[], at: number, duration: number) {
    this.active.add(source)
    source.onended = () => {
      this.active.delete(source)
      source.disconnect()
      for (const node of nodes) node.disconnect()
    }
    source.start(at)
    source.stop(at + duration)
  }

  private tone(at: number, duration: number, from: number, to: number, amplitude: number, wave: OscillatorType) {
    const graph = this.graph
    if (!graph) return

    const oscillator = graph.context.createOscillator()
    const gain = graph.context.createGain()
    oscillator.type = wave
    oscillator.frequency.setValueAtTime(from, at)
    oscillator.frequency.exponentialRampToValueAtTime(to, at + duration)
    gain.gain.setValueAtTime(quiet, at)
    gain.gain.exponentialRampToValueAtTime(amplitude, at + Math.min(0.015, duration / 3))
    gain.gain.exponentialRampToValueAtTime(quiet, at + duration)
    oscillator.connect(gain).connect(graph.effects)
    this.schedule(oscillator, [gain], at, duration)
  }

  private grit(at: number, duration: number, center: number, amplitude: number, type: BiquadFilterType = 'bandpass') {
    const graph = this.graph
    if (!graph) return

    const source = graph.context.createBufferSource()
    const filter = graph.context.createBiquadFilter()
    const gain = graph.context.createGain()
    source.buffer = graph.noise
    filter.type = type
    filter.frequency.value = center
    filter.Q.value = 0.65
    gain.gain.setValueAtTime(quiet, at)
    gain.gain.exponentialRampToValueAtTime(amplitude, at + Math.min(0.008, duration / 3))
    gain.gain.exponentialRampToValueAtTime(quiet, at + duration)
    source.connect(filter).connect(gain).connect(graph.effects)
    this.schedule(source, [filter, gain], at, duration)
  }

  play(sound: ArcadeSound, chaotic = false) {
    const graph = this.graph
    if (!graph || this.preferences.muted || !this.preferences.master || !this.preferences.effects || graph.context.state === 'closed') return
    // A context resumed by the current gesture can accept queued sounds. A hover
    // never unlocks or resumes the context.
    if (sound === 'hover' && graph.context.state !== 'running') return

    const now = graph.context.currentTime + 0.01
    const detune = chaotic ? 0.87 : 1
    const tone = (
      delay: number, duration: number, from: number, to: number, volume: number, wave: OscillatorType = 'sine',
    ) => this.tone(now + delay, duration, from * detune, to * detune, volume, wave)
    const grit = (
      delay: number, duration: number, center: number, volume: number, type?: BiquadFilterType,
    ) => this.grit(now + delay, duration, center, volume, type)

    switch (sound) {
      case 'hover':
        if (now - this.hoverTime < 0.115) return
        this.hoverTime = now
        tone(0, 0.073, 360, 770, 0.075, 'triangle')
        grit(0, 0.023, 2600, 0.05)
        break
      case 'tap':
        tone(0, 0.05, 410, 200, 0.12, 'triangle')
        break
      case 'roll':
        grit(0, 0.16, 460, 0.37, 'lowpass')
        grit(0.044, 0.045, 1700, 0.45)
        tone(0, 0.25, 122, 40, 0.38, 'triangle')
        tone(0.052, 0.24, 148, 255, chaotic ? 0.17 : 0.11, 'sawtooth')
        break
      case 'champion':
        grit(0, 0.26, 740, 0.18, 'lowpass')
        tone(0, 0.35, 100, 49, 0.30)
        tone(0.035, 0.38, 293, 293, 0.12, 'triangle')
        tone(0.081, 0.39, 440, 440, 0.07)
        tone(0.121, 0.38, 587, 587, 0.064)
        break
      case 'spin':
        grit(0, 0.46, 2050, 0.079)
        tone(0, 0.35, 150, 245, 0.053, 'triangle')
        for (const delay of [0.02, 0.065, 0.11, 0.16, 0.22, 0.29, 0.37]) {
          grit(delay, 0.026, 1800, 0.085)
        }
        break
      case 'stop':
        grit(0, 0.063, 1450, chaotic ? 0.42 : 0.31)
        tone(0, 0.12, 172, 74, 0.28, 'triangle')
        tone(0.019, 0.11, 570, 425, 0.083, 'square')
        break
      case 'spell':
        grit(0, 0.07, 4300, 0.19, 'highpass')
        tone(0, 0.27, 500, 1040, 0.13, 'triangle')
        tone(0.044, 0.25, 820, 1580, 0.08)
        break
      case 'level':
        tone(0, 0.08, 520, 690, 0.10)
        break
      case 'skill':
        tone(0, 0.073, 440, 550, 0.05, 'triangle')
        break
      case 'cards':
        grit(0, 0.095, 1700, 0.15)
        grit(0.062, 0.08, 2150, 0.12)
        grit(0.12, 0.05, 2400, 0.11)
        tone(0.02, 0.35, 290, 730, 0.107, 'triangle')
        break
      case 'warning':
        grit(0, 0.15, 730, 0.16)
        for (const delay of [0.041, 0.097, 0.169]) grit(delay, 0.024, 1660, 0.14)
        tone(0, 0.20, 235, 132, 0.24, 'sawtooth')
        tone(0.125, 0.21, 185, 105, 0.19, 'triangle')
        break
      case 'complete':
        grit(0, 0.22, 430, 0.26, 'lowpass')
        tone(0, 0.48, 105, 42, 0.34, 'triangle')
        tone(0.019, 0.25, 392, 392, 0.14, 'triangle')
        tone(0.077, 0.24, 494, 494, 0.12, 'triangle')
        tone(0.135, 0.26, 587, 587, 0.13, 'triangle')
        tone(0.19, 0.48, 784, 784, 0.11, 'triangle')
        tone(0.2, 0.43, 1175, 1175, 0.077)
        break
      case 'confirm':
      case 'copy':
        tone(0, 0.13, 523, 523, 0.12, 'triangle')
        tone(0.055, 0.19, 784, 790, 0.11)
        if (sound === 'confirm') tone(0.10, 0.23, 1046, 1046, 0.07)
        break
      case 'mode':
        grit(0, 0.12, chaotic ? 420 : 2300, 0.16)
        tone(0, 0.23, chaotic ? 285 : 360, chaotic ? 130 : 680, 0.17, 'triangle')
        break
    }
  }
}
