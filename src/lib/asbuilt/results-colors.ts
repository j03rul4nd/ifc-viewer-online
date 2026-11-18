// ─── As-Built results → viewer paint / isolate (T-406) ────────────────────────
// Painting goes through the viewer's twin-paint channel (cached fragment
// material definitions, diffed, cleared with null) and isolating through
// isolateElements — no materials or hide mechanism of our own to leak.

import { ERROR_MULTIPLE, type ElementDeviation, type ElementState } from './as-built-score'

export const ASBUILT_COLORS = {
  conforming: '#30a46c',
  deviated: '#f5a623',
  severe: '#e5484d',
  missing: '#e5484d',
  unobserved: '#8b8d98',
} as const

/** Paint key for one element ("#rrggbb:opacity"); null leaves it as modelled. */
export function asBuiltColorKey(e: ElementDeviation, toleranceM: number | null): string {
  const s: ElementState = e.state
  switch (s) {
    case 'conforming': return `${ASBUILT_COLORS.conforming}:1`
    case 'missing': return `${ASBUILT_COLORS.missing}:1`
    case 'deviated': {
      const severe = toleranceM !== null && e.deviationP95 !== null && e.deviationP95 > ERROR_MULTIPLE * toleranceM
      return `${severe ? ASBUILT_COLORS.severe : ASBUILT_COLORS.deviated}:1`
    }
    case 'occluded':
    case 'unobserved': return `${ASBUILT_COLORS.unobserved}:1`
  }
}

export interface PaintPlan { paint: Map<string, Map<number, string>>; hidden: Map<string, Set<number>> }

export function asBuiltPaintPlan(modelId: string, elements: readonly ElementDeviation[], toleranceM: number | null): PaintPlan {
  const m = new Map<number, string>()
  for (const e of elements) m.set(e.id, asBuiltColorKey(e, toleranceM))
  return { paint: new Map([[modelId, m]]), hidden: new Map() }
}

/** Targets for "isolate deviated + missing". */
export function asBuiltIsolateTargets(modelId: string, elements: readonly ElementDeviation[]): Array<{ expressId: number; modelId: string }> {
  return elements.filter((e) => e.state === 'deviated' || e.state === 'missing').map((e) => ({ expressId: e.id, modelId }))
}

export interface AsBuiltViewView {
  setTwinPaint(plan: PaintPlan | null): Promise<void>
  isolateElements(targets: Array<{ expressId: number; modelId?: string | null }>, enabled: boolean): void
}

/** Owns what the panel painted/isolated so clear() restores exactly once. */
export function createAsBuiltView(viewer: AsBuiltViewView) {
  let painted = false
  let isolated = false
  return {
    get painted() { return painted },
    get isolated() { return isolated },
    paint(plan: PaintPlan): void { painted = true; void viewer.setTwinPaint(plan) },
    isolate(targets: Array<{ expressId: number; modelId: string }>): void {
      isolated = targets.length > 0
      viewer.isolateElements(targets, isolated)
    },
    clear(): void {
      if (painted) { painted = false; void viewer.setTwinPaint(null) }
      if (isolated) { isolated = false; viewer.isolateElements([], false) }
    },
  }
}
export type AsBuiltView = ReturnType<typeof createAsBuiltView>
