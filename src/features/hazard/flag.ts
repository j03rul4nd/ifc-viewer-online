// ─── slope-hazard feature flag ───────────────────────────────────────────────
// Build-time gate (flood/flag.ts pattern). The study lives inside the flood
// panel, so it also needs the flood flag. Off = no section, no chunk.

import { isFloodEnabled } from '../flood/flag'

/** True when the build enables the rain-triggered slope hazard (`VITE_FEATURE_HAZARD=true|1`). */
export function isHazardEnabled(): boolean {
  const v = import.meta.env.VITE_FEATURE_HAZARD as string | undefined
  return isFloodEnabled() && (v === 'true' || v === '1')
}
