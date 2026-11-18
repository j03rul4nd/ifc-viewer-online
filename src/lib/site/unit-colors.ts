// ─── unit status colours in 3D ────────────────────────────────────────────────
// Colour goes through the shared site channel (site-colors: fragments setColor,
// and the category palette restored on clear); isolation through
// ViewerAPI.isolateElements, like the steel takeoff panel.

import type { ViewerAPI } from '../viewer'
import type { Unit, UnitStatus } from './units'
import { clearSiteColors, paintSiteColors, toBatches, type ColorBatches, type SiteColorViewer } from './site-colors'

export const STATUS_COLORS: Record<UnitStatus, string> = {
  available: '#3fa66b',
  reserved: '#e0a526',
  sold: '#d9534f',
  in_works: '#6c7a89',
  delivered: '#3b7dd8',
  post_sale: '#9b59b6',
}

/** modelId → colour → express IDs. Pure. */
export function colorBatches(units: Unit[]): ColorBatches {
  return toBatches(units.map((u) => ({ modelId: u.modelId, color: STATUS_COLORS[u.status], ids: u.expressIds })))
}

/** Paints every unit by status (turns progress colouring off). */
export function applyUnitColors(viewer: SiteColorViewer, units: Unit[]): Promise<void> {
  return paintSiteColors(viewer, 'units', colorBatches(units))
}

/** Puts the viewer's default colours back if units are the ones painting. */
export function clearUnitColors(): Promise<void> {
  return clearSiteColors('units')
}

/** Shows only the given units (empty list or `enabled=false` shows everything). */
export function isolateUnits(viewer: ViewerAPI, units: Unit[], enabled = true): void {
  const targets = units.flatMap((u) => u.expressIds.map((expressId) => ({ expressId, modelId: u.modelId })))
  viewer.isolateElements(enabled ? targets : [], enabled && targets.length > 0)
}
