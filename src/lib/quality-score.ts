// ─── Quality score (pure) ──────────────────────────────────────────────────────
// The Health Score formula, with no store or DOM imports, so the browser and the
// server-side validation runner (server/validation-runner) share one definition.

import type { ValidationResult, ValidationCategoryType } from '../types'
import { RULE_METADATA } from '../types'


/**
 * Penalty weights per category per severity.
 *
 * Keyed by `ValidationCategoryType` (not `string`) on purpose: this makes the map
 * **exhaustive** at compile time. If a new category is added to the union — or a
 * new rule introduces one — `tsc` fails here until a weight is supplied, instead
 * of the score silently falling back to DEFAULT_WEIGHTS and mis-weighting the
 * headline metric. (The inner value stays `Record<string, number>` so indexing by
 * the runtime severity string in `calculateQualityScore` doesn't trip TS7053.)
 */
const CATEGORY_WEIGHTS: Record<ValidationCategoryType, Record<string, number>> = {
  schema:         { error: 5, warning: 1.5, info: 0.3 },
  spatial:        { error: 4, warning: 1.2, info: 0.2 },
  quality:        { error: 3, warning: 1.0, info: 0.2 },
  lod:            { error: 3, warning: 1.0, info: 0.2 },
  iso19650:       { error: 3, warning: 0.8, info: 0.1 },
  classification: { error: 2, warning: 0.6, info: 0.1 },
  mep:            { error: 2, warning: 0.8, info: 0.1 },
  clash:          { error: 4, warning: 1.5, info: 0.2 },
}
const DEFAULT_WEIGHTS: Record<string, number> = { error: 3, warning: 1, info: 0.2 }

// Exported for the score↔metadata contract test (quality-score.test.ts).
export const __scoreWeights = { CATEGORY_WEIGHTS, DEFAULT_WEIGHTS } as const

/**
 * One rule's contribution to the quality-score penalty.
 * `penalty` ≈ the points recovered by clearing that rule (exact away from the
 * 0/100 clamp), so the UI can rank "what to fix first" by real score impact.
 */
export interface ScoreContribution {
  ruleId: string
  category: ValidationCategoryType | 'unknown'
  count: number
  penalty: number
}

/**
 * Break the quality score down into per-rule penalty contributions, sorted by
 * impact (highest first). The rule at the top is the single biggest drag on the
 * score — the most valuable thing to fix.
 *
 * Penalties use **logarithmically diminishing returns**: the first occurrence of
 * a failing rule costs its full category/severity weight, each further one adds
 * less (`weight × (1 + ln(count))`). A single systematic defect (e.g. 5 000
 * elements missing a material) is *one* problem to fix, not 5 000 independent
 * ones; a naive `weight × count` sum would saturate any real model's score to 0.
 */
export function explainQualityScore(result: Pick<ValidationResult, 'issues'>): ScoreContribution[] {
  // Count issues per rule, split by severity.
  const counts = new Map<string, Record<string, number>>()
  for (const issue of result.issues) {
    let bySeverity = counts.get(issue.ruleId)
    if (!bySeverity) counts.set(issue.ruleId, (bySeverity = {}))
    bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1
  }

  const contributions: ScoreContribution[] = []
  for (const [ruleId, bySeverity] of counts) {
    const meta    = RULE_METADATA[ruleId]
    const weights = (meta ? CATEGORY_WEIGHTS[meta.category] : null) ?? DEFAULT_WEIGHTS
    let penalty = 0, count = 0
    for (const [severity, n] of Object.entries(bySeverity)) {
      penalty += (weights[severity] ?? 0) * (1 + Math.log(n))
      count   += n
    }
    contributions.push({ ruleId, category: meta?.category ?? 'unknown', count, penalty })
  }
  return contributions.sort((a, b) => b.penalty - a.penalty)
}

/**
 * Compute the 0–100 quality score — every rule's penalty subtracted from 100 and
 * clamped to [0, 100]. See explainQualityScore for the penalty model.
 */
export function calculateQualityScore(result: Pick<ValidationResult, 'issues'>): number {
  let penalty = 0
  for (const c of explainQualityScore(result)) penalty += c.penalty
  return Math.max(0, Math.round(100 - penalty))
}

