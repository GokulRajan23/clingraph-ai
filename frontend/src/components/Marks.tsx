import { LEGEND_ORDER, TYPE_STYLE } from '../graph/style'
import { ShapeIcon } from './ShapeIcon'

/** The ClinGraph mark: an outlined pill split down the middle. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={(size * 14) / 22} viewBox="0 0 22 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="1" y="1" width="20" height="12" rx="6" />
      <path d="M11 1v12" />
    </svg>
  )
}

/** Which shape is which entity type, in the graph's corner. */
export function Legend() {
  return (
    <ul className="legend" aria-label="Graph legend">
      {LEGEND_ORDER.map((type) => (
        <li key={type}>
          <ShapeIcon type={type} size={12} />
          {TYPE_STYLE[type].name}
        </li>
      ))}
    </ul>
  )
}
