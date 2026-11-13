import { useEffect, useRef, useState } from 'react'
import type { AnswerMessage, Focus, Message } from '../App'
import { citationsOf } from '../chat/script'
import { nodeById } from '../graph/query'
import type { Graph } from '../graph/types'
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
}

export function ChatPanel({ graph, reportCount, suggestions, messages, pending, focus, onAsk, onFocus }: Props) {
  const [draft, setDraft] = useState('')
  const log = useRef<HTMLDivElement>(null)
  const ready = graph !== null

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pending])

  const submit = (question: string) => {
    const text = question.trim()
    if (!text || pending || !ready) return
    onAsk(text)
    setDraft('')
  }

  return (
    <section className="panel chat-panel" aria-labelledby="chat-title">
      <div className="panel-head">
        <h2 id="chat-title">Ask the graph</h2>
      </div>
      <p className="muted chat-sub">
        {ready ? `Answers grounded in ${reportCount} uploaded ${reportCount === 1 ? 'report' : 'reports'}` : 'Upload reports to start asking'}
      </p>

      <div className="chat-log" ref={log} aria-live="polite">
        {messages.map((message) =>
          message.role === 'user' ? (
            <div key={message.id} className="bubble user">
              {message.text}
            </div>
          ) : (
            <AnswerBubble key={message.id} message={message} graph={graph} focus={focus} onFocus={onFocus} />
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
          {suggestions.map((question) => (
            <button key={question} className="chip" disabled={pending} onClick={() => submit(question)}>
              {question}
            </button>
          ))}
        </div>
      )}

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
          placeholder={ready ? "Ask about this patient's history…" : 'Waiting for reports…'}
          disabled={!ready}
          aria-label="Question"
        />
        <button type="submit" className="primary" disabled={!ready || pending || !draft.trim()} aria-label="Send">
          ➤
        </button>
      </form>
    </section>
  )
}

function AnswerBubble({ message, graph, focus, onFocus }: { message: AnswerMessage; graph: Graph | null; focus: Focus; onFocus: (focus: Focus) => void }) {
  const { answer } = message
  const citations = citationsOf(answer)
  const shown = focus?.kind === 'answer' && focus.messageId === message.id
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
      {answer.highlight.length > 0 && (
        <button className="link-button" disabled={shown} onClick={() => onFocus({ kind: 'answer', messageId: message.id, ids: answer.highlight })}>
          {shown ? 'Highlighted in graph' : 'Show in graph'}
        </button>
      )}
    </div>
  )
}

function Markers({ cites, citations }: { cites: string[]; citations: string[] }) {
  if (cites.length === 0) return null
  return <sup className="marker">{cites.map((id) => `[${citations.indexOf(id) + 1}]`).join('')}</sup>
}
