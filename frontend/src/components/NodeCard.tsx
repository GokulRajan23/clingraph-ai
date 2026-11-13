import type { Focus } from '../App'
import { neighborhood, sourceReports } from '../graph/query'
import { TYPE_STYLE } from '../graph/style'
import type { Graph, GraphNode } from '../graph/types'
import { ShapeIcon } from './ShapeIcon'

interface Props {
  graph: Graph
  node: GraphNode
  onFocus: (focus: Focus) => void
}

/** Details for the clicked node: type, properties, source reports and connection count. */
export function NodeCard({ graph, node, onFocus }: Props) {
  const sources = sourceReports(graph, node.id)
  const connections = neighborhood(graph, node.id).size - 1
  return (
    <aside className="node-card" aria-label={`Details: ${node.label}`}>
      <div className="node-card-head">
        <span className="node-type">
          <ShapeIcon type={node.type} />
          {TYPE_STYLE[node.type].name}
        </span>
        <button className="icon-button" onClick={() => onFocus(null)} aria-label="Close details">
          ×
        </button>
      </div>
      <h3>{node.label}</h3>
      <dl>
        {node.props.map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {sources.length > 0 && (
        <div className="node-sources">
          <p className="eyebrow">Source</p>
          {sources.map((report) => (
            <button key={report.id} className="cite" onClick={() => onFocus({ kind: 'node', id: report.id })}>
              <ShapeIcon type="report" size={12} />
              {report.label}
            </button>
          ))}
        </div>
      )}
      <p className="muted">Connected to {connections} {connections === 1 ? 'entity' : 'entities'}</p>
    </aside>
  )
}
