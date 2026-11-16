/**
 * The browser's own speech services (Web Speech API), used when the backend has no ElevenLabs key:
 * SpeechRecognition hears the question, speechSynthesis reads the answer. Free and keyless; the
 * quality and the languages depend on the browser and the operating system.
 */

/** The parts of SpeechRecognition the app uses (Chrome/Edge/Safari; WebKit prefixes it). */
export interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type RecognitionConstructor = new () => Recognition

export function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Both halves are there: the browser can hear the question and read the answer. */
export function browserVoiceSupported(): boolean {
  return recognitionConstructor() !== null && typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** What a voice offers for ranking: the fields of SpeechSynthesisVoice that matter. */
export interface VoiceInfo {
  name: string
  lang: string
  localService: boolean
}

// Names of the more natural system voices across Chrome, Edge, Safari and Android.
const NATURAL = /natural|neural|premium|enhanced|online/i
const GOOD = /google|samantha|daniel|serena|karen|moira|ava|evan|zoe/i
// macOS ships joke and character voices next to the real ones; never read a clinical answer in those.
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|junior|organ|ralph|superstar|trinoids|whisper|wobble|zarvox|fred|kathy|grandma|grandpa|rocko|sandy|shelley|eddy|flo\b|reed/i

/**
 * Picks the voice that should read the answers: English, preferring the natural-sounding voices
 * a browser ships (Edge "Natural", Apple "Premium"/"Enhanced", Google), then British or American
 * English. Null when there is no English voice (the browser default is used).
 */
export function pickVoice<V extends VoiceInfo>(voices: readonly V[]): V | null {
  const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang))
  if (english.length === 0) return null
  const score = (v: V) =>
    (NATURAL.test(v.name) ? 4 : 0) + (GOOD.test(v.name) ? 2 : 0) + (/^en[-_](GB|US)$/i.test(v.lang) ? 1 : 0) - (NOVELTY.test(v.name) ? 10 : 0)
  return english.reduce((best, v) => (score(v) > score(best) ? v : best))
}

/** The transcript so far from a recognition result list: every result, final or not, in order. */
export function transcriptOf(results: ArrayLike<ArrayLike<{ transcript: string }>>): string {
  let text = ''
  for (let i = 0; i < results.length; i++) text += results[i][0]?.transcript ?? ''
  return text.replace(/\s+/g, ' ').trim()
}

/** A recognition error code as a sentence for the user, or null when it needs no message. */
export function recognitionProblem(code: string): string | null {
  switch (code) {
    case 'aborted':
      return null
    case 'no-speech':
      return "Didn't catch that. Tap the pill and ask again."
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access is blocked. Allow it in the browser to ask by voice.'
    case 'audio-capture':
      return 'No microphone is available.'
    case 'network':
      return "The browser's speech recognition needs an internet connection."
    default:
      return 'Voice input failed. Type your question instead.'
  }
}
