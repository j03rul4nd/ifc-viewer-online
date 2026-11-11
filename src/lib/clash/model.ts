// ─── clash model: matrices, results, statuses, groups ─────────────────────────
// Everything here is pure data and pure functions (tested in model.test.ts).
// The panel and the store only glue these to the viewer.

import type { ClashKind } from './engine'

// ── selection sets ─────────────────────────────────────────────────────────────

/** Which elements a side of a test takes. Empty lists mean "any". */
export interface ClashSelector {
  /** Disciplines (federation: 'A','S','M','E','P', …) or model file names. */
  models: string[]
  /** IFC classes, upper case (IFCDUCTSEGMENT). */
  classes: string[]
  /** IfcSystem names (or the class family when the file has no systems). */
  systems: string[]
}

export interface ClashTestDef {
  id: string
  name: string
  kind: ClashKind
  /** Metres. Hard: minimum overlap to report. Clearance: required gap. */
  tolerance: number
  a: ClashSelector
  b: ClashSelector
  skipSameModel: boolean
  enabled: boolean
}

/** A saved set of tests ("the coordination matrix"). */
export interface ClashMatrix {
  version: 1
  name: string
  tests: ClashTestDef[]
}

/** One element as the matrix sees it. */
export interface ClashElement {
  index: number
  modelId: string
  fileName: string
  discipline: string
  localId: number
  category: string
  storey: string
  system: string
  name?: string
  guid?: string
  /** localId of the assembly this element is a part of (curtain wall → its mullions). */
  assembly?: number
}

export const ANY: ClashSelector = { models: [], classes: [], systems: [] }

/** Classes never tested: not physical, or containers of other elements. */
export const NEVER_TESTED = /^IFC(SPACE|OPENINGELEMENT|OPENINGSTANDARDCASE|ANNOTATION|GRID|SITE|BUILDING|BUILDINGSTOREY|PROJECT|VIRTUALELEMENT|ZONE|SPATIALZONE|EXTERNALSPATIALELEMENT|FURNISHINGELEMENT|FURNITURE)$/

export function matches(sel: ClashSelector, el: ClashElement): boolean {
  if (sel.models.length && !sel.models.includes(el.discipline) && !sel.models.includes(el.fileName)) return false
  if (sel.classes.length && !sel.classes.includes(el.category)) return false
  if (sel.systems.length && !sel.systems.includes(el.system)) return false
  return true
}

/**
 * Assembly group per element: an assembly and its parts share one id, so a
 * curtain wall is never reported against its own mullions (nor the mullions
 * against each other). -1 = on its own.
 */
export function assemblyGroups(elements: ClashElement[]): Int32Array {
  const out = new Int32Array(elements.length).fill(-1)
  const key = (e: ClashElement) => `${e.modelId}#${e.assembly ?? e.localId}`
  const hosts = new Set(elements.filter((e) => e.assembly != null).map(key))
  const ids = new Map<string, number>()
  for (const e of elements) {
    const k = key(e)
    if (e.assembly == null && !hosts.has(k)) continue
    if (!ids.has(k)) ids.set(k, ids.size)
    out[e.index] = ids.get(k)!
  }
  return out
}

export function selectIndexes(sel: ClashSelector, elements: ClashElement[]): number[] {
  return elements.filter((e) => !NEVER_TESTED.test(e.category) && matches(sel, e)).map((e) => e.index)
}

let seq = 0
export function newTestId(): string {
  seq = (seq + 1) % 1e6
  return `t${Date.now().toString(36)}${seq.toString(36)}`
}

/**
 * The matrix a coordinator starts from: every discipline present against
 * every other (hard, 10 mm), plus MEP against structure with 50 mm
 * clearance when both are there. One discipline → the file against itself.
 */
export function defaultMatrix(disciplines: string[]): ClashMatrix {
  const d = [...new Set(disciplines)].sort()
  const tests: ClashTestDef[] = []
  const mk = (name: string, kind: ClashKind, tolerance: number, a: string[], b: string[], skipSameModel: boolean): ClashTestDef => ({
    id: newTestId(), name, kind, tolerance, a: { ...ANY, models: a }, b: { ...ANY, models: b }, skipSameModel, enabled: true,
  })
  if (d.length < 2) {
    tests.push(mk(d[0] ? `${d[0]} × ${d[0]}` : 'All × All', 'hard', 0.01, [], [], false))
  } else {
    for (let i = 0; i < d.length; i++) for (let j = i + 1; j < d.length; j++) {
      tests.push(mk(`${d[i]} × ${d[j]}`, 'hard', 0.01, [d[i]], [d[j]], true))
    }
    const mep = d.filter((x) => x === 'M' || x === 'E' || x === 'P')
    if (mep.length && d.includes('S')) tests.push(mk(`${mep.join('+')} ↔ S 50 mm`, 'clearance', 0.05, mep, ['S'], true))
  }
  return { version: 1, name: 'Coordination', tests }
}

export function parseMatrix(text: string): ClashMatrix | null {
  try {
    const raw = JSON.parse(text) as Partial<ClashMatrix>
    if (!raw || !Array.isArray(raw.tests)) return null
    const sel = (s: unknown): ClashSelector => {
      const o = (s ?? {}) as Partial<ClashSelector>
      const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])
      return { models: list(o.models), classes: list(o.classes).map((c) => c.toUpperCase()), systems: list(o.systems) }
    }
    const tests = raw.tests.map((t): ClashTestDef => ({
      id: typeof t.id === 'string' ? t.id : newTestId(),
      name: String(t.name ?? 'Test'),
      kind: t.kind === 'clearance' ? 'clearance' : 'hard',
      tolerance: Math.min(5, Math.max(0, Number(t.tolerance) || 0)),
      a: sel(t.a), b: sel(t.b),
      skipSameModel: t.skipSameModel !== false,
      enabled: t.enabled !== false,
    }))
    return { version: 1, name: String(raw.name ?? 'Coordination'), tests }
  } catch { return null }
}

// ── results and statuses ───────────────────────────────────────────────────────

export type ClashStatus = 'new' | 'active' | 'resolved' | 'approved'

export interface ClashResult {
  /** Stable across versions: test id + the two GlobalIds, sorted. */
  key: string
  test: string
  kind: ClashKind
  a: ClashElement
  b: ClashElement
  distance: number
  depth: number
  point: [number, number, number]
}

/** What the coordinator decided about a clash; outlives model versions. */
export interface ClashRecord {
  status: ClashStatus
  firstSeen: string
  lastSeen: string
  /** Team: who fixes it, by when, and a note. */
  assignee?: string
  due?: string
  note?: string
  /** When a person or a run last changed it (merge key for the cloud). */
  updatedAt?: string
  /** Last known labels, so a resolved clash can still be listed. */
  label?: string
  testName?: string
  storey?: string
}

export function clashKey(test: string, a: ClashElement, b: ClashElement): string {
  const ga = a.guid || `${a.fileName}#${a.localId}`
  const gb = b.guid || `${b.fileName}#${b.localId}`
  return `${test}|${ga < gb ? `${ga}|${gb}` : `${gb}|${ga}`}`
}

/**
 * Carry decisions over to a new run of the tests in `ranTests`:
 *  - unseen before → new; seen before as new/active → active;
 *  - previously resolved and back again → active (reopened);
 *  - approved stays approved while it keeps clashing;
 *  - a pair from a ran test that no longer clashes → resolved (approved kept).
 * Records from tests that did not run are left untouched.
 */
export function reconcile(
  prev: Record<string, ClashRecord>,
  results: ClashResult[],
  ranTests: Set<string>,
  now: string,
  label: (r: ClashResult) => string = (r) => `${r.a.category} × ${r.b.category}`,
  testName: (id: string) => string = (id) => id,
): Record<string, ClashRecord> {
  const next: Record<string, ClashRecord> = {}
  const live = new Set<string>()
  for (const r of results) {
    live.add(r.key)
    const old = prev[r.key]
    const status: ClashStatus = !old ? 'new' : old.status === 'approved' ? 'approved' : 'active'
    next[r.key] = { ...old, status, firstSeen: old?.firstSeen ?? now, lastSeen: now, updatedAt: old && old.status === status ? old.updatedAt : now, label: label(r), testName: testName(r.test), storey: r.a.storey || r.b.storey }
  }
  for (const [key, rec] of Object.entries(prev)) {
    if (live.has(key)) continue
    const test = key.slice(0, key.indexOf('|'))
    next[key] = ranTests.has(test) && rec.status !== 'approved' && rec.status !== 'resolved' ? { ...rec, status: 'resolved', updatedAt: now } : rec
  }
  return next
}

// ── grouping ───────────────────────────────────────────────────────────────────

export type GroupBy = 'storey' | 'system' | 'element' | 'test' | 'none'

export interface ClashGroup {
  key: string
  label: string
  clashes: ClashResult[]
}

/**
 * Group clashes so 5,000 hits read as a few dozen problems. 'element' is
 * greedy: the element in the most clashes takes all of them first (one duct
 * through twelve beams is one problem, not twelve).
 */
export function groupClashes(results: ClashResult[], by: GroupBy, testName: (id: string) => string = (id) => id): ClashGroup[] {
  if (by === 'none') return [{ key: 'all', label: '', clashes: results }]
  const groups = new Map<string, ClashGroup>()
  const add = (key: string, label: string, r: ClashResult) => {
    let g = groups.get(key)
    if (!g) { g = { key, label, clashes: [] }; groups.set(key, g) }
    g.clashes.push(r)
  }
  if (by === 'element') {
    // Greedy with a lazy max-heap: O(n log n), so 5,000+ clashes group in
    // a few ms instead of rescanning the whole list once per group.
    const elKey = (e: ClashElement) => `${e.modelId}#${e.localId}`
    const inc = new Map<string, number[]>()
    results.forEach((r, i) => { for (const e of [r.a, r.b]) { const k = elKey(e); let l = inc.get(k); if (!l) inc.set(k, (l = [])); l.push(i) } })
    const taken = new Uint8Array(results.length)
    const heap: Array<[number, string]> = [...inc].map(([k, l]) => [l.length, k])
    const less = (x: [number, string], y: [number, string]) => x[0] < y[0] || (x[0] === y[0] && x[1] > y[1])
    const up = (i: number) => { while (i > 0) { const p = (i - 1) >> 1; if (!less(heap[p], heap[i])) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p } }
    const down = (i: number) => { for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && less(heap[m], heap[l])) m = l; if (r < heap.length && less(heap[m], heap[r])) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m } }
    for (let i = (heap.length >> 1) - 1; i >= 0; i--) down(i)
    while (heap.length) {
      const top = heap[0]
      const last = heap.pop()!
      if (heap.length) { heap[0] = last; down(0) }
      const free = inc.get(top[1])!.filter((i) => !taken[i])
      if (!free.length) continue
      if (free.length < top[0]) { heap.push([free.length, top[1]]); up(heap.length - 1); continue }
      for (const i of free) {
        taken[i] = 1
        const r = results[i]
        const hit = elKey(r.a) === top[1] ? r.a : r.b
        add(top[1], `${hit.name || hit.category} · ${hit.discipline}`, r)
      }
    }
  } else {
    for (const r of results) {
      if (by === 'storey') { const s = r.a.storey || r.b.storey || '—'; add(s, s, r) }
      else if (by === 'system') {
        const s = r.a.system && r.a.system !== '—' ? r.a.system : r.b.system || '—'
        add(s, s, r)
      } else add(r.test, testName(r.test), r)
    }
  }
  return [...groups.values()].sort((p, q) => q.clashes.length - p.clashes.length || p.label.localeCompare(q.label))
}

/** Counts per status for the summary strip and the report. */
export function statusCounts(records: Record<string, ClashRecord>, keys?: Iterable<string>): Record<ClashStatus, number> {
  const out: Record<ClashStatus, number> = { new: 0, active: 0, resolved: 0, approved: 0 }
  const list = keys ? [...keys].map((k) => records[k]).filter(Boolean) : Object.values(records)
  for (const r of list) out[r.status]++
  return out
}

/** Family label used when a model has no IfcSystem: pipes, ducts, cables… */
export function classFamily(category: string): string {
  const c = category.toUpperCase()
  if (/PIPE|VALVE|PUMP|SANITARY|FLOWTERMINAL/.test(c)) return 'Piping'
  if (/DUCT|AIRTERMINAL|DAMPER|FAN/.test(c)) return 'Ductwork'
  if (/CABLE|ELECTRIC|LIGHT|OUTLET|SWITCH|JUNCTIONBOX/.test(c)) return 'Electrical'
  if (/BEAM|COLUMN|MEMBER|FOOTING|PILE|PLATE/.test(c)) return 'Structure'
  if (/WALL|SLAB|ROOF|STAIR|RAMP|RAILING|CURTAIN|COVERING|DOOR|WINDOW/.test(c)) return 'Architecture'
  return '—'
}
