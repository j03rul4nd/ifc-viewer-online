// ─── Health Score before → after a batch fix ──────────────────────────────────
// Two numbers, kept apart on purpose:
//   predicted — the visible issues minus the ones the plan clears, scored the
//               same way the panel scores. Exact unless the new names trip
//               another rule (a naming convention), which is why it is labelled.
//   measured  — the exported bytes validated in isolation (validate-bytes),
//               pooled with the other scene models the way the headline is.
// Neither ever replaces the original file's score.

import type { ValidationIssue, ValidationResult } from '../../types'
import { calculateQualityScore } from '../validator'
import { diffResults } from '../validation-diff'
import { issueKey } from '../../stores/waiverStore'
import { fixIssueKey } from './batch-rename'

/** Score of the visible issues once the cleared ones are gone. */
export function predictScoreAfter(
  visibleIssues: readonly ValidationIssue[],
  clearedKeys: ReadonlySet<string>,
): number {
  return calculateQualityScore({ issues: visibleIssues.filter((i) => !clearedKeys.has(fixIssueKey(i))) })
}

const unmuted = (r: ValidationResult, muted: ReadonlySet<string>): ValidationIssue[] =>
  muted.size === 0 ? r.issues : r.issues.filter((i) => !muted.has(issueKey(i)))

/**
 * The headline score for a set of per-model results: issues pooled across
 * models (as composeMultiModelResult does) with muted ones left out (as the
 * panel's displayed score does).
 */
export function scoreOfResults(results: readonly ValidationResult[], muted: ReadonlySet<string>): number {
  return calculateQualityScore({ issues: results.flatMap((r) => unmuted(r, muted)) })
}

export interface FixSummary {
  before: number
  after: number
  /** Issues gone in the fixed file. */
  resolved: number
  /** Issues the fixed file has that the original did not. */
  added: number
  /** True when `after` was measured on the fixed bytes, false when predicted. */
  measured: boolean
}

/**
 * Rules that read only the STEP header. The export writes the header from the
 * user's export settings (author, organisation), so these can change between
 * the original and the fixed file for reasons that have nothing to do with
 * the edits. The measured numbers keep them — they are true of the fixed file,
 * and re-opening it gives the same score — and the card says so.
 */
export const HEADER_RULES: ReadonlySet<string> = new Set([
  'RULE_FILE_AUTHOR_MISSING', 'RULE_FILE_DESCRIPTION_MISSING',
  'RULE_ISO19650_AUTHOR_INFO', 'RULE_ISO19650_FILENAME',
])

/** The header-only rules come out differently on the fixed file than on the original. */
export function headerChecksChanged(before: ValidationResult, after: ValidationResult): boolean {
  const count = (r: ValidationResult, ruleId: string): number => r.issues.filter((i) => i.ruleId === ruleId).length
  for (const ruleId of HEADER_RULES) {
    if (count(before, ruleId) !== count(after, ruleId)) return true
  }
  return false
}

/** Fixed-file GlobalId → the original file's GlobalId, for elements whose GUID the export changed. */
export type GuidRemap = Readonly<Record<string, string>>

/**
 * The fixed file's issues under the GlobalIds the original file gave their
 * elements. A pending GUID fix gives an element a new GlobalId in the export;
 * compared by GlobalId (the run diff, the waivers), every other issue on that
 * element would count as one resolved plus one new, and a waiver on it would
 * stop applying and pull the after-score down.
 */
export function withOriginalGuids(r: ValidationResult, remap: GuidRemap | undefined): ValidationResult {
  if (!remap) return r
  let changed = false
  const issues = r.issues.map((i) => {
    if (!i.globalId || !Object.prototype.hasOwnProperty.call(remap, i.globalId)) return i
    changed = true
    return { ...i, globalId: remap[i.globalId] }
  })
  return changed ? { ...r, issues } : r
}

/**
 * Measured before → after for the scene: every scene model's original result,
 * then the same list with the fixed models' results swapped in. `resolved` /
 * `added` sum the run diff of each fixed model against its own original.
 * `guidRemapByModel` (from the export's GUID fixes) lets both sides name each
 * element the same way.
 */
export function measuredDelta(
  sceneModelIds: readonly string[],
  cachedByModel: Record<string, ValidationResult | undefined>,
  afterByModel: Record<string, ValidationResult | undefined>,
  muted: ReadonlySet<string>,
  guidRemapByModel: Record<string, GuidRemap | undefined> = {},
): FixSummary {
  const before: ValidationResult[] = []
  const after: ValidationResult[] = []
  let resolved = 0
  let added = 0
  let measured = false

  for (const id of sceneModelIds) {
    const original = cachedByModel[id]
    const raw = afterByModel[id]
    const fixed = raw ? withOriginalGuids(raw, guidRemapByModel[id]) : undefined
    if (original) before.push(original)
    const shown = fixed ?? original
    if (shown) after.push(shown)
    if (original && fixed) {
      measured = true
      const d = diffResults(
        { ...original, issues: unmuted(original, muted) },
        { ...fixed, issues: unmuted(fixed, muted) },
      )
      resolved += d.resolved
      added += d.added
    }
  }

  return {
    before: scoreOfResults(before, muted),
    after: scoreOfResults(after, muted),
    resolved,
    added,
    measured,
  }
}
