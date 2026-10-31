// ─── Stroke geometry helpers ──────────────────────────────────────────────────
// Thinning a finished stroke, so a day of hatching still fits on a phone.

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
