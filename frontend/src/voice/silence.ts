/**
 * Decides when a click-to-talk recording should end, from microphone loudness samples.
 * Pure (time is passed in) so it can be tested without audio hardware.
 */

export interface SilenceOptions {
  /** RMS level (0–1) above which a sample counts as speech. */
  threshold: number
  /** Stop after this much quiet once speech has been heard. */
  trailingSilenceMs: number
  /** Give up if no speech is heard at all within this time. */
  noSpeechMs: number
  /** Hard limit on a single question. */
  maxMs: number
}

export const DEFAULT_SILENCE: SilenceOptions = { threshold: 0.025, trailingSilenceMs: 800, noSpeechMs: 8000, maxMs: 30000 }

export type Verdict = 'listening' | 'done' | 'no-speech'

export class SilenceDetector {
  private start: number | null = null
  private lastSpeech: number | null = null

  constructor(private readonly options: SilenceOptions = DEFAULT_SILENCE) {}

  get heardSpeech(): boolean {
    return this.lastSpeech !== null
  }

  update(level: number, now: number): Verdict {
    this.start ??= now
    if (level >= this.options.threshold) this.lastSpeech = now
    if (now - this.start >= this.options.maxMs) return this.lastSpeech === null ? 'no-speech' : 'done'
    if (this.lastSpeech === null) return now - this.start >= this.options.noSpeechMs ? 'no-speech' : 'listening'
    return now - this.lastSpeech >= this.options.trailingSilenceMs ? 'done' : 'listening'
  }
}

/** Root-mean-square loudness of a time-domain buffer centred on 128 (AnalyserNode byte data). */
export function rms(samples: Uint8Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (const s of samples) {
    const v = (s - 128) / 128
    sum += v * v
  }
  return Math.sqrt(sum / samples.length)
}
