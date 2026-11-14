import type { TimelineStop } from '../demo/data'

interface Props {
  stops: TimelineStop[]
  /** Opens a report's source pop-up. */
  onOpen: (reportId: string) => void
}

/**
 * The patient's history at a glance: one stop per report along a line. Hovering (or focusing) a
 * stop shows what happened; clicking opens the report.
 */
export function HistoryTimeline({ stops, onOpen }: Props) {
  return (
    <ol className="timeline" aria-label="Patient history">
      {stops.map((stop) => (
        <li key={stop.report}>
          <button type="button" onClick={() => onOpen(stop.report)} aria-describedby={`stop-${stop.report}`}>
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
          </div>
        </li>
      ))}
    </ol>
  )
}
