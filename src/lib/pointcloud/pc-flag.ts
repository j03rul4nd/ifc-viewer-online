// ─── Point cloud feature flag ─────────────────────────────────────────────────
// Build-time gate (gis-flag.ts / solar-flag.ts pattern). Off = no toolbar entry,
// no panel chunk, no worker, zero traces in the bundle graph.

/** True when the build enables point clouds (`VITE_FEATURE_POINTCLOUD=true|1`). */
export function isPointCloudEnabled(): boolean {
  const v = import.meta.env.VITE_FEATURE_POINTCLOUD as string | undefined
  return v === 'true' || v === '1'
}
