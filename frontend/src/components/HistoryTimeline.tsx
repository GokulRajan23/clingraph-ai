import { useState } from 'react'
import type { TimelineStop } from '../demo/data'

interface Props {
  stops: TimelineStop[]
  /** Opens a report's source pop-up. */
  onOpen: (reportId: string) => void
}

/** Matches the phone layout in styles.css, where the timeline runs down the page. */
const PHONE = '(max-width: 760px)'

/**
 * The patient's history at a glance: one stop per report along a line. Hovering (or focusing) a
 * stop shows what happened; clicking opens the report. On a phone the line runs down the page,
 * with nothing to hover: tapping a stop opens what happened under it, with a link to the report.
 */
export function HistoryTimeline({ stops, onOpen }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const pick = (report: string) => {
    if (!window.matchMedia(PHONE).matches) return onOpen(report)
    setExpanded((current) => (current === report ? null : report))
  }

  return (
    <ol className="timeline" aria-label="Patient history">
      {stops.map((stop) => (
        <li key={stop.report} className={expanded === stop.report ? 'expanded' : undefined}>
          <button type="button" onClick={() => pick(stop.report)} aria-describedby={`stop-${stop.report}`}>
            <span className="date mono">{stop.date}</span>
            <span className="dot" aria-hidden="true" />
            <span className="heading">{stop.heading}</span>
          </button>
          <div className="stop-card" id={`stop-${stop.report}`} role="tooltip">
            <p className="mono">{stop.date} · open report</p>
            <ul>
              {stop.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <button type="button" className="link stop-open" onClick={() => onOpen(stop.report)}>
              Open report
            </button>
          </div>
        </li>
      ))}
    </ol>
  )
}
