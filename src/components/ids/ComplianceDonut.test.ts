import { describe, it, expect } from 'vitest'
import { donutSegments } from './ComplianceDonut'

describe('donutSegments', () => {
  it('returns no segments for all-zero input', () => {
    expect(donutSegments(0, 0, 0)).toEqual([])
  })

  it('splits counts into proportional, cumulative segments', () => {
    const segs = donutSegments(2, 1, 1) // total 4
    expect(segs.map((s) => s.key)).toEqual(['pass', 'fail', 'na'])
    expect(segs.map((s) => s.fraction)).toEqual([0.5, 0.25, 0.25])
    expect(segs.map((s) => s.offset)).toEqual([0, 0.5, 0.75])
  })

  it('omits zero-count segments and keeps offsets contiguous', () => {
    const segs = donutSegments(3, 0, 1) // no fail segment
    expect(segs.map((s) => s.key)).toEqual(['pass', 'na'])
    expect(segs.map((s) => s.offset)).toEqual([0, 0.75])
  })

  it('fractions sum to 1', () => {
    const segs = donutSegments(5, 3, 2)
    expect(segs.reduce((a, s) => a + s.fraction, 0)).toBeCloseTo(1, 10)
  })
})
