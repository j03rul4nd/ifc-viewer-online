// ─── Ink: from pen samples to a finished line ─────────────────────────────────
// The same stages drawing software runs, in order:
//
//   device reading → pressure curve → stabilizer → (live preview)
//   finished stroke → thin → corner-aware spline → start and end tapers
//
// The stabilizer averages recent positions with a Gaussian weight, which is what
// Krita's Stabilizer and Clip Studio's Stabilization do in spirit. On lift it
// catches up with the pen, so the line ends where the pen ended. Pure maths.

import { simplifyStroke } from './stroke'

export type PressureCurve = 'soft' | 'normal' | 'firm'

export interface InkSettings {
  curve: PressureCurve
  /** 0 (raw hand) to 10. */
  stabilizer: number
  /** 0 to 1: how long the line takes to reach full weight. */
  entryTaper: number
  /** 0 to 1: how long it takes to thin out at the end. */
  exitTaper: number
}

export const DEFAULT_INK: InkSettings = { curve: 'normal', stabilizer: 3, entryTaper: 0.3, exitTaper: 0.45 }

const GAMMA: Record<PressureCurve, number> = { soft: 0.6, normal: 1, firm: 1.6 }

export const applyPressureCurve = (p: number, curve: PressureCurve): number =>
  Math.pow(Math.min(1, Math.max(0, p)), GAMMA[curve])

/** 0 upright, 1 flat on the glass. Devices report either tilt or altitude, rarely both. */
export function readTilt(e: { altitudeAngle?: number; tiltX?: number; tiltY?: number }): number {
  if (typeof e.altitudeAngle === 'number' && e.altitudeAngle > 0) return Math.min(1, Math.max(0, 1 - e.altitudeAngle / (Math.PI / 2)))
  return Math.min(1, Math.max(Math.abs(e.tiltX ?? 0), Math.abs(e.tiltY ?? 0)) / 90)
}

/**
 * Weight for one sample. A pen that reports pressure uses it. Otherwise (finger,
 * mouse, a tablet driver running as a mouse) speed stands in: slower is heavier,
 * as with a real nib.
 */
export function sampleWeight(
  kind: string, pressure: number, speedPxPerMs: number, curve: PressureCurve, previous: number | null,
): number {
  const raw = kind === 'pen' && pressure > 0 && pressure !== 0.5
    ? applyPressureCurve(pressure, curve)
    : 0.8 - Math.min(1, speedPxPerMs / 3) * 0.45
  // Sensors are noisy, and a jump in weight reads as a lump in the line.
  return previous === null ? raw : previous + (raw - previous) * 0.45
}

export class Stabilizer {
  private readonly xs: number[] = []
  private readonly ys: number[] = []
  private readonly size: number

  constructor(level: number) {
    this.size = 1 + Math.round(Math.max(0, Math.min(10, level))) * 2
  }

  push(x: number, y: number): { x: number; y: number } {
    this.xs.push(x)
    this.ys.push(y)
    if (this.xs.length > this.size) { this.xs.shift(); this.ys.shift() }
    let sx = 0, sy = 0, total = 0
    const n = this.xs.length
    for (let i = 0; i < n; i++) {
      const age = (n - 1 - i) / this.size
      const w = Math.exp(-4 * age * age)
      sx += this.xs[i] * w
      sy += this.ys[i] * w
      total += w
    }
    return { x: sx / total, y: sy / total }
  }
}

const dist = (a: Float32Array, i: number, j: number): number =>
  Math.hypot(a[i * 4] - a[j * 4], a[i * 4 + 1] - a[j * 4 + 1], a[i * 4 + 2] - a[j * 4 + 2])

const CORNER_COS = Math.cos((50 * Math.PI) / 180)

function isCorner(p: Float32Array, i: number, n: number): boolean {
  if (i <= 0 || i >= n - 1) return false
  const ax = p[i * 4] - p[(i - 1) * 4], ay = p[i * 4 + 1] - p[(i - 1) * 4 + 1], az = p[i * 4 + 2] - p[(i - 1) * 4 + 2]
  const bx = p[(i + 1) * 4] - p[i * 4], by = p[(i + 1) * 4 + 1] - p[i * 4 + 1], bz = p[(i + 1) * 4 + 2] - p[i * 4 + 2]
  const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz)
  if (la < 1e-9 || lb < 1e-9) return false
  return (ax * bx + ay * by + az * bz) / (la * lb) < CORNER_COS
}

/**
 * Centripetal Catmull-Rom through the points: no loops or overshoot where spacing
 * is uneven. A sharp corner stays sharp: the curve is cut there, not rounded.
 */
export function smoothPath(p: Float32Array, maxSegment: number): Float32Array {
  const n = p.length / 4
  if (n < 3) return p
  const out: number[] = []
  const at = (i: number) => Math.min(n - 1, Math.max(0, i))
  for (let i = 0; i < n - 1; i++) {
    const i0 = isCorner(p, i, n) ? i : at(i - 1)
    const i1 = i, i2 = i + 1
    const i3 = isCorner(p, i2, n) ? i2 : at(i + 2)
    const len = dist(p, i1, i2)
    const steps = Math.min(16, Math.max(1, Math.ceil(len / maxSegment)))
    const t1 = Math.sqrt(Math.max(dist(p, i0, i1), 1e-6))
    const t2 = t1 + Math.sqrt(Math.max(len, 1e-6))
    const t3 = t2 + Math.sqrt(Math.max(dist(p, i2, i3), 1e-6))
    for (let s = 0; s < steps; s++) {
      const u = s / steps
      const t = t1 + (t2 - t1) * u
      for (let c = 0; c < 3; c++) {
        const P0 = p[i0 * 4 + c], P1 = p[i1 * 4 + c], P2 = p[i2 * 4 + c], P3 = p[i3 * 4 + c]
        // Barry-Goldman evaluation.
        const A1 = (t1 - t) / t1 * P0 + t / t1 * P1
        const A2 = (t2 - t) / (t2 - t1) * P1 + (t - t1) / (t2 - t1) * P2
        const A3 = (t3 - t) / (t3 - t2) * P2 + (t - t2) / (t3 - t2) * P3
        const B1 = (t2 - t) / t2 * A1 + t / t2 * A2
        const B2 = (t3 - t) / (t3 - t1) * A2 + (t - t1) / (t3 - t1) * A3
        out.push((t2 - t) / (t2 - t1) * B1 + (t - t1) / (t2 - t1) * B2)
      }
      out.push(p[i1 * 4 + 3] + (p[i2 * 4 + 3] - p[i1 * 4 + 3]) * u)
    }
  }
  out.push(p[(n - 1) * 4], p[(n - 1) * 4 + 1], p[(n - 1) * 4 + 2], p[(n - 1) * 4 + 3])
  return Float32Array.from(out)
}

const smoothstep = (x: number): number => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t) }

/** Thin both ends over a length, never more than 40 % of a short stroke each. */
export function applyTapers(p: Float32Array, entryLength: number, exitLength: number): Float32Array {
  const n = p.length / 4
  if (n < 2) return p
  const along = new Float32Array(n)
  for (let i = 1; i < n; i++) along[i] = along[i - 1] + dist(p, i - 1, i)
  const total = along[n - 1]
  const entry = Math.min(entryLength, total * 0.4)
  const exit = Math.min(exitLength, total * 0.4)
  const out = p.slice()
  for (let i = 0; i < n; i++) {
    const a = entry > 0 ? 0.12 + 0.88 * smoothstep(along[i] / entry) : 1
    const b = exit > 0 ? 0.08 + 0.92 * smoothstep((total - along[i]) / exit) : 1
    out[i * 4 + 3] *= a * b
  }
  return out
}

/** On screen, at any zoom, a taper covers up to this many pixels at full setting. */
const TAPER_PX = 70
const MAX_SEGMENT_PX = 3

export function finishStroke(samples: Float32Array, worldPerPixel: number, ink: InkSettings, straight: boolean): Float32Array {
  if (samples.length / 4 < 2 || straight) return samples
  const thin = simplifyStroke(samples, worldPerPixel * 0.35)
  const curve = smoothPath(thin, worldPerPixel * MAX_SEGMENT_PX)
  return applyTapers(curve, ink.entryTaper * TAPER_PX * worldPerPixel, ink.exitTaper * TAPER_PX * worldPerPixel)
}

/** A stroke end on screen, and where it is in the scene. */
export interface EndpointCandidate { x: number; y: number; world: readonly [number, number, number] }

/** The endpoint to join, if one is close enough on screen. */
export function findEndpointSnap(x: number, y: number, candidates: readonly EndpointCandidate[], radiusPx: number): EndpointCandidate | null {
  let best: EndpointCandidate | null = null
  let bestDistance = radiusPx
  for (const c of candidates) {
    const d = Math.hypot(c.x - x, c.y - y)
    if (d < bestDistance) { bestDistance = d; best = c }
  }
  return best
}
