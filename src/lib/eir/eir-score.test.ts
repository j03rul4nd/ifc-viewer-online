import { describe, it, expect } from 'vitest'
import { weightedCompliance } from './eir-score'
import type { IdsResult } from '../ids/ids-types'

function spec(identifier: string | undefined, applicable: number, passed: number): IdsResult['specs'][number] {
  return {
    name: 'S', identifier, status: passed === applicable ? 'pass' : 'fail',
    applicableCount: applicable, passedCount: passed, failedCount: applicable - passed,
    failures: [], unsupported: [],
  }
}
function result(specs: IdsResult['specs']): IdsResult {
  return { totalSpecs: specs.length, passedSpecs: 0, failedSpecs: 0, naSpecs: 0, score: 0, specs }
}

describe('weightedCompliance', () => {
  it('returns null when no spec carries an eir severity', () => {
    expect(weightedCompliance(result([spec(undefined, 10, 5)]))).toBeNull()
  })

  it('weights errors more heavily than info', () => {
    // error spec: 0/10 (weight 3) · info spec: 10/10 (weight 0.3)
    // plain: 10/20 = 50. weighted: (3*0 + 0.3*10) / (3*10 + 0.3*10) = 3/33 ≈ 9
    const r = result([spec('eir:error', 10, 0), spec('eir:info', 10, 10)])
    expect(weightedCompliance(r)).toBe(9)
  })

  it('is 100 when everything passes', () => {
    expect(weightedCompliance(result([spec('eir:error', 5, 5), spec('eir:warning', 3, 3)]))).toBe(100)
  })

  it('ignores non-eir specs in the weighting', () => {
    // Only the eir:warning spec counts: 2/4 = 50.
    const r = result([spec(undefined, 100, 0), spec('eir:warning', 4, 2)])
    expect(weightedCompliance(r)).toBe(50)
  })
})
