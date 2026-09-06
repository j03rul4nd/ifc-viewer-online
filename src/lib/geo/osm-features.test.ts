import { describe, it, expect } from 'vitest'
import portvell from './__fixtures__/portvell.json'
import {
  classifyFeature, parseOsmColor, parseRoofShape, resolveFeatureStyle,
  parseOsmFeatures, buildFeaturesQuery, bridgeWidth, countByKind,
  roadWidth, railWidth, roadTone, featureLabel, isCrossing, CROSSING_BAND_M,
  waterwayWidth, bufferWaterway,
  FEATURE_KINDS, MIN_AREA_M2,
  roadClass, ROAD_CLASS_ROUGHNESS, ROAD_CLASS_KERB_M, buildingUse,
  isBelowSurface, monumentShape,
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
    // An area-mapped bridge OUTLINE is its own kind: it is a polygon nobody
    // else describes.
    expect(classifyFeature({ man_made: 'bridge' })).toBe('bridge')
    // A `bridge=yes` WAY is not. It stays the road or the railway it is, and
    // the structure travels beside the kind. See `vertical.ts`.
    expect(classifyFeature({ bridge: 'yes', highway: 'primary' })).toBe('road')
    expect(classifyFeature({ bridge: 'viaduct', railway: 'rail' })).toBe('rail')
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

  it('keeps a road on a bridge IN the road network, carrying its structure', () => {
    const out = parseOsmFeatures({
      elements: [{
        type: 'way', id: 5, tags: { bridge: 'yes', highway: 'primary', lanes: '2' },
        geometry: [{ lat: 41.38, lon: 2.17 }, { lat: 41.381, lon: 2.171 }],
      }],
    })
    expect(out).toHaveLength(1)
    // It is a ROAD — so it keeps its junctions, its width solving and its
    // markings — that happens to be carried on a bridge.
    expect(out[0].kind).toBe('road')
    expect(out[0].vertical?.structure).toBe('bridge')
    expect(out[0].functional).toBe('road')
    expect(out[0].ring).toHaveLength(2)   // open centreline, not an area
    expect(out[0].widthM).toBeGreaterThan(0)
  })

  it('carries the vertical model on a railway in a tunnel too', () => {
    const out = parseOsmFeatures({
      elements: [{
        type: 'way', id: 7, tags: { railway: 'rail', tunnel: 'yes', layer: '-2' },
        geometry: [{ lat: 41.38, lon: 2.17 }, { lat: 41.381, lon: 2.171 }],
      }],
    })
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('rail')
    expect(out[0].vertical?.structure).toBe('tunnel')
    expect(out[0].vertical?.layer).toBe(-2)
    expect(out[0].functional).toBe('railway')
  })

  it('reads a footway as pedestrian, which has its own clearances and grades', () => {
    const out = parseOsmFeatures({
      elements: [{
        type: 'way', id: 8, tags: { highway: 'footway', bridge: 'yes' },
        geometry: [{ lat: 41.38, lon: 2.17 }, { lat: 41.381, lon: 2.171 }],
      }],
    })
    expect(out[0].functional).toBe('pedestrian')
    expect(out[0].vertical?.structure).toBe('bridge')
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
    // Still ONE request — several `out` statements, one round trip.
    expect(q.match(/\[out:json\]/g)).toHaveLength(1)
  })

  it('gives every layer its OWN budget so none can starve the rest', () => {
    // The bug this replaced: one union with one `out geom N`. Overpass
    // truncates the combined set in an order that has nothing to do with the
    // query, and on a real 1.4 km box over Poblenou the first 6000 elements
    // were 5581 land-cover polygons and 347 of the 3113 highways — so the app
    // drew 11 % of the streets. Land cover is a few enormous polygons; roads
    // are thousands of small ways. They must not compete for one number.
    const q = buildFeaturesQuery(bbox, 12, 1000)
    expect(q).toContain('[timeout:12]')
    const caps = [...q.matchAll(/out geom (\d+);/g)].map((m) => Number(m[1]))
    expect(caps.length).toBeGreaterThan(4)
    for (const c of caps) expect(c).toBeGreaterThan(0)

    // Roads are the skeleton of a site view: funded FIRST and funded most.
    expect(q.indexOf('way["highway"]')).toBeLessThan(q.indexOf('["building"]'))
    expect(caps[0]).toBe(550)
    expect(Math.max(...caps)).toBe(caps[0])
  })

  it('keeps the total bounded — the cap is a budget, not a suggestion', () => {
    const q = buildFeaturesQuery(bbox, 12, 1000)
    const caps = [...q.matchAll(/out geom (\d+);/g)].map((m) => Number(m[1]))
    // Ways compete for geometry payload; nodes are one coordinate each and are
    // budgeted separately, so the way groups are what has to stay in bounds.
    const wayTotal = caps.reduce((a, b) => a + b, 0) - 350 - 50
    expect(wayTotal).toBeLessThanOrEqual(1000 * 1.4)
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
    // A bridge tag no longer outranks the thing being carried — that was the
    // modelling error that removed every overpass from the road graph.
    expect(classifyFeature({ highway: 'primary', bridge: 'yes' })).toBe('road')
    expect(classifyFeature({ railway: 'rail', bridge: 'yes' })).toBe('rail')
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

// ── Bare ground: sand and rock ────────────────────────────────────────────────
//
// A site by the sea or under a mountain is exactly where the ground AROUND the
// model is what a client looks at, and these were previously classified as
// nothing at all — the beach was simply missing from the scene.

describe('sand and rock classification', () => {
  it('recognises the bare-ground tags', () => {
    expect(classifyFeature({ natural: 'beach' })).toBe('sand')
    expect(classifyFeature({ natural: 'sand' })).toBe('sand')
    expect(classifyFeature({ natural: 'dune' })).toBe('sand')
    expect(classifyFeature({ natural: 'shingle' })).toBe('sand')
    expect(classifyFeature({ landuse: 'sand' })).toBe('sand')
    expect(classifyFeature({ natural: 'bare_rock' })).toBe('rock')
    expect(classifyFeature({ natural: 'scree' })).toBe('rock')
    expect(classifyFeature({ natural: 'glacier' })).toBe('rock')
    expect(classifyFeature({ landuse: 'quarry' })).toBe('rock')
  })

  it('puts a golf bunker in the sand, not in the green it sits inside', () => {
    expect(classifyFeature({ golf: 'bunker' })).toBe('sand')
    // The course itself is still greenery.
    expect(classifyFeature({ leisure: 'golf_course' })).toBe('green')
  })

  it('keeps a dune inside a nature reserve as sand', () => {
    // Reserve boundaries cover whole coastlines; if greenery won here, every
    // protected dune field would render as lawn.
    expect(classifyFeature({ natural: 'dune', leisure: 'nature_reserve' })).toBe('sand')
  })

  it('still treats wetland as greenery, since it is vegetated', () => {
    expect(classifyFeature({ natural: 'wetland' })).toBe('green')
  })

  it('gives each surface its own tone and coarseness', () => {
    const beach = resolveFeatureStyle('sand', { natural: 'beach' })
    const shingle = resolveFeatureStyle('sand', { natural: 'shingle' })
    const mud = resolveFeatureStyle('sand', { natural: 'mud' })
    // Shingle is pebbles, beach sand is fine, mud is finer still — the whole
    // point of carrying roughness rather than one "sand" material.
    expect(shingle.roughness!).toBeGreaterThan(beach.roughness!)
    expect(mud.roughness!).toBeLessThan(beach.roughness!)
    // And mud is not the colour of a beach.
    expect(mud.tone![0]).toBeLessThan(beach.tone![0])

    const ice = resolveFeatureStyle('rock', { natural: 'glacier' })
    const scree = resolveFeatureStyle('rock', { natural: 'scree' })
    expect(scree.roughness!).toBeGreaterThan(ice.roughness!)
    expect(ice.tone![2]).toBeGreaterThan(0.8)          // ice reads blue-white
  })

  it('separates a mown pitch from scrub by coarseness alone', () => {
    const pitch = resolveFeatureStyle('green', { leisure: 'pitch' })
    const scrub = resolveFeatureStyle('green', { natural: 'scrub' })
    expect(scrub.roughness!).toBeGreaterThan(pitch.roughness! + 0.5)
  })

  it('asks Overpass for the new surfaces in the SAME single query', () => {
    const q = buildFeaturesQuery({ south: 0, west: 0, north: 1, east: 1 })
    expect(q).toContain('beach|sand|dune|shingle|mud')
    expect(q).toContain('bare_rock|rock|scree|stone|glacier')
    expect(q).toContain('["golf"="bunker"]')
    // One request per site is the decision the whole module hangs off.
    expect((q.match(/\[out:json/g) ?? []).length).toBe(1)
  })

  it('counts them per layer', () => {
    const counts = countByKind([
      { id: 'a', kind: 'sand', height: { heightM: 0, minHeightM: 0, estimated: true },
        style: { roofShape: 'flat', roofHeightM: 0 } },
      { id: 'b', kind: 'rock', height: { heightM: 0, minHeightM: 0, estimated: true },
        style: { roofShape: 'flat', roofHeightM: 0 } },
    ])
    expect(counts.sand).toBe(1)
    expect(counts.rock).toBe(1)
    expect(counts.green).toBe(0)
  })
})

// ── Telling the user what a building is ───────────────────────────────────────

describe('featureLabel', () => {
  it('puts transport first — it is what a room orients by', () => {
    expect(featureLabel({ building: 'yes', railway: 'station' })).toBe('Train station')
    expect(featureLabel({ building: 'train_station' })).toBe('Train station')
    expect(featureLabel({ railway: 'platform' })).toBe('Platform')
    // Specific beats generic even when both are mapped.
    expect(featureLabel({ building: 'commercial', amenity: 'hospital' })).toBe('Hospital')
  })

  it('reads amenity, shop, office and building use', () => {
    expect(featureLabel({ amenity: 'school' })).toBe('School')
    expect(featureLabel({ shop: 'bakery' })).toBe('Shop')
    expect(featureLabel({ office: 'lawyer' })).toBe('Office')
    expect(featureLabel({ building: 'apartments' })).toBe('Apartments')
    expect(featureLabel({ building: 'warehouse' })).toBe('Warehouse')
  })

  it('says NOTHING about a building it knows nothing about', () => {
    // The alternative is labelling half a city "Building", which is noise.
    expect(featureLabel({ building: 'yes' })).toBeUndefined()
    expect(featureLabel({})).toBeUndefined()
    expect(featureLabel(undefined)).toBeUndefined()
  })
})

describe('parseOsmFeatures — identity', () => {
  const square = [
    { lat: 41.38, lon: 2.17 }, { lat: 41.38, lon: 2.1705 },
    { lat: 41.3804, lon: 2.1705 }, { lat: 41.3804, lon: 2.17 },
  ]

  it('carries name and label through to the renderer', () => {
    const [f] = parseOsmFeatures({
      elements: [{
        type: 'way', id: 42,
        tags: { building: 'yes', name: 'Union Station', railway: 'station' },
        geometry: square,
      }],
    })
    expect(f.name).toBe('Union Station')
    expect(f.label).toBe('Train station')
  })

  it('leaves both undefined when the tags say nothing', () => {
    const [f] = parseOsmFeatures({
      elements: [{ type: 'way', id: 43, tags: { building: 'yes' }, geometry: square }],
    })
    expect(f.name).toBeUndefined()
    expect(f.label).toBeUndefined()
  })
})

// ── Pedestrian crossings ──────────────────────────────────────────────────────

describe('isCrossing', () => {
  it('recognises the ways that carry paint', () => {
    expect(isCrossing({ highway: 'footway', footway: 'crossing' })).toBe(true)
    expect(isCrossing({ highway: 'footway', footway: 'crossing', crossing: 'zebra' })).toBe(true)
    expect(isCrossing({ highway: 'footway', footway: 'crossing', crossing: 'marked' })).toBe(true)
    expect(isCrossing({ highway: 'cycleway', cycleway: 'crossing' })).toBe(true)
  })

  it('honours a statement that there are no markings', () => {
    // Painting stripes where there is no paint invents a traffic control.
    expect(isCrossing({ highway: 'footway', footway: 'crossing', crossing: 'unmarked' })).toBe(false)
    expect(isCrossing({ highway: 'footway', footway: 'crossing', crossing: 'no' })).toBe(false)
  })

  it('leaves ordinary footways alone', () => {
    expect(isCrossing({ highway: 'footway' })).toBe(false)
    expect(isCrossing({ highway: 'residential' })).toBe(false)
    expect(isCrossing(undefined)).toBe(false)
  })
})

describe('parseOsmFeatures — crossings', () => {
  const across = [{ lat: 41.38, lon: 2.17 }, { lat: 41.38, lon: 2.1701 }]

  it('is paint on the carriageway, not a tan footpath', () => {
    const [f] = parseOsmFeatures({
      elements: [{
        type: 'way', id: 9,
        tags: { highway: 'footway', footway: 'crossing', crossing: 'marked' },
        geometry: across,
      }],
    })
    expect(f.kind).toBe('road')
    expect(f.style.crossing).toBe(true)
    // The painted band, not the 2 m a footway would get.
    expect(f.widthM).toBe(CROSSING_BAND_M)
    // Marking white, not the warm tone of an unpaved path.
    expect(f.style.tone![0]).toBeGreaterThan(0.7)
  })

  it('keeps an unmarked crossing as an ordinary footway', () => {
    const [f] = parseOsmFeatures({
      elements: [{
        type: 'way', id: 10,
        tags: { highway: 'footway', footway: 'crossing', crossing: 'unmarked' },
        geometry: across,
      }],
    })
    expect(f.style.crossing).toBeUndefined()
    expect(f.widthM).toBe(roadWidth({ highway: 'footway' }))
  })
})

// ── Watercourses mapped as lines ──────────────────────────────────────────────

describe('waterwayWidth', () => {
  it('prefers a surveyed width', () => {
    expect(waterwayWidth({ waterway: 'river', width: '35' })).toBe(35)
    expect(waterwayWidth({ waterway: 'stream', width: '2.5 m' })).toBe(2.5)
  })

  it('keeps a stream from being drawn like a river', () => {
    expect(waterwayWidth({ waterway: 'river' }))
      .toBeGreaterThan(waterwayWidth({ waterway: 'canal' }))
    expect(waterwayWidth({ waterway: 'canal' }))
      .toBeGreaterThan(waterwayWidth({ waterway: 'stream' }))
    expect(waterwayWidth({ waterway: 'stream' }))
      .toBeGreaterThan(waterwayWidth({ waterway: 'ditch' }))
  })

  it('refuses an absurd width', () => {
    expect(waterwayWidth({ waterway: 'river', width: '99999' })).toBeLessThanOrEqual(400)
  })
})

describe('bufferWaterway', () => {
  // A due-north reach, so the banks must be offset in longitude only.
  const north = [
    { lat: 41.380, lon: 2.170 },
    { lat: 41.382, lon: 2.170 },
    { lat: 41.384, lon: 2.170 },
  ]

  it('returns a closed ring: one bank out, the other back', () => {
    const ring = bufferWaterway(north, 20)!
    expect(ring).toHaveLength(north.length * 2)
    // First and last points are the two banks at the same end of the reach.
    expect(ring[0].lat).toBeCloseTo(ring[ring.length - 1].lat, 9)
    expect(ring[0].lon).not.toBeCloseTo(ring[ring.length - 1].lon, 9)
  })

  it('offsets in METRES, not in degrees', () => {
    // 111_320 m per degree of longitude at the equator, shrinking with latitude:
    // a 20 m river at 41° must be WIDER in degrees than the naive 20/111_320.
    const ring = bufferWaterway(north, 20)!
    const widthDeg = Math.abs(ring[0].lon - ring[ring.length - 1].lon)
    const naive = 20 / 111_320
    expect(widthDeg).toBeGreaterThan(naive)
    // And it must equal 20 m once converted back at this latitude.
    const mPerDegLon = 111_320 * Math.cos((41.382 * Math.PI) / 180)
    expect(widthDeg * mPerDegLon).toBeCloseTo(20, 1)
  })

  it('declines what it cannot buffer', () => {
    expect(bufferWaterway([{ lat: 41.38, lon: 2.17 }], 20)).toBeNull()
    expect(bufferWaterway(north, 0)).toBeNull()
    // Every point identical: no direction to offset along.
    const still = [
      { lat: 41.38, lon: 2.17 }, { lat: 41.38, lon: 2.17 }, { lat: 41.38, lon: 2.17 },
    ]
    expect(bufferWaterway(still, 10)).toBeNull()
  })
})

describe('parseOsmFeatures — linear watercourses', () => {
  const reach = [
    { lat: 41.380, lon: 2.170 }, { lat: 41.381, lon: 2.1705 }, { lat: 41.382, lon: 2.171 },
  ]

  it('draws a river that is mapped as a centreline', () => {
    const [f] = parseOsmFeatures({
      elements: [{ type: 'way', id: 77, tags: { waterway: 'river', name: 'Besòs' }, geometry: reach }],
    })
    expect(f.kind).toBe('water')
    // Turned into a bank-to-bank polygon, so everything downstream treats it
    // exactly like a lake.
    expect(f.ring).toHaveLength(reach.length * 2)
    expect(f.widthM).toBeUndefined()
  })

  it('still handles the area form', () => {
    const [f] = parseOsmFeatures({
      elements: [{
        type: 'way', id: 78, tags: { waterway: 'riverbank' },
        geometry: [
          { lat: 41.38, lon: 2.17 }, { lat: 41.38, lon: 2.1705 },
          { lat: 41.3805, lon: 2.1705 }, { lat: 41.3805, lon: 2.17 },
        ],
      }],
    })
    expect(f.kind).toBe('water')
  })

  it('asks Overpass for the line form too', () => {
    const q = buildFeaturesQuery({ south: 0, west: 0, north: 1, east: 1 })
    expect(q).toContain('waterway')
    expect(q).toMatch(/river\|stream\|canal/)
  })
})

describe('roadClass', () => {
  it('separates what people walk on from what people drive on', () => {
    for (const hw of ['footway', 'path', 'steps', 'pedestrian', 'cycleway', 'bridleway']) {
      expect(roadClass({ highway: hw }), hw).toBe('pedestrian')
    }
    for (const hw of ['motorway', 'trunk', 'primary', 'residential', 'service', 'living_street']) {
      expect(roadClass({ highway: hw }), hw).toBe('vehicular')
    }
  })

  it('gives a track its own answer', () => {
    // It carries vehicles, so it is not a footpath; it is three metres of
    // gravel, so it is not a carriageway either.
    expect(roadClass({ highway: 'track' })).toBe('track')
  })

  it('treats an unknown or missing highway tag as a carriageway', () => {
    expect(roadClass({ highway: 'busway' })).toBe('vehicular')
    expect(roadClass(undefined)).toBe('vehicular')
  })

  it('travels on the style, so the mesh stage never sees a tag', () => {
    expect(resolveFeatureStyle('road', { highway: 'footway' }).roadClass).toBe('pedestrian')
    expect(resolveFeatureStyle('road', { highway: 'trunk' }).roadClass).toBe('vehicular')
  })

  it('gives a footpath a flush edge and a coarser surface than tarmac', () => {
    expect(ROAD_CLASS_KERB_M.pedestrian).toBeLessThan(ROAD_CLASS_KERB_M.vehicular)
  })

  it('widens a footway once it is carried on a structure', () => {
    // A 2 m default is a park path. A footway on a bridge has an abutment at
    // each end and something underneath it, and nobody builds one 2 m wide.
    //
    // Measured over Lujiazui: 31 elevated footways linking the malls, not one
    // carrying a `width`. All of them were drawn at the park-path default.
    const ground = roadWidth({ highway: 'footway' })
    const bridged = roadWidth({ highway: 'footway', bridge: 'yes' })
    const layered = roadWidth({ highway: 'footway', layer: '2' })
    expect(bridged).toBeGreaterThan(ground * 2)
    expect(layered).toBe(bridged)
  })

  it('lets a surveyed width beat the elevated fallback outright', () => {
    // The fallback only ever fills a silence. Where somebody measured it, the
    // measurement wins — including when it is narrower than our guess.
    expect(roadWidth({ highway: 'footway', bridge: 'yes', width: '2.5' })).toBe(2.5)
  })

  it('leaves a carriageway its own width on a viaduct', () => {
    // A road keeps its carriageway width when elevated, because that is what
    // the width is for. Only personal-scale paths get the structural minimum.
    const ground = roadWidth({ highway: 'primary' })
    expect(roadWidth({ highway: 'primary', bridge: 'yes' })).toBe(ground)
    expect(ROAD_CLASS_ROUGHNESS.pedestrian).toBeGreaterThan(ROAD_CLASS_ROUGHNESS.vehicular)
    expect(ROAD_CLASS_ROUGHNESS.track).toBeGreaterThan(ROAD_CLASS_ROUGHNESS.pedestrian)
  })
})

describe('buildingUse', () => {
  it('reads the mapper own answer from the building key', () => {
    expect(buildingUse({ building: 'house' })).toBe('house')
    expect(buildingUse({ building: 'apartments' })).toBe('apartments')
    expect(buildingUse({ building: 'warehouse' })).toBe('industrial')
    expect(buildingUse({ building: 'retail' })).toBe('retail')
    expect(buildingUse({ building: 'garage' })).toBe('shed')
  })

  it('falls back to amenity for the very common building=yes', () => {
    expect(buildingUse({ building: 'yes', amenity: 'place_of_worship' })).toBe('temple')
    expect(buildingUse({ building: 'yes', amenity: 'townhall' })).toBe('civic')
  })

  it('tells a shrine from a temple, because they look nothing alike', () => {
    expect(buildingUse({ building: 'temple', religion: 'shinto' })).toBe('shrine')
    expect(buildingUse({ building: 'shrine', religion: 'buddhist' })).toBe('temple')
    expect(buildingUse({ building: 'shrine' })).toBe('shrine')
  })

  it('says generic for the value that tells us nothing', () => {
    // `building=yes` is the most common value in the database.
    expect(buildingUse({ building: 'yes' })).toBe('generic')
    expect(buildingUse({})).toBe('generic')
    expect(buildingUse(undefined)).toBe('generic')
  })

  it('travels on the style, so the mesh stage never sees a tag', () => {
    const style = resolveFeatureStyle('building', { building: 'temple', religion: 'shinto' })
    expect(style.use).toBe('shrine')
  })

  it('records whether the roof shape was actually tagged', () => {
    // Without this, "the mapper says flat" and "nobody said anything" are the
    // same value, and no roof can ever be inferred.
    expect(resolveFeatureStyle('building', { building: 'house' }).roofTagged).toBe(false)
    expect(resolveFeatureStyle('building', { 'roof:shape': 'flat' }).roofTagged).toBe(true)
  })
})

describe('what is not on the surface is not drawn', () => {
  // OSM maps the whole solid. Measured on the Ciutadella box: 100 roads and 50
  // railways in tunnel, 61 more indoors, three culverted streams — a network of
  // phantom streets under the park and a river through the zoo, all of it drawn
  // at ground level because it classifies perfectly well.

  const line = [{ lat: 41.388, lon: 2.185 }, { lat: 41.389, lon: 2.186 }]

  it('knows a tunnel, a culvert and an indoor corridor', () => {
    expect(isBelowSurface({ tunnel: 'yes' })).toBe(true)
    expect(isBelowSurface({ tunnel: 'culvert' })).toBe(true)
    expect(isBelowSurface({ location: 'underground' })).toBe(true)
    expect(isBelowSurface({ indoor: 'yes' })).toBe(true)
  })

  it('leaves the surface alone', () => {
    expect(isBelowSurface({})).toBe(false)
    expect(isBelowSurface({ tunnel: 'no' })).toBe(false)
    // An arcade or a market hall IS the ground floor of the street.
    expect(isBelowSurface({ covered: 'yes' })).toBe(false)
  })

  it('never reads a negative LAYER as underground', () => {
    // The trap: `layer=-1` is what an ordinary street carries where a bridge
    // passes over it. Using it here would delete real streets in every city
    // with a flyover.
    expect(isBelowSurface({ layer: '-1', highway: 'secondary' })).toBe(false)
    expect(parseOsmFeatures({
      elements: [{ type: 'way', id: 1, tags: { highway: 'secondary', layer: '-1' }, geometry: line }],
    })).toHaveLength(1)
  })

  it('drops the culverted stream and the indoor corridor, KEEPS the metro', () => {
    const out = parseOsmFeatures({
      elements: [
        { type: 'way', id: 1, tags: { railway: 'subway', tunnel: 'yes' }, geometry: line },
        { type: 'way', id: 2, tags: { waterway: 'stream', tunnel: 'culvert', location: 'underground' }, geometry: line },
        { type: 'way', id: 3, tags: { highway: 'service', indoor: 'yes' }, geometry: line },
        { type: 'way', id: 4, tags: { highway: 'secondary' }, geometry: line },
      ],
    })
    // A culverted stream drawn as a blue ribbon through a park, and a shopping
    // centre's corridors drawn as streets, are still wrong. But a metro is
    // infrastructure to be drawn BELOW the surface, not scenery to be deleted —
    // and deleting it at parse time, before the cache, meant no layer toggle
    // could ever bring it back.
    expect(out.map((f) => f.id)).toEqual(['w1', 'w4'])
    expect(out[0].vertical?.structure).toBe('tunnel')
  })

  it('keeps a building passage, which is the ground floor of a street', () => {
    // 114 of the 226 tunnel-tagged ways in the benchmark district are these:
    // arcades and gateways people walk through. All of them used to vanish.
    const out = parseOsmFeatures({
      elements: [
        { type: 'way', id: 9, tags: { highway: 'footway', tunnel: 'building_passage' }, geometry: line },
      ],
    })
    expect(out).toHaveLength(1)
    expect(out[0].vertical?.structure).toBe('covered')
  })
})

describe('a square is an area, not a ribbon around its edge', () => {
  // 83 features in the Ciutadella box are `area=yes` highways. Ribboning them
  // drew a 3 m footpath around the outline of the Passeig de Lluís Companys and
  // left the middle showing the raster basemap.

  const plaza = [
    { lat: 41.390, lon: 2.180 }, { lat: 41.390, lon: 2.1806 },
    { lat: 41.3906, lon: 2.1806 }, { lat: 41.3906, lon: 2.180 },
    { lat: 41.390, lon: 2.180 },
  ]

  it('parses a pedestrian area as a polygon with no width', () => {
    const out = parseOsmFeatures({
      elements: [{ type: 'way', id: 7, tags: { highway: 'pedestrian', area: 'yes' }, geometry: plaza }],
    })
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('road')
    expect(out[0].widthM).toBeUndefined()
    expect(out[0].ring!.length).toBeGreaterThanOrEqual(4)
  })

  it('leaves a closed way that is NOT an area as a ribbon', () => {
    // A roundabout is a closed carriageway and emphatically not a plaza.
    const out = parseOsmFeatures({
      elements: [{
        type: 'way', id: 8,
        tags: { highway: 'secondary', junction: 'roundabout' },
        geometry: plaza,
      }],
    })
    expect(out[0].widthM).toBeGreaterThan(0)
  })
})

describe('monuments whose form their outline cannot carry', () => {
  it('reads a triumphal arch from either tag', () => {
    expect(monumentShape({ building: 'triumphal_arch' })).toBe('arch')
    expect(monumentShape({ man_made: 'arch' })).toBe('arch')
    expect(monumentShape({ building: 'yes', historic: 'monument' })).toBeUndefined()
    expect(monumentShape({})).toBeUndefined()
  })

  it('builds a free-standing arch through the building path', () => {
    // `man_made=arch` carries no `building` tag, so without this it classified
    // as nothing at all and never reached the scene.
    expect(classifyFeature({ man_made: 'arch' })).toBe('building')
    expect(resolveFeatureStyle('building', { building: 'triumphal_arch' }).monument).toBe('arch')
  })

  it('asks Overpass for the ones that are not tagged as buildings', () => {
    const q = buildFeaturesQuery({ south: 41.38, west: 2.17, north: 41.39, east: 2.19 })
    expect(q).toContain('["man_made"="arch"]')
  })
})


// ── The sea ───────────────────────────────────────────────────────────────────
// `natural=coastline` is a LINE, and the water it implies is not mapped by
// anybody. Until this existed, a waterfront site drew no sea at all — the open
// Port Vell basin and the Mediterranean beyond it are pure coastline, and the
// roads and buildings of the Barceloneta hung over nothing.

describe('coastline becomes the sea', () => {
  const BBOX = { south: 41.36, west: 2.17, north: 41.38, east: 2.19 }

  /** A northward shore down the middle: land west, water east. */
  const shore = {
    type: 'way', id: 900, tags: { natural: 'coastline' },
    geometry: [
      { lat: 41.35, lon: 2.18 }, { lat: 41.37, lon: 2.18 }, { lat: 41.39, lon: 2.18 },
    ],
  }

  it('emits a water feature covering the seaward side', () => {
    const out = parseOsmFeatures({ elements: [shore] }, { bbox: BBOX })
    const sea = out.filter((f) => f.kind === 'water')
    expect(sea).toHaveLength(1)
    expect(sea[0].ring!.length).toBeGreaterThanOrEqual(3)
    // Every vertex east of, or on, the shoreline — the water side.
    expect(sea[0].ring!.every((p) => p.lon >= 2.18 - 1e-9)).toBe(true)
  })

  it('is an ORDINARY water feature, so every existing path just works', () => {
    // Not a new kind, not a new layer, not a new contract. The layer toggle,
    // the material, the animation and the DEM water mask all already handle it.
    const sea = parseOsmFeatures({ elements: [shore] }, { bbox: BBOX })
      .find((f) => f.kind === 'water')!
    expect(sea.style.roofShape).toBeDefined()
    expect(sea.height.heightM).toBe(0)
  })

  it('draws no sea inland', () => {
    const out = parseOsmFeatures({
      elements: [{ type: 'way', id: 5, tags: { highway: 'residential' },
        geometry: [{ lat: 41.37, lon: 2.175 }, { lat: 41.375, lon: 2.176 }] }],
    }, { bbox: BBOX })
    expect(out.filter((f) => f.kind === 'water')).toHaveLength(0)
  })

  it('does not draw the coastline itself as a feature', () => {
    // It is the EDGE of the water, not a thing. Drawn, it would be a blue line
    // running down the beach.
    const out = parseOsmFeatures({ elements: [shore] }, { bbox: BBOX })
    expect(out.every((f) => f.id !== 'w900')).toBe(true)
  })

  it('needs the bbox — without it there is nothing to close the sea against', () => {
    expect(parseOsmFeatures({ elements: [shore] })).toHaveLength(0)
  })
})

// ── Real ground, not a shape I drew ───────────────────────────────────────────
// Two failures that only a real city produces, both measured against the
// surveyed data for the 700 m box the app actually queries around the Hotel
// Vela (src/lib/geo/__fixtures__/portvell.json, OpenStreetMap, ODbL). Synthetic
// tags could not have found either: one needs a relation a mapper split into
// three ways, the other needs a quay that is also the shoreline, and nobody
// writes those by hand because nobody expects them.

describe('parseOsmFeatures over the real Port Vell box', () => {
  const BOX = portvell._bbox as { south: number; west: number; north: number; east: number }
  const features = parseOsmFeatures(
    { elements: portvell.elements }, { bbox: BOX },
  ) as OsmFeature[]

  const MPD_LAT = 111132
  const MPD_LON = 111320 * Math.cos((41.3687 * Math.PI) / 180)
  const areaM2 = (ring: ReadonlyArray<{ lat: number; lon: number }>): number => {
    let a = 0
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      a += (ring[j].lon * MPD_LON) * (ring[i].lat * MPD_LAT)
         - (ring[i].lon * MPD_LON) * (ring[j].lat * MPD_LAT)
    }
    return Math.abs(a) / 2
  }

  // Platja de Sant Sebastia is relation 7333375, and its outer ring is three
  // open ways of 463 m, 57 m and 608 m — one of which is the shoreline itself.
  // Closing each on its own gave two overlapping polygons of 17 139 and 26 603
  // m2: together twice the beach, neither its shape, and the shoreline folded
  // back so the sand crossed into the water.
  it('assembles the beach relation into one ring, not one per member', () => {
    const beach = features.filter((f) => f.id.startsWith('r7333375'))
    expect(beach).toHaveLength(1)
    expect(beach[0].kind).toBe('sand')
    expect(beach[0].ring).toHaveLength(37)
    expect(areaM2(beach[0].ring!)).toBeGreaterThan(21_000)
    expect(areaM2(beach[0].ring!)).toBeLessThan(22_500)
  })

  // Moll de Barcelona carries man_made=quay AND natural=coastline on one way,
  // as does the mole guarding the Nova Bocana. Taking the shoreline and
  // stopping meant the most visible built edge of the harbour drew nothing.
  it('draws a quay that is also the shoreline, and still builds the sea from it', () => {
    const quay = features.find((f) => f.id === 'w283764976')
    expect(quay?.kind).toBe('pier')
    expect(quay?.widthM).toBeGreaterThan(0)

    const mole = features.find((f) => f.id === 'w500584596')
    expect(mole?.kind).toBe('pier')
    expect(mole?.style.pierKind).toBe('mole')

    // The same ways are still shoreline: the sea is unchanged by all of this.
    const sea = features.filter((f) => f.id.startsWith('sea-'))
    expect(sea.length).toBeGreaterThan(0)
    expect(sea.every((f) => (f.ring?.length ?? 0) > 3)).toBe(true)
  })

  it('a plain coastline way is still not a feature of its own', () => {
    // The fall-through must not start drawing blue lines down the beach: a way
    // whose only tag is natural=coastline classifies to null exactly as before.
    const els = portvell.elements as unknown as Array<{ id: number; tags?: Record<string, string> }>
    const plain = els.find(
      (e) => e.tags?.['natural'] === 'coastline' && Object.keys(e.tags).length === 1,
    )
    expect(plain).toBeDefined()
    expect(features.some((f) => f.id === `w${plain!.id}`)).toBe(false)
  })
})
