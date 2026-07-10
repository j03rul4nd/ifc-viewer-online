// ─── certify/deep-verify.test.ts ──────────────────────────────────────────────
// F1.5 §P1/P2 acceptance: the pure comparison half of deep verification.
// (The hash check itself is sha256Hex, already covered in canonical.test.ts;
// the worker plumbing is exercised in-browser, not here.)

import { describe, expect, it } from 'vitest'
import { compareRuleResults } from './deep-verify'
import type { CertifyPayloadV1 } from './canonical'

type Rules = CertifyPayloadV1['rules_result']

const certified: Rules = [
  { rule_id: 'RULE_EMPTY_NAME', status: 'pass' },
  { rule_id: 'RULE_DUPLICATE_GUID', status: 'fail' },
  { rule_id: 'RULE_MISSING_PSET', status: 'warning' },
]

describe('compareRuleResults', () => {
  it('reports reproduced when every shared rule matches', () => {
    const out = compareRuleResults(certified, { rules_result: [...certified], health_score: 82 })
    expect(out.reproduced).toBe(true)
    expect(out.comparedCount).toBe(3)
    expect(out.diffs).toEqual([])
    expect(out.notReevaluated).toEqual([])
    expect(out.recomputedScore).toBe(82)
  })

  it('lists each rule whose status changed, with both statuses', () => {
    const fresh: Rules = [
      { rule_id: 'RULE_EMPTY_NAME', status: 'pass' },
      { rule_id: 'RULE_DUPLICATE_GUID', status: 'pass' }, // was fail
      { rule_id: 'RULE_MISSING_PSET', status: 'warning' },
    ]
    const out = compareRuleResults(certified, { rules_result: fresh, health_score: 95 })
    expect(out.reproduced).toBe(false)
    expect(out.diffs).toEqual([
      { rule_id: 'RULE_DUPLICATE_GUID', certified: 'fail', recomputed: 'pass' },
    ])
  })

  it('certified rules absent from the default re-run are notReevaluated, never diffs', () => {
    const customCertified: Rules = [...certified, { rule_id: 'RULE_CUSTOM_XYZ', status: 'fail' }]
    const out = compareRuleResults(customCertified, { rules_result: [...certified], health_score: 82 })
    expect(out.reproduced).toBe(true) // the 3 shared rules match
    expect(out.comparedCount).toBe(3)
    expect(out.notReevaluated).toEqual(['RULE_CUSTOM_XYZ'])
  })

  it('zero shared rules can never claim reproduced', () => {
    const out = compareRuleResults(certified, { rules_result: [], health_score: 100 })
    expect(out.reproduced).toBe(false)
    expect(out.comparedCount).toBe(0)
    expect(out.notReevaluated).toHaveLength(3)
  })
})
