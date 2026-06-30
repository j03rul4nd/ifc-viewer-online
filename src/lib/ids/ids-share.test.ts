import { describe, it, expect } from 'vitest'
import { idsResultToSharePayload } from './ids-share'
import type { IdsResult } from './ids-types'

function spec(over: Partial<IdsResult['specs'][number]>): IdsResult['specs'][number] {
  return { name: 'S', status: 'fail', applicableCount: 0, passedCount: 0, failedCount: 0, failures: [], unsupported: [], ...over }
}
function result(specs: IdsResult['specs'], score = 70): IdsResult {
  return { totalSpecs: specs.length, passedSpecs: 0, failedSpecs: 0, naSpecs: 0, score, specs }
}

describe('idsResultToSharePayload', () => {
  it('maps EIR severities and counts', () => {
    const p = idsResultToSharePayload(result([
      spec({ name: 'Doors FireRating', identifier: 'eir:error', failedCount: 2, failures: [
        { expressId: 1, ifcClass: 'IFCDOOR', name: 'A', reasons: [{ code: 'missingRequired', params: { what: 'property FireRating' } }] },
        { expressId: 2, ifcClass: 'IFCDOOR', name: 'B', reasons: [{ code: 'missingRequired', params: { what: 'property FireRating' } }] },
      ] }),
      spec({ name: 'Manufacturer', identifier: 'eir:warning', failedCount: 1, failures: [
        { expressId: 3, ifcClass: 'IFCDOOR', name: 'C', reasons: [{ code: 'missingRequired', params: { what: 'property Manufacturer' } }] },
      ] }),
    ], 64), 'demo.ifc')
    expect(p.score).toBe(64)
    expect(p.file).toBe('demo.ifc')
    expect([p.e, p.w, p.i]).toEqual([2, 1, 0])
    expect(p.issues).toHaveLength(3)
    expect(p.issues[0].s).toBe('e')           // errors sorted first
    expect(p.issues[0].m).toContain('missing required property FireRating')
  })

  it('treats plain IDS failures (no eir identifier) as errors', () => {
    const p = idsResultToSharePayload(result([
      spec({ name: 'Walls', failedCount: 3, failures: [{ expressId: 5, ifcClass: 'IFCWALL', name: 'W', reasons: [{ code: 'missingRequired', params: { what: 'x' } }] }] }),
    ]), 'm.ifc')
    expect([p.e, p.w, p.i]).toEqual([3, 0, 0])
  })

  it('caps the issue list at 50', () => {
    const failures = Array.from({ length: 80 }, (_, k) => ({ expressId: k, ifcClass: 'IFCWALL', name: `W${k}`, reasons: [{ code: 'missingRequired' as const, params: { what: 'x' } }] }))
    const p = idsResultToSharePayload(result([spec({ name: 'S', identifier: 'eir:error', failedCount: 80, failures })]), 'm.ifc')
    expect(p.issues).toHaveLength(50)
    expect(p.e).toBe(80) // count is not capped
  })
})
