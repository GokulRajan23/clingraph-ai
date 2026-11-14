import { useEffect, useMemo, useRef } from 'react'

export type PillMode = 'idle' | 'listening' | 'thinking' | 'speaking'

interface Props {
  mode: PillMode
  /** Microphone loudness (RMS, 0–1) while listening; read every frame. */
  level?: () => number
  /** Particles on the capsule. */
  count?: number
  /** How much of the canvas the capsule spans (0–1). */
  scale?: number
  /** Dissolve the right-hand end into pixel blocks, like the logo's hero. */
  pixelate?: boolean
  className?: string
}

interface Particle {
  x0: number
  nx: number
  ny: number
  nz: number
  off: number
  seed: number
  tint: number
  halo: boolean
}

// Capsule half-length and radius, in model units.
const HALF = 1.5
const RADIUS = 0.62
// Mostly ink, with rare blue and rose specks (DESIGN.md particle tints, darkened for a light page).
const TINTS = ['62,71,91', '47,95,224', '204,110,146']
const STYLES = TINTS.map((c) => Array.from({ length: 11 }, (_, i) => `rgba(${c},${i / 10})`))

const gauss = () => Math.sqrt(-2 * Math.log(Math.random() + 1e-9)) * Math.cos(2 * Math.PI * Math.random())

/** Points spread evenly over the capsule's surface; 12 % float just outside it as a halo. */
function makeParticles(count: number): Particle[] {
  const side = 2 * Math.PI * RADIUS * 2 * HALF
  const caps = 4 * Math.PI * RADIUS * RADIUS
  const particles: Particle[] = []
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2
    let x0: number
    let nx: number
    let ny: number
    let nz: number
    if (Math.random() < side / (side + caps)) {
      x0 = (Math.random() * 2 - 1) * HALF
      nx = 0
      ny = Math.cos(theta)
      nz = Math.sin(theta)
    } else {
      const u = Math.random() * 2 - 1
      const s = Math.sqrt(1 - u * u)
      nx = Math.abs(u) * (Math.random() < 0.5 ? -1 : 1)
      ny = s * Math.cos(theta)
      nz = s * Math.sin(theta)
      x0 = Math.sign(nx) * HALF
    }
    const halo = Math.random() < 0.12
    const off = RADIUS * (1 + (halo ? Math.abs(gauss()) * 0.35 : gauss() * 0.035))
    const tint = Math.random() < 0.035 ? 1 : Math.random() < 0.035 ? 2 : 0
    particles.push({ x0, nx, ny, nz, off, seed: Math.random() * 100, tint, halo })
  }
  return particles
}

/**
 * The voice button's face: a slowly spinning 3D capsule of particles (the ClinGraph pill). It
 * breathes at rest, swells with the voice while listening, pulses while thinking and sends a wave
 * along its length while speaking. Fills its container; purely decorative to assistive tech.
 */
export function ParticlePill({ mode, level, count = 9000, scale = 0.8, pixelate = true, className }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const particles = useMemo(() => makeParticles(count), [count])
  const state = useRef({ mode, level })
  state.current = { mode, level }

  useEffect(() => {
    const element = canvas.current
    const ctx = element?.getContext('2d')
    if (!element || !ctx) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0
    let height = 0
    let ratio = 1
    let smoothed = 0
    let frame = 0
    const start = performance.now()

    const draw = (now: number) => {
      if (element.clientWidth !== width || element.clientHeight !== height) {
        ratio = Math.min(window.devicePixelRatio || 1, 2)
        width = element.clientWidth
        height = element.clientHeight
        element.width = Math.round(width * ratio)
        element.height = Math.round(height * ratio)
      }
      const t = still ? 2 : (now - start) / 1000
      const { mode: current, level: read } = state.current
      const target =
        current === 'listening' ? Math.min(1, (read?.() ?? 0) * 6) : current === 'speaking' ? 0.45 + 0.4 * Math.abs(Math.sin(t * 5) * Math.sin(t * 1.7)) : 0
      smoothed += (target - smoothed) * 0.15

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, width, height)
      const size = (Math.min(width * scale, height * 1.05) / (HALF + RADIUS)) * 0.5
      const cx = width / 2
      const cy = height / 2 + Math.sin(t * 0.6) * Math.min(6, height * 0.02)
      const spin = t * 0.25
      const yaw = 0.28 + Math.sin(t * 0.2) * 0.1
      const roll = -0.14 + Math.sin(t * 0.3) * 0.04
      const [cs, ss, cyw, syw, cr, sr] = [Math.cos(spin), Math.sin(spin), Math.cos(yaw), Math.sin(yaw), Math.cos(roll), Math.sin(roll)]
      const pixelFrom = width * 0.64
      const dot = width < 260 ? 0.85 : 1

      for (const p of particles) {
        let d = Math.sin(p.x0 * 3 + t * 1.2 + p.seed) * 0.012
        if (current === 'listening') d += smoothed * (0.18 * Math.sin(p.seed * 7 + t * 9) + 0.12 * Math.sin(p.x0 * 6 - t * 7))
        else if (current === 'speaking') d += smoothed * 0.22 * Math.sin(p.x0 * 5 - t * 10) * (0.6 + 0.4 * Math.sin(p.seed))
        else if (current === 'thinking') d += 0.05 * Math.sin(t * 4 + p.x0 * 2)
        const r = p.off + d + (p.halo ? smoothed * 0.25 : 0)
        const x = p.nx ? p.x0 + p.nx * r : p.x0
        const y = p.ny * r
        const z = p.nz * r
        // Spin about the long axis, then yaw, then roll.
        const y1 = y * cs - z * ss
        const z1 = y * ss + z * cs
        const x2 = x * cyw + z1 * syw
        const z2 = -x * syw + z1 * cyw
        const x3 = x2 * cr - y1 * sr
        const y3 = x2 * sr + y1 * cr
        const perspective = 3.6 / (3.6 + z2)
        let sx = cx + x3 * size * perspective
        let sy = cy + y3 * size * perspective
        const depth = (z2 + 1.6) / 3.2 // 0 near … 1 far
        let alpha = (1 - depth) * 0.7 + 0.25
        if (p.halo) alpha *= 0.5
        let s = (1.6 - depth * 0.7) * dot
        if (pixelate && sx > pixelFrom) {
          const k = Math.min(1, (sx - pixelFrom) / (width * 0.22))
          if (p.seed % 1 < k * 0.9) {
            const grid = 3 + Math.round(k * 4)
            sx = Math.round(sx / grid) * grid
            sy = Math.round(sy / grid) * grid
            s = grid - 1
            alpha *= 0.9
          }
        }
        ctx.fillStyle = STYLES[p.tint][Math.min(10, Math.round(alpha * 10))]
        ctx.fillRect(sx, sy, s, s)
      }
      if (!still) frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    // With reduced motion there is one still frame, redrawn only when the canvas changes size.
    const resized = new ResizeObserver(() => still && draw(performance.now()))
    resized.observe(element)
    return () => {
      cancelAnimationFrame(frame)
      resized.disconnect()
    }
  }, [particles, scale, pixelate])

  return <canvas ref={canvas} className={className} aria-hidden="true" />
}
