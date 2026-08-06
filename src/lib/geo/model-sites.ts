// ─── model-sites ──────────────────────────────────────────────────────────────
// Multi-model georeferencing: turning "several IFCs are loaded" into something
// the map can honestly show. Pure — no React, no Leaflet, no Three.
//
// The problem this solves. Map mode has exactly ONE placement, because the
// basemap is aligned to the scene and the scene has one origin. But a federated
// project is several files, each with its own (or no) georeferencing, and they
// do not always agree. Three cases, three honest answers:
//
//   1. One model georeferenced, others not → place by that model. The others
//      are drawn where the scene puts them, which is right if they share a
//      project origin (the normal federated case) and wrong if they do not —
//      so we always name which model the map is anchored to.
//   2. Several georeferenced and CLOSE together → agreement. Anchor on the
//      active model; the rest are context pins.
//   3. Several georeferenced and FAR APART → the files disagree. This is a real
//      and common data error (a file left at 0,0, or in the wrong CRS). We do
//      NOT average them, we do NOT silently pick one: we place the anchor and
//      say plainly that the others are far away, because a map that quietly
//      shows one of two contradictory truths is worse than no map.
//
// Averaging was rejected outright: the centroid of a correct site and a bogus
// one is a location where nothing exists.

import type { GeorefExtraction, GeoPlacement } from './geo-types'

/** Distance beyond which loaded models are treated as contradicting each other. */
export const FAR_APART_THRESHOLD_M = 10_000

export interface ModelSite {
  modelId: string
  /** Display name (file name) — for pins and lists. */
  label: string
  /** Null when the model carries no usable georeferencing. */
  lat: number | null
  lon: number | null
  /** True for the model the map placement is anchored to. */
  anchor: boolean
}

export interface MultiModelSites {
  sites: ModelSite[]
  /** Sites with real coordinates, in `sites` order. */
  located: ModelSite[]
  /** Loaded models with no usable georeferencing. */
  missing: ModelSite[]
  /** Greatest pairwise distance between located sites, metres (0 for <2). */
  spreadM: number
  /** True when the located models contradict each other (see header). */
  farApart: boolean
}

/**
 * Great-circle distance in metres (haversine). Accurate enough for a
 * "do these files agree?" test at any scale we care about.
 */
export function distanceM(
  aLat: number, aLon: number, bLat: number, bLon: number,
): number {
  const R = 6_371_008.8 // IUGG mean Earth radius
  const toRad = Math.PI / 180
  const dLat = (bLat - aLat) * toRad
  const dLon = (bLon - aLon) * toRad
  const lat1 = aLat * toRad
  const lat2 = bLat * toRad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export interface ModelInput {
  modelId: string
  label: string
  /** Extraction result for this model, if one has been run. */
  extraction: GeorefExtraction | null | undefined
  /**
   * Placement resolved for this model, when the caller could compute one
   * (it needs model bounds and CRS, which live outside this module).
   */
  placement: GeoPlacement | null
}

/**
 * Build the multi-model site picture.
 *
 * `anchorModelId` is normally the active model — the one map mode aligned to.
 * A model counts as located when the caller resolved a placement for it, or
 * when its extraction carries a direct lat/lon (rung 3, no CRS maths needed).
 */
export function collectModelSites(
  models: ReadonlyArray<ModelInput>,
  anchorModelId: string | null,
): MultiModelSites {
  const sites: ModelSite[] = models.map((m) => {
    // Prefer a fully resolved placement; fall back to a direct site lat/lon.
    const lat = m.placement?.lat ?? m.extraction?.lat ?? null
    const lon = m.placement?.lon ?? m.extraction?.lon ?? null
    const usable = lat !== null && lon !== null && Number.isFinite(lat) && Number.isFinite(lon)
    return {
      modelId: m.modelId,
      label: m.label,
      lat: usable ? lat : null,
      lon: usable ? lon : null,
      anchor: m.modelId === anchorModelId,
    }
  })

  const located = sites.filter((s) => s.lat !== null && s.lon !== null)
  const missing = sites.filter((s) => s.lat === null || s.lon === null)

  let spreadM = 0
  for (let i = 0; i < located.length; i++) {
    for (let j = i + 1; j < located.length; j++) {
      const d = distanceM(located[i].lat!, located[i].lon!, located[j].lat!, located[j].lon!)
      if (d > spreadM) spreadM = d
    }
  }

  return {
    sites,
    located,
    missing,
    spreadM,
    farApart: spreadM > FAR_APART_THRESHOLD_M,
  }
}
