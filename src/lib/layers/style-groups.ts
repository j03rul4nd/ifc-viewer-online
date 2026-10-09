// ─── style-groups ─────────────────────────────────────────────────────────────
// How a layer LOOKS, as the user thinks about it: "these 80 are trains, those
// 20 are bikes; electric bikes green, the rest red". A layer is styled by an
// ordered list of GROUPS; each group is a set of conditions on the features'
// (flattened, nested) properties, and a style for each kind of geometry it may
// contain. The first group a feature matches styles it; the rest fall to the
// default group.
//
// Plus the two things that make thousands of features readable:
//   • ZOOM BANDS — like a web map, a feature is drawn in full (icon + label, or
//     its 3D model) up close, as an icon further out, as a coloured dot further
//     still, and not at all beyond that;
//   • AGGREGATION — from far away, a heatmap of density or hexagonal cells
//     coloured by a value (occupancy, traffic), instead of 5 000 overlapping pins.
//
// Pure: no three.js. Evaluated per feature by vector-runner; drawn by vector-mesh.

import { norm } from '../twin/twin-index'
import type { FlatProp } from '../twin/flatten-props'
import type { PointSymbol, Symbology } from './symbology'

// ── Conditions ─────────────────────────────────────────────────────────────────

export type FilterOp =
  | 'eq' | 'neq' | 'in' | 'notIn' | 'contains' | 'startsWith'
  | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'exists' | 'missing' | 'isTrue' | 'isFalse'

export interface Filter {
  /** Flat field path ("asset.type", "available_EFIT"). */
  field: string
  op: FilterOp
  /** One value (eq, contains, gt…), a list (in/notIn), or [min, max] (between). */
  value?: string | number | Array<string | number>
}

export interface PointStyle {
  symbol: PointSymbol
  color: string
  /** Icon/dot size, screen pixels for icons; metres for shapes and models. */
  size: number
  /** Field shown as a text label next to the symbol when close enough; null = none. */
  labelField: string | null
}

export interface LineStyle {
  color: string
  widthM: number
  /** 0..1 */
  opacity: number
  /**
   * Shift the line this many metres to the RIGHT of its direction of travel.
   * Two-way streets published as two opposite sections (Barcelona's tramos)
   * then show both directions side by side instead of on top of each other.
   */
  offsetM?: number
  /** Animated chevrons along the line, in its direction. */
  flow?: boolean
  /** Chevron speed, metres per second of animation (0 = still). */
  flowSpeed?: number
}

export interface AreaStyle {
  color: string
  /** Fill opacity 0..1 (0 = outline only). */
  fillOpacity: number
  outline: boolean
  /** Extrude by this many metres (0 = flat), or by a numeric field. */
  extrudeM: number
  heightField: string | null
}

export interface GroupStyle {
  point: PointStyle
  line: LineStyle
  area: AreaStyle
}

export interface StyleGroup {
  id: string
  name: string
  /** 'all' = every condition must hold; 'any' = one is enough. */
  match: 'all' | 'any'
  filters: Filter[]
  style: GroupStyle
  visible: boolean
}

// ── Zoom & aggregation ─────────────────────────────────────────────────────────

/**
 * Camera-distance bands, metres (scene units). Below `detailM` a point shows
 * its full symbol AND label (and 3D models); up to `iconM` the symbol alone;
 * up to `dotM` a small dot in the group colour; beyond, nothing.
 */
export interface ZoomBands {
  detailM: number
  iconM: number
  dotM: number
}

// dotM is generous on purpose: with a whole city framed obliquely, its far side
// is >12 km from the camera — a shorter default made a third of Bicing vanish.
export const DEFAULT_ZOOM: ZoomBands = { detailM: 250, iconM: 2500, dotM: 40_000 }

export type AggregateKind = 'none' | 'heatmap' | 'hexbin'
export type AggregateFn = 'count' | 'sum' | 'mean' | 'min' | 'max'

export interface ColorStop { at: number; color: string }

export interface Aggregation {
  kind: AggregateKind
  /** Numeric field to aggregate (null = count of features). */
  field: string | null
  fn: AggregateFn
  /** Hex cell size / heat radius, metres. */
  cellM: number
  /**
   * Colour ramp over the aggregated value. `at` is in VALUE units when
   * `absolute`, else 0..1 of the observed min..max.
   */
  ramp: ColorStop[]
  absolute: boolean
  /** Show the aggregate when the camera is FARTHER than this; points closer in. */
  fromM: number
  /** Extrude hex cells by value (0 = flat). Max height, metres. */
  extrudeM: number
  opacity: number
}

export const RAMPS: Record<string, ColorStop[]> = {
  // empty → filling → full (chargers, docks, parking)
  occupancy: [{ at: 0, color: '#2fb7ff' }, { at: 0.5, color: '#ffd23f' }, { at: 1, color: '#f25c54' }],
  // free-flowing → congested
  traffic: [{ at: 0, color: '#5ce27a' }, { at: 0.5, color: '#ffd23f' }, { at: 1, color: '#d7263d' }],
  // density heat
  heat: [{ at: 0, color: '#1b1f3b' }, { at: 0.35, color: '#7b2cbf' }, { at: 0.7, color: '#ff7a1a' }, { at: 1, color: '#fff1a8' }],
  // low → high, single hue
  blues: [{ at: 0, color: '#d6ecff' }, { at: 1, color: '#08306b' }],
}

export const NO_AGGREGATION: Aggregation = {
  kind: 'none', field: null, fn: 'count', cellM: 250, ramp: RAMPS.heat, absolute: false,
  fromM: 4000, extrudeM: 0, opacity: 0.75,
}

export interface LayerStyle {
  groups: StyleGroup[]
  /** Everything no group matched. */
  fallback: GroupStyle & { visible: boolean }
  zoom: ZoomBands
  aggregate: Aggregation
}

// ── Defaults ───────────────────────────────────────────────────────────────────

export function defaultGroupStyle(color: string): GroupStyle {
  return {
    point: { symbol: { kind: 'icon', icon: 'pin' }, color, size: 4, labelField: null },
    line: { color, widthM: 3, opacity: 1 },
    area: { color, fillOpacity: 0.35, outline: true, extrudeM: 0, heightField: null },
  }
}

export function defaultLayerStyle(color: string): LayerStyle {
  return {
    groups: [],
    fallback: { ...defaultGroupStyle(color), visible: true },
    zoom: { ...DEFAULT_ZOOM },
    aggregate: { ...NO_AGGREGATION },
  }
}

let seq = 0
export const newGroupId = (): string => `g${Date.now().toString(36)}${(seq++).toString(36)}`

// ── Evaluation ─────────────────────────────────────────────────────────────────

/** All values a feature has for a field (arrays of primitives yield each element). */
function valuesOf(props: FlatProp[], field: string): Array<string | number | boolean> {
  const out: Array<string | number | boolean> = []
  const stripped = field.replace(/\[\]/g, '')
  for (const p of props) {
    if (p.joined || p.value === null) continue
    if (p.field === field || p.field.replace(/\[\]/g, '') === stripped) out.push(p.value)
  }
  return out
}

const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : Number(String(v).replace(',', '.')))
const truthy = (v: unknown): boolean => {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  return /^(true|1|yes|si|sí|y|on|t|vrai|ja)$/i.test(String(v).trim())
}

export function testFilter(props: FlatProp[], f: Filter): boolean {
  const vals = valuesOf(props, f.field)
  switch (f.op) {
    case 'exists': return vals.length > 0
    case 'missing': return vals.length === 0
    case 'isTrue': return vals.some(truthy)
    case 'isFalse': return vals.length > 0 && !vals.some(truthy)
  }
  if (vals.length === 0) return f.op === 'neq' || f.op === 'notIn'
  const list = Array.isArray(f.value) ? f.value : f.value === undefined ? [] : [f.value]
  const keys = list.map((x) => norm(String(x)))
  const any = (pred: (v: string | number | boolean) => boolean): boolean => vals.some(pred)
  switch (f.op) {
    case 'eq': return any((v) => norm(String(v)) === keys[0])
    case 'neq': return !any((v) => norm(String(v)) === keys[0])
    case 'in': return any((v) => keys.includes(norm(String(v))))
    case 'notIn': return !any((v) => keys.includes(norm(String(v))))
    case 'contains': return any((v) => norm(String(v)).includes(keys[0] ?? ''))
    case 'startsWith': return any((v) => norm(String(v)).startsWith(keys[0] ?? ''))
    case 'gt': return any((v) => num(v) > num(list[0]))
    case 'gte': return any((v) => num(v) >= num(list[0]))
    case 'lt': return any((v) => num(v) < num(list[0]))
    case 'lte': return any((v) => num(v) <= num(list[0]))
    case 'between': return any((v) => num(v) >= num(list[0]) && num(v) <= num(list[1]))
    default: return false
  }
}

export function matchesGroup(props: FlatProp[], g: StyleGroup): boolean {
  if (g.filters.length === 0) return true
  return g.match === 'all' ? g.filters.every((f) => testFilter(props, f)) : g.filters.some((f) => testFilter(props, f))
}

/** Index of the group that styles a feature: 0..n-1, -1 = fallback. */
export function groupIndexOf(props: FlatProp[], style: LayerStyle): number {
  for (let i = 0; i < style.groups.length; i++) if (matchesGroup(props, style.groups[i])) return i
  return -1
}

export interface ResolvedStyle extends GroupStyle {
  groupIndex: number
  visible: boolean
}

export function resolveStyle(props: FlatProp[], style: LayerStyle): ResolvedStyle {
  const i = groupIndexOf(props, style)
  const g = i >= 0 ? style.groups[i] : null
  return { ...(g ? g.style : style.fallback), groupIndex: i, visible: g ? g.visible : style.fallback.visible }
}

/** How many features each group takes (index -1 → fallback), in priority order. */
export function groupCounts(rows: FlatProp[][], style: LayerStyle): { byGroup: number[]; fallback: number } {
  const byGroup = style.groups.map(() => 0)
  let fallback = 0
  for (const r of rows) {
    const i = groupIndexOf(r, style)
    if (i >= 0) byGroup[i]++; else fallback++
  }
  return { byGroup, fallback }
}

// ── Picking values (the "select the 80 trains" helper) ─────────────────────────

export interface ValueCount { value: string; count: number }

/** Distinct values of a field with how many features carry each, most common first. */
export function valueCounts(rows: FlatProp[][], field: string, max = 200): ValueCount[] {
  const m = new Map<string, ValueCount>()
  for (const r of rows) {
    const seen = new Set<string>()
    for (const v of valuesOf(r, field)) {
      const key = norm(String(v))
      if (seen.has(key)) continue
      seen.add(key)
      const c = m.get(key)
      if (c) c.count++; else m.set(key, { value: String(v), count: 1 })
    }
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)).slice(0, max)
}

/** Numeric range of a field, for "between" sliders and ramps. */
export function numericRange(rows: FlatProp[][], field: string): { min: number; max: number } | null {
  let min = Infinity, max = -Infinity
  for (const r of rows) for (const v of valuesOf(r, field)) {
    const n = num(v)
    if (Number.isFinite(n)) { if (n < min) min = n; if (n > max) max = n }
  }
  return Number.isFinite(min) ? { min, max } : null
}

// ── Migration from the first, single-field symbology ───────────────────────────


/** Each old rule becomes a group "field = value"; the old fallback the default. */
export function fromSymbology(s: Symbology, base: LayerStyle): LayerStyle {
  const toGroupStyle = (color: string, symbol: PointSymbol, size: number): GroupStyle => {
    const g = defaultGroupStyle(color)
    return { ...g, point: { ...g.point, symbol, size } }
  }
  return {
    ...base,
    groups: s.field
      ? s.rules.map((r) => ({
        id: newGroupId(), name: r.label ?? r.value, match: 'all' as const,
        filters: [{ field: s.field!, op: 'eq' as const, value: r.value }],
        style: toGroupStyle(r.color, r.symbol, r.sizeM), visible: r.visible,
      }))
      : [],
    fallback: { ...toGroupStyle(s.fallback.color, s.fallback.symbol, s.fallback.sizeM), visible: s.fallback.visible },
  }
}

// ── Colour ramps ───────────────────────────────────────────────────────────────

function hexToRgb(h: string): [number, number, number] {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(h.trim())
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255]
}

/** Colour of `t` along a ramp (stops sorted by `at`). */
export function rampColor(ramp: ColorStop[], t: number): [number, number, number] {
  if (ramp.length === 0) return [255, 255, 255]
  const stops = [...ramp].sort((a, b) => a.at - b.at)
  if (t <= stops[0].at) return hexToRgb(stops[0].color)
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].at) {
      const a = stops[i - 1], b = stops[i]
      const u = (t - a.at) / Math.max(1e-9, b.at - a.at)
      const ca = hexToRgb(a.color), cb = hexToRgb(b.color)
      return [0, 1, 2].map((k) => Math.round(ca[k] + (cb[k] - ca[k]) * u)) as [number, number, number]
    }
  }
  return hexToRgb(stops[stops.length - 1].color)
}

// ── Graduated classes (colour by a number) ─────────────────────────────────────

export type ClassMethod = 'quantile' | 'equal'

export interface NumericClass { lo: number; hi: number; count: number }

/**
 * Split a numeric field into up to `n` classes. Quantiles give each class a
 * similar number of features (good for skewed data: most stations have few
 * bikes); equal intervals keep the steps even (good for 0–100 %). Integer
 * data gets integer, non-overlapping bounds ("0 – 2", "3 – 10"). Empty or
 * duplicate classes are dropped, so n is a maximum.
 */
export function classBreaks(values: number[], n: number, method: ClassMethod): NumericClass[] {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (v.length === 0) return []
  const ints = v.every((x) => Number.isInteger(x))
  const min = v[0], max = v[v.length - 1]
  if (min === max) return [{ lo: min, hi: max, count: v.length }]
  const k = Math.max(2, Math.min(7, Math.round(n)))
  const cuts: number[] = []
  for (let i = 1; i < k; i++) {
    const c = method === 'equal'
      ? min + ((max - min) * i) / k
      : v[Math.min(v.length - 1, Math.floor((v.length * i) / k))]
    cuts.push(ints ? Math.round(c) : c)
  }
  const bounds = [...new Set([min, ...cuts, max])].sort((x, y) => x - y)
  const out: NumericClass[] = []
  for (let i = 1; i < bounds.length; i++) {
    const last = i === bounds.length - 1
    // Integers: [lo, next cut − 1], so classes never share a value.
    // Decimals: [lo, hi), the last one closed.
    const lo = bounds[i - 1]
    const hi = ints && !last ? bounds[i] - 1 : bounds[i]
    if (hi < lo) continue
    const inside = (x: number): boolean => x >= lo && (ints || last ? x <= hi : x < hi)
    const count = v.filter(inside).length
    if (count > 0) out.push({ lo, hi, count })
  }
  return out
}

const fmtNum = (x: number): string => (Number.isInteger(x) ? String(x) : x.toFixed(Math.abs(x) < 10 ? 2 : 1))

/** Groups for a numeric field, coloured along a ramp (low → high, or reversed). */
export function graduatedGroups(field: string, classes: NumericClass[], ramp: ColorStop[], reverse = false): StyleGroup[] {
  return classes.map((c, i) => {
    const tt = classes.length === 1 ? 0.5 : i / (classes.length - 1)
    const [r, g, b] = rampColor(ramp, reverse ? 1 - tt : tt)
    const hex = `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`
    return {
      id: newGroupId(),
      name: c.lo === c.hi ? fmtNum(c.lo) : `${fmtNum(c.lo)} – ${fmtNum(c.hi)}`,
      match: 'all' as const,
      filters: [{ field, op: 'between' as const, value: [c.lo, c.hi] }],
      style: defaultGroupStyle(hex),
      visible: true,
    }
  })
}
