import { describe, it, expect } from 'vitest'
import { diffIdsResults } from './ids-diff'
import type { IdsResult, IdsSpecResult } from './ids-types'

const spec = (over: Partial<IdsSpecResult>): IdsSpecResult => ({
  name: 's', status: 'fail', applicableCount: 1, passedCount: 0, failedCount: 1, unsupported: [], failures: [], ...over,
})

function result(score: number, passedSpecs: number, failures: Array<{ spec: string; id: number }>): IdsResult {
  const byspec = new Map<string, number[]>()
  for (const f of failures) byspec.set(f.spec, [...(byspec.get(f.spec) ?? []), f.id])
  const specs = [...byspec.entries()].map(([name, ids]) =>
    spec({ name, failures: ids.map((expressId) => ({ expressId, ifcClass: 'IFCWALL', name: `#${expressId}`, reasons: [] })) }))
  return { score, totalSpecs: specs.length + passedSpecs, passedSpecs, failedSpecs: specs.length, naSpecs: 0, specs }
}

describe('diffIdsResults', () => {
  it('counts resolved / added / persistent failing elements by (spec, expressId)', () => {
    const prev = result(40, 1, [{ spec: 'A', id: 1 }, { spec: 'A', id: 2 }, { spec: 'B', id: 9 }])
    const curr = result(70, 2, [{ spec: 'A', id: 2 }, { spec: 'C', id: 5 }])
    const d = diffIdsResults(prev, curr)
    expect(d.resolved).toBe(2)    // A#1 and B#9 gone
    expect(d.persistent).toBe(1)  // A#2 still failing
    expect(d.added).toBe(1)       // C#5 new
    expect(d.scoreDelta).toBe(30)
    expect(d.specsPassedDelta).toBe(1)
    expect(d.unchanged).toBe(false)
  })

  it('flags unchanged when failures and score are identical', () => {
    const a = result(50, 1, [{ spec: 'A', id: 1 }])
    const b = result(50, 1, [{ spec: 'A', id: 1 }])
    expect(diffIdsResults(a, b).unchanged).toBe(true)
  })

  it('reports a negative score delta on regression', () => {
    const prev = result(90, 3, [])
    const curr = result(60, 2, [{ spec: 'A', id: 1 }])
    const d = diffIdsResults(prev, curr)
    expect(d.scoreDelta).toBe(-30)
    expect(d.added).toBe(1)
    expect(d.specsPassedDelta).toBe(-1)
  })

  it('does not count synthetic spec-level failures inconsistently (expressId -1 keys stay stable)', () => {
    const prev = result(0, 0, [{ spec: 'Req', id: -1 }])
    const curr = result(0, 0, [{ spec: 'Req', id: -1 }])
    expect(diffIdsResults(prev, curr)).toMatchObject({ resolved: 0, added: 0, persistent: 1, unchanged: true })
  })
})
