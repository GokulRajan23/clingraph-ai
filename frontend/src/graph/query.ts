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

export function nodeById(graph: Graph, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id)
}
