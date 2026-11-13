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
  // The finding itself, its first state, and every state chained after it.
  const subjects = new Set([id])
  const states = graph.edges.filter((e) => e.source === id && e.relation === OBSERVATION_RELATION).map((e) => e.target)
  const observations = new Set(graph.nodes.filter((n) => n.type === 'observation').map((n) => n.id))
  while (states.length > 0) {
    const state = states.pop()!
    if (subjects.has(state)) continue
    subjects.add(state)
    for (const e of graph.edges) if (e.source === state && observations.has(e.target)) states.push(e.target)
  }
  const targets = new Set(graph.edges.filter((e) => subjects.has(e.source) && e.relation === SOURCE_RELATION).map((e) => e.target))
  return graph.nodes.filter((n) => n.type === 'report' && targets.has(n.id))
}

export function nodeById(graph: Graph, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id)
}
