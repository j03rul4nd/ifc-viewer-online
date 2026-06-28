// ─── overlay-plan.ts ──────────────────────────────────────────────────────────
// Pure planners for the 3D highlight overlay (validation issues / IDS failures).
//
// The viewer paints overlay colours by calling `model.highlight(localIds, mat)`
// per loaded model. Deciding *which* element of *which* model gets *which*
// colour is pure data work — extracted here so it can be unit-tested without a
// WebGL context, and so the "does it recolour exactly the right elements?"
// guarantee is pinned by tests rather than living only inside the viewer closure.
//
// Both planners share the same element-eligibility rule, which is the crux of
// "it modifies what it should and nothing else":
//   • An issue/failure is attributed to its own `modelId`, falling back to the
//     active model (single-model / legacy results that predate the stamp).
//   • If that model isn't loaded (no type map) the row is dropped.
//   • If the row's `expressId` is not a known *geometry* element (it's absent
//     from the model's type map — e.g. a file-level issue, a pset/relation id,
//     or a synthetic spec-level row), it is dropped. This is what stops the
//     overlay from ever trying to recolour something that has no mesh.

import type { ValidationIssue } from '../types'

export type OverlaySeverity = ValidationIssue['severity'] // 'error' | 'warning' | 'info'

/** Local ids grouped by severity for a single model. */
export interface ValidationOverlayBuckets {
  error: number[]
  warning: number[]
  info: number[]
}

const SEVERITY_RANK: Record<OverlaySeverity, number> = { error: 3, warning: 2, info: 1 }

/** A model's type map: localId → upper-cased IFC class. Presence ⇒ real element. */
export type TypeMap = ReadonlyMap<number, string>

/** A single IDS spec failure pointing at an element (or a synthetic spec-level row). */
export interface IdsFailureRef {
  /** Element local id, or < 0 for a synthetic spec-level row (no element). */
  expressId: number
  /** Owning model; falls back to the active model when omitted. */
  modelId?: string | null
  /**
   * EIR severity for colouring (error/warning/info). Absent for plain IDS
   * failures — the controller paints those with the single idsFail colour.
   */
  severity?: OverlaySeverity
}

/**
 * Plan the validation overlay: per model, which local id gets which severity
 * colour. Mirrors the viewer's `setValidationHighlights` element selection.
 *
 * An element flagged by several issues collapses to its **highest** severity
 * (error > warning > info), so it gets a single deterministic colour instead of
 * flickering between overlapping `highlight()` calls.
 */
export function planValidationOverlay(
  issues: readonly ValidationIssue[],
  typeMaps: ReadonlyMap<string, TypeMap>,
  activeModelId: string | null,
): Map<string, ValidationOverlayBuckets> {
  const sevByModel = new Map<string, Map<number, OverlaySeverity>>()

  for (const issue of issues) {
    const mid = issue.modelId ?? activeModelId ?? ''
    const typeMap = mid ? typeMaps.get(mid) : undefined
    if (!typeMap || !typeMap.has(issue.expressId)) continue

    let perModel = sevByModel.get(mid)
    if (!perModel) { perModel = new Map(); sevByModel.set(mid, perModel) }

    const prev = perModel.get(issue.expressId)
    if (!prev || SEVERITY_RANK[issue.severity] > SEVERITY_RANK[prev]) {
      perModel.set(issue.expressId, issue.severity)
    }
  }

  const plan = new Map<string, ValidationOverlayBuckets>()
  for (const [mid, perModel] of sevByModel) {
    const buckets: ValidationOverlayBuckets = { error: [], warning: [], info: [] }
    for (const [eid, sev] of perModel) buckets[sev].push(eid)
    plan.set(mid, buckets)
  }
  return plan
}

/**
 * Plan the IDS-failure overlay: per model, each failing element local id mapped
 * to its EIR severity (or `null` for a plain IDS failure with no severity — the
 * controller paints those with the single idsFail colour). Mirrors the viewer's
 * `setIdsHighlights`.
 *
 * Synthetic spec-level rows (negative `expressId`) carry no element and are
 * skipped, as are ids absent from the model's type map. An element that fails
 * several specs collapses to its **highest** severity (error > warning > info >
 * none), so it gets a single deterministic colour.
 */
export function planIdsOverlay(
  failures: readonly IdsFailureRef[],
  typeMaps: ReadonlyMap<string, TypeMap>,
  activeModelId: string | null,
): Map<string, Map<number, OverlaySeverity | null>> {
  const byModel = new Map<string, Map<number, OverlaySeverity | null>>()
  const rank = (s: OverlaySeverity | null): number => (s ? SEVERITY_RANK[s] : 0)

  for (const f of failures) {
    if (f.expressId < 0) continue
    const mid = f.modelId ?? activeModelId ?? ''
    const typeMap = mid ? typeMaps.get(mid) : undefined
    if (!typeMap || !typeMap.has(f.expressId)) continue

    let perModel = byModel.get(mid)
    if (!perModel) { perModel = new Map(); byModel.set(mid, perModel) }

    const incoming = f.severity ?? null
    if (!perModel.has(f.expressId) || rank(incoming) > rank(perModel.get(f.expressId) ?? null)) {
      perModel.set(f.expressId, incoming)
    }
  }

  return byModel
}

/**
 * The elements of one model to **ghost** in isolate-issues mode: every element in
 * the model's type map that is *not* a kept (flagged) id. Pure so the "ghost
 * exactly the non-flagged elements, and nothing that has no mesh" guarantee is
 * tested. The kept ids are excluded even if (defensively) some aren't in the map.
 */
export function planOverlayGhost(typeMap: TypeMap, keepIds: Iterable<number>): number[] {
  const keep = keepIds instanceof Set ? keepIds : new Set<number>(keepIds)
  const ghost: number[] = []
  for (const id of typeMap.keys()) if (!keep.has(id)) ghost.push(id)
  return ghost
}
