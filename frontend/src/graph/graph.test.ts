import { describe, expect, it } from 'vitest'
import { answerFor, citationsOf, FALLBACK, SUGGESTIONS } from '../chat/script'
import { FIXTURE, REPORT_IDS } from './fixture'
import { displayName, nameReports } from './naming'
import { neighborhood, sourceReports } from './query'
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

  it('has the five report nodes the uploads are mapped onto', () => {
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
    expect(sourceReports(FIXTURE, 'nodule-2').map((r) => r.id)).toEqual(['r3'])
    expect(sourceReports(FIXTURE, 'effusion').map((r) => r.id)).toEqual(['r3', 'r4', 'r5'])
    expect(sourceReports(FIXTURE, 'patient')).toEqual([])
    // Findings inherit the reports of every state in their chain.
    expect(sourceReports(FIXTURE, 'nodule').map((r) => r.id)).toEqual(['r1', 'r3', 'r5'])
    expect(sourceReports(FIXTURE, 'liver').map((r) => r.id)).toEqual(['r1', 'r3', 'r5'])
    expect(sourceReports(FIXTURE, 'nodule-2').map((r) => r.id)).toEqual(['r3'])
  })
})

describe('report naming', () => {
  it('names reports after uploaded files in upload order', () => {
    const named = nameReports(FIXTURE, ['ct_2022.pdf', 'Entlassbrief.PDF'])
    const label = (id: string) => named.nodes.find((n) => n.id === id)?.label
    expect(label('r1')).toBe('ct_2022')
    expect(label('r2')).toBe('Entlassbrief')
    expect(named.nodes.find((n) => n.id === 'r1')?.props[0]).toEqual(['File', 'ct_2022.pdf'])
  })

  it('keeps synthetic names for reports without an upload and ignores extra uploads', () => {
    const named = nameReports(FIXTURE, ['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'e.pdf', 'f.pdf'])
    expect(named.nodes.filter((n) => n.type === 'report').map((n) => n.label)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(nameReports(FIXTURE, ['a.pdf']).nodes.find((n) => n.id === 'r2')?.label).toBe('Discharge summary · 28 Mar 2022')
  })

  it('does not change the fixture', () => {
    const before = JSON.stringify(FIXTURE)
    const named = nameReports(FIXTURE, ['a.pdf'])
    named.nodes[0].props.push(['x', 'y'])
    expect(JSON.stringify(FIXTURE)).toBe(before)
  })

  it('strips only a trailing .pdf extension', () => {
    expect(displayName('report.pdf.pdf')).toBe('report.pdf')
    expect(displayName('notes')).toBe('notes')
  })
})

describe('chat script', () => {
  it('answers each suggestion with cited, highlighted nodes that exist', () => {
    for (const s of SUGGESTIONS) {
      const answer = answerFor(s.question)
      expect(answer, s.question).toBe(s.answer)
      expect(answer.highlight.length, s.question).toBeGreaterThan(0)
      for (const id of answer.highlight) expect(ids, `${s.question}: ${id}`).toContain(id)
      for (const id of citationsOf(answer)) expect(REPORT_IDS as readonly string[], `${s.question}: ${id}`).toContain(id)
    }
  })

  it('matches typed questions regardless of case, spacing and trailing punctuation', () => {
    expect(answerFor('  which PROCEDURES   are documented ')).toBe(SUGGESTIONS[1].answer)
  })

  it('falls back for anything else', () => {
    expect(answerFor('What is the weather?')).toBe(FALLBACK)
    expect(answerFor('')).toBe(FALLBACK)
    expect(citationsOf(FALLBACK)).toEqual([])
  })

  it('numbers citations in first-cited order without duplicates', () => {
    expect(citationsOf(SUGGESTIONS[2].answer)).toEqual(['r5', 'r3', 'r4'])
  })
})
