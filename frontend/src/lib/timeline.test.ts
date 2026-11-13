import { describe, expect, it } from 'vitest'
import { doc, finding, link, obs, payload } from './fixtures'
import { buildColumns, buildTimeline, cardState, conceptSuggestions, DEFAULT_FILTERS, firstDocumentedId, UNDATED } from './timeline'

describe('columns', () => {
  it('orders dated reports by date and puts all undated reports in one final lane, in API order', () => {
    const docs = [
      doc('late', '2024-06-03', { filename: 'a.txt' }),
      doc('undatedZ', null, { filename: 'z.txt' }),
      doc('early', '2024-02-05', { filename: 'z.txt' }),
      doc('undatedA', null, { filename: 'a.txt' }),
      doc('pending', '2024-01-01', { extraction: undefined }),
      doc('failed', '2024-01-02', { status: 'failed' }),
    ]
    const columns = buildColumns(docs, DEFAULT_FILTERS)
    expect(columns.map((c) => c.key)).toEqual(['early', 'late', UNDATED])
    // Never ordered by filename: z.txt stays before a.txt because the API listed it first.
    expect(columns[2].reports.map((r) => r.filename)).toEqual(['z.txt', 'a.txt'])
    expect(columns[2].date).toBeNull()
  })

  it('keeps one column per report on the same date, in API order', () => {
    const columns = buildColumns([doc('second', '2024-03-01'), doc('first', '2024-03-01'), doc('earlier', '2024-01-01')], DEFAULT_FILTERS)
    expect(columns.map((c) => c.key)).toEqual(['earlier', 'second', 'first'])
  })

  it('applies the report-date range to dated columns only', () => {
    const docs = [doc('a', '2024-01-10'), doc('b', '2024-03-12'), doc('c', '2024-06-03'), doc('u', null)]
    expect(buildColumns(docs, { from: '2024-02-01', to: '2024-04-01' }).map((c) => c.key)).toEqual(['b', UNDATED])
    expect(buildColumns(docs, { from: '2024-03-12', to: '' }).map((c) => c.key)).toEqual(['b', 'c', UNDATED])
  })
})

describe('rows and cards', () => {
  const r1 = doc('R1', '2024-01-10')
  const r2 = doc('R2', '2024-03-12')
  const u = doc('U', null)
  const docs = [r1, r2, u]
  const ascitesAbsent = obs('a1', r1, {}, { assertion: 'absent' })
  const ascites = obs('a2', r2, {}, { change: 'first_documented' })
  const stent = obs('s1', u, {}, { concept: 'Biliary stent', category: 'device' })
  const rejected = obs('x1', r2, { review_status: 'rejected', finding_id: null }, { concept: 'Left liver lesion', category: 'finding' })
  const data = payload({
    findings: [finding('fa', [ascitesAbsent, ascites]), finding('fs', [stent])],
    links: [link('a1', 'a2')],
    rejected: [rejected],
  })

  it('places observations by report column, the undated lane, and attaches incoming links', () => {
    const model = buildTimeline(docs, data, DEFAULT_FILTERS)
    expect(model.columns.map((c) => c.key)).toEqual(['R1', 'R2', UNDATED])
    expect(model.rows.map((r) => r.key)).toEqual(['fa', 'fs'])
    const [ascitesRow, stentRow] = model.rows
    expect(ascitesRow.cells.R1.map((c) => c.state)).toEqual(['absent'])
    expect(ascitesRow.cells.R2[0].state).toBe('first_documented')
    expect(ascitesRow.cells.R2[0].incoming.map((l) => l.from_observation)).toEqual(['a1'])
    expect(stentRow.cells[UNDATED].map((c) => c.state)).toEqual(['device'])
    expect(model.rejectedRow).toBeNull()
    expect(model.hiddenFindings).toBe(0)
  })

  it('hides rows without visible cards and counts them', () => {
    const model = buildTimeline(docs, data, { ...DEFAULT_FILTERS, categories: ['device'] })
    expect(model.rows.map((r) => r.key)).toEqual(['fs'])
    expect(model.hiddenFindings).toBe(1)
    const dated = buildTimeline(docs, data, { ...DEFAULT_FILTERS, from: '2024-02-01' })
    expect(dated.rows.map((r) => Object.keys(r.cells))).toEqual([['R2'], [UNDATED]])
  })

  it('shows rejected events in their report columns only when toggled', () => {
    const model = buildTimeline(docs, data, { ...DEFAULT_FILTERS, showRejected: true })
    expect(model.rejectedRow?.cells.R2.map((c) => [c.observation.id, c.state])).toEqual([['x1', 'rejected']])
    expect(buildTimeline(docs, data, { ...DEFAULT_FILTERS, showRejected: true, categories: ['device'] }).rejectedRow).toBeNull()
  })

  it('offers the effective concepts of linked findings as rename suggestions', () => {
    expect(conceptSuggestions(data)).toEqual(['Ascites', 'Biliary stent'])
  })
})

describe('card state precedence', () => {
  const r1 = doc('R1', '2024-01-10')
  const r2 = doc('R2', '2024-03-12')
  const state = (o: ReturnType<typeof obs>, first: string | null = null) => cardState(o, first)

  it('uses the first dated present or suspected observation as first documented', () => {
    const undated = doc('U', null)
    const f = finding('f', [obs('a', r1, {}, { assertion: 'absent' }), obs('b', r2, {}, { assertion: 'suspected' }), obs('c', undated)])
    expect(firstDocumentedId(f)).toBe('b')
    expect(firstDocumentedId(finding('g', [obs('d', undated)]))).toBeNull()
  })

  it('orders rejected, historical, absent, procedure before change states', () => {
    expect(state(obs('a', r1, { review_status: 'rejected' }, { change: 'progressed' }), 'a').state).toBe('rejected')
    expect(state(obs('a', r1, {}, { assertion: 'historical', category: 'procedure' })).state).toBe('historical')
    expect(state(obs('a', r1, {}, { assertion: 'absent', change: 'improved' })).state).toBe('absent')
    expect(state(obs('a', r1, {}, { category: 'procedure', change: 'unknown' }), 'a').state).toBe('procedure')
    expect(state(obs('a', r1, {}, { category: 'finding', change: 'performed' })).state).toBe('procedure')
  })

  it('marks a stated change that is also the first documentation', () => {
    expect(state(obs('a', r1, {}, { change: 'progressed' }), 'a')).toEqual({ state: 'progressed', markers: ['First in this collection'] })
    expect(state(obs('a', r1, {}, { change: 'stable' }), 'other')).toEqual({ state: 'stable', markers: [] })
    expect(state(obs('a', r1, {}, { change: 'improved' })).state).toBe('improved')
  })

  it('distinguishes first in the collection from "new" in a later report', () => {
    expect(state(obs('a', r1, {}, { change: 'first_documented' }), 'a')).toEqual({ state: 'first_documented', markers: [] })
    expect(state(obs('b', r2, {}, { change: 'first_documented' }), 'a')).toEqual({ state: 'documented', markers: ['Described as new in this report'] })
    expect(state(obs('a', r1, {}, { assertion: 'suspected' }), 'a')).toEqual({ state: 'first_documented', markers: ['Suspected'] })
  })

  it('falls back to unclear, suspected, unknown, device and documented', () => {
    expect(state(obs('a', r1, {}, { change: 'unclear' })).state).toBe('unclear')
    expect(state(obs('a', r1, {}, { assertion: 'suspected' })).state).toBe('suspected')
    expect(state(obs('a', r1, {}, { assertion: 'unknown' })).state).toBe('unknown')
    expect(state(obs('a', r1, {}, { category: 'device' })).state).toBe('device')
    expect(state(obs('a', r1)).state).toBe('documented')
  })

  it('uses the effective (corrected) values', () => {
    const corrected = obs('a', r1, { assertion: 'absent', review_status: 'corrected', corrected_fields: ['assertion'] })
    expect(state(corrected, 'a').state).toBe('absent')
  })
})
