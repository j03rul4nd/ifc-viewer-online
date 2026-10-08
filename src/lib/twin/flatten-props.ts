// ─── flatten-props ────────────────────────────────────────────────────────────
// Real-world GeoJSON properties are rarely flat. An asset provider sends
//   { "asset": { "id": "TMB-L3-0042", "station": { "code": "L3-14", "name": "Drassanes" } },
//     "sensors": [{ "type": "temp", "value": 21.4 }], "meta": "{\"owner\":\"TMB\"}" }
// and every one of those leaves is something a user will want to read, search
// and link by. This turns any property tree into dotted paths:
//   asset.id · asset.station.code · sensors[0].type · meta.owner
//
// Rules:
//   • Objects nest with '.', arrays with [i]. Arrays of primitives ALSO get a
//     joined row at their own path ("stops" → "Sants, Drassanes"), because that
//     is how a person reads a list and how a name inside it is found.
//   • A string that is itself JSON (very common in WFS / CSV-born layers) is
//     expanded as if it had been an object.
//   • Bounded: depth and row caps, so a feature carrying a whole document in
//     one property cannot freeze the UI.

export type FlatValue = string | number | boolean | null

export interface FlatProp {
  /** Dotted path, e.g. "asset.station.code" or "sensors[0].value". */
  path: string
  /** Path with array indices removed — the FIELD, shared by every element. */
  field: string
  value: FlatValue
  /** Human rendering of the value. */
  display: string
  /** True for the joined row of a primitive array. */
  joined?: boolean
}

export interface FlattenOptions {
  maxDepth?: number
  maxRows?: number
  /** Elements kept per array (the joined row still lists more). */
  maxArrayItems?: number
}

export function flattenProperties(props: unknown, opts: FlattenOptions = {}): FlatProp[] {
  const maxDepth = opts.maxDepth ?? 6
  const maxRows = opts.maxRows ?? 500
  const maxItems = opts.maxArrayItems ?? 50
  const out: FlatProp[] = []

  const push = (path: string, value: FlatValue, joined = false): void => {
    if (out.length >= maxRows) return
    out.push({ path, field: fieldOf(path), value, display: displayOf(value), joined: joined || undefined })
  }

  const walk = (v: unknown, path: string, depth: number): void => {
    if (out.length >= maxRows) return
    const parsed = typeof v === 'string' ? maybeJson(v) : v
    if (parsed === null || parsed === undefined) { if (path) push(path, null); return }
    if (Array.isArray(parsed)) {
      if (depth >= maxDepth) { push(path, `[${parsed.length}]`); return }
      const prims = parsed.every((x) => x === null || typeof x !== 'object')
      if (prims && parsed.length > 0 && path) {
        push(path, parsed.slice(0, 200).map((x) => displayOf(x as FlatValue)).join(', '), true)
      }
      parsed.slice(0, maxItems).forEach((x, i) => walk(x, `${path}[${i}]`, depth + 1))
      return
    }
    if (typeof parsed === 'object') {
      if (depth >= maxDepth) { push(path, '{…}'); return }
      for (const [k, x] of Object.entries(parsed as Record<string, unknown>)) {
        walk(x, path ? `${path}.${k}` : k, depth + 1)
      }
      return
    }
    if (typeof parsed === 'number' || typeof parsed === 'boolean' || typeof parsed === 'string') push(path, parsed)
    else push(path, String(parsed))
  }

  walk(props, '', 0)
  return out
}

/** "sensors[3].value" → "sensors[].value" — the field every element shares. */
export function fieldOf(path: string): string {
  return path.replace(/\[\d+\]/g, '[]')
}

function displayOf(v: FlatValue): string {
  if (v === null) return '—'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6)
  return String(v)
}

/** Expand a string that is clearly a JSON object/array; leave anything else alone. */
function maybeJson(s: string): unknown {
  const t = s.trim()
  if (t.length < 2 || t.length > 200_000) return s
  if (!((t[0] === '{' && t[t.length - 1] === '}') || (t[0] === '[' && t[t.length - 1] === ']'))) return s
  try { return JSON.parse(t) } catch { return s }
}

// ── Schema ─────────────────────────────────────────────────────────────────────

export type FieldType = 'number' | 'string' | 'boolean' | 'date' | 'mixed'
/** What a field is FOR, which is what search and linking care about. */
export type FieldRole = 'id' | 'name' | 'reference' | 'category' | 'measure' | 'other'

export interface FieldSchema {
  field: string
  type: FieldType
  role: FieldRole
  /** Fraction of features that carry it, 0..1. */
  coverage: number
  /** Distinct values seen (capped). */
  distinct: number
  /** A few example values for the UI. */
  examples: string[]
}

const NAME_RE = /(^|[._\[\]])(name|nom|nombre|nome|title|titulo|label|etiqueta|denominacio|denominacion|desc)$/i
const ID_RE = /(^|[._\[\]])(id|gid|fid|uuid|guid|globalid|gml_id|objectid|code|codi|codigo|ref|tag|serial|matricula)$/i
const REF_RE = /(_id|_code|_ref|Id|Code|Ref)$|(^|[._])(station|estacio|estacion|stop|parada|line|linia|linea|asset|device|equip|element|parent|route|ruta)([._]|$)/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+)?(Z|[+-]\d{2}:?\d{2})?$/

/**
 * Infer the schema of a layer's flattened properties. `rows[i]` are the flat
 * props of feature i. Cheap: samples up to 2000 features.
 */
export function inferSchema(rows: FlatProp[][]): FieldSchema[] {
  const sample = rows.slice(0, 2000)
  const n = Math.max(1, sample.length)
  const stats = new Map<string, { count: number; types: Set<FieldType>; values: Set<string>; examples: string[] }>()
  for (const props of sample) {
    const seen = new Set<string>()
    for (const p of props) {
      if (p.joined || p.value === null) continue
      let s = stats.get(p.field)
      if (!s) { s = { count: 0, types: new Set(), values: new Set(), examples: [] }; stats.set(p.field, s) }
      if (!seen.has(p.field)) { s.count++; seen.add(p.field) }
      s.types.add(typeOf(p.value))
      if (s.values.size < 5000) s.values.add(p.display)
      if (s.examples.length < 3 && !s.examples.includes(p.display)) s.examples.push(p.display)
    }
  }
  const out: FieldSchema[] = []
  for (const [field, s] of stats) {
    const type: FieldType = s.types.size === 1 ? [...s.types][0] : 'mixed'
    const uniqueRatio = s.values.size / Math.max(1, s.count)
    let role: FieldRole = 'other'
    if (NAME_RE.test(field) && type !== 'number') role = 'name'
    else if (ID_RE.test(field) && uniqueRatio > 0.9) role = 'id'
    else if (REF_RE.test(field) || ID_RE.test(field)) role = 'reference'
    else if (type === 'number') role = 'measure'
    else if (type === 'string' && s.values.size <= Math.max(12, s.count * 0.2)) role = 'category'
    out.push({ field, type, role, coverage: s.count / n, distinct: s.values.size, examples: s.examples })
  }
  return out.sort((a, b) => b.coverage - a.coverage || a.field.localeCompare(b.field))
}

function typeOf(v: FlatValue): FieldType {
  if (typeof v === 'number') return 'number'
  if (typeof v === 'boolean') return 'boolean'
  if (typeof v === 'string' && DATE_RE.test(v)) return 'date'
  return 'string'
}

/** The best label for a feature: its name-role field, else id, else nothing. */
export function labelOf(props: FlatProp[], schema: FieldSchema[]): string | null {
  for (const role of ['name', 'id'] as const) {
    for (const f of schema) {
      if (f.role !== role) continue
      const p = props.find((x) => x.field === f.field && x.value !== null && !x.joined)
      if (p) return p.display
    }
  }
  return null
}
