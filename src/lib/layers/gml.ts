// ─── gml ──────────────────────────────────────────────────────────────────────
// GML (2 and 3.x) → GeoJSON, for the WFS servers that offer nothing else —
// which, in Spain, includes the Catastro: its INSPIRE WFS answers GML 3.2 only.
//
// What real responses actually contain (all of it seen in Catastro, IGN and
// ICGC answers, see __fixtures__):
//   • features as <wfs:member> (2.0), <gml:featureMember> or <gml:featureMembers>;
//   • polygons as Polygon, or Surface → patches → PolygonPatch, inside a
//     MultiSurface; rings as posList, a run of <pos>, or GML2 <coordinates>;
//   • MORE THAN ONE geometry per feature (a parcel's outline AND its
//     referencePoint). The richest one is THE geometry; the rest become
//     attributes, so nothing is lost and nothing is drawn twice;
//   • srsName as "EPSG:25831", "urn:ogc:def:crs:EPSG::25831" or
//     "http://www.opengis.net/def/crs/EPSG/0/25831" — and for geographic CRSs
//     the long forms mean LATITUDE FIRST, the short one longitude first;
//   • ISO-8859-1 bodies behind a UTF-8 Content-Type (decodeXml handles that).
//
// Output is a GeoJSON object with a legacy `crs` member when the data is in a
// projected grid; geojson.ts reprojects it like any other layer.

import { normalizeEpsgCode } from '../geo/crs'

type Pos = number[]
type GeoJsonGeometry =
  | { type: 'Point'; coordinates: Pos }
  | { type: 'MultiPoint'; coordinates: Pos[] }
  | { type: 'LineString'; coordinates: Pos[] }
  | { type: 'MultiLineString'; coordinates: Pos[][] }
  | { type: 'Polygon'; coordinates: Pos[][] }
  | { type: 'MultiPolygon'; coordinates: Pos[][][] }

export interface GmlParseResult {
  geojson: { type: 'FeatureCollection'; crs?: { type: 'name'; properties: { name: string } }; features: unknown[] }
  /** CRS the coordinates are in after axis normalisation ('CRS84' when lon/lat). */
  crs: string
  /** numberMatched / numberReturned when the server said (WFS 2.0 paging). */
  numberMatched: number | null
  numberReturned: number | null
}

const GEOGRAPHIC = new Set(['EPSG:4326', 'EPSG:4258', 'EPSG:4979', 'EPSG:4937', 'EPSG:4171', 'EPSG:4083'])

/** Does this srsName spelling put latitude first? (OGC rule: authority form = authority axis order.) */
export function latFirst(srsName: string | null): boolean {
  if (!srsName) return false
  const s = srsName.trim()
  if (/CRS:?84/i.test(s)) return false
  const code = normalizeEpsgCode(s)
  if (!code || !GEOGRAPHIC.has(code)) return false
  // "EPSG:4326" (short) is the traditional x/y = lon/lat; URN and URL forms
  // follow the EPSG definition, which is lat/lon.
  return /urn:|opengis\.net\/def/i.test(s)
}

/** Decode a response body honouring the XML declaration's encoding. */
export function decodeXml(bytes: ArrayBuffer): string {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 200))
  const enc = /encoding=["']([\w-]+)["']/i.exec(head)?.[1]?.toLowerCase()
  try { return new TextDecoder(enc && enc !== 'utf8' ? enc : 'utf-8').decode(bytes) }
  catch { return new TextDecoder('utf-8').decode(bytes) }
}

const GEOM_NAMES = new Set([
  'Point', 'MultiPoint', 'LineString', 'Curve', 'MultiLineString', 'MultiCurve',
  'Polygon', 'Surface', 'MultiPolygon', 'MultiSurface', 'LinearRing',
])

const isGml = (el: Element): boolean => /opengis\.net\/gml/.test(el.namespaceURI ?? '')
const kids = (el: Element): Element[] => [...el.children]
const byName = (el: Element, name: string): Element[] =>
  [...el.getElementsByTagName('*')].filter((e) => e.localName === name && isGml(e))

/** Parse a GML FeatureCollection (any WFS version). Null if it is not one. */
export function parseGml(xml: string): GmlParseResult | null {
  let doc: Document
  try { doc = new DOMParser().parseFromString(xml, 'application/xml') } catch { return null }
  if (doc.getElementsByTagName('parsererror').length) return null
  const root = doc.documentElement
  if (!root || !/FeatureCollection$/.test(root.localName)) return null

  const featureEls: Element[] = []
  for (const m of kids(root)) {
    if (m.localName === 'member' || m.localName === 'featureMember') {
      const f = kids(m)[0]
      if (f) featureEls.push(f)
    } else if (m.localName === 'featureMembers') {
      featureEls.push(...kids(m))
    }
  }

  let crsName: string | null = null
  const features = featureEls.map((f) => {
    const { geometry, props, srs } = readFeature(f)
    if (srs && !crsName) crsName = srs
    const id = f.getAttributeNS('http://www.opengis.net/gml/3.2', 'id')
      || f.getAttributeNS('http://www.opengis.net/gml', 'id') || f.getAttribute('fid') || undefined
    return { type: 'Feature', id, properties: props, geometry }
  })

  const swap = latFirst(crsName)
  const code = normalizeEpsgCode(crsName)
  if (swap) for (const f of features) if (f.geometry) swapAxes(f.geometry)
  const geographic = !code || GEOGRAPHIC.has(code)
  const num = (a: string | null): number | null => (a !== null && a !== '' && Number.isFinite(Number(a)) ? Number(a) : null)
  return {
    geojson: {
      type: 'FeatureCollection',
      ...(geographic ? {} : { crs: { type: 'name' as const, properties: { name: code! } } }),
      features,
    },
    crs: geographic ? 'CRS84' : code!,
    numberMatched: num(root.getAttribute('numberMatched')),
    numberReturned: num(root.getAttribute('numberReturned')),
  }
}

// ── Features ───────────────────────────────────────────────────────────────────

const RANK: Record<GeoJsonGeometry['type'], number> = {
  MultiPolygon: 3, Polygon: 3, MultiLineString: 2, LineString: 2, MultiPoint: 1, Point: 1,
}

function readFeature(f: Element): { geometry: GeoJsonGeometry | null; props: Record<string, unknown>; srs: string | null } {
  // Each direct child is a property; those holding a GML geometry compete.
  const candidates: Array<{ prop: Element; geom: GeoJsonGeometry; srs: string | null }> = []
  for (const prop of kids(f)) {
    const g = kids(prop).find((c) => isGml(c) && GEOM_NAMES.has(c.localName))
    if (!g) continue
    const geom = readGeometry(g)
    if (geom) candidates.push({ prop, geom, srs: srsOf(g) })
  }
  candidates.sort((a, b) => RANK[b.geom.type] - RANK[a.geom.type])
  const main = candidates[0] ?? null
  const props: Record<string, unknown> = {}
  for (const prop of kids(f)) {
    if (main && prop === main.prop) continue
    // The feature's envelope: geometry-derived, never an attribute worth showing.
    if (isGml(prop) && prop.localName === 'boundedBy') continue
    const secondary = candidates.find((c) => c.prop === prop)
    // A second geometry (referencePoint) stays as readable coordinates.
    props[prop.localName] = secondary ? coordsText(secondary.geom) : readValue(prop)
  }
  return { geometry: main?.geom ?? null, props, srs: main?.srs ?? null }
}

function srsOf(el: Element): string | null {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const s = e.getAttribute('srsName')
    if (s) return s.trim()
  }
  // Child-level srsName (Surface inside MultiSurface carries it too).
  const inner = el.querySelector('[srsName]')
  return inner?.getAttribute('srsName')?.trim() ?? null
}

/** Leaf → typed value; element with children → nested object; nil → null. */
function readValue(el: Element): unknown {
  if (el.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'nil') === 'true') return null
  const children = kids(el)
  if (children.length === 0) {
    const href = el.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
    const text = el.textContent?.trim() ?? ''
    if (!text && href) return href
    if (text !== '' && /^-?\d+(\.\d+)?$/.test(text) && text.length < 16) return Number(text)
    return text
  }
  const out: Record<string, unknown> = {}
  for (const c of children) {
    const v = readValue(c)
    // Repeated elements become a list.
    if (c.localName in out) {
      const prev = out[c.localName]
      out[c.localName] = Array.isArray(prev) ? [...prev, v] : [prev, v]
    } else out[c.localName] = v
  }
  // A single wrapper (<inspireId><Identifier>…) flattens one level.
  const keys = Object.keys(out)
  return keys.length === 1 && typeof out[keys[0]] === 'object' && out[keys[0]] !== null ? out[keys[0]] : out
}

// ── Geometry ───────────────────────────────────────────────────────────────────

function dimOf(el: Element): number {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const d = Number(e.getAttribute('srsDimension'))
    if (d === 2 || d === 3) return d
  }
  return 2
}

function readPositions(el: Element): Pos[] {
  const posList = kids(el).find((c) => c.localName === 'posList')
  if (posList) {
    const n = (posList.textContent ?? '').trim().split(/\s+/).map(Number)
    const d = dimOf(posList)
    const out: Pos[] = []
    for (let i = 0; i + d - 1 < n.length; i += d) out.push(n.slice(i, i + d))
    return out
  }
  const pos = kids(el).filter((c) => c.localName === 'pos' || c.localName === 'pointProperty')
  if (pos.length) {
    return pos.map((p) => (p.localName === 'pos' ? p : p.getElementsByTagNameNS('*', 'pos')[0]))
      .filter(Boolean).map((p) => (p!.textContent ?? '').trim().split(/\s+/).map(Number))
  }
  const coords = kids(el).find((c) => c.localName === 'coordinates')
  if (coords) {
    // GML 2: "x,y x,y" (cs="," ts=" " by default).
    const cs = coords.getAttribute('cs') ?? ','
    const ts = coords.getAttribute('ts') ?? ' '
    return (coords.textContent ?? '').trim().split(ts === ' ' ? /\s+/ : ts).map((t) => t.split(cs).map(Number))
  }
  return []
}

function ringOf(el: Element): Pos[] | null {
  const ring = byName(el, 'LinearRing')[0] ?? byName(el, 'Ring')[0]
  if (!ring) return null
  const pts = ring.localName === 'Ring'
    ? byName(ring, 'LineStringSegment').flatMap(readPositions)
    : readPositions(ring)
  return pts.length >= 4 ? pts : null
}

function polygonOf(el: Element): Pos[][] | null {
  // Polygon or PolygonPatch: exterior (+ interiors). GML2 calls them outer/innerBoundaryIs.
  const ext = kids(el).find((c) => c.localName === 'exterior' || c.localName === 'outerBoundaryIs')
  if (!ext) return null
  const outer = ringOf(ext)
  if (!outer) return null
  const holes = kids(el)
    .filter((c) => c.localName === 'interior' || c.localName === 'innerBoundaryIs')
    .map(ringOf).filter((r): r is Pos[] => !!r)
  return [outer, ...holes]
}

function surfacePolygons(el: Element): Pos[][][] {
  if (el.localName === 'Polygon') { const p = polygonOf(el); return p ? [p] : [] }
  if (el.localName === 'Surface') {
    return byName(el, 'PolygonPatch').map(polygonOf).filter((p): p is Pos[][] => !!p)
  }
  return []
}

function curvePositions(el: Element): Pos[] {
  if (el.localName === 'LineString') return readPositions(el)
  if (el.localName === 'Curve') return byName(el, 'LineStringSegment').flatMap(readPositions)
  return []
}

export function readGeometry(el: Element): GeoJsonGeometry | null {
  switch (el.localName) {
    case 'Point': { const p = readPositions(el)[0]; return p && p.length >= 2 ? { type: 'Point', coordinates: p } : null }
    case 'LineString': case 'Curve': {
      const c = curvePositions(el)
      return c.length >= 2 ? { type: 'LineString', coordinates: c } : null
    }
    case 'Polygon': case 'Surface': {
      const polys = surfacePolygons(el)
      if (polys.length === 0) return null
      return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys }
    }
    case 'MultiSurface': case 'MultiPolygon': {
      const parts = [...el.getElementsByTagName('*')]
        .filter((e) => isGml(e) && (e.localName === 'Polygon' || e.localName === 'Surface'))
        // Skip Polygons nested inside a Surface we already read (none in practice, but cheap).
        .filter((e) => !(e.localName === 'Polygon' && e.parentElement?.closest?.('Surface')))
        .flatMap(surfacePolygons)
      return parts.length ? { type: 'MultiPolygon', coordinates: parts } : null
    }
    case 'MultiCurve': case 'MultiLineString': {
      const parts = [...el.getElementsByTagName('*')]
        .filter((e) => isGml(e) && (e.localName === 'LineString' || e.localName === 'Curve'))
        .map(curvePositions).filter((c) => c.length >= 2)
      return parts.length ? { type: 'MultiLineString', coordinates: parts } : null
    }
    case 'MultiPoint': {
      const pts = byName(el, 'Point').map((p) => readPositions(p)[0]).filter((p): p is Pos => !!p && p.length >= 2)
      return pts.length ? { type: 'MultiPoint', coordinates: pts } : null
    }
    default: return null
  }
}

function swapAxes(g: GeoJsonGeometry): void {
  const sw = (p: Pos): void => { const t = p[0]; p[0] = p[1]; p[1] = t }
  switch (g.type) {
    case 'Point': sw(g.coordinates); break
    case 'MultiPoint': case 'LineString': g.coordinates.forEach(sw); break
    case 'MultiLineString': case 'Polygon': g.coordinates.forEach((r) => r.forEach(sw)); break
    case 'MultiPolygon': g.coordinates.forEach((p) => p.forEach((r) => r.forEach(sw))); break
  }
}

function coordsText(g: GeoJsonGeometry): string {
  if (g.type === 'Point') return g.coordinates.join(' ')
  return g.type
}
