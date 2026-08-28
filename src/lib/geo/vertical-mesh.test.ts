// ─── vertical mesh tests ──────────────────────────────────────────────────────
// THE RULE THIS FILE EXISTS FOR:
//
//   a vertical profile that is mathematically correct is worth nothing if the
//   mesh built from it has too few degrees of freedom to express it.
//
// The solver's own tests live in vertical-network.test.ts and pass whether or
// not a single vertex of the result reaches the screen. These check the other
// half of the chain — that what the solver decided actually survives into
// geometry — because the two can disagree silently. They did: with the terrain
// switched off the DEM asked for no subdivision, so a bridge was emitted as one
// quad between its own two ramp ends. The solver was right, the deck was real,
// and it was nowhere in the mesh.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildLinearLayer, solveSceneVertical, buildPierLayer } from './osm-scene'
import { readVerticalTags } from './vertical'
import { sampleProfile } from './vertical-network'
import { createGroundFrame } from './ground-frame'
import { latLonToNormalized } from './geo-math'
import type { OsmFeature } from './osm-features'

const LAT = 41.38
const LON = 2.19
const ANCHOR_M = 0

const dLat = (m: number): number => m / 111_132
const dLon = (m: number): number => m / (111_320 * Math.cos((LAT * Math.PI) / 180))

const northSouth = (a: number, b: number): Array<{ lat: number; lon: number }> => [
  { lat: LAT + dLat(a), lon: LON }, { lat: LAT + dLat(b), lon: LON },
]
const eastWest = (a: number, b: number): Array<{ lat: number; lon: number }> => [
  { lat: LAT, lon: LON + dLon(a) }, { lat: LAT, lon: LON + dLon(b) },
]

function road(
  id: string, ring: Array<{ lat: number; lon: number }>, tags: Record<string, string>,
): OsmFeature {
  return {
    id, kind: 'road', ring,
    height: { heightM: 0, minHeightM: 0, estimated: true },
    widthM: 8,
    style: { roofShape: 'flat', roofHeightM: 0, roadClass: 'vehicular' },
    vertical: readVerticalTags(tags),
    functional: 'road',
  }
}

/** surface → ramp → deck → ramp → surface, crossed by a street on the ground. */
function overpass(structure: Record<string, string>): OsmFeature[] {
  return [
    road('under', eastWest(-150, 150), { highway: 'primary' }),
    road('app-s', northSouth(-260, -55), { highway: 'trunk' }),
    road('span', northSouth(-55, 55), { highway: 'trunk', ...structure }),
    road('app-n', northSouth(55, 260), { highway: 'trunk' }),
  ]
}

/** Terrain OFF — no sampler at all. */
const FLAT = { anchorLat: LAT, anchorElevationM: ANCHOR_M, exaggeration: 1 }
/** Terrain ON, but describing a dead-flat world. */
const FLAT_DEM = { ...FLAT, sampleGroundM: (): number => ANCHOR_M }

function build(features: OsmFeature[], base: typeof FLAT | typeof FLAT_DEM) {
  const vertical = solveSceneVertical(features, base)
  return {
    vertical,
    layer: buildLinearLayer(features, 'road', { ...base, vertical })!,
    frame: createGroundFrame(base),
  }
}

/** Vertical extent of a built object, in scene units. */
function zRangeOf(obj: THREE.Object3D): { lo: number; hi: number } {
  let lo = Infinity
  let hi = -Infinity
  obj.traverse((n) => {
    const pos = (n as THREE.Mesh).geometry?.getAttribute?.('position') as
      THREE.BufferAttribute | undefined
    if (!pos) return
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i)
      if (z < lo) lo = z
      if (z > hi) hi = z
    }
  })
  return { lo, hi }
}

/** Every z in a built layer, in METRES above the anchor. */
function metres(obj: THREE.Object3D, mToN: number): number[] {
  const out: number[] = []
  obj.traverse((n) => {
    const pos = (n as THREE.Mesh).geometry?.getAttribute?.('position') as
      THREE.BufferAttribute | undefined
    if (!pos) return
    for (let i = 0; i < pos.count; i++) out.push(pos.getZ(i) / mToN)
  })
  return out
}

// ── §17 — the exact bug, as a regression ──────────────────────────────────────

describe('the deck reaches the mesh, with the terrain switched OFF', () => {
  // THIS IS THE REGRESSION. Before mandatory breakpoints and profile-driven
  // subdivision, `subdivisionsFor` returned 0 with no DEM, the span was emitted
  // as a single quad from ramp end to ramp end, and the highest vertex in the
  // whole layer was 4.1 m — the ramp — while the solver had a 5 m deck.
  const { vertical, layer, frame } = build(overpass({ bridge: 'yes', layer: '1' }), FLAT)
  const deck = vertical.get('span')!
  const deckM = Math.max(...deck.elevationM)

  it('the solver produces a deck at all', () => {
    expect(deckM).toBeGreaterThanOrEqual(5)
    expect(deck.structure).toBe('bridge')
  })

  it('and the mesh actually reaches it', () => {
    const zs = metres(layer.object, frame.mToN)
    expect(Math.max(...zs)).toBeGreaterThanOrEqual(deckM - 0.35)
  })

  it('with vertices INSIDE the deck, not only at its two ends', () => {
    // A quad between the ramp ends would put nothing in this band at all.
    const zs = metres(layer.object, frame.mToN)
    const insideDeck = zs.filter((z) => z > deckM - 0.4)
    expect(insideDeck.length).toBeGreaterThan(12)
  })

  it('and the road underneath is still on the ground', () => {
    const zs = metres(layer.object, frame.mToN)
    expect(Math.min(...zs)).toBeLessThan(0.5)
  })
})

// ── §19 / §20 — a bore, and the portal that forms on its own ─────────────────

describe('the bore, and where the road stops being visible', () => {
  const { vertical, layer, frame } = build(overpass({ tunnel: 'yes', layer: '-1' }), FLAT)
  const bore = vertical.get('span')!
  const boreM = Math.min(...bore.elevationM)
  const zs = metres(layer.object, frame.mToN)

  it('the solver sends the alignment well below the ground', () => {
    expect(bore.structure).toBe('tunnel')
    expect(boreM).toBeLessThanOrEqual(-5)
  })

  it('the mesh shows the descent', () => {
    // The approaches dive: the road visibly goes DOWN before it disappears,
    // which is what makes it read as entering something rather than stopping.
    expect(Math.min(...zs)).toBeLessThan(-0.2)
  })

  it('but does NOT draw the buried section', () => {
    // Drawn, it would z-fight its way through the ground above it or be
    // occluded anyway. The portal is exactly where the alignment crosses the
    // surface — no portal geometry, no marker, no special case.
    expect(Math.min(...zs)).toBeGreaterThan(boreM + 3)
    expect(Math.min(...zs)).toBeGreaterThan(-2)
  })

  it('treats an open cutting the same way — it stops at the surface too', () => {
    // A trench is shallower than a bore but it is still below the ground, and
    // the terrain is not cut to reveal it (see the note on not deforming the
    // surface to suit infrastructure). So it stops at the same place.
    const cutting = build(overpass({ layer: '-1' }), FLAT)
    expect(cutting.vertical.get('span')!.structure).toBe('trench')
    const deepest = Math.min(...metres(cutting.layer.object, cutting.frame.mToN))
    expect(deepest).toBeLessThan(-0.2)
    expect(deepest).toBeGreaterThan(-2)
  })

  it('leaves the crossing road untouched above it', () => {
    expect(Math.max(...zs)).toBeLessThan(0.5)
  })
})

// ── §18 — geometry against the profile it claims to represent ─────────────────

describe('the mesh agrees with the profile at every station', () => {
  it('never departs from the solved profile by more than the error bound', () => {
    const { vertical } = build(overpass({ bridge: 'yes', layer: '1' }), FLAT)
    const profile = vertical.get('span')!
    const s = sampleProfile(profile)
    const total = profile.stationM[profile.stationM.length - 1]

    // Rebuild the way the mesh does — fences at mandatory breakpoints plus
    // adaptive samples — then check the straight lines between those fences
    // against the true profile everywhere in between.
    const fences = [0, ...s.stationsBetween(0, total), total]
    let worst = 0
    for (let i = 0; i < fences.length - 1; i++) {
      const a = fences[i]
      const b = fences[i + 1]
      const za = s.atStation(a).elevationM
      const zb = s.atStation(b).elevationM
      for (let k = 1; k < 8; k++) {
        const t = k / 8
        const straight = za + (zb - za) * t
        const actual = s.atStation(a + (b - a) * t).elevationM
        worst = Math.max(worst, Math.abs(actual - straight))
      }
    }
    expect(worst).toBeLessThan(0.2)
  })

  it('keeps every mandatory breakpoint as a fence', () => {
    const { vertical } = build(overpass({ bridge: 'yes', layer: '1' }), FLAT)
    const profile = vertical.get('span')!
    const s = sampleProfile(profile)
    const total = profile.stationM[profile.stationM.length - 1]
    const fences = s.stationsBetween(0, total)
    for (const b of profile.breakpoints) {
      if (b <= 1e-9 || b >= total - 1e-9) continue
      expect(fences.some((f) => Math.abs(f - b) < 1e-6)).toBe(true)
    }
  })

  it('does not over-subdivide a profile with nothing happening in it', () => {
    // A dead-straight surface road on flat ground has no vertical shape to
    // express, and must not pay for one.
    const { vertical } = build([road('r', northSouth(-500, 500), { highway: 'primary' })], FLAT)
    const s = sampleProfile(vertical.get('r')!)
    const total = vertical.get('r')!.stationM[vertical.get('r')!.stationM.length - 1]
    expect(s.stationsBetween(0, total).length).toBeLessThan(40)
  })
})

// ── §8 — C0 continuity ────────────────────────────────────────────────────────

describe('C0: a connected road has one elevation at each join', () => {
  for (const [name, structure] of [
    ['bridge', { bridge: 'yes', layer: '1' }],
    ['tunnel', { tunnel: 'yes', layer: '-1' }],
    ['trench', { layer: '-1' }],
  ] as const) {
    it(`joins exactly, through a ${name}`, () => {
      const { vertical } = build(overpass(structure), FLAT)
      const end = (id: string): number => {
        const p = vertical.get(id)!
        return p.elevationM[p.elevationM.length - 1]
      }
      const start = (id: string): number => vertical.get(id)!.elevationM[0]

      // app-s ends where span starts; span ends where app-n starts. EXACTLY —
      // an accumulated 0.14 m of drift is a hole in the carriageway.
      expect(end('app-s')).toBeCloseTo(start('span'), 9)
      expect(end('span')).toBeCloseTo(start('app-n'), 9)
    })
  }
})

// ── §12 / §13 — terrain OFF is a first-class citizen ──────────────────────────

describe('terrain OFF and a flat DEM describe the same city', () => {
  const cases = [
    ['bridge', { bridge: 'yes', layer: '1' }],
    ['tunnel', { tunnel: 'yes', layer: '-1' }],
  ] as const

  for (const [name, structure] of cases) {
    it(`${name}: structures and elevations match`, () => {
      const off = build(overpass(structure), FLAT).vertical
      const on = build(overpass(structure), FLAT_DEM).vertical

      // The presence of a DEM must not be a SEMANTIC signal. Only the function
      // that answers "what is the ground here" may differ, and here it answers
      // the same thing, so everything downstream must too.
      for (const id of ['under', 'app-s', 'span', 'app-n']) {
        expect(on.get(id)!.structure).toBe(off.get(id)!.structure);
        expect(on.get(id)!.phase).toEqual(off.get(id)!.phase)
        const a = off.get(id)!.elevationM
        const b = on.get(id)!.elevationM
        expect(b.length).toBe(a.length)
        for (let i = 0; i < a.length; i++) expect(b[i]).toBeCloseTo(a[i], 6)
      }
    })

    it(`${name}: the rendered mesh matches too`, () => {
      const a = build(overpass(structure), FLAT)
      const b = build(overpass(structure), FLAT_DEM)
      const za = metres(a.layer.object, a.frame.mToN)
      const zb = metres(b.layer.object, b.frame.mToN)
      expect(Math.max(...zb)).toBeCloseTo(Math.max(...za), 3)
      expect(Math.min(...zb)).toBeCloseTo(Math.min(...za), 3)
    })
  }
})

// ── §26 / §27 — provenance survives the way splitter ──────────────────────────

describe('a way split into several ribbons keeps its profile', () => {
  it('finds the profile for every piece of a split way', () => {
    // A single OSM way crossed by two side streets is split into three ribbons.
    // All three must resolve to the SAME source feature and the same profile.
    const features: OsmFeature[] = [
      road('main', northSouth(-300, 300), { highway: 'primary', bridge: 'yes', layer: '1' }),
      road('side-a', [
        { lat: LAT + dLat(-100), lon: LON - dLon(80) },
        { lat: LAT + dLat(-100), lon: LON },
      ], { highway: 'residential' }),
      road('side-b', [
        { lat: LAT + dLat(100), lon: LON },
        { lat: LAT + dLat(100), lon: LON + dLon(80) },
      ], { highway: 'residential' }),
    ]
    const { vertical, layer, frame } = build(features, FLAT)
    const deckM = Math.max(...vertical.get('main')!.elevationM)
    expect(deckM).toBeGreaterThan(4)

    // If any split piece had lost its profile it would have been drawn on the
    // ground, and the deck would be full of holes at ground level.
    const zs = metres(layer.object, frame.mToN)
    expect(zs.filter((z) => z > deckM - 0.4).length).toBeGreaterThan(12)
  })
})

// ── §28 — adversarial ─────────────────────────────────────────────────────────

describe('adversarial geometry', () => {
  const cases: Array<[string, OsmFeature[]]> = [
    ['a short span', [
      road('a', northSouth(-90, -8), { highway: 'primary' }),
      road('b', northSouth(-8, 8), { highway: 'primary', bridge: 'yes', layer: '1' }),
      road('c', northSouth(8, 90), { highway: 'primary' }),
    ]],
    ['a very long viaduct', [
      road('v', northSouth(-1500, 1500), { highway: 'motorway', bridge: 'yes', layer: '1' }),
    ]],
    ['a curved deck', [
      road('curve', [
        { lat: LAT + dLat(-90), lon: LON },
        { lat: LAT + dLat(-40), lon: LON + dLon(35) },
        { lat: LAT + dLat(20), lon: LON + dLon(38) },
        { lat: LAT + dLat(80), lon: LON },
      ], { highway: 'primary', bridge: 'yes', layer: '1' }),
    ]],
    ['two bridges at different layers', [
      road('l1', eastWest(-150, 150), { highway: 'primary', bridge: 'yes', layer: '1' }),
      road('l2', northSouth(-150, 150), { highway: 'motorway', bridge: 'yes', layer: '2' }),
      road('g', [
        { lat: LAT - dLat(120), lon: LON - dLon(120) },
        { lat: LAT + dLat(120), lon: LON + dLon(120) },
      ], { highway: 'residential' }),
    ]],
    ['a bridge over a tunnel', [
      road('bore', eastWest(-150, 150), { highway: 'trunk', tunnel: 'yes', layer: '-1' }),
      road('deck', northSouth(-150, 150), { highway: 'trunk', bridge: 'yes', layer: '1' }),
    ]],
    ['contradictory tags', [
      road('x', northSouth(-120, 120), {
        highway: 'primary', bridge: 'yes', tunnel: 'yes', layer: '-2', ele: 'nope',
      }),
    ]],
  ]

  for (const [name, features] of cases) {
    it(`survives ${name} in both terrain modes`, () => {
      for (const base of [FLAT, FLAT_DEM]) {
        const { layer, frame } = build(features, base)
        const zs = metres(layer.object, frame.mToN)
        expect(zs.length).toBeGreaterThan(0)
        for (const z of zs) expect(Number.isFinite(z)).toBe(true)
        // Nothing may run away: a city block is tens of metres, not hundreds.
        expect(Math.max(...zs.map(Math.abs))).toBeLessThan(80)
      }
    })
  }

  it('does not weld a deck to the road passing under it', () => {
    // The two ways cross in plan and share no node, so no junction may exist
    // between them — and no geometry may bridge the gap in z.
    const { layer, frame } = build(overpass({ bridge: 'yes', layer: '1' }), FLAT)
    const zs = metres(layer.object, frame.mToN).sort((a, b) => a - b)
    // A welded junction would fill the band between the road and the deck with
    // a continuous sheet. A ramp does cross that band, but only on the
    // approaches — so the band must be sparse, not solid.
    const inBand = zs.filter((z) => z > 1.5 && z < 3.5).length
    expect(inBand / zs.length).toBeLessThan(0.35)
  })
})


// ── §11 — the mesh must not pay for shape it does not have ────────────────────
//
// Measured, not asserted from intuition. A grid city of 60 dead-straight
// streets plus 30 real structures: the streets have no vertical shape and must
// cost nothing, while the structures get exactly the vertices they need.
//
// The numbers this guards against are real regressions that were measured here:
// subdividing uniformly at the profile's station spacing turned 2 700 vertices
// into 286 500 (106x), and a blanket "cut every 40 m" backstop still left
// 113 700 (42x). Both looked correct and neither was visible in any other test.

describe('geometry density stays proportional to the shape', () => {
  function gridCity(): OsmFeature[] {
    const out: OsmFeature[] = []
    for (let i = 0; i < 30; i++) {
      out.push(road(`ew${i}`, [
        { lat: LAT + dLat(i * 80 - 1200), lon: LON - dLon(1200) },
        { lat: LAT + dLat(i * 80 - 1200), lon: LON + dLon(1200) },
      ], { highway: 'residential' }))
      out.push(road(`ns${i}`, [
        { lat: LAT - dLat(1200), lon: LON + dLon(i * 80 - 1200) },
        { lat: LAT + dLat(1200), lon: LON + dLon(i * 80 - 1200) },
      ], { highway: 'residential' }))
    }
    for (let i = 0; i < 20; i++) {
      out.push(road(`br${i}`, [
        { lat: LAT + dLat(i * 100 - 1000), lon: LON - dLon(300) },
        { lat: LAT + dLat(i * 100 - 1000), lon: LON + dLon(300) },
      ], { highway: 'primary', bridge: 'yes', layer: '1' }))
    }
    for (let i = 0; i < 10; i++) {
      out.push(road(`tu${i}`, [
        { lat: LAT - dLat(1000), lon: LON + dLon(i * 200 - 1000) },
        { lat: LAT + dLat(1000), lon: LON + dLon(i * 200 - 1000) },
      ], { highway: 'trunk', tunnel: 'yes', layer: '-1' }))
    }
    return out
  }

  const vertexCount = (o: THREE.Object3D): number => {
    let n = 0
    o.traverse((c) => {
      const pos = (c as THREE.Mesh).geometry?.getAttribute?.('position')
      if (pos) n += pos.count
    })
    return n
  }

  it('a flat street with no vertical shape gets NO extra vertices at all', () => {
    // Exact, not approximate. The profile is piecewise linear and this one has
    // no bends, so there is nothing for a vertex to express and none is spent.
    const flatStreet = [road('r', northSouth(-1200, 1200), { highway: 'residential' })]
    const plain = buildLinearLayer(flatStreet, 'road', FLAT)!
    const carried = build(flatStreet, FLAT).layer
    expect(vertexCount(carried.object)).toBe(vertexCount(plain.object))
  })

  it('a bridge spends vertices, and only where it bends', () => {
    const carried = build(overpass({ bridge: 'yes', layer: '1' }), FLAT).layer
    const plain = buildLinearLayer(overpass({ bridge: 'yes', layer: '1' }), 'road', FLAT)!
    expect(vertexCount(carried.object)).toBeGreaterThan(vertexCount(plain.object))
  })

  it('a whole grid city stays within a sane multiple', () => {
    const features = gridCity()
    const plain = buildLinearLayer(features, 'road', FLAT)!
    const carried = build(features, FLAT).layer
    const ratio = vertexCount(carried.object) / vertexCount(plain.object)
    // Measured at 1.67x. 30 of the 90 ways are structures and genuinely need
    // stations; the other 60 are dead straight and must cost nothing. Anything
    // approaching the old numbers is uniform subdivision creeping back in.
    expect(ratio).toBeLessThan(3)
  })

  it('adds almost nothing on terrain, where the DEM already pays for stations', () => {
    const features = gridCity()
    const hill = (nx: number, ny: number): number => nx * 3e6 + ny * 2e6
    const base = { ...FLAT, sampleGroundM: hill }
    const plain = buildLinearLayer(features, 'road', base)!
    const carried = build(features, base).layer
    // Measured at 1.01x: on terrain the DEM has already paid for the stations,
    // and the profile asks for almost nothing on top.
    expect(vertexCount(carried.object) / vertexCount(plain.object)).toBeLessThan(1.15)
  })
})

// ── Piers and quays: the datum is the sea ─────────────────────────────────────
//
// The measurement that forces this: over the benchmark harbour the terrain
// raster reads +8.5 m on a flat quay and +4.7 m on OPEN WATER, because it is a
// surface model full of moored vessels and terminal roofs. A quay's height is
// not a property of the ground under it — there is no ground under it.

describe('buildPierLayer', () => {
  const pier = (
    id: string, ring: Array<{ lat: number; lon: number }>, tags: Record<string, string>,
    widthM?: number,
  ): OsmFeature => ({
    id, kind: 'pier', ring,
    height: { heightM: 0, minHeightM: 0, estimated: true },
    ...(widthM === undefined ? {} : { widthM }),
    style: {
      roofShape: 'flat', roofHeightM: 0,
      pierKind: tags['man_made'] === 'breakwater' ? 'mole' : 'deck',
    },
    vertical: readVerticalTags(tags),
  })

  const quayRing = [
    { lat: LAT, lon: LON }, { lat: LAT, lon: LON + dLon(60) },
    { lat: LAT + dLat(30), lon: LON + dLon(60) }, { lat: LAT + dLat(30), lon: LON },
  ]

  /** A raster that lies about the harbour exactly the way the real one does. */
  const LYING_DEM = {
    anchorLat: LAT, anchorElevationM: ANCHOR_M, exaggeration: 1,
    sampleGroundM: (): number => 8.5,
  }

  it('places the deck above SEA LEVEL, not above what the raster claims', () => {
    const built = buildPierLayer([pier('q', quayRing, { man_made: 'quay' })], LYING_DEM)!
    const frame = createGroundFrame(LYING_DEM)
    const { hi } = zRangeOf(built.object)
    // 2 m of freeboard above the sea — not 2 m above a phantom 8.5 m of ground.
    expect(hi / frame.mToN).toBeCloseTo(2, 1)
  })

  it('keeps its freeboard in TRUE METRES under exaggeration', () => {
    const heights = [1, 3].map((k) => {
      const o = { ...LYING_DEM, exaggeration: k }
      const built = buildPierLayer([pier('q', quayRing, { man_made: 'quay' })], o)!
      return zRangeOf(built.object).hi / createGroundFrame(o).mToN
    })
    expect(heights[0]).toBeCloseTo(heights[1], 6)
  })

  it('gives a deck real thickness, so it is not a decal on the water', () => {
    const built = buildPierLayer([pier('q', quayRing, { man_made: 'quay' })], LYING_DEM)!
    const frame = createGroundFrame(LYING_DEM)
    const { lo, hi } = zRangeOf(built.object)
    expect((hi - lo) / frame.mToN).toBeGreaterThan(0.5)
  })

  it('builds a finger pier from a CENTRELINE, which is how one is mapped', () => {
    // Closed into a ring it would be a zero-area sliver and the minimum-area
    // filter would delete it — which is how every marina pier used to vanish.
    const line = [{ lat: LAT, lon: LON }, { lat: LAT + dLat(70), lon: LON }]
    const built = buildPierLayer([pier('p', line, { man_made: 'pier' }, 4)], LYING_DEM)
    expect(built).not.toBeNull()
    expect(built!.count).toBe(1)
  })

  it('stands a breakwater higher than a walkable deck', () => {
    const frame = createGroundFrame(LYING_DEM)
    const deck = buildPierLayer([pier('q', quayRing, { man_made: 'quay' })], LYING_DEM)!
    const mole = buildPierLayer([pier('b', quayRing, { man_made: 'breakwater' })], LYING_DEM)!
    expect(zRangeOf(mole.object).hi / frame.mToN)
      .toBeGreaterThan(zRangeOf(deck.object).hi / frame.mToN)
  })

  it('honours a surveyed elevation over the default', () => {
    const built = buildPierLayer(
      [pier('q', quayRing, { man_made: 'quay', ele: '5.5' })], LYING_DEM)!
    const frame = createGroundFrame(LYING_DEM)
    expect(zRangeOf(built.object).hi / frame.mToN).toBeCloseTo(5.5, 1)
  })

  it('draws nothing when there is nothing to draw', () => {
    expect(buildPierLayer([], LYING_DEM)).toBeNull()
  })
})
