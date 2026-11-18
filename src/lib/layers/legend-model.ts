// ─── legend-model ─────────────────────────────────────────────────────────────
// WHAT the data legend says, decided once — the on-screen legend (DataLegend)
// and the one painted into captures (legend-paint) both read this, so a PNG or
// a clip can never explain the scene differently from the screen it came from.
//
// Pure: no DOM, no three.js. Strings arrive already translated.

import { groupCounts, type ColorStop, type GroupStyle, type LayerStyle } from './style-groups'
import type { FlatProp } from '../twin/flatten-props'
import type { IconId } from './symbology'

export type LegendSwatch =
  | { kind: 'icon'; icon: IconId; color: string }
  | { kind: 'dot'; color: string }
  | { kind: 'line'; color: string; opacity: number }
  | { kind: 'area'; color: string; fill: number; outline: boolean }

export interface LegendRow {
  /** Group index in the layer style; -1 = "everything else". */
  groupIndex: number
  name: string
  count: number
  visible: boolean
  swatch: LegendSwatch
}

export interface LegendScale {
  caption: string
  stops: ColorStop[]
  /** End labels: values for hexagons, "less/more" for heatmaps. */
  lo: string
  hi: string
  opacity: number
}

export interface LegendLayer {
  id: string
  name: string
  live: boolean
  folded: boolean
  /** Present when the layer is drawn as its aggregate right now. */
  scale: LegendScale | null
  /** Groups that hold features (hidden ones included, flagged). */
  rows: LegendRow[]
  /** The layer also aggregates from farther away (hint on screen). */
  aggregatesFar: boolean
  /** Live layers: when the source produced the data shown ("data from 10:42"). */
  asOf: string | null
}

export interface LegendInput {
  id: string
  name: string
  live: boolean
  style: LayerStyle
  rows: FlatProp[][]
  kinds: { point: number; line: number; polygon: number }
  aggregateOn: boolean
  aggMin: number | null
  aggMax: number | null
  folded: boolean
  /** Live layers: source timestamp of the data on screen, ms. */
  dataAt?: number | null
}

export interface LegendStrings {
  rest: string
  density: string
  less: string
  more: string
  count: string
  fn: (fn: string) => string
  /** "data from 10:42" (or with the date when not today). */
  asOf?: (ms: number) => string
}

export function swatchOf(style: GroupStyle, kinds: LegendInput['kinds']): LegendSwatch {
  if (kinds.point > 0) {
    const s = style.point.symbol
    return s.kind === 'icon' ? { kind: 'icon', icon: s.icon, color: style.point.color } : { kind: 'dot', color: style.point.color }
  }
  if (kinds.line > 0 && kinds.polygon === 0) return { kind: 'line', color: style.line.color, opacity: style.line.opacity }
  return { kind: 'area', color: style.area.color, fill: Math.max(0.25, style.area.fillOpacity), outline: style.area.outline }
}

export function fmtValue(v: number): string {
  const a = Math.abs(v)
  return a >= 1000 ? Math.round(v).toLocaleString() : a >= 10 ? v.toFixed(0) : a >= 1 ? v.toFixed(1) : v.toFixed(2)
}

export function buildLegendLayer(i: LegendInput, str: LegendStrings): LegendLayer {
  const ls = i.style
  const a = ls.aggregate
  const showingAggregate = i.aggregateOn && a.kind !== 'none'
  let scale: LegendScale | null = null
  if (showingAggregate) {
    const stops = [...a.ramp].sort((x, y) => x.at - y.at)
    const lo = a.absolute ? stops[0]?.at ?? 0 : i.aggMin
    const hi = a.absolute ? stops[stops.length - 1]?.at ?? 1 : i.aggMax
    scale = {
      caption: a.kind === 'heatmap' ? str.density : a.field ? `${a.field} · ${str.fn(a.fn)}` : str.count,
      stops,
      lo: a.kind === 'heatmap' ? str.less : lo !== null ? fmtValue(lo) : '—',
      hi: a.kind === 'heatmap' ? str.more : hi !== null ? fmtValue(hi) : '—',
      opacity: a.opacity,
    }
  }
  const counts = groupCounts(i.rows, ls)
  const rows: LegendRow[] = [
    ...ls.groups.map((g, k) => ({ groupIndex: k, name: g.name, count: counts.byGroup[k], visible: g.visible, swatch: swatchOf(g.style, i.kinds) })),
    ...(counts.fallback > 0 || ls.groups.length === 0
      ? [{ groupIndex: -1, name: ls.groups.length ? str.rest : i.name, count: counts.fallback, visible: ls.fallback.visible, swatch: swatchOf(ls.fallback, i.kinds) }]
      : []),
  ].filter((r) => r.count > 0)
  return {
    id: i.id, name: i.name, live: i.live, folded: i.folded, scale, rows,
    aggregatesFar: !showingAggregate && a.kind !== 'none',
    asOf: i.live && i.dataAt && str.asOf ? str.asOf(i.dataAt) : null,
  }
}

/**
 * The captured version: only what a reader of the image needs. Hidden groups
 * and folded bodies are left out (on screen they stay, dimmed, so they can be
 * switched back on — in a PNG they are just noise).
 */
export function forCapture(layers: LegendLayer[], maxRows = 12): LegendLayer[] {
  return layers.map((l) => {
    const rows = l.folded ? [] : l.rows.filter((r) => r.visible)
    const more = rows.length - maxRows
    return {
      ...l,
      scale: l.folded ? null : l.scale,
      rows: more > 0 ? [...rows.slice(0, maxRows - 1), <LegendRow>{ groupIndex: -2, name: `+${more + 1}`, count: rows.slice(maxRows - 1).reduce((n, r) => n + r.count, 0), visible: true, swatch: { kind: 'dot' as const, color: '#888888' } }] : rows,
      aggregatesFar: false,
    }
  }).filter((l) => l.folded || l.scale || l.rows.length > 0)
}
