import { describe, it, expect } from 'vitest'
import { modelClassCounts, applicabilityCount, canonClass } from './model-vocab'

describe('modelClassCounts', () => {
  it('sums counts across models and collapses STANDARDCASE variants', () => {
    const counts = modelClassCounts([
      { categories: [{ id: 'IFCWALL', count: 10 }, { id: 'IFCWALLSTANDARDCASE', count: 5 }] },
      { categories: [{ id: 'IFCWALL', count: 2 }, { id: 'IFCDOOR', count: 4 }] },
    ])
    expect(counts.get('IFCWALL')).toBe(17) // 10 + 5 + 2
    expect(counts.get('IFCDOOR')).toBe(4)
  })

  it('is empty when no models are loaded', () => {
    expect(modelClassCounts([]).size).toBe(0)
  })
})

describe('applicabilityCount', () => {
  const counts = new Map([['IFCWALL', 12], ['IFCDOOR', 4]])
  it('matches case-insensitively', () => {
    expect(applicabilityCount(counts, 'IfcWall')).toBe(12)
    expect(applicabilityCount(counts, 'ifcdoor')).toBe(4)
  })
  it('returns 0 for absent class or empty entity', () => {
    expect(applicabilityCount(counts, 'IfcSlab')).toBe(0)
    expect(applicabilityCount(counts, '')).toBe(0)
  })
})

describe('canonClass', () => {
  it('strips case suffixes', () => {
    expect(canonClass('IfcWallStandardCase')).toBe('IFCWALL')
  })
})
