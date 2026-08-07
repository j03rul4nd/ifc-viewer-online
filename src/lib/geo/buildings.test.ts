import { describe, it, expect } from 'vitest'
import {
  resolveBuildingHeight, parseLengthM, parseLevels,
  parseOverpassBuildings, approximateAreaM2, buildOverpassQuery, bboxAround,
  DEFAULT_STOREY_HEIGHT_M, DEFAULT_BUILDING_HEIGHT_M,
  MAX_BUILDING_HEIGHT_M, MIN_FOOTPRINT_AREA_M2,
} from './buildings'

describe('parseLengthM', () => {
  it('reads plain metres, with or without a unit', () => {
    expect(parseLengthM('12')).toBe(12)
    expect(parseLengthM('12.5')).toBe(12.5)
    expect(parseLengthM('12 m')).toBe(12)
    expect(parseLengthM('12m')).toBe(12)
    expect(parseLengthM(' 12 metres ')).toBe(12)
  })

  it('converts feet and inches', () => {
    expect(parseLengthM("40'")).toBeCloseTo(12.192, 3)
    expect(parseLengthM("40'6\"")).toBeCloseTo(12.344, 3)
  })

  it('rejects junk instead of guessing a number out of it', () => {
    for (const bad of [undefined, '', 'tall', 'about 12', '12 storeys', 'NaN']) {
      expect(parseLengthM(bad)).toBeNull()
    }
  })
})

describe('parseLevels', () => {
  it('reads counts, including half levels', () => {
    expect(parseLevels('4')).toBe(4)
    expect(parseLevels('3.5')).toBe(3.5)
  })

  it('rejects negatives, absurd counts and junk', () => {
    expect(parseLevels('-1')).toBeNull()
    expect(parseLevels('500')).toBeNull()
    expect(parseLevels('many')).toBeNull()
    expect(parseLevels(undefined)).toBeNull()
  })
})

describe('resolveBuildingHeight', () => {
  it('prefers a surveyed height and marks it NOT estimated', () => {
    const h = resolveBuildingHeight({ height: '18.5', 'building:levels': '2' })
    expect(h.heightM).toBe(18.5)
    expect(h.estimated).toBe(false)
  })

  it('falls back to levels, flagged as estimated (the metres are our assumption)', () => {
    const h = resolveBuildingHeight({ 'building:levels': '4' })
    expect(h.heightM).toBeCloseTo(4 * DEFAULT_STOREY_HEIGHT_M, 6)
    expect(h.estimated).toBe(true)
  })

  it('falls back to a type-aware default, flagged as estimated', () => {
    expect(resolveBuildingHeight({ building: 'house' }).heightM).toBe(6)
    expect(resolveBuildingHeight({ building: 'garage' }).heightM).toBe(3)
    expect(resolveBuildingHeight({ building: 'apartments' }).heightM).toBe(12)
    expect(resolveBuildingHeight({ building: 'yes' }).heightM).toBe(DEFAULT_BUILDING_HEIGHT_M)
    expect(resolveBuildingHeight(undefined).heightM).toBe(DEFAULT_BUILDING_HEIGHT_M)
    expect(resolveBuildingHeight({ building: 'yes' }).estimated).toBe(true)
  })

  it('clamps absurd heights rather than rendering a 5 km tower', () => {
    expect(resolveBuildingHeight({ height: '99999' }).heightM).toBe(MAX_BUILDING_HEIGHT_M)
  })

  it('keeps min_height below the roof so the extrusion is never inverted', () => {
    const h = resolveBuildingHeight({ height: '10', min_height: '25' })
    expect(h.minHeightM).toBeLessThan(h.heightM)
  })

  it('reads min_height for buildings raised off the ground', () => {
    const h = resolveBuildingHeight({ height: '20', min_height: '6' })
    expect(h.minHeightM).toBe(6)
  })

  it('ignores an unusable height and moves to the next source', () => {
    const h = resolveBuildingHeight({ height: 'tall', 'building:levels': '3' })
    expect(h.heightM).toBeCloseTo(3 * DEFAULT_STOREY_HEIGHT_M, 6)
  })
})

describe('approximateAreaM2', () => {
  it('measures a ~100 m square to within a few percent', () => {
    // 100 m ≈ 0.0008993° latitude at the equator.
    const d = 100 / 111_132
    const ring = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: d * (111_132 / 111_320) },
      { lat: d, lon: d * (111_132 / 111_320) },
      { lat: d, lon: 0 },
    ]
    const area = approximateAreaM2(ring)
    expect(area).toBeGreaterThan(9_500)
    expect(area).toBeLessThan(10_500)
  })

  it('is orientation-independent', () => {
    const ring = [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }, { lat: 0.001, lon: 0.001 }]
    const cw = approximateAreaM2(ring)
    const ccw = approximateAreaM2([...ring].reverse())
    // Relative tolerance: these are thousands of m², so an absolute epsilon
    // would only be measuring float noise in the shoelace sum.
    expect(Math.abs(cw - ccw) / cw).toBeLessThan(1e-9)
  })

  it('is 0 for a degenerate ring', () => {
    expect(approximateAreaM2([{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }])).toBe(0)
  })
})

describe('parseOverpassBuildings', () => {
  const square = (lat: number, lon: number, d = 0.0005) => [
    { lat, lon },
    { lat, lon: lon + d },
    { lat: lat + d, lon: lon + d },
    { lat: lat + d, lon },
    { lat, lon }, // closing vertex, as Overpass emits
  ]

  it('parses ways and strips the duplicated closing vertex', () => {
    const out = parseOverpassBuildings({
      elements: [{ type: 'way', id: 1, tags: { building: 'yes' }, geometry: square(41.38, 2.17) }],
    })
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('w1')
    expect(out[0].ring).toHaveLength(4)
  })

  it('takes only the OUTER rings of a multipolygon relation', () => {
    const out = parseOverpassBuildings({
      elements: [{
        type: 'relation', id: 7, tags: { building: 'yes' },
        members: [
          { type: 'way', role: 'outer', geometry: square(41.38, 2.17) },
          { type: 'way', role: 'inner', geometry: square(41.3801, 2.1701, 0.0001) },
          { type: 'way', role: 'outer', geometry: square(41.39, 2.18) },
        ],
      }],
    })
    expect(out.map((b) => b.id)).toEqual(['r7-0', 'r7-1'])
  })

  it('drops slivers below the minimum footprint area', () => {
    // ~1 m square — mapping noise.
    const tiny = square(41.38, 2.17, 0.000009)
    const out = parseOverpassBuildings({
      elements: [{ type: 'way', id: 2, tags: { building: 'yes' }, geometry: tiny }],
    })
    expect(out).toHaveLength(0)
    expect(approximateAreaM2(tiny.slice(0, -1))).toBeLessThan(MIN_FOOTPRINT_AREA_M2)
  })

  it('drops rings with too few points to be a polygon', () => {
    const out = parseOverpassBuildings({
      elements: [{ type: 'way', id: 3, geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }] }],
    })
    expect(out).toHaveLength(0)
  })

  it('skips vertices with non-finite coordinates', () => {
    const out = parseOverpassBuildings({
      elements: [{
        type: 'way', id: 4, tags: { building: 'yes' },
        geometry: [...square(41.38, 2.17), { lat: NaN, lon: 2.17 }],
      }],
    })
    expect(out).toHaveLength(1)
    for (const p of out[0].ring) {
      expect(Number.isFinite(p.lat)).toBe(true)
      expect(Number.isFinite(p.lon)).toBe(true)
    }
  })

  it('survives malformed responses instead of throwing mid-render', () => {
    for (const junk of [null, undefined, {}, { elements: null }, { elements: [null, 5, 'x'] }]) {
      expect(parseOverpassBuildings(junk)).toEqual([])
    }
  })

  it('carries the resolved height through', () => {
    const out = parseOverpassBuildings({
      elements: [{
        type: 'way', id: 5, tags: { building: 'yes', height: '30' },
        geometry: square(41.38, 2.17),
      }],
    })
    expect(out[0].height.heightM).toBe(30)
    expect(out[0].height.estimated).toBe(false)
  })
})

describe('buildOverpassQuery', () => {
  const bbox = { south: 41.38, west: 2.17, north: 41.39, east: 2.18 }

  it('asks for ways AND relations, with inline geometry', () => {
    const q = buildOverpassQuery(bbox)
    expect(q).toContain('way["building"]')
    expect(q).toContain('relation["building"]')
    expect(q).toContain('out geom')
  })

  it('always bounds server work and result size', () => {
    const q = buildOverpassQuery(bbox, 15, 500)
    expect(q).toContain('[timeout:15]')
    expect(q).toContain('out geom 500;')
  })

  it('emits the bbox in Overpass order (south, west, north, east)', () => {
    expect(buildOverpassQuery(bbox)).toContain('(41.380000,2.170000,41.390000,2.180000)')
  })
})

describe('bboxAround', () => {
  it('spans roughly twice the requested half-size', () => {
    const b = bboxAround(0, 0, 1000)
    expect((b.north - b.south) * 111_132).toBeGreaterThan(1900)
    expect((b.north - b.south) * 111_132).toBeLessThan(2100)
  })

  it('widens in longitude as latitude increases', () => {
    const equator = bboxAround(0, 0, 1000)
    const north = bboxAround(60, 0, 1000)
    expect(north.east - north.west).toBeGreaterThan(equator.east - equator.west)
  })

  it('stays finite at the poles', () => {
    const b = bboxAround(89.9, 0, 1000)
    expect(Number.isFinite(b.east)).toBe(true)
    expect(b.east).toBeLessThanOrEqual(180)
    expect(b.north).toBeLessThanOrEqual(85)
  })

  it('never exceeds valid coordinate ranges', () => {
    const b = bboxAround(-85, 179.99, 50_000)
    expect(b.south).toBeGreaterThanOrEqual(-85)
    expect(b.east).toBeLessThanOrEqual(180)
  })
})
