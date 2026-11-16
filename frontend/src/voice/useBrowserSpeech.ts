import { useCallback, useEffect, useRef, useState } from 'react'
import { pickVoice } from './browser'
import { mark } from './timing'

/** One answer: its sentences so far. */
interface Track {
  id: string
  texts: string[]
  /** No more sentences are coming. */
  closed: boolean
  /** Stopped by the user: sentences that still arrive are kept for replay but not spoken. */
  muted: boolean
}

/** The answer being spoken: utterances still queued, and whether the first has started. */
interface Playback {
  track: Track
  turn: number
  queued: number
  started: boolean
  watchdog?: number
}

/** A browser with no working voice never starts speaking: give up after this long (ms). */
const START_TIMEOUT_MS = 5000

const synth = (): SpeechSynthesis | null => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null)

/**
 * Reads answers aloud with the browser's own speech synthesis, the keyless twin of useSpeech
 * (same shape, so the app can use either). Each sentence is queued as soon as it arrives, so the
 * first is spoken while later ones are still being written.
 */
export function useBrowserSpeech() {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tracks = useRef(new Map<string, Track>())
  const current = useRef<Playback | null>(null)
  // Bumped on every play/stop so events from cancelled utterances are ignored.
  const request = useRef(0)
  const voice = useRef<SpeechSynthesisVoice | null>(null)
  // Chrome drops the events of an utterance that is garbage-collected mid-speech: hold on to them.
  const speaking = useRef(new Set<SpeechSynthesisUtterance>())
  const unlocked = useRef(false)

  useEffect(() => {
    const s = synth()
    if (!s) return
    // Voices load asynchronously in Chrome: pick again when the list arrives.
    const load = () => (voice.current = pickVoice(s.getVoices()))
    load()
    s.addEventListener('voiceschanged', load)
    return () => s.removeEventListener('voiceschanged', load)
  }, [])

  const utter = (playback: Playback, text: string) => {
    const s = synth()
    if (!s) return
    const u = new SpeechSynthesisUtterance(text)
    if (voice.current) {
      u.voice = voice.current
      u.lang = voice.current.lang
    } else {
      u.lang = 'en-US'
    }
    const live = () => playback.turn === request.current
    speaking.current.add(u)
    playback.queued += 1
    u.onstart = () => {
      if (!live()) return
      if (!playback.started) mark('first audio', true)
      playback.started = true
      window.clearTimeout(playback.watchdog)
      setLoadingId(null)
      setPlayingId(playback.track.id)
    }
    const done = (problem: string | null) => {
      speaking.current.delete(u)
      if (!live()) return
      playback.queued -= 1
      if (problem) setError(problem)
      if (playback.queued === 0 && (playback.track.closed || problem)) {
        setLoadingId(null)
        setPlayingId(null)
      }
    }
    u.onend = () => done(null)
    u.onerror = (event) => done(event.error === 'interrupted' || event.error === 'canceled' ? null : 'Could not read the answer aloud.')
    s.speak(u)
    // Some browsers have no voice installed and never start: say so instead of preparing forever.
    playback.watchdog ??= window.setTimeout(() => {
      if (!live() || playback.started) return
      request.current += 1
      s.cancel()
      setLoadingId(null)
      setPlayingId(null)
      setError("This browser couldn't read the answer aloud. Tick “Show model response” to read it.")
    }, START_TIMEOUT_MS)
  }

  /** Starts a new playback for `track`, cutting off whatever was being said. */
  const begin = (track: Track): Playback => {
    const s = synth()
    s?.cancel()
    s?.resume() // Chrome can be left paused after a cancel
    const playback = { track, turn: ++request.current, queued: 0, started: false }
    current.current = playback
    setError(null)
    setPlayingId(null)
    setLoadingId(track.id)
    return playback
  }

  /** Call synchronously from a click handler: WebKit only speaks after speech started in a gesture. */
  const unlock = useCallback(() => {
    const s = synth()
    if (!s || unlocked.current) return
    unlocked.current = true
    const u = new SpeechSynthesisUtterance(' ')
    u.volume = 0
    s.speak(u)
  }, [])

  /** Speaks the next sentence of answer `id` as it arrives, starting the answer if it is new. */
  const say = useCallback((id: string, text: string) => {
    let track = tracks.current.get(id)
    if (!track) {
      track = { id, texts: [text], closed: false, muted: false }
      tracks.current.set(id, track)
      utter(begin(track), text)
      return
    }
    track.texts.push(text)
    const playback = current.current
    if (!track.muted && playback?.track === track) utter(playback, text)
  }, [])

  /** No more sentences are coming for answer `id`. */
  const finish = useCallback((id: string) => {
    const track = tracks.current.get(id)
    if (!track) return
    track.closed = true
    const playback = current.current
    if (playback?.track === track && playback.queued === 0 && playback.turn === request.current) {
      setLoadingId(null)
      setPlayingId(null)
    }
  }, [])

  /** Plays a whole answer from its start. */
  const play = useCallback((id: string, texts: string[]) => {
    const track: Track = { id, texts: [...texts], closed: true, muted: false }
    tracks.current.set(id, track)
    const playback = begin(track)
    for (const text of texts) utter(playback, text)
  }, [])

  const stop = useCallback(() => {
    request.current += 1
    const playback = current.current
    if (playback) window.clearTimeout(playback.watchdog)
    if (playback) playback.track.muted = !playback.track.closed
    current.current = null
    synth()?.cancel()
    setLoadingId(null)
    setPlayingId(null)
  }, [])

  /** Forget all answers, e.g. when the conversation is reset. */
  const reset = useCallback(() => {
    stop()
    tracks.current.clear()
    setError(null)
  }, [stop])

  useEffect(() => () => reset(), [reset])

  return { loadingId, playingId, error, say, finish, play, stop, reset, unlock, clearError: () => setError(null) }
}
