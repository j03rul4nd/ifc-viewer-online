// ─── terrain-look ─────────────────────────────────────────────────────────────
// Defaults + validation for the advanced terrain look, deliberately split OUT
// of terrain-sampling.ts.
//
// Why its own file: geoStore is part of the EAGER bundle (it holds map intent
// for every user, including those who never open the map), while all the
// terrain maths — bicubic resampling, detail synthesis, sky-view factor — must
// stay in the lazy geo chunks. Putting the defaults here keeps the store's
// import graph to a few hundred bytes instead of pulling the whole sampling
// module into the entry chunk. Verified by the chunk sizes in `npm run build`.

import type { TerrainLook } from './geo-types'

/**
 * Shipped terrain look. `detail: 0` and `contourInterval: 0` are deliberate:
 * out of the box the terrain shows measured data only, and every synthetic or
 * cartographic addition is something the user switches on knowingly.
 */
export const DEFAULT_TERRAIN_LOOK: TerrainLook = {
  sunAzimuth: 315,
  sunAltitude: 45,
  softness: 0.5,
  occlusion: 0.5,
  detail: 0,
  contourInterval: 0,
}

/** Contour intervals offered in the UI (metres); 0 = off. */
export const CONTOUR_INTERVALS = [0, 5, 10, 25, 50, 100] as const

/** Clamp an arbitrary (persisted, SDK-supplied) look into valid ranges. */
export function clampTerrainLook(look: Partial<TerrainLook> | null | undefined): TerrainLook {
  const d = DEFAULT_TERRAIN_LOOK
  if (!look) return { ...d }
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback
  const unit = (v: unknown, fallback: number): number =>
    Math.min(1, Math.max(0, num(v, fallback)))
  return {
    // Azimuth wraps rather than clamps — 350° and −10° are the same light.
    sunAzimuth: ((num(look.sunAzimuth, d.sunAzimuth) % 360) + 360) % 360,
    sunAltitude: Math.min(90, Math.max(5, num(look.sunAltitude, d.sunAltitude))),
    softness: unit(look.softness, d.softness),
    occlusion: unit(look.occlusion, d.occlusion),
    detail: unit(look.detail, d.detail),
    contourInterval: Math.min(500, Math.max(0, num(look.contourInterval, d.contourInterval))),
  }
}
