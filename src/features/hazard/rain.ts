// ─── rain steps of a hazard sweep ────────────────────────────────────────────
// The storm of the flood panel, as cumulative rain at the end of each of its
// intervals, then — so every element gets a critical value even when this
// storm does not reach it — a ladder beyond the storm's total up to `maxMm`.
// `stormSteps` says where the real storm ends, for the timeline.

import { depthUpToMs, intervalMs, type Hyetograph } from '../flood/core/hyetograph'

export interface RainSteps {
  cumRainMm: number[]
  /** Minutes from the start of the rain at each storm step; null beyond the storm. */
  minutes: Array<number | null>
  stormSteps: number
}

/** depthUpToMs is in metres. */
const mm = (m: number): number => Math.round(m * 1e5) / 100

export function hazardRainSteps(h: Hyetograph, maxMm: number, ladderMm: number, maxSteps = 60): RainSteps {
  const iv = intervalMs(h)
  const cum: number[] = []
  const minutes: Array<number | null> = []
  // At most ~maxSteps/2 storm frames: merge intervals of a long storm.
  const every = Math.max(1, Math.ceil(h.intensityMmH.length / Math.floor(maxSteps / 2)))
  for (let k = every; k <= h.intensityMmH.length; k += every) {
    cum.push(mm(depthUpToMs(h, k * iv)))
    minutes.push((k * iv) / 60000)
  }
  if (h.intensityMmH.length % every) {
    cum.push(mm(depthUpToMs(h, h.intensityMmH.length * iv)))
    minutes.push((h.intensityMmH.length * iv) / 60000)
  }
  const stormSteps = cum.length
  const total = cum[cum.length - 1] ?? 0
  const step = Math.max(ladderMm, (maxMm - total) / Math.max(1, maxSteps - stormSteps))
  for (let p = Math.ceil((total + 1e-9) / step) * step; p <= maxMm + 1e-9; p += step) {
    if (p <= total + 1e-6) continue
    cum.push(Math.round(p * 10) / 10)
    minutes.push(null)
  }
  return { cumRainMm: cum, minutes, stormSteps }
}
