// ─── terrain-truth tests ──────────────────────────────────────────────────────
// The contract: a RAW raster sample is not a ground height, and the difference
// has to survive contact with real artefacts. Every case here is modelled on
// something measured on the app's own terrarium tiles over Port Vell.

import { describe, it, expect } from 'vitest'
import {
  createGroundResolver, corridorHighM, corridorLowM,
  DEFAULT_OBSTRUCTION_M,
} from './terrain-truth'

/** Centre plus eight compass points — the resolver's neighbourhood. */
const RING_POINTS = 9

/** A mid-latitude metres→normalized scale, so radii in metres mean something. */
const M_TO_N = 1 / (40_075_016.686 * Math.cos((41.38 * Math.PI) / 180))

/** Ground at a constant height, the boring baseline. */
const flatAt = (h: number) => () => h

describe('createGroundResolver · provenance', () => {
  it('reports the flat map honestly when there is no raster', () => {
    const r = createGroundResolver({ rawSample: null, mToN: M_TO_N, seaLevelM: 0 })
    const got = r.resolve(0, 0)
    expect(got.verdict).toBe('flat')
    expect(got.groundM).toBe(0)
    expect(r.hasTerrain).toBe(false)
  })

  it('passes plausible terrain through untouched', () => {
    const r = createGroundResolver({ rawSample: flatAt(37), mToN: M_TO_N })
    const got = r.resolve(0, 0)
    expect(got.verdict).toBe('raw')
    expect(got.groundM).toBe(37)
    expect(got.rawM).toBe(37)
    expect(got.confidence).toBe('high')
  })

  it('does NOT flatten real relief', () => {
    // A steady 1:4 slope. Every ring sample differs from the centre, but none
    // stands proud of the neighbourhood floor by an object's height, so the
    // measured value must survive. Smoothing here would erase the terrain the
    // whole 3D mode exists to show.
    const slope = (nx: number): number => (nx / M_TO_N) * 0.25
    const r = createGroundResolver({ rawSample: slope, mToN: M_TO_N })
    for (const eastM of [0, 100, 250]) {
      const nx = eastM * M_TO_N
      expect(r.resolve(nx, 0).groundM).toBeCloseTo(eastM * 0.25, 6)
    }
  })
})

describe('createGroundResolver · obstructions', () => {
  /** A 20 m tall object of ~10 m radius sitting on ground at 2 m. */
  const withBuilding = (nx: number, ny: number): number => {
    const eastM = nx / M_TO_N
    const northM = ny / M_TO_N
    return Math.hypot(eastM, northM) < 10 ? 22 : 2
  }

  it('rejects a roof and returns the ground under it', () => {
    const r = createGroundResolver({ rawSample: withBuilding, mToN: M_TO_N })
    const got = r.resolve(0, 0)
    expect(got.verdict).toBe('obstruction')
    expect(got.rawM).toBe(22)
    expect(got.groundM).toBe(2)
    // An estimate, and it says so — a bridge must not infer a clearance from it.
    expect(got.confidence).toBe('low')
  })

  it('leaves a bank alone — relief is not an obstruction', () => {
    // A 5 m step is under the obstruction threshold and is real ground.
    const step = (nx: number): number => (nx > 0 ? 5 : 0)
    const r = createGroundResolver({ rawSample: step, mToN: M_TO_N })
    expect(DEFAULT_OBSTRUCTION_M).toBeGreaterThan(5)
    expect(r.resolve(50 * M_TO_N, 0).groundM).toBe(5)
  })
})

describe('createGroundResolver · water', () => {
  // The measured Port Vell case: the raster reads +4.7 m over the open basin,
  // because the beam came back off moored vessels and terminal roofs. No
  // statistic can rescue this — a whole harbour of artefacts has no ground in
  // it to find — so mapped water overrides the raster outright.
  it('clamps mapped water to the sea datum however high the raster reads', () => {
    const r = createGroundResolver({
      rawSample: flatAt(4.7),
      mToN: M_TO_N,
      seaLevelM: 0,
      waterAt: () => true,
    })
    const got = r.resolve(0, 0)
    expect(got.verdict).toBe('water')
    expect(got.rawM).toBeCloseTo(4.7, 6)
    expect(got.groundM).toBe(0)
    expect(got.confidence).toBe('high')
  })

  it('honours a non-zero local sea datum', () => {
    const r = createGroundResolver({
      rawSample: flatAt(9), mToN: M_TO_N, seaLevelM: -1.4, waterAt: () => true,
    })
    expect(r.resolve(0, 0).groundM).toBeCloseTo(-1.4, 9)
  })

  it('leaves dry land alone', () => {
    const r = createGroundResolver({
      rawSample: flatAt(3), mToN: M_TO_N, waterAt: () => false,
    })
    expect(r.resolve(0, 0).verdict).toBe('raw')
    expect(r.resolve(0, 0).groundM).toBe(3)
  })
})

describe('createGroundResolver · determinism and cost', () => {
  it('gives byte-identical answers for the same query', () => {
    const r = createGroundResolver({ rawSample: (nx) => nx / M_TO_N, mToN: M_TO_N })
    const a = r.resolve(123 * M_TO_N, 45 * M_TO_N)
    const b = r.resolve(123 * M_TO_N, 45 * M_TO_N)
    expect(a).toEqual(b)
  })

  it('does not depend on the order points are asked for', () => {
    const src = (nx: number, ny: number): number => (nx / M_TO_N) * 0.1 + (ny / M_TO_N) * 0.03
    const pts = [0, 40, 80, 120, 160].map((m) => [m * M_TO_N, m * M_TO_N] as const)

    const forward = createGroundResolver({ rawSample: src, mToN: M_TO_N })
    const backward = createGroundResolver({ rawSample: src, mToN: M_TO_N })
    const a = pts.map(([x, y]) => forward.resolve(x, y).groundM)
    const b = [...pts].reverse().map(([x, y]) => backward.resolve(x, y).groundM).reverse()
    expect(a).toEqual(b)
  })

  it('shares raster reads across a corridor instead of re-sampling', () => {
    let reads = 0
    const counted = (): number => { reads++; return 5 }
    const r = createGroundResolver({ rawSample: counted, mToN: M_TO_N, cacheCellM: 4 })
    const STATIONS = 200
    // A metre-spaced corridor, which is what a densified road actually is.
    for (let i = 0; i < STATIONS; i++) r.groundM(i * M_TO_N, 0)

    // The NEIGHBOURHOODS collapse to their 4 m cells — that is the expensive
    // half, and it is shared along the corridor.
    expect(r.stats().cells).toBeLessThan(STATIONS / 3)
    // The CENTRES are read exactly, one per station, deliberately: quantising
    // them would stair-case a draped road on a slope. So the floor is STATIONS,
    // and the whole robustness apparatus has to fit in a small multiple of it —
    // not in the STATIONS × 9 a naive implementation would spend.
    expect(reads).toBeGreaterThanOrEqual(STATIONS)
    expect(reads).toBeLessThan(STATIONS * 4)
    expect(reads).toBeLessThan((STATIONS * RING_POINTS) / 2)
  })
})

describe('corridor statistics', () => {
  // THE BAD-DEM-SPIKE CASE. `max over the whole span` is what lifted a whole
  // viaduct onto one moored ship. The trimmed maximum keeps the intent — clear
  // the high ground — while GUARANTEEING that the topmost sample cannot set the
  // height on its own. A percentile only makes that likely: the 90th percentile
  // of these six samples is the spike itself.
  it('a lone spike does not set the height of a whole span', () => {
    const spiky = [0, 0, 0, 18, 0, 0]
    expect(Math.max(...spiky)).toBe(18)
    expect(corridorHighM(spiky)).toBeLessThan(2)
  })

  it('still clears genuinely high ground', () => {
    // Half the span really is up on a bank: that is terrain, not an artefact,
    // and the deck has to clear it.
    expect(corridorHighM([0, 0, 0, 12, 12, 12, 12])).toBeGreaterThanOrEqual(12)
  })

  it('degrades to the plain maximum when there is nothing to be robust with', () => {
    expect(corridorHighM([3, 9])).toBe(9)
    expect(corridorHighM([])).toBe(0)
  })

  it('has a low-side twin for what a tunnel must get under', () => {
    expect(corridorLowM([0, 0, 0, -14, 0, 0])).toBeGreaterThan(-2)
    expect(corridorLowM([5, 1])).toBe(1)
  })

  it('ignores non-finite samples rather than poisoning the result', () => {
    expect(corridorHighM([1, 2, NaN, 3, 4, 5])).toBeGreaterThan(0)
    expect(Number.isFinite(corridorHighM([NaN, NaN]))).toBe(true)
  })
})
