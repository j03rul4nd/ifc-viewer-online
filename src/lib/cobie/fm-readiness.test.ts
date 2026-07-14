// ─── fm-readiness.test.ts (F5 P4 gate) ────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { computeFmReadiness } from './fm-readiness'
import type { CobieExtractResult } from '../worker-schemas'

const make = (counts: CobieExtractResult['counts']): CobieExtractResult =>
  ({ rows: [], counts, durationMs: 1 })

describe('computeFmReadiness', () => {
  it('a fully-populated handover scores ready (100)', () => {
    const r = computeFmReadiness(make({
      Component: { rows: 10, named: 10, withGuid: 10 },
      Space: { rows: 5, named: 5, withGuid: 5 },
      Type: { rows: 4, named: 4, withGuid: 4 },
    }))
    expect(r.score).toBe(100)
    expect(r.tier).toBe('ready')
  })

  it('an empty extraction scores 0 / insufficient', () => {
    const r = computeFmReadiness(make({}))
    expect(r.score).toBe(0)
    expect(r.tier).toBe('insufficient')
  })

  it('components present but unnamed/no-guid and no types drags the score down', () => {
    // Component fraction 0 (0 named, 0 guid), space named, type absent though
    // components exist → 0*0.5 + 1*0.3 + 0*0.2 = 30 → partial's lower edge.
    const r = computeFmReadiness(make({
      Component: { rows: 8, named: 0, withGuid: 0 },
      Space: { rows: 3, named: 3, withGuid: 0 },
      Type: { rows: 0, named: 0, withGuid: 0 },
    }))
    expect(r.score).toBe(30)
    expect(r.tier).toBe('insufficient')
    expect(r.sheets.component.fraction).toBe(0)
  })

  it('half-named components with types and named spaces → partial', () => {
    // comp = (0.5 named + 1.0 guid)/2 = 0.75 → 0.375; space 1 → 0.3; type 1 → 0.2
    // total = 37.5 + 30 + 20 = 87.5 → 88
    const r = computeFmReadiness(make({
      Component: { rows: 10, named: 5, withGuid: 10 },
      Space: { rows: 2, named: 2, withGuid: 0 },
      Type: { rows: 3, named: 0, withGuid: 0 },
    }))
    expect(r.score).toBe(88)
    expect(r.tier).toBe('ready')
  })
})
