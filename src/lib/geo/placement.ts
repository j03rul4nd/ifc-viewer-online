// ─── placement ────────────────────────────────────────────────────────────────
// Extraction → GeoPlacement glue (plan T10, §4.5) + per-file persistence (T13).
//
// Anchor-at-centroid: survey origins frequently sit kilometres from the
// building, so the anchor is derived for the MODEL BBOX CENTRE, not the file
// origin — the MapConversion is applied to the centroid's project plan coords
// and the result inverted to WGS84. composeGeoRootTransform (geo-math.ts) then
// lands that lat/lon exactly on the same scene point: one code path for auto
// and manual placement.
//
// Precedence (plan §4.8): a manually saved placement for this exact file
// (keyed by the OPFS cache key) ALWAYS wins over extraction-derived placement.

import { ok, err, type Result } from '../result'
import { createLogger } from '../logger'
import { resolveCrs, gridToWgs84, normalizeEpsgCode, registerCustomProj4 } from './crs'
import { MERCATOR_MAX_LAT } from './geo-math'
import type { GeoPlacement, GeorefExtraction, PersistedPlacement } from './geo-types'

const log = createLogger('GeoPlacement')

const DEG = Math.PI / 180

/** Shape of viewer.getModelBounds() — kept structural to avoid a viewer import. */
export interface ModelBoundsLike {
  center: { x: number; y: number; z: number }
  size: { x: number; y: number; z: number }
}

// ── Extraction → placement ─────────────────────────────────────────────────────

/**
 * Derive the effective GeoPlacement from a worker extraction.
 *
 * Error codes (Error.message, mapped to i18n keys by the UI):
 *   'notGeoreferenced'   — nothing usable in the extraction
 *   'unknownCrs'         — grid coords present but EPSG unresolved → CRS picker
 *   'crsConversionFailed'— proj4 rejected the conversion
 *   'crsOutOfDomain'     — inverse landed outside the CRS's valid area (gate 3)
 *   'outOfRange'         — latitude beyond the mercator-displayable limit
 */
export function placementFromExtraction(
  g: GeorefExtraction,
  bounds: ModelBoundsLike | null,
): Result<GeoPlacement> {
  // Rung 3 — site lat/lon, already WGS84. Position is often coarse → approximate.
  if (g.lat !== null && g.lon !== null) {
    return ok({
      lat: g.lat,
      lon: g.lon,
      rotationDeg: g.rotationDeg,
      heightOffsetM: 0,
      source: 'ifc',
      confidence: g.status === 'found' ? 'high' : 'approximate',
    })
  }

  // Rung 1/2 — grid coordinates + CRS.
  if (g.eastings === null || g.northings === null) return err(new Error('notGeoreferenced'))

  const code = normalizeEpsgCode(g.epsgCode) ?? g.epsgCode
  const def = code ? resolveCrs(code) : null
  if (!def || !def.ok) return err(new Error('unknownCrs'))

  // Anchor at the building (§4.5): apply the MapConversion (rotate γ, scale s,
  // translate E₀ N₀) to the centroid's project plan coords. Scene → project:
  // x_P = scene.x, y_P = −scene.z (the loader's IFC Z-up → three Y-up turn).
  const s = g.scale ?? 1
  const gamma = g.rotationDeg * DEG
  const xP = bounds?.center.x ?? 0
  const yP = bounds ? -bounds.center.z : 0
  const eC = g.eastings + s * (xP * Math.cos(gamma) - yP * Math.sin(gamma))
  const nC = g.northings + s * (xP * Math.sin(gamma) + yP * Math.cos(gamma))

  const conv = gridToWgs84(def.value, eC, nC)
  if (!conv.ok) return err(new Error('crsConversionFailed'))
  if (!conv.value.inDomain) return err(new Error('crsOutOfDomain'))
  if (Math.abs(conv.value.lat) > MERCATOR_MAX_LAT) return err(new Error('outOfRange'))

  return ok({
    lat: conv.value.lat,
    lon: conv.value.lon,
    rotationDeg: g.rotationDeg,
    heightOffsetM: 0,
    source: 'ifc',
    confidence: 'high',
  })
}

// ── Persistence (T13) ───────────────────────────────────────────────────────────

const LS_PREFIX = 'ifc-geo-placement:v1:'

export function savePlacement(cacheKey: string, placement: GeoPlacement, customProj4?: string): void {
  const envelope: PersistedPlacement = {
    v: 1,
    placement,
    ...(customProj4 ? { customProj4 } : {}),
    savedAt: Date.now(),
  }
  try {
    localStorage.setItem(LS_PREFIX + cacheKey, JSON.stringify(envelope))
  } catch (e) {
    log.warn('placement persistence failed:', e)
  }
}

export function loadPlacement(cacheKey: string): PersistedPlacement | null {
  let raw: string | null = null
  try { raw = localStorage.getItem(LS_PREFIX + cacheKey) } catch { return null }
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isPersistedPlacement(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

export function clearPlacement(cacheKey: string): void {
  try { localStorage.removeItem(LS_PREFIX + cacheKey) } catch { /* ignore */ }
}

function isPersistedPlacement(v: unknown): v is PersistedPlacement {
  if (!v || typeof v !== 'object') return false
  const env = v as Partial<PersistedPlacement>
  if (env.v !== 1 || !env.placement || typeof env.placement !== 'object') return false
  const p = env.placement as Partial<GeoPlacement>
  return (
    typeof p.lat === 'number' && Number.isFinite(p.lat) &&
    typeof p.lon === 'number' && Number.isFinite(p.lon) &&
    typeof p.rotationDeg === 'number' && Number.isFinite(p.rotationDeg) &&
    typeof p.heightOffsetM === 'number' && Number.isFinite(p.heightOffsetM) &&
    (p.source === 'ifc' || p.source === 'manual')
  )
}

// ── Orchestration ───────────────────────────────────────────────────────────────

/**
 * Effective placement for a model: saved manual placement (per file) wins;
 * otherwise derive from the extraction. A persisted custom proj4 definition is
 * re-registered first so extraction-derived paths resolve the same CRS the
 * user configured originally.
 */
export function resolvePlacement(
  cacheKey: string | null,
  g: GeorefExtraction | null,
  bounds: ModelBoundsLike | null,
): Result<GeoPlacement> {
  if (cacheKey) {
    const saved = loadPlacement(cacheKey)
    if (saved) {
      if (saved.customProj4 && g?.epsgCode) {
        const reg = registerCustomProj4(g.epsgCode, saved.customProj4)
        if (!reg.ok) log.warn('persisted custom proj4 no longer parses — ignored')
      }
      return ok(saved.placement)
    }
  }
  if (!g) return err(new Error('notGeoreferenced'))
  return placementFromExtraction(g, bounds)
}
