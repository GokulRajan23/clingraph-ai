import { useEffect, useMemo, useRef, useState, type FocusEvent, type MouseEvent, type PointerEvent } from 'react'
import type { Focus } from '../App'
import { neighborhood, nodeById } from '../graph/query'
import { CHANGE_ORDER } from '../graph/style'
import { axisDomain, CHANGE_NAME, packRows, toTime, yearBands, type Timeline, type TimelineLane, type TimelineMark, type TimelineSpan } from '../graph/timeline'
import type { Graph } from '../graph/types'
import { NodeCard } from './NodeCard'
import { ChangeIcon, ShapeIcon } from './ShapeIcon'

/** Horizontal room kept free at both ends of the plot, so edge marks are not clipped. */
const PAD = 14
/** Bounds of a mark's label box, which is also its hit target. */
const SLOT_MIN = 44
const SLOT_MAX = 104
const SLOT_GAP = 6
const MARK_ROW = 54
const MARK_ICON = 18
const SPAN_ROW = 28
const SPAN_H = 20
const SPAN_MIN = 8
/** Narrower year bands (a few days of the next year after the end padding) get no label. */
const YEAR_LABEL_MIN = 36
const TICK_W = 108
const TICK_ROW = 38
const YEAR_ROW = 22
const LANE_PAD = 6

interface Props {
  graph: Graph
  timeline: Timeline
  focus: Focus
  onFocus: (focus: Focus) => void
}

/** Height to leave for a tooltip below its item before it flips above. */
const TIP_ROOM = 90

interface Tip {
  key: string
  above: boolean
  left: number
  top: number
  lead: string
  lines: string[]
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max))

/** Rough rendered width of label text at 11.5px, plus the box padding. */
const textWidth = (text: string) => text.length * 6.4 + 10

/**
 * Label box width for a mark: wide enough for its text on one line, up to SLOT_MAX. A label
 * without a detail line may wrap onto two lines instead, so it takes about half its length.
 */
function slotWidth(mark: TimelineMark): number {
  const label = textWidth(mark.label)
  const detail = mark.detail ? textWidth(mark.detail) : 0
  const longestWord = Math.max(...mark.label.split(/\s+/).map(textWidth))
  const wanted = mark.detail || label <= SLOT_MAX ? Math.max(label, detail) : Math.max(label / 2 + 14, longestWord)
  return Math.round(clamp(wanted, SLOT_MIN, SLOT_MAX))
}

/**
 * The patient's history over time: a lane per finding with its change at each report, then
 * diagnoses, procedures and therapy, on a proportional date axis with a tick per report.
 */
export function TimelineView({ graph, timeline, focus, onFocus }: Props) {
  const frame = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const plot = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [tip, setTip] = useState<Tip | null>(null)

  useEffect(() => {
    const element = plot.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.floor(entry.contentRect.width)
      if (next > 0) setWidth(next)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const highlight = useMemo<Set<string> | null>(() => {
    if (!focus) return null
    return focus.kind === 'node' ? neighborhood(graph, focus.id) : new Set(focus.ids)
  }, [graph, focus])
  const selectedId = focus?.kind === 'node' ? focus.id : null
  const selected = selectedId ? nodeById(graph, selectedId) : undefined
  // With a report selected, a finding's "documented" marks light up only for that report.
  const selectedReport = selected?.type === 'report' ? selected.id : null

  // The details card takes room below the timeline: keep the selected item in view.
  useEffect(() => {
    if (!selectedId) return
    frame.current?.querySelector('.selected')?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  // A finding in the highlight lights its whole lane: in the graph its later states are more
  // than one hop away, but on the timeline they are the finding.
  const markLit = (lane: TimelineLane, mark: TimelineMark) =>
    !highlight ||
    ((highlight.has(mark.nodeId) || (lane.kind === 'finding' && highlight.has(lane.id))) &&
      (!mark.reportId || !selectedReport || mark.reportId === selectedReport))
  const idLit = (id: string) => !highlight || highlight.has(id)

  const layout = useMemo(() => {
    if (!timeline.start || !timeline.end || width === 0) return null
    const [from, to] = axisDomain(timeline.start, timeline.end)
    const inner = Math.max(width - PAD * 2, 1)
    const x = (date: string | number) => PAD + ((typeof date === 'number' ? date : toTime(date)) - from) / (to - from) * inner
    const years = yearBands(from, to).map((b) => ({ year: b.year, left: x(b.from), right: x(b.to) }))

    const tickLefts = timeline.reports.map((r) => clamp(x(r.date) - TICK_W / 2, 0, width - TICK_W))
    const tickRows = packRows(tickLefts.map((l) => [l, l + TICK_W]), SLOT_GAP)
    const ticks = timeline.reports.map((report, i) => ({ report, x: x(report.date), left: tickLefts[i], row: tickRows[i] }))
    const axisHeight = YEAR_ROW + (Math.max(-1, ...tickRows) + 1) * TICK_ROW + 6

    const lanes = timeline.lanes.map((lane) => {
      const slots = lane.marks.map(slotWidth)
      const lefts = lane.marks.map((m, i) => clamp(x(m.date) - slots[i] / 2, 0, width - slots[i]))
      const markRows = packRows(lefts.map((l, i) => [l, l + slots[i]]), SLOT_GAP)
      const marks = lane.marks.map((mark, i) => ({ mark, x: x(mark.date), left: lefts[i], slot: slots[i], row: markRows[i] }))
      const spanBox = lane.spans.map((s) => [x(s.start), x(s.end)] as [number, number])
      // Pack what is drawn: a short span is still at least SPAN_MIN wide.
      const spanRows = packRows(spanBox.map(([l, r]) => [l, Math.max(r, l + SPAN_MIN + 2)]))
      const spans = lane.spans.map((span, i) => ({ span, left: spanBox[i][0], right: spanBox[i][1], row: spanRows[i] }))
      const rows = marks.length ? Math.max(...markRows) + 1 : 0
      const spanLines = spans.length ? Math.max(...spanRows) + 1 : 0
      const height = Math.max(rows * MARK_ROW, spanLines * SPAN_ROW) + LANE_PAD * 2
      return { lane, marks, spans, height }
    })
    return { years, ticks, axisHeight, lanes }
  }, [timeline, width])

  const showTip = (event: PointerEvent<HTMLElement> | FocusEvent<HTMLElement>, key: string, lead: string, lines: string[]) => {
    const box = wrap.current
    if (!box) return
    const target = event.currentTarget.getBoundingClientRect()
    const outer = box.getBoundingClientRect()
    // Below the item, unless that would run past the bottom of the timeline.
    const above = target.bottom - outer.top + TIP_ROOM > outer.height
    setTip({
      key,
      lead,
      lines,
      above,
      left: clamp(target.left - outer.left + target.width / 2, 110, outer.width - 110),
      top: above ? target.top - outer.top - 6 : target.bottom - outer.top + 6,
    })
  }
  const hideTip = (key: string) => setTip((current) => (current?.key === key ? null : current))
  const tipHandlers = (key: string, lead: string, lines: string[]) => ({
    onPointerEnter: (e: PointerEvent<HTMLElement>) => showTip(e, key, lead, lines),
    onPointerLeave: () => hideTip(key),
    onFocus: (e: FocusEvent<HTMLElement>) => showTip(e, key, lead, lines),
    onBlur: () => hideTip(key),
  })

  const reportLabel = (id: string | undefined) => (id ? nodeById(graph, id)?.label : undefined)
  const markLines = (lane: TimelineLane, mark: TimelineMark): string[] => {
    const lines = [lane.kind === 'finding' ? lane.label : nodeById(graph, mark.nodeId)?.label ?? mark.label]
    if (mark.change) lines.push([CHANGE_NAME[mark.change], mark.detail].filter(Boolean).join(' · '))
    const source = reportLabel(mark.reportId)
    if (source) lines.push(`Source: ${source}`)
    return lines
  }
  const markName = (lane: TimelineLane, mark: TimelineMark) => [markLines(lane, mark).join(', '), mark.dateText].join(', ')
  const spanText = (span: TimelineSpan) => `${span.startText} – ${span.ongoing ? 'ongoing' : span.endText}`

  const clearOnBackground = (event: MouseEvent) => {
    if (!(event.target as Element).closest('button')) onFocus(null)
  }

  return (
    <>
      <ul className="legend" aria-label="Timeline legend">
        {CHANGE_ORDER.map((change) => (
          <li key={change}>
            <ChangeIcon change={change} size={14} />
            {CHANGE_NAME[change]}
          </li>
        ))}
        <li>
          <ShapeIcon type="diagnosis" neutral />
          Diagnosis
        </li>
        <li>
          <ShapeIcon type="procedure" neutral />
          Procedure
        </li>
        <li>
          <span className="span-swatch" aria-hidden="true" />
          Therapy
        </li>
        <li>
          <span className="tick-swatch" aria-hidden="true" />
          Report
        </li>
      </ul>
      {/* The tooltip lives outside the scrolling frame, so it never grows the scroll area. */}
      <div className="timeline-wrap" ref={wrap}>
      <div className="timeline-frame" ref={frame} onClick={clearOnBackground} onScroll={() => setTip(null)}>
        <div className="timeline-grid">
          <div className="lane-name axis-name" aria-hidden="true" />
          <div className="timeline-axis" ref={plot} style={{ height: layout?.axisHeight ?? YEAR_ROW }}>
            {layout?.years.filter((band) => band.right - band.left >= YEAR_LABEL_MIN).map((band) => (
              <span key={band.year} className="year" style={{ left: band.left }}>
                {band.year}
              </span>
            ))}
            {layout?.ticks.map(({ report, left, row }) => {
              const key = `tick-${report.nodeId}`
              return (
                <button
                  key={key}
                  className={`tick${idLit(report.nodeId) ? '' : ' dim'}${selectedId === report.nodeId ? ' selected' : ''}`}
                  style={{ left, top: YEAR_ROW + row * TICK_ROW, width: TICK_W }}
                  aria-label={`Report: ${report.label}, ${report.dateText}`}
                  aria-pressed={selectedId === report.nodeId}
                  onClick={() => onFocus({ kind: 'node', id: report.nodeId })}
                  {...tipHandlers(key, report.dateText, [report.label])}
                >
                  <span className="tick-name">{report.label}</span>
                  <span className="tick-date">{report.dateText}</span>
                </button>
              )
            })}
          </div>
        </div>

        {layout && (
          <div className="timeline-body">
            <div className="timeline-rules" aria-hidden="true">
              {layout.years.slice(1).map((band) => (
                <span key={band.year} className="rule year-rule" style={{ left: band.left }} />
              ))}
              {layout.ticks.map(({ report, x }) => (
                <span key={report.nodeId} className={`rule report-rule${idLit(report.nodeId) ? '' : ' dim'}`} style={{ left: x }} />
              ))}
            </div>
            <ol className="lanes" aria-label="Clinical timeline">
              {layout.lanes.map(({ lane, marks, spans, height }) => {
                const laneSelected = selectedId !== null && (lane.id === selectedId || marks.some((m) => m.mark.nodeId === selectedId) || spans.some((s) => s.span.nodeId === selectedId))
                return (
                  <li key={lane.id} className={`lane${laneSelected ? ' selected' : ''}`} aria-label={lane.label}>
                    <div className="lane-name">
                      {lane.kind === 'finding' ? (
                        <button className="lane-button" title={lane.label} aria-pressed={selectedId === lane.id} onClick={() => onFocus({ kind: 'node', id: lane.id })}>
                          {lane.label}
                        </button>
                      ) : (
                        <span className="lane-group">{lane.label}</span>
                      )}
                    </div>
                    <div className="lane-plot" style={{ height }}>
                      {lane.connected && marks.length > 1 && (
                        <svg className="connectors" aria-hidden="true">
                          {marks.slice(1).map((m, i) => {
                            const prev = marks[i]
                            const lit = markLit(lane, prev.mark) && markLit(lane, m.mark)
                            return (
                              <line
                                key={m.mark.key}
                                className={highlight && lit ? 'lit' : undefined}
                                x1={prev.x}
                                y1={LANE_PAD + prev.row * MARK_ROW + MARK_ICON / 2}
                                x2={m.x}
                                y2={LANE_PAD + m.row * MARK_ROW + MARK_ICON / 2}
                              />
                            )
                          })}
                        </svg>
                      )}
                      <ul>
                        {marks.map(({ mark, x, left, slot, row }) => (
                          <li key={mark.key}>
                            <button
                              className={`mark${markLit(lane, mark) ? '' : ' dim'}${selectedId === mark.nodeId ? ' selected' : ''}`}
                              style={{ left, top: LANE_PAD + row * MARK_ROW, width: slot }}
                              aria-label={markName(lane, mark)}
                              aria-pressed={selectedId === mark.nodeId}
                              onClick={() => onFocus({ kind: 'node', id: mark.nodeId })}
                              {...tipHandlers(mark.key, mark.dateText, markLines(lane, mark))}
                            >
                              <span className="mark-icon" style={{ left: x - left - MARK_ICON / 2 }}>
                                {mark.change ? <ChangeIcon change={mark.change} size={MARK_ICON} /> : <ShapeIcon type={mark.type} size={MARK_ICON} neutral />}
                              </span>
                              <span className={`mark-label${mark.detail ? '' : ' wrap'}`}>{mark.label}</span>
                              {mark.detail && <span className="mark-detail">{mark.detail}</span>}
                            </button>
                          </li>
                        ))}
                        {spans.map(({ span, left, right, row }) => (
                          <li key={span.key}>
                            <button
                              className={`span${span.ongoing ? ' ongoing' : ''}${idLit(span.nodeId) ? '' : ' dim'}${selectedId === span.nodeId ? ' selected' : ''}`}
                              style={{ left: left + 1, width: Math.max(right - left - 2, SPAN_MIN), top: LANE_PAD + row * SPAN_ROW + (SPAN_ROW - SPAN_H) / 2, height: SPAN_H }}
                              aria-label={`Therapy: ${span.label}, ${spanText(span)}`}
                              aria-pressed={selectedId === span.nodeId}
                              onClick={() => onFocus({ kind: 'node', id: span.nodeId })}
                              {...tipHandlers(span.key, spanText(span), [span.label])}
                            >
                              <span className="span-label">{span.label}</span>
                              {span.ongoing && <span className="span-ongoing">ongoing ▸</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        )}
        {timeline.lanes.length === 0 && <p className="muted timeline-none">No dated events in these reports.</p>}
      </div>
      {tip && (
        <div className={`timeline-tip${tip.above ? ' above' : ''}`} style={{ left: tip.left, top: tip.top }} role="presentation">
          <strong>{tip.lead}</strong>
          {tip.lines.map((line, i) => (
            <span key={i}>{line}</span>
          ))}
        </div>
      )}
      </div>
      {selected && <NodeCard graph={graph} node={selected} onFocus={onFocus} inline />}
    </>
  )
}
