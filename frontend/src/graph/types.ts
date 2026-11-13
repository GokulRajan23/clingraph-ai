/** The knowledge graph exchanged with the UI. A real backend must return this same shape. */

export type NodeType = 'patient' | 'report' | 'finding' | 'observation' | 'diagnosis' | 'procedure' | 'medication'

export interface GraphNode {
  id: string
  type: NodeType
  label: string
  /** Display properties shown in the details card, in order. */
  props: [key: string, value: string][]
}

export interface GraphEdge {
  source: string
  target: string
  relation: string
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/** The relation that ties a node to the report it was extracted from. */
export const SOURCE_RELATION = 'documented_in'

/** The relation from a finding to its first observed state. Later states chain from there. */
export const OBSERVATION_RELATION = 'has_observation'
