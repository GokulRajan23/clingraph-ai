import { CHANGE_STYLE, TYPE_STYLE } from '../graph/style'
import type { Change } from '../graph/timeline'
import type { NodeType } from '../graph/types'

const PAPER = '#fffefa'
const INK = '#29293c'

/**
 * The node's canvas shape as a small SVG, for the legend, details card and citations.
 * `neutral` draws the outline in ink instead of the type's hue (used on the timeline).
 */
export function ShapeIcon({ type, size = 14, neutral = false }: { type: NodeType; size?: number; neutral?: boolean }) {
  const { color, shape } = TYPE_STYLE[type]
  const common = neutral ? { fill: PAPER, stroke: INK, strokeWidth: 1.6 } : { fill: color, stroke: PAPER, strokeWidth: 1.5 }
  let mark
  switch (shape) {
    case 'hub':
      mark = <circle cx="8" cy="8" r="6.5" {...common} />
      break
    case 'circle':
      mark = <circle cx="8" cy="8" r="6" {...common} />
      break
    case 'dot':
      mark = <circle cx="8" cy="8" r="4" fill={PAPER} stroke={neutral ? INK : color} strokeWidth={2} />
      break
    case 'square':
      mark = <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2" {...common} />
      break
    case 'diamond':
      mark = <path d="M8 1.2 14.8 8 8 14.8 1.2 8Z" {...common} />
      break
    case 'triangle':
      mark = <path d="M8 1.5 14.7 13.2H1.3Z" {...common} />
      break
    case 'pill':
      mark = <rect x="1" y="4" width="14" height="8" rx="4" {...common} />
      break
  }
  return (
    <svg className="shape-icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {mark}
    </svg>
  )
}

const GLYPH_PATH = {
  plus: 'M8 4.6v6.8M4.6 8h6.8',
  up: 'M8 11.6V4.8M5 7.6l3-3 3 3',
  down: 'M8 4.4v6.8M5 8.4l3 3 3-3',
  equal: 'M4.9 6.5h6.2M4.9 9.5h6.2',
}

/** A finding's change on the timeline: a filled circle in the change's colour with its own glyph. */
export function ChangeIcon({ change, size = 16 }: { change: Change; size?: number }) {
  const { color, glyph, glyphColor } = CHANGE_STYLE[change]
  return (
    <svg className="shape-icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {glyph === 'ring' ? (
        <circle cx="8" cy="8" r="5.6" fill={PAPER} stroke={color} strokeWidth={2} />
      ) : (
        <>
          <circle cx="8" cy="8" r="7.2" fill={color} />
          <path d={GLYPH_PATH[glyph]} fill="none" stroke={glyphColor} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  )
}
