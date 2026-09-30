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
