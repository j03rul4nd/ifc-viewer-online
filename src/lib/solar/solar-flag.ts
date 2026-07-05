// ─── Solar feature flag ───────────────────────────────────────────────────────
// Build-time gate for the Sun & Moon study (gis-flag.ts pattern). Off = no
// toolbar button, no solar chunk, zero traces.

/** True when the build enables the Sun & Moon study (`VITE_FEATURE_SOLAR=true|1`). */
export function isSolarEnabled(): boolean {
  const v = import.meta.env.VITE_FEATURE_SOLAR as string | undefined
  return v === 'true' || v === '1'
}
