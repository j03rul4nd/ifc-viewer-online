import { describe, it, expect } from 'vitest'
import { idsElementStats } from './ids-stats'
import type { IdsResult } from './ids-types'

function spec(over: Partial<IdsResult['specs'][number]>): IdsResult['specs'][number] {
  return { name: 'S', status: 'fail', applicableCount: 0, passedCount: 0, failedCount: 0, failures: [], unsupported: [], ...over }
}

function result(specs: IdsResult['specs']): IdsResult {
  return { totalSpecs: specs.length, passedSpecs: 0, failedSpecs: 0, naSpecs: 0, score: 80, specs }
}

describe('idsElementStats', () => {
  it('sums element-checks across specs', () => {
    const r = result([
      spec({ status: 'pass', applicableCount: 3, passedCount: 3, failedCount: 0 }),
      spec({ status: 'fail', applicableCount: 4, passedCount: 1, failedCount: 3, failures: [
        { expressId: 1, ifcClass: 'IFCWALL', name: 'a', reasons: [] },
        { expressId: 2, ifcClass: 'IFCWALL', name: 'b', reasons: [] },
        { expressId: 1, ifcClass: 'IFCWALL', name: 'a', reasons: [] },
      ] }),
    ])
    const s = idsElementStats(r)
    expect(s.validated).toBe(7)
    expect(s.passed).toBe(4)
    expect(s.failed).toBe(3)
    expect(s.failingElements).toBe(2) // 1 and 2, deduped
    expect(s.compliance).toBe(80)
  })

  it('counts the synthetic required-but-absent check and ignores its negative id', () => {
    const r = result([
      spec({ status: 'fail', applicableCount: 0, passedCount: 0, failedCount: 1, failures: [
        { expressId: -1, ifcClass: '', name: '', reasons: [] },
      ] }),
    ])
    const s = idsElementStats(r)
    expect(s.validated).toBe(1) // max(0, 0+1)
    expect(s.failed).toBe(1)
    expect(s.failingElements).toBe(0) // synthetic row excluded
  })
})
