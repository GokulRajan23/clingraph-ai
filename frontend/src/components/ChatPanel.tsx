import { useEffect, useRef, useState } from 'react'
import type { AnswerMessage, Focus, Message } from '../App'
import type { InputState } from '../voice/useVoiceInput'
import { PHASE_SPEED, phaseStatus, voicePhase, type VoicePhase } from '../voice/phase'
import { citationsOf } from '../chat/script'
import { nodeById } from '../graph/query'
import type { Graph } from '../graph/types'
import { FluidOrb } from './FluidOrb'
import { ShapeIcon } from './ShapeIcon'

interface Props {
  graph: Graph | null
  /** Processed uploads the answers draw on. */
  reportCount: number
  suggestions: string[]
  messages: Message[]
  pending: boolean
  focus: Focus
  onAsk: (question: string) => void
  onFocus: (focus: Focus) => void
  voice: VoiceControls
}

/** Voice state and actions from App. When `enabled` is false no voice controls are shown. */
export interface VoiceControls {
  enabled: boolean
  input: InputState
  /** Answer message being read aloud, or having its audio prepared. */
  playingId: string | null
  loadingId: string | null
  error: string | null
  /** Microphone loudness (RMS, 0–1) while recording; read every frame by the orb. */
  level: () => number
  /** Throw the recording away instead of asking it. */
  onCancel: () => void
  onMic: () => void
  onPlay: (message: AnswerMessage) => void
  onStop: () => void
}

export function ChatPanel({ graph, reportCount, suggestions, messages, pending, focus, onAsk, onFocus, voice }: Props) {
  const [draft, setDraft] = useState('')
  // Voice comes first; the text input opens on request. Without voice it is the only way in.
  const [typing, setTyping] = useState(false)
  const log = useRef<HTMLDivElement>(null)
  const ready = graph !== null
  const recording = voice.input === 'recording'
  const transcribing = voice.input === 'transcribing'
  const placeholder = !ready ? 'Waiting for reports…' : recording ? 'Listening… pause to send' : transcribing ? 'Transcribing…' : "Ask about this patient's history…"
  const phase = voicePhase({ ready, input: voice.input, pending, loading: voice.loadingId !== null, playing: voice.playingId !== null })
  // The big orb greets an empty conversation; once one starts it docks to a bar under the log.
  const docked = messages.length > 0 || pending
  const showInput = !voice.enabled || typing

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pending])

  const submit = (question: string) => {
    const text = question.trim()
    if (!text || pending || !ready || voice.input !== 'idle') return
    onAsk(text)
    setDraft('')
  }

  const suggestionButtons = suggestions.map((question) => (
    <button key={question} className="chip" disabled={pending || recording || transcribing} onClick={() => submit(question)}>
      {question}
    </button>
  ))

  return (
    <section className={voice.enabled ? 'panel chat-panel voice-first' : 'panel chat-panel'} aria-labelledby="chat-title">
      <div className="panel-head">
        <h2 id="chat-title">Ask the graph</h2>
      </div>
      <p className="muted chat-sub">
        {ready ? `Answers grounded in ${reportCount} uploaded ${reportCount === 1 ? 'report' : 'reports'}` : 'Upload reports to start asking'}
      </p>

      {voice.enabled && !docked ? (
        <div className="voice-hero">
          <OrbButton phase={phase} size={168} voice={voice} />
          <p className="voice-status" aria-live="polite">
            {phaseStatus(phase, false)}
          </p>
          <VoiceActions phase={phase} voice={voice} />
          {ready && suggestions.length > 0 && (
            <div className="try" role="group" aria-label="Suggested questions">
              <p className="eyebrow">Try asking</p>
              <div className="try-list">{suggestionButtons}</div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="chat-log" ref={log} aria-live="polite">
            {messages.map((message) =>
              message.role === 'user' ? (
                <div key={message.id} className="bubble user">
                  {message.spoken && <MicIcon className="spoken-mark" label="Asked by voice" />}
                  {message.text}
                </div>
              ) : (
                <AnswerBubble key={message.id} message={message} graph={graph} focus={focus} onFocus={onFocus} voice={voice} />
              ),
            )}
            {pending && (
              <div className="bubble assistant typing" aria-label="Answering">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>

          {ready && suggestions.length > 0 && (
            <div className="suggestions" aria-label="Suggested questions">
              {suggestionButtons}
            </div>
          )}
        </>
      )}

      {voice.enabled && docked && (
        <div className="voice-bar">
          <OrbButton phase={phase} size={40} voice={voice} />
          <p className="voice-status" aria-live="polite">
            {phaseStatus(phase, true)}
          </p>
          <VoiceActions phase={phase} voice={voice} />
          {!typing && (
            <button type="button" className="icon-button type-icon" aria-label="Type a question instead" title="Type a question" onClick={() => setTyping(true)}>
              <KeyboardIcon />
            </button>
          )}
        </div>
      )}

      {voice.enabled && voice.error && (
        <p className="voice-error" role="alert">
          {voice.error}
        </p>
      )}

      {showInput ? (
        <form
          className="chat-input"
          onSubmit={(event) => {
            event.preventDefault()
            submit(draft)
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && voice.enabled) setTyping(false)
            }}
            placeholder={placeholder}
            disabled={!ready || recording || transcribing}
            aria-label="Question"
            // In voice mode the input only mounts when the user asked to type.
            autoFocus={voice.enabled}
          />
          {voice.enabled && (
            <button type="button" className="close-input" aria-label="Back to voice" title="Back to voice" onClick={() => setTyping(false)}>
              <MicIcon />
            </button>
          )}
          <button type="submit" className="primary" disabled={!ready || pending || recording || transcribing || !draft.trim()} aria-label="Send">
            ➤
          </button>
        </form>
      ) : (
        !docked && (
          <button type="button" className="link-button type-toggle" disabled={!ready} onClick={() => setTyping(true)}>
            <KeyboardIcon /> Type a question instead
          </button>
        )
      )}
    </section>
  )
}

/** Matches --accent in styles.css: the shader needs the colour itself, not a CSS variable. */
const ORB_COLOR = '#6860a5'
/** RMS a raised voice reaches; louder than this swells the orb no further. */
const LOUD = 0.15

const ORB_LABEL: Record<VoicePhase, string> = {
  waiting: 'Voice assistant, waiting for reports',
  idle: 'Ask by voice',
  listening: 'Stop recording and ask',
  transcribing: 'Transcribing',
  thinking: 'Answering',
  preparing: 'Stop reading aloud',
  speaking: 'Stop reading aloud',
}

/** The orb is the microphone: tap to ask, tap again to send, tap while it speaks to stop. */
function OrbButton({ phase, size, voice }: { phase: VoicePhase; size: number; voice: VoiceControls }) {
  const busy = phase === 'waiting' || phase === 'transcribing' || phase === 'thinking'
  const talking = phase === 'preparing' || phase === 'speaking'
  return (
    <button
      type="button"
      className={`orb-button ${phase}`}
      disabled={busy}
      aria-pressed={phase === 'listening'}
      aria-label={ORB_LABEL[phase]}
      title={ORB_LABEL[phase]}
      onClick={talking ? voice.onStop : voice.onMic}
    >
      <FluidOrb
        size={size}
        color={ORB_COLOR}
        speed={PHASE_SPEED[phase]}
        level={phase === 'listening' ? () => voice.level() / LOUD : undefined}
        aria-hidden="true"
      />
    </button>
  )
}

/** Explicit buttons for what tapping the orb does, plus cancel while recording. */
function VoiceActions({ phase, voice }: { phase: VoicePhase; voice: VoiceControls }) {
  if (phase === 'listening')
    return (
      <div className="voice-actions">
        <button type="button" onClick={voice.onMic}>
          <span aria-hidden="true">■</span> Send
        </button>
        <button type="button" onClick={voice.onCancel}>
          <span aria-hidden="true">✕</span> Cancel
        </button>
      </div>
    )
  if (phase === 'preparing' || phase === 'speaking')
    return (
      <div className="voice-actions">
        <button type="button" onClick={voice.onStop}>
          <span aria-hidden="true">■</span> Stop
        </button>
      </div>
    )
  return null
}

interface AnswerProps {
  message: AnswerMessage
  graph: Graph | null
  focus: Focus
  onFocus: (focus: Focus) => void
  voice: VoiceControls
}

function AnswerBubble({ message, graph, focus, onFocus, voice }: AnswerProps) {
  const { answer } = message
  const citations = citationsOf(answer)
  const shown = focus?.kind === 'answer' && focus.messageId === message.id
  const playing = voice.playingId === message.id
  const loading = voice.loadingId === message.id
  return (
    <div className="bubble assistant">
      {answer.lines.length > 1 ? (
        <ul>
          {answer.lines.map((line) => (
            <li key={line.text}>
              {line.text} <Markers cites={line.cites} citations={citations} />
            </li>
          ))}
        </ul>
      ) : (
        answer.lines.map((line) => (
          <p key={line.text}>
            {line.text} <Markers cites={line.cites} citations={citations} />
          </p>
        ))
      )}
      {citations.length > 0 && graph && (
        <div className="citations">
          {citations.map((id, i) => (
            <button key={id} className="cite" onClick={() => onFocus({ kind: 'node', id })}>
              <ShapeIcon type="report" size={12} />[{i + 1}] {nodeById(graph, id)?.label ?? id}
            </button>
          ))}
        </div>
      )}
      <div className="answer-actions">
        {answer.highlight.length > 0 && (
          <button className="link-button" disabled={shown} onClick={() => onFocus({ kind: 'answer', messageId: message.id, ids: answer.highlight })}>
            {shown ? 'Highlighted in graph and timeline' : 'Show in graph and timeline'}
          </button>
        )}
        {voice.enabled && (
          <button
            className={playing ? 'listen playing' : 'listen'}
            aria-label={playing || loading ? 'Stop reading aloud' : 'Read answer aloud'}
            onClick={() => (playing || loading ? voice.onStop() : voice.onPlay(message))}
          >
            {loading ? <span className="spinner" aria-hidden="true" /> : <span aria-hidden="true">{playing ? '■' : '▶'}</span>}
            {loading ? 'Preparing audio' : playing ? 'Stop' : 'Listen'}
          </button>
        )}
      </div>
    </div>
  )
}

function Markers({ cites, citations }: { cites: string[]; citations: string[] }) {
  if (cites.length === 0) return null
  return <sup className="marker">{cites.map((id) => `[${citations.indexOf(id) + 1}]`).join('')}</sup>
}

function MicIcon({ className, label }: { className?: string; label?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" fill="currentColor" />
      <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5M5.5 14.5h5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
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
