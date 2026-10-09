// ─── join ─────────────────────────────────────────────────────────────────────
// Geometry from one source, values from another, matched by a key — the
// shape of nearly every live city feed: a street-section network published
// once (Barcelona's 527 tramos) and a status table refreshed every five
// minutes (`tram#time#state#forecast`). Joined values become ordinary
// properties, so groups, legend, search and history need nothing special.
//
// Pure.

import { norm } from '../twin/twin-index'
import type { Table } from './csv'
import type { VectorLayerData } from './geojson'

export interface JoinSpec {
  /** Property of the layer's features holding the key ("Tram"). */
  layerKey: string
  /** Column of the table holding the same key ("tram"). */
  tableKey: string
  /** Columns to copy (default: all but the key). */
  columns?: string[]
}

export interface JoinResult {
  data: VectorLayerData
  matched: number
  /** Features with no row in the table (their joined fields are cleared). */
  unmatched: number
  /** Table rows with no feature — usually a newer network than the geometry. */
  orphanRows: number
}

const keyOf = (v: unknown): string => norm(String(v ?? '').trim()).replace(/^0+(?=\d)/, '')

/**
 * Copy table columns onto matching features. Keys compare as normalised text
 * with leading zeros ignored ("007" = "7" — feeds disagree about padding).
 * Features without a row get the columns as null, so a stale value from the
 * previous refresh never lingers on a section that stopped reporting.
 */
export function applyJoin(base: VectorLayerData, table: Table, spec: JoinSpec): JoinResult {
  const ki = table.columns.indexOf(spec.tableKey)
  if (ki < 0) return { data: base, matched: 0, unmatched: base.features.length, orphanRows: table.rows.length }
  const cols = (spec.columns ?? table.columns.filter((c) => c !== spec.tableKey))
    .map((c) => [c, table.columns.indexOf(c)] as const).filter(([, i]) => i >= 0)
  const byKey = new Map<string, string[]>()
  for (const r of table.rows) byKey.set(keyOf(r[ki]), r)
  const used = new Set<string>()
  let matched = 0
  const features = base.features.map((f) => {
    const k = keyOf(f.properties[spec.layerKey])
    const row = byKey.get(k)
    const props: Record<string, unknown> = { ...f.properties }
    for (const [c, i] of cols) {
      const raw = row?.[i]
      props[c] = raw === undefined || raw.trim() === '' ? null : /^-?\d+([.,]\d+)?$/.test(raw.trim()) ? Number(raw.replace(',', '.')) : raw.trim()
    }
    if (row) { matched++; used.add(k) }
    return { ...f, properties: props }
  })
  return {
    data: { ...base, features, propertyKeys: [...new Set([...base.propertyKeys, ...cols.map(([c]) => c)])].sort() },
    matched,
    unmatched: base.features.length - matched,
    orphanRows: [...byKey.keys()].filter((k) => !used.has(k)).length,
  }
}

/**
 * One feature per key ("043" = "43"), for geometry tables that repeat a place
 * per variable (ASPB lists each station once per pollutant it measures).
 * Attributes that differ between a place's rows describe the ROW, not the
 * place — the pollutant code — and would read as a fact about the station:
 * they are dropped.
 */
export function uniqueByKey(data: VectorLayerData, key: string): VectorLayerData {
  const norm = (v: unknown): string => String(v ?? '').trim().replace(/^0+(?=\d)/, '')
  const first = new Map<string, VectorLayerData['features'][number]>()
  const varying = new Set<string>()
  for (const f of data.features) {
    const k = norm(f.properties[key])
    const seen = first.get(k)
    if (!seen) { first.set(k, f); continue }
    for (const [p, v] of Object.entries(f.properties)) if (JSON.stringify(seen.properties[p]) !== JSON.stringify(v)) varying.add(p)
  }
  const features = [...first.values()].map((f) => (varying.size === 0 ? f : {
    ...f, properties: Object.fromEntries(Object.entries(f.properties).filter(([p]) => !varying.has(p))),
  }))
  return { ...data, features, propertyKeys: data.propertyKeys.filter((p) => !varying.has(p)) }
}
