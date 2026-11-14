/*
 * FluidOrb, adapted from Rare UI (https://rareui.com), components/ui/fluid-orb.tsx in
 * https://github.com/swamimalode07/rare-ui. The fragment shader is upstream's, unchanged.
 *
 * Changes for ClinGraph: plain CSS instead of Tailwind and `cn`; a `speed` that changes how fast
 * the fluid moves without restarting it; a `level` read every frame that swells the orb with
 * the microphone.
 *
 * Copyright (c) 2026 Swami Malode
 *
 * MIT + Commons Clause License Condition v1.0 + Attribution
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, and distribute the Software as part of an
 * application, website, or product, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * Attribution Requirement
 *
 * Any project that ships any part of the Software must credit Rare UI with a
 * visible link to https://rareui.com, placed where a visitor or user can find it,
 * such as a site footer, an about page, a credits screen or a README. The credit
 * and the copyright notice above must not be removed from the source you copied.
 *
 * Commons Clause Restriction
 *
 * You may use this Software, including for any commercial purpose, so long as you
 * do not sell, sublicense, or redistribute the components themselves, whether
 * alone, in a bundle, or as a ported version.
 *
 * No Warranty
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { useEffect, useRef, type ComponentProps } from 'react'

export type FluidOrbProps = Omit<ComponentProps<'div'>, 'color'> & {
  size?: number
  color?: string
  /** Multiplies how fast the fluid moves. Changing it does not restart the animation. */
  speed?: number
  /** Read every frame: loudness from 0 to 1 that swells the orb. */
  level?: () => number
}

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_color;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.6;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = u_time * 0.22;

  vec2 drift = vec2(
    sin(t) + 0.6 * sin(t * 1.7 + 1.3),
    cos(t * 0.8) + 0.6 * cos(t * 1.3 + 2.1)
  );

  vec2 p = vec2(uv.x * 1.8, uv.y * 1.0) + drift * 0.7;

  vec2 q = vec2(fbm(p + drift), fbm(p + vec2(3.2, 1.5) - drift));
  float f = fbm(p + 1.2 * q);

  float g = clamp(1.0 - uv.y, 0.0, 1.0);
  float anchor = smoothstep(0.0, 0.3, uv.y);
  float shade = clamp(g + (f - 0.5) * 0.8 * anchor, 0.0, 1.0);

  vec3 white = vec3(0.99, 1.0, 1.0);
  vec3 light = mix(white, u_color, 0.5);
  vec3 dark = u_color;

  vec3 col = white;
  col = mix(col, light, smoothstep(0.28, 0.52, shade));
  col = mix(col, dark, smoothstep(0.58, 0.88, shade));

  float edge = smoothstep(0.5, 0.49, distance(uv, vec2(0.5)));

  gl_FragColor = vec4(col * edge, edge);
}
`

/** How far a full-volume `level` swells the orb. */
const SWELL = 0.12

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  }
  const n = parseInt(h, 16)
  if (h.length !== 6 || Number.isNaN(n)) return [0.1, 0.45, 0.95]
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export function FluidOrb({ size = 240, color = '#1A73F2', speed = 1, level, className, style, ...props }: FluidOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  // Read by the running animation, so changing them does not rebuild the GL program.
  const live = useRef({ speed, level })
  useEffect(() => {
    live.current = { speed, level }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const gl = canvas.getContext('webgl', { antialias: true, alpha: true })
    if (!gl) return

    const program = gl.createProgram()
    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    if (!program || !vert || !frag) return

    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program))
      return
    }
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uResolution = gl.getUniformLocation(program, 'u_resolution')
    const uTime = gl.getUniformLocation(program, 'u_time')
    gl.uniform3f(gl.getUniformLocation(program, 'u_color'), ...hexToRgb(color))

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const px = Math.round(size * dpr)
    canvas.width = px
    canvas.height = px
    gl.viewport(0, 0, px, px)
    gl.uniform2f(uResolution, px, px)

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let previous = performance.now()
    // The fluid's own clock: it advances at `speed`, so a change of pace never jumps.
    let clock = 0
    let swell = 0

    const render = (now: number) => {
      const { speed: pace, level: loudness } = live.current
      clock += Math.min((now - previous) / 1000, 0.1) * pace
      previous = now
      gl.uniform1f(uTime, reduce ? 0 : clock)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      const target = loudness ? Math.min(Math.max(loudness(), 0), 1) : 0
      swell += (target - swell) * 0.25
      wrap.style.transform = swell > 0.002 ? `scale(${1 + SWELL * swell})` : ''
      if (!reduce) raf = requestAnimationFrame(render)
    }
    render(previous)

    return () => {
      cancelAnimationFrame(raf)
      wrap.style.transform = ''
      gl.deleteProgram(program)
      gl.deleteShader(vert)
      gl.deleteShader(frag)
      gl.deleteBuffer(buffer)
    }
  }, [size, color])

  return (
    <div
      ref={wrapRef}
      data-slot="fluid-orb"
      className={className ? `fluid-orb ${className}` : 'fluid-orb'}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      <canvas ref={canvasRef} />
    </div>
  )
}
