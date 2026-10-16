import { describe, expect, it } from 'vitest'
import { measuredDelta, predictScoreAfter, scoreOfResults, withOriginalGuids } from './score-delta'
import { fixIssueKey } from './batch-rename'
import { calculateQualityScore } from '../validator'
import { issueKey } from '../../stores/waiverStore'
import type { ValidationIssue, ValidationResult } from '../../types'

const issue = (ruleId: string, severity: ValidationIssue['severity'], n: number, modelId = 'A'): ValidationIssue => ({
  id: `${modelId}-${ruleId}-${n}`, ruleId, severity, expressId: n, globalId: `${modelId}g${n}`,
  ifcClass: 'IfcWall', elementName: 'x', message: '', path: [], autoFixable: false, modelId,
})
const many = (ruleId: string, severity: ValidationIssue['severity'], count: number, modelId = 'A', from = 1) =>
  Array.from({ length: count }, (_, k) => issue(ruleId, severity, from + k, modelId))
const keysOf = (issues: ValidationIssue[]) => new Set(issues.map(fixIssueKey))
const result = (issues: ValidationIssue[]): ValidationResult => ({
  issues,
  stats: { total: issues.length, errors: 0, warnings: 0, info: 0, byRule: {} },
  durationMs: 0,
  qualityScore: calculateQualityScore({ issues }),
})

describe('predictScoreAfter', () => {
  it('10 duplicate-name warnings alone: 97 → 100', () => {
    const dup = many('RULE_DUPLICATE_NAME', 'warning', 10)
    expect(calculateQualityScore({ issues: dup })).toBe(97)
    expect(predictScoreAfter(dup, keysOf(dup))).toBe(100)
  })

  it('457 duplicate-name warnings: 93 → 100', () => {
    const dup = many('RULE_DUPLICATE_NAME', 'warning', 457)
    expect(calculateQualityScore({ issues: dup })).toBe(93)
    expect(predictScoreAfter(dup, keysOf(dup))).toBe(100)
  })

  it('50 empty-name errors: 85 → 100', () => {
    const empty = many('RULE_EMPTY_NAME', 'error', 50)
    expect(calculateQualityScore({ issues: empty })).toBe(85)
    expect(predictScoreAfter(empty, keysOf(empty))).toBe(100)
  })

  it('pools models: clearing model A leaves B scored on its own count', () => {
    const a = many('RULE_DUPLICATE_NAME', 'warning', 1, 'A')
    const b = many('RULE_DUPLICATE_NAME', 'warning', 1, 'B')
    // Pooled, two warnings cost 1 + ln 2; one alone costs 1.
    expect(calculateQualityScore({ issues: [...a, ...b] })).toBe(98)
    expect(predictScoreAfter([...a, ...b], keysOf(a))).toBe(99)
  })

  it('leaves the issues of other rules in place', () => {
    const dup = many('RULE_DUPLICATE_NAME', 'warning', 10)
    const other = many('RULE_MISSING_TYPE', 'warning', 1, 'A', 500)
    expect(predictScoreAfter([...dup, ...other], keysOf(dup))).toBe(calculateQualityScore({ issues: other }))
  })
})

describe('scoreOfResults / measuredDelta', () => {
  it('excludes muted issues from both sides', () => {
    const dup = many('RULE_DUPLICATE_NAME', 'warning', 10)
    const muted = new Set(dup.map(issueKey))
    expect(scoreOfResults([result(dup)], muted)).toBe(100)
    const d = measuredDelta(['A'], { A: result(dup) }, { A: result([]) }, muted)
    expect(d).toEqual({ before: 100, after: 100, resolved: 0, added: 0, measured: true })
  })

  it('with one model and no waivers, before is the run\'s own score', () => {
    const r = result(many('RULE_EMPTY_NAME', 'error', 50))
    const d = measuredDelta(['A'], { A: r }, { A: result([]) }, new Set())
    expect(d.before).toBe(r.qualityScore)
    expect(d.after).toBe(100)
  })

  it('sums resolved / added over the fixed models and pools the score', () => {
    const aBefore = result(many('RULE_DUPLICATE_NAME', 'warning', 4, 'A'))
    const bBefore = result(many('RULE_EMPTY_NAME', 'error', 3, 'B'))
    const cOnly   = result(many('RULE_MISSING_TYPE', 'warning', 2, 'C'))
    // A: all 4 cleared, 1 new naming warning. B: 2 of 3 cleared.
    const aAfter = result(many('RULE_NAMING_CONVENTION', 'warning', 1, 'A', 100))
    const bAfter = result(many('RULE_EMPTY_NAME', 'error', 1, 'B', 3))
    const d = measuredDelta(['A', 'B', 'C'], { A: aBefore, B: bBefore, C: cOnly }, { A: aAfter, B: bAfter }, new Set())
    expect(d.resolved).toBe(4 + 2)
    expect(d.added).toBe(1)
    expect(d.before).toBe(calculateQualityScore({ issues: [...aBefore.issues, ...bBefore.issues, ...cOnly.issues] }))
    expect(d.after).toBe(calculateQualityScore({ issues: [...aAfter.issues, ...bAfter.issues, ...cOnly.issues] }))
    expect(d.measured).toBe(true)
  })

  it('is not measured when no model has an after result', () => {
    const r = result(many('RULE_EMPTY_NAME', 'error', 2))
    expect(measuredDelta(['A'], { A: r }, {}, new Set()).measured).toBe(false)
  })

  it('reads the fixed file under the original GlobalIds when the export changed some', () => {
    const before = result(many('RULE_MISSING_TYPE', 'warning', 2))         // globalIds Ag1, Ag2
    const fixedIssues = [issue('RULE_MISSING_TYPE', 'warning', 1), { ...issue('RULE_MISSING_TYPE', 'warning', 2), globalId: 'NEW2' }]
    const after = result(fixedIssues)
    expect(measuredDelta(['A'], { A: before }, { A: after }, new Set()))
      .toMatchObject({ resolved: 1, added: 1 })
    expect(measuredDelta(['A'], { A: before }, { A: after }, new Set(), { A: { NEW2: 'Ag2' } }))
      .toMatchObject({ resolved: 0, added: 0 })
    // The result handed in is not changed.
    expect(withOriginalGuids(after, { NEW2: 'Ag2' }).issues[1].globalId).toBe('Ag2')
    expect(after.issues[1].globalId).toBe('NEW2')
  })
})
