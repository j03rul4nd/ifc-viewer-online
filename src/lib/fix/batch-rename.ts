// ─── Batch rename for the two name rules ──────────────────────────────────────
// Turns the visible RULE_DUPLICATE_NAME / RULE_EMPTY_NAME issues into a plan of
// new names, then into editor commands (one per model, one undo step). Pure:
// the caller hands in the issues, trees and pending edits it already has.
//
// Uniqueness is checked model-wide and case-insensitively, which is stricter
// than the rule (per parent, case-sensitive). That way a generated name can
// never create or keep a duplicate, and no parent ids are needed to know it.

import type { EditDiff, EditorCommand, SpatialNode, ValidationIssue } from '../../types'
import { buildBatchRenameCommand } from '../diffStore'
import {
  counterPad, fillCounter, normName, renderStem, COUNTER_MARK,
  type ParsedPattern,
} from './name-pattern'
import { buildModelNameIndex, type ModelNameIndex } from './name-scope-index'
import type { PendingIndex } from './pending'

export type BatchRenameRule = 'RULE_DUPLICATE_NAME' | 'RULE_EMPTY_NAME'

export const BATCH_RENAME_RULES: ReadonlySet<string> = new Set<BatchRenameRule>([
  'RULE_DUPLICATE_NAME', 'RULE_EMPTY_NAME',
])

export function isBatchRenameRule(ruleId: string | undefined): ruleId is BatchRenameRule {
  return !!ruleId && BATCH_RENAME_RULES.has(ruleId)
}

export interface RenameItem {
  modelId: string
  expressId: number
  ifcClass: string
  /** The storey name `{storey}` used ('' when none). */
  storey: string
  oldValue: string
  newValue: string
  /** Took a higher number (or a `-n` suffix) than its turn to stay unique. */
  bumped: boolean
}

export interface BatchRenamePlan {
  ruleId: BatchRenameRule
  items: RenameItem[]
  byModel: Record<string, RenameItem[]>
  /** Elements renamed. Smaller than `cleared` when keep-first leaves one name per group. */
  renamed: number
  /** Issues the plan clears. */
  cleared: number
  /** fixIssueKey of every cleared issue. */
  clearedKeys: Set<string>
  /** Targets left out because the element already has a pending Name edit. */
  skippedEdited: number
  /** Renamed elements with no storey, when the pattern uses `{storey}`. */
  noStorey: number
  bumped: number
  /** False when some target issue lacks `scopeId` (an older or cached run). */
  keepFirstAvailable: boolean
  /** Models with targets but no spatial tree yet (not an empty one): Apply must stay blocked. */
  missingTree: string[]
}

/**
 * An issue's identity across runs — the same key validation-diff uses, so a
 * predicted "cleared" lines up with what the measured run diff reports.
 */
export function fixIssueKey(i: Pick<ValidationIssue, 'modelId' | 'ruleId' | 'globalId' | 'expressId'>): string {
  return `${i.modelId ?? ''}::${i.ruleId}::${i.globalId ?? `e${i.expressId}`}`
}

const resolveModel = (i: ValidationIssue, fallback?: string): string | undefined => i.modelId ?? fallback

/** The issues a batch would act on: the rule's visible issues, minus the elements already renamed by hand. */
function selectTargets(
  issues: readonly ValidationIssue[],
  ruleId: BatchRenameRule,
  pending: PendingIndex,
  modelFilter: string | null | undefined,
  fallbackModelId: string | undefined,
): { targets: ValidationIssue[]; skippedEdited: number } {
  const targets: ValidationIssue[] = []
  let skippedEdited = 0
  for (const i of issues) {
    if (i.ruleId !== ruleId) continue
    // Same test as the panel's model filter, so the count matches the list.
    if (modelFilter && i.modelId !== modelFilter) continue
    if (pending.hasName(resolveModel(i, fallbackModelId), i.expressId)) { skippedEdited++; continue }
    targets.push(i)
  }
  return { targets, skippedEdited }
}

/**
 * The N on "Fix all N": visible issues of the rule (within the model filter)
 * that are not already renamed by hand. Equal to `planBatchRename(...).cleared`.
 */
export function countBatchTargets(
  issues: readonly ValidationIssue[],
  ruleId: BatchRenameRule,
  pending: PendingIndex,
  modelFilter?: string | null,
  fallbackModelId?: string,
): number {
  return selectTargets(issues, ruleId, pending, modelFilter, fallbackModelId).targets.length
}

/** Order of renaming, so `{storey}` sees a storey's NEW name: storeys first, then spaces, then the rest. */
function passOf(ifcClass: string): number {
  if (/^ifc(site|building|buildingstorey)$/i.test(ifcClass)) return 0
  if (/^ifcspace$/i.test(ifcClass)) return 1
  return 2
}

/** Classes `{storey}` is empty for by definition — they are, or sit above, the storey. */
const ABOVE_STOREY = /^ifc(site|building|buildingstorey)$/i

const EMPTY_NAMES: ReadonlyMap<number, string> = new Map()

export interface PlanBatchRenameInput {
  ruleId: BatchRenameRule
  pattern: ParsedPattern
  /** DUPLICATE_NAME: leave one member of each group as it is. Ignored for EMPTY_NAME. */
  keepFirst: boolean
  /** The VISIBLE issues (waivers applied), all scene models pooled. */
  issues: readonly ValidationIssue[]
  modelFilter?: string | null
  /** modelId → spatial tree (useValidationStore.spatialTrees). */
  trees: Record<string, SpatialNode[] | undefined>
  /** modelId → pending Name renames (pendingNamesForModel). */
  pendingNamesByModel: Record<string, ReadonlyMap<number, string> | undefined>
  pending: PendingIndex
  /** Model for issues that carry no modelId (activeValidationModelId). */
  fallbackModelId?: string
  /**
   * Issues of the rule that are NOT targets but whose elements keep their
   * names — the muted ones. A duplicate group with such a member keeps no
   * target: the muted member already holds the name, so keeping a second one
   * would leave the duplicate in place.
   */
  heldIssues?: readonly ValidationIssue[]
}

export function planBatchRename(input: PlanBatchRenameInput): BatchRenamePlan {
  const { ruleId, pattern, issues, modelFilter, trees, pendingNamesByModel, pending, fallbackModelId } = input
  const { targets: selected, skippedEdited } = selectTargets(issues, ruleId, pending, modelFilter, fallbackModelId)

  // Models without a tree cannot be planned: no storey, no list of taken names.
  // An EMPTY tree is different: the model was validated and has no spatial
  // structure (no IfcProject, no IfcSite), so every element is an orphan. That
  // plans fine — no storeys, and the same taken names an orphan gets anywhere
  // (the tree never lists orphans) — whereas blocking it would ask for a
  // re-validation that builds the same empty tree again.
  const missingTree: string[] = []
  const indexes = new Map<string, ModelNameIndex>()
  const targets: Array<{ issue: ValidationIssue; modelId: string }> = []
  const seen = new Set<string>()
  for (const issue of selected) {
    const modelId = resolveModel(issue, fallbackModelId) ?? ''
    if (!indexes.has(modelId)) {
      const tree = modelId ? trees[modelId] : undefined
      if (!tree) {
        if (!missingTree.includes(modelId)) missingTree.push(modelId)
        continue
      }
      indexes.set(modelId, buildModelNameIndex(tree, pendingNamesByModel[modelId] ?? EMPTY_NAMES))
    }
    // One rename per element, however many issues point at it.
    const key = `${modelId}\u0001${issue.expressId}`
    if (seen.has(key)) continue
    seen.add(key)
    targets.push({ issue, modelId })
  }

  const clearedKeys = new Set<string>()
  let cleared = 0
  for (const issue of selected) {
    const modelId = resolveModel(issue, fallbackModelId) ?? ''
    if (!indexes.has(modelId)) continue
    clearedKeys.add(fixIssueKey(issue))
    cleared++
  }

  // ── Keep-first (DUPLICATE_NAME) ───────────────────────────────────────────
  const keepFirstAvailable = ruleId === 'RULE_DUPLICATE_NAME'
    && selected.length > 0
    && selected.every((i) => typeof i.scopeId === 'number')
  const kept = new Set<string>()
  if (ruleId === 'RULE_DUPLICATE_NAME' && input.keepFirst && keepFirstAvailable) {
    const groupKey = (modelId: string, i: ValidationIssue): string => `${modelId}\u0001${i.scopeId}\u0001${i.elementName}`
    const held = new Set<string>()
    for (const h of input.heldIssues ?? []) {
      if (h.ruleId !== ruleId || typeof h.scopeId !== 'number') continue
      const modelId = resolveModel(h, fallbackModelId) ?? ''
      if (pending.hasName(modelId || undefined, h.expressId)) continue // renamed by hand: no longer holds it
      held.add(groupKey(modelId, h))
    }
    const first = new Map<string, number>()
    for (const { issue, modelId } of targets) {
      const g = groupKey(modelId, issue)
      if (held.has(g)) continue
      const best = first.get(g)
      if (best === undefined || issue.expressId < best) first.set(g, issue.expressId)
    }
    for (const [g, expressId] of first) kept.add(`${g.split('\u0001')[0]}\u0001${expressId}`)
  }

  // ── Assign names ──────────────────────────────────────────────────────────
  const toRename = targets
    .filter(({ issue, modelId }) => !kept.has(`${modelId}\u0001${issue.expressId}`))
    .sort((a, b) =>
      passOf(a.issue.ifcClass) - passOf(b.issue.ifcClass)
      || (a.modelId < b.modelId ? -1 : a.modelId > b.modelId ? 1 : 0)
      || a.issue.expressId - b.issue.expressId)

  const pad = counterPad(pattern)
  const usesStorey = pattern.tokens.includes('storey')
  const nextByModel = new Map<string, Map<string, number>>()
  const newNameByModel = new Map<string, Map<number, string>>()
  const items: RenameItem[] = []
  let noStorey = 0
  let bumpedCount = 0

  for (const { issue, modelId } of toRename) {
    const idx = indexes.get(modelId)!
    let next = nextByModel.get(modelId)
    if (!next) nextByModel.set(modelId, (next = new Map()))
    let renamedHere = newNameByModel.get(modelId)
    if (!renamedHere) newNameByModel.set(modelId, (renamedHere = new Map()))

    // Storey name: this batch's new name, else the pending one, else the tree's.
    const storeyId = ABOVE_STOREY.test(issue.ifcClass) ? undefined : idx.storeyOf.get(issue.expressId)
    const storey = storeyId === undefined
      ? ''
      : (renamedHere.get(storeyId) ?? idx.nameOf.get(storeyId) ?? '').trim()
    if (usesStorey && storeyId === undefined && !ABOVE_STOREY.test(issue.ifcClass)) noStorey++

    const isEmptyRule = ruleId === 'RULE_EMPTY_NAME'
    const name = isEmptyRule ? '' : issue.elementName
    const stem = renderStem(pattern, { ifcClass: issue.ifcClass, storey, name })
    const hasMark = stem.includes(COUNTER_MARK)

    let n = next.get(stem) ?? 1
    let candidate = fillCounter(stem, n, pad)
    let skipped = false
    while (idx.taken.has(normName(candidate))) {
      n++
      skipped = true
      candidate = fillCounter(stem, n, pad)
    }
    next.set(stem, n + 1)
    idx.taken.add(normName(candidate))
    renamedHere.set(issue.expressId, candidate)

    // Without a counter in the pattern, any number at all is a bump.
    const bumped = skipped || (!hasMark && n > 1)
    if (bumped) bumpedCount++

    const treeName = idx.nameOf.get(issue.expressId)
    items.push({
      modelId,
      expressId: issue.expressId,
      ifcClass: issue.ifcClass,
      storey,
      // EMPTY_NAME: there was nothing (the issue's '(empty)' is a label, not a
      // value). DUPLICATE_NAME: the raw tree name keeps any spaces for undo.
      oldValue: isEmptyRule ? '' : (treeName || issue.elementName),
      newValue: candidate,
      bumped,
    })
  }

  const byModel: Record<string, RenameItem[]> = {}
  for (const item of items) (byModel[item.modelId] ??= []).push(item)

  return {
    ruleId,
    items,
    byModel,
    renamed: items.length,
    cleared,
    clearedKeys,
    skippedEdited,
    noStorey,
    bumped: bumpedCount,
    keepFirstAvailable,
    missingTree,
  }
}

const RULE_LABEL: Record<BatchRenameRule, string> = {
  RULE_DUPLICATE_NAME: 'duplicate names',
  RULE_EMPTY_NAME:     'empty names',
}

/** One command per model, all sharing `batchId`, so the batch undoes as one step. */
export function planToCommands(plan: BatchRenamePlan, batchId: string): EditorCommand[] {
  return Object.keys(plan.byModel).sort().map((modelId) => {
    const items = plan.byModel[modelId]
    const diffs: Extract<EditDiff, { type: 'RENAME' }>[] = items.map((it) => ({
      type: 'RENAME' as const, expressId: it.expressId, field: 'Name' as const, oldValue: it.oldValue, newValue: it.newValue,
    }))
    const description = `Rename ${items.length} element${items.length === 1 ? '' : 's'} (${RULE_LABEL[plan.ruleId]})`
    return buildBatchRenameCommand(diffs, modelId || undefined, batchId, description)
  })
}
