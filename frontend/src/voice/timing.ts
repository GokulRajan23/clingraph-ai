/**
 * Logs how long a spoken question takes, measured from the end of the recording, to the browser
 * console: "[voice] transcribed 712 ms", "[voice] first sentence 1830 ms", "[voice] first audio 2410 ms".
 */
let start: number | null = null

/** The recording ended: start the clock. */
export function startTurn(): void {
  start = performance.now()
}

/** Logs a stage of the current spoken turn, if one is being timed. `last` stops the clock. */
export function mark(stage: string, last = false): void {
  if (start === null) return
  console.info(`[voice] ${stage} ${Math.round(performance.now() - start)} ms`)
  if (last) start = null
}

/** A soft rising blip: the question was heard and is on its way. */
export function chime(context: AudioContext): void {
  const now = context.currentTime
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
  gain.connect(context.destination)
  const tone = context.createOscillator()
  tone.frequency.setValueAtTime(660, now)
  tone.frequency.setValueAtTime(880, now + 0.08)
  tone.connect(gain)
  tone.start(now)
  tone.stop(now + 0.24)
}
