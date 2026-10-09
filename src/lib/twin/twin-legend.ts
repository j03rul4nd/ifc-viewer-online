// ─── twin-legend ──────────────────────────────────────────────────────────────
// The operational twin as a block of the data legend: what each colour on the
// building MEANS ("red = Occupied, 12 · green = Free, 18"), built as a regular
// LegendLayer so the on-screen legend and the one painted into captures stay
// one model (layers/legend-model) — a PNG of the building explains its colours.
//
// Pure: strings arrive translated.

import type { LegendLayer, LegendRow } from '../layers/legend-model'
import { deviceKey, type Binding, type Reading } from './devices'
import { stateSummary } from './series'

export const TWIN_LEGEND_ID = 'twin:devices'

const NEUTRAL = '#8a93a3'

export interface TwinLegendStrings {
  title: string
  stale: string
  nodata: string
  /** "data from 10:42" */
  asOf?: (ms: number) => string
}

/**
 * One row per state that CHANGES how elements look (a rule with a colour, a
 * hide, a grey for missing data). "No rule" leaves the element as modelled,
 * so it has nothing to explain and is left out. Null when there is nothing.
 */
export function twinLegendLayer(
  bindings: Binding[], readings: Map<string, Reading>, now: number,
  str: TwinLegendStrings, folded: boolean,
): LegendLayer | null {
  const hides = new Set(bindings.flatMap((b) => b.rules.filter((r) => r.effect.hide).map((r) => r.name)))
  const summary = stateSummary(bindings, readings, now, { stale: str.stale, nodata: str.nodata, none: '' })
  const rows: LegendRow[] = summary
    .filter((c) => c.key !== 'none' && (c.color || hides.has(c.label)))
    .map((c, i) => ({
      groupIndex: i,
      name: c.label,
      count: c.bindings,
      visible: true,
      // Elements are painted solids: an area tile, like a zone layer's.
      swatch: c.color
        ? { kind: 'area' as const, color: c.color, fill: 1, outline: false }
        : { kind: 'area' as const, color: NEUTRAL, fill: 0.25, outline: true },
    }))
  if (rows.length === 0) return null
  let latest = 0
  for (const b of bindings) {
    const r = readings.get(deviceKey(b.sourceId, b.deviceId))
    if (r && r.at > latest) latest = r.at
  }
  return {
    id: TWIN_LEGEND_ID,
    name: str.title,
    live: true,
    folded,
    scale: null,
    rows,
    aggregatesFar: false,
    asOf: latest && str.asOf ? str.asOf(latest) : null,
  }
}
