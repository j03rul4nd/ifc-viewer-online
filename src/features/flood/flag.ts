// ─── Flood feature flag ───────────────────────────────────────────────────────
// Build-time gate for the rain-flood simulation (solar-flag.ts pattern). Off =
// no tool, no flood chunk, zero traces.

/** True when the build enables the flood simulation (`VITE_FEATURE_FLOOD=true|1`). */
export function isFloodEnabled(): boolean {
  const v = import.meta.env.VITE_FEATURE_FLOOD as string | undefined
  return v === 'true' || v === '1'
}
