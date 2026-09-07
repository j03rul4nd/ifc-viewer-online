// ─── height-prior tests ───────────────────────────────────────────────────────
// THE RULE THIS FILE EXISTS FOR:
//
//   the prior may be typical, but it must never be absurd.
//
// The failure it replaces is quiet — every untagged building at one constant.
// The failures it could INTRODUCE are loud: a 55 m bicycle shed, or a whole
// district taking the height of the one supertall somebody surveyed. Most of
// what follows is about refusing to answer.

import { describe, it, expect } from 'vitest'
import {
  buildHeightPrior, MIN_PRIOR_SAMPLES, PRIOR_SIZE_SPLIT_M2, LOCALLY_INVARIANT_TYPES,
  MIN_STOREY_M, MAX_STOREY_M,
  type HeightSample,
} from './height-prior'

const s = (type: string, areaM2: number, heightM: number): HeightSample =>
  ({ type, areaM2, heightM })

/** n samples of one type and band, all the same height. */
const many = (type: string, areaM2: number, heightM: number, n = MIN_PRIOR_SAMPLES) =>
  Array.from({ length: n }, () => s(type, areaM2, heightM))

describe('buildHeightPrior', () => {
  it('answers with the median of the same type and size band', () => {
    const p = buildHeightPrior([
      ...many('commercial', 3000, 100),
      ...many('residential', 3000, 20),
    ])
    expect(p.heightFor('commercial', 3000)).toBeCloseTo(100, 6)
    expect(p.heightFor('residential', 3000)).toBeCloseTo(20, 6)
  })

  it('keeps types apart instead of averaging the district into one number', () => {
    // In the benchmark patch `residential` measures 19.2 m and `commercial`
    // 182.5 m. One number for both is no better than the constant it replaces.
    const p = buildHeightPrior([
      ...many('commercial', 3000, 182.5),
      ...many('residential', 3000, 19.2),
    ])
    expect(p.heightFor('residential', 3000)).toBeLessThan(30)
    expect(p.heightFor('commercial', 3000)).toBeGreaterThan(150)
  })

  it('separates a building on a plot from a building on a block', () => {
    const p = buildHeightPrior([
      ...many('yes', 200, 15),
      ...many('yes', 5000, 130),
    ])
    expect(p.heightFor('yes', 300)).toBeCloseTo(15, 6)
    expect(p.heightFor('yes', 5000)).toBeCloseTo(130, 6)
  })

  it('splits the bands at the measured threshold', () => {
    const p = buildHeightPrior([
      ...many('yes', PRIOR_SIZE_SPLIT_M2 - 1, 15),
      ...many('yes', PRIOR_SIZE_SPLIT_M2, 130),
    ])
    expect(p.heightFor('yes', PRIOR_SIZE_SPLIT_M2 - 1)).toBeCloseTo(15, 6)
    expect(p.heightFor('yes', PRIOR_SIZE_SPLIT_M2)).toBeCloseTo(130, 6)
  })

  it('never crosses a size band, even when the type has plenty of samples', () => {
    // THE REGRESSION THIS FILE EXISTS FOR. The benchmark patch contains not one
    // surveyed `building=yes` under 1000 m2, so a rung that fell from
    // (type, band) to (type, any size) answered small footprints from the
    // surveyed TOWERS: 67.2 m onto 120 small buildings, 33 of them under
    // 200 m2. Replacing "every building 8 m" with "every shed a tower" is a
    // louder wrong answer than the one being fixed.
    const p = buildHeightPrior([
      ...many('yes', 5000, 67.2, 20),     // only large ones are surveyed
      ...many('residential', 400, 19.2),  // the small band is all residential
    ])
    // A small untagged `yes` must take its neighbours' size, not its type.
    expect(p.heightFor('yes', 300)).toBeCloseTo(19.2, 6)
    expect(p.heightFor('yes', 300)!).toBeLessThan(40)
    // The large band still answers from the towers.
    expect(p.heightFor('yes', 5000)).toBeCloseTo(67.2, 6)
  })

  it('declines rather than borrowing a height from the other size band', () => {
    // Nothing surveyed at this size at all: keep the constant, do not reach up.
    const p = buildHeightPrior(many('yes', 5000, 200, 20))
    expect(p.heightFor('yes', 300)).toBeNull()
  })

  it('falls to the band for a type nobody has surveyed', () => {
    const p = buildHeightPrior(many('commercial', 3000, 90))
    expect(p.heightFor('civic', 3000)).toBeCloseTo(90, 6)
  })

  it('refuses to answer at all on too little evidence', () => {
    // The failure guarded: one supertall among two low blocks handing its
    // height to every untagged building in the patch.
    const p = buildHeightPrior([s('yes', 3000, 632), s('yes', 3000, 12), s('yes', 3000, 15)])
    expect(p.heightFor('yes', 3000)).toBeNull()
    expect(buildHeightPrior([]).heightFor('yes', 3000)).toBeNull()
  })

  it('needs exactly MIN_PRIOR_SAMPLES before it will speak', () => {
    const short = buildHeightPrior(many('yes', 3000, 50, MIN_PRIOR_SAMPLES - 1))
    expect(short.heightFor('yes', 3000)).toBeNull()
    const ok = buildHeightPrior(many('yes', 3000, 50, MIN_PRIOR_SAMPLES))
    expect(ok.heightFor('yes', 3000)).toBeCloseTo(50, 6)
  })

  it('never priors a shed, however tall the district is', () => {
    // A shed is 3 m in Lujiazui and 3 m in a village, and a 55 m bicycle shed
    // is a worse error than the 8 m tower this was meant to fix.
    const p = buildHeightPrior(many('yes', 3000, 200))
    for (const t of LOCALLY_INVARIANT_TYPES) expect(p.heightFor(t, 3000)).toBeNull()
  })

  it('does not let sheds drag the district median down either', () => {
    const p = buildHeightPrior([
      ...many('yes', 3000, 100),
      ...many('shed', 3000, 3, 40),
    ])
    // 40 sheds outnumber the real buildings and must not reach the band rung.
    expect(p.heightFor('civic', 3000)).toBeCloseTo(100, 6)
    expect(p.sampleCount).toBe(MIN_PRIOR_SAMPLES)
  })

  it('ignores samples it cannot use rather than counting them as zero', () => {
    const p = buildHeightPrior([
      ...many('yes', 3000, 60),
      s('yes', 3000, 0), s('yes', 3000, -5), s('yes', 3000, Number.NaN),
      s('yes', 0, 60), s('yes', Number.NaN, 60),
    ])
    expect(p.sampleCount).toBe(MIN_PRIOR_SAMPLES)
    expect(p.heightFor('yes', 3000)).toBeCloseTo(60, 6)
  })

  it('declines when the caller has no usable footprint', () => {
    const p = buildHeightPrior(many('yes', 3000, 60))
    expect(p.heightFor('yes', 0)).toBeNull()
    expect(p.heightFor('yes', Number.NaN)).toBeNull()
  })

  it('is case-insensitive about the type, as OSM values are not', () => {
    const p = buildHeightPrior(many('Commercial', 3000, 90))
    expect(p.heightFor('COMMERCIAL', 3000)).toBeCloseTo(90, 6)
  })

  it('takes a true median, so one supertall cannot move it', () => {
    const p = buildHeightPrior([
      ...many('yes', 3000, 40, 10),
      s('yes', 3000, 632),
    ])
    expect(p.heightFor('yes', 3000)).toBeCloseTo(40, 6)
  })

  it('reproduces the benchmark district rather than a plausible-looking number', () => {
    // Shaped after the measured Lujiazui distribution: `building=yes` on large
    // blocks runs to tens of metres, and the constant it replaces is 8 m.
    const p = buildHeightPrior([
      ...many('yes', 3000, 55, 20),
      ...many('residential', 600, 19.2, 20),
    ])
    expect(p.heightFor('yes', 3000)).toBeCloseTo(55, 6)
    expect(p.heightFor('yes', 3000)!).toBeGreaterThan(8)
    expect(p.heightFor('residential', 600)).toBeCloseTo(19.2, 6)
  })
})

describe('storeyHeightFor — metres per storey is regional, not universal', () => {
  const withLevels = (type: string, heightM: number, levels: number, n = MIN_PRIOR_SAMPLES) =>
    Array.from({ length: n }, () => ({ type, areaM2: 3000, heightM, levels }))

  it('measures what the district actually builds', () => {
    // Shanghai measures 4.42 m per storey against Barcelona's 3.14, and the
    // codebase had one hardcoded 3.2 for both.
    const sh = buildHeightPrior(withLevels('commercial', 132.6, 30))
    expect(sh.storeyHeightFor('commercial')).toBeCloseTo(4.42, 2)
    const bcn = buildHeightPrior(withLevels('apartments', 25.12, 8))
    expect(bcn.storeyHeightFor('apartments')).toBeCloseTo(3.14, 2)
  })

  it('falls to the district as a whole for an unseen type', () => {
    const p = buildHeightPrior(withLevels('commercial', 132.6, 30))
    expect(p.storeyHeightFor('civic')).toBeCloseTo(4.42, 2)
  })

  it('declines on too little evidence, leaving the constant in place', () => {
    expect(buildHeightPrior(withLevels('yes', 40, 10, 3)).storeyHeightFor('yes')).toBeNull()
    expect(buildHeightPrior([]).storeyHeightFor('yes')).toBeNull()
  })

  it('ignores a building that states no storey count', () => {
    const p = buildHeightPrior(
      Array.from({ length: 20 }, () => ({ type: 'yes', areaM2: 3000, heightM: 60 })),
    )
    expect(p.storeyHeightFor('yes')).toBeNull()
    // ...but it still informs the height prior.
    expect(p.heightFor('yes', 3000)).toBeCloseTo(60, 6)
  })

  it('throws out a mapping error instead of letting it move the median', () => {
    // `height=3` with `building:levels=30` is a mistake, not a 0.1 m storey, and
    // one of those drags a median further than ten good samples repair it.
    const p = buildHeightPrior([
      ...withLevels('yes', 40, 10, 10),
      { type: 'yes', areaM2: 3000, heightM: 3, levels: 30 },       // 0.1 m
      { type: 'yes', areaM2: 3000, heightM: 600, levels: 2 },      // 300 m
    ])
    expect(p.storeyHeightFor('yes')).toBeCloseTo(4, 6)
  })

  it('keeps the accepted band where storeys plausibly live', () => {
    expect(MIN_STOREY_M).toBeLessThan(2.5)
    expect(MAX_STOREY_M).toBeGreaterThan(6)
  })
})
