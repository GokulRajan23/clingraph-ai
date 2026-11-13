import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d'
import type { Focus } from '../App'
import { neighborhood, nodeById } from '../graph/query'
import { LEGEND_ORDER, TYPE_STYLE, tracePath } from '../graph/style'
import type { Graph, GraphEdge, GraphNode } from '../graph/types'
import { NodeCard } from './NodeCard'
import { ShapeIcon } from './ShapeIcon'

type Node = NodeObject<GraphNode>
type Link = LinkObject<GraphNode, GraphEdge>

const PAPER = '#fffefa'
const INK = '#29293c'
const MUTED = '#6f6c7d'
const LINE = '#cfcad8'
const DIM_ALPHA = 0.14
const LABEL_MAX = 30

const endId = (end: Link['source']): string => (typeof end === 'object' && end !== null ? String((end as Node).id) : String(end))
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const truncate = (text: string) => (text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}…` : text)

interface Props {
  graph: Graph | null
  /** Reports are being processed or the graph is being fetched. */
  busy: boolean
  focus: Focus
  onFocus: (focus: Focus) => void
}

export function GraphPanel({ graph, busy, focus, onFocus }: Props) {
  const frame = useRef<HTMLDivElement>(null)
  const engine = useRef<ForceGraphMethods<Node, Link>>(undefined)
  const fitted = useRef(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const hasGraph = graph !== null
  const ready = size.width > 0

  useEffect(() => {
    const element = frame.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasGraph])

  // The force engine mutates what it is given, so it gets its own copy per graph.
  const data = useMemo(() => {
    if (!graph) return { nodes: [], links: [] }
    return { nodes: graph.nodes.map((n) => ({ ...n })), links: graph.edges.map((e) => ({ ...e })) }
  }, [graph])

  // Fit the view once the layout settles for each new graph, then leave the zoom to the user.
  useEffect(() => {
    fitted.current = false
    const charge = engine.current?.d3Force('charge')
    const link = engine.current?.d3Force('link')
    charge?.strength?.(-360)
    link?.distance?.(62)
    engine.current?.d3ReheatSimulation()
  }, [data, ready])

  const highlight = useMemo<Set<string> | null>(() => {
    if (!graph || !focus) return null
    return focus.kind === 'node' ? neighborhood(graph, focus.id) : new Set(focus.ids)
  }, [graph, focus])

  const isLit = (id: string) => !highlight || highlight.has(id)
  const linkLit = (link: Link) => {
    if (!highlight || !focus) return true
    const [s, t] = [endId(link.source), endId(link.target)]
    return focus.kind === 'node' ? s === focus.id || t === focus.id : highlight.has(s) && highlight.has(t)
  }

  const selected = graph && focus?.kind === 'node' ? nodeById(graph, focus.id) : undefined

  if (!graph) {
    return (
      <section className="panel graph-panel" aria-labelledby="graph-title">
        <div className="panel-head">
          <h2 id="graph-title">Knowledge graph</h2>
        </div>
        <div className="graph-frame graph-empty">
          {busy ? (
            <div className="graph-status" role="status">
              <span className="spinner large" aria-hidden="true" />
              <p>Building the knowledge graph…</p>
            </div>
          ) : (
            <div className="graph-status">
              <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true" className="empty-mark">
                <path d="M14 38 28 16 42 34M14 38 42 34" />
                <circle cx="14" cy="38" r="6" />
                <circle cx="28" cy="16" r="6" />
                <circle cx="42" cy="34" r="6" />
              </svg>
              <p className="empty-title">No reports yet</p>
              <p className="muted">Upload the patient's PDF reports, or drop them anywhere on the page, to build the knowledge graph.</p>
            </div>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="panel graph-panel" aria-labelledby="graph-title">
      <div className="panel-head">
        <h2 id="graph-title">Knowledge graph</h2>
        <span className="muted">
          {graph.nodes.length} entities · {graph.edges.length} relations
        </span>
      </div>
      <ul className="legend" aria-label="Legend">
        {LEGEND_ORDER.map((type) => (
          <li key={type}>
            <ShapeIcon type={type} />
            {TYPE_STYLE[type].name}
          </li>
        ))}
      </ul>
      <div className="graph-frame" ref={frame}>
        {ready && (
          <ForceGraph2D<GraphNode, GraphEdge>
            ref={engine}
            graphData={data}
            width={size.width}
            height={size.height}
            backgroundColor={PAPER}
            // The tooltip renders strings as HTML, and report labels are user file names.
            nodeLabel={(n) => escapeHtml(`${TYPE_STYLE[n.type].name}: ${n.label}`)}
            nodeCanvasObject={(n, ctx, scale) => {
              const style = TYPE_STYLE[n.type]
              const lit = isLit(String(n.id))
              const x = n.x ?? 0
              const y = n.y ?? 0
              const r = style.radius
              ctx.globalAlpha = lit ? 1 : DIM_ALPHA
              ctx.beginPath()
              tracePath(ctx, style.shape, x, y, r)
              if (style.shape === 'dot') {
                // Finding states: hollow ring in the finding's hue, so they read apart from findings.
                ctx.fillStyle = PAPER
                ctx.fill()
                ctx.lineWidth = 2
                ctx.strokeStyle = style.color
                ctx.stroke()
              } else {
                ctx.fillStyle = style.color
                ctx.fill()
                ctx.lineWidth = 2 / scale
                ctx.strokeStyle = PAPER
                ctx.stroke()
              }
              if (selected?.id === n.id) {
                ctx.beginPath()
                ctx.arc(x, y, r + 4, 0, Math.PI * 2)
                ctx.lineWidth = 2 / scale
                ctx.strokeStyle = INK
                ctx.stroke()
              }
              const fontSize = (n.type === 'observation' ? 10 : 11.5) / scale
              ctx.font = `${n.type === 'patient' || n.type === 'report' ? 'bold ' : ''}${fontSize}px 'Trebuchet MS', sans-serif`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'top'
              const text = truncate(n.label)
              const ty = y + r + 3 / scale
              ctx.lineWidth = 3 / scale
              ctx.strokeStyle = PAPER
              ctx.strokeText(text, x, ty)
              ctx.fillStyle = n.type === 'observation' ? MUTED : INK
              ctx.fillText(text, x, ty)
              ctx.globalAlpha = 1
            }}
            nodePointerAreaPaint={(n, color, ctx) => {
              ctx.fillStyle = color
              ctx.beginPath()
              ctx.arc(n.x ?? 0, n.y ?? 0, TYPE_STYLE[n.type].radius + 4, 0, Math.PI * 2)
              ctx.fill()
            }}
            linkLabel={(l) => escapeHtml(l.relation.replace(/_/g, ' '))}
            linkColor={(l) => (highlight && linkLit(l) ? INK : LINE)}
            linkWidth={(l) => (highlight && linkLit(l) ? 1.6 : 1)}
            linkDirectionalArrowLength={3.5}
            linkDirectionalArrowRelPos={0.9}
            linkLineDash={(l) => (highlight && !linkLit(l) ? [2, 3] : null)}
            cooldownTicks={140}
            onEngineStop={() => {
              if (fitted.current) return
              fitted.current = true
              // Generous padding: the fit counts node centres, not their labels.
              engine.current?.zoomToFit(500, 70)
            }}
            onNodeClick={(n) => onFocus({ kind: 'node', id: String(n.id) })}
            onBackgroundClick={() => onFocus(null)}
          />
        )}
        {busy && (
          <div className="graph-overlay" role="status">
            <span className="spinner large" aria-hidden="true" />
            <p>Updating the knowledge graph…</p>
          </div>
        )}
        {selected && <NodeCard graph={graph} node={selected} onFocus={onFocus} />}
      </div>
    </section>
  )
}
