// ─── site units: dwellings tied to the IFC model ──────────────────────────────
// A unit is an IfcZone that groups spaces (IfcRelAssignsToGroup) or, failing
// that, a single IfcSpace. Pure: the reading through fragments lives in
// collectUnits, which only feeds these functions (same split as lib/steel).

import { ITEM_DATA_CONFIG, parseItemData, type IFCQuantitySet } from '../ifc-item-data'

export const UNIT_STATUSES = ['available', 'reserved', 'sold', 'in_works', 'delivered', 'post_sale'] as const
export type UnitStatus = typeof UNIT_STATUSES[number]

export interface Unit {
  /** Stable across reloads: the GlobalId, else `~<storey>/<name>` (never the runtime model id). */
  id: string
  globalId: string | null
  expressIds: number[]
  modelId: string
  name: string
  storey: string | null
  /** m² (NetFloorArea → GrossFloorArea), null when the file has neither. */
  area: number | null
  status: UnitStatus
  buyer?: string
  notes?: string
  /** Names of the IfcSpace children (rooms) when the unit is a zone. */
  rooms?: string[]
}

/** A space as read from the model (already parsed). */
export interface SpaceRecord {
  expressId: number
  globalId: string | null
  name: string | null
  longName: string | null
  storey: string | null
  quantitySets: IFCQuantitySet[]
}

export interface ZoneRecord {
  expressId: number
  globalId: string | null
  name: string | null
  longName: string | null
  /** express IDs of the spaces the zone groups. */
  memberIds: number[]
}

/** Persisted per-unit data (status, buyer, notes), keyed by Unit.id. */
export interface UnitState { status: UnitStatus; buyer?: string; notes?: string }

export function isUnitStatus(s: unknown): s is UnitStatus {
  return typeof s === 'string' && (UNIT_STATUSES as readonly string[]).includes(s)
}

/** NetFloorArea → GrossFloorArea → null, Qto_SpaceBaseQuantities first, then any other set. */
export function spaceArea(qsets: IFCQuantitySet[]): number | null {
  const ordered = [...qsets].sort((a, b) =>
    Number(b.name === 'Qto_SpaceBaseQuantities') - Number(a.name === 'Qto_SpaceBaseQuantities'))
  for (const name of ['NetFloorArea', 'GrossFloorArea']) {
    for (const qs of ordered) {
      const q = qs.quantities.find((x) => x.name === name && typeof x.value === 'number' && Number.isFinite(x.value) && x.value > 0)
      if (q) return q.value as number
    }
  }
  return null
}

function label(name: string | null, longName: string | null, fallback: string): string {
  const n = name?.trim(); const l = longName?.trim()
  if (n && l && n !== l) return `${n} ${l}`
  return n || l || fallback
}

/** Persisted unit key: GlobalId, else storey + name. The runtime model id changes on every load. */
export function unitKey(globalId: string | null, storey: string | null, name: string): string {
  return globalId?.trim() || `~${storey ?? ''}/${name}`
}

/**
 * Old keys were `<modelId>:<GlobalId or #expressId>` with a per-load model id.
 * GlobalIds and `#n` never contain ':', so the part after the last ':' is the
 * stable id. New fallback keys (`~storey/name`) are kept as they are.
 */
export function normalizeUnitId(id: string): string {
  if (id.startsWith('~')) return id
  const i = id.lastIndexOf(':')
  return i >= 0 ? id.slice(i + 1) : id
}

/** Zones that group spaces become units; spaces in no zone are units of their own. */
export function buildUnits(modelId: string, spaces: SpaceRecord[], zones: ZoneRecord[] = []): Unit[] {
  const byId = new Map(spaces.map((s) => [s.expressId, s]))
  const used = new Set<number>()
  const out: Unit[] = []
  for (const z of zones) {
    const members = z.memberIds.map((id) => byId.get(id)).filter((s): s is SpaceRecord => !!s)
    if (!members.length) continue
    members.forEach((m) => used.add(m.expressId))
    const areas = members.map((m) => spaceArea(m.quantitySets))
    const storeys = [...new Set(members.map((m) => m.storey).filter((s): s is string => !!s))]
    out.push({
      id: unitKey(z.globalId, storeys[0] ?? null, label(z.name, z.longName, `#${z.expressId}`)), globalId: z.globalId, modelId,
      expressIds: members.map((m) => m.expressId), name: label(z.name, z.longName, `#${z.expressId}`),
      storey: storeys[0] ?? null,
      area: areas.every((a) => a === null) ? null : areas.reduce<number>((s, a) => s + (a ?? 0), 0),
      status: 'available',
      rooms: members.map((m) => label(m.name, m.longName, `#${m.expressId}`)),
    })
  }
  for (const s of spaces) {
    if (used.has(s.expressId)) continue
    out.push({
      id: unitKey(s.globalId, s.storey, label(s.name, s.longName, `#${s.expressId}`)), globalId: s.globalId, modelId, expressIds: [s.expressId],
      name: label(s.name, s.longName, `#${s.expressId}`), storey: s.storey, area: spaceArea(s.quantitySets), status: 'available',
    })
  }
  return out
}

/** Applies stored states (by unit id) to freshly built units. */
export function applyStates(units: Unit[], states: Record<string, UnitState>): Unit[] {
  const norm = new Map(Object.entries(states).map(([k, v]) => [normalizeUnitId(k), v]))
  return units.map((u) => {
    const s = norm.get(u.id)
    return s && isUnitStatus(s.status) ? { ...u, status: s.status, buyer: s.buyer || undefined, notes: s.notes || undefined } : u
  })
}

/** What is worth persisting: units that are not plain "available". */
export function statesOf(units: Unit[]): Record<string, UnitState> {
  const r: Record<string, UnitState> = {}
  for (const u of units) if (u.status !== 'available' || u.buyer || u.notes) r[u.id] = { status: u.status, buyer: u.buyer, notes: u.notes }
  return r
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

export const CSV_HEADER = ['GlobalId', 'Name', 'Storey', 'Area_m2', 'Status', 'Buyer', 'Notes']

function cell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v)
  // Neutralise spreadsheet formulas, quote when needed.
  const safe = typeof v === 'string' && /^[=+\-@]/.test(s) ? `'${s}` : s
  return /[",;\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function unitsCsv(units: Unit[]): string {
  const rows = units.map((u) => [u.globalId, u.name, u.storey, u.area === null ? '' : u.area.toFixed(2), u.status, u.buyer, u.notes].map(cell).join(','))
  return [CSV_HEADER.join(','), ...rows].join('\r\n') + '\r\n'
}

/** RFC-4180-ish parser; picks `,` or `;` from the header line. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []; let cur = ''; let q = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c
    } else if (c === '"') q = true
    else if (c === sep) { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.some((x) => x.trim() !== '')) rows.push(row)
      row = []
    } else cur += c
  }
  row.push(cur)
  if (row.some((x) => x.trim() !== '')) rows.push(row)
  return rows
}

const STATUS_ALIASES: Record<string, UnitStatus> = {
  available: 'available', disponible: 'available', libre: 'available', free: 'available',
  reserved: 'reserved', reservada: 'reserved', reservado: 'reserved', reserva: 'reserved',
  sold: 'sold', vendida: 'sold', vendido: 'sold',
  in_works: 'in_works', 'in works': 'in_works', 'en obra': 'in_works', en_obra: 'in_works', obra: 'in_works',
  delivered: 'delivered', entregada: 'delivered', entregado: 'delivered',
  post_sale: 'post_sale', 'post sale': 'post_sale', 'post-sale': 'post_sale', postventa: 'post_sale', posventa: 'post_sale',
}

export function normaliseStatus(s: string): UnitStatus | null {
  return STATUS_ALIASES[s.trim().toLowerCase()] ?? null
}

export interface CsvMergeResult { units: Unit[]; matched: number; unmatched: string[]; badStatus: number }

/**
 * Merges a CSV (header with GlobalId and/or Name, plus Status; Buyer, Notes
 * optional) into units. GlobalId wins over Name; names match case-insensitively.
 */
export function mergeCsv(units: Unit[], text: string): CsvMergeResult {
  const rows = parseCsv(text)
  const result: CsvMergeResult = { units, matched: 0, unmatched: [], badStatus: 0 }
  if (rows.length < 2) return result
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h))
  const iGid = col('globalid', 'guid', 'global id')
  const iName = col('name', 'nombre', 'unit', 'unidad', 'vivienda')
  const iStatus = col('status', 'estado')
  const iBuyer = col('buyer', 'comprador', 'cliente')
  const iNotes = col('notes', 'notas', 'observaciones')
  if (iStatus < 0 || (iGid < 0 && iName < 0)) return result
  const byGid = new Map(units.filter((u) => u.globalId).map((u) => [u.globalId as string, u]))
  const byName = new Map<string, Unit>()
  for (const u of units) { const k = u.name.trim().toLowerCase(); if (!byName.has(k)) byName.set(k, u) }
  const patch = new Map<string, Partial<Unit>>()
  for (const r of rows.slice(1)) {
    const gid = iGid >= 0 ? (r[iGid] ?? '').trim() : ''
    const name = iName >= 0 ? (r[iName] ?? '').trim() : ''
    const u = (gid && byGid.get(gid)) || (name && byName.get(name.toLowerCase())) || null
    if (!u) { result.unmatched.push(gid || name); continue }
    const status = normaliseStatus(r[iStatus] ?? '')
    if (!status) { result.badStatus++; continue }
    const p: Partial<Unit> = { status }
    if (iBuyer >= 0) p.buyer = (r[iBuyer] ?? '').trim() || undefined
    if (iNotes >= 0) p.notes = (r[iNotes] ?? '').trim() || undefined
    patch.set(u.id, p)
    result.matched++
  }
  result.units = units.map((u) => (patch.has(u.id) ? { ...u, ...patch.get(u.id) } : u))
  return result
}

// ─── counts ───────────────────────────────────────────────────────────────────

export type StatusCounts = Record<UnitStatus, number>

export function emptyCounts(): StatusCounts {
  return Object.fromEntries(UNIT_STATUSES.map((s) => [s, 0])) as StatusCounts
}

export function countByStatus(units: Unit[]): StatusCounts {
  const c = emptyCounts()
  for (const u of units) c[u.status]++
  return c
}

/** Group key for units with no storey. */
export const NO_STOREY = '\u0000'

/** Storey → counts, storeys in first-seen order (the model's order). */
export function countByStorey(units: Unit[]): Map<string, StatusCounts> {
  const m = new Map<string, StatusCounts>()
  for (const u of units) {
    const k = u.storey ?? NO_STOREY
    const c = m.get(k) ?? emptyCounts()
    c[u.status]++
    m.set(k, c)
  }
  return m
}

export function groupByStorey(units: Unit[]): Array<{ storey: string; units: Unit[] }> {
  const m = new Map<string, Unit[]>()
  for (const u of units) {
    const k = u.storey ?? NO_STOREY
    const list = m.get(k)
    if (list) list.push(u); else m.set(k, [u])
  }
  return [...m].map(([storey, list]) => ({ storey, units: list }))
}

// ─── reading through fragments ────────────────────────────────────────────────

export interface UnitsFragmentsLike {
  getItemsOfCategories(categories: RegExp[]): Promise<Record<string, number[]>>
  getItemsData(ids: number[], config: unknown): Promise<unknown[]>
}

const ZONE_CONFIG = {
  attributesDefault: true,
  attributes: [] as string[],
  relations: { IsGroupedBy: { attributes: true, relations: true }, RelatedObjects: { attributes: true, relations: false } },
}

/** Every space `_localId` reachable under a zone's grouping relation (the shape varies by importer). */
export function zoneMemberIds(raw: unknown, spaceIds: ReadonlySet<number>): number[] {
  const out = new Set<number>()
  const walk = (v: unknown, depth: number) => {
    if (depth > 4 || !v || typeof v !== 'object') return
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return }
    const o = v as Record<string, unknown>
    const lid = o._localId as { value?: unknown } | number | undefined
    const n = typeof lid === 'number' ? lid : typeof lid?.value === 'number' ? lid.value : null
    if (n !== null && spaceIds.has(n)) out.add(n)
    for (const [k, x] of Object.entries(o)) if (k === 'IsGroupedBy' || k === 'RelatedObjects' || Array.isArray(x)) walk(x, depth + 1)
  }
  const top = raw as Record<string, unknown> | null
  if (top) { walk(top.IsGroupedBy, 0); walk(top.RelatedObjects, 0) }
  return [...out]
}

const BATCH = 300
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

type ParseInput = Parameters<typeof parseItemData>[0]

export async function collectUnits(models: Array<{ id: string; fragments: UnitsFragmentsLike }>, signal?: AbortSignal): Promise<Unit[]> {
  const all: Unit[] = []
  for (const m of models) {
    let ids: number[] = []
    try { ids = [...new Set(Object.values(await m.fragments.getItemsOfCategories([/^IFCSPACE$/i])).flat())] } catch { continue }
    if (!ids.length) continue
    const spaces: SpaceRecord[] = []
    for (let i = 0; i < ids.length; i += BATCH) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
      const chunk = ids.slice(i, i + BATCH)
      const raws = await m.fragments.getItemsData(chunk, ITEM_DATA_CONFIG)
      raws.forEach((raw, j) => {
        const d = parseItemData(raw as ParseInput)
        spaces.push({ expressId: chunk[j], globalId: d.globalId, name: d.name, longName: d.longName, storey: d.storey, quantitySets: d.quantitySets })
      })
      await tick()
    }
    const zones: ZoneRecord[] = []
    try {
      const zids = Object.values(await m.fragments.getItemsOfCategories([/^IFCZONE$/i])).flat()
      if (zids.length) {
        const set = new Set(ids)
        const raws = await m.fragments.getItemsData(zids, ZONE_CONFIG)
        raws.forEach((raw, j) => {
          const d = parseItemData(raw as ParseInput)
          zones.push({ expressId: zids[j], globalId: d.globalId, name: d.name, longName: d.longName, memberIds: zoneMemberIds(raw, set) })
        })
      }
    } catch { /* zones are optional */ }
    all.push(...buildUnits(m.id, spaces, zones))
  }
  return all
}
