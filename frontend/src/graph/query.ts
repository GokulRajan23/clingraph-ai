import { OBSERVATION_RELATION, SOURCE_RELATION, type Graph, type GraphNode } from './types'

/** The node and every node one edge away from it, in either direction. */
export function neighborhood(graph: Graph, id: string): Set<string> {
  const ids = new Set([id])
  for (const edge of graph.edges) {
    if (edge.source === id) ids.add(edge.target)
    if (edge.target === id) ids.add(edge.source)
  }
  return ids
}

/**
 * Report nodes a node was extracted from: its own `documented_in` targets plus those of its
 * observed states, so a finding lists every report that describes one of them.
 */
export function sourceReports(graph: Graph, id: string): GraphNode[] {
  const subjects = new Set([id, ...findingStates(graph, id)])
  return reportsOf(graph, subjects)
}

/** Report nodes that any of the given nodes is `documented_in`, in graph order. */
export function reportsOf(graph: Graph, ids: Set<string>): GraphNode[] {
  const targets = new Set(graph.edges.filter((e) => ids.has(e.source) && e.relation === SOURCE_RELATION).map((e) => e.target))
  return graph.nodes.filter((n) => n.type === 'report' && targets.has(n.id))
}

/** IDs of a finding's observed states: its first state and every state chained after it. */
export function findingStates(graph: Graph, id: string): string[] {
  const found: string[] = []
  const states = graph.edges.filter((e) => e.source === id && e.relation === OBSERVATION_RELATION).map((e) => e.target)
  const observations = new Set(graph.nodes.filter((n) => n.type === 'observation').map((n) => n.id))
  while (states.length > 0) {
    const state = states.pop()!
    if (state === id || found.includes(state) || !observations.has(state)) continue
    found.push(state)
    for (const e of graph.edges) if (e.source === state && observations.has(e.target)) states.push(e.target)
  }
  return found
}

/** A report a node comes from, with the sentence in it that the node was extracted from. */
export interface SourceEntry {
  report: GraphNode
  /** The quoted sentence, if the report text has one for this node (or one of its states). */
  quote: string | undefined
}

/**
 * Where a node comes from, for the source pop-up. A report is its own source (quoted by its
 * summary); the patient's sources are all their reports; anything else lists the reports it is
 * documented in, quoting the sentence about it or about one of its observed states.
 */
export function sourcesOf(graph: Graph, texts: Record<string, { summary: string; quotes: Record<string, string> }>, id: string): SourceEntry[] {
  const node = nodeById(graph, id)
  if (!node) return []
  if (node.type === 'report') return [{ report: node, quote: texts[id]?.summary }]
  if (node.type === 'patient') return graph.nodes.filter((n) => n.type === 'report').map((report) => ({ report, quote: texts[report.id]?.summary }))
  const subjects = [id, ...findingStates(graph, id)]
  return sourceReports(graph, id).map((report) => {
    const quotes = texts[report.id]?.quotes ?? {}
    return { report, quote: subjects.map((s) => quotes[s]).find(Boolean) }
  })
}

/** The other clinical nodes documented in a report, in graph order. */
export function documentedIn(graph: Graph, reportId: string, except?: string): GraphNode[] {
  const ids = new Set(graph.edges.filter((e) => e.target === reportId && e.relation === SOURCE_RELATION).map((e) => e.source))
  return graph.nodes.filter((n) => ids.has(n.id) && n.id !== except)
}

export function nodeById(graph: Graph, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id)
}
