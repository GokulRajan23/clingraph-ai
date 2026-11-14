import { useCallback, useEffect, useRef, useState } from 'react'
import { speak } from '../api'
import { mark } from './timing'

// 0.1 s of silence: playing it inside a click unlocks the element for later, non-gesture plays (WebKit).
const SILENCE =
  'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA=='

/** One answer's audio: a clip per sentence, synthesised as soon as the sentence is known, played in order. */
interface Track {
  id: string
  texts: string[]
  clips: Promise<string>[]
  /** No more sentences are coming. */
  closed: boolean
  /** Stopped by the user: sentences that still arrive are kept for replay but not synthesised or played. */
  muted: boolean
  /** Wakes the player when it is waiting for the next sentence. */
  wake?: () => void
}

/**
 * Plays answers aloud a sentence at a time, so the first plays while later ones are still being
 * written or synthesised. Audio is kept per message for replays. `loadingId` / `playingId` say
 * which message is waiting for its first audio or being heard.
 */
export function useSpeech() {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const tracks = useRef(new Map<string, Track>())
  const current = useRef<Track | null>(null)
  // Bumped on every play/stop so a player for an older request stops at its next step.
  const request = useRef(0)
  const unlocked = useRef(false)

  const element = () => (audio.current ??= new Audio())

  /** Call synchronously from a click handler, before any await. */
  const unlock = useCallback(() => {
    if (unlocked.current) return
    unlocked.current = true
    const a = element()
    a.src = SILENCE
    // The clip ends by itself; only a refusal means the element is still locked.
    a.play().catch((e: unknown) => {
      if (e instanceof DOMException && e.name === 'NotAllowedError') unlocked.current = false
    })
  }, [])

  // Pausing the unlock clip would abort it before WebKit counts it as played.
  const pause = (a: HTMLAudioElement) => {
    if (a.src !== SILENCE) a.pause()
  }

  const synthesise = (track: Track, text: string) => {
    const before = track.texts.join(' ')
    track.texts.push(text)
    const clip = speak(text, before).then((blob) => URL.createObjectURL(blob))
    clip.catch(() => undefined) // Reported by the player, if it gets that far.
    track.clips.push(clip)
    track.wake?.()
  }

  /** Plays `track` from its first clip, waiting for clips that are not there yet. */
  const run = async (track: Track) => {
    const turn = ++request.current
    current.current?.wake?.() // An older player waiting for a sentence: let it see it is done.
    current.current = track
    const a = element()
    pause(a)
    setError(null)
    setPlayingId(null)
    setLoadingId(track.id)
    const live = () => turn === request.current
    for (let i = 0; ; i++) {
      while (i >= track.clips.length && !track.closed && live()) await new Promise<void>((wake) => (track.wake = wake))
      if (!live()) return
      if (i >= track.clips.length) break
      let url: string
      try {
        url = await track.clips[i]
      } catch (e) {
        if (!live()) return
        tracks.current.delete(track.id)
        setError(e instanceof Error ? e.message : 'Could not read the answer aloud.')
        break
      }
      if (!live()) return
      a.src = url
      a.currentTime = 0
      try {
        await a.play()
      } catch {
        if (live()) setError('The browser blocked audio playback. Use Listen on the answer.')
        break
      }
      if (i === 0) mark('first audio', true)
      setLoadingId(null)
      setPlayingId(track.id)
      await new Promise<void>((done) => {
        a.onended = a.onpause = () => done()
      })
    }
    if (live()) {
      setLoadingId(null)
      setPlayingId(null)
    }
  }

  /** Speaks the next sentence of answer `id` as it arrives, starting the answer if it is new. */
  const say = useCallback((id: string, text: string) => {
    let track = tracks.current.get(id)
    if (!track) {
      track = { id, texts: [], clips: [], closed: false, muted: false }
      tracks.current.set(id, track)
      synthesise(track, text)
      void run(track)
    } else if (track.muted) {
      track.texts.push(text)
    } else {
      synthesise(track, text)
    }
  }, [])

  /** No more sentences are coming for answer `id`. */
  const finish = useCallback((id: string) => {
    const track = tracks.current.get(id)
    if (!track) return
    track.closed = true
    track.wake?.()
  }, [])

  /** Plays a whole answer from its start, reusing its audio when it was heard before. */
  const play = useCallback((id: string, texts: string[]) => {
    let track = tracks.current.get(id)
    if (!track || track.muted || !track.closed || track.clips.length !== texts.length) {
      if (track) forget(track)
      track = { id, texts: [], clips: [], closed: true, muted: false }
      tracks.current.set(id, track)
      for (const text of texts) synthesise(track, text)
    }
    void run(track)
  }, [])

  const stop = useCallback(() => {
    request.current += 1
    if (current.current) {
      current.current.muted = !current.current.closed
      current.current.wake?.()
    }
    if (audio.current) pause(audio.current)
    setLoadingId(null)
    setPlayingId(null)
  }, [])

  const forget = (track: Track) => {
    for (const clip of track.clips) clip.then(URL.revokeObjectURL, () => undefined)
    tracks.current.delete(track.id)
  }

  /** Forget all audio, e.g. when the conversation is reset. */
  const reset = useCallback(() => {
    stop()
    for (const track of [...tracks.current.values()]) forget(track)
    current.current = null
    setError(null)
  }, [stop])

  useEffect(() => () => reset(), [reset])

  return { loadingId, playingId, error, say, finish, play, stop, reset, unlock, clearError: () => setError(null) }
}
