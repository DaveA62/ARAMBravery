export type ArcadeSound =
  | 'hover'
  | 'charge'
  | 'tap'
  | 'roll'
  | 'champion'
  | 'spin'
  | 'brake'
  | 'stop'
  | 'spell'
  | 'level'
  | 'skill'
  | 'cards'
  | 'confirm'
  | 'veto'
  | 'complete'
  | 'copy'
  | 'mode'

export type AudioPreferences = {
  muted: boolean
  master: number
  effects: number
}

type Wave = OscillatorType | 'brass' | 'glass' | 'steel'
type Tone = (at: number, length: number, from: number, to: number, gain: number, wave?: Wave, pan?: number) => void
type Grit = (at: number, length: number, center: number, gain: number, type?: BiquadFilterType, endCenter?: number, pan?: number) => void
type SoundDetails = { championRoles?: readonly string[]; lane?: number; short?: boolean }

type AudioGraph = {
  context: AudioContext
  master: GainNode
  effects: GainNode
  noise: AudioBuffer
  waves: Record<'brass' | 'glass' | 'steel', PeriodicWave>
}

const quiet = 0.0001
const bounded = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0

const harmonics = {
  brass: [0, 1, 0.49, 0.29, 0.13, 0.08, 0.045, 0.025],
  glass: [0, 1, 0.05, 0.23, 0, 0.095, 0, 0.06, 0, 0.02],
  steel: [0, 0.47, 0.05, 0.31, 0, 0.35, 0.02, 0.22, 0, 0.1],
} as const

const buildWave = (context: AudioContext, amplitudes: readonly number[]) =>
  context.createPeriodicWave(new Float32Array(amplitudes.length), new Float32Array(amplitudes))

function connectVoice(source: AudioNode, graph: AudioGraph, pan: number) {
  if (!pan || !graph.context.createStereoPanner) {
    source.connect(graph.effects)
    return []
  }

  const panner = graph.context.createStereoPanner()
  panner.pan.value = Math.max(-1, Math.min(1, pan))
  source.connect(panner).connect(graph.effects)
  return [panner]
}

// Original motifs. The first recognized champion role chooses the instrumentation
// and phrase, while the cabinet impact gives every reveal the same physical weight.
const championThemes = {
  Assassin(tone: Tone, grit: Grit) {
    grit(0.055, 0.27, 3800, 0.075, 'bandpass', 850, -0.44)
    tone(0.075, 0.19, 440, 391, 0.10, 'steel', -0.32)
    tone(0.22, 0.19, 349, 349, 0.10, 'glass', 0.28)
    tone(0.36, 0.73, 277, 261.6, 0.11, 'triangle')
    tone(0.43, 0.73, 138.6, 130.8, 0.085, 'sine')
    tone(0.67, 0.64, 1046, 996, 0.031, 'glass', 0.49)
  },
  Fighter(tone: Tone, grit: Grit) {
    grit(0.05, 0.12, 655, 0.21, 'bandpass', 180)
    grit(0.27, 0.105, 790, 0.13, 'bandpass', 270, -0.15)
    tone(0.05, 0.30, 110, 98, 0.14, 'brass')
    tone(0.2, 0.25, 146.8, 146.8, 0.085, 'brass', -0.25)
    tone(0.38, 0.27, 164.8, 164.8, 0.093, 'brass', 0.28)
    tone(0.57, 0.68, 220, 219, 0.095, 'brass')
    tone(0.60, 0.65, 329.6, 328, 0.063, 'triangle', 0.23)
  },
  Mage(tone: Tone, grit: Grit) {
    grit(0.06, 0.39, 1050, 0.105, 'bandpass', 6000, 0.28)
    tone(0.08, 0.35, 523.3, 523.3, 0.084, 'glass', -0.50)
    tone(0.21, 0.36, 622.3, 622.3, 0.09, 'glass', 0.30)
    tone(0.34, 0.38, 784, 784, 0.089, 'glass', -0.22)
    tone(0.47, 0.47, 1108.7, 1108.7, 0.073, 'glass', 0.38)
    tone(0.60, 0.68, 1046.5, 1046.5, 0.084, 'glass', 0.05)
    tone(0.62, 0.69, 261.6, 261.6, 0.101, 'sine')
    tone(0.83, 0.51, 1568, 1568, 0.024, 'glass', -0.47)
  },
  Marksman(tone: Tone, grit: Grit) {
    grit(0.04, 0.08, 1700, 0.26, 'bandpass', 370, -0.18)
    grit(0.20, 0.10, 3700, 0.12, 'bandpass', 550, 0.36)
    tone(0.07, 0.14, 261.6, 246.9, 0.12, 'triangle', -0.24)
    tone(0.16, 0.14, 392, 392, 0.087, 'steel', -0.4)
    tone(0.26, 0.19, 440, 440, 0.088, 'steel', 0.32)
    tone(0.36, 0.24, 587.3, 587.3, 0.078, 'triangle', 0.17)
    tone(0.49, 0.55, 659.3, 654.1, 0.088, 'glass', 0.03)
    tone(0.66, 0.54, 329.6, 329.6, 0.044, 'brass', -0.22)
  },
  Support(tone: Tone, grit: Grit) {
    grit(0.07, 0.38, 920, 0.062, 'bandpass', 3200)
    tone(0.08, 0.65, 349.2, 349.2, 0.095, 'sine', -0.24)
    tone(0.17, 0.60, 440, 440, 0.093, 'triangle', 0.27)
    tone(0.31, 0.64, 523.3, 523.3, 0.073, 'glass', -0.18)
    tone(0.43, 0.68, 587.3, 587.3, 0.072, 'sine', 0.22)
    tone(0.58, 0.78, 698.5, 698.5, 0.074, 'glass')
    tone(0.71, 0.60, 1046.5, 1046.5, 0.038, 'glass', 0.39)
  },
  Tank(tone: Tone, grit: Grit) {
    grit(0.06, 0.24, 415, 0.23, 'lowpass', 170)
    grit(0.34, 0.23, 560, 0.14, 'bandpass', 165)
    tone(0.08, 0.55, 82.4, 73.4, 0.17, 'brass')
    tone(0.18, 0.61, 110, 110, 0.11, 'brass', -0.20)
    tone(0.36, 0.70, 146.8, 146.8, 0.097, 'brass', 0.26)
    tone(0.49, 0.74, 220, 220, 0.060, 'steel', 0.11)
    tone(0.56, 0.68, 293.7, 290, 0.042, 'glass', -0.30)
  },
}

function championTheme(roles: readonly string[] = []) {
  const primary = roles.find((role): role is keyof typeof championThemes => Object.hasOwn(championThemes, role))
  return championThemes[primary ?? 'Fighter']
}

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
    if (preferences.muted || !preferences.master || !preferences.effects) this.stop()
  }

  unlock() {
    if (this.preferences.muted || !this.preferences.master || !this.preferences.effects || typeof window === 'undefined') return
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return
    const fallback = (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    const Context = window.AudioContext ?? fallback
    if (!Context) return

    try {
      if (!this.graph) {
        const context = new Context()
        const master = context.createGain()
        const effects = context.createGain()
        const dcFilter = context.createBiquadFilter()
        const limiter = context.createDynamicsCompressor()
        const noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.6), context.sampleRate)
        const samples = noise.getChannelData(0)

        for (let index = 0; index < samples.length; index++) {
          samples[index] = Math.random() * 2 - 1
        }

        master.gain.value = bounded(this.preferences.master)
        effects.gain.value = bounded(this.preferences.effects)
        dcFilter.type = 'highpass'
        dcFilter.frequency.value = 28
        dcFilter.Q.value = 0.60
        limiter.threshold.value = -13
        limiter.knee.value = 17
        limiter.ratio.value = 6
        limiter.attack.value = 0.004
        limiter.release.value = 0.12
        effects.connect(dcFilter).connect(limiter).connect(master).connect(context.destination)
        const waves = {
          brass: buildWave(context, harmonics.brass),
          glass: buildWave(context, harmonics.glass),
          steel: buildWave(context, harmonics.steel),
        }
        this.graph = { context, master, effects, noise, waves }
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

  private tone(at: number, duration: number, from: number, to: number, amplitude: number, wave: Wave, pan: number) {
    const graph = this.graph
    if (!graph) return

    const oscillator = graph.context.createOscillator()
    const gain = graph.context.createGain()
    if (wave === 'brass' || wave === 'glass' || wave === 'steel') oscillator.setPeriodicWave(graph.waves[wave])
    else oscillator.type = wave
    oscillator.frequency.setValueAtTime(from, at)
    oscillator.frequency.exponentialRampToValueAtTime(to, at + duration)
    const attack = wave === 'brass' ? 0.031 : wave === 'steel' ? 0.004 : 0.011
    gain.gain.setValueAtTime(quiet, at)
    gain.gain.exponentialRampToValueAtTime(amplitude, at + Math.min(attack, duration / 3))
    gain.gain.exponentialRampToValueAtTime(quiet, at + duration)
    oscillator.connect(gain)
    const panners = connectVoice(gain, graph, pan)
    this.schedule(oscillator, [gain, ...panners], at, duration)
  }

  private grit(at: number, duration: number, center: number, amplitude: number, type: BiquadFilterType, endCenter: number, pan: number) {
    const graph = this.graph
    if (!graph) return

    const source = graph.context.createBufferSource()
    const filter = graph.context.createBiquadFilter()
    const gain = graph.context.createGain()
    source.buffer = graph.noise
    filter.type = type
    filter.frequency.setValueAtTime(center, at)
    if (center !== endCenter) filter.frequency.exponentialRampToValueAtTime(endCenter, at + duration)
    filter.Q.value = 0.65
    gain.gain.setValueAtTime(quiet, at)
    gain.gain.exponentialRampToValueAtTime(amplitude, at + Math.min(0.008, duration / 3))
    gain.gain.exponentialRampToValueAtTime(quiet, at + duration)
    source.connect(filter).connect(gain)
    const panners = connectVoice(gain, graph, pan)
    this.schedule(source, [filter, gain, ...panners], at, duration)
  }

  play(sound: ArcadeSound, chaotic = false, details: SoundDetails = {}) {
    const graph = this.graph
    if (!graph || this.preferences.muted || !this.preferences.master || !this.preferences.effects || graph.context.state === 'closed') return
    // A context resumed by the current gesture can accept queued sounds. A hover
    // never unlocks or resumes the context.
    if (sound === 'hover' && graph.context.state !== 'running') return
    if (graph.context.state !== 'running' && navigator.userActivation && !navigator.userActivation.isActive) return

    const now = graph.context.currentTime + 0.01
    const detune = chaotic ? 0.89 : 1
    const scale = details.short ? 0.74 : 1
    const tone: Tone = (delay, duration, from, to, volume, wave = 'sine', pan = 0) =>
      this.tone(now + delay * scale, duration * scale, from * detune, to * detune, volume, wave, pan)
    const grit: Grit = (delay, duration, center, volume, type = 'bandpass', endCenter = center, pan = 0) =>
      this.grit(now + delay * scale, duration * scale, center, volume, type, endCenter, pan)

    switch (sound) {
      case 'hover':
        if (now - this.hoverTime < 0.115) return
        this.hoverTime = now
        tone(0, 0.117, 300, 540, 0.07, 'glass')
        tone(0.046, 0.123, 400, 660, 0.04, 'triangle')
        grit(0, 0.024, 2400, 0.06)
        break
      case 'charge':
        grit(0.008, 0.19, 520, 0.14, 'bandpass', 3100)
        tone(0, 0.22, 127, 245, 0.11, 'brass')
        tone(0.063, 0.19, 280, 880, 0.052, 'glass', 0.24)
        break
      case 'tap':
        tone(0, 0.05, 410, 200, 0.12, 'triangle')
        break
      case 'roll':
        grit(0, 0.20, 650, 0.43, 'lowpass', 165)
        grit(0.014, 0.053, 2200, 0.42, 'bandpass', 1050, -0.25)
        grit(0.071, 0.068, 3200, 0.21, 'bandpass', 1000, 0.20)
        tone(0, 0.29, 148, 38, 0.37, 'triangle')
        tone(0.016, 0.23, 430, 185, 0.12, 'steel', -0.12)
        tone(0.076, 0.44, 103, 330, chaotic ? 0.15 : 0.11, 'brass', 0.12)
        grit(0.101, 0.33, 290, 0.115, 'bandpass', 2150)
        break
      case 'champion':
        grit(0, 0.23, 810, 0.21, 'lowpass', 275)
        tone(0, 0.38, 112, 50, 0.26)
        championTheme(details.championRoles)(tone, grit)
        break
      case 'spin':
        grit(0, 0.48, 940, 0.12, 'bandpass', 2500)
        tone(0, 0.47, 93, 156, 0.080, 'brass')
        for (const [i, delay] of [0.014, 0.053, 0.089, 0.123, 0.156, 0.190, 0.228, 0.273, 0.321, 0.374].entries()) {
          grit(delay, 0.022, i % 2 ? 2300 : 1430, i % 2 ? 0.086 : 0.125, 'bandpass', 1400, i % 2 ? 0.32 : -0.28)
        }
        break
      case 'brake':
        grit(0, 0.31, 2550, 0.11, 'bandpass', 655)
        tone(0, 0.31, 187, 103, 0.073, 'brass')
        for (const delay of [0.022, 0.062, 0.119, 0.192, 0.277]) grit(delay, 0.03, 1740, 0.10, 'bandpass', 800)
        break
      case 'stop': {
        const lane = details.lane ?? 2.5
        const pan = (lane - 2.5) * 0.22
        grit(0, 0.057, 2000, chaotic ? 0.43 : 0.34, 'bandpass', 750, pan)
        grit(0.031, 0.047, 1150, 0.20, 'bandpass', 510, pan)
        tone(0, 0.16, 190, 62, 0.29, 'triangle', pan)
        tone(0.021, 0.15, 390 + lane * 27, 340 + lane * 27, 0.088, 'steel', pan)
        tone(0.060, 0.27, 760 + lane * 47, 746 + lane * 47, 0.045, 'glass', pan)
        break
      }
      case 'spell':
        grit(0, 0.11, 2600, 0.18, 'bandpass', 6900, details.lane === 0 ? -0.32 : 0.32)
        tone(0, 0.27, 420, 960, 0.12, 'triangle')
        tone(0.041, 0.30, 730, 1280, 0.093, 'glass', details.lane === 0 ? -0.25 : 0.25)
        tone(0.085, 0.29, 1100, 1680, 0.034, 'glass')
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
      case 'veto':
        tone(0, 0.19, 420, 230, 0.11, 'steel', -0.27)
        tone(0.066, 0.22, 322, 158, 0.16, 'brass', 0.20)
        grit(0.105, 0.079, 1700, 0.39, 'bandpass', 490)
        tone(0.112, 0.31, 100, 45, 0.25, 'triangle')
        grit(0.182, 0.145, 3700, 0.095, 'bandpass', 2300)
        break
      case 'complete':
        grit(0, 0.25, 925, 0.29, 'lowpass', 255)
        grit(0.025, 0.39, 2300, 0.16, 'bandpass', 6450)
        tone(0, 0.55, 135, 43, 0.37, 'triangle')
        tone(0.026, 0.28, 261.6, 261.6, 0.14, 'brass', -0.20)
        tone(0.101, 0.33, 392, 392, 0.12, 'glass', 0.27)
        tone(0.176, 0.39, 523.3, 523.3, 0.14, 'glass', -0.18)
        tone(0.253, 0.57, 659.3, 659.3, 0.095, 'glass', 0.27)
        tone(0.269, 0.72, 784, 784, 0.115, 'brass')
        tone(0.288, 0.71, 1046.5, 1046.5, 0.075, 'glass', -0.34)
        tone(0.338, 0.61, 1568, 1568, 0.043, 'glass', 0.41)
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
