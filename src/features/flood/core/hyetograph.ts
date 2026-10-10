// ─── hyetograph ───────────────────────────────────────────────────────────────
// Rainfall as a step function: a constant intensity per interval of equal
// length, and no rain after the last interval. Every solver reads it the same
// way — intervals are whole milliseconds and no time step ever straddles an
// interval boundary, so the depth that has fallen by time t is exact and the
// mass balance can be computed from the clock alone.

export interface Hyetograph {
  /** Length of each interval, seconds (whole milliseconds). */
  intervalS: number
  /** Intensity per interval, mm/h. */
  intensityMmH: number[]
}

const MM_H_TO_M_S = 1 / 3_600_000

export const intervalMs = (h: Hyetograph): number => Math.max(1, Math.round(h.intervalS * 1000))

/** Duration of the rain, seconds. */
export const rainDurationS = (h: Hyetograph): number => (intervalMs(h) * h.intensityMmH.length) / 1000

/** Total rain depth, mm. */
export function totalDepthMm(h: Hyetograph): number {
  let s = 0
  for (const i of h.intensityMmH) s += i
  return (s * intervalMs(h)) / 3_600_000
}

/** Intensities in m/s, the unit the solvers use. */
export const ratesMs = (h: Hyetograph): Float32Array =>
  Float32Array.from(h.intensityMmH, (i) => Math.max(0, i) * MM_H_TO_M_S)

/** Intensity at time t (ms), m/s. */
export function rateAtMs(h: Hyetograph, tMs: number): number {
  const idx = Math.floor(tMs / intervalMs(h))
  if (idx < 0 || idx >= h.intensityMmH.length) return 0
  return Math.max(0, h.intensityMmH[idx]) * MM_H_TO_M_S
}

/** Rain depth fallen between 0 and t (ms), metres — exact for the step function. */
export function depthUpToMs(h: Hyetograph, tMs: number): number {
  const iv = intervalMs(h)
  let d = 0
  const full = Math.min(h.intensityMmH.length, Math.floor(tMs / iv))
  for (let k = 0; k < full; k++) d += Math.max(0, h.intensityMmH[k]) * iv
  if (full < h.intensityMmH.length) d += Math.max(0, h.intensityMmH[full]) * (tMs - full * iv)
  return (d / 1000) * MM_H_TO_M_S
}

/**
 * Rain depth fallen by tMs (metres) from the float32 rates the solvers hold —
 * exactly what they added, since no step straddles an interval.
 */
export function depthFromRates(rates: Float32Array, ivMs: number, tMs: number): number {
  let d = 0
  const full = Math.min(rates.length, Math.floor(tMs / ivMs))
  for (let k = 0; k < full; k++) d += rates[k] * ivMs
  if (full < rates.length) d += rates[full] * (tMs - full * ivMs)
  return d / 1000
}

// ── Storm shapes ─────────────────────────────────────────────────────────────

/** Constant intensity for a duration. */
export function constantStorm(mmH: number, durationMin: number, intervalMin = 5): Hyetograph {
  const n = Math.max(1, Math.round(durationMin / intervalMin))
  return { intervalS: intervalMin * 60, intensityMmH: new Array(n).fill(mmH) }
}

/**
 * Triangular storm: the intensity rises linearly to `peakMmH` at `peakAt`
 * (0..1 of the duration) and falls back to zero. Each interval holds the mean
 * of the triangle over it, so the total depth is exactly peak · duration / 2.
 */
export function triangularStorm(peakMmH: number, durationMin: number, peakAt = 0.4, intervalMin = 5): Hyetograph {
  const n = Math.max(1, Math.round(durationMin / intervalMin))
  const tp = Math.min(0.999, Math.max(0.001, peakAt)) * n
  const f = (x: number): number => (x <= tp ? x / tp : (n - x) / (n - tp))
  // Exact mean over [k, k+1] of a piecewise-linear function: integrate both halves.
  const integ = (a: number, b: number): number => {
    if (b <= tp || a >= tp) return ((f(a) + f(b)) / 2) * (b - a)
    return ((f(a) + 1) / 2) * (tp - a) + ((1 + f(b)) / 2) * (b - tp)
  }
  const out: number[] = []
  for (let k = 0; k < n; k++) out.push(peakMmH * integ(k, k + 1))
  return { intervalS: intervalMin * 60, intensityMmH: out }
}

/**
 * Alternating-block storm from an IDF curve i(d) = a / (d + b)^c (i in mm/h,
 * d in minutes): the block of each duration holds exactly the depth the curve
 * gives for it, the largest block sits at `peakAt` and the rest alternate
 * around it. The standard design storm when a local IDF curve is known.
 */
export function alternatingBlockStorm(
  idf: { a: number; b: number; c: number },
  durationMin: number,
  intervalMin = 5,
  peakAt = 0.5,
): Hyetograph {
  const n = Math.max(1, Math.round(durationMin / intervalMin))
  const depth = (dMin: number): number => (idf.a / Math.pow(dMin + idf.b, idf.c)) * (dMin / 60) // mm
  const blocks: number[] = []
  for (let k = 1; k <= n; k++) blocks.push(depth(k * intervalMin) - depth((k - 1) * intervalMin))
  blocks.sort((x, y) => y - x)
  const slots = new Array<number>(n).fill(0)
  const peak = Math.min(n - 1, Math.max(0, Math.round(peakAt * (n - 1))))
  let left = peak - 1
  let right = peak + 1
  slots[peak] = blocks[0]
  for (let k = 1; k < n; k++) {
    // Alternate right/left; when one side runs out, keep filling the other.
    const goRight = (k % 2 === 1 && right < n) || left < 0
    if (goRight) slots[right++] = blocks[k]
    else slots[left--] = blocks[k]
  }
  return { intervalS: intervalMin * 60, intensityMmH: slots.map((mm) => (mm * 60) / intervalMin) }
}
