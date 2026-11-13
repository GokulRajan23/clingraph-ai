// Small builders for unit tests.
import type { Correction, Doc, EventFields, Finding, FindingsPayload, Link, Observation } from '../types'

export function doc(id: string, reportDate: string | null, over: Partial<Doc> = {}): Doc {
  return {
    id, digest: id, filename: `${id}.txt`, extension: '.txt', status: 'ready', created_at: '2026-11-13T09:00:00+00:00',
    report_date: reportDate, date_source: reportDate ? 'detected' : 'unknown', text: '', segments: [], date_candidates: [],
    date_warning: null, date_history: [], error: null, engine: 'UTF-8 text',
    extraction: { status: 'ready', finished_at: null, latency_s: null, events: [], rejected: [], error: null },
    ...over,
  }
}

const FIELDS: EventFields = { concept: 'Ascites', category: 'complication', assertion: 'present', change: 'unknown', event_date: null }

/** An observation in `report`; `extracted` sets the original values, `over` the effective ones. */
export function obs(id: string, report: Doc, over: Partial<Observation> = {}, extracted: Partial<EventFields> = {}): Observation {
  const original = { ...FIELDS, ...extracted }
  return {
    id, event_id: `${id}:e1`, patient_id: 'local', report_id: report.id, report_date: report.report_date,
    filename: report.filename, quote: 'Aszites.', start: 0, end: 8, laterality: null, comparison_dates: [], measurements: [],
    label_key: ['ascites'], unresolved: [], finding_id: 'f', review_status: 'unreviewed', original, corrected_fields: [],
    correction_ids: [], ...original, ...over,
  }
}

export function finding(id: string, observations: Observation[], over: Partial<Finding> = {}): Finding {
  return {
    id, concept: observations[0]?.concept ?? id, laterality: null, observations,
    first_documented: null, first_documented_uncertain: false, review_required: false, ...over,
  }
}

export function link(from: string, to: string, over: Partial<Link> = {}): Link {
  return {
    id: `${from}>${to}`, from_observation: from, to_observation: to, relationship: 'same_finding', comparison_date: null,
    basis: 'Same finding and side; no resolved comparison; review required', review_required: true,
    evidence: { from: '', to: '' }, ...over,
  }
}

export function payload(over: Partial<FindingsPayload> = {}): FindingsPayload {
  return { findings: [], links: [], unresolved: [], rejected: [], corrections: [], ...over }
}

export function correction(seq: number, observationId: string, over: Partial<Correction> = {}): Correction {
  return {
    id: `c${seq}`, seq, observation_id: observationId, report_id: 'R1', event_id: 'R1:e1', action: 'confirm', changes: {},
    previous: {}, status_before: 'unreviewed', status_after: 'confirmed', note: null, at: '2026-11-13T21:40:00+00:00',
    target: { quote: 'Aszites.', filename: 'R1.txt', report_date: '2024-01-10', concept: 'Ascites' }, stale: false, ...over,
  }
}
