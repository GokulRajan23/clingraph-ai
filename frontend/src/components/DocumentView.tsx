import { useEffect, useState } from 'react'
import type { ReviewContext, Tab } from '../App'
import { originalUrl } from '../api'
import { ASSERTION, CATEGORY, CHANGE, FLAGS, formatTime } from '../labels'
import type { Doc, ExtractedEvent, Observation } from '../types'
import { Highlighted, ReviewBadge } from './common'
import { ReviewControls } from './ReviewControls'

interface Props {
  doc: Doc | null
  tab: Tab
  onTab: (tab: Tab) => void
  activeSegment: string | null
  activeEvent: string | null
  onInspect: (segmentId: string) => void
  onSelectEvent: (event: ExtractedEvent) => void
  byEvent: Map<string, Observation>
  review: ReviewContext
  onExtract: (id: string) => Promise<boolean>
  onRetry: (id: string) => Promise<boolean>
  onOpenTimeline: (observationId: string) => void
}

export function DocumentView(props: Props) {
  const { doc, tab, onTab } = props
  return (
    <>
      <div className="top">
        <div>
          <div className="eyebrow">Read. Organise. Verify.</div>
          <h1>
            Your documents,
            <br />
            in a clearer light.
          </h1>
          <p className="muted">Keep the original and its extracted text together.</p>
        </div>
      </div>
      <div className="viewer">
        {!doc ? (
          <div className="empty">
            <span className="empty-icon" aria-hidden="true">
              ▤
            </span>
            <h2>A place for every report.</h2>
            <p className="muted">
              Upload your first document to inspect its original,
              <br />
              extracted text and source locations.
            </p>
          </div>
        ) : (
          <>
            <div className="viewer-head">
              <strong className="small">{doc.filename}</strong>
              <div className="tabs">
                <button onClick={() => onTab('text')} className={tab === 'text' ? 'active' : ''} aria-pressed={tab === 'text'}>
                  Extracted text
                </button>
                <button onClick={() => onTab('original')} className={tab === 'original' ? 'active' : ''} aria-pressed={tab === 'original'}>
                  Original document
                </button>
              </div>
            </div>
            <Pane {...props} doc={doc} />
          </>
        )}
      </div>
      {doc?.status === 'ready' && <EventsPanel {...props} doc={doc} />}
    </>
  )
}

function Pane({ doc, tab, activeSegment, activeEvent, onInspect, onRetry }: Props & { doc: Doc }) {
  const event = doc.extraction?.events.find((e) => e.id === activeEvent) ?? null
  const segment = doc.segments.find((s) => s.id === activeSegment) ?? null

  useEffect(() => {
    if (tab === 'text' && activeSegment) document.querySelector('.segment.active')?.scrollIntoView({ block: 'center' })
  }, [tab, activeSegment, doc.id])

  if (tab === 'original') {
    if (doc.extension === '.pdf') {
      const page = segment?.provenance[0]?.page ?? 1
      return (
        <div>
          <iframe key={`${doc.id}:${page}`} title="Original PDF document" src={`${originalUrl(doc.id)}#page=${page}`} />
          <a className="open-pdf" href={originalUrl(doc.id)} target="_blank" rel="noopener">
            Open PDF in a separate tab ↗
          </a>
        </div>
      )
    }
    return (
      <div className="pane">
        <OriginalText id={doc.id} />
      </div>
    )
  }
  if (doc.status === 'failed') {
    return (
      <div className="pane">
        <div className="notice error">
          <h3>Processing needs attention</h3>
          <p>{doc.error}</p>
        </div>
        <button onClick={() => void onRetry(doc.id)}>Retry processing</button>
      </div>
    )
  }
  if (doc.status !== 'ready') {
    return (
      <div className="pane">
        <div className="empty">
          <span className="status processing">{doc.status}</span>
          <h2>Preparing the report.</h2>
          <p className="muted">
            PDF layout analysis and OCR may take a few minutes.
            <br />
            The first PDF also downloads local processing models.
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="pane">
      {doc.segments.map((s) => {
        const evidence = event && event.evidence.segment_id === s.id ? event.evidence : null
        return (
          <p
            key={s.id}
            className={`segment ${activeSegment === s.id ? 'active' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => onInspect(s.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onInspect(s.id)
              }
            }}
          >
            <small>
              {s.id} · {s.provenance.length ? `Page ${s.provenance.map((p) => p.page).join(', ')}` : 'Text source'} · characters {s.start}–{s.end}
            </small>
            {evidence ? <Highlighted text={s.text} start={evidence.start - s.start} end={evidence.end - s.start} /> : s.text}
          </p>
        )
      })}
    </div>
  )
}

function OriginalText({ id }: { id: string }) {
  const [text, setText] = useState('Loading original…')
  useEffect(() => {
    let live = true
    setText('Loading original…')
    fetch(originalUrl(id))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((t) => live && setText(t))
      .catch(() => live && setText('The original could not be loaded. Check that the local server is running.'))
    return () => {
      live = false
    }
  }, [id])
  return <pre className="original-text">{text}</pre>
}

function EventsPanel({ doc, activeEvent, onSelectEvent, byEvent, review, onExtract, onOpenTimeline }: Props & { doc: Doc }) {
  const x = doc.extraction
  const status = x?.status
  const [starting, setStarting] = useState(false)
  const counts = x?.events.reduce<Record<string, number>>((acc, e) => {
    const s = byEvent.get(e.id)?.review_status ?? 'unreviewed'
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})
  const extract = async () => {
    setStarting(true)
    await onExtract(doc.id)
    setStarting(false)
  }
  return (
    <section className="events" aria-live="polite">
      <div className="events-head">
        <div>
          <div className="eyebrow">Clinical events</div>
          <h3>{status === 'ready' ? `${x!.events.length} events with verified evidence` : 'Not extracted yet'}</h3>
        </div>
        {!status || status === 'failed' ? (
          <button className="primary" disabled={starting} onClick={() => void extract()}>
            {status === 'failed' ? 'Retry extraction' : 'Extract events'}
          </button>
        ) : status !== 'ready' ? (
          <span className="status processing">{status}</span>
        ) : null}
      </div>
      {(!status || status === 'failed') && (
        <p className="notice">Sends this report’s text to DeutschlandGPT. Synthetic data only. Uses paid credits.</p>
      )}
      {status === 'failed' && <p className="notice error">{x!.error}</p>}
      {(status === 'queued' || status === 'running') && (
        <p className="muted">DeutschlandGPT is reading the report. This usually takes a few seconds.</p>
      )}
      {status === 'ready' && x && (
        <>
          <p className="muted">
            {x.model} · prompt {x.prompt_version} · {x.latency_s} s · {x.finished_at ? formatTime(x.finished_at) : ''}
            {counts && ` · ${Object.entries(counts).map(([s, n]) => `${n} ${s}`).join(', ')}`}
          </p>
          {x.events.length === 0 && <p className="muted">The model found no clinical events in this report.</p>}
          {x.events.map((e) => {
            const o = byEvent.get(e.id)
            const active = activeEvent === e.id
            return (
              <article key={e.id} className={`event ${active ? 'active' : ''} ${o?.review_status === 'rejected' ? 'is-rejected' : ''}`}>
                <button className="event-main" onClick={() => onSelectEvent(e)} aria-expanded={active}>
                  <strong>{o?.concept ?? e.concept}</strong>
                  <span className="labels">
                    <span>{CATEGORY[o?.category ?? e.category]}</span>
                    <span className={o?.assertion ?? e.assertion}>{ASSERTION[o?.assertion ?? e.assertion]}</span>
                    <span>{CHANGE[o?.change ?? e.change]}</span>
                    <span>{(o ? o.event_date : e.event_date) ? `Event date ${o ? o.event_date : e.event_date}` : 'Event date not stated'}</span>
                    {o && <ReviewBadge status={o.review_status} />}
                  </span>
                  <span className="quote">“{e.evidence.quote}”</span>
                  <span className="muted">
                    {' '}
                    · {e.evidence.segment_id} · characters {e.evidence.start}–{e.evidence.end}
                  </span>
                  {e.flags.map((f) => (
                    <span key={f} className="flag">
                      ⚠ {FLAGS[f] ?? f}
                    </span>
                  ))}
                </button>
                {active &&
                  (o ? (
                    <div className="event-review">
                      <ReviewControls observation={o} review={review} />
                      {o.finding_id && (
                        <button className="link-button" onClick={() => onOpenTimeline(o.id)}>
                          Show on the timeline →
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="muted event-review">Review controls appear once linking has finished.</p>
                  ))}
              </article>
            )
          })}
          {x.rejected.length > 0 && (
            <details>
              <summary className="muted">{x.rejected.length} proposal(s) rejected: evidence could not be verified</summary>
              {x.rejected.map((r, i) => (
                <p key={i} className="detail">
                  {r.proposal.concept}: {r.reason}
                </p>
              ))}
            </details>
          )}
        </>
      )}
    </section>
  )
}
