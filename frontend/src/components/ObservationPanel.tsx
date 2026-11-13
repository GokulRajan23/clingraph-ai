import { useEffect, useRef } from 'react'
import type { ReviewContext, Tab } from '../App'
import { ASSERTION, CATEGORY, CHANGE, FIELD, fieldValue, RELATION, SIDE } from '../labels'
import { cardState, firstDocumentedId } from '../lib/timeline'
import type { Doc, Field, FindingsPayload, Link, Observation } from '../types'
import { Highlighted, StateChip } from './common'
import { ReviewControls } from './ReviewControls'

interface Props {
  observation: Observation | null
  selectedId: string | null
  docs: Doc[]
  linked: FindingsPayload
  observations: Map<string, Observation>
  review: ReviewContext
  onShow: (reportId: string, eventId: string, tab?: Tab) => void
}

const SHOWN: Field[] = ['category', 'assertion', 'change', 'event_date']

export function ObservationPanel({ observation: o, selectedId, docs, linked, observations, review, onShow }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  // On narrow screens the panel sits below the timeline; bring it into view when a card is chosen.
  useEffect(() => {
    if (selectedId && window.matchMedia('(max-width: 1100px)').matches) panel.current?.scrollIntoView({ block: 'start' })
  }, [selectedId])

  if (!o) {
    return (
      <div ref={panel}>
        <div className="eyebrow">Selected event</div>
        <h2>Check the source.</h2>
        <p className="muted">
          {selectedId
            ? 'This event is no longer present: its report was re-extracted or is being extracted again.'
            : 'Select an event card to see its source passage, its links and the review controls.'}
        </p>
      </div>
    )
  }
  const doc = docs.find((d) => d.id === o.report_id)
  const event = doc?.extraction?.events.find((e) => e.id === o.event_id)
  const segment = doc?.segments.find((s) => s.id === event?.evidence.segment_id)
  const finding = linked.findings.find((f) => f.id === o.finding_id) ?? null
  const { state, markers } = cardState(o, firstDocumentedId(finding))
  const incoming = linked.links.filter((l) => l.to_observation === o.id)
  const outgoing = linked.links.filter((l) => l.from_observation === o.id)
  const page = event?.evidence.provenance[0]?.page

  return (
    <div ref={panel} className="observation">
      <div className="eyebrow">Selected event</div>
      <h2>{o.concept}</h2>
      <StateChip state={state} />
      {markers.map((m) => (
        <span key={m} className="marker">
          {m}
        </span>
      ))}
      <dl className="facts">
        {SHOWN.map((field) => (
          <div key={field}>
            <dt>{FIELD[field]}</dt>
            <dd>
              {field === 'category' ? CATEGORY[o.category] : field === 'assertion' ? ASSERTION[o.assertion] : field === 'change' ? CHANGE[o.change] : fieldValue(field, o.event_date)}
              {o.corrected_fields.includes(field) && <span className="extracted"> (extracted: {fieldValue(field, o.original[field])})</span>}
            </dd>
          </div>
        ))}
        {o.corrected_fields.includes('concept') && (
          <div>
            <dt>Extracted concept</dt>
            <dd>“{o.original.concept}”</dd>
          </div>
        )}
        {o.laterality && (
          <div>
            <dt>Side (from the quote)</dt>
            <dd>{SIDE[o.laterality]}</dd>
          </div>
        )}
        {o.measurements.length > 0 && (
          <div>
            <dt>Measurements</dt>
            <dd>{o.measurements.join(', ')}</dd>
          </div>
        )}
      </dl>

      <div className="field">
        <h3>Source</h3>
        <p className="muted">
          {o.filename ?? 'Report'} · {o.report_date ?? 'report date unknown'}
          {page ? ` · PDF page ${page}` : ''}
        </p>
        <p className="source">
          {segment && event ? (
            <Highlighted text={segment.text} start={event.evidence.start - segment.start} end={event.evidence.end - segment.start} />
          ) : (
            <mark>{o.quote}</mark>
          )}
        </p>
        <div className="actions">
          <button onClick={() => onShow(o.report_id, o.event_id, 'text')}>Show in document</button>
          <button onClick={() => onShow(o.report_id, o.event_id, 'original')}>{doc?.extension === '.pdf' ? 'Open original page' : 'Open original'}</button>
        </div>
      </div>

      {(incoming.length > 0 || outgoing.length > 0 || o.unresolved.length > 0) && (
        <div className="field">
          <h3>Links</h3>
          {incoming.map((l) => (
            <LinkLine key={l.id} link={l} other={observations.get(l.from_observation)} direction="from" />
          ))}
          {outgoing.map((l) => (
            <LinkLine key={l.id} link={l} other={observations.get(l.to_observation)} direction="to" />
          ))}
          {o.unresolved.map((u) => (
            <p key={u.comparison_date} className="flag">
              ⚠ {u.message}
            </p>
          ))}
        </div>
      )}

      <div className="field">
        <h3>Review</h3>
        <ReviewControls key={o.id} observation={o} review={review} />
      </div>
    </div>
  )
}

function LinkLine({ link, other, direction }: { link: Link; other: Observation | undefined; direction: 'from' | 'to' }) {
  return (
    <div className={`link-line ${link.review_required ? 'pending' : ''}`}>
      <strong>
        {direction === 'from' ? '↳ ' : '→ '}
        {RELATION[link.relationship] ?? link.relationship}
        {link.comparison_date ? ` vs ${link.comparison_date}` : ''}
      </strong>
      {link.review_required && <span className="review-flag">⚑ needs review</span>}
      <span className="muted">
        {direction === 'from' ? 'Earlier' : 'Later'}: {other?.filename ?? 'report'} · {other?.report_date ?? 'date unknown'} · {link.basis}
      </span>
      <span className="quote">“{direction === 'from' ? link.evidence.from : link.evidence.to}”</span>
    </div>
  )
}
