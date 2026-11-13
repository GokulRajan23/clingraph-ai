import { useState } from 'react'
import type { Doc } from '../types'

interface Props {
  doc: Doc | null
  activeSegment: string | null
  onOriginal: () => void
  onSaveDate: (id: string, date: string | null) => Promise<boolean>
}

export function DocumentDetails({ doc, activeSegment, onOriginal, onSaveDate }: Props) {
  if (!doc) {
    return (
      <>
        <div className="eyebrow">Document details</div>
        <h2>A traceable source.</h2>
        <p className="muted">Select a document to inspect its date and source location.</p>
      </>
    )
  }
  const segment = doc.segments.find((s) => s.id === activeSegment) ?? null
  return (
    <>
      <div className="eyebrow">Document details</div>
      <h2>A traceable source.</h2>
      <span className={`status ${doc.status}`}>{doc.status}</span>
      <div className="field">
        {/* Keyed by the saved value: a new draft starts only when the stored date changes, never on polling. */}
        <DateEditor key={`${doc.id}:${doc.report_date ?? ''}`} doc={doc} onSave={onSaveDate} />
        <p className="muted spaced">
          Source: {doc.date_source} · Type: report date
        </p>
        {doc.date_warning && doc.date_source !== 'manual' && <p className="notice">{doc.date_warning}</p>}
        <p className="muted spaced">Clinical event dates stay separate. A procedure mentioned in a report may have happened earlier.</p>
      </div>
      <div className="field">
        <h3>Date evidence</h3>
        {doc.date_candidates.length ? (
          doc.date_candidates.map((c, i) => (
            <p key={i} className="detail spaced">
              {c.quote}
              <br />
              Characters {c.start}–{c.end}
            </p>
          ))
        ) : (
          <p className="muted">No labelled report date detected.</p>
        )}
        {doc.date_history.length > 0 && (
          <details className="spaced">
            <summary className="muted">Correction history</summary>
            {doc.date_history.map((h, i) => (
              <p key={i} className="date-history">
                {h.previous ?? 'Unknown'} → {h.value ?? 'Unknown'}
                <br />
                {h.at}
              </p>
            ))}
          </details>
        )}
      </div>
      <div className="field">
        <h3>Source location</h3>
        <div className="detail">
          {segment ? (
            <>
              <p>
                {segment.id} · offsets [{segment.start}, {segment.end})
              </p>
              {segment.provenance.length ? (
                segment.provenance.map((p, i) => (
                  <p key={i} className="spaced">
                    PDF page {p.page}
                    <br />
                    Box: {JSON.stringify(p.bbox)}
                  </p>
                ))
              ) : (
                <p>Plain text has character offsets; no PDF page coordinates.</p>
              )}
              <button className="spaced" onClick={onOriginal}>
                View original ↗
              </button>
            </>
          ) : (
            'Select a passage in the extracted text.'
          )}
        </div>
      </div>
      <div className="detail">
        <p>Engine: {doc.engine ?? 'Pending'}</p>
        <p className="spaced">
          Document ID
          <br />
          {doc.id}
        </p>
        <p className="spaced">
          SHA-256
          <br />
          {doc.digest}
        </p>
      </div>
    </>
  )
}

function DateEditor({ doc, onSave }: { doc: Doc; onSave: Props['onSaveDate'] }) {
  const [draft, setDraft] = useState(doc.report_date ?? '')
  const [saving, setSaving] = useState(false)
  return (
    <>
      <label htmlFor="reportDate">Report date</label>
      <input id="reportDate" type="date" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button
        disabled={saving}
        onClick={async () => {
          setSaving(true)
          await onSave(doc.id, draft || null)
          setSaving(false)
        }}
      >
        Save date
      </button>
    </>
  )
}
