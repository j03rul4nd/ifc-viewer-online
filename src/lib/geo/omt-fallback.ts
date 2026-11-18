// ─── omt-fallback ─────────────────────────────────────────────────────────────
// The city when Overpass says no.
//
// The 3D surroundings come from the Overpass API: rich tags, one query. It is
// also a shared public server that rate-limits after a few loads in a few
// minutes and answers "busy" at peak hours — and when it does, the surroundings
// simply do not appear. Hit repeatedly during the 2026-10 look work.
//
// The basemap already downloads the same city as OpenMapTiles vector tiles
// (OpenFreeMap: OSM data, CDN, no key, no cap): building footprints WITH their
// heights (`render_height`, from OSM height/levels), roads by class with
// bridge/tunnel flags, water, parks, landcover. Converted to pseudo-Overpass
// ways with the equivalent OSM tags, they flow through EXACTLY the same
// pipeline — the same trick the worker already uses for the Overture extract —
// so the fallback city is built, lit and styled like the real one.
//
// What it cannot give: the fine tags (facade colours, shops, street furniture,
// trees as nodes, building:part volumes). A thinner city, honestly labelled,
// instead of no city.

import { OPENFREEMAP_TILEJSON } from './providers'
import { loadTileJson } from './basemap/tilejson'

export interface LatLon { lat: number; lon: number }

/** One decoded feature, already in WGS84. */
export interface OmtFeature {
  layer: string
  /** 1 point, 2 line, 3 polygon (MVT geometry types). */
  type: 1 | 2 | 3
  props: Record<string, unknown>
  /** Lines: each part. Polygons: OUTER rings only (holes are dropped). */
  parts: LatLon[][]
}

/** The shape parseOsmFeatures reads (a subset of an Overpass element). */
export interface PseudoOverpassWay {
  type: 'way'
  id: number
  tags: Record<string, string>
  geometry: LatLon[]
}

const HIGHWAY_OF_CLASS: Readonly<Record<string, string>> = {
  motorway: 'motorway', trunk: 'trunk', primary: 'primary', secondary: 'secondary',
  tertiary: 'tertiary', minor: 'residential', service: 'service', track: 'track',
  path: 'footway', busway: 'busway', raceway: 'raceway',
}

/** At or below this, OMT's render_height is its own default, not data. */
const OMT_DEFAULT_HEIGHT_M = 5

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** OMT properties → the OSM tags the classifier understands (null = skip). */
export function omtTags(f: Pick<OmtFeature, 'layer' | 'type' | 'props'>): Record<string, string> | null {
  const p = f.props
  const cls = String(p.class ?? '')
  const name: Record<string, string> = typeof p.name === 'string' ? { name: p.name } : {}
  switch (f.layer) {
    case 'building': {
      if (f.type !== 3) return null
      const h = num(p.render_height)
      const min = num(p.render_min_height)
      return {
        building: 'yes',
        // OMT fills a missing height with a low default (measured: most of
        // Poblenou came out at exactly 4 m). Passing it on would override the
        // district height prior, which guesses far better — so only a height
        // above that floor is treated as information.
        ...(h !== null && h > OMT_DEFAULT_HEIGHT_M ? { height: String(h) } : {}),
        ...(min !== null && min > 0 ? { min_height: String(min) } : {}),
        // OMT gives a height even when OSM had none (it falls back to a
        // default), so this is never a surveyed number. Say so: the audit and
        // the confidence overlay must not count it as measured.
        'note:height': 'estimated',
      }
    }
    case 'transportation': {
      if (f.type !== 2) return null
      const tags: Record<string, string> = { ...name }
      if (cls === 'rail' || cls === 'transit') tags.railway = p.subclass === 'tram' ? 'tram' : 'rail'
      else if (HIGHWAY_OF_CLASS[cls]) tags.highway = HIGHWAY_OF_CLASS[cls]
      else return null
      if (p.brunnel === 'bridge') { tags.bridge = 'yes'; tags.layer = '1' }
      if (p.brunnel === 'tunnel') { tags.tunnel = 'yes'; tags.layer = '-1' }
      if (num(p.ramp) === 1 && tags.highway) tags.highway = `${tags.highway}_link`
      return tags
    }
    case 'water':
      return f.type === 3 ? { natural: 'water' } : null
    case 'waterway':
      // Culverted streams and storm drains run UNDER the city; drawn on the
      // surface they cut blue lines across streets and blocks (seen on the
      // Poblenou fallback). Only open, surface watercourses.
      if (f.type !== 2 || p.brunnel === 'tunnel' || num(p.intermittent) === 1) return null
      return ['river', 'canal', 'stream'].includes(cls) ? { waterway: cls, ...name } : null
    case 'park':
      return f.type === 3 ? { leisure: 'park', ...name } : null
    case 'landcover':
      if (f.type !== 3) return null
      if (cls === 'wood') return { natural: 'wood' }
      if (cls === 'grass') return { landuse: 'grass' }
      if (cls === 'sand') return { natural: 'sand' }
      return null
    default:
      return null
  }
}

/**
 * Decoded tiles → pseudo-Overpass ways. Ids are negative and sequential so
 * they can never collide with a real OSM way that arrives later.
 */
export function omtToOverpassElements(features: readonly OmtFeature[]): PseudoOverpassWay[] {
  const out: PseudoOverpassWay[] = []
  let id = -1
  for (const f of features) {
    const tags = omtTags(f)
    if (!tags) continue
    for (const part of f.parts) {
      if (part.length < (f.type === 3 ? 3 : 2)) continue
      out.push({ type: 'way', id: id--, tags, geometry: part })
    }
  }
  return out
}

// ── Tiles ─────────────────────────────────────────────────────────────────────

/** Data zoom of OpenMapTiles: everything the city needs is in z14. */
export const OMT_Z = 14

export function tilesCovering(b: { south: number; west: number; north: number; east: number }, z = OMT_Z): Array<[number, number]> {
  const n = 2 ** z
  const tx = (lon: number) => Math.floor(((lon + 180) / 360) * n)
  const ty = (lat: number) => {
    const r = (lat * Math.PI) / 180
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)
  }
  const out: Array<[number, number]> = []
  for (let x = tx(b.west); x <= tx(b.east); x++) {
    for (let y = ty(b.north); y <= ty(b.south); y++) out.push([x, y])
  }
  return out
}

/** Tile-local MVT coordinate → WGS84. */
export function tilePointToLatLon(px: number, py: number, extent: number, z: number, x: number, y: number): LatLon {
  const n = 2 ** z
  const lon = ((x + px / extent) / n) * 360 - 180
  const my = Math.PI * (1 - (2 * (y + py / extent)) / n)
  return { lat: (Math.atan(Math.sinh(my)) * 180) / Math.PI, lon }
}

/** Shoelace in tile coords (y down): MVT outer rings come out POSITIVE. */
function signedArea(ring: ReadonlyArray<{ x: number; y: number }>): number {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j].x - ring[i].x) * (ring[j].y + ring[i].y)
  return a / 2
}

const LAYERS = ['building', 'transportation', 'water', 'waterway', 'park', 'landcover']

interface VTLike {
  layers: Record<string, {
    length: number; extent: number
    feature(i: number): { type: number; properties: Record<string, unknown>; loadGeometry(): Array<Array<{ x: number; y: number }>> }
  }>
}

export function decodeOmtTile(vt: VTLike, z: number, x: number, y: number): OmtFeature[] {
  const out: OmtFeature[] = []
  for (const name of LAYERS) {
    const layer = vt.layers[name]
    if (!layer) continue
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i)
      const type = f.type as 1 | 2 | 3
      if (type !== 2 && type !== 3) continue
      const parts: LatLon[][] = []
      for (const ring of f.loadGeometry()) {
        // Polygons: keep outer rings; a courtyard punched as a hole is dropped
        // (the building pipeline treats Overpass multipolygons the same way).
        if (type === 3 && signedArea(ring) <= 0) continue
        parts.push(ring.map((p) => tilePointToLatLon(p.x, p.y, layer.extent, z, x, y)))
      }
      if (parts.length) out.push({ layer: name, type, props: f.properties, parts })
    }
  }
  return out
}

/**
 * Fetch and convert the z14 tiles covering `bbox`. Throws when nothing could be
 * read, so the caller reports the ORIGINAL Overpass failure plus this one.
 */
export async function fetchOmtFallback(
  bbox: { south: number; west: number; north: number; east: number }, signal?: AbortSignal,
): Promise<PseudoOverpassWay[]> {
  const tj = await loadTileJson(OPENFREEMAP_TILEJSON)
  const template = tj.tiles[0]
  if (!template) throw new Error('OpenFreeMap TileJSON without tiles')
  const [{ VectorTile }, { default: Pbf }] = await Promise.all([import('@mapbox/vector-tile'), import('pbf')])
  const features: OmtFeature[] = []
  const tiles = tilesCovering(bbox)
  await Promise.all(tiles.map(async ([x, y]) => {
    const url = template.replace('{z}', String(OMT_Z)).replace('{x}', String(x)).replace('{y}', String(y))
    const res = await fetch(url, { signal })
    if (!res.ok) return
    const vt = new VectorTile(new Pbf(await res.arrayBuffer())) as unknown as VTLike
    features.push(...decodeOmtTile(vt, OMT_Z, x, y))
  }))
  // z14 tiles are ~2.4 km across; Overpass answers for the bbox only. Keep what
  // touches it — measured on Poblenou: 51 382 ways for 4 tiles, against a box
  // a fraction of their size.
  const inBox = features.map((f) => ({ ...f, parts: f.parts.filter((part) => touchesBox(part, bbox)) }))
    .filter((f) => f.parts.length > 0)
  if (inBox.length === 0) throw new Error('OpenFreeMap fallback: no data for this area')
  return omtToOverpassElements(inBox)
}

/** Does a ring/line's bounding box overlap the bbox? */
export function touchesBox(
  part: readonly LatLon[], b: { south: number; west: number; north: number; east: number },
): boolean {
  let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity
  for (const p of part) {
    if (p.lat < s) s = p.lat; if (p.lat > n) n = p.lat
    if (p.lon < w) w = p.lon; if (p.lon > e) e = p.lon
  }
  return n >= b.south && s <= b.north && e >= b.west && w <= b.east
}
