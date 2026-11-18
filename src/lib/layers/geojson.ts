// ─── geojson ──────────────────────────────────────────────────────────────────
// GeoJSON (RFC 7946, plus the pre-2016 `crs` member real servers still emit)
// → a normalized vector layer in WGS84, ready to project into the scene through
// a SceneAnchor (geo/scene-anchor.ts).
//
// It is the common currency for every vector connector: a file the user drops,
// a REST endpoint, a WFS GetFeature with outputFormat=application/json — all of
// them end up here, so heights, CRS handling and the honesty rules live once.
//
// Rules, same as the rest of the geo stack:
//   • NEVER guess a CRS silently. Projected coordinates with no `crs` member are
//     an error the UI turns into a CRS picker, not a layer drawn in the ocean.
//   • Heights are labelled by where they came from: the coordinate's third
//     value, a property (height / ele / altura…), or none. Whether a value is
//     ABSOLUTE (above the datum) or RELATIVE (above ground) is the caller's
//     choice, defaulted from the source and shown to the user.
//
// Pure module: proj4 (through crs.ts) and plain math only — no three.js.

import { ok, err, type Result } from '../result'
import { normalizeEpsgCode, resolveCrs, gridToWgs84 } from '../geo/crs'
import { lonLatToScene, type SceneAnchor, type ScenePoint } from '../geo/scene-anchor'

// ── Normalized model ───────────────────────────────────────────────────────────

/** [lon, lat] or [lon, lat, z] in WGS84 degrees / metres. */
export type LonLatZ = [number, number] | [number, number, number]

export type VectorGeometry =
  | { type: 'point'; coords: LonLatZ[] }            // Point and MultiPoint
  | { type: 'line'; parts: LonLatZ[][] }            // LineString and MultiLineString
  | { type: 'polygon'; polygons: LonLatZ[][][] }    // Polygon and MultiPolygon: [outer, ...holes]

export type VectorProps = Record<string, unknown>

export interface VectorFeature {
  /** Feature.id, or a stable index-based one. */
  id: string
  geometry: VectorGeometry
  properties: VectorProps
}

export type HeightSource = 'coordinates' | 'property' | 'none'

export interface VectorLayerData {
  features: VectorFeature[]
  /** [west, south, east, north] in WGS84. Null for an empty layer. */
  bbox: [number, number, number, number] | null
  /** The CRS the source declared (normalized), or 'CRS84' for plain RFC 7946. */
  sourceCrs: string
  counts: { point: number; line: number; polygon: number }
  /** Features skipped: null geometry, unsupported type, non-finite coordinates. */
  skipped: number
  /** Where heights can come from in this data. */
  heightSource: HeightSource
  /** The property that looks like a height/extrusion (also set when z exists — polygons extrude by it). */
  heightProperty: string | null
  /** Every property key seen, for styling / labelling pickers. */
  propertyKeys: string[]
}

export type GeoJsonErrorCode =
  | 'notJson'
  | 'notGeoJson'
  | 'unknownCrs'           // declared a CRS this build cannot resolve → CRS picker
  | 'projectedWithoutCrs'  // coordinates are clearly metres but no CRS declared
  | 'empty'

export interface ParseOptions {
  /**
   * Force the source CRS (user picked it, or the connector knows it: a WFS
   * request made with srsName). Overrides the file's own `crs` member.
   */
  crs?: string | null
  /**
   * Some servers answer EPSG:4326 in the authority's lat,lon order (WFS 1.1+ /
   * 2.0 with a URN srsName). 'auto' swaps when every point only makes sense
   * swapped.
   */
  axisOrder?: 'lonlat' | 'latlon' | 'auto'
}

// ── Parsing ────────────────────────────────────────────────────────────────────

/** Property names that mean "how tall", in the order they are preferred. */
const HEIGHT_KEYS = [
  'height', 'Height', 'HEIGHT', 'altura', 'Altura', 'ALTURA', 'hoehe', 'Hoehe', 'hauteur',
  'building:height', 'render_height', 'h', 'z', 'Z', 'ele', 'elevation', 'elev', 'cota', 'COTA',
]

const WGS84_CODES = new Set(['EPSG:4326', 'EPSG:4258', 'EPSG:4979', 'EPSG:4937'])

/** Parse a GeoJSON string or already-parsed object. Never throws. */
export function parseGeoJson(input: string | unknown, opts: ParseOptions = {}): Result<VectorLayerData> {
  let root: unknown = input
  if (typeof input === 'string') {
    try { root = JSON.parse(input.charCodeAt(0) === 0xfeff ? input.slice(1) : input) }
    catch { return err(new Error('notJson')) }
  }
  if (!isObj(root)) return err(new Error('notGeoJson'))

  const rawFeatures = collectFeatures(root)
  if (rawFeatures === null) return err(new Error('notGeoJson'))

  // ── CRS ──
  const declared = opts.crs ?? readCrsMember(root)
  let sourceCrs = 'CRS84'
  let toWgs84: ((x: number, y: number) => [number, number] | null) | null = null
  if (declared && !/CRS84$/i.test(declared)) {
    const code = normalizeEpsgCode(declared)
    if (!code) return err(new Error('unknownCrs'))
    sourceCrs = code
    if (!WGS84_CODES.has(code)) {
      const def = resolveCrs(code)
      if (!def.ok) return err(new Error('unknownCrs'))
      toWgs84 = (x, y) => {
        const r = gridToWgs84(def.value, x, y)
        return r.ok ? [r.value.lon, r.value.lat] : null
      }
    }
  }

  // ── Geometry ──
  const features: VectorFeature[] = []
  let skipped = 0
  for (let i = 0; i < rawFeatures.length; i++) {
    const f = rawFeatures[i]
    const geom = readGeometry(f.geometry)
    if (!geom) { skipped++; continue }
    const id = f.id !== undefined && f.id !== null ? String(f.id) : `f${i}`
    features.push({ id, geometry: geom, properties: isObj(f.properties) ? f.properties : {} })
  }
  if (features.length === 0) return err(new Error(rawFeatures.length === 0 ? 'empty' : 'notGeoJson'))

  if (toWgs84) {
    for (const f of features) {
      const okAll = mapCoords(f.geometry, (c) => {
        const ll = toWgs84!(c[0], c[1])
        return ll ? withZ(ll[0], ll[1], c) : null
      })
      if (!okAll) return err(new Error('unknownCrs'))
    }
  } else {
    // Projected metres with no CRS: refuse rather than draw at lat 4 582 000.
    if (features.some((f) => anyCoord(f.geometry, ([x, y]) => Math.abs(x) > 180 || Math.abs(y) > 180))) {
      return err(new Error('projectedWithoutCrs'))
    }
    if (shouldSwap(features, opts.axisOrder ?? 'lonlat')) {
      for (const f of features) mapCoords(f.geometry, (c) => withZ(c[1], c[0], c))
    }
    // Still a "latitude" past the pole: not degrees in any order we can read.
    if (features.some((f) => anyCoord(f.geometry, ([, y]) => Math.abs(y) > 90))) {
      return err(new Error('projectedWithoutCrs'))
    }
  }

  // ── Summary ──
  const counts = { point: 0, line: 0, polygon: 0 }
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  let hasZ = false
  const keys = new Set<string>()
  for (const f of features) {
    counts[f.geometry.type]++
    anyCoord(f.geometry, (c) => {
      if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]
      if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]
      if (c.length > 2 && c[2] !== 0) hasZ = true
      return false
    })
    for (const k of Object.keys(f.properties)) keys.add(k)
  }
  const heightProperty = findHeightProperty(features)

  return ok({
    features,
    bbox: Number.isFinite(w) ? [w, s, e, n] : null,
    sourceCrs,
    counts,
    skipped,
    heightSource: hasZ ? 'coordinates' : heightProperty ? 'property' : 'none',
    heightProperty,
    propertyKeys: [...keys].sort(),
  })
}

interface RawFeature { id?: unknown; geometry?: unknown; properties?: unknown }

function collectFeatures(root: Record<string, unknown>): RawFeature[] | null {
  switch (root.type) {
    case 'FeatureCollection':
      return Array.isArray(root.features) ? (root.features.filter(isObj) as RawFeature[]) : null
    case 'Feature':
      return [root as RawFeature]
    case 'GeometryCollection':
      return Array.isArray(root.geometries) ? root.geometries.filter(isObj).map((g) => ({ geometry: g })) : null
    case 'Point': case 'MultiPoint': case 'LineString': case 'MultiLineString':
    case 'Polygon': case 'MultiPolygon':
      return [{ geometry: root }]
    default:
      return null
  }
}

/** Pre-RFC 7946 `crs` member: { type: 'name', properties: { name: 'EPSG:25831' } }. */
function readCrsMember(root: Record<string, unknown>): string | null {
  const crs = root.crs
  if (!isObj(crs) || !isObj(crs.properties)) return null
  const name = crs.properties.name ?? crs.properties.code
  return typeof name === 'string' || typeof name === 'number' ? String(name) : null
}

function readGeometry(g: unknown): VectorGeometry | null {
  if (!isObj(g)) return null
  const c = g.coordinates
  switch (g.type) {
    case 'Point': { const p = pos(c); return p ? { type: 'point', coords: [p] } : null }
    case 'MultiPoint': { const ps = ring(c, 1); return ps ? { type: 'point', coords: ps } : null }
    case 'LineString': { const l = ring(c, 2); return l ? { type: 'line', parts: [l] } : null }
    case 'MultiLineString': {
      const parts = arr(c).map((l) => ring(l, 2)).filter((l): l is LonLatZ[] => !!l)
      return parts.length ? { type: 'line', parts } : null
    }
    case 'Polygon': { const p = poly(c); return p ? { type: 'polygon', polygons: [p] } : null }
    case 'MultiPolygon': {
      const polys = arr(c).map(poly).filter((p): p is LonLatZ[][] => !!p)
      return polys.length ? { type: 'polygon', polygons: polys } : null
    }
    case 'GeometryCollection': {
      // Flatten to the first homogeneous kind — rare in the wild, and a layer
      // has one style per kind anyway.
      const subs = arr(g.geometries).map(readGeometry).filter((x): x is VectorGeometry => !!x)
      return subs[0] ?? null
    }
    default:
      return null
  }
}

/** (x, y) keeping the source coordinate's z, if it had one. */
function withZ(x: number, y: number, src: LonLatZ): LonLatZ {
  return src.length === 3 ? [x, y, src[2]] : [x, y]
}

function arr(v: unknown): unknown[] { return Array.isArray(v) ? v : [] }

function pos(v: unknown): LonLatZ | null {
  if (!Array.isArray(v) || v.length < 2) return null
  const x = Number(v[0]), y = Number(v[1])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const z = v.length > 2 ? Number(v[2]) : NaN
  return Number.isFinite(z) ? [x, y, z] : [x, y]
}

function ring(v: unknown, min: number): LonLatZ[] | null {
  const out = arr(v).map(pos).filter((p): p is LonLatZ => !!p)
  return out.length >= min ? out : null
}

function poly(v: unknown): LonLatZ[][] | null {
  const rings = arr(v).map((r) => ring(r, 4)).filter((r): r is LonLatZ[] => !!r)
  return rings.length ? rings : null
}

function forEachCoordList(g: VectorGeometry, fn: (list: LonLatZ[]) => void): void {
  if (g.type === 'point') fn(g.coords)
  else if (g.type === 'line') g.parts.forEach(fn)
  else g.polygons.forEach((p) => p.forEach(fn))
}

function anyCoord(g: VectorGeometry, pred: (c: LonLatZ) => boolean): boolean {
  let hit = false
  forEachCoordList(g, (list) => { if (!hit) hit = list.some(pred) })
  return hit
}

/** Rewrite every coordinate in place. False if any mapping failed. */
function mapCoords(g: VectorGeometry, fn: (c: LonLatZ) => LonLatZ | null): boolean {
  let okAll = true
  forEachCoordList(g, (list) => {
    for (let i = 0; i < list.length; i++) {
      const r = fn(list[i])
      if (r) list[i] = r; else okAll = false
    }
  })
  return okAll
}

function shouldSwap(features: VectorFeature[], order: 'lonlat' | 'latlon' | 'auto'): boolean {
  if (order === 'latlon') return true
  if (order === 'lonlat') return false
  // Swapped data is detectable only where |x| > 90 can't be a latitude.
  let anyBeyond = false
  for (const f of features) {
    anyCoord(f.geometry, (c) => { if (Math.abs(c[1]) > 90) anyBeyond = true; return anyBeyond })
  }
  return anyBeyond
}

function findHeightProperty(features: VectorFeature[]): string | null {
  // Judged on the POLYGONS when there are any: a height column means "how tall
  // is this area", and a mixed layer's routes and POIs rarely carry one.
  const polys = features.filter((f) => f.geometry.type === 'polygon')
  const sample = (polys.length ? polys : features).slice(0, 200)
  for (const key of HEIGHT_KEYS) {
    let numeric = 0
    for (const f of sample) {
      const v = f.properties[key]
      if (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) numeric++
    }
    // A height column, not an occasional field: most features must carry it.
    if (numeric > 0 && numeric >= sample.length * 0.5) return key
  }
  return null
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// ── Projection into the scene ──────────────────────────────────────────────────

/**
 * How heights are read when projecting.
 *   absolute — z / property is an elevation in the anchor's vertical datum
 *   relative — z / property is metres above the anchor's ground (draped)
 *   ignore   — everything on the anchor ground plane
 */
export type HeightMode = 'absolute' | 'relative' | 'ignore'

export interface ProjectedFeature {
  id: string
  type: VectorGeometry['type']
  /**
   * Scene points, grouped like the source: one list per point set / line part /
   * polygon ring, with `ringCounts[k]` rings belonging to polygon k.
   */
  lists: ScenePoint[][]
  ringCounts: number[]
  /** Extrusion in metres for polygons (height property in relative mode), else 0. */
  extrusionM: number
  properties: VectorProps
}

/**
 * Project a parsed layer into scene coordinates through the anchor.
 *
 * Heights: with a height PROPERTY on polygons in relative mode, the property is
 * an extrusion (a building, a zone volume) and the base sits on the ground —
 * that is what nearly every "height" column means. Everything else uses the z
 * coordinate (or the property) as a point height.
 */
export function projectLayer(
  layer: VectorLayerData, anchor: SceneAnchor, mode: HeightMode,
): ProjectedFeature[] {
  const ground: SceneAnchor = { ...anchor, elevationM: null }
  return layer.features.map((f) => {
    const propH = layer.heightProperty ? Number(f.properties[layer.heightProperty]) : NaN
    const hasPropH = Number.isFinite(propH)
    // A height column on a polygon is an extrusion (a building, a zone volume)
    // in every mode; its base follows the coordinates' z or the ground.
    const extrude = f.geometry.type === 'polygon' && hasPropH && mode !== 'ignore'
    const project = (c: LonLatZ): ScenePoint => {
      const z = mode === 'ignore' ? null
        : c.length > 2 ? c[2]
        : hasPropH && !extrude ? propH
        : null
      if (mode === 'absolute') return lonLatToScene(anchor, c[0], c[1], z)
      return lonLatToScene(ground, c[0], c[1], z)
    }
    const lists: ScenePoint[][] = []
    const ringCounts: number[] = []
    const g = f.geometry
    if (g.type === 'point') lists.push(g.coords.map(project))
    else if (g.type === 'line') g.parts.forEach((p) => lists.push(p.map(project)))
    else g.polygons.forEach((p) => { ringCounts.push(p.length); p.forEach((r) => lists.push(r.map(project))) })
    return {
      id: f.id, type: g.type, lists, ringCounts,
      extrusionM: extrude ? Math.max(0, propH) : 0,
      properties: f.properties,
    }
  })
}
