import { REPORT_IDS } from './fixture'
import type { Graph } from './types'

/** "CT_Thorax_2022.pdf" → "CT_Thorax_2022". */
export function displayName(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '')
}

/**
 * Names the graph's report nodes after the uploaded files, in upload order.
 * Reports beyond the number of uploads keep their synthetic names; uploads beyond the
 * number of reports are not represented. Returns a copy; the input graph is not changed.
 */
export function nameReports(graph: Graph, fileNames: string[]): Graph {
  const files = new Map<string, string>(REPORT_IDS.slice(0, fileNames.length).map((id, i) => [id, fileNames[i]]))
  return {
    nodes: graph.nodes.map((node) => {
      const file = files.get(node.id)
      if (!file) return { ...node, props: [...node.props] }
      return { ...node, label: displayName(file), props: [['File', file], ...node.props] }
    }),
    edges: graph.edges.map((edge) => ({ ...edge })),
  }
}
