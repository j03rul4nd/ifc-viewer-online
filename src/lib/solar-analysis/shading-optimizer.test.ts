import { describe, it, expect } from 'vitest'
import { CANDIDATES, sunFacing, rankCandidates, aggregateRooms } from './shading-optimizer'

describe('shading optimizer', () => {
  it('starts from nothing and has unique designs', () => {
    expect(CANDIDATES[0].id).toBe('none')
    expect(new Set(CANDIDATES.map((c) => c.id)).size).toBe(CANDIDATES.length)
    expect(CANDIDATES[0].design.overhang.on || CANDIDATES[0].design.fins.on || CANDIDATES[0].design.louvres.on).toBe(false)
  })

  it('shades the sun side of each hemisphere', () => {
    expect(sunFacing(41)).toContain('S')
    expect(sunFacing(41)).not.toContain('N')
    expect(sunFacing(-33)).toContain('N')
  })

  it('ranks: ASE target met first, then the most daylight; otherwise the lowest ASE', () => {
    const r = rankCandidates([
      { id: 'dark', sDA: 0.5, ASE: 0.05, meanDA: 0.6, blindHours: 0.1 },
      { id: 'bright', sDA: 0.9, ASE: 0.08, meanDA: 0.8, blindHours: 0.2 },
      { id: 'glare', sDA: 1, ASE: 0.5, meanDA: 0.9, blindHours: 0.8 },
      { id: 'less glare', sDA: 1, ASE: 0.3, meanDA: 0.85, blindHours: 0.6 },
    ])
    expect(r.map((x) => x.id)).toEqual(['bright', 'dark', 'less glare', 'glare'])
  })

  it('weights rooms by area', () => {
    const a = aggregateRooms([{ weight: 3, sDA: 1, ASE: 0, meanDA: 1 }, { weight: 1, sDA: 0, ASE: 1, meanDA: 0 }])
    expect(a.sDA).toBeCloseTo(0.75, 6)
    expect(a.ASE).toBeCloseTo(0.25, 6)
  })
})
