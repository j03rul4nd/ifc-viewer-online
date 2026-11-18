// Tests against REAL responses recorded from the Barcelona sources on
// 2026-10-08 (see __fixtures__). Every quirk asserted here was observed, not
// assumed — each one broke the first, spec-reading version of this code.

import { describe, it, expect } from 'vitest'
import { parseCapabilities, planGetFeature, bboxParam, chooseRequestCrs } from './wfs'
import { parseGml, decodeXml, latFirst } from './gml'
import { parseGeoJson } from './geojson'
import {
  gbfsFeedUrls, gbfsToGeoJson, gbfsFreshness, gtfsRtToGeoJson, gtfsRtFreshness, httpFreshness,
  plannedDelayMs, detectFeedKind, odsDataset, odsGeoJsonUrl, odsGeoField,
} from './feeds'
import { normalizeEpsgCode } from '../geo/crs'

const files = import.meta.glob('./__fixtures__/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const fx = (name: string): string => files[`./__fixtures__/${name}`]
// The trimmed Catastro sample is pure ASCII, so its bytes are its characters.
const fxBytes = (name: string): ArrayBuffer => new TextEncoder().encode(fx(name)).buffer as ArrayBuffer
const SITE: [number, number, number, number] = [2.164, 41.388, 2.170, 41.392] // Passeig de Gràcia

describe('WFS capabilities as served', () => {
  it('Catastro: WFS 2.0, GML only, padded DefaultCRS, UTM 31N among OtherCRS, no paging', () => {
    const c = parseCapabilities(fx('caps-catastro.xml'))!
    expect(c.version).toBe('2.0.0')
    expect(c.jsonFormat).toBeNull()
    expect(c.paging).toBe(false)
    const parcel = c.featureTypes.find((f) => f.name === 'cp:CadastralParcel')!
    expect(parcel.defaultCrs).toBe('urn:ogc:def:crs:EPSG::4326') // trimmed
    expect(parcel.otherCrs).toContain('urn:ogc:def:crs:EPSG::25831')
    // For a Barcelona site, ask in metres (UTM 31N), not in lat/lon.
    expect(normalizeEpsgCode(chooseRequestCrs(parcel, 2.167, 41.39))).toBe('EPSG:25831')
  })

  it('ICGC: JSON as the bare token "GEOJSON", read from GetFeature (not DescribeFeatureType)', () => {
    const c = parseCapabilities(fx('caps-icgc.xml'))!
    expect(c.getFeatureFormats).toContain('GML32')
    expect(c.jsonFormat).toBe('GEOJSON')
    expect(c.featureTypes.length).toBeGreaterThan(10)
  })

  it('IGN: picks the exact JSON token it lists (application/geo+json)', () => {
    const c = parseCapabilities(fx('caps-ign.xml'))!
    expect(c.jsonFormat).toBe('application/geo+json')
    expect(normalizeEpsgCode(c.featureTypes[0].defaultCrs)).toBe('EPSG:4258')
  })

  it('plans a Catastro request: GML, UTM bbox in metres with CRS suffix, no outputFormat', () => {
    const caps = parseCapabilities(fx('caps-catastro.xml'))!
    const plan = planGetFeature({
      endpoint: 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx', caps, typeName: 'cp:CadastralParcel', bbox: SITE, maxFeatures: 500,
    })!
    const u = new URL(plan.url)
    expect(plan.format).toBe('gml')
    expect(u.searchParams.get('outputFormat')).toBeNull()
    expect(u.searchParams.get('typeNames')).toBe('cp:CadastralParcel')
    const [x0, y0, x1, y1, crs] = u.searchParams.get('bbox')!.split(',')
    expect(Number(x0)).toBeGreaterThan(430_000)
    expect(Number(y1)).toBeGreaterThan(4_582_000)
    expect(Number(x1) - Number(x0)).toBeGreaterThan(400)
    expect(Number(y1) - Number(y0)).toBeGreaterThan(400)
    expect(crs).toBe('urn:ogc:def:crs:EPSG::25831')
  })

  it('writes geographic bboxes in each version’s axis order', () => {
    expect(bboxParam(SITE, 'urn:ogc:def:crs:EPSG::4326', '2.0.0')).toBe('41.388,2.164,41.392,2.17,urn:ogc:def:crs:EPSG::4326')
    expect(bboxParam(SITE, 'urn:ogc:def:crs:OGC:1.3:CRS84', '2.0.0')).toBe('2.164,41.388,2.17,41.392,urn:ogc:def:crs:OGC:1.3:CRS84')
    expect(bboxParam(SITE, 'EPSG:4326', '1.0.0')).toBe('2.164,41.388,2.17,41.392')
  })
})

describe('GML as served', () => {
  it('Catastro parcels: MultiSurface→Surface→PolygonPatch, URL srsName, reference point kept as attribute', () => {
    const g = parseGml(decodeXml(fxBytes('catastro-cp-2members.gml')))!
    expect(g.crs).toBe('EPSG:25831')
    expect(g.numberMatched).toBe(46)
    const f0 = g.geojson.features[0] as { id: string; geometry: { type: string; coordinates: number[][][][] }; properties: Record<string, unknown> }
    expect(f0.id).toBe('ES.SDGC.CP.0526605DF3802F')
    expect(f0.geometry.type).toBe('MultiPolygon')
    expect(f0.geometry.coordinates[0][0].length).toBe(27)
    expect(f0.properties.nationalCadastralReference).toBe('0526605DF3802F')
    expect(f0.properties.areaValue).toBe(906)
    expect(f0.properties.endLifespanVersion).toBeNull()
    expect(f0.properties.inspireId).toEqual({ localId: '0526605DF3802F', namespace: 'ES.SDGC.CP' })
    expect(f0.properties.referencePoint).toBe('430529.19 4582488.45')
    // And the whole thing becomes a layer in WGS84, on Passeig de Gràcia.
    const layer = parseGeoJson(g.geojson)
    expect(layer.ok).toBe(true)
    if (layer.ok) {
      const [w, s] = layer.value.bbox!
      expect(w).toBeCloseTo(2.166, 2)
      expect(s).toBeCloseTo(41.39, 2)
    }
  })

  it('decodes ISO-8859-1 bodies by their XML declaration', () => {
    const xml = '<?xml version="1.0" encoding="ISO-8859-1"?><wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:x="urn:x"><wfs:member><x:F gml:id="a"><x:nom>Plaça Catalunya</x:nom><x:g><gml:Point srsName="EPSG:4326"><gml:pos>2.17 41.387</gml:pos></gml:Point></x:g></x:F></wfs:member></wfs:FeatureCollection>'
    const bytes = new Uint8Array([...xml].map((c) => c.charCodeAt(0)))
    const g = parseGml(decodeXml(bytes.buffer))!
    const f = g.geojson.features[0] as { properties: { nom: string }; geometry: { coordinates: number[] } }
    expect(f.properties.nom).toBe('Plaça Catalunya')
    // Short "EPSG:4326" = lon/lat (no swap); the URN form would be lat/lon.
    expect(f.geometry.coordinates).toEqual([2.17, 41.387])
    expect(latFirst('urn:ogc:def:crs:EPSG::4326')).toBe(true)
    expect(latFirst('http://www.opengis.net/def/crs/EPSG/0/4258')).toBe(true)
    expect(latFirst('EPSG:4326')).toBe(false)
    expect(latFirst('urn:ogc:def:crs:OGC:1.3:CRS84')).toBe(false)
  })

  it('normalises the OGC URL form of an EPSG code', () => {
    expect(normalizeEpsgCode('http://www.opengis.net/def/crs/EPSG/0/25831')).toBe('EPSG:25831')
    expect(normalizeEpsgCode(' urn:ogc:def:crs:EPSG::4326')).toBe('EPSG:4326')
  })
})

describe('GBFS (Bicing) as served', () => {
  it('auto-discovery (3.0 flat feeds) → station_information + station_status, joined', () => {
    const urls = gbfsFeedUrls(JSON.parse(fx('gbfs-bcn-discovery.json')))
    expect(urls.station_status).toMatch(/station_status$/)
    const info = JSON.parse(fx('gbfs-bcn-station_information.json'))
    const status = JSON.parse(fx('gbfs-bcn-station_status.json'))
    const gj = JSON.parse(gbfsToGeoJson(info, status))
    expect(gj.features.length).toBe(3)
    const p = gj.features[0].properties
    expect(p.station_id).toBe('1')
    expect(p.name).toMatch(/GRAN VIA/) // 3.0 localized name array → text
    expect(typeof p.bikes_available).toBe('number')
    expect(['ok', 'low', 'empty', 'full', 'out_of_service']).toContain(p.state)
    expect(Object.keys(p).some((k) => k.startsWith('available_'))).toBe(true)
    // ttl 0 means "real time", not "valid for 0 s forever": no validity claimed.
    const f = gbfsFreshness(status)
    expect(f.validForS).toBeNull()
    expect(f.dataAt).toBeGreaterThan(Date.parse('2026-01-01'))
  })
})

describe('GTFS-Realtime (Renfe) as served', () => {
  it('vehicle positions → points, entities without position skipped, line from the label', () => {
    const feed = JSON.parse(fx('renfe-vehicle_positions.json'))
    const all = JSON.parse(gtfsRtToGeoJson(feed))
    expect(all.features.length).toBe(6) // 7 entities, one without a position
    const bcn = JSON.parse(gtfsRtToGeoJson(feed, [1.9, 41.2, 2.5, 41.7]))
    expect(bcn.features.length).toBe(4)
    expect(bcn.features.map((f: { properties: { line: string } }) => f.properties.line)).toEqual(['R2N', 'R2S', 'R1', 'R2S'])
    expect(gtfsRtFreshness(feed).dataAt).toBeGreaterThan(Date.parse('2026-01-01'))
  })
})

describe('refresh policy', () => {
  it('reads Renfe-style headers (two Cache-Control, Expires, ETag)', () => {
    const now = Date.parse('Thu, 08 Oct 2026 08:38:20 GMT')
    const h = new Headers({
      'cache-control': 'max-age=30, public', expires: 'Thu, 08 Oct 2026 08:38:50 GMT',
      etag: '"6ac75670-6314"', 'last-modified': 'Thu, 08 Oct 2026 08:38:08 GMT',
    })
    const f = httpFreshness(h, now)
    expect(f.validForS).toBe(30)
    expect(f.fingerprint).toBe('"6ac75670-6314"')
    // User asked 5 s; the source says 30: ask every 30.
    expect(plannedDelayMs(5, f, now)).toBe(30_000)
  })

  it('spreads an Opendatasoft daily quota until its reset', () => {
    const now = Date.parse('2026-10-08T12:00:00Z')
    const h = new Headers({
      'cache-control': 'no-cache, no-store, max-age=0, must-revalidate',
      'x-ratelimit-remaining': '4488', 'x-ratelimit-limit': '5000', 'x-ratelimit-reset': '2026-10-09 00:00:00+00:00',
    })
    const f = httpFreshness(h, now)
    expect(f.quota).toEqual({ remaining: 4488, limit: 5000, resetAt: Date.parse('2026-10-09T00:00:00Z') })
    // 12 h left, 80 % of 4488 usable → ~12 s apart; a 2 s wish is overruled.
    const ms = plannedDelayMs(2, f, now)
    expect(ms).toBeGreaterThan(11_000)
    expect(ms).toBeLessThan(13_000)
    // Nearly out of quota: slow right down.
    const tight = httpFreshness(new Headers({ 'x-ratelimit-remaining': '10', 'x-ratelimit-reset': '2026-10-09 00:00:00+00:00' }), now)
    expect(plannedDelayMs(2, tight, now)).toBeGreaterThan(3_600_000 - 1)
  })

  it('recognises the protocol from the URL', () => {
    expect(detectFeedKind('https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/gbfs.json')).toBe('gbfs')
    expect(detectFeedKind('https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/posicionament-dels-trens/records')).toBe('ods')
    expect(detectFeedKind('https://gtfsrt.renfe.com/vehicle_positions.pb')).toBe('gtfs-rt')
    expect(detectFeedKind('https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&request=GetCapabilities')).toBe('wfs')
    expect(detectFeedKind('https://example.org/data.geojson')).toBe('geojson')
  })

  it('Opendatasoft: export URL with an in_bbox filter on the dataset’s own geo field', () => {
    const ds = odsDataset('https://dadesobertes.fgc.cat/explore/dataset/posicionament-dels-trens/table/')!
    expect(ds.id).toBe('posicionament-dels-trens')
    expect(odsGeoField({ fields: [{ name: 'lin', type: 'text' }, { name: 'geo_point_2d', type: 'geo_point_2d' }] })).toBe('geo_point_2d')
    const u = new URL(odsGeoJsonUrl(ds, 'geo_point_2d', [2.05, 41.35, 2.25, 41.45]))
    expect(u.pathname).toMatch(/\/exports\/geojson$/)
    expect(u.searchParams.get('where')).toBe('in_bbox(geo_point_2d,41.35,2.05,41.45,2.25)')
  })
})
