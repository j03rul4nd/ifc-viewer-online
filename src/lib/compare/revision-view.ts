// ─── compare/revision-view.ts ─────────────────────────────────────────────────
// Pure helpers between a RevisionDiff and the revision compare UI: the colour
// code (05-ux §2), the order by site impact, the facets and filters of the list
// and the key the review states are stored under. No DOM, no viewer, no i18n.

import type { ChangeKind, RevisionChange, RevisionDiff } from './revision-types'
import type { ModelSnapshot } from './types'

export type ShownKind = Exclude<ChangeKind, 'unchanged'>
export type ReviewState = 'pending' | 'reviewed' | 'affects_site'

/** The five categories of 05-ux §2 (type/relations changes fall in with their nearest one). */
export type ColourGroup = 'added' | 'removed' | 'moved' | 'reshaped' | 'properties'

export const KIND_GROUP: Record<ShownKind, ColourGroup> = {
  added: 'added',
  removed: 'removed',
  moved: 'moved',
  reshaped: 'reshaped',
  type_changed: 'reshaped',
  relations_changed: 'properties',
  properties_changed: 'properties',
}

/** One source of truth for the colour code: 3D, list, table, chips. */
export const GROUP_COLOUR: Record<ColourGroup, string> = {
  added: '#2E9E5B', // theme-allow-color: revision change code (05-ux §2)
  removed: '#D64545', // theme-allow-color: revision change code (05-ux §2)
  moved: '#2F6FDE', // theme-allow-color: revision change code (05-ux §2)
  reshaped: '#E08A1E', // theme-allow-color: revision change code (05-ux §2)
  properties: '#8B5CF6', // theme-allow-color: revision change code (05-ux §2)
}

/** Icon + letter, so the code never depends on colour alone. */
export const GROUP_ICON: Record<ColourGroup, string> = {
  added: '+', removed: '−', moved: '→', reshaped: '◇', properties: '≡',
}
export const GROUP_LETTER: Record<ColourGroup, string> = {
  added: 'A', removed: 'R', moved: 'M', reshaped: 'G', properties: 'P',
}

export const SHOWN_KINDS: readonly ShownKind[] = [
  'removed', 'added', 'type_changed', 'reshaped', 'moved', 'relations_changed', 'properties_changed',
]

// theme-allow-color: revision change code, neutral for unchanged
export const kindColour = (k: ChangeKind): string => (k === 'unchanged' ? '#8A8F98' : GROUP_COLOUR[KIND_GROUP[k]])

/** CSS custom properties for the workspace root, so components read tokens, not hex. */
export function colourTokens(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [g, c] of Object.entries(GROUP_COLOUR)) out[`--rc-${g}`] = c
  return out
}

// ── Impact order ─────────────────────────────────────────────────────────────

const KIND_RANK: Record<ChangeKind, number> = {
  removed: 0, added: 1, type_changed: 2, reshaped: 3, moved: 4, relations_changed: 5, properties_changed: 6, unchanged: 7,
}

/** Size of the change in metres-ish, to order within one kind (bigger first). */
export function magnitude(c: RevisionChange): number {
  const d = c.delta
  if (!d) return c.changes.length * 1e-3
  if (d.sizeBefore && d.sizeAfter) return Math.max(...[0, 1, 2].map((i) => Math.abs(d.sizeAfter![i] - d.sizeBefore![i])))
  if (d.moveDistance != null) return d.moveDistance
  if (d.volumeBefore != null && d.volumeAfter != null) return Math.abs(d.volumeAfter - d.volumeBefore)
  return 0
}

export function compareImpact(a: RevisionChange, b: RevisionChange): number {
  return KIND_RANK[a.kind] - KIND_RANK[b.kind]
    || magnitude(b) - magnitude(a)
    || (a.storey ?? '').localeCompare(b.storey ?? '')
    || a.globalId.localeCompare(b.globalId)
}

export function sortByImpact(changes: readonly RevisionChange[]): RevisionChange[] {
  return changes.filter((c) => c.kind !== 'unchanged').sort(compareImpact)
}

// ── Facets and filters ───────────────────────────────────────────────────────

export const fileOf = (c: RevisionChange): string => c.headFile ?? c.baseFile ?? '—'
export const storeyOf = (c: RevisionChange): string => c.storey ?? '—'

/** GlobalId → piece mark (Tag, else the first configured mark property), from both versions. */
export function markIndex(snaps: readonly ModelSnapshot[], markProperties: readonly string[] = []): Map<string, string> {
  const out = new Map<string, string>()
  for (const s of snaps) {
    for (const e of s.elements) {
      const attrs = (e as unknown as { attributes?: Record<string, unknown> }).attributes
      let mark = attrs?.Tag
      if ((mark == null || mark === '') && markProperties.length) {
        const psets = (e as unknown as { psets?: Record<string, Record<string, unknown>> }).psets
        for (const mp of markProperties) {
          const [p, k] = mp.split('.')
          const v = psets?.[p]?.[k]
          if (v != null && v !== '') { mark = v; break }
        }
      }
      if (mark != null && mark !== '' && !out.has(e.globalId)) out.set(e.globalId, String(mark))
    }
  }
  return out
}

export interface RevisionFilter {
  kinds: ShownKind[]
  storey: string
  file: string
  cls: string
  /** Free text: GlobalId, name or mark; or a pasted list of marks (comma / newline / space separated). */
  marks: string
  review: '' | ReviewState
}

export const EMPTY_FILTER: RevisionFilter = { kinds: [...SHOWN_KINDS], storey: '', file: '', cls: '', marks: '', review: '' }

export function parseMarks(text: string): string[] {
  return text.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
}

export function filterChanges(
  sorted: readonly RevisionChange[],
  f: RevisionFilter,
  marks: ReadonlyMap<string, string>,
  reviews: ReadonlyMap<string, ReviewState>,
): RevisionChange[] {
  const kinds = new Set(f.kinds)
  const wanted = parseMarks(f.marks)
  return sorted.filter((c) => {
    if (!kinds.has(c.kind as ShownKind)) return false
    if (f.storey && storeyOf(c) !== f.storey) return false
    if (f.file && fileOf(c) !== f.file) return false
    if (f.cls && c.ifcClass !== f.cls) return false
    if (f.review && (reviews.get(c.globalId) ?? 'pending') !== f.review) return false
    if (wanted.length) {
      const hay = [marks.get(c.globalId), c.name, c.globalId].filter(Boolean).map((s) => String(s).toLowerCase())
      if (!wanted.some((w) => hay.some((h) => h === w || h.includes(w)))) return false
    }
    return true
  })
}

export interface Facets {
  storeys: string[]
  files: string[]
  classes: string[]
  kinds: Record<ShownKind, number>
}

export function facets(sorted: readonly RevisionChange[]): Facets {
  const storeys = new Set<string>(), files = new Set<string>(), classes = new Set<string>()
  const kinds = Object.fromEntries(SHOWN_KINDS.map((k) => [k, 0])) as Record<ShownKind, number>
  for (const c of sorted) {
    storeys.add(storeyOf(c)); files.add(fileOf(c)); classes.add(c.ifcClass)
    if (c.kind !== 'unchanged') kinds[c.kind]++
  }
  const s = (x: Set<string>) => [...x].sort((a, b) => a.localeCompare(b))
  return { storeys: s(storeys), files: s(files), classes: s(classes), kinds }
}

const KNOWN_UPPER: Record<string, string> = {
  IFCWALLSTANDARDCASE: 'Wall', IFCBUILDINGELEMENTPROXY: 'Building element proxy', IFCFLOWSEGMENT: 'Flow segment',
  IFCDUCTSEGMENT: 'Duct segment', IFCPIPESEGMENT: 'Pipe segment', IFCCURTAINWALL: 'Curtain wall', IFCSTAIRFLIGHT: 'Stair flight',
  IFCFLOWTERMINAL: 'Flow terminal', IFCFLOWFITTING: 'Flow fitting', IFCDUCTFITTING: 'Duct fitting', IFCPIPEFITTING: 'Pipe fitting',
  IFCBUILDINGSTOREY: 'Storey', IFCOPENINGELEMENT: 'Opening', IFCFURNISHINGELEMENT: 'Furniture', IFCREINFORCINGBAR: 'Rebar',
}

/** "IfcColumn" → "Column": the IFC class the way people on site say it. */
export function readableClass(cls: string): string {
  // Snapshots carry the upper-case STEP name (IFCBEAM): title-case it first.
  if (/^IFC[A-Z0-9]+$/.test(cls)) return KNOWN_UPPER[cls] ?? cls.slice(3).charAt(0) + cls.slice(4).toLowerCase()
  return cls.replace(/^Ifc/, '').replace(/StandardCase$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')
}

// ── Review persistence key ───────────────────────────────────────────────────

/** Stable id of one side of a comparison: hash of its files, order independent. */
export async function sideHash(files: ReadonlyArray<{ name: string; bytes: ArrayBuffer }>): Promise<string> {
  const parts: string[] = []
  for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    const d = await crypto.subtle.digest('SHA-256', f.bytes)
    parts.push([...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join(''))
  }
  if (parts.length === 1) return parts[0]
  const joined = new TextEncoder().encode(parts.join('|'))
  const d = await crypto.subtle.digest('SHA-256', joined)
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const reviewPrefix = (hashA: string, hashB: string): string => `${hashA}:${hashB}:`
export const reviewKey = (hashA: string, hashB: string, globalId: string): string => `${reviewPrefix(hashA, hashB)}${globalId}`

export interface ReviewCounts { total: number; reviewed: number; affects: number }

export function reviewCounts(sorted: readonly RevisionChange[], reviews: ReadonlyMap<string, ReviewState>): ReviewCounts {
  let reviewed = 0, affects = 0
  for (const c of sorted) {
    const r = reviews.get(c.globalId)
    if (r === 'reviewed') reviewed++
    else if (r === 'affects_site') { affects++; reviewed++ }
  }
  return { total: sorted.length, reviewed, affects }
}

/** Index of the change to open first: the one of highest impact (the list is already sorted). */
export function firstImpact(sorted: readonly RevisionChange[]): number {
  return sorted.length ? 0 : -1
}

/** Changes matched by a method other than GlobalId: the UI shows method + confidence. */
export const isInferredMatch = (c: RevisionChange): boolean => c.match.method !== 'guid' && c.match.method !== 'none'

export function changeById(diff: RevisionDiff | null): Map<string, RevisionChange> {
  return new Map((diff?.changes ?? []).map((c) => [c.globalId, c]))
}

// ── Before / after table rows (M4) ───────────────────────────────────────────

export interface TableRow {
  /** i18n key under compare.rc.field.* when `label` is not a raw IFC key. */
  field: 'positionX' | 'positionY' | 'positionZ' | 'distance' | 'sizeX' | 'sizeY' | 'height' | 'volume' | 'raw'
  label?: string
  before: string
  after: string
  delta: string
}

const mmStr = (m: number): string => `${Math.round(m * 1000).toLocaleString('en-US').replace(/,/g, ' ')} mm`
const signedMm = (m: number): string => `${m >= 0 ? '+' : '−'}${mmStr(Math.abs(m))}`

function scalar(v: unknown): string {
  if (v === undefined) return '∅'
  if (v === null) return '—'
  return Array.isArray(v) ? v.join(', ') || '∅' : String(v)
}

export function tableRows(c: RevisionChange): TableRow[] {
  const rows: TableRow[] = []
  const d = c.delta
  if (d?.move) {
    const axes: Array<TableRow['field']> = ['positionX', 'positionY', 'positionZ']
    d.move.forEach((v, i) => { if (Math.abs(v) >= 0.0005) rows.push({ field: axes[i], before: '0 mm', after: signedMm(v), delta: signedMm(v) }) })
    if (d.moveDistance != null) rows.push({ field: 'distance', before: '', after: '', delta: mmStr(d.moveDistance) })
  }
  if (d?.sizeBefore && d.sizeAfter) {
    const axes: Array<TableRow['field']> = ['sizeX', 'sizeY', 'height']
    for (let i = 0; i < 3; i++) {
      const b = d.sizeBefore[i], a = d.sizeAfter[i]
      if (Math.abs(a - b) >= 0.0005) rows.push({ field: axes[i], before: mmStr(b), after: mmStr(a), delta: signedMm(a - b) })
    }
  }
  if (d?.volumeBefore != null && d.volumeAfter != null && Math.abs(d.volumeAfter - d.volumeBefore) > 1e-6) {
    const pct = d.volumeBefore > 0 ? ((d.volumeAfter - d.volumeBefore) / d.volumeBefore) * 100 : 0
    rows.push({ field: 'volume', before: `${d.volumeBefore.toFixed(3)} m³`, after: `${d.volumeAfter.toFixed(3)} m³`, delta: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)} %` })
  }
  for (const ch of c.changes) {
    if (ch.category === 'geometry' || ch.category === 'placement') continue
    rows.push({ field: 'raw', label: ch.key || ch.category, before: scalar(ch.before), after: scalar(ch.after), delta: '' })
  }
  return rows
}
