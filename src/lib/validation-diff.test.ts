// ─── validation-diff.test.ts ────────────────────────────────────────────────
// Guards the run-to-run comparison that powers the "since your last run" banner.

import { describe, it, expect } from 'vitest'
import { diffResults } from './validation-diff'
import type { ValidationResult, ValidationIssue } from '../types'

function iss(ruleId: string, globalId: string | null, severity: ValidationIssue['severity'] = 'error'): ValidationIssue {
  return {
    id: `${ruleId}:${globalId ?? '?'}`,
    ruleId,
    severity,
    expressId: 1,
    globalId,
    ifcClass: 'IfcWall',
    elementName: 'x',
    message: 'm',
    path: [],
    autoFixable: false,
  }
}

function res(issues: ValidationIssue[], score: number): ValidationResult {
  const errors = issues.filter((i) => i.severity === 'error').length
  return {
    issues,
    stats: { total: issues.length, errors, warnings: 0, info: 0, byRule: {} },
    durationMs: 0,
    qualityScore: score,
  }
}

describe('diffResults', () => {
  it('counts resolved, added and persistent issues + score delta', () => {
    const prev = res([iss('R', 'A'), iss('R', 'B')], 80)
    const curr = res([iss('R', 'B'), iss('R', 'C')], 85)
    const d = diffResults(prev, curr)
    expect(d.resolved).toBe(1)   // A gone
    expect(d.added).toBe(1)      // C new
    expect(d.persistent).toBe(1) // B in both
    expect(d.scoreDelta).toBe(5)
    expect(d.unchanged).toBe(false)
  })

  it('reports unchanged when nothing moved', () => {
    const a = res([iss('R', 'A')], 90)
    const b = res([iss('R', 'A')], 90)
    expect(diffResults(a, b).unchanged).toBe(true)
  })

  it('treats a fully fixed model as all-resolved', () => {
    const d = diffResults(res([iss('R', 'A'), iss('R', 'B')], 70), res([], 100))
    expect(d.resolved).toBe(2)
    expect(d.added).toBe(0)
    expect(d.scoreDelta).toBe(30)
  })

  it('distinguishes issues by model so the same GlobalId in two models does not collide', () => {
    const prev = res([{ ...iss('R', 'A'), modelId: 'm1' }], 90)
    const curr = res([{ ...iss('R', 'A'), modelId: 'm2' }], 90)
    const d = diffResults(prev, curr)
    expect(d.resolved).toBe(1) // m1::A gone
    expect(d.added).toBe(1)    // m2::A new
  })
})
