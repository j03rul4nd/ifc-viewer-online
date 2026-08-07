import { describe, it, expect } from 'vitest'
import {
  classifyFeature, parseOsmColor, parseRoofShape, resolveFeatureStyle,
  parseOsmFeatures, buildFeaturesQuery, bridgeWidth, countByKind,
  roadWidth, railWidth, roadTone,
  FEATURE_KINDS, MIN_AREA_M2,
  type OsmFeature,
} from './osm-features'

describe('classifyFeature', () => {
  it('recognises each layer from its canonical tags', () => {
    expect(classifyFeature({ building: 'yes' })).toBe('building')
    expect(classifyFeature({ natural: 'water' })).toBe('water')
    expect(classifyFeature({ waterway: 'riverbank' })).toBe('water')
    expect(classifyFeature({ landuse: 'reservoir' })).toBe('water')
    expect(classifyFeature({ leisure: 'park' })).toBe('green')
    expect(classifyFeature({ landuse: 'forest' })).toBe('green')
    expect(classifyFeature({ natural: 'wood' })).toBe('green')
    expect(classifyFeature({ natural: 'tree' })).toBe('tree')
    expect(classifyFeature({ man_made: 'bridge' })).toBe('bridge')
    expect(classifyFeature({ bridge: 'yes', highway: 'primary' })).toBe('bridge')
    expect(classifyFeature({ bridge: 'viaduct', railway: 'rail' })).toBe('bridge')
  })

  it('treats building=no as not a building', () => {
    expect(classifyFeature({ building: 'no' })).toBeNull()
  })

  it('gives buildings precedence — a boathouse in a park is a building', () => {
    expect(classifyFeature({ building: 'yes', leisure: 'park' })).toBe('building')
    expect(classifyFeature({ building: 'yes', bridge: 'yes', highway: 'service' })).toBe('building')
  })

  it('does not call a plain road a bridge', () => {
    // A road is a road; only bridge=yes lifts it onto a deck.
    expect(classifyFeature({ highway: 'primary' })).toBe('road')
    expect(classifyFeature({ bridge: 'no', highway: 'primary' })).toBe('road')
    // bridge=yes without a carried way is not enough on its own
    expect(classifyFeature({ bridge: 'yes' })).toBeNull()
  })

  it('returns null for everything it does not model', () => {
    const cases: Array<Record<string, string> | undefined> =
      [undefined, {}, { amenity: 'cafe' }, { barrier: 'fence' }]
    for (const tags of cases) expect(classifyFeature(tags)).toBeNull()
  })
})

describe('parseOsmColor', () => {
  it('reads hex in both lengths', () => {
    expect(parseOsmColor('#a1b2c3')).toBe('#a1b2c3')
    expect(parseOsmColor('#ABC')).toBe('#aabbcc')
    expect(parseOsmColor('a1b2c3')).toBe('#a1b2c3')
  })

  it('resolves the colour names OSM actually uses', () => {
    expect(parseOsmColor('white')).toBeTruthy()
    expect(parseOsmColor('terracotta')).toBeTruthy()
    expect(parseOsmColor(' Grey ')).toBe(parseOsmColor('gray'))
  })

  it('returns undefined rather than a wrong colour', () => {
    for (const bad of [undefined, '', 'chartreuse-ish', '#12345', 'rgb(1,2,3)']) {
      expect(parseOsmColor(bad)).toBeUndefined()
    }
  })
})

describe('parseRoofShape', () => {
  it('maps ridged shapes to gabled and pointed ones to pyramidal', () => {
    for (const s of ['gabled', 'hipped', 'half-hipped', 'gambrel']) {
      expect(parseRoofShape(s)).toBe('gabled')
    }
    for (const s of ['pyramidal', 'dome', 'conical']) {
      expect(parseRoofShape(s)).toBe('pyramidal')
    }
  })

  it('degrades unknown shapes to flat instead of guessing', () => {
    for (const s of [undefined, '', 'onion', 'sawtooth', 'skillion']) {
      expect(parseRoofShape(s)).toBe('flat')
    }
  })
})

describe('resolveFeatureStyle', () => {
  it('reads wall and roof colours', () => {
    const s = resolveFeatureStyle('building', { 'building:colour': '#c0392b', 'roof:colour': 'grey' })
    expect(s.wallColor).toBe('#c0392b')
    expect(s.roofColor).toBeTruthy()
  })

  it('gives a flat roof zero height and a shaped roof a real one', () => {
    expect(resolveFeatureStyle('building', {}).roofHeightM).toBe(0)
    expect(resolveFeatureStyle('building', { 'roof:shape': 'gabled' }).roofHeightM).toBeGreaterThan(0)
    expect(resolveFeatureStyle('building', { 'roof:shape': 'gabled', 'roof:height': '5' }).roofHeightM).toBe(5)
  })

  it('sizes tree crowns from diameter_crown, with a sane default', () => {
    expect(resolveFeatureStyle('tree', { diameter_crown: '9' }).crownRadiusM).toBeCloseTo(4.5, 6)
    expect(resolveFeatureStyle('tree', {}).crownRadiusM).toBeGreaterThan(0)
  })
})

describe('bridgeWidth', () => {
  it('prefers an explicit width', () => {
    expect(bridgeWidth({ width: '14' })).toBe(14)
    expect(bridgeWidth({ width: '14 m', lanes: '2' })).toBe(14)
  })

  it('derives from lane count when width is absent', () => {
    expect(bridgeWidth({ lanes: '4' })).toBeCloseTo(4 * 3.5 + 1.5, 6)
  })

  it('falls back per way type', () => {
    expect(bridgeWidth({ railway: 'rail' })).toBe(8)
    expect(bridgeWidth({ highway: 'footway' })).toBe(7)
    expect(bridgeWidth(undefined)).toBe(7)
  })

  it('clamps absurd widths', () => {
    expect(bridgeWidth({ width: '900' })).toBe(60)
    expect(bridgeWidth({ lanes: '99' })).toBe(60)
  })
})

describe('parseOsmFeatures', () => {
  const ring = (lat: number, lon: number, d = 0.0006) => [
    { lat, lon }, { lat, lon: lon + d },
    { lat: lat + d, lon: lon + d }, { lat: lat + d, lon }, { lat, lon },
  ]

  it('parses each element type into the right kind', () => {
    const out = parseOsmFeatures({
      elements: [
        { type: 'way', id: 1, tags: { building: 'yes' }, geometry: ring(41.38, 2.17) },
        { type: 'way', id: 2, tags: { natural: 'water' }, geometry: ring(41.39, 2.17) },
        { type: 'way', id: 3, tags: { leisure: 'park' }, geometry: ring(41.40, 2.17) },
        { type: 'node', id: 4, tags: { natural: 'tree' }, lat: 41.38, lon: 2.17 },
      ],
    })
    expect(out.map((f) => f.kind).sort()).toEqual(['building', 'green', 'tree', 'water'])
  })

  it('keeps a linear bridge as a centreline with a width', () => {
    const out = parseOsmFeatures({
      elements: [{
        type: 'way', id: 5, tags: { bridge: 'yes', highway: 'primary', lanes: '2' },
        geometry: [{ lat: 41.38, lon: 2.17 }, { lat: 41.381, lon: 2.171 }],
      }],
    })
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('bridge')
    expect(out[0].ring).toHaveLength(2)   // open centreline, not an area
    expect(out[0].widthM).toBeGreaterThan(0)
  })

  it('treats an area-mapped bridge as a polygon', () => {
    const out = parseOsmFeatures({
      elements: [{ type: 'way', id: 6, tags: { man_made: 'bridge' }, geometry: ring(41.38, 2.17) }],
    })
    expect(out[0].ring).toHaveLength(4)   // closing vertex stripped
    expect(out[0].widthM).toBeUndefined()
  })

  it('requires a tree to be a node with real coordinates', () => {
    const out = parseOsmFeatures({
      elements: [
        { type: 'node', id: 7, tags: { natural: 'tree' } },                    // no coords
        { type: 'node', id: 8, tags: { natural: 'tree' }, lat: NaN, lon: 2.1 },
        { type: 'way', id: 9, tags: { natural: 'tree' }, geometry: ring(41, 2) },
      ],
    })
    expect(out).toHaveLength(0)
  })

  it('applies a per-kind minimum area — a pond is not a puddle', () => {
    // ~25 m² patch: above the building threshold, below water's and green's.
    const small = 0.000045
    const out = parseOsmFeatures({
      elements: [
        { type: 'way', id: 10, tags: { building: 'yes' }, geometry: ring(41.38, 2.17, small) },
        { type: 'way', id: 11, tags: { natural: 'water' }, geometry: ring(41.39, 2.17, small) },
        { type: 'way', id: 12, tags: { leisure: 'park' }, geometry: ring(41.40, 2.17, small) },
      ],
    })
    expect(out.map((f) => f.kind)).toEqual(['building'])
    expect(MIN_AREA_M2.water).toBeGreaterThan(MIN_AREA_M2.building)
  })

  it('takes outer rings of multipolygon relations', () => {
    const out = parseOsmFeatures({
      elements: [{
        type: 'relation', id: 20, tags: { natural: 'water' },
        members: [
          { type: 'way', role: 'outer', geometry: ring(41.38, 2.17) },
          { type: 'way', role: 'inner', geometry: ring(41.3801, 2.1701, 0.0001) },
        ],
      }],
    })
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('water')
  })

  it('ignores untagged and unmodelled elements', () => {
    const out = parseOsmFeatures({
      elements: [
        // Mapped, but nothing this scene draws.
        { type: 'way', id: 30, tags: { barrier: 'fence' }, geometry: ring(41.38, 2.17) },
        { type: 'way', id: 31, tags: { highway: 'proposed' }, geometry: ring(41.385, 2.17) },
        { type: 'way', id: 32, tags: { railway: 'abandoned' }, geometry: ring(41.39, 2.17) },
        { type: 'way', id: 33, geometry: ring(41.395, 2.17) },
      ],
    })
    expect(out).toHaveLength(0)
  })

  it('survives malformed responses', () => {
    for (const junk of [null, undefined, {}, { elements: null }, { elements: [null, 3, 'x'] }]) {
      expect(parseOsmFeatures(junk)).toEqual([])
    }
  })
})

describe('buildFeaturesQuery', () => {
  const bbox = { south: 41.38, west: 2.17, north: 41.39, east: 2.18 }

  it('covers every layer in ONE query', () => {
    const q = buildFeaturesQuery(bbox)
    expect(q).toContain('["building"]')
    expect(q).toContain('["natural"="water"]')
    expect(q).toContain('leisure')
    expect(q).toContain('["man_made"="bridge"]')
    expect(q).toContain('node["natural"="tree"]')
    // A single statement group, so one request serves every toggle.
    expect(q.match(/out geom/g)).toHaveLength(1)
  })

  it('always bounds server work and result size', () => {
    const q = buildFeaturesQuery(bbox, 12, 900)
    expect(q).toContain('[timeout:12]')
    expect(q).toContain('out geom 900;')
  })

  it('asks for trees as nodes only — an area is never a tree', () => {
    const q = buildFeaturesQuery(bbox)
    expect(q).not.toContain('way["natural"="tree"]')
  })
})

describe('countByKind', () => {
  it('counts every kind, including the zeroes', () => {
    const f = (kind: OsmFeature['kind']): OsmFeature => ({
      id: kind, kind, height: { heightM: 1, minHeightM: 0, estimated: true },
      style: { roofShape: 'flat', roofHeightM: 0 },
    })
    const counts = countByKind([f('building'), f('building'), f('tree')])
    expect(counts.building).toBe(2)
    expect(counts.tree).toBe(1)
    expect(counts.water).toBe(0)
    for (const k of FEATURE_KINDS) expect(counts[k]).toBeGreaterThanOrEqual(0)
  })
})

// ── Roads and railways ────────────────────────────────────────────────────────

describe('road and rail classification', () => {
  it('draws the carriageway classes and ignores the rest', () => {
    for (const v of ['motorway', 'residential', 'footway', 'cycleway', 'steps']) {
      expect(classifyFeature({ highway: v })).toBe('road')
    }
    // Not a carriageway, or not built yet.
    for (const v of ['proposed', 'construction', 'bus_stop', 'street_lamp']) {
      expect(classifyFeature({ highway: v })).toBeNull()
    }
  })

  it('draws live rail and ignores what is gone or not built', () => {
    for (const v of ['rail', 'light_rail', 'subway', 'tram', 'narrow_gauge', 'platform']) {
      expect(classifyFeature({ railway: v })).toBe('rail')
    }
    for (const v of ['abandoned', 'disused', 'razed', 'proposed']) {
      expect(classifyFeature({ railway: v })).toBeNull()
    }
  })

  it('puts rail ahead of road, so a tramway in a street stays rail', () => {
    expect(classifyFeature({ highway: 'secondary', railway: 'tram' })).toBe('rail')
  })

  it('keeps buildings and bridges ahead of both', () => {
    expect(classifyFeature({ building: 'train_station', railway: 'platform' })).toBe('building')
    expect(classifyFeature({ highway: 'primary', bridge: 'yes' })).toBe('bridge')
    expect(classifyFeature({ railway: 'rail', bridge: 'yes' })).toBe('bridge')
  })
})

describe('roadWidth', () => {
  it('prefers an explicit width', () => {
    expect(roadWidth({ highway: 'residential', width: '9' })).toBe(9)
    expect(roadWidth({ highway: 'residential', width: '9 m' })).toBe(9)
  })

  it('derives from lanes, with a shoulder on the fast classes', () => {
    expect(roadWidth({ highway: 'residential', lanes: '2' })).toBeCloseTo(7.0, 5)
    expect(roadWidth({ highway: 'motorway', lanes: '3' })).toBeCloseTo(12.1, 5)
  })

  it('falls back to a per-class default that keeps the hierarchy legible', () => {
    expect(roadWidth({ highway: 'motorway' })).toBeGreaterThan(roadWidth({ highway: 'residential' }))
    expect(roadWidth({ highway: 'residential' })).toBeGreaterThan(roadWidth({ highway: 'footway' }))
    expect(roadWidth({ highway: 'nonsense' })).toBeGreaterThan(0)
    expect(roadWidth(undefined)).toBeGreaterThan(0)
  })

  it('never returns an absurd ribbon', () => {
    expect(roadWidth({ highway: 'motorway', width: '4000' })).toBeLessThanOrEqual(40)
    expect(roadWidth({ highway: 'motorway', lanes: '400' })).toBeLessThanOrEqual(40)
  })
})

describe('railWidth', () => {
  it('measures the ballast corridor, not the gauge', () => {
    // A single track is metres wide on the ground, not 1.435.
    expect(railWidth({ railway: 'rail' })).toBeGreaterThan(3)
  })

  it('scales with the number of tracks', () => {
    expect(railWidth({ railway: 'rail', tracks: '4' }))
      .toBeCloseTo(railWidth({ railway: 'rail' }) * 4, 5)
  })

  it('keeps trams and metros narrower than heavy rail', () => {
    expect(railWidth({ railway: 'tram' })).toBeLessThan(railWidth({ railway: 'rail' }))
  })
})

describe('roadTone', () => {
  it('darkens asphalt as the class gets faster', () => {
    const lum = (t: [number, number, number]): number => t[0] + t[1] + t[2]
    expect(lum(roadTone({ highway: 'motorway' }))).toBeLessThan(lum(roadTone({ highway: 'residential' })))
  })

  it('treats a link like its parent class', () => {
    expect(roadTone({ highway: 'motorway_link' })).toEqual(roadTone({ highway: 'motorway' }))
  })

  it('sends unpaved ways warm, so a path never reads as tarmac', () => {
    const path = roadTone({ highway: 'path' })
    expect(path[0]).toBeGreaterThan(path[2])
  })
})

describe('parseOsmFeatures — linear roads and rail', () => {
  const line = (lat: number): Array<{ lat: number; lon: number }> => [
    { lat, lon: 2.17 }, { lat, lon: 2.172 }, { lat: lat + 0.0005, lon: 2.174 },
  ]

  it('keeps a road as a centreline plus a width', () => {
    const [f] = parseOsmFeatures({
      elements: [{ type: 'way', id: 5, tags: { highway: 'secondary' }, geometry: line(41.38) }],
    })
    expect(f.kind).toBe('road')
    expect(f.widthM).toBe(roadWidth({ highway: 'secondary' }))
    expect(f.ring).toHaveLength(3)   // NOT closed into a polygon
    expect(f.style.tone).toBeDefined()
  })

  it('keeps a closed way (a roundabout) as a ribbon, not an area', () => {
    const loop = [...line(41.38), { lat: 41.38, lon: 2.17 }]
    const [f] = parseOsmFeatures({
      elements: [{ type: 'way', id: 6, tags: { highway: 'residential', junction: 'roundabout' }, geometry: loop }],
    })
    expect(f.kind).toBe('road')
    expect(f.widthM).toBeGreaterThan(0)
  })

  it('marks a platform as an area, and track as a corridor', () => {
    const out = parseOsmFeatures({
      elements: [
        { type: 'way', id: 7, tags: { railway: 'rail', tracks: '2' }, geometry: line(41.39) },
        {
          type: 'way', id: 8, tags: { railway: 'platform' },
          geometry: [
            { lat: 41.4, lon: 2.17 }, { lat: 41.4, lon: 2.1705 },
            { lat: 41.4004, lon: 2.1705 }, { lat: 41.4004, lon: 2.17 },
          ],
        },
      ],
    })
    const track = out.find((f) => f.style.railKind === 'track')!
    const platform = out.find((f) => f.style.railKind === 'platform')!
    expect(track.widthM).toBeGreaterThan(0)
    expect(platform.widthM).toBeUndefined()      // a real polygon
    expect(platform.ring!.length).toBeGreaterThanOrEqual(3)
  })

  it('asks Overpass for both, in the same single query', () => {
    const q = buildFeaturesQuery({ south: 0, west: 0, north: 1, east: 1 })
    expect(q).toContain('way["highway"]')
    expect(q).toContain('way["railway"]')
    expect((q.match(/\[out:json/g) ?? []).length).toBe(1)
  })
})
