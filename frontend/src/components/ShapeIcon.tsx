import { TYPE_STYLE } from '../graph/style'
import type { NodeType } from '../graph/types'

/** The node's canvas shape as a small SVG, for the legend, details card and citations. */
export function ShapeIcon({ type, size = 14 }: { type: NodeType; size?: number }) {
  const { color, shape } = TYPE_STYLE[type]
  const common = { fill: color, stroke: '#fffefa', strokeWidth: 1.5 }
  let mark
  switch (shape) {
    case 'hub':
      mark = <circle cx="8" cy="8" r="6.5" {...common} />
      break
    case 'circle':
      mark = <circle cx="8" cy="8" r="6" {...common} />
      break
    case 'dot':
      mark = <circle cx="8" cy="8" r="4" fill="#fffefa" stroke={color} strokeWidth={2} />
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
