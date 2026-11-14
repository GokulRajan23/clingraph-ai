import { useCallback, useEffect, useRef, useState } from 'react'
import { speak } from '../api'

// 0.1 s of silence: playing it inside a click unlocks the element for later, non-gesture plays (WebKit).
const SILENCE =
  'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA=='

/**
 * Plays answers aloud, one at a time. Audio is fetched once per message and cached for replays.
 * `loadingId` / `playingId` say which message is being prepared or heard.
 */
export function useSpeech() {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const cache = useRef(new Map<string, string>())
  // Bumped on every play/stop so a slow synthesis for an older request never starts playing.
  const request = useRef(0)
  const unlocked = useRef(false)

  const element = () => {
    if (!audio.current) {
      const a = new Audio()
      a.onended = () => setPlayingId(null)
      audio.current = a
    }
    return audio.current
  }

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

  const stop = useCallback(() => {
    request.current += 1
    if (audio.current) pause(audio.current)
    setLoadingId(null)
    setPlayingId(null)
  }, [])

  const play = useCallback(async (id: string, text: string) => {
    const turn = ++request.current
    const a = element()
    pause(a)
    setPlayingId(null)
    setError(null)
    let url = cache.current.get(id)
    if (!url) {
      setLoadingId(id)
      try {
        url = URL.createObjectURL(await speak(text))
      } catch (e) {
        if (turn === request.current) {
          setLoadingId(null)
          setError(e instanceof Error ? e.message : 'Could not read the answer aloud.')
        }
        return
      }
      cache.current.set(id, url)
    }
    if (turn !== request.current) return
    setLoadingId(null)
    a.src = url
    a.currentTime = 0
    try {
      await a.play()
      if (turn === request.current) setPlayingId(id)
    } catch {
      if (turn === request.current) setError('The browser blocked audio playback. Use Listen on the answer.')
    }
  }, [])

  /** Forget cached audio, e.g. when the conversation is reset. */
  const reset = useCallback(() => {
    stop()
    for (const url of cache.current.values()) URL.revokeObjectURL(url)
    cache.current.clear()
    setError(null)
  }, [stop])

  useEffect(() => () => reset(), [reset])

  return { loadingId, playingId, error, play, stop, reset, unlock, clearError: () => setError(null) }
}
