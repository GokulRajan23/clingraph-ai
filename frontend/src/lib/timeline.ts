// Timeline layout: one row per finding, one column per dated report, then a single undated lane.
// Pure functions over API payloads, so the layout rules are unit-tested (timeline.test.ts).
import type { Category, Doc, Finding, FindingsPayload, Link, Observation } from '../types'
import { CATEGORIES } from '../types'

export type CardState =
  | 'first_documented' | 'progressed' | 'stable' | 'improved' | 'procedure'
  | 'absent' | 'historical' | 'suspected' | 'unclear' | 'unknown' | 'device' | 'documented' | 'rejected'

/** Every state has a text label and a glyph; colour is never the only signal. Cards use the short label;
 * the legend and the card's tooltip give the full one. */
export const STATE: Record<CardState, { label: string; short: string; glyph: string }> = {
  first_documented: { label: 'First documented in this collection', short: 'First documented', glyph: '●' },
  progressed: { label: 'Progressed (stated)', short: 'Progressed (stated)', glyph: '▲' },
  stable: { label: 'Stable (stated)', short: 'Stable (stated)', glyph: '=' },
  improved: { label: 'Improved (stated)', short: 'Improved (stated)', glyph: '▼' },
  procedure: { label: 'Procedure', short: 'Procedure', glyph: '✚' },
  absent: { label: 'Not present (negated)', short: 'Not present', glyph: '○' },
  historical: { label: 'Historical: refers to an earlier report', short: 'Historical reference', glyph: '↺' },
  suspected: { label: 'Suspected', short: 'Suspected', glyph: '◌' },
  unclear: { label: 'Unclear: contradictory statements', short: 'Unclear', glyph: '?' },
  unknown: { label: 'Unknown or pending', short: 'Unknown', glyph: '…' },
  device: { label: 'Device documented', short: 'Device documented', glyph: '◆' },
  documented: { label: 'Documented; change not stated', short: 'No change stated', glyph: '•' },
  rejected: { label: 'Rejected: excluded from linking', short: 'Rejected', glyph: '✕' },
}

export const LEGEND: CardState[] = [
  'first_documented', 'progressed', 'stable', 'improved', 'procedure',
  'absent', 'historical', 'suspected', 'unclear', 'device', 'documented',
]

export const UNDATED = 'undated'

export interface Filters {
  categories: Category[]
  from: string
  to: string
  showRejected: boolean
}

export const DEFAULT_FILTERS: Filters = { categories: [...CATEGORIES], from: '', to: '', showRejected: false }

export interface Column {
  key: string
  date: string | null
  reports: { id: string; filename: string }[]
}

export interface Card {
  observation: Observation
  state: CardState
  markers: string[]
  incoming: Link[]
}

export interface Row {
  key: string
  finding: Finding | null
  cells: Record<string, Card[]>
}

export interface TimelineModel {
  columns: Column[]
  rows: Row[]
  rejectedRow: Row | null
  hiddenFindings: number
}

const CHANGE_STATES = new Set<string>(['progressed', 'stable', 'improved'])

export function extractedDocuments(docs: Doc[]): Doc[] {
  return docs.filter((d) => d.status === 'ready' && d.extraction?.status === 'ready')
}

/** Dated reports in date order (ties keep the API order), then one lane for all undated reports.
 * Undated reports are never ordered by filename or upload; the date filter never hides their lane. */
export function buildColumns(docs: Doc[], filters: Pick<Filters, 'from' | 'to'>): Column[] {
  const extracted = extractedDocuments(docs)
  const inRange = (date: string) => (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to)
  const dated = extracted
    .filter((d): d is Doc & { report_date: string } => d.report_date !== null)
    .sort((a, b) => (a.report_date < b.report_date ? -1 : a.report_date > b.report_date ? 1 : 0))
  const columns: Column[] = dated
    .filter((d) => inRange(d.report_date))
    .map((d) => ({ key: d.id, date: d.report_date, reports: [{ id: d.id, filename: d.filename }] }))
  const undated = extracted.filter((d) => d.report_date === null)
  if (undated.length) columns.push({ key: UNDATED, date: null, reports: undated.map((d) => ({ id: d.id, filename: d.filename })) })
  return columns
}

/** The observation that made the finding "first documented": its earliest dated present or suspected one.
 * Mirrors app/linking.py, whose finding observations are already in date order. */
export function firstDocumentedId(finding: Finding | null): string | null {
  if (!finding) return null
  const first = finding.observations.find((o) => o.report_date && (o.assertion === 'present' || o.assertion === 'suspected'))
  return first?.id ?? null
}

export function cardState(o: Observation, firstId: string | null): { state: CardState; markers: string[] } {
  const first = o.id === firstId
  const markers: string[] = []
  let state: CardState
  if (o.review_status === 'rejected') state = 'rejected'
  else if (o.assertion === 'historical') state = 'historical'
  else if (o.assertion === 'absent') state = 'absent'
  else if (o.category === 'procedure' || o.change === 'performed') state = 'procedure'
  else if (CHANGE_STATES.has(o.change)) {
    state = o.change as CardState
    if (first) markers.push('First in this collection')
  } else if (first) state = 'first_documented'
  else if (o.change === 'unclear') state = 'unclear'
  else if (o.assertion === 'suspected') state = 'suspected'
  else if (o.assertion === 'unknown') state = 'unknown'
  else if (o.category === 'device') state = 'device'
  else state = 'documented'
  if (state !== 'rejected') {
    if (o.assertion === 'suspected' && state !== 'suspected') markers.push('Suspected')
    if (o.change === 'unclear' && state !== 'unclear') markers.push('Unclear: contradictory statements')
    if (o.change === 'first_documented' && !first && !['historical', 'absent', 'procedure'].includes(state)) {
      markers.push('Described as new in this report')
    }
  }
  return { state, markers }
}

export function columnKey(o: Observation): string {
  return o.report_date ? o.report_id : UNDATED
}

export function buildTimeline(docs: Doc[], payload: FindingsPayload, filters: Filters): TimelineModel {
  const columns = buildColumns(docs, filters)
  const visible = new Set(columns.map((c) => c.key))
  const incoming = new Map<string, Link[]>()
  for (const link of payload.links) incoming.set(link.to_observation, [...(incoming.get(link.to_observation) ?? []), link])
  const place = (observations: Observation[], firstId: string | null) => {
    const cells: Record<string, Card[]> = {}
    let count = 0
    for (const o of observations) {
      const key = columnKey(o)
      if (!visible.has(key) || !filters.categories.includes(o.category)) continue
      ;(cells[key] ??= []).push({ observation: o, ...cardState(o, firstId), incoming: incoming.get(o.id) ?? [] })
      count += 1
    }
    return { cells, count }
  }
  const rows: Row[] = []
  let hiddenFindings = 0
  for (const finding of payload.findings) {
    const { cells, count } = place(finding.observations, firstDocumentedId(finding))
    if (count) rows.push({ key: finding.id, finding, cells })
    else hiddenFindings += 1
  }
  let rejectedRow: Row | null = null
  if (filters.showRejected) {
    const { cells, count } = place(payload.rejected, null)
    if (count) rejectedRow = { key: 'rejected', finding: null, cells }
  }
  return { columns, rows, rejectedRow, hiddenFindings }
}

export function summarize(payload: FindingsPayload) {
  return {
    findings: payload.findings.length,
    links: payload.links.length,
    needReview: payload.links.filter((l) => l.review_required).length,
    corrections: payload.corrections.length,
    stale: payload.corrections.filter((c) => c.stale).length,
  }
}

/** Every observation by id, including rejected ones. */
export function observationIndex(payload: FindingsPayload): Map<string, Observation> {
  const index = new Map<string, Observation>()
  for (const f of payload.findings) for (const o of f.observations) index.set(o.id, o)
  for (const o of payload.rejected) index.set(o.id, o)
  return index
}

/** Existing effective concepts, offered when renaming so a correction moves toward wording already used. */
export function conceptSuggestions(payload: FindingsPayload): string[] {
  const concepts = new Set<string>()
  for (const f of payload.findings) for (const o of f.observations) concepts.add(o.concept)
  return [...concepts].sort((a, b) => a.localeCompare(b))
}
