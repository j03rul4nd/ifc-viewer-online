// ─── multi-model-result.test.ts ─────────────────────────────────────────────────
// Regression tests for composeMultiModelResult — the function that aggregates
// per-model validation results into the single result shown in the panel.
//
// Bug it guards against: with several IFC models in the scene, the panel only
// showed issues from the last-validated model because each run overwrote the
// global `result`. The fix recomposes the displayed result from every model's
// cached result, so the panel lists issues from ALL models.

import { describe, it, expect } from 'vitest'
import { composeMultiModelResult, calculateQualityScore } from './validator'
import type { ValidationResult, ValidationIssue } from '../types'

function issue(ruleId: string, severity: ValidationIssue['severity'], modelId?: string): ValidationIssue {
  return {
    id: Math.random().toString(36).slice(2),
    ruleId,
    severity,
    expressId: 0,
    globalId: null,
    ifcClass: 'IfcWall',
    elementName: '(test)',
    message: 'test issue',
    path: [],
    autoFixable: false,
    ...(modelId ? { modelId } : {}),
  }
}

function resultOf(issues: ValidationIssue[]): ValidationResult {
  const errors   = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.filter((i) => i.severity === 'warning').length
  const info     = issues.filter((i) => i.severity === 'info').length
  const byRule: Record<string, number> = {}
  for (const i of issues) byRule[i.ruleId] = (byRule[i.ruleId] ?? 0) + 1
  const base: ValidationResult = {
    issues,
    stats: { total: issues.length, errors, warnings, info, byRule },
    durationMs: 10,
  }
  return { ...base, qualityScore: calculateQualityScore(base) }
}

describe('composeMultiModelResult', () => {
  it('returns null when there are no model results', () => {
    expect(composeMultiModelResult({}, [])).toBeNull()
  })

  it('returns the single model result unchanged when only one model', () => {
    const r = resultOf([issue('RULE_EMPTY_NAME', 'error', 'm1')])
    const out = composeMultiModelResult({ m1: r }, ['m1'])
    expect(out).toBe(r) // identity — no needless recompute
  })

  it('merges issues from every model (the core bug fix)', () => {
    const m1 = resultOf([issue('RULE_EMPTY_NAME', 'error', 'm1'), issue('RULE_EMPTY_NAME', 'error', 'm1')])
    const m2 = resultOf([issue('RULE_MISSING_TYPE', 'warning', 'm2')])
    const out = composeMultiModelResult({ m1, m2 }, ['m1', 'm2'])
    expect(out).not.toBeNull()
    expect(out!.issues).toHaveLength(3)
    expect(out!.stats.total).toBe(3)
    expect(out!.stats.errors).toBe(2)
    expect(out!.stats.warnings).toBe(1)
    // issues from both models are present
    const modelIds = new Set(out!.issues.map((i) => i.modelId))
    expect(modelIds).toEqual(new Set(['m1', 'm2']))
  })

  it('aggregates byRule counts across models', () => {
    const m1 = resultOf([issue('RULE_EMPTY_NAME', 'error', 'm1')])
    const m2 = resultOf([issue('RULE_EMPTY_NAME', 'error', 'm2'), issue('RULE_MISSING_TYPE', 'warning', 'm2')])
    const out = composeMultiModelResult({ m1, m2 }, ['m1', 'm2'])
    expect(out!.stats.byRule['RULE_EMPTY_NAME']).toBe(2)
    expect(out!.stats.byRule['RULE_MISSING_TYPE']).toBe(1)
  })

  it('stamps modelId on legacy issues that lack it', () => {
    // A cached result whose issues predate the modelId stamp.
    const legacy = resultOf([issue('RULE_EMPTY_NAME', 'error')]) // no modelId
    const m2 = resultOf([issue('RULE_MISSING_TYPE', 'warning', 'm2')])
    const out = composeMultiModelResult({ m1: legacy, m2 }, ['m1', 'm2'])
    const fromM1 = out!.issues.filter((i) => i.modelId === 'm1')
    expect(fromM1).toHaveLength(1)
  })

  it('includes cached models even if not present in the order array', () => {
    const m1 = resultOf([issue('RULE_EMPTY_NAME', 'error', 'm1')])
    const m2 = resultOf([issue('RULE_MISSING_TYPE', 'warning', 'm2')])
    // order only mentions m1 — m2 must still be included (defensive)
    const out = composeMultiModelResult({ m1, m2 }, ['m1'])
    expect(out!.issues).toHaveLength(2)
  })

  it('recomputes a single aggregate quality score, not a per-model one', () => {
    const m1 = resultOf([issue('RULE_EMPTY_NAME', 'error', 'm1')])
    const m2 = resultOf([issue('RULE_EMPTY_NAME', 'error', 'm2')])
    const out = composeMultiModelResult({ m1, m2 }, ['m1', 'm2'])
    // The aggregate score must equal scoring the merged issue list directly.
    const expected = calculateQualityScore({
      issues: [...m1.issues, ...m2.issues],
      stats: out!.stats,
      durationMs: 0,
    })
    expect(out!.qualityScore).toBe(expected)
  })

  it('sums durationMs across models', () => {
    const m1 = resultOf([issue('RULE_EMPTY_NAME', 'error', 'm1')])
    const m2 = resultOf([issue('RULE_MISSING_TYPE', 'warning', 'm2')])
    const out = composeMultiModelResult({ m1, m2 }, ['m1', 'm2'])
    expect(out!.durationMs).toBe(m1.durationMs + m2.durationMs)
  })
})
