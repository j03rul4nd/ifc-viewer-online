// ─── Port Vell reality benchmark ──────────────────────────────────────────────
// The third level of testing in this repo, and the only one that can catch what
// the other two cannot.
//
//   unit                  — pure functions on shapes I drew
//   synthetic integration — controlled scenes with one thing wrong on purpose
//   REALITY REGRESSION    — this file: the surveyed data for a real place
//
// A function can pass every unit test and still destroy a real multipolygon,
// because a real multipolygon is three open ways in arbitrary order, one of
// which is also the shoreline. Both bugs this file was written after were of
// exactly that shape: invisible to synthetic tags, obvious in a census.
//
// WHAT IT MEASURES. Of everything the survey says is in this box, how much
// reaches the scene — and where the rest died:
//
//   fetched → parsed → classified → accepted → geometry → rendered
//
// The numbers below are not aspirations. They are what the code does today,
// pinned so that a change has to be deliberate. When one moves, the diff says
// which class of real thing we started or stopped drawing.
//
// OFFLINE AND DETERMINISTIC. The fixture is versioned in the repo and nothing
// here touches the network. See __fixtures__/portvell.json for its provenance
// and how to regenerate it.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { parseOsmFeatures, type FeatureLoss, type OsmFeature } from './osm-features'
import { censusFeatures, SCENE_PROBES } from './feature-audit'
import {
  ringMetrics, ringProblems, selfIntersections, duplicateVertices,
} from './ring-checks'
import { buildSurfaceLayer, buildLinearLayer, buildBridgeLayer, buildPierLayer } from './osm-scene'
import fixture from './__fixtures__/portvell.json'

const BOX = fixture._bbox as { south: number; west: number; north: number; east: number }
const ELEMENTS = fixture.elements as unknown as Array<{
  type?: string; id?: number; tags?: Record<string, string>
}>

/** One parse, shared by every case, with the loss diagnostic switched on. */
const losses: FeatureLoss[] = []
const FEATURES = parseOsmFeatures(
  { elements: ELEMENTS }, { bbox: BOX, onDrop: (l) => losses.push(l) },
) as OsmFeature[]
const CENSUS = censusFeatures(ELEMENTS, FEATURES, losses)
const probe = (key: string) => CENSUS.probes.find((p) => p.key === key)!

const LAT = 41.368708
const OPTS = { anchorLat: LAT }

describe('Port Vell benchmark · the survey reaches the parser', () => {
  it('parses the whole box without losing an element unaccounted for', () => {
    expect(CENSUS.inputElements).toBe(311)
    expect(CENSUS.parsedFeatures).toBeGreaterThan(240)

    // THE INVARIANT THAT MATTERS MOST. Every element that produced no feature
    // must have said why. An unexplained disappearance is worse than an
    // explained one, because the next quay-shaped bug hides in exactly this
    // column — and it is the column that stays empty if a `drop()` is missing.
    const unexplained = CENSUS.probes.flatMap((p) => p.unaccounted.map((id) => `${p.key}:${id}`))
    expect(unexplained).toEqual([])
  })

  it('reports the losses by reason, so a new one cannot arrive quietly', () => {
    // Every reason the parser can give, and how often it fires on real data.
    // A new code appearing here is a new way to lose a feature; a count moving
    // is a change in what we draw.
    expect(CENSUS.lossByReason).toEqual({
      // Understood and USED — these nine built the sea. Kept apart from the
      // column below on purpose: "consumed" and "unrecognised" are different
      // problems and merging them hides the second behind the first.
      'coastline-consumed-into-sea': 9,
      'no-classifier-claims-it': 57,
    })
  })
})

describe('Port Vell benchmark · what the harbour is made of', () => {
  // The named classes of thing this scene needs, and how much of each survives.
  // `input` is the survey; `reached` is what became a feature.
  const table: Array<[key: string, input: number, reached: number]> = [
    // The waterfront. `coastline` reaches 2 because exactly two of the eleven
    // shoreline ways are ALSO built structures — the Moll de Barcelona quay and
    // the mole at the Nova Bocana. The other nine are consumed into the sea,
    // which the loss table above accounts for by name.
    ['coastline',        11,   2],
    ['quays',             1,   1],
    ['piers',            12,  12],
    ['breakwaters',       2,   2],
    ['docks',             2,   2],
    ['beaches',           3,   3],
    ['water',             2,   2],
    // The street network and everything people walk on.
    ['roads',            80,  80],
    ['serviceWays',      51,  51],
    ['pedestrianWays',  113, 113],
    ['sidewalks',        32,  32],
    ['crossings',        21,  21],
    ['steps',             6,   6],
    ['pedestrianAreas',   5,   5],
    // Structure.
    ['bridgeWays',        7,   7],
    ['bridgeOutlines',    2,   2],
    ['tunnelWays',        6,   6],
    ['multipolygons',     1,   1],
    ['buildings',         2,   2],
    ['greenery',         18,  18],
  ]

  it.each(table)('%s: %i in the survey, %i reach the scene', (key, input, reached) => {
    const p = probe(key)
    expect(p.input).toBe(input)
    expect(p.reached).toBe(reached)
  })

  // These are REAL THINGS IN THIS BOX that no part of the pipeline claims. Each
  // line is a decision not to draw something that is there, and pinning them
  // means the day one is implemented this test says so out loud.
  it('names every class the survey has and the renderer ignores', () => {
    const ignored = CENSUS.probes
      .filter((p) => p.input > 0 && p.reached === 0)
      .map((p) => `${p.key}(${p.input})`)
      .sort()
    expect(ignored).toEqual([
      // Walls, fences, bollards and handrails. Not even requested — there is no
      // `barrier` group in the Overpass query.
      'barriers(23)',
      // Port Vell's own landuse polygon: the harbour, as a place.
      'harbourLanduse(1)',
      // Marina Vela and Marina Port Vell, both within sight of the model.
      'marinas(2)',
      'parking(7)',
      // `natural=tree_row` — a WAY, while the classifier only knows the `tree`
      // NODE. A row of planes down a promenade is four elements here and
      // twenty in the wider box.
      'trees(4)',
    ])
  })
})

describe('Port Vell benchmark · the harbour is made of the right stuff', () => {
  // The census counts SURVIVAL. These count IDENTITY: a feature that reaches
  // the scene as the wrong kind of thing is not a win, and the two bugs below
  // both did exactly that — they were drawn, so no counter anywhere moved.

  it('a wet dock is water, not a concrete lid over it', () => {
    // Port Vell's two basins, 2 106 m2 and 8 177 m2. Classified as `pier` they
    // were paved with an opaque 0.9 m slab hanging 2 m over the water they are
    // made of — and, being not-water, they were invisible to the mask that
    // stops the elevation raster reading their moored boats as ground.
    const docks = ['w1450919978', 'w1450919979']
      .map((id) => FEATURES.find((f) => f.id === id))
    expect(docks.every(Boolean)).toBe(true)
    for (const d of docks) expect(d!.kind).toBe('water')
  })

  it('a quay, a pontoon and a mole are three different structures', () => {
    const kindOf = (id: string) => FEATURES.find((f) => f.id === id)?.style.pierKind
    // Moll de Barcelona: the built edge of the land, 1 073 m of it.
    expect(kindOf('w283764976')).toBe('quay')
    // The mole guarding the Nova Bocana.
    expect(kindOf('w500584596')).toBe('mole')
    // A finger pontoon in the marina.
    expect(FEATURES.filter((f) => f.style.pierKind === 'deck').length).toBeGreaterThan(5)

    // …and the quay is not given a finger pier's four metres. It carries no
    // `width` tag, so the default is the only number it ever gets.
    const quay = FEATURES.find((f) => f.id === 'w283764976')!
    expect(quay.widthM).toBeGreaterThan(10)
  })

  it('the quay stands taller out of the water than a pontoon deck is thick', () => {
    // Measured through the real builder: the quay's face runs from its deck
    // down past the waterline, so in any view that is not straight down it
    // reads as an edge of land rather than a plank floating on the sea.
    const zSpan = (f: OsmFeature): number => {
      const built = buildPierLayer([f], OPTS)!
      const pos = (built.object as THREE.Mesh).geometry.getAttribute('position')
      let lo = Infinity
      let hi = -Infinity
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i)
        if (z < lo) lo = z
        if (z > hi) hi = z
      }
      return hi - lo
    }
    const quay = FEATURES.find((f) => f.id === 'w283764976')!
    const pontoon = FEATURES.find((f) => f.style.pierKind === 'deck' && f.widthM !== undefined)!
    expect(zSpan(quay)).toBeGreaterThan(zSpan(pontoon) * 2)
  })
})

describe('Port Vell benchmark · a way is allowed to mean several things', () => {
  // OSM does not classify exclusively, and neither may we. Everything here is
  // a real element in the box carrying two claims at once; the pipeline picks
  // one of them to build geometry from, which is fine — what is not fine is
  // erasing the others on the way past.

  it('keeps what a way is PAVED IN, not just what it is for', () => {
    // 93 of the 311 elements carry `surface`. Until it was read, every one of
    // them was drawn from `highway` alone — and 36 of them are paving stones
    // against 40 asphalt, so close to half the paved ground in the box was
    // tarmac that is not there.
    const withSurface = ELEMENTS.filter((e) => e.tags?.['surface']).length
    expect(withSurface).toBe(93)

    // 80 of the 93 reach a feature. The other thirteen are ground cover and
    // the unclassified — a playground's rubber, a beach's sand, the harbour
    // landuse nothing claims — which take their material from their own path
    // rather than from `surface`. Pinned rather than rounded up: the gap is
    // real and this is where it will be visible when it is worth closing.
    const carried = FEATURES.filter((f) => f.style.surface !== undefined)
    expect(carried).toHaveLength(80)

    const paving = FEATURES.filter((f) => f.style.surface === 'paving_stones')
    expect(paving.length).toBeGreaterThan(30)
    // …and it actually changes the colour, rather than being carried and ignored.
    const asphalt = FEATURES.find((f) => f.style.surface === 'asphalt' && f.style.tone)!
    const stone = paving.find((f) => f.style.tone)!
    expect(stone.style.tone![0]).toBeGreaterThan(asphalt.style.tone![0] + 0.05)
  })

  it('the Rambla de Mar is a pier AND a walkway AND made of wood', () => {
    // `man_made=pier` + `highway=pedestrian` + `area=yes` + `surface=wood`:
    // the most-walked structure in the harbour. The port branch claims it
    // first — correctly, it stands in the water — and used to drop everything
    // else, so a timber boardwalk was painted as commercial concrete.
    const rambla = FEATURES.find((f) => f.id === 'w231284638')!
    expect(rambla.kind).toBe('pier')
    expect(rambla.style.surface).toBe('wood')
    expect(rambla.style.roadClass).toBe('pedestrian')
  })

  it('a marked crossing is paint, and still knows it is a footway', () => {
    // Latent, and fixed anyway: crossings are excluded from the vertical solve
    // so nothing consumes `functional` for them today — and this box has no
    // crossing on a structure, so the wrong answer costs nothing here. It is
    // the line that would have been wrong the day a zebra is solved on a deck.
    const crossings = FEATURES.filter((f) => f.style.crossing)
    expect(crossings).toHaveLength(21)
    expect(crossings.every((f) => f.functional === 'pedestrian')).toBe(true)
  })

  it('a bridge is still a road and a tunnel is still a road', () => {
    // The orthogonality that already worked, pinned so it keeps working: 7
    // bridge ways and 6 tunnel ways in this box, every one of them still in the
    // street network rather than promoted out of it.
    const carried = FEATURES.filter((f) => f.vertical && f.vertical.structure !== 'ground')
    expect(carried.length).toBeGreaterThanOrEqual(11)
    expect(carried.every((f) => f.kind === 'road' || f.kind === 'rail')).toBe(true)
  })
})

describe('Port Vell benchmark · geometry is not catastrophically wrong', () => {
  // Cheap invariants against arithmetic disasters. None of these is subtle: a
  // 100 m quay whose bounding box is 20 km, a sea of near-zero area, a bridge
  // whose underside is above its deck. Every one has a single cause, and every
  // one is invisible in a count of features.
  const BOX_SPAN_M = 1600

  it('no ring escapes the query box', () => {
    for (const f of FEATURES) {
      if (!f.ring || f.ring.length < 3) continue
      const m = ringMetrics(f.ring)
      expect(m.widthM, `${f.id} width`).toBeLessThan(BOX_SPAN_M)
      expect(m.heightM, `${f.id} height`).toBeLessThan(BOX_SPAN_M)
    }
  })

  it('the sea is a real surface, simple and the right size', () => {
    const sea = FEATURES.filter((f) => f.id.startsWith('sea-'))
    expect(sea.length).toBeGreaterThan(0)
    let total = 0
    for (const s of sea) {
      const m = ringMetrics(s.ring!)
      // A harbour box that is mostly water: nothing near zero, nothing absurd.
      expect(m.areaM2).toBeGreaterThan(10_000)
      expect(selfIntersections(s.ring!), `${s.id} self-intersections`).toBe(0)
      expect(duplicateVertices(s.ring!), `${s.id} duplicate vertices`).toBe(0)
      total += m.areaM2
    }
    // Between a tenth of the box and all of it — a sea that swallowed the land
    // and a sea that vanished are both caught by this one line.
    const boxM2 = BOX_SPAN_M * BOX_SPAN_M
    expect(total).toBeGreaterThan(boxM2 * 0.1)
    expect(total).toBeLessThan(boxM2)
  })

  it('the beach is one simple ring of the surveyed size', () => {
    const beach = FEATURES.filter((f) => f.id.startsWith('r7333375'))
    expect(beach).toHaveLength(1)
    const m = ringMetrics(beach[0].ring!)
    expect(m.verts).toBe(37)
    expect(Math.round(m.areaM2 / 100) * 100).toBe(21_600)
    expect(ringProblems(beach[0].ring!)).toEqual([])
  })

  it('every area feature is fit to triangulate', () => {
    const bad: string[] = []
    for (const f of FEATURES) {
      // Linear features carry a width instead of an area; they are not rings.
      if (!f.ring || f.widthM !== undefined) continue
      const problems = ringProblems(f.ring)
      if (problems.length > 0) bad.push(`${f.id}: ${problems.join(',')}`)
    }
    expect(bad).toEqual([])
  })
})

describe('Port Vell benchmark · a square is a square', () => {
  it('a closed pedestrian street is paved, not ribboned round its own edge', () => {
    // Passeig del Mare Nostrum: 2 277 m2, 114 m from the model, closed, and
    // WITHOUT `area=yes` — which five of its six neighbours do carry. Drawn as
    // a ribbon it was a 5 m loop with a hole through the middle where the
    // promenade is.
    const promenade = FEATURES.find((f) => f.id === 'w907877703')!
    expect(promenade.kind).toBe('road')
    expect(promenade.widthM).toBeUndefined()   // an area, not a centreline
    expect(promenade.ring!.length).toBeGreaterThan(3)

    // Every closed pedestrian way in the box is now an area, and there are six.
    const areas = FEATURES.filter((f) => f.kind === 'road' && f.widthM === undefined)
    expect(areas).toHaveLength(5)   // the sixth is the Rambla de Mar, claimed as a pier
  })

  it('a plaza follows the ground instead of lidding it', () => {
    // The Passeig del Trencaones is 4 589 m2 spanning 365 m on SEVEN vertices.
    // Over terrain those seven corners are one flat plate across a third of a
    // kilometre; the fill has to be split against the DEM like every other
    // ground surface in the scene.
    const plaza = FEATURES.filter((f) => f.kind === 'road' && f.widthM === undefined)
    const flat = buildLinearLayer(plaza, 'road', OPTS)!
    const hilly = buildLinearLayer(plaza, 'road', {
      ...OPTS,
      // A ground that actually varies, so subdivision has something to follow.
      sampleGroundM: (nx: number, ny: number) => (nx + ny) * 4e7,
      anchorElevationM: 0,
    })!
    const verts = (m: { object: THREE.Object3D }): number => {
      let n = 0
      m.object.traverse((c) => {
        const g = (c as THREE.Mesh).geometry
        if (g?.getAttribute?.('position')) n += g.getAttribute('position').count
      })
      return n
    }
    expect(verts(hilly)).toBeGreaterThan(verts(flat) * 10)
    // …and the flat map pays NOTHING for it: with no terrain to follow there is
    // nothing to refine against, and the base triangulation is the answer.
    expect(verts(flat)).toBe(81)

    // BOUNDED. `subdivideOnGround` has only a recursion cap, and a cap of N
    // levels on a 365 m plaza is 4^N triangles whatever the polygon needs —
    // 59 412 vertices for these five. A point budget makes it 10 272: the same
    // surface, following the same ground, at a price somebody chose.
    expect(verts(hilly)).toBeLessThan(12_000)
  })

  it('says how many rings it had to refuse', () => {
    // Not a count of failures — a count that EXISTS. A plaza the triangulator
    // refuses used to be indistinguishable from a plaza nobody mapped.
    const built = buildLinearLayer(FEATURES, 'road', OPTS)!
    expect(built.dropped).toBe(0)
    expect(typeof built.dropped).toBe('number')
  })
})

describe('Port Vell benchmark · the layers actually build', () => {
  // The stage the census cannot see: features in, vertices out. A feature that
  // parses perfectly and then triangulates to nothing is still missing from the
  // scene, and until this ran nothing said so.
  const vertsOf = (o: THREE.Object3D): number => {
    let n = 0
    o.traverse((c) => {
      const g = (c as THREE.Mesh).geometry
      if (g?.getAttribute?.('position')) n += g.getAttribute('position').count
    })
    return n
  }

  it.each(['water', 'green', 'sand'] as const)('%s builds a surface with vertices', (kind) => {
    const built = buildSurfaceLayer(FEATURES, kind, OPTS)
    expect(built, `${kind} layer`).not.toBeNull()
    expect(vertsOf(built!.object)).toBeGreaterThan(0)
  })

  it('roads build one mesh carrying every drawn way', () => {
    const built = buildLinearLayer(FEATURES, 'road', OPTS)!
    expect(built.count).toBeGreaterThan(150)
    expect(vertsOf(built.object)).toBeGreaterThan(1000)
  })

  it('piers build, and the quay that is also the shoreline is among them', () => {
    const piers = FEATURES.filter((f) => f.kind === 'pier')
    expect(piers.map((f) => f.id)).toContain('w283764976') // Moll de Barcelona
    const built = buildPierLayer(FEATURES, OPTS)!
    expect(vertsOf(built.object)).toBeGreaterThan(0)
  })

  it('bridge outlines build with the deck above its own underside', () => {
    const built = buildBridgeLayer(FEATURES, OPTS)
    expect(built).not.toBeNull()
    const pos = (built!.object as THREE.Mesh).geometry.getAttribute('position')
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i)
      if (z < min) min = z
      if (z > max) max = z
    }
    // minZ < maxZ, and the span between them is a deck thickness, not a canyon.
    expect(max).toBeGreaterThan(min)
    expect(max - min).toBeLessThan(1e-6)
  })
})

describe('Port Vell benchmark · the probe list stays honest', () => {
  it('every probe is exercised by the real box or explicitly known to be absent', () => {
    // A probe that matches nothing is either a class this place does not have
    // (fine, say so) or a probe that no longer matches anything (a silent hole
    // in the benchmark). Pinning the empty ones makes the difference visible.
    const absent = SCENE_PROBES
      .map((p) => probe(p.key))
      .filter((p) => p.input === 0)
      .map((p) => p.key)
      .sort()
    expect(absent).toEqual(['railways'])
  })
})
