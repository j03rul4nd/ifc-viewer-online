// ─── vertical tests ───────────────────────────────────────────────────────────
// The semantic model and its primitives. The network-level scenarios — bridges,
// tunnels, ramps, terrain — live in vertical-network.test.ts.

import { describe, it, expect } from 'vitest'
import {
  readVerticalTags, lipschitzEnvelope,
  resolveStructureElevationM, lengthTagM, bestConfidence,
  MAX_LAYER, LAYER_SEPARATION_M, DEFAULT_BRIDGE_CLEARANCE_M, CROSSING_CLEARANCE_M,
  type ProfileVertex,
} from './vertical'
import { clearanceFromCrossings } from './vertical-network'

// ── Structure is a property, not a category ────────────────────────────────────

describe('readVerticalTags · structure is orthogonal to function', () => {
  it('reads a plain street as ground', () => {
    const t = readVerticalTags({ highway: 'residential' })
    expect(t.structure).toBe('ground')
    expect(t.layer).toBe(0)
  })

  it('reads a road on a bridge as a BRIDGE, without it ceasing to be a road', () => {
    // The whole point of the refactor: `bridge` describes carriage, not kind.
    // The caller keeps its own functional type; this only answers "how".
    const t = readVerticalTags({ highway: 'primary', bridge: 'yes', layer: '1' })
    expect(t.structure).toBe('bridge')
    expect(t.layer).toBe(1)
  })

  it('reads a railway in a tunnel the same way it reads a road in one', () => {
    expect(readVerticalTags({ railway: 'rail', tunnel: 'yes' }).structure).toBe('tunnel')
    expect(readVerticalTags({ highway: 'trunk', tunnel: 'yes' }).structure).toBe('tunnel')
  })

  it('treats a building passage as AT GRADE, not as a tunnel', () => {
    // 114 of 226 tunnel-tagged ways in the benchmark district are these. The
    // old blanket rule deleted every one — real streets, under arcades.
    const t = readVerticalTags({ highway: 'footway', tunnel: 'building_passage' })
    expect(t.structure).toBe('covered')
  })

  it('treats covered=yes as at grade', () => {
    expect(readVerticalTags({ highway: 'service', covered: 'yes' }).structure).toBe('covered')
  })

  it('reads a negative layer with no tunnel tag as an OPEN TRENCH', () => {
    // The ring-road case: a road in a cutting, tagged with nothing but its
    // layer. Draped on the surface it runs through the district above it.
    const t = readVerticalTags({ highway: 'trunk', layer: '-1' })
    expect(t.structure).toBe('trench')
    expect(t.layer).toBe(-1)
  })

  it('reads a positive layer with no bridge tag as elevated', () => {
    expect(readVerticalTags({ highway: 'trunk', layer: '1' }).structure).toBe('bridge')
  })

  it('honours location=underground and indoor=yes', () => {
    expect(readVerticalTags({ highway: 'service', location: 'underground' }).structure)
      .toBe('tunnel')
    expect(readVerticalTags({ highway: 'corridor', indoor: 'yes' }).structure).toBe('covered')
  })

  it('ignores bridge=no and tunnel=no', () => {
    expect(readVerticalTags({ bridge: 'no', tunnel: 'no' }).structure).toBe('ground')
  })

  it('clamps a mistyped layer instead of launching the street into orbit', () => {
    expect(readVerticalTags({ layer: '99' }).layer).toBe(MAX_LAYER)
    expect(readVerticalTags({ layer: '-99' }).layer).toBe(-MAX_LAYER)
    expect(readVerticalTags({ layer: 'wat' }).layer).toBe(0)
  })

  it('parses metric length tags with and without units', () => {
    expect(lengthTagM('12')).toBe(12)
    expect(lengthTagM('12 m')).toBe(12)
    expect(lengthTagM('12m')).toBe(12)
    expect(lengthTagM(undefined)).toBeNull()
    expect(lengthTagM('tall')).toBeNull()
  })
})

// ── The resolution hierarchy ───────────────────────────────────────────────────

describe('resolveStructureElevationM · the vertical resolution hierarchy', () => {
  const bridge = readVerticalTags({ highway: 'primary', bridge: 'yes' })

  it('1. a surveyed min_height beats everything', () => {
    const t = readVerticalTags({ bridge: 'yes', highway: 'primary', min_height: '8.5' })
    const got = resolveStructureElevationM(t, 'road', { crossingClearanceM: 5, groundM: 0 })
    expect(got.offsetM).toBe(8.5)
    expect(got.confidence).toBe('surveyed')
  })

  it('2. what it CROSSES beats what it is tagged', () => {
    // A flyover over a railway is built for a railway, and the geometry says so
    // more reliably than any tag can.
    const got = resolveStructureElevationM(bridge, 'road', {
      crossingClearanceM: CROSSING_CLEARANCE_M.railway,
    })
    expect(got.offsetM).toBe(CROSSING_CLEARANCE_M.railway)
    expect(got.confidence).toBe('inferred')
  })

  it('3. layer is an ORDERING, and only separates things already stacked', () => {
    // THE NAIVE MOVE THIS REJECTS: layer × 5 m. A lone layer=2 way crossing
    // nothing must not be lifted 10 m; it gets the default clearance ladder.
    const two = readVerticalTags({ highway: 'primary', bridge: 'yes', layer: '2' })
    const alone = resolveStructureElevationM(two, 'road', {})
    expect(alone.offsetM).toBe(DEFAULT_BRIDGE_CLEARANCE_M + LAYER_SEPARATION_M)
    expect(alone.confidence).toBe('tagged')

    // Whereas a deck genuinely stacked over another deck needs room for both.
    const stacked = resolveStructureElevationM(two, 'road', {
      crossingClearanceM: CROSSING_CLEARANCE_M.road, stackedLevels: 2,
    })
    expect(stacked.offsetM).toBe(CROSSING_CLEARANCE_M.road + LAYER_SEPARATION_M)
    expect(stacked.confidence).toBe('inferred')
  })

  it('4. falls back to a default clearance, and says it is a guess', () => {
    const got = resolveStructureElevationM(bridge, 'road', {})
    expect(got.offsetM).toBe(DEFAULT_BRIDGE_CLEARANCE_M)
    expect(got.confidence).toBe('assumed')
  })

  it('refuses an `ele` that would put a bridge underground', () => {
    // A datum mismatch, not a measurement. Falling through is safer than
    // honouring a number that contradicts the structure it describes.
    const t = readVerticalTags({ bridge: 'yes', highway: 'primary', ele: '3' })
    const got = resolveStructureElevationM(t, 'road', { groundM: 40, groundTrusted: true })
    expect(got.offsetM).toBeGreaterThan(0)
    expect(got.confidence).not.toBe('surveyed')
  })

  it('will not difference an `ele` against ground it does not trust', () => {
    const t = readVerticalTags({ bridge: 'yes', highway: 'primary', ele: '20' })
    const bad = resolveStructureElevationM(t, 'road', { groundM: 0, groundTrusted: false })
    expect(bad.confidence).not.toBe('surveyed')
    const good = resolveStructureElevationM(t, 'road', { groundM: 0, groundTrusted: true })
    expect(good.confidence).toBe('surveyed')
    expect(good.offsetM).toBe(20)
  })

  it('sends tunnels and trenches DOWN, and trenches less far', () => {
    const tunnel = resolveStructureElevationM(readVerticalTags({ tunnel: 'yes' }), 'road', {})
    const trench = resolveStructureElevationM(readVerticalTags({ layer: '-1' }), 'road', {})
    expect(tunnel.offsetM).toBeLessThan(0)
    expect(trench.offsetM).toBeLessThan(0)
    expect(trench.offsetM).toBeGreaterThan(tunnel.offsetM)
  })

  it('leaves ground and covered ways on the ground', () => {
    expect(resolveStructureElevationM(readVerticalTags({}), 'road', {}).offsetM).toBe(0)
    expect(resolveStructureElevationM(
      readVerticalTags({ covered: 'yes' }), 'road', {}).offsetM).toBe(0)
  })

  it('ranks confidence so the better evidence wins', () => {
    expect(bestConfidence('assumed', 'surveyed')).toBe('surveyed')
    expect(bestConfidence('inferred', 'tagged')).toBe('inferred')
  })

  it('takes the WORST case among what it crosses', () => {
    expect(clearanceFromCrossings([
      { overId: 'a', underId: 'b', stationM: 0, underFunctional: 'pedestrian' },
      { overId: 'a', underId: 'c', stationM: 9, underFunctional: 'railway' },
    ])).toBe(CROSSING_CLEARANCE_M.railway)
    expect(clearanceFromCrossings([])).toBeUndefined()
  })
})

// ── The slope-constrained solver ───────────────────────────────────────────────

describe('lipschitzEnvelope · continuity beats precision', () => {
  const chain = (targets: number[], hardAt: number[], spacingM = 10): ProfileVertex[] =>
    targets.map((t, i) => ({
      stationM: i * spacingM, targetM: t, hard: hardAt.includes(i),
    }))

  it('leaves an already-legal profile untouched', () => {
    const v = chain([0, 0.5, 1, 1.5], [])
    const { elevationM, relaxed } = lipschitzEnvelope(v, 0.1)
    expect(elevationM).toEqual([0, 0.5, 1, 1.5])
    expect(relaxed).toBe(false)
  })

  it('turns a vertical step into a ramp at exactly the design grade', () => {
    // The canonical abutment: ground, ground, DECK, ground, ground.
    const v = chain([0, 0, 6, 0, 0], [2])
    const { elevationM, relaxed } = lipschitzEnvelope(v, 0.1)
    expect(relaxed).toBe(false)
    // The hard seed survives…
    expect(elevationM[2]).toBeCloseTo(6, 9)
    // …and its neighbours are pulled up to whatever the grade allows, which at
    // 10 % over 10 m is exactly one metre of drop per station.
    expect(elevationM[1]).toBeCloseTo(5, 9)
    expect(elevationM[3]).toBeCloseTo(5, 9)
    // No step anywhere.
    for (let i = 1; i < elevationM.length; i++) {
      expect(Math.abs(elevationM[i] - elevationM[i - 1])).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('lets the ramp reach the ground when there is room for it', () => {
    const v = chain(Array.from({ length: 21 }, (_, i) => (i === 10 ? 6 : 0)), [10])
    const { elevationM } = lipschitzEnvelope(v, 0.1)
    expect(elevationM[10]).toBeCloseTo(6, 9)
    // 60 m away at 10 % the deck's influence is spent, and the profile is back
    // on the ground rather than hovering over it.
    expect(elevationM[0]).toBeCloseTo(0, 9)
    expect(elevationM[20]).toBeCloseTo(0, 9)
  })

  it('reports — rather than hides — seeds it cannot honour', () => {
    // Two hard seeds 10 m apart wanting a 6 m difference at 10 %: impossible.
    const v = chain([0, 6], [0, 1])
    const { elevationM, relaxed } = lipschitzEnvelope(v, 0.1)
    expect(relaxed).toBe(true)
    // The error is SHARED rather than concentrated in a cliff.
    expect(elevationM[0]).toBeGreaterThan(0)
    expect(elevationM[1]).toBeLessThan(6)
    expect(elevationM[0]).toBeLessThan(elevationM[1])
  })

  it('follows terrain when nothing is pinned', () => {
    const hill = [0, 1, 2, 3, 4]
    const { elevationM } = lipschitzEnvelope(chain(hill, []), 0.2)
    expect(elevationM).toEqual(hill)
  })

  it('is order-independent and handles degenerate input', () => {
    expect(lipschitzEnvelope([], 0.1).elevationM).toEqual([])
    expect(lipschitzEnvelope(chain([7], []), 0.1).elevationM).toEqual([7])
  })
})

describe('a tagged height on a linear way', () => {
  const bridge = (tags: Record<string, string>) => readVerticalTags(tags)

  it('uses `height` as the deck elevation when it is too big to be structure', () => {
    // THE LUJIAZUI CASE. Over 137 layered ways around the Oriental Pearl there
    // is not one `ele`, not one `min_height`, and exactly one `height`: 9 m on
    // the layer-3 skywalk ring. Discarding it left the district's signature
    // structure on the layer fallback, seven metres above the only figure
    // anybody surveyed.
    const t = bridge({ bridge: 'yes', layer: '3', height: '9' })
    const r = resolveStructureElevationM(t, 'pedestrian')
    expect(r.offsetM).toBe(9)
    expect(r.confidence).toBe('tagged')
  })

  it('still refuses a height that could be a structure depth', () => {
    // The guard this module already had: `height` on a bridge is the structure,
    // and a 2 m one is a plausible deck. Reading that as clearance is the bug
    // that put an outline at its own height PLUS its deck.
    const t = bridge({ bridge: 'yes', layer: '1', height: '2' })
    expect(resolveStructureElevationM(t, 'road').offsetM).not.toBe(2)
  })

  it('never lets it beat a real measurement', () => {
    // `min_height` IS a surveyed soffit. A height tag must not displace it.
    const t = bridge({ bridge: 'yes', layer: '3', height: '9', min_height: '6' })
    const r = resolveStructureElevationM(t, 'pedestrian')
    expect(r.offsetM).toBe(6)
    expect(r.confidence).toBe('surveyed')
  })

  it('does not apply it to anything going down', () => {
    // A tunnel with a height tag is describing its bore, not its depth.
    const t = bridge({ tunnel: 'yes', layer: '-1', height: '9' })
    expect(resolveStructureElevationM(t, 'road').offsetM).toBeLessThan(0)
  })
})
