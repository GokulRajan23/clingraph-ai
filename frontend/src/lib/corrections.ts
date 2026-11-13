// Correction-state logic shared by the timeline and the document view (unit-tested in corrections.test.ts).
// The server folds the append-only log; these helpers only decide what the user may do next and what to send.
import { FIELD, fieldValue, REVIEW } from '../labels'
import type { Action, Assertion, Category, Change, Correction, EventFields, Field, Observation, ReviewStatus } from '../types'
import { FIELDS } from '../types'

export interface ActionOption {
  action: Action
  label: string
}

/** Mirrors the transitions accepted by POST /api/corrections. */
export function availableActions(status: ReviewStatus): ActionOption[] {
  switch (status) {
    case 'unreviewed':
      return [{ action: 'confirm', label: 'Confirm' }, { action: 'reject', label: 'Reject' }, { action: 'edit', label: 'Edit' }]
    case 'confirmed':
      return [{ action: 'restore', label: 'Mark as unreviewed' }, { action: 'reject', label: 'Reject' }, { action: 'edit', label: 'Edit' }]
    case 'corrected':
      return [{ action: 'reject', label: 'Reject' }, { action: 'edit', label: 'Edit' }]
    case 'rejected':
      return [{ action: 'restore', label: 'Undo rejection' }]
  }
}

/** Form state; an empty event date means "not stated". */
export interface Draft {
  concept: string
  category: Category
  assertion: Assertion
  change: Change
  event_date: string
}

export function draftOf(o: Observation): Draft {
  return { concept: o.concept, category: o.category, assertion: o.assertion, change: o.change, event_date: o.event_date ?? '' }
}

function asFields(draft: Draft): EventFields {
  return { ...draft, concept: draft.concept.trim(), event_date: draft.event_date || null }
}

export function draftError(draft: Draft): string | null {
  const concept = draft.concept.trim()
  if (!concept) return 'Concept cannot be empty.'
  if (concept.length > 200) return 'Concept can have at most 200 characters.'
  if (draft.event_date && !/^\d{4}-\d{2}-\d{2}$/.test(draft.event_date)) return 'Event date must be a valid date.'
  return null
}

/** Only fields that differ from the current effective values; null when nothing would change. */
export function diffChanges(o: Observation, draft: Draft): Partial<EventFields> | null {
  const next = asFields(draft)
  const changes: Partial<Record<Field, unknown>> = {}
  for (const field of FIELDS) if (next[field] !== o[field]) changes[field] = next[field]
  return Object.keys(changes).length ? (changes as Partial<EventFields>) : null
}

/** True when the draft holds a value other than the extracted one for this field. */
export function differsFromExtracted(o: Observation, draft: Draft, field: Field): boolean {
  return asFields(draft)[field] !== o.original[field]
}

/** The draft with one field set back to the extracted value (saving it removes that correction). */
export function revertField(o: Observation, draft: Draft, field: Field): Draft {
  const original = o.original[field]
  return { ...draft, [field]: field === 'event_date' ? (original ?? '') : original }
}

/** This observation's corrections, newest first. */
export function historyFor(observationId: string, corrections: Correction[]): Correction[] {
  return corrections.filter((c) => c.observation_id === observationId).sort((a, b) => b.seq - a.seq)
}

export function describeCorrection(c: Correction): { title: string; changes: string[]; status: string } {
  const title =
    c.action === 'confirm' ? 'Confirmed'
      : c.action === 'reject' ? 'Rejected'
        : c.action === 'edit' ? 'Edited'
          : c.status_before === 'rejected' ? 'Rejection undone' : 'Marked as unreviewed'
  const show = (field: Field, value: unknown) => (field === 'concept' ? `“${String(value)}”` : fieldValue(field, value))
  const changes = FIELDS.filter((f) => f in c.changes).map((f) => `${FIELD[f]}: ${show(f, c.previous[f])} → ${show(f, c.changes[f])}`)
  return { title, changes, status: `${REVIEW[c.status_before].label} → ${REVIEW[c.status_after].label}` }
}
