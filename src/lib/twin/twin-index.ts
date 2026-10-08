// ─── twin-index ───────────────────────────────────────────────────────────────
// One searchable index over EVERYTHING in the digital twin — GeoJSON features
// from any provider, IFC elements, point clouds — and the links between them.
//
// Search a station and the answer is not one row: it is the station point,
// the route that passes through it, the devices a second provider reports for
// it, the IFC of the station building and the scan that covers it. Two kinds of
// evidence connect them, and every link says which one it rests on:
//
//   • SHARED VALUE — the same identifier or name appears on both sides:
//     a device's `asset.station_code = "L3-14"` and a station's `code = "L3-14"`;
//     a route's `stops = ["Sants", "Drassanes"]` and a station named "Drassanes";
//     an IFC element whose Name carries the tag a sensor feed reports.
//   • SPACE — one is inside, or within a few metres of, the other, in the one
//     scene frame every layer was placed in (geo/scene-anchor.ts).
//
// Pure: no three.js, no stores. The app builds entities from its stores
// (twin-sources.ts) and asks questions here.

import type { FlatProp, FieldSchema } from './flatten-props'

export type TwinSource = 'vector' | 'ifc' | 'pointcloud' | 'mesh'

export interface TwinRef {
  source: TwinSource
  /** Layer id, model id or cloud id. */
  sourceId: string
  /** Feature index, expressId, or '' for a whole source. */
  localId: string
}

export interface PlanPoint { x: number; z: number }

export interface TwinShape {
  type: 'point' | 'line' | 'polygon' | 'box'
  /** Scene plan points: vertices (line/polygon outer ring), or [min, max] for a box. */
  pts: PlanPoint[]
}

export interface TwinEntity {
  ref: TwinRef
  label: string
  /** 'point' | 'line' | 'polygon' for features, the IFC class, 'pointcloud'… */
  kind: string
  /** Layer name / model file / scan file. */
  sourceLabel: string
  props: FlatProp[]
  /** Field roles of the layer this came from (vector), for link weighting. */
  schema?: FieldSchema[]
  shape?: TwinShape
  /**
   * Identity that survives reloads (layer name + feature id, IFC GlobalId,
   * scan file name) — what user-made links are stored against.
   */
  stableKey?: string
}

export function entityKey(r: TwinRef): string {
  return `${r.source}:${r.sourceId}:${r.localId}`
}

// ── Text normalisation ─────────────────────────────────────────────────────────

/** Lower-case, no accents, collapsed whitespace: "Estació de Sants" → "estacio de sants". */
export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function tokenize(s: string): string[] {
  return norm(s).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 0)
}

/**
 * Bounded edit distance with adjacent transpositions (optimal string
 * alignment): true when distance(a, b) ≤ k. "gracai" → "gracia" is ONE edit —
 * swapped keys are the most common typo there is.
 */
function within(a: string, b: string, k: number): boolean {
  if (Math.abs(a.length - b.length) > k) return false
  const n = a.length, m = b.length
  let prev2: number[] = []
  let prev = Array.from({ length: m + 1 }, (_, j) => j)
  for (let i = 1; i <= n; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= m; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1)
      cur.push(v)
      if (v < rowMin) rowMin = v
    }
    if (rowMin > k) return false
    prev2 = prev
    prev = cur
  }
  return prev[m] <= k
}

// ── Link keys ──────────────────────────────────────────────────────────────────

const LINK_FIELD_RE = /(serialnumber|assettag|barcode|assetidentifier|identification|reference)$|(^|[._\[\]])(id|gid|uuid|guid|globalid|code|codi|codigo|ref|tag|serial|name|nom|nombre|title|station|estacio|estacion|stop|stops|parada|paradas|line|linia|linea|asset|device|equip|route|ruta)(s|_id|_code|_ref|_name)?(\[\])?$|(_id|_code|_ref|Id|Code|Ref)(\[\])?$/i

/**
 * Values worth linking on: identifier- or name-like, and specific enough that
 * a match means something. "1", "true", "active" connect everything to
 * everything and are dropped.
 */
function linkValuesOf(e: TwinEntity): Set<string> {
  const out = new Set<string>()
  const add = (raw: string): void => {
    const v = norm(raw)
    if (v.length < 3 || v.length > 80) return
    if (/^\d{1,3}$/.test(v)) return
    if (/^(true|false|null|none|yes|no|si|n\/a|unknown|active|inactive|ok)$/.test(v)) return
    out.add(v)
  }
  if (e.label) add(e.label)
  for (const p of e.props) {
    if (p.value === null || typeof p.value === 'boolean' || p.joined) continue
    const role = e.schema?.find((f) => f.field === p.field)?.role
    const looksLinky = role === 'id' || role === 'name' || role === 'reference' || LINK_FIELD_RE.test(p.field)
    if (!looksLinky) continue
    add(String(p.value))
  }
  return out
}

// ── Geometry ───────────────────────────────────────────────────────────────────

function distPointSeg(p: PlanPoint, a: PlanPoint, b: PlanPoint): number {
  const dx = b.x - a.x, dz = b.z - a.z
  const l2 = dx * dx + dz * dz
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz))
}

function inRing(p: PlanPoint, ring: PlanPoint[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

function segmentsOf(s: TwinShape): [PlanPoint, PlanPoint][] {
  const pts = s.type === 'box'
    ? [s.pts[0], { x: s.pts[1].x, z: s.pts[0].z }, s.pts[1], { x: s.pts[0].x, z: s.pts[1].z }]
    : s.pts
  const closed = s.type === 'polygon' || s.type === 'box'
  const segs: [PlanPoint, PlanPoint][] = []
  for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1]])
  if (closed && pts.length > 2) segs.push([pts[pts.length - 1], pts[0]])
  return segs
}

function containsPoint(s: TwinShape, p: PlanPoint): boolean {
  if (s.type === 'polygon') return s.pts.length > 2 && inRing(p, s.pts)
  if (s.type === 'box') {
    const [a, b] = s.pts
    return p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.z >= Math.min(a.z, b.z) && p.z <= Math.max(a.z, b.z)
  }
  return false
}

/** Plan distance between two shapes (0 when one contains or touches the other). */
export function shapeDistance(a: TwinShape, b: TwinShape): { distance: number; inside: 'a-in-b' | 'b-in-a' | null } {
  const aVerts = a.type === 'box' ? a.pts : a.pts
  const bVerts = b.type === 'box' ? b.pts : b.pts
  if (aVerts.length && aVerts.every((p) => containsPoint(b, p))) return { distance: 0, inside: 'a-in-b' }
  if (bVerts.length && bVerts.every((p) => containsPoint(a, p))) return { distance: 0, inside: 'b-in-a' }
  let best = Infinity
  const segA = segmentsOf(a), segB = segmentsOf(b)
  const ptsA = a.type === 'point' ? a.pts : [], ptsB = b.type === 'point' ? b.pts : []
  for (const p of ptsA) {
    if (containsPoint(b, p)) return { distance: 0, inside: 'a-in-b' }
    for (const [s, e] of segB) best = Math.min(best, distPointSeg(p, s, e))
    for (const q of ptsB) best = Math.min(best, Math.hypot(p.x - q.x, p.z - q.z))
  }
  for (const q of ptsB) {
    if (containsPoint(a, q)) return { distance: 0, inside: 'b-in-a' }
    for (const [s, e] of segA) best = Math.min(best, distPointSeg(q, s, e))
  }
  for (const [s, e] of segA) for (const [u, v] of segB) {
    best = Math.min(best, distPointSeg(s, u, v), distPointSeg(e, u, v), distPointSeg(u, s, e), distPointSeg(v, s, e))
  }
  return { distance: best, inside: null }
}

function shapeBox(s: TwinShape): { minX: number; minZ: number; maxX: number; maxZ: number } {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
  for (const p of s.pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z
  }
  return { minX, minZ, maxX, maxZ }
}

// ── Index ──────────────────────────────────────────────────────────────────────

export interface SearchHit {
  entity: TwinEntity
  score: number
  /** What matched, for the result row: the label, or "asset.station.code: L3-14". */
  matched: string
}

export type LinkReason =
  | { type: 'sharedValue'; value: string; fieldA: string; fieldB: string }
  | { type: 'inside' | 'contains' }
  | { type: 'near'; distanceM: number }

export interface TwinLink {
  entity: TwinEntity
  reasons: LinkReason[]
  /** Higher first. Shared identifiers outrank proximity. */
  strength: number
}

export interface SearchOptions {
  limit?: number
  sources?: TwinSource[]
}

/** Values carried by more entities than this are treated as categories, not identifiers. */
const MAX_LINK_FANOUT = 60
/** Space-only links kept per source (layer / model / scan), closest first. */
const SPATIAL_PER_SOURCE = 5

export class TwinIndex {
  private readonly entities: TwinEntity[] = []
  private readonly byKey = new Map<string, number>()
  private readonly byStable = new Map<string, number>()
  private readonly postings = new Map<string, Map<number, number>>()
  private readonly linkValues: Set<string>[] = []
  private readonly valueOwners = new Map<string, number[]>()
  private readonly grid = new Map<string, number[]>()
  private readonly cell: number

  constructor(entities: TwinEntity[], opts: { cellM?: number } = {}) {
    this.cell = opts.cellM ?? 100
    for (const e of entities) this.add(e)
  }

  get size(): number { return this.entities.length }

  get(ref: TwinRef): TwinEntity | undefined {
    const i = this.byKey.get(entityKey(ref))
    return i === undefined ? undefined : this.entities[i]
  }

  /** The loaded entity behind a stable key, if it is loaded right now. */
  getByStableKey(key: string): TwinEntity | undefined {
    const i = this.byStable.get(key)
    return i === undefined ? undefined : this.entities[i]
  }

  private add(e: TwinEntity): void {
    const i = this.entities.length
    this.entities.push(e)
    this.byKey.set(entityKey(e.ref), i)
    if (e.stableKey) this.byStable.set(e.stableKey, i)

    const post = (text: string, w: number): void => {
      for (const t of tokenize(text)) {
        let m = this.postings.get(t)
        if (!m) { m = new Map(); this.postings.set(t, m) }
        m.set(i, Math.max(m.get(i) ?? 0, w))
      }
    }
    post(e.label, 4)
    post(e.kind, 1.5)
    post(e.sourceLabel, 0.6)
    for (const p of e.props) {
      if (p.value !== null && !p.joined) post(String(p.value), 2)
      post(p.field.replace(/\[\]/g, ' '), 0.4)
    }

    const values = linkValuesOf(e)
    this.linkValues.push(values)
    for (const v of values) {
      const owners = this.valueOwners.get(v)
      if (owners) owners.push(i); else this.valueOwners.set(v, [i])
    }

    if (e.shape && e.shape.pts.length) {
      const b = shapeBox(e.shape)
      const c = this.cell
      // Huge shapes (a 20 km route) register in at most ~400 cells; past that
      // they are found through the coarse fallback in `related`.
      const nx = Math.floor(b.maxX / c) - Math.floor(b.minX / c) + 1
      const nz = Math.floor(b.maxZ / c) - Math.floor(b.minZ / c) + 1
      if (nx * nz <= 400) {
        for (let gx = Math.floor(b.minX / c); gx <= Math.floor(b.maxX / c); gx++) {
          for (let gz = Math.floor(b.minZ / c); gz <= Math.floor(b.maxZ / c); gz++) {
            const k = `${gx},${gz}`
            const list = this.grid.get(k)
            if (list) list.push(i); else this.grid.set(k, [i])
          }
        }
      } else {
        const list = this.grid.get('*')
        if (list) list.push(i); else this.grid.set('*', [i])
      }
    }
  }

  /**
   * Free-text search. Terms are ANDed (falling back to OR when nothing has all
   * of them); `field:value` restricts a term to fields whose path ends with
   * `field` — `station:sants`, `asset.id:tmb`. Accent- and case-insensitive,
   * prefix-matching, and forgiving of one typo (two in long words).
   */
  search(query: string, opts: SearchOptions = {}): SearchHit[] {
    const limit = opts.limit ?? 50
    const { plain, filters } = parseQuery(query)
    if (plain.length === 0 && filters.length === 0) return []

    let candidates: Map<number, number> | null = null
    const perTerm: Map<number, number>[] = plain.map((t) => this.matchTerm(t))
    const and = new Map<number, number>()
    if (perTerm.length) {
      const [first, ...rest] = perTerm
      for (const [i, s] of first) {
        let total = s, all = true
        for (const m of rest) { const v = m.get(i); if (v === undefined) { all = false; break } total += v }
        if (all) and.set(i, total)
      }
      if (and.size > 0) candidates = and
      else {
        candidates = new Map()
        for (const m of perTerm) for (const [i, s] of m) candidates.set(i, (candidates.get(i) ?? 0) + s * 0.5)
      }
    }

    const filtered: Array<{ i: number; score: number; matched: string }> = []
    const pool = candidates ?? new Map(this.entities.map((_, i) => [i, 0] as [number, number]))
    for (const [i, base] of pool) {
      const e = this.entities[i]
      if (opts.sources && !opts.sources.includes(e.ref.source)) continue
      let score = base
      let matched = ''
      let ok = true
      for (const f of filters) {
        const hit = e.props.find((p) =>
          p.value !== null && endsWithField(p.field, f.field) && norm(String(p.value)).includes(f.value))
        if (!hit) { ok = false; break }
        score += 3
        matched = `${hit.path}: ${hit.display}`
      }
      if (!ok) continue
      if (!matched) matched = this.describeMatch(e, plain)
      filtered.push({ i, score, matched })
    }
    filtered.sort((a, b) => b.score - a.score || this.entities[a.i].label.localeCompare(this.entities[b.i].label))
    return filtered.slice(0, limit).map((h) => ({ entity: this.entities[h.i], score: h.score, matched: h.matched }))
  }

  private matchTerm(term: string): Map<number, number> {
    const out = new Map<number, number>()
    const bump = (m: Map<number, number>, factor: number): void => {
      for (const [i, w] of m) out.set(i, Math.max(out.get(i) ?? 0, w * factor))
    }
    const exact = this.postings.get(term)
    if (exact) bump(exact, 1)
    const fuzzyK = term.length >= 8 ? 2 : term.length >= 4 ? 1 : 0
    for (const [tok, m] of this.postings) {
      if (tok === term) continue
      if (term.length >= 2 && tok.startsWith(term)) bump(m, 0.7)
      else if (fuzzyK > 0 && within(term, tok, fuzzyK)) bump(m, 0.45)
    }
    return out
  }

  private describeMatch(e: TwinEntity, terms: string[]): string {
    const labelToks = tokenize(e.label)
    if (terms.every((t) => labelToks.some((x) => x.startsWith(t)))) return e.label
    for (const p of e.props) {
      if (p.value === null) continue
      const toks = tokenize(String(p.value))
      if (terms.some((t) => toks.some((x) => x.startsWith(t) || (t.length >= 4 && within(t, x, 1))))) {
        return `${p.path}: ${p.display}`
      }
    }
    return e.label
  }

  /**
   * Everything connected to an entity, strongest first. `radiusM` bounds the
   * spatial links (scene metres — the scene is metric).
   */
  related(ref: TwinRef, opts: { radiusM?: number; limit?: number } = {}): TwinLink[] {
    const i = this.byKey.get(entityKey(ref))
    if (i === undefined) return []
    const me = this.entities[i]
    const radius = opts.radiusM ?? 30
    const links = new Map<number, TwinLink>()
    const link = (j: number, reason: LinkReason, strength: number): void => {
      if (j === i) return
      const l = links.get(j)
      if (l) { l.reasons.push(reason); l.strength += strength }
      else links.set(j, { entity: this.entities[j], reasons: [reason], strength })
    }

    // Shared identifiers / names.
    for (const v of this.linkValues[i]) {
      const owners = this.valueOwners.get(v)
      if (!owners || owners.length > MAX_LINK_FANOUT) continue
      for (const j of owners) {
        if (j === i) continue
        const other = this.entities[j]
        const fieldA = fieldCarrying(me, v)
        const fieldB = fieldCarrying(other, v)
        // The SAME field holding the same value in one layer is a category
        // ("line": "L3" on fifty segments), not a relation worth listing. A
        // DIFFERENT field holding it — a sensor's asset.station.code naming a
        // station's code — is a reference, wherever the two came from.
        const sameField = fieldA.replace(/\[\d+\]/g, '[]') === fieldB.replace(/\[\d+\]/g, '[]')
        const weak = other.ref.sourceId === me.ref.sourceId && sameField
        link(j, { type: 'sharedValue', value: displayCarrying(other, v), fieldA, fieldB }, weak ? 2 : 10)
      }
    }

    // Space.
    if (me.shape && me.shape.pts.length) {
      const b = shapeBox(me.shape)
      const c = this.cell
      const seen = new Set<number>(this.grid.get('*') ?? [])
      for (let gx = Math.floor((b.minX - radius) / c); gx <= Math.floor((b.maxX + radius) / c); gx++) {
        for (let gz = Math.floor((b.minZ - radius) / c); gz <= Math.floor((b.maxZ + radius) / c); gz++) {
          for (const j of this.grid.get(`${gx},${gz}`) ?? []) seen.add(j)
          if (seen.size > 5000) break
        }
      }
      for (const j of seen) {
        if (j === i) continue
        const other = this.entities[j]
        if (!other.shape) continue
        const d = shapeDistance(me.shape, other.shape)
        if (d.inside === 'a-in-b') link(j, { type: 'inside' }, 6)
        else if (d.inside === 'b-in-a') link(j, { type: 'contains' }, 5)
        else if (d.distance <= radius) link(j, { type: 'near', distanceM: Math.round(d.distance * 10) / 10 }, 4 * (1 - d.distance / (radius * 1.5)))
      }
    }

    // Space alone would list every one of 400 IFC elements around a sensor in
    // a station. Keep only the closest few per source for space-only links;
    // anything linked by VALUE always stays.
    const perSource = new Map<string, TwinLink[]>()
    const kept: TwinLink[] = []
    for (const l of links.values()) {
      if (l.reasons.some((r) => r.type === 'sharedValue')) { kept.push(l); continue }
      const k = l.entity.ref.sourceId
      const list = perSource.get(k)
      if (list) list.push(l); else perSource.set(k, [l])
    }
    const dist = (l: TwinLink): number =>
      Math.min(...l.reasons.map((r) => (r.type === 'near' ? r.distanceM : 0)))
    for (const list of perSource.values()) {
      list.sort((a, b) => dist(a) - dist(b) || b.strength - a.strength)
      kept.push(...list.slice(0, SPATIAL_PER_SOURCE))
    }
    return kept
      .sort((a, b) => b.strength - a.strength || a.entity.label.localeCompare(b.entity.label))
      .slice(0, opts.limit ?? 40)
  }
}

function fieldCarrying(e: TwinEntity, v: string): string {
  if (norm(e.label) === v) return 'label'
  const p = e.props.find((x) => x.value !== null && norm(String(x.value)) === v)
  return p?.path ?? 'label'
}

/** The value as the data writes it ("PDG-01"), not its normalised key. */
function displayCarrying(e: TwinEntity, v: string): string {
  if (norm(e.label) === v) return e.label
  return e.props.find((x) => x.value !== null && norm(String(x.value)) === v)?.display ?? v
}

function endsWithField(field: string, wanted: string): boolean {
  const f = norm(field.replace(/\[\]/g, ''))
  return f === wanted || f.endsWith('.' + wanted) || f.endsWith('_' + wanted) || f.split('.').pop() === wanted
}

/** `station:"Plaça Catalunya" sensor` → filters + plain terms. */
export function parseQuery(q: string): { plain: string[]; filters: Array<{ field: string; value: string }> } {
  const filters: Array<{ field: string; value: string }> = []
  const rest = q.replace(/([\p{L}\p{N}_.\[\]-]+):(?:"([^"]*)"|(\S+))/gu, (_, field: string, quoted?: string, bare?: string) => {
    const value = norm(quoted ?? bare ?? '')
    if (value) filters.push({ field: norm(field), value })
    return ' '
  })
  const plain = tokenize(rest.replace(/"/g, ' '))
  return { plain, filters }
}
