import type { Change } from './timeline'
import type { NodeType } from './types'

export type Shape = 'hub' | 'square' | 'circle' | 'dot' | 'diamond' | 'triangle' | 'pill'

export interface TypeStyle {
  name: string
  color: string
  shape: Shape
  /** Radius in graph units at zoom 1. */
  radius: number
}

/*
 * Five categorical hues, validated all-pairs on the paper surface (#fffefa) with the dataviz
 * palette validator: normal-vision ΔE ≥ 15.6, worst CVD pair 6.1 (diagnosis ↔ procedure).
 * That CVD band needs secondary encoding, so every type also has its own shape, every node
 * is labelled, and the legend pairs both. Observations share their finding's hue; the
 * patient hub is neutral ink.
 */
export const TYPE_STYLE: Record<NodeType, TypeStyle> = {
  patient: { name: 'Patient', color: '#29293c', shape: 'hub', radius: 9 },
  report: { name: 'Report', color: '#2a78d6', shape: 'square', radius: 7 },
  finding: { name: 'Finding', color: '#eda100', shape: 'circle', radius: 7 },
  observation: { name: 'Finding state', color: '#eda100', shape: 'dot', radius: 4.5 },
  diagnosis: { name: 'Diagnosis', color: '#e87ba4', shape: 'diamond', radius: 7.5 },
  procedure: { name: 'Procedure', color: '#1baf7a', shape: 'triangle', radius: 7 },
  medication: { name: 'Medication', color: '#008300', shape: 'pill', radius: 6.5 },
}

/*
 * Timeline: colour encodes only how a finding changed. Progressed ↔ improved is a polarity, so
 * they take the warm/cool poles (red, blue) with stable as the neutral ink midpoint; new keeps
 * the finding hue. The three hues validate all-pairs on #fffefa (worst CVD ΔE 15.3, normal 20.8);
 * the amber is below 3:1 contrast, so every mark is also direct-labelled. Each change has its own
 * glyph inside the circle, and documented-only marks are a hollow ring. Diagnoses, procedures
 * and therapy are drawn in neutral ink with their graph shapes: adding their graph hues to the
 * same view fails the normal-vision floor (diagnosis pink ↔ progressed red, ΔE 13.2).
 */
export const CHANGE_STYLE: Record<Change, { color: string; glyph: 'plus' | 'up' | 'equal' | 'down' | 'ring'; glyphColor: string }> = {
  new: { color: '#eda100', glyph: 'plus', glyphColor: '#29293c' },
  progressed: { color: '#e34948', glyph: 'up', glyphColor: '#ffffff' },
  stable: { color: '#29293c', glyph: 'equal', glyphColor: '#ffffff' },
  improved: { color: '#2a78d6', glyph: 'down', glyphColor: '#ffffff' },
  documented: { color: '#6f6c7d', glyph: 'ring', glyphColor: '#6f6c7d' },
}

export const CHANGE_ORDER: Change[] = ['new', 'progressed', 'stable', 'improved', 'documented']

export const LEGEND_ORDER: NodeType[] =['patient', 'report', 'finding', 'observation', 'diagnosis', 'procedure', 'medication']

/** Traces a type's shape centred on (x, y). The caller fills and strokes. */
export function tracePath(ctx: CanvasRenderingContext2D | Path2D, shape: Shape, x: number, y: number, r: number): void {
  switch (shape) {
    case 'hub':
    case 'circle':
    case 'dot':
      ctx.moveTo(x + r, y)
      ctx.arc(x, y, r, 0, Math.PI * 2)
      break
    case 'square': {
      const s = r * 0.9
      ctx.roundRect(x - s, y - s, s * 2, s * 2, r * 0.3)
      break
    }
    case 'diamond':
      ctx.moveTo(x, y - r)
      ctx.lineTo(x + r, y)
      ctx.lineTo(x, y + r)
      ctx.lineTo(x - r, y)
      ctx.closePath()
      break
    case 'triangle':
      ctx.moveTo(x, y - r)
      ctx.lineTo(x + r * 0.95, y + r * 0.7)
      ctx.lineTo(x - r * 0.95, y + r * 0.7)
      ctx.closePath()
      break
    case 'pill': {
      const h = r * 0.65
      ctx.roundRect(x - r * 1.15, y - h, r * 2.3, h * 2, h)
      break
    }
  }
}
