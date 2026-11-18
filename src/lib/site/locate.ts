// ─── Where a snag points in the model ─────────────────────────────────────────
// Pure: a snag location → the element to select/frame (by express ID, or by
// GlobalId through the element index), and the snags that can carry a 3D pin.

import type { ProgressElement } from './progress'
import type { Snag, SnagLocation } from './snags'

export interface LocateTarget { modelId: string; expressId: number }

export function locateTarget(
  loc: SnagLocation,
  elements: readonly Pick<ProgressElement, 'modelId' | 'expressId' | 'globalId'>[],
  fallbackModelId?: string,
): LocateTarget | null {
  if (loc.expressId !== undefined && Number.isFinite(loc.expressId)) {
    const modelId = loc.modelId ?? fallbackModelId
    return modelId ? { modelId, expressId: loc.expressId } : null
  }
  if (loc.globalId) {
    for (const e of elements) {
      if (e.globalId === loc.globalId && (!loc.modelId || e.modelId === loc.modelId)) return { modelId: e.modelId, expressId: e.expressId }
    }
  }
  return null
}

/** Snags that have a 3D point or an element to anchor a pin to. */
export function pinnableSnags(snags: readonly Snag[]): Snag[] {
  return snags.filter((s) => s.status !== 'closed' && (!!s.location.point || s.location.expressId !== undefined))
}
