import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d'
import { INK, TYPE_STYLE, tracePath } from '../graph/style'
import type { Graph, GraphEdge, GraphNode } from '../graph/types'

type Node = NodeObject<GraphNode>
type Link = LinkObject<GraphNode, GraphEdge>

const FADED = 0.2
const LABEL_MAX = 48
/** Same family as the page (styles.css `--font`); canvas text does not inherit CSS. */
const FONT = "'Inter Variable', system-ui, sans-serif"
// Relations every report link has; labelling them only adds noise.
const UNLABELLED = new Set(['documented_in', 'has_report'])

const endId = (end: Link['source']): string => (typeof end === 'object' && end !== null ? String((end as Node).id) : String(end))
const truncate = (text: string) => (text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}…` : text)

interface Props {
  graph: Graph
  /** Nodes the current answer is about; empty or null shows the whole graph at normal strength. */
  highlight: string[] | null
  onSelect: (id: string) => void
}

/**
 * The patient's knowledge graph, borderless on the page. What the answer is about is drawn in the
 * accent with labels and framed in view; everything else fades to its shape (label on hover).
 */
export function GraphView({ graph, highlight, onSelect }: Props) {
  const frame = useRef<HTMLDivElement>(null)
  const engine = useRef<ForceGraphMethods<Node, Link>>(undefined)
  const settled = useRef(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    const element = frame.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setSize({ width: Math.floor(width), height: Math.floor(height) })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // The force engine mutates what it is given, so it gets its own copy per graph.
  const data = useMemo(() => ({ nodes: graph.nodes.map((n) => ({ ...n })), links: graph.edges.map((e) => ({ ...e })) }), [graph])
  const lit = useMemo(() => (highlight && highlight.length > 0 ? new Set(highlight) : null), [highlight])

  useEffect(() => {
    engine.current?.d3Force('charge')?.strength?.(-320)
    engine.current?.d3Force('link')?.distance?.(58)
  }, [data, size.width > 0])

  // Frame the answer (or everything) whenever it changes, once the layout has settled.
  const frameView = () => engine.current?.zoomToFit(700, 90, lit ? (n) => lit.has(String(n.id)) : undefined)
  useEffect(() => {
    if (settled.current) frameView()
  }, [lit, size.width])

  const isLit = (id: string) => !lit || lit.has(id)
  const linkLit = (l: Link) => !!lit && lit.has(endId(l.source)) && lit.has(endId(l.target))

  return (
    <div className="graph" ref={frame}>
      {size.width > 0 && (
        <ForceGraph2D<GraphNode, GraphEdge>
          ref={engine}
          graphData={data}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          nodeLabel={() => ''}
          nodeCanvasObject={(n, ctx, scale) => {
            const id = String(n.id)
            const style = TYPE_STYLE[n.type]
            const on = isLit(id)
            const accent = !!lit && on
            const x = n.x ?? 0
            const y = n.y ?? 0
            const r = style.radius * (accent ? 1.12 : 1)
            const colour = accent ? INK.accent : n.type === 'patient' ? INK.primary : INK.secondary
            ctx.globalAlpha = on || hovered === id ? 1 : FADED
            ctx.beginPath()
            tracePath(ctx, style.shape, x, y, r)
            if (style.filled) {
              ctx.fillStyle = colour
              ctx.fill()
            } else {
              ctx.fillStyle = INK.page
              ctx.fill()
              ctx.lineWidth = accent ? 1.8 : 1.4
              ctx.strokeStyle = colour
              ctx.stroke()
            }
            // Labels: on what the answer is about, on everything when nothing is, and on hover.
            if (on || hovered === id) {
              const fontSize = (n.type === 'observation' ? 9.5 : 11) / Math.max(scale, 0.6)
              ctx.font = `${accent ? 600 : 500} ${fontSize}px ${FONT}`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'top'
              const text = truncate(n.label)
              const ty = y + r + 3 / scale
              ctx.lineWidth = 3 / scale
              ctx.strokeStyle = INK.page
              ctx.strokeText(text, x, ty)
              ctx.fillStyle = accent ? INK.primary : n.type === 'observation' ? INK.tertiary : INK.secondary
              ctx.fillText(text, x, ty)
            }
            ctx.globalAlpha = 1
          }}
          nodePointerAreaPaint={(n, colour, ctx) => {
            ctx.fillStyle = colour
            ctx.beginPath()
            ctx.arc(n.x ?? 0, n.y ?? 0, TYPE_STYLE[n.type].radius + 5, 0, Math.PI * 2)
            ctx.fill()
          }}
          linkColor={(l) => (linkLit(l) ? INK.accent : lit ? `rgba(201,207,219,${FADED + 0.15})` : INK.edge)}
          linkWidth={(l) => (linkLit(l) ? 1.6 : 1)}
          linkCanvasObjectMode={() => 'after'}
          linkCanvasObject={(l, ctx, scale) => {
            if (!linkLit(l) || UNLABELLED.has(l.relation)) return
            const s = l.source as Node
            const t = l.target as Node
            const fontSize = 8.5 / Math.max(scale, 0.6)
            ctx.font = `500 ${fontSize}px ${FONT}`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            const text = l.relation.replace(/_/g, ' ')
            const mx = ((s.x ?? 0) + (t.x ?? 0)) / 2
            const my = ((s.y ?? 0) + (t.y ?? 0)) / 2
            ctx.lineWidth = 3 / scale
            ctx.strokeStyle = INK.page
            ctx.strokeText(text, mx, my)
            ctx.fillStyle = INK.accent
            ctx.fillText(text, mx, my)
          }}
          warmupTicks={120}
          cooldownTicks={80}
          onEngineStop={() => {
            if (settled.current) return
            settled.current = true
            frameView()
          }}
          onNodeHover={(n) => {
            setHovered(n ? String(n.id) : null)
            if (frame.current) frame.current.style.cursor = n ? 'pointer' : 'default'
          }}
          onNodeClick={(n) => onSelect(String(n.id))}
        />
      )}
    </div>
  )
}
