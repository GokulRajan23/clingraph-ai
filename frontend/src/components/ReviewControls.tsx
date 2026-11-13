import { useId, useState } from 'react'
import type { ReviewContext } from '../App'
import { ASSERTION, CATEGORY, CHANGE, FIELD, fieldValue, formatTime } from '../labels'
import {
  availableActions, describeCorrection, differsFromExtracted, diffChanges, draftError, draftOf, historyFor, revertField, type Draft,
} from '../lib/corrections'
import type { Action, Field, Observation } from '../types'
import { ASSERTIONS, CATEGORIES, CHANGES, FIELDS } from '../types'
import { ReviewBadge } from './common'

/** Confirm, reject, restore or edit one event; the same control in the timeline and the document view. */
export function ReviewControls({ observation: o, review }: { observation: Observation; review: ReviewContext }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => draftOf(o))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const id = useId()
  const history = historyFor(o.id, review.corrections)

  const send = async (action: Action) => {
    if (action === 'edit') {
      setDraft(draftOf(o))
      setMessage(null)
      setEditing(true)
      return
    }
    setBusy(true)
    const ok = await review.onCorrect({ observation_id: o.id, action, note: note.trim() || null })
    setBusy(false)
    if (ok) setNote('')
  }

  const save = async () => {
    const error = draftError(draft)
    if (error) return setMessage(error)
    const changes = diffChanges(o, draft)
    if (!changes) return setMessage('Nothing to save: the values are unchanged.')
    setBusy(true)
    const ok = await review.onCorrect({ observation_id: o.id, action: 'edit', changes, note: note.trim() || null })
    setBusy(false)
    if (ok) {
      setEditing(false)
      setNote('')
    }
  }

  const set = (field: Field, value: string) => setDraft((d) => ({ ...d, [field]: value }))

  return (
    <div className="review-box">
      <div className="review-head">
        <ReviewBadge status={o.review_status} />
        {o.corrected_fields.length > 0 && <span className="muted">Corrected: {o.corrected_fields.map((f) => FIELD[f].toLowerCase()).join(', ')}</span>}
      </div>
      {!editing && (
        <>
          <div className="actions">
            {availableActions(o.review_status).map(({ action, label }) => (
              <button key={action} className={action === 'confirm' ? 'primary' : ''} disabled={busy} onClick={() => void send(action)}>
                {label}
              </button>
            ))}
          </div>
          {o.review_status !== 'rejected' && (
            <input
              className="note"
              aria-label="Note for the next review action (optional)"
              placeholder="Note (optional)"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
          {o.review_status === 'rejected' && <p className="muted">Rejected events are excluded from linking and from “first documented”.</p>}
        </>
      )}
      {editing && (
        <form
          className="edit"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          {FIELDS.map((field) => (
            <div key={field} className="edit-field">
              <label htmlFor={`${id}-${field}`}>{FIELD[field]}</label>
              {field === 'concept' && (
                <>
                  <input id={`${id}-${field}`} list={`${id}-concepts`} value={draft.concept} maxLength={200} onChange={(e) => set(field, e.target.value)} />
                  <datalist id={`${id}-concepts`}>
                    {review.suggestions.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </>
              )}
              {field === 'category' && (
                <select id={`${id}-${field}`} value={draft.category} onChange={(e) => set(field, e.target.value)}>
                  {CATEGORIES.map((v) => (
                    <option key={v} value={v}>
                      {CATEGORY[v]}
                    </option>
                  ))}
                </select>
              )}
              {field === 'assertion' && (
                <select id={`${id}-${field}`} value={draft.assertion} onChange={(e) => set(field, e.target.value)}>
                  {ASSERTIONS.map((v) => (
                    <option key={v} value={v}>
                      {ASSERTION[v]}
                    </option>
                  ))}
                </select>
              )}
              {field === 'change' && (
                <select id={`${id}-${field}`} value={draft.change} onChange={(e) => set(field, e.target.value)}>
                  {CHANGES.map((v) => (
                    <option key={v} value={v}>
                      {CHANGE[v]}
                    </option>
                  ))}
                </select>
              )}
              {field === 'event_date' && (
                <input id={`${id}-${field}`} type="date" value={draft.event_date} onChange={(e) => set(field, e.target.value)} />
              )}
              {differsFromExtracted(o, draft, field) && (
                <p className="extracted">
                  Extracted: {field === 'concept' ? `“${o.original.concept}”` : fieldValue(field, o.original[field])}{' '}
                  <button type="button" className="link-button" onClick={() => setDraft((d) => revertField(o, d, field))}>
                    Revert to extracted value
                  </button>
                </p>
              )}
            </div>
          ))}
          <input
            className="note"
            aria-label="Note for this correction (optional)"
            placeholder="Note (optional)"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {message && <p className="notice">{message}</p>}
          <div className="actions">
            <button type="submit" className="primary" disabled={busy}>
              Save correction
            </button>
            <button type="button" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
          <p className="muted">
            The evidence quote cannot be edited. Renaming to match another report’s wording creates a candidate link that still needs review; prefer
            a name the collection already uses.
          </p>
        </form>
      )}
      <p className="muted">Corrections are saved in an append-only log; the original extraction is kept.</p>
      {history.length > 0 && (
        <details className="history" open={history.length <= 3}>
          <summary>Review history ({history.length})</summary>
          <ol>
            {history.map((c) => {
              const d = describeCorrection(c)
              return (
                <li key={c.id}>
                  <strong>{d.title}</strong> · {formatTime(c.at)}
                  {c.stale && <span className="flag"> · stale: target no longer present</span>}
                  {d.changes.map((line) => (
                    <span key={line} className="history-line">
                      {line}
                    </span>
                  ))}
                  <span className="history-line muted">{d.status}</span>
                  {c.note && <span className="history-line">Note: {c.note}</span>}
                </li>
              )
            })}
          </ol>
        </details>
      )}
    </div>
  )
}
