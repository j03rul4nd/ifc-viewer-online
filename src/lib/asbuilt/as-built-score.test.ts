// ─── as-built-score tests ─────────────────────────────────────────────────────
// The properties that make this number trustworthy rather than decorative.
// Each test names the failure it prevents, because most of them are failures
// that would still look like a working feature in a demo.

import { describe, it, expect } from 'vitest'
import {
  ALIGNMENT_MARGIN, MIN_COVERAGE_FRACTION,
  computeCoverage, explainAsBuiltScore, scoreAsBuilt,
  type AsBuiltInput, type ElementDeviation, type ElementState,
} from './as-built-score'

function el(id: number, state: ElementState, deviationP95: number | null = null): ElementDeviation {
  return {
    id, ifcClass: 'IfcColumn', state, deviationP95,
    matchedFraction: state === 'missing' ? 0.05 : 0.9,
  }
}

/** A well-posed input: tolerance comfortably clear of the alignment error. */
function input(elements: ElementDeviation[], over: Partial<AsBuiltInput> = {}): AsBuiltInput {
  return { elements, unmodelled: [], toleranceM: 0.025, alignmentRmseM: 0.005, ...over }
}

describe('coverage', () => {
  it('counts only what a camera actually judged as observed', () => {
    const c = computeCoverage([
      el(1, 'conforming'), el(2, 'deviated', 0.04), el(3, 'missing'),
      el(4, 'occluded'), el(5, 'unobserved'), el(6, 'unobserved'),
    ])
    expect(c.total).toBe(6)
    expect(c.observed).toBe(3)
    expect(c.occluded).toBe(1)
    expect(c.unobserved).toBe(2)
    expect(c.observedFraction).toBeCloseTo(0.5)
  })

  it('an empty model is 0% covered, not 100%', () => {
    expect(computeCoverage([]).observedFraction).toBe(0)
  })
})

describe('what is and is not penalised', () => {
  it('a perfect capture scores 100', () => {
    const r = scoreAsBuilt(input(Array.from({ length: 20 }, (_, i) => el(i, 'conforming'))))
    expect(r.score).toBe(100)
    expect(r.contributions).toEqual([])
  })

  it('never penalises elements nobody filmed', () => {
    // THE failure this whole design exists to prevent: 20 seconds of one clean
    // corner must not be able to certify a building.
    const observed = Array.from({ length: 10 }, (_, i) => el(i, 'conforming'))
    const unseen = Array.from({ length: 10 }, (_, i) => el(100 + i, 'unobserved'))
    const r = scoreAsBuilt(input([...observed, ...unseen]))
    expect(r.score).toBe(100)
    // ...but the report cannot hide that half the model was never looked at.
    expect(r.coverage.observedFraction).toBeCloseTo(0.5)
  })

  it('does not scale the score by coverage', () => {
    // Folding coverage into the score would be arithmetic dressed as honesty:
    // it destroys the meaning of both numbers. They travel side by side.
    const half = scoreAsBuilt(input([
      ...Array.from({ length: 10 }, (_, i) => el(i, 'conforming')),
      ...Array.from({ length: 10 }, (_, i) => el(100 + i, 'unobserved')),
    ]))
    const full = scoreAsBuilt(input(Array.from({ length: 10 }, (_, i) => el(i, 'conforming'))))
    expect(half.score).toBe(full.score)
  })

  it('penalises missing elements hardest', () => {
    const missing = scoreAsBuilt(input([el(1, 'missing'), ...filler(9)]))
    const deviated = scoreAsBuilt(input([el(1, 'deviated', 0.03), ...filler(9)]))
    expect(missing.score!).toBeLessThan(deviated.score!)
  })

  it('splits deviation severity at twice tolerance', () => {
    const mild = explainAsBuiltScore(input([el(1, 'deviated', 0.03)]))
    const severe = explainAsBuiltScore(input([el(1, 'deviated', 0.09)]))
    expect(mild[0].severity).toBe('warning')
    expect(severe[0].severity).toBe('error')
    expect(severe[0].penalty).toBeGreaterThan(mild[0].penalty)
  })
})

describe('logarithmic penalties', () => {
  it('treats one systematic defect as one problem, not eight hundred', () => {
    // A slab poured 4 cm high is a single site problem. Under a linear model
    // this input scores 0 and the number is useless on every real capture.
    const many = Array.from({ length: 800 }, (_, i) => el(i, 'deviated', 0.04))
    const r = scoreAsBuilt(input([...many, ...filler(200)]))
    expect(r.score!).toBeGreaterThan(0)
    expect(r.score!).toBeLessThan(95)
  })

  it('the first offender costs the most', () => {
    const one = explainAsBuiltScore(input([el(1, 'missing')]))[0].penalty
    const ten = explainAsBuiltScore(input(Array.from({ length: 10 }, (_, i) => el(i, 'missing'))))[0].penalty
    expect(ten).toBeGreaterThan(one)
    expect(ten).toBeLessThan(one * 10)   // sub-linear, which is the whole point
  })

  it('ranks contributions by impact so "fix this first" is answerable', () => {
    const contributions = explainAsBuiltScore(input(
      [el(1, 'missing'), ...Array.from({ length: 5 }, (_, i) => el(10 + i, 'deviated', 0.03))],
      { unmodelled: [{ id: 'u1', pointCount: 900 }] },
    ))
    const penalties = contributions.map((c) => c.penalty)
    expect([...penalties].sort((a, b) => b - a)).toEqual(penalties)
    expect(contributions.map((c) => c.ruleId)).toContain('AB_UNMODELLED_ELEMENT')
  })
})

describe('refusing to produce a number', () => {
  it('refuses when tolerance cannot clear the registration error', () => {
    // Otherwise every reported deviation is an artefact of our own alignment,
    // reported to the user with total confidence.
    const r = scoreAsBuilt(input(filler(50), { toleranceM: 0.02, alignmentRmseM: 0.015 }))
    expect(r.score).toBeNull()
    expect(r.inconclusiveReason).toBe('tolerance-below-alignment')
  })

  it('accepts a tolerance exactly at the margin', () => {
    const rmse = 0.01
    const r = scoreAsBuilt(input(filler(50), { toleranceM: ALIGNMENT_MARGIN * rmse, alignmentRmseM: rmse }))
    expect(r.inconclusiveReason).toBeNull()
  })

  it('refuses when the capture saw too little of the model', () => {
    const seen = filler(2)
    const unseen = Array.from({ length: 98 }, (_, i) => el(500 + i, 'unobserved'))
    const r = scoreAsBuilt(input([...seen, ...unseen]))
    expect(r.coverage.observedFraction).toBeLessThan(MIN_COVERAGE_FRACTION)
    expect(r.score).toBeNull()
    expect(r.inconclusiveReason).toBe('low-coverage')
  })

  it('reports coverage and findings even when it refuses to score', () => {
    // A refusal still has to be actionable, or the user only learns "no".
    const r = scoreAsBuilt(input([el(1, 'missing'), ...Array.from({ length: 99 }, (_, i) => el(500 + i, 'unobserved'))]))
    expect(r.score).toBeNull()
    expect(r.counts.missing).toBe(1)
    expect(r.contributions.length).toBeGreaterThan(0)
    expect(r.coverage.total).toBe(100)
  })

  it('never returns a score below zero', () => {
    const r = scoreAsBuilt(input(Array.from({ length: 400 }, (_, i) => el(i, 'missing'))))
    expect(r.score).toBeGreaterThanOrEqual(0)
  })
})

/** n conforming elements, to keep coverage above the floor in focused tests. */
function filler(n: number): ElementDeviation[] {
  return Array.from({ length: n }, (_, i) => el(9000 + i, 'conforming'))
}
