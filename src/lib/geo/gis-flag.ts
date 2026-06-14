// ─── GIS feature flag ─────────────────────────────────────────────────────────
// Build-time gate for the optional Map mode (plan §1.3). When the flag is off
// the GIS chunk never loads, the toolbar button is hidden, and no geo work runs
// at load time. Kept in its own module so UI components can import the check
// without pulling any worker/engine code into their chunk.

/** True when the build enables GIS / Map mode (`VITE_FEATURE_GIS=true|1`). */
export function isGisEnabled(): boolean {
  const v = import.meta.env.VITE_FEATURE_GIS as string | undefined
  return v === 'true' || v === '1'
}
