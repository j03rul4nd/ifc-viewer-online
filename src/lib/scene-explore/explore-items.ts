// ─── explore-items ────────────────────────────────────────────────────────────
// What the scene explorer lists under "Explore": every live binding of the
// twin — with its value and the colour of the rule it matches, exactly as its
// floating label shows it — and every model of the scene.
//
// Pure: bindings and readings in, rows out. The camera move and the element
// lookup happen in the component, on click.

import { bindingState, deviceKey, metricOf, type Binding, type Reading } from '../twin/devices'

export interface BindingItem {
  kind: 'binding'
  id: string
  name: string
  /** The labelled metric, formatted; null when the binding has no label or no reading. */
  value: string | null
  /** Colour of the rule it matches (or of "stale"); null = none. */
  color: string | null
  /** live = a reading within its freshness limit; stale = an old one; nodata = none yet. */
  state: 'live' | 'stale' | 'nodata'
  /** Name of the rule matched, e.g. "Doors open — boarding". */
  ruleName: string | null
}

export interface ModelItem {
  kind: 'model'
  id: string
  name: string
}

/** A metric as a label shows it: one decimal under 100, none above. */
export function formatMetric(v: unknown): string {
  if (typeof v === 'number') return Math.abs(v) >= 100 ? v.toFixed(0) : String(Math.round(v * 10) / 10)
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
}

const ORDER: Record<BindingItem['state'], number> = { live: 0, stale: 1, nodata: 2 }

/** The twin's bindings as rows: live ones first, then stale, then waiting; by name within each. */
export function bindingItems(bindings: readonly Binding[], readings: ReadonlyMap<string, Reading>, now: number): BindingItem[] {
  const rows = bindings.map((b): BindingItem => {
    const reading = readings.get(deviceKey(b.sourceId, b.deviceId))
    const st = bindingState(b, reading, now)
    const value = reading && b.label?.field ? formatMetric(metricOf(reading, b.label.field)) : null
    if (st.kind === 'rule') return { kind: 'binding', id: b.id, name: b.name, value, color: st.rule.effect.color, state: 'live', ruleName: st.rule.name }
    if (st.kind === 'none') return { kind: 'binding', id: b.id, name: b.name, value, color: null, state: 'live', ruleName: null }
    return { kind: 'binding', id: b.id, name: b.name, value: st.kind === 'stale' ? value : null, color: b.staleColor, state: st.kind, ruleName: null }
  })
  return rows.sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.name.localeCompare(b.name))
}

/**
 * A file name as a person would say it: "catalunya-mobility-hub.ifc" →
 * "Catalunya mobility hub". A code is kept as it is: an ISO 19650 name like
 * "BCN-IVO-ZZ-XX-M3-A-0001" means something to the people who read it.
 */
export function prettyModelName(fileName: string): string {
  const base = fileName.replace(/\.(ifc|ifczip|ifcxml|frag)$/i, '')
  if (!/[-_]/.test(base) || !/[a-z]/.test(base)) return base
  const words = base.split(/[-_]+/).filter(Boolean).join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function modelItems(models: ReadonlyArray<{ id: string; fileName: string; visible?: boolean }>): ModelItem[] {
  return models
    .filter((m) => m.visible !== false)
    .map((m) => ({ kind: 'model' as const, id: m.id, name: prettyModelName(m.fileName) }))
}
