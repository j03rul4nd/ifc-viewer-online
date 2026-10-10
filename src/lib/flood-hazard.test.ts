// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { debrisFactor, hazardClass, hazardRating } from './flood-hazard'

describe('flood hazard rating (FD2320 / FD2321)', () => {
  it('matches the extended FD2320 table cell by cell', () => {
    // (depth, velocity) → HR, from Table 4 of the 2008 supplementary note
    // (which prints 0.525 as 0.53).
    const cells: Array<[number, number, number]> = [
      [0.05, 0, 0.525], [0.25, 0.3, 0.70], [0.3, 0, 1.15], [0.5, 0.5, 1.5],
      [0.6, 1, 1.9], [0.8, 1, 2.2], [1, 2, 3.5], [0.2, 2.5, 1.1],
    ]
    for (const [d, v, hr] of cells) expect(hazardRating(d, v), `${d} m at ${v} m/s`).toBeCloseTo(hr, 2)
  })

  it('classes the rating: caution, danger for some, most, all', () => {
    expect(hazardClass(hazardRating(0.25, 0.3))).toBe(0)
    expect(hazardClass(hazardRating(0.3, 0))).toBe(1)
    expect(hazardClass(hazardRating(0.6, 1))).toBe(2)
    expect(hazardClass(hazardRating(0.8, 1))).toBe(3)
    expect([0.74, 0.75, 1.25, 2, 2.01].map(hazardClass)).toEqual([0, 1, 2, 2, 3])
  })

  it('takes the debris factor by land use when asked (FD2321 Table 3.1)', () => {
    expect(debrisFactor(0.2, 0, 'urban')).toBe(0)
    expect(['pasture', 'woodland', 'urban'].map((m) => debrisFactor(0.5, 1, m as 'urban'))).toEqual([0, 0.5, 1])
    expect(['pasture', 'woodland', 'urban'].map((m) => debrisFactor(0.5, 2.5, m as 'urban'))).toEqual([0.5, 1, 1])
    expect(['pasture', 'woodland', 'urban'].map((m) => debrisFactor(1, 0, m as 'urban'))).toEqual([0.5, 1, 1])
  })

  it('has no hazard without water', () => {
    expect(hazardRating(0, 3)).toBe(0)
  })
})
