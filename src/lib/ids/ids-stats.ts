// ─── ids-stats.ts ─────────────────────────────────────────────────────────────
// Element-level statistics derived from an IdsResult (which is spec-centric). The
// numbers are at the *element-check* granularity: every applicable element of a
// spec is one check. `failingElements` is the distinct count of real elements
// that failed at least one spec (synthetic spec-level rows, expressId < 0, are
// excluded). Pure + unit-tested; reused by EIR and IDS summaries.

import type { IdsResult } from './ids-types'

export interface IdsElementStats {
  /** Element-checks evaluated across all specs (the score denominator). */
  validated: number
  /** Element-checks that passed. */
  passed: number
  /** Element-checks that failed. */
  failed: number
  /** Distinct real elements that failed ≥1 spec (deduped by expressId). */
  failingElements: number
  /** Compliance percentage (0–100) — the IdsResult score. */
  compliance: number
}

export function idsElementStats(result: IdsResult): IdsElementStats {
  let validated = 0, passed = 0, failed = 0
  const failingIds = new Set<number>()
  for (const s of result.specs) {
    // Mirror summarizeResults: the required-but-absent synthetic check (0
    // applicable, 1 failed) still counts toward the denominator.
    validated += Math.max(s.applicableCount, s.passedCount + s.failedCount)
    passed += s.passedCount
    failed += s.failedCount
    for (const f of s.failures) if (f.expressId >= 0) failingIds.add(f.expressId)
  }
  return { validated, passed, failed, failingElements: failingIds.size, compliance: result.score }
}
