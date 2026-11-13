import { REVIEW } from '../labels'
import { STATE, type CardState } from '../lib/timeline'
import type { ReviewStatus } from '../types'

/** Text with one passage marked; offsets are relative to `text`. React escapes all content. */
export function Highlighted({ text, start, end }: { text: string; start: number; end: number }) {
  if (start < 0 || end > text.length || start >= end) return <>{text}</>
  return (
    <>
      {text.slice(0, start)}
      <mark>{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  )
}

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  const { label, icon } = REVIEW[status]
  return (
    <span className={`review-badge ${status}`}>
      <span aria-hidden="true">{icon}</span> {label}
    </span>
  )
}

/** Colour plus glyph plus text: the colour is never the only signal. */
export function StateChip({ state, short = false }: { state: CardState; short?: boolean }) {
  const { label, short: shortLabel, glyph } = STATE[state]
  return (
    <span className={`state state-${state}`} title={short ? label : undefined}>
      <span className="glyph" aria-hidden="true">
        {glyph}
      </span>
      {short ? shortLabel : label}
    </span>
  )
}
