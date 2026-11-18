// ─── Colour by progress ───────────────────────────────────────────────────────
// The viewer has no free per-element colour channel; the steel panel isolates,
// and the overlay channel paints three severities. Progress reuses both:
//   done → info colour, in progress → warning colour, not started → error colour,
//   untracked elements fall back to the ghost. Isolating a status uses
//   isolateElements, exactly like the steel takeoff rows.

import type { ValidationIssue } from '../../types'
import type { ViewerAPI } from '../viewer'
import type { ProgressState, ProgressStatus } from './progress'

export const PROGRESS_RULE_ID = 'site-progress'

export const PROGRESS_SEVERITY: Record<ProgressStatus, ValidationIssue['severity']> = {
  done: 'info', in_progress: 'warning', not_started: 'error',
}

/** Overlay entries for every tracked element (plain loop; called once per toggle). */
export function progressOverlay(state: ProgressState): ValidationIssue[] {
  const out: ValidationIssue[] = []
  for (const r of state.values()) {
    out.push({
      id: `${PROGRESS_RULE_ID}:${r.modelId}:${r.expressId}`, ruleId: PROGRESS_RULE_ID, severity: PROGRESS_SEVERITY[r.status],
      expressId: r.expressId, globalId: r.globalId, ifcClass: '', elementName: '', message: r.status,
      path: [], autoFixable: false, modelId: r.modelId,
    })
  }
  return out
}

export function applyProgressColors(viewer: ViewerAPI | null, state: ProgressState, enabled: boolean): void {
  if (!viewer) return
  try { viewer.setValidationHighlights(enabled ? progressOverlay(state) : [], enabled) } catch { /* viewer gone */ }
}

export function isolateStatus(viewer: ViewerAPI | null, state: ProgressState, status: ProgressStatus | null): void {
  if (!viewer) return
  if (status === null) { try { viewer.isolateElements([], false) } catch { /* viewer gone */ } return }
  const targets: Array<{ expressId: number; modelId: string }> = []
  for (const r of state.values()) if (r.status === status) targets.push({ expressId: r.expressId, modelId: r.modelId })
  try { viewer.isolateElements(targets, true) } catch { /* viewer gone */ }
}
