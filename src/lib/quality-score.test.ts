// ─── quality-score.test.ts ─────────────────────────────────────────────────────
// Unit tests for calculateQualityScore — the 0–100 "Health Score" that is the
// product's headline metric.
//
//   §1  Boundaries        — empty result is 100, score is clamped to 0–100
//   §2  Severity weighting — errors hurt more than warnings/info
//   §3  Diminishing returns — a systematic defect can't linearly zero the score
//   §4  Unknown rule fallback — uses DEFAULT_WEIGHTS
//   §5  Score↔metadata contract — every rule category has an explicit weight

import { describe, it, expect } from 'vitest'
import { calculateQualityScore, explainQualityScore, __scoreWeights } from './validator'
import { RULE_METADATA, VALIDATION_CATEGORY_LABELS } from '../types'
import type { ValidationResult, ValidationIssue } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function issue(ruleId: string, severity: ValidationIssue['severity']): ValidationIssue {
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
  }
}

function resultOf(issues: ValidationIssue[]): ValidationResult {
  const errors   = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.filter((i) => i.severity === 'warning').length
  const info     = issues.filter((i) => i.severity === 'info').length
  return {
    issues,
    stats: { total: issues.length, errors, warnings, info, byRule: {} },
    durationMs: 0,
  }
}

function many(ruleId: string, severity: ValidationIssue['severity'], n: number): ValidationIssue[] {
  return Array.from({ length: n }, () => issue(ruleId, severity))
}

// ─────────────────────────────────────────────────────────────────────────────
// §1  Boundaries
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateQualityScore — boundaries', () => {
  it('returns 100 for a clean model', () => {
    expect(calculateQualityScore(resultOf([]))).toBe(100)
  })

  it('never returns below 0', () => {
    // RULE_EMPTY_NAME is a quality error (weight 3). Even 100k of them stay ≥ 0.
    const score = calculateQualityScore(resultOf(many('RULE_EMPTY_NAME', 'error', 100_000)))
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §2  Severity weighting
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateQualityScore — severity weighting', () => {
  it('penalises an error more than a warning of the same rule count', () => {
    // RULE_EMPTY_NAME is quality: error=3, warning=1.0
    const errScore  = calculateQualityScore(resultOf([issue('RULE_EMPTY_NAME', 'error')]))
    const warnScore = calculateQualityScore(resultOf([issue('RULE_EMPTY_NAME', 'warning')]))
    expect(errScore).toBeLessThan(warnScore)
    expect(errScore).toBe(97)   // 100 - 3*(1+ln1)
    expect(warnScore).toBe(99)  // 100 - 1*(1+ln1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §3  Diminishing returns — the core regression guard
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateQualityScore — diminishing returns', () => {
  it('does not zero out the score for a single systematic defect', () => {
    // 5 000 elements missing a material (quality warning, weight 1.0).
    // Naive linear scoring (weight * count = 5000) would clamp to 0.
    // Log scaling: 100 - 1*(1 + ln 5000) ≈ 100 - 9.5 ≈ 90.
    const score = calculateQualityScore(resultOf(many('RULE_MISSING_MATERIAL', 'warning', 5000)))
    expect(score).toBeGreaterThan(85)
    expect(score).toBeLessThan(93)
  })

  it('is monotonic — more issues of the same rule never raise the score', () => {
    const s1   = calculateQualityScore(resultOf(many('RULE_MISSING_MATERIAL', 'warning', 1)))
    const s10  = calculateQualityScore(resultOf(many('RULE_MISSING_MATERIAL', 'warning', 10)))
    const s100 = calculateQualityScore(resultOf(many('RULE_MISSING_MATERIAL', 'warning', 100)))
    expect(s10).toBeLessThanOrEqual(s1)
    expect(s100).toBeLessThanOrEqual(s10)
  })

  it('treats distinct failing rules as independent problems', () => {
    const oneRule  = calculateQualityScore(resultOf(many('RULE_MISSING_MATERIAL', 'warning', 100)))
    const twoRules = calculateQualityScore(resultOf([
      ...many('RULE_MISSING_MATERIAL', 'warning', 100),
      ...many('RULE_EMPTY_NAME', 'error', 100),
    ]))
    // Adding a second, distinct failing rule must lower the score further.
    expect(twoRules).toBeLessThan(oneRule)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §4  Unknown rule fallback
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateQualityScore — unknown rules', () => {
  it('falls back to default weights for an unrecognised ruleId', () => {
    // DEFAULT_WEIGHTS error = 3, same as quality → single error scores 97.
    const score = calculateQualityScore(resultOf([issue('RULE_DOES_NOT_EXIST', 'error')]))
    expect(score).toBe(97)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §5  Score↔metadata contract
//
// The score weights penalties by each rule's *category*. If a category used by a
// real rule has no entry in CATEGORY_WEIGHTS, the score silently falls back to
// DEFAULT_WEIGHTS and mis-weights the headline metric. The map's type already
// enforces category-key completeness at compile time; these tests guard the rest
// of the contract (severity coverage, and that no shipped rule is mis-weighted).
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateQualityScore — score↔metadata contract', () => {
  const { CATEGORY_WEIGHTS, DEFAULT_WEIGHTS } = __scoreWeights
  const SEVERITIES = ['error', 'warning', 'info'] as const

  it('weights every validation category for all three severities', () => {
    for (const category of Object.keys(VALIDATION_CATEGORY_LABELS)) {
      const weights = (CATEGORY_WEIGHTS as Record<string, Record<string, number>>)[category]
      expect(weights, `missing CATEGORY_WEIGHTS entry for "${category}"`).toBeDefined()
      for (const sev of SEVERITIES) {
        expect(typeof weights[sev], `${category}.${sev} weight`).toBe('number')
        expect(weights[sev]).toBeGreaterThan(0)
      }
    }
  })

  it('DEFAULT_WEIGHTS covers all three severities', () => {
    for (const sev of SEVERITIES) {
      expect(typeof DEFAULT_WEIGHTS[sev]).toBe('number')
      expect(DEFAULT_WEIGHTS[sev]).toBeGreaterThan(0)
    }
  })

  it('every shipped rule maps to an explicitly-weighted category (none silently default)', () => {
    const weighted = new Set(Object.keys(CATEGORY_WEIGHTS))
    const orphaned = Object.values(RULE_METADATA)
      .filter((meta) => !weighted.has(meta.category))
      .map((meta) => `${meta.id} → ${meta.category}`)
    expect(orphaned, `rules with no category weight: ${orphaned.join(', ')}`).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §6  explainQualityScore — per-rule impact breakdown (drives "fix this first")
// ─────────────────────────────────────────────────────────────────────────────

describe('explainQualityScore', () => {
  it('returns nothing for a clean model', () => {
    expect(explainQualityScore(resultOf([]))).toEqual([])
  })

  it('sorts contributions by penalty, highest impact first', () => {
    const contributions = explainQualityScore(resultOf([
      ...many('RULE_MISSING_MATERIAL', 'warning', 3),   // quality warning, weight 1.0
      ...many('RULE_DUPLICATE_GUID', 'error', 1),        // schema error, weight 5
    ]))
    expect(contributions[0].ruleId).toBe('RULE_DUPLICATE_GUID') // 5 > 1*(1+ln3)
    const penalties = contributions.map((c) => c.penalty)
    expect(penalties).toEqual([...penalties].sort((a, b) => b - a))
  })

  it('reports the issue count and a positive penalty per rule', () => {
    const [top] = explainQualityScore(resultOf(many('RULE_EMPTY_NAME', 'error', 7)))
    expect(top.ruleId).toBe('RULE_EMPTY_NAME')
    expect(top.count).toBe(7)
    expect(top.penalty).toBeGreaterThan(0)
  })

  it('penalties sum to the score deficit (away from the 0/100 clamp)', () => {
    const result = resultOf([
      ...many('RULE_MISSING_MATERIAL', 'warning', 10),
      ...many('RULE_EMPTY_NAME', 'error', 2),
    ])
    const totalPenalty = explainQualityScore(result).reduce((s, c) => s + c.penalty, 0)
    expect(Math.max(0, Math.round(100 - totalPenalty))).toBe(calculateQualityScore(result))
  })

  it('tags each contribution with the rule category', () => {
    const [c] = explainQualityScore(resultOf([issue('RULE_DUPLICATE_GUID', 'error')]))
    expect(c.category).toBe('schema')
  })
})
