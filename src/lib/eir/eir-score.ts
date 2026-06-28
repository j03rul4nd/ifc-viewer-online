// ─── eir-score.ts ─────────────────────────────────────────────────────────────
// Severity-weighted compliance for EIR results. The plain IdsResult.score treats
// every element-check equally; this weights a spec's checks by the rule severity
// (error ≫ warning ≫ info), so a model that only fails low-severity rules scores
// higher than one failing critical ones. Returned alongside — never replacing —
// the headline score. Only defined for EIR results (specs carry an `eir:<sev>`
// identifier); returns null for plain IDS. Pure + unit-tested.

import type { IdsResult } from '../ids/ids-types'

const WEIGHT: Record<string, number> = { error: 3, warning: 1, info: 0.3 }

function severityOf(identifier: string | undefined): keyof typeof WEIGHT | null {
  if (!identifier?.startsWith('eir:')) return null
  const s = identifier.slice(4)
  return s === 'error' || s === 'warning' || s === 'info' ? s : null
}

/**
 * Severity-weighted compliance percentage (0–100), or null when the result has
 * no EIR-tagged specs. Weights each spec's element-checks by its rule severity.
 */
export function weightedCompliance(result: IdsResult): number | null {
  let weightedPassed = 0
  let weightedTotal = 0
  let anyEir = false
  for (const s of result.specs) {
    const sev = severityOf(s.identifier)
    if (sev == null) continue
    anyEir = true
    const w = WEIGHT[sev]
    // Mirror the score denominator (incl. the synthetic required-but-absent check).
    const total = Math.max(s.applicableCount, s.passedCount + s.failedCount)
    weightedPassed += w * s.passedCount
    weightedTotal += w * total
  }
  if (!anyEir) return null
  return weightedTotal > 0 ? Math.round((weightedPassed / weightedTotal) * 100) : 100
}
