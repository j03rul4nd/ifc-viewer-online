// ─── devices ──────────────────────────────────────────────────────────────────
// The pure half of the operational twin: device readings from any API, the
// bindings that tie a device to IFC elements, and the rules that turn a
// reading into what those elements look like.
//
// A DEVICE is whatever the API reports on: a meter, an inverter, an alarm
// panel, a parking bay, a camera. A SOURCE is one endpoint polled every few
// seconds; one response usually carries many devices. Readings are flattened
// (twin/flatten-props) so a rule can test "power.kw > 3" the same way a layer
// style tests a feature, with the same 15 operators (layers/style-groups).
//
// Elements are referenced by IFC GlobalId, never by express id: a GlobalId is
// stable across reloads, across versions of a file, and across the several
// files a project is split into. A binding is resolved against EVERY loaded
// model, so the same rule paints the element in whichever file it lives.

import { flattenProperties, type FlatProp } from './flatten-props'
import { testFilter, type Filter } from '../layers/style-groups'
import type { SpatialNode } from '../../types'

// ── Sources & readings ─────────────────────────────────────────────────────────

export interface DeviceMapping {
  /**
   * Where the device list lives in the response ("data.devices"). Empty = the
   * root. A list → one device per item; an object of objects → one device per
   * key; any other object → the whole response is ONE device.
   */
  listPath: string
  /** Field naming the device inside each item. Empty = the item's key / index. */
  idField: string
  /** Optional field with the reading's own timestamp (ISO or epoch s/ms). */
  timeField: string
}

export interface DeviceSource {
  id: string
  name: string
  /** http(s) URL, or `sim:<preset>` for the built-in simulator. */
  url: string
  intervalS: number
  mapping: DeviceMapping
  enabled: boolean
}

export type MetricValue = string | number | boolean | null

export interface Reading {
  sourceId: string
  deviceId: string
  /** Flattened metrics, ready for rules. */
  props: FlatProp[]
  /** When the SOURCE says it measured this (ms), else when we received it. */
  at: number
}

/** Key of a device across sources. */
export const deviceKey = (sourceId: string, deviceId: string): string => `${sourceId}/${deviceId}`

export const DEFAULT_MAPPING: DeviceMapping = { listPath: '', idField: '', timeField: '' }

function getPath(obj: unknown, path: string): unknown {
  if (!path.trim()) return obj
  let cur: unknown = obj
  for (const part of path.split('.').filter(Boolean)) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

export function parseTime(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e11 ? v * 1000 : v
  if (typeof v === 'string' && v.trim()) {
    if (/^\d+(\.\d+)?$/.test(v.trim())) return parseTime(Number(v))
    const t = Date.parse(v)
    return Number.isNaN(t) ? null : t
  }
  return null
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Turn one API response into readings. Never throws: an unusable body gives []. */
export function parseReadings(body: unknown, source: Pick<DeviceSource, 'id' | 'mapping'>, receivedAt: number): Reading[] {
  const { listPath, idField, timeField } = source.mapping
  const root = getPath(body, listPath)
  let items: Array<[string, unknown]>
  if (Array.isArray(root)) items = root.map((x, i) => [String(i), x])
  else if (isPlainObject(root) && Object.values(root).length > 0 && Object.values(root).every(isPlainObject) && !idField) {
    items = Object.entries(root)
  } else if (isPlainObject(root)) items = [['device', root]]
  else return []

  const out: Reading[] = []
  for (const [fallbackId, item] of items) {
    if (!isPlainObject(item)) continue
    const rawId = idField ? getPath(item, idField) : undefined
    const deviceId = rawId === undefined || rawId === null || rawId === '' ? fallbackId : String(rawId)
    const at = (timeField ? parseTime(getPath(item, timeField)) : null) ?? receivedAt
    out.push({ sourceId: source.id, deviceId, props: flattenProperties(item), at })
  }
  return out
}

/** Numeric/text value of one metric field in a reading. */
export function metricOf(r: Reading, field: string): MetricValue {
  return r.props.find((p) => p.field === field && !p.joined)?.value ?? null
}

// ── Bindings & rules ──────────────────────────────────────────────────────────

export interface ElementRef {
  globalId: string
  /** Shown when the element is not loaded right now. */
  label: string
}

export interface TwinEffect {
  /** Paint colour (#rrggbb); null = keep the element's own colour. */
  color: string | null
  /** 0.05..1 */
  opacity: number
  hide: boolean
}

export interface TwinRule {
  id: string
  name: string
  match: 'all' | 'any'
  filters: Filter[]
  effect: TwinEffect
}

export interface Binding {
  id: string
  name: string
  sourceId: string
  deviceId: string
  targets: ElementRef[]
  /** Checked in order; the first that matches paints the targets. */
  rules: TwinRule[]
  /** Paint this when the device has not reported for `staleAfterS` (null = leave as is). */
  staleColor: string | null
  /** Seconds without a reading before the device counts as stale (0 = never). */
  staleAfterS: number
}

let seq = 0
export const newTwinId = (prefix: string): string => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`

export function ruleMatches(props: FlatProp[], r: TwinRule): boolean {
  if (r.filters.length === 0) return true
  return r.match === 'all' ? r.filters.every((f) => testFilter(props, f)) : r.filters.some((f) => testFilter(props, f))
}

export type BindingState =
  | { kind: 'nodata' }
  | { kind: 'stale'; reading: Reading }
  | { kind: 'rule'; reading: Reading; rule: TwinRule }
  | { kind: 'none'; reading: Reading }

export function bindingState(b: Binding, reading: Reading | undefined, now: number): BindingState {
  if (!reading) return { kind: 'nodata' }
  if (b.staleAfterS > 0 && now - reading.at > b.staleAfterS * 1000) return { kind: 'stale', reading }
  const rule = b.rules.find((r) => ruleMatches(reading.props, r))
  return rule ? { kind: 'rule', reading, rule } : { kind: 'none', reading }
}

export function effectOf(b: Binding, s: BindingState): TwinEffect | null {
  if (s.kind === 'rule') return s.rule.effect
  if ((s.kind === 'stale' || s.kind === 'nodata') && b.staleColor) return { color: b.staleColor, opacity: 1, hide: false }
  return null
}

// ── GlobalId index (every loaded model) ───────────────────────────────────────

export interface ElementLoc { modelId: string; expressId: number }

/**
 * GlobalId → where it is, in every loaded model. A GlobalId may legitimately
 * appear in several models (two versions of the same file side by side): the
 * binding paints all of them.
 */
export function buildGuidIndex(trees: Record<string, SpatialNode[]>): Map<string, ElementLoc[]> {
  const index = new Map<string, ElementLoc[]>()
  const add = (guid: string, loc: ElementLoc): void => {
    if (!guid) return
    const list = index.get(guid)
    if (!list) { index.set(guid, [loc]); return }
    if (!list.some((l) => l.modelId === loc.modelId && l.expressId === loc.expressId)) list.push(loc)
  }
  for (const [modelId, roots] of Object.entries(trees)) {
    const visit = (n: SpatialNode): void => {
      add(n.globalId, { modelId, expressId: n.expressId })
      for (const e of n.containedElements) add(e.globalId, { modelId, expressId: e.expressId })
      n.children.forEach(visit)
    }
    roots.forEach(visit)
  }
  return index
}

// ── Paint plan ────────────────────────────────────────────────────────────────

export interface PaintPlan {
  /** modelId → expressId → material key "#rrggbb:opacity". */
  paint: Map<string, Map<number, string>>
  /** modelId → hidden expressIds. */
  hidden: Map<string, Set<number>>
  /** Bindings whose targets are not in any loaded model. */
  unresolved: string[]
}

export const materialKeyOf = (color: string, opacity: number): string =>
  `${color.toLowerCase()}:${Math.round(Math.max(0.05, Math.min(1, opacity)) * 100) / 100}`

export function parseMaterialKey(key: string): { color: string; opacity: number } {
  const [color, op] = key.split(':')
  return { color, opacity: Number(op) }
}

/**
 * What every loaded element should look like right now. When two bindings
 * reach one element, the EARLIER binding wins — the list order is the user's
 * priority, as with style groups.
 */
export function planPaint(
  bindings: Binding[],
  readings: Map<string, Reading>,
  guidIndex: Map<string, ElementLoc[]>,
  now: number,
): PaintPlan {
  const plan: PaintPlan = { paint: new Map(), hidden: new Map(), unresolved: [] }
  const claimed = new Set<string>()
  for (const b of bindings) {
    const locs = b.targets.flatMap((t) => guidIndex.get(t.globalId) ?? [])
    if (locs.length === 0) { if (b.targets.length > 0) plan.unresolved.push(b.id); continue }
    const effect = effectOf(b, bindingState(b, readings.get(deviceKey(b.sourceId, b.deviceId)), now))
    if (!effect) continue
    for (const { modelId, expressId } of locs) {
      const k = `${modelId}#${expressId}`
      if (claimed.has(k)) continue
      claimed.add(k)
      if (effect.hide) {
        let set = plan.hidden.get(modelId)
        if (!set) plan.hidden.set(modelId, set = new Set())
        set.add(expressId)
      } else if (effect.color || effect.opacity < 1) {
        let m = plan.paint.get(modelId)
        if (!m) plan.paint.set(modelId, m = new Map())
        m.set(expressId, materialKeyOf(effect.color ?? '#cccccc', effect.opacity))
      }
    }
  }
  return plan
}

/** Readings that reach an element, for the inspector's live section. */
export function readingsForElement(
  globalId: string,
  bindings: Binding[],
  readings: Map<string, Reading>,
): Array<{ binding: Binding; reading: Reading | undefined }> {
  return bindings
    .filter((b) => b.targets.some((t) => t.globalId === globalId))
    .map((binding) => ({ binding, reading: readings.get(deviceKey(binding.sourceId, binding.deviceId)) }))
}

/** Same reading as last time? (props compared by value) — skips needless repaints. */
export function sameReading(a: Reading | undefined, b: Reading): boolean {
  if (!a || a.at !== b.at || a.props.length !== b.props.length) return false
  for (let i = 0; i < a.props.length; i++) {
    if (a.props[i].path !== b.props[i].path || a.props[i].value !== b.props[i].value) return false
  }
  return true
}
