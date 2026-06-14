// ─── IDS run diff ─────────────────────────────────────────────────────────────
// Compares two IDS runs of the same model so the user sees progress between
// re-runs: which failures they resolved, which newly appeared, and how the score
// and pass count moved. Powers the "since your last run" strip. Pure — mirrors
// validation-diff.ts.

import type { IdsResult } from './ids-types'

export interface IdsDiff {
  /** Failing elements present in the previous run but gone now (fixed). */
  resolved: number
  /** Failing elements present now but not before (regressions / newly surfaced). */
  added: number
  /** Failing elements present in both runs (still outstanding). */
  persistent: number
  scoreDelta: number       // currScore − prevScore (positive = improved)
  prevScore: number
  currScore: number
  specsPassedDelta: number // currPassedSpecs − prevPassedSpecs
  /** True when nothing changed between the two runs. */
  unchanged: boolean
}

/** Identity of a failing element for cross-run comparison: spec + express id. */
function failureKeys(result: IdsResult): Set<string> {
  const keys = new Set<string>()
  for (const s of result.specs) {
    if (s.status !== 'fail') continue
    for (const f of s.failures) keys.add(`${s.name}::${f.expressId}`)
  }
  return keys
}

/** Compare a previous IDS run against the current one (same model). */
export function diffIdsResults(prev: IdsResult, curr: IdsResult): IdsDiff {
  const prevKeys = failureKeys(prev)
  const currKeys = failureKeys(curr)

  let resolved = 0, persistent = 0, added = 0
  for (const k of prevKeys) (currKeys.has(k) ? persistent++ : resolved++)
  for (const k of currKeys) if (!prevKeys.has(k)) added++

  return {
    resolved,
    added,
    persistent,
    scoreDelta: curr.score - prev.score,
    prevScore: prev.score,
    currScore: curr.score,
    specsPassedDelta: curr.passedSpecs - prev.passedSpecs,
    unchanged: resolved === 0 && added === 0 && curr.score === prev.score,
  }
}
