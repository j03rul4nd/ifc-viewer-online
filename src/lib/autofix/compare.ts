// Before/after of an auto-fix: the same engine (validator worker, default
// profile) runs on the original and the fixed bytes, so the comparison is
// apples to apples even when the panel shows a custom/EIR profile.

import type { ValidationIssue } from '../../types'
import { calculateQualityScore } from '../validator'

export interface RuleDelta { ruleId: string; before: number; after: number }

export interface FixComparison {
  scoreBefore: number
  scoreAfter: number
  issuesBefore: number
  issuesAfter: number
  /** Rules whose issue count changed, biggest improvement first. */
  rules: RuleDelta[]
}

function countByRule(issues: ValidationIssue[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const i of issues) m.set(i.ruleId, (m.get(i.ruleId) ?? 0) + 1)
  return m
}

export function compareRuns(before: ValidationIssue[], after: ValidationIssue[]): FixComparison {
  const b = countByRule(before), a = countByRule(after)
  const rules: RuleDelta[] = []
  for (const ruleId of new Set([...b.keys(), ...a.keys()])) {
    const x = b.get(ruleId) ?? 0, y = a.get(ruleId) ?? 0
    if (x !== y) rules.push({ ruleId, before: x, after: y })
  }
  rules.sort((p, q) => (q.before - q.after) - (p.before - p.after))
  return {
    scoreBefore: calculateQualityScore({ issues: before }),
    scoreAfter: calculateQualityScore({ issues: after }),
    issuesBefore: before.length,
    issuesAfter: after.length,
    rules,
  }
}
