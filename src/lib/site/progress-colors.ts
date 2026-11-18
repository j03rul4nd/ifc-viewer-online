// ─── Colour by progress ───────────────────────────────────────────────────────
// Same channel as the unit statuses (site-colors: fragments setColor, palette
// restored on clear), so only one site colouring is on at a time. Untracked
// elements keep the viewer's own colours. Isolating a status uses
// isolateElements, exactly like the steel takeoff rows.

import type { ViewerAPI } from '../viewer'
import type { ProgressState, ProgressStatus } from './progress'
import { clearSiteColors, paintSiteColors, toBatches, type ColorBatches, type SiteColorViewer } from './site-colors'

export const PROGRESS_COLORS: Record<ProgressStatus, string> = {
  done: '#3a9d5d', in_progress: '#d9a33a', not_started: '#d9534f',
}

/** modelId → colour → express IDs for every tracked element. Pure, one pass. */
export function progressBatches(state: ProgressState): ColorBatches {
  const items: Array<{ modelId: string; color: string; ids: number[] }> = []
  for (const r of state.values()) items.push({ modelId: r.modelId, color: PROGRESS_COLORS[r.status], ids: [r.expressId] })
  return toBatches(items)
}

/** Paints (enabled) or clears progress colours; turning it on turns unit colours off. */
export function applyProgressColors(viewer: SiteColorViewer | null, state: ProgressState, enabled: boolean): Promise<void> {
  if (!enabled) return clearSiteColors('progress')
  if (!viewer) return Promise.resolve()
  return paintSiteColors(viewer, 'progress', progressBatches(state))
}

export function isolateStatus(viewer: ViewerAPI | null, state: ProgressState, status: ProgressStatus | null): void {
  if (!viewer) return
  if (status === null) { try { viewer.isolateElements([], false) } catch { /* viewer gone */ } return }
  const targets: Array<{ expressId: number; modelId: string }> = []
  for (const r of state.values()) if (r.status === status) targets.push({ expressId: r.expressId, modelId: r.modelId })
  try { viewer.isolateElements(targets, true) } catch { /* viewer gone */ }
}
