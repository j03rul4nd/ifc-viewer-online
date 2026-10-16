import { describe, expect, it } from 'vitest'
import type { ValidationIssue } from '../../types'
import { compareRuns } from './compare'

const issue = (ruleId: string, severity: ValidationIssue['severity'] = 'warning', n = 0): ValidationIssue =>
  ({ id: `${ruleId}-${n}`, ruleId, severity, expressId: n, message: '' } as unknown as ValidationIssue)

const many = (ruleId: string, count: number, severity: ValidationIssue['severity'] = 'warning') =>
  Array.from({ length: count }, (_, i) => issue(ruleId, severity, i))

describe('compareRuns', () => {
  const before = [...many('RULE_MISSING_TYPE', 40), ...many('RULE_DUPLICATE_NAME', 6), ...many('RULE_MISSING_MATERIAL', 3)]
  const after = [...many('RULE_MISSING_TYPE', 4), ...many('RULE_MISSING_MATERIAL', 3)]
  const c = compareRuns(before, after)

  it('scores both runs with the same formula and the fixed file scores higher', () => {
    expect(c.scoreAfter).toBeGreaterThan(c.scoreBefore)
  })

  it('lists only changed rules, biggest improvement first', () => {
    expect(c.rules).toEqual([
      { ruleId: 'RULE_MISSING_TYPE', before: 40, after: 4 },
      { ruleId: 'RULE_DUPLICATE_NAME', before: 6, after: 0 },
    ])
    expect(c.issuesBefore).toBe(49)
    expect(c.issuesAfter).toBe(7)
  })

  it('reports no change when the fix changed nothing', () => {
    const same = compareRuns(before, before)
    expect(same.rules).toEqual([])
    expect(same.scoreAfter).toBe(same.scoreBefore)
  })
})
