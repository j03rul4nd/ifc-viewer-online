import { describe, it, expect } from 'vitest'
import { parseGeoJson, projectLayer } from './geojson'
import { bboxAround } from './wfs'
import { anchorFromPlacement } from '../geo/scene-anchor'

const anchor = anchorFromPlacement(
  { lat: 41.38, lon: 2.17, rotationDeg: 0, heightOffsetM: 0, source: 'ifc', confidence: 'high' },
  { x: 0, z: 0 }, 0, 'test',
)

describe('parseGeoJson', () => {
  it('reads an RFC 7946 collection of every geometry kind', () => {
    const r = parseGeoJson({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', id: 7, geometry: { type: 'Point', coordinates: [2.17, 41.38] }, properties: { name: 'a' } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[2.17, 41.38], [2.171, 41.381]] }, properties: {} },
        { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [[[[2.17, 41.38], [2.171, 41.38], [2.171, 41.381], [2.17, 41.38]]]] }, properties: { height: 12 } },
        { type: 'Feature', geometry: null, properties: {} },
      ],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.counts).toEqual({ point: 1, line: 1, polygon: 1 })
    expect(r.value.skipped).toBe(1)
    expect(r.value.features[0].id).toBe('7')
    expect(r.value.sourceCrs).toBe('CRS84')
    expect(r.value.bbox).toEqual([2.17, 41.38, 2.171, 41.381])
    expect(r.value.propertyKeys).toEqual(['height', 'name'])
  })

  it('reprojects a legacy `crs` member (ETRS89 / UTM 31N) to WGS84', () => {
    const r = parseGeoJson(JSON.stringify({
      type: 'FeatureCollection',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::25831' } },
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [431000, 4582000, 15] }, properties: {} }],
    }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const [lon, lat, z] = (r.value.features[0].geometry as { coords: number[][] }).coords[0]
    expect(lat).toBeCloseTo(41.385, 2)
    expect(lon).toBeCloseTo(2.17, 1)
    expect(z).toBe(15)
    expect(r.value.sourceCrs).toBe('EPSG:25831')
    expect(r.value.heightSource).toBe('coordinates')
  })

  it('refuses projected coordinates with no CRS instead of guessing', () => {
    const r = parseGeoJson({ type: 'Point', coordinates: [431000, 4582000] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toBe('projectedWithoutCrs')
  })

  it('reports a CRS it cannot resolve so the UI can ask for one', () => {
    const r = parseGeoJson({ type: 'Point', coordinates: [1, 2] }, { crs: 'EPSG:999999' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toBe('unknownCrs')
  })

  it('swaps lat,lon answers when told to detect it', () => {
    // Shanghai written lat,lon: 121 cannot be a latitude.
    const r = parseGeoJson({ type: 'Point', coordinates: [31.24, 121.5] }, { axisOrder: 'auto' })
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.value.features[0].geometry as { coords: number[][] }).coords[0]).toEqual([121.5, 31.24])
  })

  it('finds a height column, and rejects garbage', () => {
    const r = parseGeoJson({
      type: 'FeatureCollection',
      features: [1, 2, 3].map((i) => ({
        type: 'Feature', properties: { altura: String(i * 3) },
        geometry: { type: 'Polygon', coordinates: [[[2.17, 41.38], [2.171, 41.38], [2.171, 41.381], [2.17, 41.38]]] },
      })),
    })
    expect(r.ok && r.value.heightSource).toBe('property')
    expect(r.ok && r.value.heightProperty).toBe('altura')
    expect(parseGeoJson('{nope').ok).toBe(false)
    expect(parseGeoJson({ type: 'Topology' }).ok).toBe(false)
  })
})

describe('projectLayer', () => {
  const zone = parseGeoJson({
    type: 'Feature', properties: { height: 20 },
    geometry: { type: 'Polygon', coordinates: [[[2.17, 41.38], [2.171, 41.38], [2.171, 41.381], [2.17, 41.38]]] },
  })

  it('a polygon with a height column becomes an extrusion on the ground', () => {
    if (!zone.ok) throw new Error('parse')
    const [f] = projectLayer(zone.value, anchor, 'relative')
    expect(f.type).toBe('polygon')
    expect(f.extrusionM).toBe(20)
    expect(f.ringCounts).toEqual([1])
    expect(f.lists[0][0]).toEqual({ x: 0, y: 0, z: 0 })
    // 0.001° of longitude at 41.38° N ≈ 83.6 m east.
    expect(f.lists[0][1].x).toBeCloseTo(83.6, 0)
    expect(f.lists[0][2].z).toBeCloseTo(-111.1, 0)
  })

  it('a 3D route keeps its z as height above ground in relative mode', () => {
    const r = parseGeoJson({ type: 'LineString', coordinates: [[2.17, 41.38, 5], [2.171, 41.38, 9]] })
    if (!r.ok) throw new Error('parse')
    const [f] = projectLayer(r.value, anchor, 'relative')
    expect(f.lists[0].map((p) => p.y)).toEqual([5, 9])
    const [flat] = projectLayer(r.value, anchor, 'ignore')
    expect(flat.lists[0].map((p) => p.y)).toEqual([0, 0])
  })
})

describe('wfs', () => {
  it('bboxAround spans the requested radius', () => {
    const [w, s, e, n] = bboxAround(41.38, 2.17, 500)
    expect((n - s) * 111_320).toBeCloseTo(1000, 0)
    expect(e).toBeGreaterThan(2.17)
    expect(w).toBeLessThan(2.17)
  })
})
