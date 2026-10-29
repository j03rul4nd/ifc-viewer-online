// ─── checks ───────────────────────────────────────────────────────────────────
// A measurement against a requirement: "corridor ≥ 1,20 m", "ramp ≤ 8 %",
// "headroom ≥ 2,10 m". Pure; values in SI (metres, m², degrees, percent) so a
// requirement keeps its meaning when the person switches the display to feet.
//
// Volume from area: an area item can carry a height (a slab thickness, an
// excavation depth, a room's clear height). volume = area × height — a prism,
// which is what a traced footprint means in takeoff. Kept here because it is
// one multiplication that must never be done in display units.

import type { CheckTarget, MeasureItem, Requirement } from './measure-types'
import { slopePercent } from './measure-math'

export type { CheckTarget, Requirement }

export type CheckStatus = 'pass' | 'fail' | 'na'

export interface CheckResult {
  status: CheckStatus
  /** The value actually compared (SI), null when the item has none for the target. */
  actual: number | null
  /** How far outside the requirement (SI, ≥ 0); 0 when it passes. */
  shortfall: number
}

/** Below this, rounding noise; a 1,1999 m corridor shown as "1,20" must not fail. */
const EPS = 1e-6

/** The value a requirement reads from an item, or null when it does not apply. */
export function checkedValue(item: MeasureItem, target: CheckTarget, extrusion: number | null = null): number | null {
  switch (target) {
    case 'value':
      return item.kind === 'point' ? null : item.value
    case 'slope':
      if (item.kind !== 'distance') return null
      return slopePercent(item.points[0], item.points[1])
    case 'height':
      if (item.kind === 'distance') return item.components.dz
      if (item.kind === 'point') return item.coords.z
      return null
    case 'volume':
      return item.kind === 'area' && extrusion !== null ? volumeOf(item.value, extrusion) : null
  }
}

export function evaluate(req: Requirement, actual: number | null): CheckResult {
  if (actual === null || !Number.isFinite(actual)) return { status: 'na', actual: null, shortfall: 0 }
  const lo = req.op === 'max' ? null : req.min
  const hi = req.op === 'min' ? null : req.max
  let shortfall = 0
  if (lo !== null && actual < lo - EPS) shortfall = lo - actual
  if (hi !== null && actual > hi + EPS) shortfall = actual - hi
  return { status: shortfall > 0 ? 'fail' : 'pass', actual, shortfall }
}

export function checkItem(item: MeasureItem, req: Requirement, extrusion: number | null = null): CheckResult {
  return evaluate(req, checkedValue(item, req.target, extrusion))
}

/** Prism volume; a negative height (digging down) still gives a positive volume. */
export function volumeOf(area: number, height: number): number {
  return Math.abs(area * height)
}

/** The targets that make sense for an item — the editor only offers these. */
export function targetsFor(item: MeasureItem, hasExtrusion: boolean): CheckTarget[] {
  switch (item.kind) {
    case 'distance': return ['value', 'height', 'slope']
    case 'path': return ['value']
    case 'area': return hasExtrusion ? ['value', 'volume'] : ['value']
    case 'angle': return ['value']
    case 'point': return ['height']
    case 'dimension': return ['value']
  }
}

/** Ready-made rules people reach for. Values SI. Kept short on purpose. */
export type RequirementPresetId = 'corridor' | 'door' | 'headroom' | 'ramp' | 'turning' | 'right'

export const REQUIREMENT_PRESETS: ReadonlyArray<{ id: RequirementPresetId; req: Requirement; kinds: readonly MeasureItem['kind'][] }> = [
  { id: 'corridor', req: { op: 'min', min: 1.2, max: null, target: 'value' }, kinds: ['distance'] },
  { id: 'door', req: { op: 'min', min: 0.8, max: null, target: 'value' }, kinds: ['distance'] },
  { id: 'headroom', req: { op: 'min', min: 2.1, max: null, target: 'height' }, kinds: ['distance'] },
  { id: 'ramp', req: { op: 'max', min: null, max: 8, target: 'slope' }, kinds: ['distance'] },
  { id: 'turning', req: { op: 'min', min: 1.5, max: null, target: 'value' }, kinds: ['distance'] },
  { id: 'right', req: { op: 'range', min: 89.5, max: 90.5, target: 'value' }, kinds: ['angle'] },
]
