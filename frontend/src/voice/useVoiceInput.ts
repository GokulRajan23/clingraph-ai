import { useCallback, useEffect, useRef, useState } from 'react'
import { transcribe } from '../api'
import { rms, SilenceDetector } from './silence'

export type InputState = 'idle' | 'recording' | 'transcribing'

const SAMPLE_MS = 100
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

interface Session {
  stream: MediaStream
  recorder: MediaRecorder
  context: AudioContext
  timer: number
  detector: SilenceDetector
  /** Set when the recording should be thrown away instead of transcribed. */
  discard: boolean
}

/**
 * Click-to-talk: `start` records from the microphone and stops by itself after a pause in
 * speech (or call `stop`). The recording is transcribed and handed to `onText`.
 */
export function useVoiceInput(onText: (text: string) => void) {
  const [state, setState] = useState<InputState>('idle')
  const [error, setError] = useState<string | null>(null)
  const session = useRef<Session | null>(null)
  const deliver = useRef(onText)
  useEffect(() => {
    deliver.current = onText
  })
  // Bumped by `cancel` so a transcription still in flight is dropped.
  const generation = useRef(0)
  // True between the mic click and the browser granting the microphone.
  const opening = useRef(false)

  const release = (s: Session) => {
    window.clearInterval(s.timer)
    s.stream.getTracks().forEach((t) => t.stop())
    void s.context.close().catch(() => undefined)
  }

  const cancel = useCallback(() => {
    generation.current += 1
    opening.current = false
    const s = session.current
    if (s) {
      s.discard = true
      if (s.recorder.state !== 'inactive') s.recorder.stop()
    }
    setState('idle')
  }, [])

  const stop = useCallback(() => {
    const s = session.current
    if (s) {
      if (s.recorder.state !== 'inactive') s.recorder.stop()
    } else if (opening.current) {
      // Clicked again while the microphone was still opening: nothing recorded yet.
      cancel()
    }
  }, [cancel])

  const start = useCallback(async () => {
    if (session.current || opening.current) return
    setError(null)
    // Show the recording state at once; opening the microphone can take a moment.
    opening.current = true
    setState('recording')
    const turn = generation.current
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch (e) {
      if (turn !== generation.current) return
      opening.current = false
      setState('idle')
      const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
      setError(denied ? 'Microphone access is blocked. Allow it in the browser to ask by voice.' : 'No microphone is available.')
      return
    }
    opening.current = false
    if (turn !== generation.current) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t))
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    context.createMediaStreamSource(stream).connect(analyser)
    const buffer = new Uint8Array(analyser.fftSize)
    const detector = new SilenceDetector()
    const chunks: Blob[] = []

    const s: Session = {
      stream,
      recorder,
      context,
      detector,
      discard: false,
      timer: window.setInterval(() => {
        analyser.getByteTimeDomainData(buffer)
        const verdict = detector.update(rms(buffer), performance.now())
        if (verdict === 'no-speech') {
          s.discard = true
          setError("Didn't catch that. Click the mic and ask again.")
        }
        if (verdict !== 'listening' && recorder.state !== 'inactive') recorder.stop()
      }, SAMPLE_MS),
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      release(s)
      session.current = null
      const audio = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' })
      if (s.discard || !detector.heardSpeech || audio.size === 0) {
        if (!s.discard && !detector.heardSpeech) setError("Didn't catch that. Click the mic and ask again.")
        setState('idle')
        return
      }
      setState('transcribing')
      transcribe(audio)
        .then((text) => {
          if (turn !== generation.current) return
          if (text) deliver.current(text)
          else setError("Didn't catch that. Click the mic and ask again.")
        })
        .catch((e: unknown) => {
          if (turn === generation.current) setError(e instanceof Error ? e.message : 'Transcription failed.')
        })
        .finally(() => {
          if (turn === generation.current) setState('idle')
        })
    }

    session.current = s
    recorder.start(250)
    setState('recording')
  }, [])

  // Release the microphone if the component goes away mid-recording.
  useEffect(
    () => () => {
      const s = session.current
      if (s) {
        s.discard = true
        if (s.recorder.state !== 'inactive') s.recorder.stop()
        release(s)
      }
    },
    [],
  )

  return { state, error, start, stop, cancel, clearError: () => setError(null) }
}
