// ─── Validation diff ──────────────────────────────────────────────────────────
// Compares two validation runs of the same model so the user can see progress:
// what they resolved, what newly appeared, and how the score moved. Powers the
// "since your last run" banner. Pure functions — no state, no side effects.

import type { ValidationResult, ValidationIssue } from '../types'

export interface ValidationDiff {
  /** Issues present in the previous run but gone now (fixed). */
  resolved: number
  /** Issues present now but not in the previous run (regressions / newly surfaced). */
  added: number
  /** Issues present in both runs (still outstanding). */
  persistent: number
  /** currScore − prevScore. Positive = improved. */
  scoreDelta: number
  prevScore: number
  currScore: number
  prevTotal: number
  currTotal: number
  /** True when nothing changed between the two runs (same issues, same score). */
  unchanged: boolean
}

/**
 * Identity of an issue for cross-run comparison. Includes modelId so the same
 * GlobalId in two different loaded models doesn't collide. Falls back to the
 * express id for file-level issues that carry no GlobalId.
 */
function diffKey(i: ValidationIssue): string {
  return `${i.modelId ?? ''}::${i.ruleId}::${i.globalId ?? `e${i.expressId}`}`
}

/** Compare a previous run against the current one. */
export function diffResults(prev: ValidationResult, curr: ValidationResult): ValidationDiff {
  const prevKeys = new Set(prev.issues.map(diffKey))
  const currKeys = new Set(curr.issues.map(diffKey))

  let resolved = 0, persistent = 0, added = 0
  for (const k of prevKeys) (currKeys.has(k) ? persistent++ : resolved++)
  for (const k of currKeys) if (!prevKeys.has(k)) added++

  const prevScore = prev.qualityScore ?? 0
  const currScore = curr.qualityScore ?? 0

  return {
    resolved,
    added,
    persistent,
    scoreDelta: currScore - prevScore,
    prevScore,
    currScore,
    prevTotal: prev.issues.length,
    currTotal: curr.issues.length,
    unchanged: resolved === 0 && added === 0 && prevScore === currScore,
  }
}
