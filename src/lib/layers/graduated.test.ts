import { describe, it, expect } from 'vitest'
import { classBreaks, graduatedGroups, RAMPS, groupIndexOf, defaultLayerStyle } from './style-groups'
import { flattenProperties } from '../twin/flatten-props'

describe('graduated classes', () => {
  it('splits integers into non-overlapping classes covering every value', () => {
    const v = [0, 0, 0, 1, 2, 3, 5, 8, 12, 20, 25, 30]
    for (const m of ['quantile', 'equal'] as const) {
      const c = classBreaks(v, 3, m)
      expect(c.reduce((n, x) => n + x.count, 0)).toBe(v.length)
      for (let i = 1; i < c.length; i++) expect(c[i].lo).toBe(c[i - 1].hi + 1)
      expect(c[0].lo).toBe(0); expect(c[c.length - 1].hi).toBe(30)
    }
  })
  it('equal intervals on 0..100', () => {
    expect(classBreaks([0, 10, 49, 50, 99, 100], 2, 'equal').map((c) => [c.lo, c.hi, c.count])).toEqual([[0, 49, 3], [50, 100, 3]])
  })
  it('handles decimals, a single value and nothing', () => {
    const c = classBreaks([0.1, 0.5, 0.9], 2, 'equal')
    expect(c.reduce((n, x) => n + x.count, 0)).toBe(3)
    expect(classBreaks([4, 4, 4], 5, 'quantile')).toEqual([{ lo: 4, hi: 4, count: 3 }])
    expect(classBreaks([], 3, 'quantile')).toEqual([])
  })
  it('makes groups that pick the right features, coloured along the ramp', () => {
    const classes = classBreaks([0, 1, 2, 10, 20, 30], 3, 'equal')
    const groups = graduatedGroups('bikes', classes, RAMPS.traffic, true)
    expect(groups[0].style.point.color).toBe('#d7263d') // reversed: few bikes = red
    expect(groups[groups.length - 1].style.point.color).toBe('#5ce27a')
    const ls = { ...defaultLayerStyle('#fff'), groups }
    expect(groupIndexOf(flattenProperties({ bikes: 0 }), ls)).toBe(0)
    expect(groupIndexOf(flattenProperties({ bikes: 30 }), ls)).toBe(groups.length - 1)
    expect(groups[0].name).toMatch(/^0 – \d+$/)
  })
})
