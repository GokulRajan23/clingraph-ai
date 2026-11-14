import { useEffect, useRef, type KeyboardEvent } from 'react'
import type { Focus } from '../App'
import type { Timeline } from '../graph/timeline'
import type { Graph } from '../graph/types'
import { GraphView } from './GraphView'
import { TimelineView } from './TimelineView'

export const VIEWS = ['graph', 'timeline'] as const
export type View = (typeof VIEWS)[number]

const VIEW_NAME: Record<View, string> = { graph: 'Knowledge graph', timeline: 'Clinical timeline' }

interface Props {
  graph: Graph | null
  /** Null while the timeline for the current graph is still loading. */
  timeline: Timeline | null
  /** Reports are being processed or the graph is being fetched. */
  busy: boolean
  focus: Focus
  onFocus: (focus: Focus) => void
  view: View
  onView: (view: View) => void
  collapsed: boolean
  onCollapsed: (collapsed: boolean) => void
}

const yearOf = (date: string | null) => date?.slice(0, 4)

/**
 * The centre column: the knowledge graph and the clinical timeline as tabs. The whole panel
 * collapses to a narrow strip. Both views stay mounted while hidden, so the graph keeps its layout.
 */
export function CentrePanel({ graph, timeline, busy, focus, onFocus, view, onView, collapsed, onCollapsed }: Props) {
  const tabs = useRef<Record<View, HTMLButtonElement | null>>({ graph: null, timeline: null })
  const strip = useRef<HTMLButtonElement>(null)
  const collapseButton = useRef<HTMLButtonElement>(null)
  // The button that was pressed disappears, so keyboard focus moves to its counterpart.
  const toggled = useRef(false)
  useEffect(() => {
    if (!toggled.current) return
    toggled.current = false
    ;(collapsed ? strip : collapseButton).current?.focus()
  }, [collapsed])
  const toggle = (next: boolean) => {
    toggled.current = true
    onCollapsed(next)
  }

  // Tabs pattern: arrow keys move between tabs and select them.
  const onTabKey = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1 : (VIEWS.indexOf(view) + step + VIEWS.length) % VIEWS.length
    if (!step && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    onView(VIEWS[index])
    tabs.current[VIEWS[index]]?.focus()
  }

  let meta = ''
  if (graph && view === 'graph') meta = `${graph.nodes.length} entities · ${graph.edges.length} relations`
  if (graph && view === 'timeline' && timeline?.start) {
    const [from, to] = [yearOf(timeline.start), yearOf(timeline.end)]
    meta = `${timeline.reports.length} ${timeline.reports.length === 1 ? 'report' : 'reports'} · ${from === to ? from : `${from}–${to}`}`
  }

  return (
    <section className={`panel centre-panel${collapsed ? ' collapsed' : ''}`} aria-label="Patient history">
      {collapsed && (
        <button ref={strip} className="centre-strip" aria-expanded="false" aria-controls="centre-body" onClick={() => toggle(false)} title="Show the knowledge graph and timeline">
          <ExpandIcon />
          <span className="strip-label">Knowledge graph · Timeline</span>
        </button>
      )}
      <div className="centre-body" id="centre-body" hidden={collapsed}>
        <div className="centre-head">
          <div className="tabs" role="tablist" aria-label="View" onKeyDown={onTabKey}>
            {VIEWS.map((v) => (
              <button
                key={v}
                ref={(element) => {
                  tabs.current[v] = element
                }}
                role="tab"
                id={`tab-${v}`}
                className="tab"
                aria-selected={view === v}
                aria-controls={`view-${v}`}
                tabIndex={view === v ? 0 : -1}
                onClick={() => onView(v)}
              >
                {VIEW_NAME[v]}
              </button>
            ))}
          </div>
          <span className="muted centre-meta">{meta}</span>
          <button
            ref={collapseButton}
            className="icon-button collapse-button"
            aria-expanded="true"
            aria-controls="centre-body"
            aria-label="Collapse the knowledge graph and timeline"
            title="Collapse"
            onClick={() => toggle(true)}
          >
            <CollapseIcon />
          </button>
        </div>

        {VIEWS.map((v) => (
          <div key={v} role="tabpanel" id={`view-${v}`} aria-labelledby={`tab-${v}`} className={`view view-${v}`} hidden={view !== v}>
            {graph ? (
              v === 'graph' ? (
                <GraphView graph={graph} focus={focus} onFocus={onFocus} />
              ) : timeline ? (
                <TimelineView graph={graph} timeline={timeline} focus={focus} onFocus={onFocus} />
              ) : (
                <Status busy text="Building the timeline…" />
              )
            ) : (
              <Status busy={busy} text={v === 'graph' ? 'Building the knowledge graph…' : 'Building the timeline…'} />
            )}
            {/* Over the view only: the tabs and the collapse button stay usable. */}
            {graph && busy && (
              <div className="centre-overlay" role="status">
                <span className="spinner large" aria-hidden="true" />
                <p>Updating the patient history…</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function Status({ busy, text }: { busy: boolean; text: string }) {
  return (
    <div className="view-frame view-empty">
      {busy ? (
        <div className="view-status" role="status">
          <span className="spinner large" aria-hidden="true" />
          <p>{text}</p>
        </div>
      ) : (
        <div className="view-status">
          <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true" className="empty-mark">
            <path d="M14 38 28 16 42 34M14 38 42 34" />
            <circle cx="14" cy="38" r="6" />
            <circle cx="28" cy="16" r="6" />
            <circle cx="42" cy="34" r="6" />
          </svg>
          <p className="empty-title">No reports yet</p>
          <p className="muted">Upload the patient's PDF reports, or drop them anywhere on the page, to build the knowledge graph and timeline.</p>
        </div>
      )}
    </div>
  )
}

const CollapseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 4.5 6 8l-3.5 3.5M13.5 4.5 10 8l3.5 3.5" />
  </svg>
)

const ExpandIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4.5 2.5 8 6 11.5M10 4.5l3.5 3.5-3.5 3.5" />
  </svg>
)
