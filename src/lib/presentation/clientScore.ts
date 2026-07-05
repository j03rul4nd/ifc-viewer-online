// ─── Client-facing Health Score presentation (D-25) ────────────────────────────
// The technical score breakdown (explainQualityScore → per-rule penalties,
// "fix first") is coordinator language. A client audience gets exactly one
// number, one colour and one phrase. This maps the existing 0–100 score to
// that presentation — no new scoring logic, pure and unit-testable.
//
// The same thresholds gate the LinkedIn template's honesty rule (D-26): below
// `attention` the score is not used as a headline at all.

export type ClientScoreTier = 'verified' | 'attention' | 'review'

/** Tier boundaries (inclusive lower bounds). Documented in D-25/D-26. */
export const CLIENT_SCORE_THRESHOLDS = {
  /** ≥ 85 → green "model verified". */
  verified: 85,
  /** ≥ 70 → amber "good, with observations". Below → red "needs review". */
  attention: 70,
} as const

export function clientScoreTier(score: number): ClientScoreTier {
  if (score >= CLIENT_SCORE_THRESHOLDS.verified) return 'verified'
  if (score >= CLIENT_SCORE_THRESHOLDS.attention) return 'attention'
  return 'review'
}

/** Semantic colour per tier (theme CSS variables with safe fallbacks). */
export function clientScoreColor(tier: ClientScoreTier): string {
  switch (tier) {
    case 'verified':  return 'var(--ok, #22c55e)'
    case 'attention': return '#F5A623'
    case 'review':    return 'var(--danger, #ef4444)'
  }
}

/**
 * Whether a public-facing template (LinkedIn) may lead with the score as the
 * headline. Below the `attention` threshold the honest answer is no (D-26).
 */
export function scoreIsHeadlineWorthy(score: number | null | undefined): boolean {
  return typeof score === 'number' && score >= CLIENT_SCORE_THRESHOLDS.attention
}
