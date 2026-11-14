import { findingStates, reportsOf } from './query'
import type { Graph, GraphNode, NodeType } from './types'

/**
 * The patient's history laid out over time, derived from the knowledge graph: one lane per
 * finding (its states and how each changed), then diagnoses, procedures and therapy. Dates are
 * ISO `yyyy-mm-dd` strings, so they sort and compare as text.
 */

/** How a finding changed at a point in time. `documented` means no change was stated. */
export type Change = 'new' | 'progressed' | 'stable' | 'improved' | 'documented'

export interface TimelineMark {
  /** Unique within the timeline (a finding without states has a mark per report). */
  key: string
  nodeId: string
  type: NodeType
  date: string
  /** The date as written in the source, for display. */
  dateText: string
  /** First line of the direct label. */
  label: string
  /** Optional second line, e.g. a size. */
  detail?: string
  /** Set on finding lanes only. */
  change?: Change
  /** The report a `documented` mark stands for. */
  reportId?: string
}

export interface TimelineSpan {
  key: string
  nodeId: string
  label: string
  start: string
  end: string
  startText: string
  /** Empty when ongoing. */
  endText: string
  /** Still running at the last dated item: `end` is the timeline's end. */
  ongoing: boolean
}

export type LaneKind = 'finding' | 'diagnoses' | 'procedures' | 'therapy'

export interface TimelineLane {
  /** The finding's node ID, or the lane kind for the grouped lanes. */
  id: string
  kind: LaneKind
  label: string
  marks: TimelineMark[]
  spans: TimelineSpan[]
  /** Marks are successive states of one thing and are drawn joined. */
  connected: boolean
}

export interface TimelineReport {
  nodeId: string
  label: string
  date: string
  dateText: string
}

export interface Timeline {
  start: string | null
  end: string | null
  reports: TimelineReport[]
  lanes: TimelineLane[]
}

export const CHANGE_NAME: Record<Change, string> = {
  new: 'New',
  progressed: 'Progressed',
  stable: 'Stable',
  improved: 'Improved',
  documented: 'Documented',
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** "Feb", "FEBRUARY", "Sept." → 2; 0 for anything that isn't a month name or its abbreviation. */
const monthNumber = (name: string): number => {
  const word = name.toLowerCase().replace(/\.$/, '')
  if (word.length < 3) return 0
  return MONTHS.findIndex((month) => month.startsWith(word)) + 1
}

const iso = (year: number, month: number, day: number): string | null => {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * "10 Feb 2022", "10-Feb-2022", "February 10, 2022" → "2022-02-10"; "Mar 2022" → "2022-03-01";
 * ISO dates pass through. Anything else, including impossible dates, is null.
 */
export function parseClinicalDate(text: string): string | null {
  const value = text.trim()
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match) return iso(Number(match[1]), Number(match[2]), Number(match[3]))
  let day: string | undefined
  let month: string
  let year: string
  if ((match = /^(?:(\d{1,2})[\s-]+)?([a-z]+\.?)[\s-]+(\d{4})$/i.exec(value))) [, day, month, year] = match
  else if ((match = /^([a-z]+\.?)\s+(\d{1,2}),?\s+(\d{4})$/i.exec(value))) [, month, day, year] = match
  else return null
  const number = monthNumber(month)
  return number ? iso(Number(year), number, day ? Number(day) : 1) : null
}

/**
 * Assigns each interval, in the given order, to the first row where it starts at least `gap`
 * after the row's last end. Returns the row index per interval.
 */
export function packRows(intervals: [start: number, end: number][], gap = 0): number[] {
  const rowEnds: number[] = []
  return intervals.map(([start, end]) => {
    let row = rowEnds.findIndex((last) => start >= last + gap)
    if (row === -1) row = rowEnds.length
    rowEnds[row] = end
    return row
  })
}

const DAY = 86_400_000
/** Room after the last item, so its mark and an ongoing therapy's end stay clear of the edge. */
const END_PAD_DAYS = 45

/** An ISO date as UTC milliseconds. */
export const toTime = (date: string): number => Date.parse(`${date}T00:00:00Z`)

/** The axis domain in UTC ms: from 1 January of the first item's year to a little after the last. */
export function axisDomain(start: string, end: string): [from: number, to: number] {
  const from = Date.UTC(Number(start.slice(0, 4)), 0, 1)
  return [from, Math.max(toTime(end) + END_PAD_DAYS * DAY, from + DAY)]
}

/** Calendar years covering the domain, clipped to it. */
export function yearBands(from: number, to: number): { year: number; from: number; to: number }[] {
  const bands = []
  for (let year = new Date(from).getUTCFullYear(); Date.UTC(year, 0, 1) < to; year += 1) {
    bands.push({ year, from: Math.max(from, Date.UTC(year, 0, 1)), to: Math.min(to, Date.UTC(year + 1, 0, 1)) })
  }
  return bands
}

const prop = (node: GraphNode, key: string): string | undefined => node.props.find(([k]) => k === key)?.[1]

const CHANGES: Record<string, Change> = {
  'first documented': 'new',
  new: 'new',
  progressed: 'progressed',
  stable: 'stable',
  improved: 'improved',
}

const changeOf = (node: GraphNode): Change => CHANGES[(prop(node, 'Change') ?? '').trim().toLowerCase()] ?? 'documented'

const byDate = <T extends { date: string }>(items: T[]): T[] => [...items].sort((a, b) => a.date.localeCompare(b.date))

export function deriveTimeline(graph: Graph): Timeline {
  const reports = byDate(
    graph.nodes.flatMap((node): TimelineReport[] => {
      if (node.type !== 'report') return []
      const dateText = prop(node, 'Report date') ?? ''
      const date = parseClinicalDate(dateText)
      return date ? [{ nodeId: node.id, label: node.label, date, dateText }] : []
    }),
  )
  const reportById = new Map(reports.map((r) => [r.nodeId, r]))

  /** The earliest dated report a node is documented in. */
  const firstReport = (id: string): TimelineReport | undefined =>
    byDate(reportsOf(graph, new Set([id])).flatMap((r) => reportById.get(r.id) ?? []))[0]

  /** The node's own date under `key`, else its first report's date. */
  const dated = (node: GraphNode, key: string): { date: string; dateText: string } | null => {
    const own = prop(node, key)
    const date = own ? parseClinicalDate(own) : null
    if (own && date) return { date, dateText: own }
    const report = firstReport(node.id)
    return report ? { date: report.date, dateText: report.dateText } : null
  }

  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const lanes: TimelineLane[] = []

  for (const finding of graph.nodes.filter((n) => n.type === 'finding')) {
    const states = findingStates(graph, finding.id).flatMap((id) => byId.get(id) ?? [])
    let marks: TimelineMark[]
    if (states.length > 0) {
      marks = states.flatMap((state): TimelineMark[] => {
        const when = dated(state, 'Date')
        if (!when) return []
        const change = changeOf(state)
        return [{ key: state.id, nodeId: state.id, type: state.type, ...when, label: CHANGE_NAME[change], detail: prop(state, 'Size'), change }]
      })
    } else {
      marks = reportsOf(graph, new Set([finding.id])).flatMap((r): TimelineMark[] => {
        const report = reportById.get(r.id)
        if (!report) return []
        const { date, dateText } = report
        return [{ key: `${finding.id}@${r.id}`, nodeId: finding.id, type: finding.type, date, dateText, label: CHANGE_NAME.documented, change: 'documented', reportId: r.id }]
      })
    }
    lanes.push({ id: finding.id, kind: 'finding', label: finding.label, marks: byDate(marks), spans: [], connected: states.length > 0 })
  }

  const pointLane = (kind: 'diagnoses' | 'procedures', type: NodeType, label: string) => {
    const marks = graph.nodes.flatMap((node): TimelineMark[] => {
      if (node.type !== type) return []
      const when = dated(node, 'Date')
      return when ? [{ key: node.id, nodeId: node.id, type, ...when, label: node.label }] : []
    })
    lanes.push({ id: kind, kind, label, marks: byDate(marks), spans: [], connected: false })
  }
  pointLane('diagnoses', 'diagnosis', 'Diagnoses')
  pointLane('procedures', 'procedure', 'Procedures')

  const medications = graph.nodes.filter((n) => n.type === 'medication')
  const starts = medications.map((node) => dated(node, 'Started'))
  // A stop: a `Stopped` date, or a `Status` saying it ended without one. Neither means ongoing.
  const stops = medications.map((node) => {
    const text = prop(node, 'Stopped')?.trim()
    if (text) return { text, date: parseClinicalDate(text) }
    const status = (prop(node, 'Status') ?? '').trim().toLowerCase()
    return /^(stopped|discontinued|completed|ended|finished)\b/.test(status) ? { text: 'end date unknown', date: null } : null
  })

  const dates = [
    ...reports.map((r) => r.date),
    ...lanes.flatMap((l) => l.marks.map((m) => m.date)),
    ...starts.flatMap((s) => (s ? [s.date] : [])),
    ...stops.flatMap((s) => (s?.date ? [s.date] : [])),
  ].sort()
  const start = dates[0] ?? null
  const end = dates.at(-1) ?? null

  const spans = medications.flatMap((node, i): TimelineSpan[] => {
    const from = starts[i]
    if (!from || !end) return []
    const stop = stops[i]
    const base = { key: node.id, nodeId: node.id, label: node.label, start: from.date, startText: from.dateText }
    // No stop date: still running. A stop date that can't be read: drawn as its start only.
    if (!stop) return [{ ...base, end, endText: '', ongoing: true }]
    const until = stop.date && stop.date >= from.date ? stop.date : from.date
    return [{ ...base, end: until, endText: stop.text, ongoing: false }]
  })
  lanes.push({ id: 'therapy', kind: 'therapy', label: 'Therapy', marks: [], spans: [...spans].sort((a, b) => a.start.localeCompare(b.start)), connected: false })

  return { start, end, reports, lanes: lanes.filter((l) => l.marks.length > 0 || l.spans.length > 0) }
}
