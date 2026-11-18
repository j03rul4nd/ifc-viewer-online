// ─── unit status colours in 3D ────────────────────────────────────────────────
// Colour goes through the fragments model's own setColor/resetColor (what the
// viewer's palette uses); isolation through ViewerAPI.isolateElements, like the
// steel takeoff panel.

import * as THREE from 'three'
import type { ViewerAPI } from '../viewer'
import type { Unit, UnitStatus } from './units'

export const STATUS_COLORS: Record<UnitStatus, string> = {
  available: '#3fa66b',
  reserved: '#e0a526',
  sold: '#d9534f',
  in_works: '#6c7a89',
  delivered: '#3b7dd8',
  post_sale: '#9b59b6',
}

interface ColorableModel {
  setColor(ids: number[] | undefined, color: THREE.Color): Promise<unknown>
  resetColor(ids: number[] | undefined): Promise<unknown>
}

/** modelId → colour → express IDs. Pure. */
export function colorBatches(units: Unit[]): Map<string, Map<string, number[]>> {
  const out = new Map<string, Map<string, number[]>>()
  for (const u of units) {
    const byColor = out.get(u.modelId) ?? new Map<string, number[]>()
    out.set(u.modelId, byColor)
    const hex = STATUS_COLORS[u.status]
    byColor.set(hex, [...(byColor.get(hex) ?? []), ...u.expressIds])
  }
  return out
}

function modelOf(viewer: ViewerAPI, modelId: string): ColorableModel | null {
  const m = viewer.getFragmentsModel(modelId) as Partial<ColorableModel> | null
  return m && typeof m.setColor === 'function' && typeof m.resetColor === 'function' ? (m as ColorableModel) : null
}

/** Paints every unit by status. Returns what was painted, for `clearUnitColors`. */
export async function applyUnitColors(viewer: ViewerAPI, units: Unit[]): Promise<Map<string, number[]>> {
  const painted = new Map<string, number[]>()
  for (const [modelId, byColor] of colorBatches(units)) {
    const model = modelOf(viewer, modelId)
    if (!model) continue
    const ids: number[] = []
    for (const [hex, list] of byColor) { await model.setColor(list, new THREE.Color(hex)); ids.push(...list) }
    painted.set(modelId, ids)
  }
  return painted
}

export async function clearUnitColors(viewer: ViewerAPI, painted: Map<string, number[]>): Promise<void> {
  for (const [modelId, ids] of painted) {
    try { await modelOf(viewer, modelId)?.resetColor(ids) } catch { /* model gone */ }
  }
}

/** Shows only the given units (empty list or `enabled=false` shows everything). */
export function isolateUnits(viewer: ViewerAPI, units: Unit[], enabled = true): void {
  const targets = units.flatMap((u) => u.expressIds.map((expressId) => ({ expressId, modelId: u.modelId })))
  viewer.isolateElements(enabled ? targets : [], enabled && targets.length > 0)
}
