import { describe, expect, it } from 'vitest'
import { answerFor, FALLBACK, SUGGESTIONS } from '../chat/script'
import { DEMO_GRAPH as FIXTURE, PATIENTS, REPORT_IDS, SOURCES } from '../demo/data'
import { searchPatients } from '../patients'
import { documentedIn, neighborhood, sourceReports, sourcesOf } from './query'
import { TYPE_STYLE } from './style'

const ids = new Set(FIXTURE.nodes.map((n) => n.id))

describe('fixture graph', () => {
  it('has unique node ids', () => {
    expect(ids.size).toBe(FIXTURE.nodes.length)
  })

  it('only has edges between existing nodes', () => {
    for (const edge of FIXTURE.edges) {
      expect(ids, `${edge.source} -${edge.relation}->`).toContain(edge.source)
      expect(ids, `-${edge.relation}-> ${edge.target}`).toContain(edge.target)
    }
  })

  it('has the five report nodes', () => {
    expect(FIXTURE.nodes.filter((n) => n.type === 'report').map((n) => n.id)).toEqual([...REPORT_IDS])
  })

  it('connects every node', () => {
    for (const node of FIXTURE.nodes) expect(neighborhood(FIXTURE, node.id).size, node.id).toBeGreaterThan(1)
  })

  it('gives every node type a style', () => {
    for (const node of FIXTURE.nodes) expect(TYPE_STYLE[node.type], node.type).toBeDefined()
  })

  it('gives every clinical node at least one source report', () => {
    for (const node of FIXTURE.nodes.filter((n) => n.type !== 'patient' && n.type !== 'report')) {
      expect(sourceReports(FIXTURE, node.id).length, node.id).toBeGreaterThan(0)
    }
  })

  it('traces clinical nodes back to source reports', () => {
    expect(sourceReports(FIXTURE, 'hydro-2').map((r) => r.id)).toEqual(['r2'])
    expect(sourceReports(FIXTURE, 'culture').map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4'])
    expect(sourceReports(FIXTURE, 'patient')).toEqual([])
    // Findings inherit the reports of every state in their chain.
    expect(sourceReports(FIXTURE, 'hydro').map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r5'])
    expect(sourceReports(FIXTURE, 'left-stone').map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5'])
    expect(sourceReports(FIXTURE, 'creatinine').map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5'])
  })
})

describe('chat script', () => {
  it('answers each suggestion with sources and highlighted nodes that exist', () => {
    for (const s of SUGGESTIONS) {
      const answer = answerFor(s.question)
      expect(answer, s.question).toBe(s.answer)
      expect(answer.highlight.length, s.question).toBeGreaterThan(0)
      for (const id of answer.highlight) expect(ids, `${s.question}: ${id}`).toContain(id)
      expect(answer.sources.length, s.question).toBeGreaterThan(0)
      for (const id of answer.sources) expect(REPORT_IDS as readonly string[], `${s.question}: ${id}`).toContain(id)
      for (const id of answer.sources) expect(answer.highlight, `${s.question}: ${id}`).toContain(id)
    }
  })

  it('matches typed questions regardless of case, spacing and trailing punctuation', () => {
    expect(answerFor('  which PROCEDURES   are documented ')).toBe(SUGGESTIONS[1].answer)
  })

  it('falls back for anything else', () => {
    expect(answerFor('What is the weather?')).toBe(FALLBACK)
    expect(answerFor('')).toBe(FALLBACK)
    expect(FALLBACK.sources).toEqual([])
  })
})

describe('sources', () => {
  it('quotes the sentence behind every documented node', () => {
    for (const edge of FIXTURE.edges.filter((e) => e.relation === 'documented_in')) {
      expect(SOURCES[edge.target]?.quotes[edge.source], `${edge.source} in ${edge.target}`).toBeTruthy()
    }
  })

  it('quotes a finding from the states each report describes', () => {
    const entries = sourcesOf(FIXTURE, SOURCES, 'hydro')
    expect(entries.map((s) => s.report.id)).toEqual(['r1', 'r2', 'r3', 'r5'])
    expect(entries[1].quote).toBe(SOURCES.r2.quotes['hydro-2'])
  })

  it('a report is its own source and the patient has all of them', () => {
    expect(sourcesOf(FIXTURE, SOURCES, 'r4')).toEqual([{ report: FIXTURE.nodes.find((n) => n.id === 'r4'), quote: SOURCES.r4.summary }])
    expect(sourcesOf(FIXTURE, SOURCES, 'patient').map((s) => s.report.id)).toEqual([...REPORT_IDS])
  })

  it('lists what else a report documents', () => {
    expect(documentedIn(FIXTURE, 'r4', 'ureteroscopy').map((n) => n.id)).toEqual(['left-stone-3', 'right-stone', 'creatinine', 'stent-symptoms', 'culture', 'analysis', 'amlodipine', 'tamsulosin', 'paracetamol', 'cefazolin'])
  })
})

describe('patient search', () => {
  const names = (query: string) => searchPatients(PATIENTS, query).map((p) => p.name)

  it('finds by any part of the name, ignoring case and accents', () => {
    expect(names('martin')).toEqual(['Martin Keller'])
    expect(names('schroder')).toEqual(['Anna Schröder'])
    expect(names('yilmaz')).toEqual(['Fatma Yılmaz'])
    expect(names('martin kel')).toEqual(['Martin Keller'])
  })

  it('finds by the start of the insurance number, spaces ignored', () => {
    expect(names('k417')).toEqual(['Martin Keller'])
    expect(names('B 4829')).toEqual(['Jonas Hartmann'])
    expect(names('123456789')).toEqual([])
  })

  it('finds no one for an empty query', () => {
    expect(names('  ')).toEqual([])
  })

  it('only the demo patient has a record', () => {
    expect(PATIENTS.filter((p) => p.record).map((p) => p.name)).toEqual(['Martin Keller'])
  })
})
