import { describe, expect, it } from 'vitest'
import { FIXTURE } from './fixture'
import { nameReports } from './naming'
import { axisDomain, deriveTimeline, packRows, parseClinicalDate, toTime, yearBands } from './timeline'
import type { Graph } from './types'

describe('parseClinicalDate', () => {
  it('reads day-month-year dates', () => {
    expect(parseClinicalDate('10 Feb 2022')).toBe('2022-02-10')
    expect(parseClinicalDate('2 Mar 2022')).toBe('2022-03-02')
  })

  it('reads month-year dates as the first of the month', () => {
    expect(parseClinicalDate('Mar 2022')).toBe('2022-03-01')
  })

  it('accepts ISO dates', () => {
    expect(parseClinicalDate('2023-06-21')).toBe('2023-06-21')
  })

  it('reads full, upper-case, US-style and dashed month names', () => {
    expect(parseClinicalDate('10 FEBRUARY 2022')).toBe('2022-02-10')
    expect(parseClinicalDate('February 10, 2022')).toBe('2022-02-10')
    expect(parseClinicalDate('10-Feb-2022')).toBe('2022-02-10')
    expect(parseClinicalDate('Sept 2023')).toBe('2023-09-01')
  })

  it('rejects anything else', () => {
    expect(parseClinicalDate('Marchember 2022')).toBeNull()
    expect(parseClinicalDate('Ongoing')).toBeNull()
    expect(parseClinicalDate('31 Foo 2022')).toBeNull()
    expect(parseClinicalDate('31 Feb 2022')).toBeNull()
    expect(parseClinicalDate('')).toBeNull()
  })
})

describe('packRows', () => {
  it('keeps items that do not overlap on the first row', () => {
    expect(packRows([[0, 10], [12, 20], [30, 40]])).toEqual([0, 0, 0])
  })

  it('moves an overlapping item to the first row with room', () => {
    expect(packRows([[0, 100], [5, 50], [60, 120], [110, 130]])).toEqual([0, 1, 1, 0])
  })

  it('treats touching items as overlapping when a gap is required', () => {
    expect(packRows([[0, 10], [10, 20]], 0)).toEqual([0, 0])
    expect(packRows([[0, 10], [10, 20]], 4)).toEqual([0, 1])
  })
})

describe('axis', () => {
  const day = 86_400_000

  it('starts on 1 January of the first year and ends a little after the last item', () => {
    const [from, to] = axisDomain('2022-02-10', '2024-05-14')
    expect(new Date(from).toISOString().slice(0, 10)).toBe('2022-01-01')
    expect((to - toTime('2024-05-14')) / day).toBe(45)
  })

  it('cuts the domain into year bands', () => {
    const [from, to] = axisDomain('2022-02-10', '2024-05-14')
    expect(yearBands(from, to).map((b) => [b.year, new Date(b.from).toISOString().slice(0, 10)])).toEqual([
      [2022, '2022-01-01'],
      [2023, '2023-01-01'],
      [2024, '2024-01-01'],
    ])
    expect(yearBands(from, to).at(-1)!.to).toBe(to)
  })
})

describe('deriveTimeline', () => {
  const timeline = deriveTimeline(FIXTURE)
  const lane = (id: string) => timeline.lanes.find((l) => l.id === id)!

  it('spans the earliest to the latest dated item', () => {
    expect(timeline.start).toBe('2022-02-10')
    expect(timeline.end).toBe('2024-05-14')
  })

  it('lists the dated reports in date order', () => {
    expect(timeline.reports.map((r) => [r.nodeId, r.date])).toEqual([
      ['r1', '2022-02-10'],
      ['r2', '2022-03-28'],
      ['r3', '2023-01-17'],
      ['r4', '2023-06-21'],
      ['r5', '2024-05-14'],
    ])
  })

  it('has a lane per finding, then diagnoses, procedures and therapy', () => {
    expect(timeline.lanes.map((l) => l.id)).toEqual(['nodule', 'liver', 'lymph', 'effusion', 'diagnoses', 'procedures', 'therapy'])
    expect(lane('nodule').label).toBe('Pulmonary nodule, right upper lobe')
  })

  it('follows a finding through its observed states with their change', () => {
    expect(lane('nodule').marks.map((m) => [m.nodeId, m.date, m.change, m.label, m.detail])).toEqual([
      ['nodule-1', '2022-02-10', 'new', 'New', '14 mm'],
      ['nodule-2', '2023-01-17', 'progressed', 'Progressed', '19 mm'],
      ['nodule-3', '2024-05-14', 'stable', 'Stable', '19 mm'],
    ])
    expect(lane('liver').marks.map((m) => m.change)).toEqual(['new', 'improved', 'improved'])
    expect(lane('nodule').connected).toBe(true)
  })

  it('marks a finding without states at each report that documents it', () => {
    expect(lane('effusion').marks.map((m) => [m.nodeId, m.date, m.change, m.reportId])).toEqual([
      ['effusion', '2023-01-17', 'documented', 'r3'],
      ['effusion', '2023-06-21', 'documented', 'r4'],
      ['effusion', '2024-05-14', 'documented', 'r5'],
    ])
    expect(lane('effusion').connected).toBe(false)
    expect(new Set(lane('effusion').marks.map((m) => m.key)).size).toBe(3)
  })

  it('places procedures on their own date and diagnoses on their first report', () => {
    expect(lane('procedures').marks.map((m) => [m.nodeId, m.date])).toEqual([
      ['biopsy', '2022-03-02'],
      ['port', '2022-03-09'],
      ['thoracentesis', '2023-06-21'],
    ])
    expect(lane('diagnoses').marks.map((m) => [m.nodeId, m.date, m.label])).toEqual([
      ['nsclc', '2022-03-28', 'Lung adenocarcinoma (NSCLC)'],
      ['mets', '2022-03-28', 'Liver metastasis'],
    ])
  })

  it('draws each medication as a span, ongoing ones up to the end', () => {
    expect(lane('therapy').spans.map((s) => [s.nodeId, s.start, s.end, s.ongoing])).toEqual([
      ['carboplatin', '2022-03-01', '2023-01-01', false],
      ['pemetrexed', '2022-03-01', '2023-01-01', false],
      ['pembrolizumab', '2023-01-01', '2024-05-14', true],
    ])
    expect(lane('therapy').marks).toEqual([])
  })

  it('does not call a stopped medication ongoing, even without a stop date', () => {
    const graph: Graph = {
      nodes: [
        { id: 'r', type: 'report', label: 'R', props: [['Report date', '05 Apr 2021']] },
        { id: 'a', type: 'medication', label: 'A', props: [['Started', 'Jan 2021'], ['Status', 'Stopped']] },
        { id: 'b', type: 'medication', label: 'B', props: [['Started', 'Jan 2021'], ['Stopped', '  ']] },
        { id: 'c', type: 'medication', label: 'C', props: [['Started', 'Jan 2021'], ['Status', 'Ongoing']] },
      ],
      edges: [],
    }
    const spans = deriveTimeline(graph).lanes.find((l) => l.id === 'therapy')!.spans
    expect(spans.map((s) => [s.nodeId, s.end, s.endText, s.ongoing])).toEqual([
      ['a', '2021-01-01', 'end date unknown', false],
      ['b', '2021-04-05', '', true],
      ['c', '2021-04-05', '', true],
    ])
  })

  it('carries the uploaded file names onto the report ticks', () => {
    const named = deriveTimeline(nameReports(FIXTURE, ['CT_2022.pdf', 'Discharge.pdf']))
    expect(named.reports.map((r) => r.label).slice(0, 3)).toEqual(['CT_2022', 'Discharge', 'Follow-up CT · 17 Jan 2023'])
  })

  it('falls back to the source report date and skips what cannot be dated', () => {
    const graph: Graph = {
      nodes: [
        { id: 'r', type: 'report', label: 'R', props: [['Report date', '05 Apr 2021']] },
        { id: 'x', type: 'report', label: 'Undated', props: [] },
        { id: 'f', type: 'finding', label: 'F', props: [] },
        { id: 'o', type: 'observation', label: 'O', props: [['Change', 'Something new']] },
        { id: 'p', type: 'procedure', label: 'P', props: [] },
        { id: 'q', type: 'procedure', label: 'Q', props: [] },
      ],
      edges: [
        { source: 'f', target: 'o', relation: 'has_observation' },
        { source: 'o', target: 'r', relation: 'documented_in' },
        { source: 'p', target: 'r', relation: 'documented_in' },
      ],
    }
    const t = deriveTimeline(graph)
    expect(t.reports.map((r) => r.nodeId)).toEqual(['r'])
    expect(t.lanes.find((l) => l.id === 'f')!.marks.map((m) => [m.date, m.change])).toEqual([['2021-04-05', 'documented']])
    expect(t.lanes.find((l) => l.id === 'procedures')!.marks.map((m) => m.nodeId)).toEqual(['p'])
    expect(t.lanes.map((l) => l.id)).toEqual(['f', 'procedures'])
  })

  it('is empty for a graph without dates', () => {
    const t = deriveTimeline({ nodes: [{ id: 'patient', type: 'patient', label: 'P', props: [] }], edges: [] })
    expect(t).toEqual({ start: null, end: null, reports: [], lanes: [] })
  })
})
