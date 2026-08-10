// ─── Mesh importer feature flag ───────────────────────────────────────────────
// Build-time gate (gis-flag / solar-flag / pc-flag pattern). Off = no toolbar
// entry, no panel chunk, no three.js loaders, zero traces in the bundle graph.
//
// Worth gating separately from point clouds even though the two share their
// placement vocabulary: this one pulls GLTFLoader, OBJLoader and MTLLoader, and
// a deployment that only wants scans should not ship them.

/** True when the build enables mesh import (`VITE_FEATURE_MESH=true|1`). */
export function isMeshEnabled(): boolean {
  const v = import.meta.env.VITE_FEATURE_MESH as string | undefined
  return v === 'true' || v === '1'
}
