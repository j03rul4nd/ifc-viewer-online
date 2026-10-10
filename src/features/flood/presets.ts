// ─── storm presets ────────────────────────────────────────────────────────────
// Starting points, each stated by its own numbers (total depth, duration,
// peak) — not a return period for a place, which only that place's IDF curve
// can give. The hyetograph editor (phase 3) takes over from here.

import { triangularStorm, totalDepthMm, type Hyetograph } from './core/hyetograph'
import type { StormPreset } from './store'

const PRESETS: Record<StormPreset, { peakMmH: number; minutes: number; peakAt: number }> = {
  shower: { peakMmH: 40, minutes: 30, peakAt: 0.4 },
  storm: { peakMmH: 80, minutes: 60, peakAt: 0.35 },
  intense: { peakMmH: 160, minutes: 45, peakAt: 0.3 },
  extreme: { peakMmH: 120, minutes: 120, peakAt: 0.4 },
}

export const STORM_PRESETS = Object.keys(PRESETS) as StormPreset[]

export function stormHyetograph(p: StormPreset): Hyetograph {
  const s = PRESETS[p]
  return triangularStorm(s.peakMmH, s.minutes, s.peakAt, 5)
}

export function stormFacts(p: StormPreset): { depthMm: number; minutes: number; peakMmH: number } {
  const s = PRESETS[p]
  return { depthMm: Math.round(totalDepthMm(stormHyetograph(p))), minutes: s.minutes, peakMmH: s.peakMmH }
}
