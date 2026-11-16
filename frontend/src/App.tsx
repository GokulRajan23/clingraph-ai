import { useEffect, useRef, useState } from 'react'
import { ask, voiceStatus } from './api'
import { historyOf, speakable, type Answer } from './chat/script'
import { GraphView } from './components/GraphView'
import { HistoryTimeline } from './components/HistoryTimeline'
import { Legend, Logo } from './components/Marks'
import { ParticlePill } from './components/ParticlePill'
import { PatientSearch } from './components/PatientSearch'
import { SourceModal } from './components/SourceModal'
import { Thread } from './components/Thread'
import { PATIENTS, SOURCES, type Patient } from './demo/data'
import { firstName } from './patients'
import { usePersistentChoice } from './persist'
import { browserVoiceSupported } from './voice/browser'
import { phaseStatus, pillMode, voicePhase } from './voice/phase'
import { mark } from './voice/timing'
import { useBrowserSpeech } from './voice/useBrowserSpeech'
import { useBrowserVoiceInput } from './voice/useBrowserVoiceInput'
import { useSpeech } from './voice/useSpeech'
import { useVoiceInput } from './voice/useVoiceInput'

export interface AnswerMessage {
  id: string
  role: 'assistant'
  answer: Answer
}
export type Message = { id: string; role: 'user'; text: string; spoken: boolean; at: Date } | AnswerMessage

let sequence = 0
const nextId = (prefix: string) => `${prefix}-${++sequence}`
const VOICE_STATUS_RETRY_MS = 2000
/** Microphone RMS a raised voice reaches; the pill swells no further. */
const LOUD = 0.15

/**
 * The whole app: pick a patient, tap the pill and ask. The first answer opens the patient's
 * knowledge graph across most of the screen, with what the answer is about highlighted; the pill
 * moves to the column on the right. Answers are spoken; their text is shown only on request.
 */
export default function App() {
  const [patient, setPatient] = useState<Patient | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [pending, setPending] = useState(false)
  // Null until the first answer: the graph opens with it.
  const [highlight, setHighlight] = useState<string[] | null>(null)
  const [sourceId, setSourceId] = useState<string | null>(null)
  // ElevenLabs when the backend has a key, else the browser's own speech services, else typing only.
  const [voiceMode, setVoiceMode] = useState<'elevenlabs' | 'browser' | 'off'>(() => (browserVoiceSupported() ? 'browser' : 'off'))
  const voiceEnabled = voiceMode !== 'off'
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const [response, setResponse] = usePersistentChoice('clingraph.response', 'hidden', ['hidden', 'shown'] as const)
  // Bumped when the patient changes, so an answer still in flight is dropped.
  const conversation = useRef(0)
  // The answer being streamed, so a new question or a reset can stop it.
  const inFlight = useRef<AbortController | null>(null)

  const graph = patient?.record ?? null
  const open = graph !== null && highlight !== null

  useEffect(() => {
    // The backend may start after the page loads: keep asking until it answers.
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    const check = async () => {
      const enabled = await voiceStatus()
      if (stopped) return
      if (enabled === null) timer = setTimeout(check, VOICE_STATUS_RETRY_MS)
      else if (enabled) setVoiceMode('elevenlabs')
    }
    void check()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [])

  const elevenLabsSpeech = useSpeech()
  const browserSpeech = useBrowserSpeech()
  const speech = voiceMode === 'elevenlabs' ? elevenLabsSpeech : browserSpeech

  /**
   * Asks a question about the patient. Each sentence of the answer is read aloud as soon as it
   * arrives; once the answer is complete the graph highlights what it is about. A new question
   * drops the last.
   */
  const askQuestion = async (question: string, spoken: boolean) => {
    const turn = conversation.current
    speech.stop()
    if (!graph) return
    inFlight.current?.abort()
    const request = new AbortController()
    inFlight.current = request
    const live = () => turn === conversation.current && !request.signal.aborted
    const aloud = voiceEnabled
    const history = historyOf(messages)
    const id = nextId('answer')
    let said = 0
    const show = (answer: Answer) => {
      setPending(false)
      setMessages((current) =>
        current.some((m) => m.id === id) ? current.map((m) => (m.id === id ? { id, role: 'assistant', answer } : m)) : [...current, { id, role: 'assistant', answer }],
      )
      if (!aloud) return
      for (; said < answer.sentences.length; said++) speech.say(id, speakable(answer.sentences[said]))
    }
    setMessages((current) => [...current, { id: nextId('question'), role: 'user', text: question, spoken, at: new Date() }])
    setPending(true)
    const answer = await ask(
      question,
      graph,
      history,
      (sentences) => {
        if (!live()) return
        if (said === 0) mark('first sentence')
        show({ sentences, sources: [], highlight: [] })
      },
      request.signal,
    )
    if (!live()) return
    inFlight.current = null
    show(answer)
    if (aloud) speech.finish(id)
    setHighlight(answer.highlight)
  }

  /** Asks the question an answer that was cut short belongs to, again. */
  const retry = (message: AnswerMessage) => {
    const index = messages.indexOf(message)
    const question = messages.slice(0, index).findLast((m) => m.role === 'user')
    if (question?.role === 'user') void askQuestion(question.text, question.spoken)
  }

  const elevenLabsInput = useVoiceInput((text) => void askQuestion(text, true))
  const browserInput = useBrowserVoiceInput((text) => void askQuestion(text, true))
  const voiceInput = voiceMode === 'elevenlabs' ? elevenLabsInput : browserInput

  /** Back to the search: everything about the previous patient goes. */
  const clearPatient = () => {
    conversation.current += 1
    inFlight.current?.abort()
    setPatient(null)
    setMessages([])
    setPending(false)
    setHighlight(null)
    setSourceId(null)
    setTyping(false)
    speech.reset()
    voiceInput.cancel()
  }

  const phase = voicePhase({ ready: graph !== null, input: voiceInput.state, pending, loading: speech.loadingId !== null, playing: speech.playingId !== null })
  const busy = phase === 'transcribing' || phase === 'thinking'
  const talking = phase === 'preparing' || phase === 'speaking'
  const lastQuestion = messages.findLast((m) => m.role === 'user')
  const error = voiceInput.error ?? speech.error
  // Without voice the text is the only answer there is.
  const showThread = open && (response === 'shown' || !voiceEnabled)
  const showInput = typing || !voiceEnabled

  const onPill = () => {
    if (talking) return speech.stop()
    if (voiceInput.state === 'recording') return voiceInput.stop()
    speech.stop()
    speech.unlock()
    speech.clearError()
    void voiceInput.start()
  }

  const submit = () => {
    const text = draft.trim()
    if (!text || busy || voiceInput.state !== 'idle') return
    speech.unlock()
    setDraft('')
    void askQuestion(text, false)
  }

  return (
    <div className={open ? 'app open' : 'app'}>
      <main className="stage" aria-label="Knowledge graph" aria-hidden={!open}>
        {open && graph && (
          <>
            <GraphView graph={graph} highlight={highlight} onSelect={setSourceId} />
            <Legend />
          </>
        )}
      </main>

      <aside className="side">
        <header className="brand">
          <Logo />
          <span>ClinGraph</span>
        </header>

        <div className="voice">
          {!patient && (
            <div className="intro">
              <h1>Every report, one patient, one graph.</h1>
              <p>Ask about a patient's history out loud. ClinGraph answers from their reports and shows you where each answer came from.</p>
            </div>
          )}

          {patient ? (
            <div className="patient">
              <span className="name">{patient.name}</span>
              <span className="mono">{patient.insurance}</span>
              <button type="button" className="clear" aria-label="Choose another patient" title="Choose another patient" onClick={clearPatient}>
                ✕
              </button>
            </div>
          ) : (
            <PatientSearch patients={PATIENTS} onPick={setPatient} hint={PATIENTS.find((p) => p.record)?.name} />
          )}

          {patient && !graph && <p className="note">No reports connected for this patient yet.</p>}

          {patient && graph && !open && patient.timeline.length > 0 && <HistoryTimeline stops={patient.timeline} onOpen={setSourceId} />}

          {graph && (
            <>
              <button
                type="button"
                className={`pill ${phase}`}
                disabled={busy || !voiceEnabled}
                aria-pressed={phase === 'listening'}
                aria-label={talking ? 'Stop speaking' : phase === 'listening' ? 'Stop recording and ask' : 'Ask by voice'}
                onClick={onPill}
              >
                <ParticlePill mode={pillMode(phase)} level={() => voiceInput.level() / LOUD / 6} count={open ? 6000 : 12000} scale={open ? 0.7 : 0.8} />
              </button>
              <p className="status" aria-live="polite">
                {voiceEnabled ? phaseStatus(phase, firstName(patient!), messages.length > 0) : 'VOICE IS OFF · TYPE YOUR QUESTION'}
              </p>
              {phase === 'listening' && (
                <button type="button" className="link" onClick={voiceInput.cancel}>
                  Cancel
                </button>
              )}
              {lastQuestion?.role === 'user' && phase !== 'listening' && <p className="heard">“{lastQuestion.text}”</p>}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        {showThread && <Thread messages={messages} pending={pending} graph={graph!} onSource={setSourceId} onRetry={retry} />}

        {graph && (
          <footer className="controls">
            {showInput && (
              <form
                className="ask"
                onSubmit={(event) => {
                  event.preventDefault()
                  submit()
                }}
              >
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && voiceEnabled) setTyping(false)
                  }}
                  placeholder={`Ask about ${firstName(patient!)}…`}
                  aria-label="Question"
                  autoFocus={voiceEnabled}
                />
                <span className="mono key" aria-hidden="true">
                  ↵
                </span>
              </form>
            )}
            <div className="toggles">
              {open && voiceEnabled && (
                <label className="check">
                  <input type="checkbox" checked={response === 'shown'} onChange={(event) => setResponse(event.target.checked ? 'shown' : 'hidden')} />
                  Show model response
                </label>
              )}
              {voiceEnabled && (
                <button
                  type="button"
                  className={typing ? 'icon on' : 'icon'}
                  aria-label={typing ? 'Close the text box' : 'Type a question instead'}
                  title={typing ? 'Close the text box' : 'Type a question instead'}
                  onClick={() => setTyping(!typing)}
                >
                  <KeyboardIcon />
                </button>
              )}
            </div>
          </footer>
        )}
      </aside>

      {graph && <SourceModal graph={graph} sources={SOURCES} nodeId={sourceId} onClose={() => setSourceId(null)} onSelect={setSourceId} />}
    </div>
  )
}

function KeyboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="3.5" width="13" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 6.5h1M7.5 6.5h1M11 6.5h1M4 9.5h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
