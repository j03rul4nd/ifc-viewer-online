// ─── compare/overlay.ts ───────────────────────────────────────────────────────
// Diff → the 3D overlay. The viewer already has a tested overlay channel that
// paints elements in three colours and ghosts the rest (validation issues);
// a version diff maps onto it without a new rendering path:
//   removed  → error   (red)   — only visible when the OLD version is loaded
//   modified → warning (amber)
//   added    → info    (blue)
// The OverlayHud then gives next/previous navigation through the changes for free.

import type { ValidationIssue } from '../../types'
import type { ElementDiff, SetDiff } from './types'

const SEVERITY: Record<Exclude<ElementDiff['status'], 'unchanged'>, ValidationIssue['severity']> = {
  removed: 'error', modified: 'warning', added: 'info',
}

/** Where a diff element can be shown: model id + express id, or null. */
export function locateInScene(
  e: ElementDiff,
  headModels: Record<string, string>,
  baseModels: Record<string, string>,
): { modelId: string; expressId: number } | null {
  if (e.status !== 'removed' && e.headFile && e.headExpressId != null) {
    const modelId = headModels[e.headFile]
    if (modelId) return { modelId, expressId: e.headExpressId }
  }
  if (e.baseFile && e.baseExpressId != null) {
    const modelId = baseModels[e.baseFile]
    if (modelId) return { modelId, expressId: e.baseExpressId }
  }
  return null
}

export function planCompareOverlay(
  diff: SetDiff,
  headModels: Record<string, string>,
  baseModels: Record<string, string>,
  statuses: ReadonlySet<ElementDiff['status']> = new Set(['added', 'removed', 'modified']),
): ValidationIssue[] {
  const out: ValidationIssue[] = []
  for (const e of diff.elements) {
    if (e.status === 'unchanged' || !statuses.has(e.status)) continue
    const at = locateInScene(e, headModels, baseModels)
    if (!at) continue
    out.push({
      id: `compare:${e.status}:${e.globalId}`,
      ruleId: `compare-${e.status}`,
      severity: SEVERITY[e.status],
      expressId: at.expressId,
      globalId: e.globalId,
      ifcClass: e.ifcClass,
      elementName: e.name ?? '',
      message: e.changes.map((c) => c.category).join(', '),
      path: e.storey ? [e.storey] : [],
      autoFixable: false,
      modelId: at.modelId,
    })
  }
  return out
}

// ── Revision compare (spec 10 M2) ────────────────────────────────────────────
// Five colours instead of three, and the old revision is in the scene too:
//   B (new) — changed elements in their kind colour, the rest ghosted;
//   A (old) — only removed elements (red ghost where they were) and the old
//             position of moved ones (blue ghost); everything else hidden.
// The overlay channel still does the ghosting; view-paint.ts lays the five
// kind colours on top and view-arrows.ts draws the move arrows.

export type RevisionPaintGroup = ColourGroupRef | 'movedFrom'
type ColourGroupRef = 'added' | 'removed' | 'moved' | 'reshaped' | 'properties'

export interface RevisionOverlayPlan {
  /** Feed to setValidationHighlights: flags what stays solid, ghosts the rest. */
  issues: ValidationIssue[]
  /** model id → group → local ids to repaint in the kind colour. */
  paint: Record<string, Partial<Record<RevisionPaintGroup, number[]>>>
  /** Old-revision models: the only items left visible (all others hidden). */
  keepVisibleA: Record<string, number[]>
  /** Moved elements: where they were (A) and where they are (B). */
  arrows: Array<{ globalId: string; from: { modelId: string; expressId: number }; to: { modelId: string; expressId: number } }>
}

const GROUP_OF: Record<string, ColourGroupRef> = {
  added: 'added', removed: 'removed', moved: 'moved', reshaped: 'reshaped', type_changed: 'reshaped',
  relations_changed: 'properties', properties_changed: 'properties',
}
const SEV_OF: Record<ColourGroupRef, ValidationIssue['severity']> = {
  removed: 'error', reshaped: 'warning', moved: 'info', added: 'info', properties: 'warning',
}

export function planRevisionOverlay(
  changes: ReadonlyArray<import('./revision-types').RevisionChange>,
  modelsB: Record<string, string>,
  modelsA: Record<string, string>,
): RevisionOverlayPlan {
  const plan: RevisionOverlayPlan = { issues: [], paint: {}, keepVisibleA: {}, arrows: [] }
  for (const id of Object.values(modelsA)) plan.keepVisibleA[id] = []
  const push = (modelId: string, group: RevisionPaintGroup, id: number): void => {
    const m = (plan.paint[modelId] ??= {})
    ;(m[group] ??= []).push(id)
  }
  const flag = (c: import('./revision-types').RevisionChange, modelId: string, expressId: number, group: ColourGroupRef): void => {
    plan.issues.push({
      id: `revision:${c.kind}:${c.globalId}:${modelId}`, ruleId: `revision-${c.kind}`, severity: SEV_OF[group],
      expressId, globalId: c.globalId, ifcClass: c.ifcClass, elementName: c.name ?? '', message: c.summary.key,
      path: c.storey ? [c.storey] : [], autoFixable: false, modelId,
    })
  }
  for (const c of changes) {
    if (c.kind === 'unchanged') continue
    const group = GROUP_OF[c.kind]
    const a = c.baseFile && c.baseExpressId != null ? modelsA[c.baseFile] : undefined
    const b = c.headFile && c.headExpressId != null ? modelsB[c.headFile] : undefined
    if (c.kind === 'removed') {
      if (a) { flag(c, a, c.baseExpressId!, group); push(a, 'removed', c.baseExpressId!); plan.keepVisibleA[a].push(c.baseExpressId!) }
      continue
    }
    if (b) { flag(c, b, c.headExpressId!, group); push(b, group, c.headExpressId!) }
    if (c.kind === 'moved' && a) {
      flag(c, a, c.baseExpressId!, group)
      push(a, 'movedFrom', c.baseExpressId!)
      plan.keepVisibleA[a].push(c.baseExpressId!)
      if (b) plan.arrows.push({ globalId: c.globalId, from: { modelId: a, expressId: c.baseExpressId! }, to: { modelId: b, expressId: c.headExpressId! } })
    }
  }
  return plan
}

/** Where a revision change is shown: the new element, or the old one when removed. */
export function locateRevision(
  c: import('./revision-types').RevisionChange,
  modelsB: Record<string, string>,
  modelsA: Record<string, string>,
): { modelId: string; expressId: number } | null {
  if (c.kind !== 'removed' && c.headFile && c.headExpressId != null && modelsB[c.headFile]) return { modelId: modelsB[c.headFile], expressId: c.headExpressId }
  if (c.baseFile && c.baseExpressId != null && modelsA[c.baseFile]) return { modelId: modelsA[c.baseFile], expressId: c.baseExpressId }
  return null
}
