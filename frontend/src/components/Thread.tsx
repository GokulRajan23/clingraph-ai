import { useEffect, useRef } from 'react'
import type { AnswerMessage, Message } from '../App'
import { nodeById } from '../graph/query'
import type { Graph } from '../graph/types'

interface Props {
  messages: Message[]
  pending: boolean
  graph: Graph
  /** Opens a source report's pop-up. */
  onSource: (id: string) => void
  onRetry: (message: AnswerMessage) => void
}

const time = (at: Date) => at.toTimeString().slice(0, 5)

/** The conversation as text, for when "Show model response" is on: question headers, answer paragraphs, sources. */
export function Thread({ messages, pending, graph, onSource, onRetry }: Props) {
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [messages, pending])

  return (
    <div className="thread" aria-live="polite">
      {messages.map((message) =>
        message.role === 'user' ? (
          <div key={message.id} className="question">
            <span className="mono">
              {message.spoken ? 'SPOKEN' : 'TYPED'} · {time(message.at)}
            </span>
            <p>{message.text}</p>
          </div>
        ) : (
          <div key={message.id} className="answer">
            <p>{message.answer.sentences.join(' ')}</p>
            {message.answer.cutShort && (
              <p className="cut">
                The answer was cut short.{' '}
                <button type="button" className="link" onClick={() => onRetry(message)}>
                  Try again
                </button>
              </p>
            )}
            {message.answer.sources.length > 0 && (
              <div className="sources">
                {message.answer.sources.map((id) => (
                  <button key={id} type="button" onClick={() => onSource(id)}>
                    {nodeById(graph, id)?.label ?? id}
                  </button>
                ))}
              </div>
            )}
          </div>
        ),
      )}
      {pending && <p className="mono reading">READING THE REPORTS</p>}
      <div ref={end} />
    </div>
  )
}
