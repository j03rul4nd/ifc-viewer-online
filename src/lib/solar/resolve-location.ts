// ─── resolve-location ─────────────────────────────────────────────────────────
// Where the sun and climate studies stand. One ladder, shared by the Sun & Moon
// panel (its Start button, the `?solar=` deep link, the SDK bridge, "Open
// analysis") and by the solar analysis's own `?analysis=` deep link, so the
// two never disagree about where a building is.
//
// The ladder (plan D3 — it reuses the GIS stack):
//   0. a `?site=lat,lon` in the link: "this building, in that climate". It
//      moves the SOLAR location only — never the map, whose OpenStreetMap
//      context would be some other city's — and keeps the model's own north,
//      so the façades still face the way they were drawn;
//   1. the map placement (geoStore), when map mode has already placed it;
//   2. resolvePlacement: a GIS placement saved for the file, else the IFC's
//      own georeference (IfcMapConversion, or IfcSite lat/lon alone);
//   3. a manual location saved for the file from the panel's form.
//
// It never falls back to a default city. What "nowhere" means is the caller's
// call: the panel shows its blocking notice, a deep link does nothing.

import { useSolarStore, loadManualLocation, type SolarLocation } from '../../stores/solarStore'
import { useGeoStore } from '../../stores/geoStore'
import { useSceneStore } from '../../stores/sceneStore'
import { modelRegistry } from '../model-registry'
import { ensureGeorefExtracted } from '../geo/geo-extract-runner'
import { resolvePlacement } from '../geo/placement'
import { parseAppUrlParams, type SiteOverride } from '../url-params'
import { timezoneFor } from './sun-math'
import type { ViewerAPI } from '../viewer'

/** All the ladder needs from the viewer: the model's box, to anchor a placement. */
export type LocationViewer = Pick<ViewerAPI, 'getModelBounds'>

/**
 * Rungs 1–3: where the model itself says it is (or the visitor said it is, on
 * this browser). Null when nothing knows.
 */
export async function modelSolarLocation(
  viewer: LocationViewer | null,
  modelId: string | null,
): Promise<SolarLocation | null> {
  const cacheKey = modelId ? modelRegistry.get(modelId)?.opfsCacheKey ?? null : null
  const geoPlacement = useGeoStore.getState().placement
  if (geoPlacement) {
    const fromIfc = geoPlacement.source === 'ifc'
    return {
      lat: geoPlacement.lat, lon: geoPlacement.lon, yawDeg: geoPlacement.rotationDeg,
      source: fromIfc ? 'ifc' : 'map',
      northSource: fromIfc ? 'ifc' : 'assumed',
    }
  }
  if (modelId && viewer) {
    const g = await ensureGeorefExtracted(modelId)
    const bounds = viewer.getModelBounds(modelId)
    const r = resolvePlacement(cacheKey, g, bounds)
    if (r.ok) {
      const fromIfc = r.value.source === 'ifc'
      return {
        lat: r.value.lat, lon: r.value.lon, yawDeg: r.value.rotationDeg,
        source: fromIfc ? 'ifc' : 'map',
        northSource: fromIfc ? 'ifc' : 'assumed',
      }
    }
  }
  if (cacheKey) {
    const m = loadManualLocation(cacheKey)
    if (m) return { lat: m.lat, lon: m.lon, yawDeg: 0, source: 'manual', northSource: 'assumed' }
  }
  return null
}

/**
 * Rung 0, the pure part: the link's place with the model's own north. A model
 * that resolved nowhere keeps the panel's usual assumption (project north is
 * true north), and says so.
 */
export function withSiteOverride(site: SiteOverride, own: SolarLocation | null): SolarLocation {
  return {
    lat: site.lat,
    lon: site.lon,
    yawDeg: own?.yawDeg ?? 0,
    source: 'manual',
    northSource: own?.northSource === 'ifc' ? 'ifc' : 'assumed',
  }
}

/**
 * The whole ladder. `site` defaults to the live link's `?site=` (scene
 * parameters merged), read at call time so a scene that brought one counts.
 */
export async function resolveSolarLocation(
  viewer: LocationViewer | null,
  modelId: string | null,
  site: SiteOverride | undefined = parseAppUrlParams().site,
): Promise<SolarLocation | null> {
  const own = await modelSolarLocation(viewer, modelId)
  return site ? withSiteOverride(site, own) : own
}

/**
 * Set the study location AND its time zone. They travel together: the store's
 * zone starts at UTC, and a period cut at UTC midnight is the wrong day for
 * anything west of Greenwich. A zone the visitor picked by hand stays.
 */
export function applySolarLocation(loc: SolarLocation): void {
  const s = useSolarStore.getState()
  s.setLocation(loc)
  if (!s.tzOverridden) s.setTimeZone(timezoneFor(loc.lat, loc.lon), false)
}

/**
 * The study location, resolving it for the active model when nothing has set
 * one yet — what a deep link calls before it runs anything. Null when the
 * model is nowhere (no link site, no georeference, nothing saved).
 */
export async function ensureSolarLocation(viewer: LocationViewer | null): Promise<SolarLocation | null> {
  const current = useSolarStore.getState().location
  if (current) return current
  const loc = await resolveSolarLocation(viewer, useSceneStore.getState().activeModelId)
  // Something else may have placed the study while the georeference was read
  // (the visitor, the Sun & Moon deep link): theirs stands.
  const meanwhile = useSolarStore.getState().location
  if (meanwhile) return meanwhile
  if (!loc) return null
  applySolarLocation(loc)
  return loc
}
