import { useEffect, useRef } from 'react'
import type { ReportSource } from '../demo/data'
import { documentedIn, findingStates, nodeById, sourcesOf } from '../graph/query'
import { TYPE_STYLE } from '../graph/style'
import type { Graph, GraphNode } from '../graph/types'
import { ShapeIcon } from './ShapeIcon'

interface Props {
  graph: Graph
  sources: Record<string, ReportSource>
  /** The node whose sources are shown; null keeps the pop-up closed. */
  nodeId: string | null
  onClose: () => void
  /** Opens another node (a finding listed under one of the reports). */
  onSelect: (id: string) => void
}

const prop = (node: GraphNode, key: string) => node.props.find(([k]) => k === key)?.[1]

/** Where a node comes from: each report it was read from, the sentence quoted, and what else that report says. */
export function SourceModal({ graph, sources, nodeId, onClose, onSelect }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const node = nodeId ? nodeById(graph, nodeId) : undefined

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (node && !element.open) element.showModal()
    if (!node && element.open) element.close()
  }, [node])

  const entries = node ? sourcesOf(graph, sources, node.id) : []
  // A finding's own states are part of it, not "also in this report".
  const self = new Set(node ? [node.id, ...findingStates(graph, node.id)] : [])
  const isReport = node?.type === 'report'

  return (
    <dialog
      ref={dialog}
      className="source-modal"
      aria-labelledby="source-title"
      onClose={onClose}
      // A click on the backdrop lands on the dialog itself, outside its card.
      onClick={(event) => event.target === dialog.current && onClose()}
    >
      {node && (
        <div className="source-card">
          <header>
            <p className="eyebrow">
              <ShapeIcon type={node.type} size={13} /> {TYPE_STYLE[node.type].name}
            </p>
            <h2 id="source-title">{node.label}</h2>
            <button type="button" className="close" aria-label="Close" onClick={onClose}>
              ✕
            </button>
          </header>

          {node.props.length > 0 && (
            <dl className="props">
              {node.props.map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}

          <section aria-label="Sources">
            <p className="eyebrow">{isReport ? 'From the report' : entries.length === 1 ? 'Source' : `Sources · ${entries.length}`}</p>
            {entries.length === 0 && <p className="muted">No report is linked to this item.</p>}
            {entries.map(({ report, quote }) => {
              const others = documentedIn(graph, report.id).filter((n) => !self.has(n.id))
              return (
                <article key={report.id} className="source">
                  {!isReport && (
                    <button type="button" className="source-title" onClick={() => onSelect(report.id)}>
                      <ShapeIcon type="report" size={13} />
                      {report.label.split(' · ')[0]}
                    </button>
                  )}
                  <p className="meta">{[prop(report, 'Kind'), prop(report, 'Department'), prop(report, 'Report date')].filter(Boolean).join(' · ')}</p>
                  {quote && <blockquote>{quote}</blockquote>}
                  {isReport ? (
                    <ul className="findings">
                      {others.map((n) => (
                        <li key={n.id}>
                          <button type="button" onClick={() => onSelect(n.id)}>
                            <ShapeIcon type={n.type} size={12} /> {n.label}
                          </button>
                          {sources[report.id]?.quotes[n.id] && <span>{sources[report.id].quotes[n.id]}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    others.length > 0 && (
                      <div className="also">
                        <span className="eyebrow">Also in this report</span>
                        {others.map((n) => (
                          <button key={n.id} type="button" className="chip" onClick={() => onSelect(n.id)}>
                            <ShapeIcon type={n.type} size={11} /> {n.label}
                          </button>
                        ))}
                      </div>
                    )
                  )}
                </article>
              )
            })}
          </section>
        </div>
      )}
    </dialog>
  )
}
