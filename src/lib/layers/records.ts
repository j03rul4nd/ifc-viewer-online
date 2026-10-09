// ─── records ──────────────────────────────────────────────────────────────────
// Most city APIs do not speak GeoJSON. They answer with a list of RECORDS that
// carry a place somewhere inside them, each in its own words:
//
//   Socrata (Generalitat)   [{ latitud: "41.4", longitud: "2.1", geocoded_column: {type:'Point',…} }]
//   GELFS (Endolla)         { gelfs_version, locations: [{ coordinates: { latitude, longitude } }] }
//   ODPT (Tokyo)            [{ "geo:lat": 35.7, "geo:long": 139.7 }]
//   data.gov.sg             { data: { stations: [{ location: { latitude, longitude } }] } }
//   Opendatasoft records    { results: [{ geo_point_2d: { lat, lon } }] }
//
// Asking a user to write a mapping for each is asking them to read the API's
// docs. This module FINDS the list (the largest array of objects that has
// places) and the place inside each record (a GeoJSON geometry, a lon/lat pair
// under one parent, a [lon, lat] array or a WKT string), judged on the values,
// not only the names. An explicit RecordsSpec overrides the guess.
//
// Known shapes that need more than a place get a summary on top: a GELFS
// charging location becomes "3 ports, 2 available, 50 kW, state: available",
// which is what a map can style without digging through stations[].ports[].
//
// Pure.

import { parseWkt } from './csv'

export type RecordsGeometry =
  | { kind: 'pair'; lon: string; lat: string }
  | { kind: 'array'; path: string }
  | { kind: 'geojson'; path: string }
  | { kind: 'wkt'; path: string }

export interface RecordsSpec {
  /** Dotted path to the list ("data.stations"); '' = the root itself. */
  listPath: string
  geometry: RecordsGeometry
  /** Field naming each record (becomes the feature id); '' = guessed. */
  idField?: string
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

export function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj
  let cur: unknown = obj
  for (const part of path.split('.')) {
    if (!isObj(cur)) return undefined
    cur = cur[part]
  }
  return cur
}

const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN)

// Last path segment, compared case-insensitively. Deliberately NOT bare x / y:
// in JSON those are as often screen or local coordinates as degrees.
const LON_KEY = /^(lon|lng|long|longitude|longitud|longitut|geo:long|x_?lon)$/i
const LAT_KEY = /^(lat|latitude|latitud|geo:lat|y_?lat)$/i
const GEOM_TYPES = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'])
const WKT_RE = /^\s*(MULTI)?(POINT|LINESTRING|POLYGON)\s*(Z|M|ZM)?\s*\(/i

const lastSeg = (p: string): string => p.slice(p.lastIndexOf('.') + 1)
const parentOf = (p: string): string => (p.includes('.') ? p.slice(0, p.lastIndexOf('.')) : '')

/** Leaf paths of a record, up to `depth` objects deep (arrays are leaves). */
function leafPaths(o: Obj, depth = 3, prefix = '', out: Array<[string, unknown]> = []): Array<[string, unknown]> {
  for (const [k, v] of Object.entries(o)) {
    const p = prefix ? `${prefix}.${k}` : k
    if (isObj(v) && depth > 0 && !GEOM_TYPES.has(String(v.type)) && v.type !== 'Feature') leafPaths(v, depth - 1, p, out)
    else out.push([p, v])
  }
  return out
}

const isLonLat = (lon: number, lat: number): boolean =>
  Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90 && !(lon === 0 && lat === 0)

function asGeoJsonGeometry(v: unknown): Obj | null {
  if (!isObj(v)) return null
  if (v.type === 'Feature' && isObj(v.geometry)) return asGeoJsonGeometry(v.geometry)
  return GEOM_TYPES.has(String(v.type)) && Array.isArray(v.coordinates) ? v : null
}

/** Share of a sample whose value at `test` says "this is a place". */
function hitRate(items: Obj[], test: (o: Obj) => boolean): number {
  if (items.length === 0) return 0
  let n = 0
  for (const o of items) if (test(o)) n++
  return n / items.length
}

/** Where the place is inside these records, or null when they have none. */
export function detectRecordGeometry(items: Obj[]): RecordsGeometry | null {
  const sample = items.slice(0, 25)
  if (sample.length === 0) return null
  const paths = new Map<string, unknown>()
  for (const o of sample.slice(0, 5)) for (const [p, v] of leafPaths(o)) if (!paths.has(p)) paths.set(p, v)
  const all = [...paths.keys()]
  const ENOUGH = 0.6

  // 1. A real GeoJSON geometry beats any pair of numbers: it can be a line or an area.
  for (const p of all) {
    if (hitRate(sample, (o) => asGeoJsonGeometry(getPath(o, p)) !== null) >= ENOUGH) return { kind: 'geojson', path: p }
  }
  // 2. A lon/lat pair under the same parent ("coordinates.latitude" + "coordinates.longitude").
  for (const lon of all.filter((p) => LON_KEY.test(lastSeg(p)))) {
    const lat = all.find((p) => LAT_KEY.test(lastSeg(p)) && parentOf(p) === parentOf(lon))
    if (!lat) continue
    if (hitRate(sample, (o) => isLonLat(num(getPath(o, lon)), num(getPath(o, lat)))) >= ENOUGH) return { kind: 'pair', lon, lat }
  }
  // 3. A two-number array named like coordinates, in GeoJSON's [lon, lat] order.
  for (const p of all.filter((x) => /^(coordinates|coords|lonlat|lnglat|position|point|location)$/i.test(lastSeg(x)))) {
    const ok = (o: Obj): boolean => {
      const v = getPath(o, p)
      return Array.isArray(v) && v.length >= 2 && isLonLat(num(v[0]), num(v[1]))
    }
    if (hitRate(sample, ok) >= ENOUGH) return { kind: 'array', path: p }
  }
  // 4. WKT text.
  for (const p of all) {
    if (hitRate(sample, (o) => { const v = getPath(o, p); return typeof v === 'string' && WKT_RE.test(v) }) >= ENOUGH) {
      return { kind: 'wkt', path: p }
    }
  }
  return null
}

/** Arrays of objects in a document, with their paths (breadth-first, a few levels deep). */
function arraysIn(root: unknown, maxDepth = 4): Array<{ path: string; items: Obj[] }> {
  const out: Array<{ path: string; items: Obj[] }> = []
  const visit = (v: unknown, path: string, depth: number): void => {
    if (Array.isArray(v)) {
      const items = v.filter(isObj)
      if (items.length > 0 && items.length >= v.length * 0.8) out.push({ path, items })
      return
    }
    if (!isObj(v) || depth >= maxDepth) return
    for (const [k, c] of Object.entries(v)) visit(c, path ? `${path}.${k}` : k, depth + 1)
  }
  visit(root, '', 0)
  return out
}

/**
 * The records in a JSON body and where their places are: the LARGEST list
 * whose items carry a place (data.gov.sg ships stations and readings side by
 * side — only the stations have coordinates). A single object with a place is
 * a one-record list (Open-Meteo answers that way).
 */
export function detectRecords(body: unknown): RecordsSpec | null {
  const lists = arraysIn(body).sort((a, b) => b.items.length - a.items.length)
  for (const l of lists) {
    const geometry = detectRecordGeometry(l.items)
    if (geometry) return { listPath: l.path, geometry }
  }
  if (isObj(body)) {
    const geometry = detectRecordGeometry([body])
    if (geometry) return { listPath: '', geometry }
  }
  return null
}

const ID_KEYS = ['id', '@id', 'owl:sameAs', 'station_id', 'stationId', 'codi_estacio', 'code', 'codi', 'uuid', 'gid', 'objectid', 'OBJECTID']

function geometryOf(o: Obj, g: RecordsGeometry): Obj | null {
  switch (g.kind) {
    case 'geojson': return asGeoJsonGeometry(getPath(o, g.path))
    case 'pair': {
      const lon = num(getPath(o, g.lon)), lat = num(getPath(o, g.lat))
      return isLonLat(lon, lat) ? { type: 'Point', coordinates: [lon, lat] } : null
    }
    case 'array': {
      const v = getPath(o, g.path)
      if (!Array.isArray(v)) return null
      const lon = num(v[0]), lat = num(v[1])
      return isLonLat(lon, lat) ? { type: 'Point', coordinates: v.length > 2 && Number.isFinite(num(v[2])) ? [lon, lat, num(v[2])] : [lon, lat] } : null
    }
    case 'wkt': {
      const v = getPath(o, g.path)
      return typeof v === 'string' ? (parseWkt(v) as Obj | null) : null
    }
  }
}

/** The record without the fields that only held its place (they are the geometry now). */
function propertiesOf(o: Obj, g: RecordsGeometry): Obj {
  const drop = g.kind === 'pair' ? [g.lon, g.lat] : [g.path]
  const strip = (v: Obj, prefix: string): Obj => {
    const out: Obj = {}
    for (const [k, c] of Object.entries(v)) {
      const p = prefix ? `${prefix}.${k}` : k
      if (drop.includes(p)) continue
      if (isObj(c) && drop.some((d) => d.startsWith(`${p}.`))) {
        const inner = strip(c, p)
        if (Object.keys(inner).length) out[k] = inner
      } else out[k] = c
    }
    return out
  }
  return strip(o, '')
}

/** Records → GeoJSON FeatureCollection. Null when no place can be found. */
export function recordsToGeoJson(body: unknown, spec?: RecordsSpec | null): { type: 'FeatureCollection'; features: Obj[] } | null {
  const shaped = isGelfs(body) ? gelfsRecords(body) : body
  const s = spec ?? detectRecords(shaped)
  if (!s) return null
  const list = getPath(shaped, s.listPath)
  const items = Array.isArray(list) ? list.filter(isObj) : isObj(list) ? [list] : []
  const idKey = s.idField || ID_KEYS.find((k) => items.length > 0 && items.every((o) => {
    const v = o[k]
    return (typeof v === 'string' && v !== '') || typeof v === 'number'
  })) || ''
  const features: Obj[] = []
  for (const o of items) {
    const geometry = geometryOf(o, s.geometry)
    if (!geometry) continue
    const f: Obj = { type: 'Feature', properties: propertiesOf(o, s.geometry), geometry }
    if (idKey) f.id = String(o[idKey])
    features.push(f)
  }
  return features.length ? { type: 'FeatureCollection', features } : null
}

/**
 * JSON text → GeoJSON text when the body is NOT GeoJSON but carries places.
 * GeoJSON (and anything without places) is returned untouched, so the GeoJSON
 * parser keeps the last word and its error messages.
 */
export function jsonToGeoJsonText(text: string, spec?: RecordsSpec | null): string {
  let body: unknown
  try { body = JSON.parse(text) } catch { return text }
  if (isObj(body) && (body.type === 'FeatureCollection' || body.type === 'Feature' || GEOM_TYPES.has(String(body.type)))) return text
  const fc = recordsToGeoJson(body, spec)
  return fc ? JSON.stringify(fc) : text
}

// ── GELFS (EV charging locations) ──────────────────────────────────────────────
//
// Barcelona's Endolla feed (B:SM) publishes GELFS: locations → stations →
// ports, each port with its own status list. A driver asks one question per
// location — "can I charge here now?" — so the summary answers it:
//   available       at least one port AVAILABLE
//   busy            none available, at least one IN_USE / RESERVED
//   out_of_service  every port OUT_OF_ORDER / UNAVAILABLE
//   unknown         no port reports a status

interface GelfsPort { connector_type?: string; power_kw?: number; port_status?: Array<{ status?: string }>; last_updated?: string }
interface GelfsLocation { stations?: Array<{ ports?: GelfsPort[] }>; address?: { address_string?: string } }

export function isGelfs(body: unknown): body is { locations: unknown[] } {
  return isObj(body) && Array.isArray(body.locations) && ('gelfs_version' in body
    || (body.locations as unknown[]).slice(0, 3).some((l) => isObj(l) && Array.isArray(l.stations)))
}

export function summarizeEvLocation(loc: GelfsLocation): Obj {
  const ports = (loc.stations ?? []).flatMap((s) => s.ports ?? [])
  const status = (p: GelfsPort): string => String(p.port_status?.[0]?.status ?? 'UNKNOWN').toUpperCase()
  const count = (...states: string[]): number => ports.filter((p) => states.includes(status(p))).length
  const available = count('AVAILABLE')
  const inUse = count('IN_USE', 'RESERVED', 'CHARGING', 'OCCUPIED')
  const outOfOrder = count('OUT_OF_ORDER', 'UNAVAILABLE', 'FAULTED', 'INOPERATIVE')
  const known = available + inUse + outOfOrder
  const powers = ports.map((p) => Number(p.power_kw)).filter(Number.isFinite)
  const updated = ports.map((p) => Date.parse(p.last_updated ?? '')).filter(Number.isFinite)
  return {
    name: loc.address?.address_string ?? null,
    station_count: (loc.stations ?? []).length,
    ports_total: ports.length,
    ports_available: available,
    ports_in_use: inUse,
    ports_out_of_order: outOfOrder,
    max_power_kw: powers.length ? Math.max(...powers) : null,
    connectors: [...new Set(ports.map((p) => p.connector_type).filter(Boolean))].join(', ') || null,
    fast_charge: powers.some((p) => p >= 40),
    state: known === 0 ? 'unknown' : available > 0 ? 'available' : inUse > 0 ? 'busy' : 'out_of_service',
    last_updated: updated.length ? new Date(Math.max(...updated)).toISOString() : null,
  }
}

/** GELFS → plain records: each location with its summary on top (details kept underneath). */
function gelfsRecords(body: { locations: unknown[] }): Obj {
  return {
    // The summary goes last: it is what the map styles, and it must win over
    // any same-named field of the source.
    locations: body.locations.filter(isObj).map((l) => ({ ...l, ...summarizeEvLocation(l as GelfsLocation) })),
  }
}
