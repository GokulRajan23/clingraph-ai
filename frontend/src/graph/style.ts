import type { NodeType } from './types'

/*
 * The graph is greyscale: entity type is told apart by shape (filled or hollow), never by hue.
 * The one chromatic colour is the accent, which marks what the current answer is about.
 * Canvas drawing cannot read CSS variables, so these mirror the tokens in styles.css.
 */
export const INK = {
  page: '#f6f7fa',
  primary: '#121726',
  secondary: '#3e475b',
  tertiary: '#5f687d',
  edge: '#c9cfdb',
  accent: '#2f5fe0',
} as const

export type Shape = 'circle' | 'portrait' | 'diamond' | 'triangle' | 'pill'

export interface TypeStyle {
  name: string
  shape: Shape
  filled: boolean
  /** Radius in graph units at zoom 1. */
  radius: number
}

export const TYPE_STYLE: Record<NodeType, TypeStyle> = {
  patient: { name: 'Patient', shape: 'circle', filled: true, radius: 9 },
  report: { name: 'Report', shape: 'portrait', filled: false, radius: 7 },
  finding: { name: 'Finding', shape: 'circle', filled: true, radius: 6.5 },
  observation: { name: 'Finding state', shape: 'circle', filled: false, radius: 3.8 },
  diagnosis: { name: 'Diagnosis', shape: 'diamond', filled: true, radius: 7.5 },
  procedure: { name: 'Procedure', shape: 'triangle', filled: false, radius: 7 },
  medication: { name: 'Medication', shape: 'pill', filled: false, radius: 6.5 },
}

export const LEGEND_ORDER: NodeType[] = ['patient', 'report', 'finding', 'observation', 'diagnosis', 'procedure', 'medication']

/** Traces a shape centred on (x, y). The caller fills and/or strokes. */
export function tracePath(ctx: CanvasRenderingContext2D | Path2D, shape: Shape, x: number, y: number, r: number): void {
  switch (shape) {
    case 'circle':
      ctx.moveTo(x + r, y)
      ctx.arc(x, y, r, 0, Math.PI * 2)
      break
    case 'portrait':
      ctx.roundRect(x - r * 0.78, y - r, r * 1.56, r * 2, r * 0.18)
      break
    case 'diamond':
      ctx.moveTo(x, y - r)
      ctx.lineTo(x + r, y)
      ctx.lineTo(x, y + r)
      ctx.lineTo(x - r, y)
      ctx.closePath()
      break
    case 'triangle':
      ctx.moveTo(x, y - r)
      ctx.lineTo(x + r * 0.95, y + r * 0.72)
      ctx.lineTo(x - r * 0.95, y + r * 0.72)
      ctx.closePath()
      break
    case 'pill': {
      const h = r * 0.6
      ctx.roundRect(x - r * 1.2, y - h, r * 2.4, h * 2, h)
      break
    }
  }
}
