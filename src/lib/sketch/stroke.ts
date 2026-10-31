// ─── Turning pen samples into a stroke ────────────────────────────────────────
// Two jobs: steady the hand while it moves without adding lag at speed (a One
// Euro filter, which smooths slow movement and follows fast movement), and
// thin the finished stroke so a day of hatching still fits on a phone.

export class OneEuro {
  private x: number | null = null
  private dx = 0
  private t = 0

  constructor(private readonly minCutoff = 1.4, private readonly beta = 0.012, private readonly dCutoff = 1) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }

  filter(value: number, timeMs: number): number {
    if (this.x === null) {
      this.x = value
      this.t = timeMs
      return value
    }
    // Coalesced samples can share a timestamp; never divide by zero.
    const dt = Math.max((timeMs - this.t) / 1000, 1 / 1000)
    this.t = timeMs
    const dx = (value - this.x) / dt
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (dx - this.dx)
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx)
    this.x += OneEuro.alpha(cutoff, dt) * (value - this.x)
    return this.x
  }
}

/** A finger or mouse reports no pressure: give it a line with a little taper instead. */
export function resolvePressure(pointerType: string, pressure: number, sampleIndex: number): number {
  if (pointerType === 'pen' && pressure > 0) return Math.min(1, Math.max(0.05, pressure))
  return Math.min(0.75, 0.35 + sampleIndex * 0.08)
}

const POINT = 4

function distanceToSegment(p: Float32Array, i: number, a: number, b: number): number {
  const ax = p[a * POINT], ay = p[a * POINT + 1], az = p[a * POINT + 2]
  const dx = p[b * POINT] - ax, dy = p[b * POINT + 1] - ay, dz = p[b * POINT + 2] - az
  const px = p[i * POINT] - ax, py = p[i * POINT + 1] - ay, pz = p[i * POINT + 2] - az
  const len2 = dx * dx + dy * dy + dz * dz
  const t = len2 > 0 ? Math.min(1, Math.max(0, (px * dx + py * dy + pz * dz) / len2)) : 0
  return Math.hypot(px - t * dx, py - t * dy, pz - t * dz)
}

/**
 * Douglas-Peucker in 3D that also keeps a point where pressure changes by more
 * than `pressureTolerance`, so a long straight line keeps its taper.
 */
export function simplifyStroke(points: Float32Array, tolerance: number, pressureTolerance = 0.08): Float32Array {
  const n = points.length / POINT
  if (n <= 2) return points
  const keep = new Uint8Array(n)
  keep[0] = keep[n - 1] = 1
  const stack: [number, number][] = [[0, n - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let split = -1
    let worst = tolerance
    for (let i = a + 1; i < b; i++) {
      const d = distanceToSegment(points, i, a, b)
      if (d > worst) { worst = d; split = i }
    }
    if (split < 0) {
      const pa = points[a * POINT + 3], pb = points[b * POINT + 3]
      let worstPressure = pressureTolerance
      for (let i = a + 1; i < b; i++) {
        const t = (i - a) / (b - a)
        const d = Math.abs(points[i * POINT + 3] - (pa + (pb - pa) * t))
        if (d > worstPressure) { worstPressure = d; split = i }
      }
    }
    if (split >= 0) {
      keep[split] = 1
      stack.push([a, split], [split, b])
    }
  }
  let count = 0
  for (let i = 0; i < n; i++) count += keep[i]
  const out = new Float32Array(count * POINT)
  let w = 0
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue
    out.set(points.subarray(i * POINT, i * POINT + POINT), w)
    w += POINT
  }
  return out
}

export const pointCount = (points: Float32Array): number => points.length / POINT

/** The stroke point nearest a world position, with its distance. */
export function nearestPoint(points: Float32Array, x: number, y: number, z: number): { index: number; distance: number } {
  let index = -1
  let best = Infinity
  for (let i = 0; i < points.length; i += POINT) {
    const d = Math.hypot(points[i] - x, points[i + 1] - y, points[i + 2] - z)
    if (d < best) { best = d; index = i / POINT }
  }
  return { index, distance: best }
}
