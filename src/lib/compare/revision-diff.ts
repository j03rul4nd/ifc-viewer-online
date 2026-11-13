// ─── compare/revision-diff.ts ─────────────────────────────────────────────────
// Revision compare (spec 10 §3): what changed between two deliveries of a set
// of IFC files, in the words of a site engineer — moved 120 mm east, 200 mm
// taller, now a different type — instead of "modified".
//
// Pure, on snapshots only: changing a tolerance re-runs this, never re-reads
// the IFC files.
//
//   layer 1  GlobalId        (diffSnapshotSets)
//   layer 2  Tag / piece mark, same canonical class, unique on both sides
//   layer 3+ injected (`ctx.extraMatchers`, geometry and split/merge — T2)
//
// Then: origin correction, classification by kind, deltas and a summary key.

import type {
  ChangeCategory, DiffCounts, FieldChange, ModelSnapshot, Scalar, SnapElement,
} from './types'
import { CHANGE_CATEGORIES } from './types'
import { diffElement, diffSnapshotSets } from './model-diff'
import {
  canonicalClass, cardinalDirection, DEFAULT_IGNORE_PSETS, detectOriginShift, makeIgnoreMatcher, type Vec3,
} from './normalize'
import type {
  ChangeKind, GeoDelta, LocatedElement, MatchMethod, MatchPair, RevisionChange, RevisionContext,
  RevisionDiff, RevisionOptions,
} from './revision-types'
import { CHANGE_KIND_PRIORITY } from './revision-types'

export const DEFAULT_REVISION_OPTIONS: Required<RevisionOptions> = {
  moveTolerance: 0.005,
  numericTolerance: 1e-6,
  ignorePsets: [...DEFAULT_IGNORE_PSETS],
  ignoreAttributes: [],
  sizeTolerance: 0.005,
  volumeTolerance: 0.01,
  angleTolerance: 0.5,
  matchRadius: 0.25,
  markProperties: [],
}

/** Below this share of GlobalIds in common, two files of the same model had their ids regenerated. */
export const GUID_REGENERATED_SHARE = 0.3

export function resolveRevisionOptions(opts: RevisionOptions = {}): Required<RevisionOptions> {
  const o: Required<RevisionOptions> = { ...DEFAULT_REVISION_OPTIONS }
  for (const [k, v] of Object.entries(opts)) if (v !== undefined) (o as unknown as Record<string, unknown>)[k] = v
  return o
}

const zeroCounts = (): DiffCounts => ({ added: 0, removed: 0, modified: 0, unchanged: 0 })
const zeroKinds = (): Record<ChangeKind, number> =>
  Object.fromEntries(CHANGE_KIND_PRIORITY.map((k) => [k, 0])) as Record<ChangeKind, number>

interface Side {
  /** GlobalId → first element with it (duplicates skipped, as in diffSnapshotSets). */
  byGid: Map<string, LocatedElement>
  /** file → expressId → GlobalId, to compare parents across versions. */
  gidOf: Map<string, Map<number, string>>
  /** Elements without a GlobalId — only layers 2+ can match them. */
  noGid: LocatedElement[]
}

function indexSide(snaps: readonly ModelSnapshot[]): Side {
  const byGid = new Map<string, LocatedElement>()
  const gidOf = new Map<string, Map<number, string>>()
  const noGid: LocatedElement[] = []
  for (const s of snaps) {
    const ids = new Map<number, string>()
    gidOf.set(s.fileName, ids)
    for (const el of s.elements) {
      if (!el.globalId) { noGid.push({ el, file: s.fileName }); continue }
      ids.set(el.expressId, el.globalId)
      if (!byGid.has(el.globalId)) byGid.set(el.globalId, { el, file: s.fileName })
    }
  }
  return { byGid, gidOf, noGid }
}

/** Spatial structure is the frame of the model, not something that "changes". */
const SPATIAL = /^IFC(PROJECT|SITE|BUILDING|BUILDINGSTOREY|SPACE|FACILITY|FACILITYPART|BRIDGE|ROAD|RAILWAY|MARINEFACILITY)$/

function markValue(el: SnapElement, key: string): string | null {
  let v: Scalar | undefined
  if (key === 'Tag') v = el.attributes.Tag
  else {
    const dot = key.indexOf('.')
    if (dot < 0) v = el.attributes[key]
    else v = el.psets[key.slice(0, dot)]?.[key.slice(dot + 1)]
  }
  if (v == null) return null
  const s = String(v).trim()
  return s ? s : null
}

/** Layer 2: same canonical class + same mark, unique on both sides. Mutates the pools. */
function matchByMark(
  base: LocatedElement[], head: LocatedElement[], keys: readonly string[],
  schema: { base: string | null; head: string | null },
): MatchPair[] {
  const pairs: MatchPair[] = []
  for (const key of keys) {
    const group = (pool: LocatedElement[], sch: string | null): Map<string, LocatedElement | null> => {
      const m = new Map<string, LocatedElement | null>()
      for (const l of pool) {
        const v = markValue(l.el, key)
        if (v == null) continue
        const k = `${canonicalClass(l.el.ifcClass, sch)}|${v}`
        m.set(k, m.has(k) ? null : l) // null = not unique
      }
      return m
    }
    const bm = group(base, schema.base), hm = group(head, schema.head)
    const used = new Set<LocatedElement>()
    for (const [k, b] of bm) {
      const h = hm.get(k)
      if (!b || !h) continue
      pairs.push({ base: [b], head: [h], method: 'tag', confidence: 0.95 })
      used.add(b); used.add(h)
    }
    if (used.size) {
      for (let i = base.length - 1; i >= 0; i--) if (used.has(base[i])) base.splice(i, 1)
      for (let i = head.length - 1; i >= 0; i--) if (used.has(head[i])) head.splice(i, 1)
    }
  }
  return pairs
}

function parentKeys(l: LocatedElement, side: Side): string[] {
  const ids = side.gidOf.get(l.file)
  return (l.el.partOf ?? [])
    .filter((p) => p.relation !== 'IFCRELCONTAINEDINSPATIALSTRUCTURE') // compared as `container`
    .map((p) => `${p.relation}:${ids?.get(p.parentExpressId) ?? p.parentClass}`)
    .sort()
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
/**
 * web-ifc streams meshes Y-up (IFC x, y, z → x, z, −y): `geo.c` and `geo.s`
 * are in that frame. Deltas and sizes are reported in IFC axes (x east,
 * y north, z up) so "height" and compass words mean what they say.
 */
const toIfcVector = (v: Vec3): Vec3 => [v[0], 0 - v[2], v[1]] // 0 − x: never −0
const toIfcSize = (v: Vec3 | undefined): Vec3 | undefined => (v ? [v[0], v[2], v[1]] : undefined)
const mm = (m: number): number => Math.round(m * 1000)
const fmt = (v: FieldChange['before']): string | number =>
  v == null ? '—' : Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? String(v) : v

const RELATION_CATEGORIES = new Set<ChangeCategory>(['container', 'file'])
const PROPERTY_CATEGORIES = new Set<ChangeCategory>(['name', 'attribute', 'property', 'material', 'classification'])

interface Classified {
  kinds: ChangeKind[]
  changes: FieldChange[]
  delta?: GeoDelta
  noise: boolean
}

function classifyPair(
  b: LocatedElement, h: LocatedElement, o: Required<RevisionOptions>, shift: Vec3 | null,
  fileMoved: boolean, geometryCompared: boolean, ctx: { baseSide: Side; headSide: Side; schema: { base: string | null; head: string | null } },
  ignore: (pset: string, prop?: string) => boolean,
): Classified {
  const kinds = new Set<ChangeKind>()
  // Field changes, geometry handled below (diffElement's placement test knows nothing of origin shifts).
  const strip = (e: SnapElement): SnapElement => ({ ...e, geo: null })
  const { changes: raw } = diffElement(strip(b.el), strip(h.el), {
    numericTolerance: o.numericTolerance, ignoreAttributes: o.ignoreAttributes, ignorePsets: [],
  }, fileMoved ? { base: b.file, head: h.file } : undefined)
  const changes: FieldChange[] = []
  for (const c of raw) {
    if (c.category === 'property') {
      const dot = c.key.indexOf('.')
      if (ignore(c.key.slice(0, dot), c.key.slice(dot + 1))) continue
    }
    if (c.category === 'class') {
      const bc = canonicalClass(b.el.ifcClass, ctx.schema.base), hc = canonicalClass(h.el.ifcClass, ctx.schema.head)
      // IfcWallStandardCase → IfcWall with the same predefined type: not a change.
      if (bc === hc && (b.el.predefinedType ?? null) === (h.el.predefinedType ?? null)) continue
      kinds.add('type_changed')
    } else if (RELATION_CATEGORIES.has(c.category)) kinds.add('relations_changed')
    else if (PROPERTY_CATEGORIES.has(c.category)) kinds.add('properties_changed')
    changes.push(c)
  }
  // Relating IfcType — only when both snapshots recorded it (older baselines lack it).
  if (b.el.typeName !== undefined && h.el.typeName !== undefined && (b.el.typeName ?? null) !== (h.el.typeName ?? null)) {
    kinds.add('type_changed')
    changes.push({ category: 'class', key: 'Type', before: b.el.typeName ?? null, after: h.el.typeName ?? null })
  }
  const bp = parentKeys(b, ctx.baseSide), hp = parentKeys(h, ctx.headSide)
  if (bp.join('|') !== hp.join('|')) {
    kinds.add('relations_changed')
    changes.push({ category: 'container', key: 'partOf', before: bp, after: hp })
  }

  let delta: GeoDelta | undefined
  let noise = false
  const bg = b.el.geo, hg = h.el.geo
  if (geometryCompared && bg && hg) {
    const d = sub(sub(hg.c, bg.c), shift ?? [0, 0, 0])
    const dist = Math.hypot(d[0], d[1], d[2])
    const moved = dist > o.moveTolerance
    let reshaped: boolean
    if (bg.s && hg.s && bg.v != null && hg.v != null) {
      const sizeChanged = [0, 1, 2].some((k) => Math.abs(hg.s![k] - bg.s![k]) > o.sizeTolerance)
      const volChanged = Math.abs(hg.v - bg.v) > o.volumeTolerance * Math.max(bg.v, hg.v, 1e-9)
      reshaped = sizeChanged || volChanged
      // The hash covers tessellation + placement: changed with nothing else → re-tessellation.
      if (!reshaped && !moved && bg.h !== hg.h) noise = true
    } else {
      // Older baseline without size/volume: today's behaviour, by hash.
      reshaped = !moved && !shift && bg.h !== hg.h
    }
    // web-ifc's mesh origin follows the geometry, so a reshape shifts `c` too:
    // moved only without a reshape (spec §3.3).
    if (moved && !reshaped) {
      kinds.add('moved')
      const m = toIfcVector(d)
      delta = { move: m, moveDistance: dist, direction: cardinalDirection(m, o.moveTolerance) }
      changes.push({ category: 'placement', key: '', before: bg.c.map((v) => v.toFixed(3)).join(','), after: hg.c.map((v) => v.toFixed(3)).join(',') })
    }
    if (reshaped) {
      kinds.add('reshaped')
      delta = { ...delta, sizeBefore: toIfcSize(bg.s), sizeAfter: toIfcSize(hg.s), volumeBefore: bg.v, volumeAfter: hg.v }
      changes.push({ category: 'geometry', key: '', before: bg.h, after: hg.h })
    }
  }
  return { kinds: CHANGE_KIND_PRIORITY.filter((k) => kinds.has(k)), changes, delta, noise }
}

function summarize(kind: ChangeKind, c: Omit<RevisionChange, 'summary'>): RevisionChange['summary'] {
  switch (kind) {
    case 'added': case 'removed': case 'unchanged':
      return { key: kind, params: { class: c.ifcClass } }
    case 'moved': {
      const d = c.delta!
      return { key: 'moved_mm', params: { mm: mm(d.moveDistance ?? 0), dir: d.direction ?? '' } }
    }
    case 'reshaped': {
      const d = c.delta ?? {}
      if (d.sizeBefore && d.sizeAfter) {
        const diffs = [0, 1, 2].map((k) => Math.abs(d.sizeAfter![k] - d.sizeBefore![k]))
        const axis = diffs.indexOf(Math.max(...diffs))
        if (diffs[axis] > 0) {
          const params = { before: mm(d.sizeBefore[axis]), after: mm(d.sizeAfter[axis]) }
          return axis === 2 ? { key: 'height_mm', params } : { key: 'size_mm', params: { ...params, axis: 'xyz'[axis] } }
        }
      }
      if (d.volumeBefore != null && d.volumeAfter != null) {
        const pct = d.volumeBefore > 0 ? Math.round(((d.volumeAfter - d.volumeBefore) / d.volumeBefore) * 1000) / 10 : 0
        return { key: 'volume_m3', params: { before: d.volumeBefore, after: d.volumeAfter, pct } }
      }
      return { key: 'reshaped', params: {} }
    }
    case 'type_changed': {
      const ch = c.changes.find((x) => x.category === 'class')
      return { key: 'type_changed', params: { before: fmt(ch?.before), after: fmt(ch?.after) } }
    }
    case 'relations_changed': {
      const ch = c.changes.find((x) => x.category === 'container' || x.category === 'file')
      if (ch?.category === 'container' && ch.key === '') return { key: 'storey_changed', params: { before: fmt(ch.before), after: fmt(ch.after) } }
      if (ch?.category === 'file') return { key: 'file_changed', params: { before: fmt(ch.before), after: fmt(ch.after) } }
      return { key: 'relations_changed', params: {} }
    }
    case 'properties_changed': {
      const props = c.changes.filter((x) => PROPERTY_CATEGORIES.has(x.category))
      if (props.length === 1) {
        const p = props[0]
        return { key: 'property_changed', params: { key: p.key || p.category, before: fmt(p.before), after: fmt(p.after) } }
      }
      return { key: 'properties_changed', params: { count: props.length } }
    }
  }
}

/**
 * Diff two revisions of a set of IFC files (1..n snapshots per side).
 * `opts` are the user tolerances (serialised into the result); `ctx` carries
 * labels and the extra matchers of layers 3+ (functions, not serialised).
 */
export function diffRevisions(
  base: readonly ModelSnapshot[], head: readonly ModelSnapshot[],
  opts: RevisionOptions = {}, ctx: RevisionContext = {},
): RevisionDiff {
  const o = resolveRevisionOptions(opts)
  const labels = ctx.labels ?? { base: 'Base', head: 'Head' }
  // Layer 1 + file pairing + duplicate count: the existing engine.
  const set = diffSnapshotSets(base, head, labels, {
    moveTolerance: o.moveTolerance, numericTolerance: o.numericTolerance, ignoreAttributes: o.ignoreAttributes,
  })
  const geometryCompared = set.geometryCompared
  const schema = { base: base[0]?.schema ?? null, head: head[0]?.schema ?? null }
  const bs = indexSide(base), hs = indexSide(head)
  const ignore = makeIgnoreMatcher(o.ignorePsets)
  const pairedHead = new Map(set.files.filter((p) => p.base && p.head).map((p) => [p.base!, p.head!]))

  const pairs: MatchPair[] = []
  const unB: LocatedElement[] = [...bs.noGid], unH: LocatedElement[] = [...hs.noGid]
  for (const [gid, b] of bs.byGid) {
    const h = hs.byGid.get(gid)
    if (h) pairs.push({ base: [b], head: [h], method: 'guid', confidence: 1 })
    else unB.push(b)
  }
  for (const [gid, h] of hs.byGid) if (!bs.byGid.has(gid)) unH.push(h)

  // Origin shift from the GlobalId layer (the most trustworthy pairs).
  const deltas: Vec3[] = []
  if (geometryCompared) {
    for (const p of pairs) {
      const bg = p.base[0].el.geo, hg = p.head[0].el.geo
      if (bg && hg) deltas.push(sub(hg.c, bg.c))
    }
  }
  const shiftViewer = detectOriginShift(deltas, o.moveTolerance)
  // Subtracted in the mesh frame, reported in IFC axes.
  const originShift = shiftViewer ? toIfcVector(shiftViewer) : null

  // Layer 2, then injected layers.
  const spatial = (l: LocatedElement): boolean => SPATIAL.test(l.el.ifcClass.toUpperCase())
  const poolB = unB.filter((l) => !spatial(l)), poolH = unH.filter((l) => !spatial(l))
  pairs.push(...matchByMark(poolB, poolH, ['Tag', ...o.markProperties], schema))
  for (const m of ctx.extraMatchers ?? []) {
    const found = m(poolB, poolH, { options: o, originShift: shiftViewer, schema })
    const used = new Set(found.flatMap((p) => [...p.base, ...p.head]))
    for (let i = poolB.length - 1; i >= 0; i--) if (used.has(poolB[i])) poolB.splice(i, 1)
    for (let i = poolH.length - 1; i >= 0; i--) if (used.has(poolH[i])) poolH.splice(i, 1)
    pairs.push(...found)
  }
  // Spatial elements that lost their GlobalId stay outside the classification
  // pool on purpose: a renamed storey is reported, a re-created one is not an "add".
  poolB.push(...unB.filter(spatial))
  poolH.push(...unH.filter(spatial))

  // Classification.
  const changes: RevisionChange[] = []
  const counts = zeroCounts()
  const byKind = zeroKinds()
  const byClass: Record<string, DiffCounts> = {}
  const byStorey: Record<string, DiffCounts> = {}
  const byCategory = Object.fromEntries(CHANGE_CATEGORIES.map((c) => [c, 0])) as Record<ChangeCategory, number>
  let noise = 0
  const record = (c: RevisionChange): void => {
    counts[c.status]++
    byKind[c.kind]++
    ;(byClass[c.ifcClass] ??= zeroCounts())[c.status]++
    ;(byStorey[c.storey ?? '—'] ??= zeroCounts())[c.status]++
    for (const cat of new Set(c.changes.map((x) => x.category))) byCategory[cat]++
    if (c.kind !== 'unchanged') changes.push(c)
  }
  const gids = (ls: LocatedElement[]): string[] => ls.map((l) => l.el.globalId ?? '').filter(Boolean)
  const methodOf = (m: MatchMethod, conf: number, b: LocatedElement[], h: LocatedElement[]): RevisionChange['match'] =>
    ({ method: m, confidence: conf, baseGlobalIds: gids(b), headGlobalIds: gids(h) })

  for (const p of pairs) {
    const b = p.base[0], h = p.head[0]
    const fileMoved = pairedHead.get(b.file) !== h.file
    const cl = classifyPair(b, h, o, shiftViewer, fileMoved, geometryCompared, { baseSide: bs, headSide: hs, schema }, ignore)
    if (cl.noise) noise++
    // Split / merge (N:1, 1:N) are reshapes of the same piece of work by definition.
    let kinds = cl.kinds
    if ((p.base.length > 1 || p.head.length > 1) && !kinds.includes('reshaped')) {
      kinds = CHANGE_KIND_PRIORITY.filter((k) => k === 'reshaped' || kinds.includes(k))
    }
    const kind: ChangeKind = kinds[0] ?? 'unchanged'
    const partial: Omit<RevisionChange, 'summary'> = {
      globalId: h.el.globalId ?? b.el.globalId ?? '',
      status: kind === 'unchanged' ? 'unchanged' : 'modified',
      ifcClass: h.el.ifcClass, name: h.el.name ?? null, storey: h.el.storey ?? null,
      baseFile: b.file, headFile: h.file, baseExpressId: b.el.expressId, headExpressId: h.el.expressId,
      changes: cl.changes, moveDistance: cl.delta?.moveDistance,
      kind, kinds: kinds.length ? kinds : ['unchanged'],
      match: methodOf(p.method, p.confidence, p.base, p.head),
      delta: cl.delta,
    }
    if (partial.moveDistance === undefined) delete partial.moveDistance
    if (partial.delta === undefined) delete partial.delta
    record({ ...partial, summary: summarize(kind, partial) })
  }
  const lone = (l: LocatedElement, kind: 'added' | 'removed'): void => {
    const side = kind === 'removed' ? { baseFile: l.file, baseExpressId: l.el.expressId } : { headFile: l.file, headExpressId: l.el.expressId }
    const partial: Omit<RevisionChange, 'summary'> = {
      globalId: l.el.globalId ?? '', status: kind, ifcClass: l.el.ifcClass, name: l.el.name ?? null,
      storey: l.el.storey ?? null, ...side, changes: [], kind, kinds: [kind],
      match: methodOf('none', 0, kind === 'removed' ? [l] : [], kind === 'added' ? [l] : []),
    }
    record({ ...partial, summary: summarize(kind, partial) })
  }
  for (const l of poolB) lone(l, 'removed')
  for (const l of poolH) lone(l, 'added')

  const rank = Object.fromEntries(CHANGE_KIND_PRIORITY.map((k, i) => [k, i])) as Record<ChangeKind, number>
  changes.sort((x, y) => rank[x.kind] - rank[y.kind]
    || x.ifcClass.localeCompare(y.ifcClass) || x.globalId.localeCompare(y.globalId))

  // Same model (paired by project / file name) yet almost no GlobalId in common.
  const guidRegenerated = set.files.some((f) => f.base && f.head && f.reason !== 'unmatched' && f.overlap < GUID_REGENERATED_SHARE)

  const { elements: _elements, ...rest } = set
  return {
    ...rest,
    counts, byClass, byStorey, byCategory,
    version: 1, options: o, originShift, guidRegenerated, byKind, changes, noise,
  }
}
