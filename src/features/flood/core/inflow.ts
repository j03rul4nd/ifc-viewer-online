// ─── inflow ───────────────────────────────────────────────────────────────────
// Water that enters the grid from outside it: a river or a stream crossing its
// edge, a riera in spate, a culvert that overflows. A discharge in m³/s per
// interval — the same intervals as the rain, so no time step straddles a
// change of either and the volume that has entered by time t is exact — spread
// over a few cells by weights that sum to 1 (grid.inflow).
//
// A source is a discharge, not a depth: the solver adds Q·w/Δx² of depth per
// second to each weighted cell and lets the water find its own way from there.

/** A triangular flood wave: rises to `peakM3s` at `peakAt` (0..1 of the duration), then falls to zero. */
export interface Hydrograph {
  peakM3s: number
  durationMin: number
  peakAt: number
}

/**
 * The hydrograph as a discharge per interval of `ivMs` (the rain's), each
 * interval holding the exact mean of the triangle over it — so the volume is
 * peak · duration / 2 whatever the interval.
 */
export function inflowSeries(h: Hydrograph, ivMs: number): Float32Array {
  const durMs = Math.max(0, h.durationMin) * 60_000
  if (!(h.peakM3s > 0) || durMs <= 0 || ivMs <= 0) return new Float32Array(0)
  const n = Math.max(1, Math.ceil(durMs / ivMs - 1e-9))
  const T = durMs
  const tp = Math.min(0.999, Math.max(0.001, h.peakAt)) * T
  const f = (t: number): number => (t <= 0 || t >= T ? 0 : t <= tp ? t / tp : (T - t) / (T - tp))
  // ∫ f over [a, b], piecewise linear with a kink at tp.
  const integ = (a: number, b: number): number => {
    a = Math.max(0, Math.min(T, a))
    b = Math.max(0, Math.min(T, b))
    if (b <= a) return 0
    if (b <= tp || a >= tp) return ((f(a) + f(b)) / 2) * (b - a)
    return ((f(a) + 1) / 2) * (tp - a) + ((1 + f(b)) / 2) * (b - tp)
  }
  const out = new Float32Array(n)
  for (let k = 0; k < n; k++) out[k] = (h.peakM3s * integ(k * ivMs, (k + 1) * ivMs)) / ivMs
  return out
}

/**
 * The share of a discharge the cells really receive: Σ of the weights as the
 * solver holds them (float32), times `scale` (Δx² when they hold w / Δx²).
 * ≈ 1; multiplying the entered volume by it is what keeps the mass balance
 * exact, as the rain's effective area does for rain.
 */
export function inflowShare(weights: ArrayLike<number> | undefined, scale = 1): number {
  if (!weights) return 0
  let s = 0
  for (let c = 0; c < weights.length; c++) s += weights[c]
  return s * scale
}

/** Volume of a hydrograph, m³ (peak · duration / 2). */
export const hydrographVolume = (h: Hydrograph): number => (Math.max(0, h.peakM3s) * Math.max(0, h.durationMin) * 60) / 2

/**
 * Volume that has entered by tMs, m³, from the float32 discharges the solvers
 * hold — exactly what they added, since no step straddles an interval.
 */
export function volumeFromFlows(flows: ArrayLike<number>, ivMs: number, tMs: number): number {
  let v = 0
  const full = Math.min(flows.length, Math.floor(tMs / ivMs))
  for (let k = 0; k < full; k++) v += flows[k] * ivMs
  if (full < flows.length) v += flows[full] * (tMs - full * ivMs)
  return v / 1000
}
