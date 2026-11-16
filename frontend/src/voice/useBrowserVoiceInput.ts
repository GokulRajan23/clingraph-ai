import { useCallback, useEffect, useRef, useState } from 'react'
import { recognitionConstructor, recognitionProblem, transcriptOf, type Recognition } from './browser'
import type { InputState } from './useVoiceInput'
import { mark, startTurn } from './timing'

/** How loud the pill shows a freshly recognised word, and how fast that fades (ms). */
const WORD_LEVEL = 0.12
const WORD_FADE_MS = 350

interface Session {
  recognition: Recognition
  text: string
  /** Thrown away (cancelled) or failed: nothing is asked. */
  discard: boolean
}

/**
 * Click-to-talk with the browser's own speech recognition, the keyless twin of useVoiceInput
 * (same shape, so the app can use either). The browser ends the question by itself after a pause;
 * `stop` ends it now. The transcript goes to `onText`.
 */
export function useBrowserVoiceInput(onText: (text: string) => void) {
  const [state, setState] = useState<InputState>('idle')
  const [error, setError] = useState<string | null>(null)
  const session = useRef<Session | null>(null)
  const deliver = useRef(onText)
  useEffect(() => {
    deliver.current = onText
  })
  // Bumped by `cancel` so a recognition that still ends is dropped.
  const generation = useRef(0)
  // When the last word was recognised: recognition reports no loudness, so the pill pulses with words.
  const lastWord = useRef(0)

  const cancel = useCallback(() => {
    generation.current += 1
    const s = session.current
    if (s) {
      s.discard = true
      s.recognition.abort()
    }
    session.current = null
    setState('idle')
  }, [])

  const stop = useCallback(() => {
    session.current?.recognition.stop()
  }, [])

  const start = useCallback(async () => {
    const Recognition = recognitionConstructor()
    if (session.current || !Recognition) return
    setError(null)
    const turn = generation.current
    const recognition = new Recognition()
    recognition.lang = 'en-US'
    recognition.continuous = false // ends by itself after a pause
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    const s: Session = { recognition, text: '', discard: false }

    recognition.onresult = (event) => {
      s.text = transcriptOf(event.results)
      lastWord.current = performance.now()
    }
    recognition.onerror = (event) => {
      const problem = recognitionProblem(event.error)
      if (problem && turn === generation.current) setError(problem)
      s.discard = true
    }
    recognition.onend = () => {
      if (session.current === s) session.current = null
      if (turn !== generation.current) return
      setState('idle')
      if (s.discard) return
      if (!s.text) {
        setError("Didn't catch that. Tap the pill and ask again.")
        return
      }
      startTurn()
      mark('transcribed')
      deliver.current(s.text)
    }

    session.current = s
    setState('recording')
    try {
      recognition.start()
    } catch {
      session.current = null
      setState('idle')
      setError('Voice input failed. Type your question instead.')
    }
  }, [])

  useEffect(
    () => () => {
      const s = session.current
      if (s) {
        s.discard = true
        s.recognition.abort()
      }
    },
    [],
  )

  /** A pulse that fades after each recognised word, 0 when idle. Cheap enough to call every frame. */
  const level = useCallback(() => {
    if (!session.current) return 0
    const since = performance.now() - lastWord.current
    return since < 0 ? 0 : WORD_LEVEL * Math.exp(-since / WORD_FADE_MS)
  }, [])

  return { state, error, level, start, stop, cancel, clearError: () => setError(null) }
}
