// ─── validation-coverage.test.ts ───────────────────────────────────────────────
// Guards the "honest validation" coverage layer (Phase 1). A validation run must
// never silently look complete when a rule failed or never executed.
//
//   §1  buildCoverage      — gap-fills unreported rules as not-run; complete flag
//   §2  Zod round-trip     — metadata.coverage survives parseValidationResultMsg
//                            (regression guard: Zod strips undeclared keys)
//   §3  Multi-model merge  — aggregate is incomplete if any model is incomplete

import { describe, it, expect } from 'vitest'
import { buildCoverage, composeMultiModelResult } from './validator'
import { parseValidationResultMsg } from './worker-schemas'
import type { RuleCoverageEntry, ValidationCoverage, ValidationResult } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function known(...entries: RuleCoverageEntry[]): Map<string, RuleCoverageEntry> {
  return new Map(entries.map((e) => [e.ruleId, e]))
}

function emptyResult(coverage?: ValidationCoverage): ValidationResult {
  return {
    issues: [],
    stats: { total: 0, errors: 0, warnings: 0, info: 0, byRule: {} },
    durationMs: 1,
    ...(coverage ? { metadata: { coverage } } : {}),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §1  buildCoverage
// ─────────────────────────────────────────────────────────────────────────────

describe('buildCoverage', () => {
  it('gap-fills attempted rules with no reported status as not-run', () => {
    const cov = buildCoverage(
      ['RULE_A', 'RULE_B', 'RULE_C'],
      known(
        { ruleId: 'RULE_A', status: 'ok' },
        { ruleId: 'RULE_B', status: 'failed', error: 'boom' },
      ),
    )
    expect(cov.attempted).toEqual(['RULE_A', 'RULE_B', 'RULE_C'])
    expect(cov.entries).toHaveLength(3)
    expect(cov.entries.find((e) => e.ruleId === 'RULE_C')?.status).toBe('not-run')
    expect(cov.okCount).toBe(1)
    expect(cov.failedCount).toBe(1)
    expect(cov.notRunCount).toBe(1)
    expect(cov.complete).toBe(false)
  })

  it('is complete only when every attempted rule ran ok', () => {
    const cov = buildCoverage(
      ['RULE_A', 'RULE_B'],
      known({ ruleId: 'RULE_A', status: 'ok' }, { ruleId: 'RULE_B', status: 'ok' }),
    )
    expect(cov.complete).toBe(true)
    expect(cov.okCount).toBe(2)
    expect(cov.notRunCount).toBe(0)
  })

  it('an empty attempted set is trivially complete', () => {
    const cov = buildCoverage([], new Map())
    expect(cov.complete).toBe(true)
    expect(cov.entries).toEqual([])
  })

  it('a single failed rule makes the whole run incomplete', () => {
    const cov = buildCoverage(['RULE_A'], known({ ruleId: 'RULE_A', status: 'failed', error: 'x' }))
    expect(cov.complete).toBe(false)
    expect(cov.failedCount).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §2  Zod round-trip — the highest-impact regression guard
//
// parseValidationResultMsg runs the merged result through ValidationResultSchema
// before it reaches the store. Zod strips keys the schema does not declare, so if
// metadata.coverage isn't in the schema it vanishes silently and the whole
// feature no-ops past the launcher. This test fails loudly if that regresses.
// ─────────────────────────────────────────────────────────────────────────────

describe('coverage survives the Zod result schema', () => {
  it('parseValidationResultMsg preserves metadata.coverage', () => {
    const coverage = buildCoverage(
      ['RULE_A', 'RULE_B'],
      known(
        { ruleId: 'RULE_A', status: 'ok' },
        { ruleId: 'RULE_B', status: 'failed', error: 'threw' },
      ),
    )
    const parsed = parseValidationResultMsg(emptyResult(coverage))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      const cov = parsed.data.metadata?.coverage
      expect(cov).toBeDefined()
      expect(cov?.complete).toBe(false)
      expect(cov?.failedCount).toBe(1)
      expect(cov?.entries).toHaveLength(2)
      expect(cov?.entries.find((e) => e.ruleId === 'RULE_B')?.error).toBe('threw')
    }
  })

  it('a result with no coverage still parses (back-compat)', () => {
    const parsed = parseValidationResultMsg(emptyResult())
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.data.metadata?.coverage).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §3  Multi-model merge
// ─────────────────────────────────────────────────────────────────────────────

describe('composeMultiModelResult — coverage merge', () => {
  it('aggregate is incomplete if ANY model run was incomplete (worst status wins)', () => {
    const a = emptyResult(buildCoverage(['RULE_A'], known({ ruleId: 'RULE_A', status: 'ok' })))
    const b = emptyResult(buildCoverage(['RULE_A'], known({ ruleId: 'RULE_A', status: 'failed', error: 'e' })))
    const merged = composeMultiModelResult({ a, b }, ['a', 'b'])
    expect(merged?.metadata?.coverage?.complete).toBe(false)
    expect(merged?.metadata?.coverage?.failedCount).toBe(1)
  })

  it('aggregate is complete only when every model is complete', () => {
    const a = emptyResult(buildCoverage(['RULE_A'], known({ ruleId: 'RULE_A', status: 'ok' })))
    const b = emptyResult(buildCoverage(['RULE_A'], known({ ruleId: 'RULE_A', status: 'ok' })))
    const merged = composeMultiModelResult({ a, b }, ['a', 'b'])
    expect(merged?.metadata?.coverage?.complete).toBe(true)
  })

  it('legacy results with no coverage → undefined (unknown, never complete:true)', () => {
    const merged = composeMultiModelResult({ a: emptyResult(), b: emptyResult() }, ['a', 'b'])
    expect(merged?.metadata?.coverage).toBeUndefined()
  })
})
