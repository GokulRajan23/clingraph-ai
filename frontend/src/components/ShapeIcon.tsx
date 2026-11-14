import { TYPE_STYLE } from '../graph/style'
import type { NodeType } from '../graph/types'

/** A node type's graph shape as a small SVG, in the current text colour (legend, source pop-up). */
export function ShapeIcon({ type, size = 14 }: { type: NodeType; size?: number }) {
  const { shape, filled } = TYPE_STYLE[type]
  const paint = { fill: filled ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: 1.4 }
  let mark
  switch (shape) {
    case 'circle':
      mark = type === 'observation' ? <circle cx="8" cy="8" r="3.6" {...paint} /> : <circle cx="8" cy="8" r={type === 'patient' ? 6.4 : 5.6} {...paint} />
      break
    case 'portrait':
      mark = <rect x="3.4" y="1.6" width="9.2" height="12.8" rx="1.4" {...paint} />
      break
    case 'diamond':
      mark = <path d="M8 1.4 14.6 8 8 14.6 1.4 8Z" {...paint} />
      break
    case 'triangle':
      mark = <path d="M8 2 14.4 13H1.6Z" {...paint} strokeLinejoin="round" />
      break
    case 'pill':
      mark = <rect x="1.2" y="4.4" width="13.6" height="7.2" rx="3.6" {...paint} />
      break
  }
  return (
    <svg className="shape-icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {mark}
    </svg>
  )
}
