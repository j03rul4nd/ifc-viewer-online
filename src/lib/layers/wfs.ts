// ─── wfs ──────────────────────────────────────────────────────────────────────
// OGC Web Feature Service, as servers actually implement it — not as the spec
// reads. Seen in production, all in one region (see __fixtures__):
//
//   Catastro (INSPIRE)  WFS 2.0, GML 3.2 ONLY, DefaultCRS " urn:ogc:def:crs:EPSG::4326"
//                       (leading space), UTM zones in OtherCRS, no paging.
//   ICGC (ArcGIS)       WFS 2.0, JSON advertised as the bare token "GEOJSON"
//                       (DescribeFeatureType next to it is GML-only).
//   IGN / GeoServer     WFS 2.0, "application/geo+json" (not application/json),
//                       DefaultCRS as an http://www.opengis.net/def/crs URL.
//
// So nothing is assumed:
//   • the output format is the EXACT token the server lists for GetFeature —
//     JSON when there is one, GML (gml.ts) otherwise;
//   • the request CRS is a PROJECTED one the type offers for the site when
//     there is one (metres, no axis-order roulette), else its geographic one;
//   • the BBOX is written in that CRS, in that version's axis order;
//   • the GetFeature endpoint is the one the capabilities declare;
//   • paging (startIndex) is used only where ImplementsResultPaging is TRUE.
//
// Pure: strings, DOMParser and crs.ts. No fetch — the runner owns the network.

import { normalizeEpsgCode, resolveCrs, wgs84ToGrid } from '../geo/crs'

export type WfsVersion = '1.0.0' | '1.1.0' | '2.0.0'

export interface WfsFeatureType {
  /** Qualified name to request, e.g. "cp:CadastralParcel". */
  name: string
  title: string
  /** Default CRS as advertised (trimmed), e.g. "urn:ogc:def:crs:EPSG::25831". */
  defaultCrs: string | null
  /** Other CRSs the type can be served in. */
  otherCrs: string[]
  /** WGS84 bounding box [west, south, east, north], when advertised. */
  wgs84Bbox: [number, number, number, number] | null
  /** True when a JSON output format exists for this type (or GetFeature globally). */
  supportsJson: boolean
}

export interface WfsCapabilities {
  version: WfsVersion
  title: string
  featureTypes: WfsFeatureType[]
  /** Output formats GetFeature accepts, exactly as advertised. */
  getFeatureFormats: string[]
  /** The JSON token to send, exactly as advertised, or null (→ GML). */
  jsonFormat: string | null
  /** WFS 2.0 ImplementsResultPaging. */
  paging: boolean
  /** Server's default/maximum page size (CountDefault), when stated. */
  countDefault: number | null
  /** GetFeature GET endpoint from the capabilities, when declared. */
  getFeatureUrl: string | null
}

const JSON_PREFERENCE = ['application/geo+json', 'application/json', 'geojson', 'json', 'application/vnd.geo+json']

export function isJsonFormat(s: string | null | undefined): boolean {
  const v = (s ?? '').trim().toLowerCase()
  return JSON_PREFERENCE.some((f) => v === f || v.startsWith(f + ';') || v.startsWith(f + ' '))
}

function pickJson(formats: string[]): string | null {
  for (const want of JSON_PREFERENCE) {
    const hit = formats.find((f) => f.trim().toLowerCase() === want || f.trim().toLowerCase().startsWith(want + ';'))
    if (hit) return hit.trim()
  }
  return null
}

/** Strip the query the user pasted, keeping the endpoint's own fixed params (map=…). */
function baseParams(endpoint: string): URL {
  const url = new URL(endpoint)
  for (const k of [...url.searchParams.keys()]) {
    if (['service', 'request', 'version', 'typename', 'typenames', 'outputformat', 'srsname', 'bbox', 'count',
      'maxfeatures', 'startindex', 'resulttype'].includes(k.toLowerCase())) url.searchParams.delete(k)
  }
  return url
}

export function buildGetCapabilitiesUrl(endpoint: string, version: WfsVersion = '2.0.0'): string {
  const url = baseParams(endpoint)
  url.searchParams.set('service', 'WFS')
  url.searchParams.set('request', 'GetCapabilities')
  // Asking for a version is a hint; servers answer with the highest they share.
  url.searchParams.set('acceptversions', '2.0.0,1.1.0,1.0.0')
  if (version !== '2.0.0') url.searchParams.set('version', version)
  return url.toString()
}

/** Read a GetCapabilities XML. Null when it is not a WFS capabilities document. */
export function parseCapabilities(xml: string): WfsCapabilities | null {
  let doc: Document
  try { doc = new DOMParser().parseFromString(xml, 'application/xml') } catch { return null }
  const root = doc.documentElement
  if (!root || !/WFS_Capabilities$/.test(root.localName) || doc.getElementsByTagName('parsererror').length) return null

  const v = root.getAttribute('version') ?? ''
  const version: WfsVersion = v.startsWith('2') ? '2.0.0' : v.startsWith('1.1') ? '1.1.0' : '1.0.0'
  const all = (el: Element | Document, name: string): Element[] =>
    [...el.getElementsByTagName('*')].filter((e) => e.localName === name)
  const text = (el: Element, name: string): string =>
    [...el.children].find((c) => c.localName === name)?.textContent?.trim() ?? ''

  const serviceId = all(doc, 'ServiceIdentification')[0] ?? all(doc, 'Service')[0]
  const title = serviceId ? text(serviceId, 'Title') : ''

  // GetFeature's own outputFormat (ICGC: GML32…GEOJSON…CSV), else the
  // service-wide one under OperationsMetadata (IGN declares it there). Never
  // another operation's: DescribeFeatureType's list is schema formats.
  const getFeatureOp = all(doc, 'Operation').find((op) => op.getAttribute('name') === 'GetFeature')
  let formats: string[] = []
  let getFeatureUrl: string | null = null
  if (getFeatureOp) {
    const outParam = all(getFeatureOp, 'Parameter').find((p) => p.getAttribute('name')?.toLowerCase() === 'outputformat')
    const global = all(doc, 'OperationsMetadata')[0]
    const globalParam = global
      ? [...global.children].find((c) => c.localName === 'Parameter' && c.getAttribute('name')?.toLowerCase() === 'outputformat')
      : undefined
    const src = outParam ?? globalParam
    formats = src ? all(src, 'Value').map((x) => x.textContent?.trim() ?? '').filter(Boolean) : []
    getFeatureUrl = all(getFeatureOp, 'Get')[0]?.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? null
  } else {
    // WFS 1.0: <Capability><Request><GetFeature><ResultFormat><GML2/><GEOJSON/>…
    const gf = all(doc, 'GetFeature')[0]
    const rf = gf ? all(gf, 'ResultFormat')[0] : undefined
    formats = rf ? [...rf.children].map((c) => c.localName) : []
    getFeatureUrl = gf ? all(gf, 'Get')[0]?.getAttribute('onlineResource') ?? null : null
  }
  const constraint = (name: string): string | null => {
    const c = all(doc, 'Constraint').find((x) => x.getAttribute('name') === name)
    return c ? (all(c, 'DefaultValue')[0]?.textContent?.trim() ?? null) : null
  }
  const countDefault = Number(constraint('CountDefault'))
  const jsonFormat = pickJson(formats)

  const featureTypes = all(doc, 'FeatureType').map((ft): WfsFeatureType => {
    const lower = all(ft, 'LowerCorner')[0]?.textContent?.trim().split(/\s+/).map(Number)
    const upper = all(ft, 'UpperCorner')[0]?.textContent?.trim().split(/\s+/).map(Number)
    let bbox = lower && upper && lower.length >= 2 && upper.length >= 2 && [...lower, ...upper].every(Number.isFinite)
      ? [lower[0], lower[1], upper[0], upper[1]] as [number, number, number, number]
      : null
    if (!bbox) {
      // WFS 1.0/1.1: <LatLongBoundingBox minx= …/>
      const ll = all(ft, 'LatLongBoundingBox')[0]
      const n = ll ? ['minx', 'miny', 'maxx', 'maxy'].map((a) => Number(ll.getAttribute(a))) : null
      if (n && n.every(Number.isFinite)) bbox = n as [number, number, number, number]
    }
    const perType = all(ft, 'Format').map((f) => f.textContent?.trim() ?? '')
    return {
      name: text(ft, 'Name'),
      title: text(ft, 'Title') || text(ft, 'Name'),
      defaultCrs: (text(ft, 'DefaultCRS') || text(ft, 'DefaultSRS') || text(ft, 'SRS')).trim() || null,
      otherCrs: [...all(ft, 'OtherCRS'), ...all(ft, 'OtherSRS')].map((e) => e.textContent?.trim() ?? '').filter(Boolean),
      wgs84Bbox: bbox,
      supportsJson: perType.some(isJsonFormat) || !!jsonFormat,
    }
  }).filter((f) => f.name)

  return {
    version, title, featureTypes,
    getFeatureFormats: formats,
    jsonFormat,
    paging: (constraint('ImplementsResultPaging') ?? '').toUpperCase() === 'TRUE',
    countDefault: Number.isFinite(countDefault) && countDefault > 0 ? countDefault : null,
    getFeatureUrl,
  }
}

// ── Request planning ───────────────────────────────────────────────────────────

const GEOGRAPHIC = new Set(['EPSG:4326', 'EPSG:4258', 'EPSG:4979', 'EPSG:4937'])

export interface GetFeaturePlan {
  url: string
  format: 'json' | 'gml'
  /** CRS the response coordinates will be in (srsName sent). */
  srsName: string
  /** Page size requested. */
  pageSize: number
  /** Whether to follow with startIndex pages. */
  paging: boolean
}

export interface PlanRequest {
  endpoint: string
  caps: WfsCapabilities
  typeName: string
  /** Area of interest in WGS84 [west, south, east, north]. */
  bbox: [number, number, number, number] | null
  maxFeatures: number
  startIndex?: number
}

/**
 * The CRS to ask for: a projected one the type offers whose domain covers the
 * site (metres, unambiguous axes), else the type's default geographic one.
 */
export function chooseRequestCrs(ft: WfsFeatureType, lon: number, lat: number): string {
  const offered = [ft.defaultCrs, ...ft.otherCrs].filter((c): c is string => !!c)
  // UTM zones overlap in their declared domains (Barcelona sits in both 30N
  // and 31N's); the right one is the zone the longitude falls in.
  const zone = Math.floor((lon + 180) / 6) + 1
  let best: { crs: string; score: number } | null = null
  for (const c of offered) {
    const code = normalizeEpsgCode(c)
    if (!code || GEOGRAPHIC.has(code)) continue
    const def = resolveCrs(code)
    if (!def.ok) continue
    const [w, s, e, n] = def.value.domain
    if (lon < w || lon > e || lat < s || lat > n) continue
    const num = Number(code.slice(5))
    const utmZone = num >= 25828 && num <= 25838 ? num - 25800 : num >= 32601 && num <= 32660 ? num - 32600 : null
    const score = utmZone === null ? 1 : Math.abs(utmZone - zone)
    if (!best || score < best.score) best = { crs: c, score }
  }
  return best?.crs ?? ft.defaultCrs ?? 'urn:ogc:def:crs:EPSG::4326'
}

/** BBOX parameter value for a WGS84 box, in `crs`, in the order `version` expects. */
export function bboxParam(bbox: [number, number, number, number], crs: string, version: WfsVersion): string {
  const [w, s, e, n] = bbox
  const code = normalizeEpsgCode(crs)
  if (code && !GEOGRAPHIC.has(code)) {
    const def = resolveCrs(code)
    if (def.ok) {
      const corners = [[w, s], [w, n], [e, s], [e, n]].map(([lon, lat]) => wgs84ToGrid(def.value, lat, lon))
      if (corners.every((c) => c.ok)) {
        const xs = corners.map((c) => (c.ok ? c.value.eastings : 0))
        const ys = corners.map((c) => (c.ok ? c.value.northings : 0))
        const box = `${Math.min(...xs)},${Math.min(...ys)},${Math.max(...xs)},${Math.max(...ys)}`
        return version === '1.0.0' ? box : `${box},${crs}`
      }
    }
  }
  // Geographic. 1.0: always x/y = lon/lat, no suffix. 1.1/2.0 with an
  // authority (URN/URL) CRS: lat/lon. CRS84 or short "EPSG:4326": lon/lat.
  if (version === '1.0.0') return `${w},${s},${e},${n}`
  const latFirst = /urn:|opengis\.net\/def/i.test(crs) && !/CRS:?84/i.test(crs)
  return latFirst ? `${s},${w},${n},${e},${crs}` : `${w},${s},${e},${n},${crs}`
}

export function planGetFeature(req: PlanRequest): GetFeaturePlan | null {
  const ft = req.caps.featureTypes.find((f) => f.name === req.typeName)
  if (!ft) return null
  const v = req.caps.version
  const json = req.caps.jsonFormat
  const center = req.bbox
    ? [(req.bbox[0] + req.bbox[2]) / 2, (req.bbox[1] + req.bbox[3]) / 2]
    : ft.wgs84Bbox ? [(ft.wgs84Bbox[0] + ft.wgs84Bbox[2]) / 2, (ft.wgs84Bbox[1] + ft.wgs84Bbox[3]) / 2] : [0, 0]
  const srsName = chooseRequestCrs(ft, center[0], center[1])
  const paging = v === '2.0.0' && req.caps.paging
  const pageSize = Math.max(1, Math.min(req.maxFeatures, req.caps.countDefault ?? req.maxFeatures))

  const endpoint = req.caps.getFeatureUrl && /^https?:/i.test(req.caps.getFeatureUrl) ? req.caps.getFeatureUrl : req.endpoint
  const url = baseParams(endpoint)
  url.searchParams.set('service', 'WFS')
  url.searchParams.set('request', 'GetFeature')
  url.searchParams.set('version', v)
  url.searchParams.set(v === '2.0.0' ? 'typeNames' : 'typeName', req.typeName)
  if (json) url.searchParams.set('outputFormat', json)
  url.searchParams.set('srsName', v === '1.0.0' ? (normalizeEpsgCode(srsName) ?? srsName) : srsName)
  url.searchParams.set(v === '2.0.0' ? 'count' : 'maxFeatures', String(paging ? pageSize : req.maxFeatures))
  if (paging && req.startIndex) url.searchParams.set('startIndex', String(req.startIndex))
  if (req.bbox) url.searchParams.set('bbox', bboxParam(req.bbox, srsName, v))
  return { url: url.toString(), format: json ? 'json' : 'gml', srsName, pageSize, paging }
}

/**
 * The bbox (WGS84) around a point, `radiusM` metres each way. What a connector
 * should ask a server for by default: the area the twin is about.
 */
export function bboxAround(lat: number, lon: number, radiusM: number): [number, number, number, number] {
  const dLat = radiusM / 111_320
  const dLon = radiusM / (111_320 * Math.max(0.01, Math.cos(lat * Math.PI / 180)))
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat]
}
