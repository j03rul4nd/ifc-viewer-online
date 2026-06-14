// ─── georef-ladder ────────────────────────────────────────────────────────────
// PURE classification of extracted georeferencing source data into a
// GeorefExtraction (plan §4.3 ladder + §4.4 sanity gates). No web-ifc imports —
// the worker collects plain data, this module decides what it means, and the
// fixture matrix in georef-ladder.test.ts covers every branch.
//
// Rungs (first match wins):
//   1  IfcMapConversion + IfcProjectedCRS            → found
//   2  ePSet_MapConversion / ePSet_ProjectedCRS      → found
//   3  IfcSite RefLatitude/RefLongitude (+TrueNorth) → partial
//   4  nothing                                       → none

import { compoundAngleToDegrees, rotationFromXAxis, rotationFromTrueNorth, MERCATOR_MAX_LAT } from './geo-math'
import type { GeorefExtraction } from './geo-types'

const RAD_TO_DEG = 180 / Math.PI

// ── Source data shapes (produced by the worker, plain serializable values) ─────

export interface MapConversionSource {
  eastings: number | null
  northings: number | null
  orthogonalHeight: number | null
  xAxisAbscissa: number | null
  xAxisOrdinate: number | null
  scale: number | null
  /** IfcProjectedCRS.Name (or ePSet ProjectedCRS Name), raw string. */
  crsName: string | null
  /** Metres per MapUnit (1 = metres, 0.001 = mm). 1 when unknown. */
  mapUnitScale: number
}

export interface SiteSource {
  /** IfcCompoundPlaneAngleMeasure components, sign-carrying. */
  refLatitude: number[] | null
  refLongitude: number[] | null
  refElevation: number | null
}

export interface GeorefSource {
  /** Rung 1 — real IfcMapConversion. */
  mapConversion: MapConversionSource | null
  /** Rung 2 — ePSet convention (same shape). */
  epsetConversion: MapConversionSource | null
  /** Rung 3 — site coordinates. */
  site: SiteSource | null
  /** TrueNorth direction ratios from the model representation context. */
  trueNorth: { x: number; y: number } | null
}

// ── Gates ───────────────────────────────────────────────────────────────────────

const MAX_HEIGHT_M = 9000
const NULL_ISLAND_DEG = 0.1

// ── Ladder ──────────────────────────────────────────────────────────────────────

export function runGeorefLadder(src: GeorefSource): GeorefExtraction {
  const base: GeorefExtraction = {
    status: 'none', rung: 4, epsgCode: null,
    lat: null, lon: null, heightM: null, rotationDeg: 0,
    eastings: null, northings: null, scale: null,
    raw: {}, reasons: [], largeWcsOffset: false,
  }

  const conversion = src.mapConversion ?? src.epsetConversion
  if (conversion) {
    return classifyConversion(conversion, src.mapConversion ? 1 : 2, base)
  }
  if (src.site && (src.site.refLatitude || src.site.refLongitude)) {
    return classifySite(src.site, src.trueNorth, base)
  }
  return base
}

// ── Rung 1/2 — MapConversion ────────────────────────────────────────────────────

function classifyConversion(
  c: MapConversionSource,
  rung: 1 | 2,
  base: GeorefExtraction,
): GeorefExtraction {
  const out: GeorefExtraction = {
    ...base,
    rung,
    raw: {
      eastings: c.eastings, northings: c.northings,
      orthogonalHeight: c.orthogonalHeight,
      xAxisAbscissa: c.xAxisAbscissa, xAxisOrdinate: c.xAxisOrdinate,
      scale: c.scale, crsName: c.crsName, mapUnitScale: c.mapUnitScale,
    },
  }

  // Gate: coordinates must exist and be finite
  if (!isFiniteNum(c.eastings) || !isFiniteNum(c.northings)) {
    out.status = 'invalid'
    out.reasons.push('invalid.outOfRange')
    return out
  }

  // Gate 5: scale plausibility (Scale converts project lengths to grid lengths)
  const scale = c.scale ?? 1
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1e4) {
    out.status = 'invalid'
    out.reasons.push('invalid.badScale')
    return out
  }
  out.scale = scale

  // Normalize grid coordinates to metres via the declared MapUnit
  const unit = Number.isFinite(c.mapUnitScale) && c.mapUnitScale > 0 ? c.mapUnitScale : 1
  const eastings = c.eastings * unit
  const northings = c.northings * unit

  // Gate 1 variant: (0,0) grid origin — implausible for projected CRS with
  // false eastings (UTM etc.); a common authoring-tool default.
  if (eastings === 0 && northings === 0) {
    out.status = 'invalid'
    out.reasons.push('invalid.nullIsland')
    return out
  }

  out.eastings = eastings
  out.northings = northings

  // Height (advisory — violation drops the value, not the rung).
  // Gate applies AFTER unit normalization: 220 000 mm is a perfectly sane 220 m.
  if (isFiniteNum(c.orthogonalHeight)) {
    const heightM = c.orthogonalHeight * unit
    if (Math.abs(heightM) <= MAX_HEIGHT_M) out.heightM = heightM
    else out.reasons.push('invalid.outOfRange')
  }

  // Gate 4: rotation — normalize; zero vector means "unknown", not an error
  if (isFiniteNum(c.xAxisAbscissa) && isFiniteNum(c.xAxisOrdinate)) {
    const rot = rotationFromXAxis(c.xAxisAbscissa, c.xAxisOrdinate)
    if (rot !== null) out.rotationDeg = rot * RAD_TO_DEG
    else out.reasons.push('invalid.zeroRotationAxis')
  }

  // CRS: parsing happens client-side (crs.ts); the worker only carries the name.
  out.epsgCode = c.crsName?.trim() || null
  if (!out.epsgCode) {
    out.status = 'partial'
    out.reasons.push('invalid.unknownCrs')
    return out
  }

  out.status = 'found'
  return out
}

// ── Rung 3 — IfcSite lat/lon ───────────────────────────────────────────────────

function classifySite(
  site: SiteSource,
  trueNorth: { x: number; y: number } | null,
  base: GeorefExtraction,
): GeorefExtraction {
  const lat = compoundAngleToDegrees(site.refLatitude)
  const lon = compoundAngleToDegrees(site.refLongitude)
  const out: GeorefExtraction = {
    ...base,
    rung: 3,
    raw: {
      refLatitude: site.refLatitude?.join(',') ?? null,
      refLongitude: site.refLongitude?.join(',') ?? null,
      refElevation: site.refElevation,
      trueNorth: trueNorth ? `${trueNorth.x},${trueNorth.y}` : null,
    },
  }

  if (lat === null || lon === null) {
    out.status = 'none'
    out.rung = 4
    return out
  }

  // Gate 1: Null Island (authoring-tool default site)
  if (Math.abs(lat) < NULL_ISLAND_DEG && Math.abs(lon) < NULL_ISLAND_DEG) {
    out.status = 'none'
    out.reasons.push('invalid.nullIsland')
    return out
  }

  // Gate 2: range (mercator-displayable latitudes only)
  if (Math.abs(lat) > MERCATOR_MAX_LAT || Math.abs(lon) > 180) {
    out.status = 'invalid'
    out.reasons.push('invalid.outOfRange')
    return out
  }

  out.lat = lat
  out.lon = lon

  if (isFiniteNum(site.refElevation) && Math.abs(site.refElevation) <= MAX_HEIGHT_M) {
    out.heightM = site.refElevation
  }

  if (trueNorth) {
    const rot = rotationFromTrueNorth(trueNorth.x, trueNorth.y)
    if (rot !== null) out.rotationDeg = rot * RAD_TO_DEG
  }

  out.status = 'partial'
  return out
}

function isFiniteNum(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}
