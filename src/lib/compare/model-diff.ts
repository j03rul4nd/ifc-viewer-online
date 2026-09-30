// ─── compare/model-diff.ts ────────────────────────────────────────────────────
// Pure diff of two versions of a SET of IFC files. A single file is a set of
// one. Pure: no web-ifc, no DOM — unit-tested on hand-built snapshots.
//
// Identity is the GlobalId across the WHOLE set, not per file: when a wall is
// moved from ARQ.ifc to ARQ-core.ifc between two deliveries it is the same
// wall, modified ('file'), not one removal plus one addition. File pairing is
// computed on top, for the per-file summary only.

import type {
  ChangeCategory, DiffCounts, DiffOptions, ElementDiff, FieldChange, FilePairing,
  ModelSnapshot, Scalar, SetDiff, SnapElement,
} from './types'
import { CHANGE_CATEGORIES } from './types'
import { pairSnapshots } from './pairing'

const DEFAULT_IGNORED_ATTRIBUTES = ['GlobalId', 'Name', 'PredefinedType']
/** Psets whose values authoring tools rewrite on every export. */
const DEFAULT_IGNORED_PSETS: string[] = []

const zeroCounts = (): DiffCounts => ({ added: 0, removed: 0, modified: 0, unchanged: 0 })

interface Located { el: SnapElement; file: string }

/** GlobalId → element across a set; duplicates are counted and the first kept. */
function indexSet(snaps: readonly ModelSnapshot[]): { map: Map<string, Located>; duplicates: number } {
  const map = new Map<string, Located>()
  let duplicates = 0
  for (const s of snaps) {
    for (const el of s.elements) {
      const gid = el.globalId
      if (!gid) continue
      if (map.has(gid)) { duplicates++; continue }
      map.set(gid, { el, file: s.fileName })
    }
  }
  return { map, duplicates }
}

function sameScalar(a: Scalar | undefined, b: Scalar | undefined, tol: number): boolean {
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number') {
    const scale = Math.max(Math.abs(a), Math.abs(b), 1)
    return Math.abs(a - b) <= tol * scale
  }
  // "3" vs 3 — the same value written by two exporters.
  if (a != null && b != null && String(a) === String(b)) return true
  return false
}

function sortedUnique(list: readonly string[] | undefined): string[] {
  return [...new Set(list ?? [])].sort()
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function classificationKeys(el: SnapElement): string[] {
  return sortedUnique((el.classifications ?? []).map((c) => `${c.system ?? ''}:${c.value ?? ''}`))
}

/** Compare two versions of one element. Empty result = unchanged. */
export function diffElement(
  base: SnapElement, head: SnapElement, opts: DiffOptions = {},
  files?: { base: string; head: string },
): { changes: FieldChange[]; moveDistance?: number } {
  const tol = opts.numericTolerance ?? 1e-6
  const moveTol = opts.moveTolerance ?? 0.001
  // Name / PredefinedType are compared on their own (name, class) — never twice.
  const ignoredAttrs = new Set([...DEFAULT_IGNORED_ATTRIBUTES, ...(opts.ignoreAttributes ?? [])])
  const ignoredPsets = new Set(opts.ignorePsets ?? DEFAULT_IGNORED_PSETS)
  const changes: FieldChange[] = []
  const push = (category: ChangeCategory, key: string, before: FieldChange['before'], after: FieldChange['after']): void => {
    changes.push({ category, key, before, after })
  }

  if (files && files.base !== files.head) push('file', '', files.base, files.head)

  const bType = `${base.ifcClass}${base.predefinedType ? '.' + base.predefinedType : ''}`
  const hType = `${head.ifcClass}${head.predefinedType ? '.' + head.predefinedType : ''}`
  if (bType !== hType) push('class', '', bType, hType)

  if ((base.name ?? null) !== (head.name ?? null)) push('name', 'Name', base.name ?? null, head.name ?? null)

  const attrKeys = new Set([...Object.keys(base.attributes), ...Object.keys(head.attributes)])
  for (const k of [...attrKeys].sort()) {
    if (ignoredAttrs.has(k)) continue
    const a = base.attributes[k], b = head.attributes[k]
    // Absent vs explicit null is not a change a user can see.
    if ((a ?? null) === null && (b ?? null) === null) continue
    if (!sameScalar(a, b, tol)) push('attribute', k, a ?? null, b ?? null)
  }

  const psetNames = new Set([...Object.keys(base.psets), ...Object.keys(head.psets)])
  for (const ps of [...psetNames].sort()) {
    if (ignoredPsets.has(ps)) continue
    const bp = base.psets[ps] ?? {}, hp = head.psets[ps] ?? {}
    const props = new Set([...Object.keys(bp), ...Object.keys(hp)])
    for (const p of [...props].sort()) {
      const inB = p in bp, inH = p in hp
      if (inB && inH && sameScalar(bp[p], hp[p], tol)) continue
      push('property', `${ps}.${p}`, inB ? bp[p] : undefined, inH ? hp[p] : undefined)
    }
  }

  const bm = sortedUnique(base.materials), hm = sortedUnique(head.materials)
  if (!sameList(bm, hm)) push('material', '', bm, hm)

  const bc = classificationKeys(base), hc = classificationKeys(head)
  if (!sameList(bc, hc)) push('classification', '', bc, hc)

  if ((base.storey ?? null) !== (head.storey ?? null)) push('container', '', base.storey ?? null, head.storey ?? null)

  let moveDistance: number | undefined
  if (base.geo && head.geo) {
    const [x0, y0, z0] = base.geo.c, [x1, y1, z1] = head.geo.c
    const d = Math.hypot(x1 - x0, y1 - y0, z1 - z0)
    if (d > moveTol) { moveDistance = d; push('placement', '', `${x0.toFixed(3)},${y0.toFixed(3)},${z0.toFixed(3)}`, `${x1.toFixed(3)},${y1.toFixed(3)},${z1.toFixed(3)}`) }
    // The hash covers placement too; only call it a shape change when the
    // element did not simply move.
    else if (base.geo.h !== head.geo.h) push('geometry', '', base.geo.h, head.geo.h)
  }

  return { changes, moveDistance }
}

const STATUS_ORDER: Record<ElementDiff['status'], number> = { removed: 0, added: 1, modified: 2, unchanged: 3 }

/** Diff two versions of a set of files. `base`/`head` may each hold 1..n snapshots. */
export function diffSnapshotSets(
  base: readonly ModelSnapshot[], head: readonly ModelSnapshot[],
  labels: { base: string; head: string } = { base: 'Base', head: 'Head' },
  opts: DiffOptions = {},
): SetDiff {
  const b = indexSet(base), h = indexSet(head)
  // Files are renamed every delivery (ARQ_v03 → ARQ_v04): an element changed
  // file only when it left the file its old file was paired with.
  const pairs = pairSnapshots(base, head)
  const pairedHead = new Map(pairs.filter((p) => p.base && p.head).map((p) => [p.base!, p.head!]))
  const geometryCompared = base.length > 0 && head.length > 0 && base.every((s) => s.geometry) && head.every((s) => s.geometry)

  const counts = zeroCounts()
  const byClass: Record<string, DiffCounts> = {}
  const byStorey: Record<string, DiffCounts> = {}
  const byCategory = Object.fromEntries(CHANGE_CATEGORIES.map((c) => [c, 0])) as Record<ChangeCategory, number>
  const perFile = new Map<string, DiffCounts>() // keyed "base|head"
  const elements: ElementDiff[] = []

  const bump = (rec: Record<string, DiffCounts>, key: string, status: ElementDiff['status']): void => {
    (rec[key] ??= zeroCounts())[status]++
  }

  const record = (d: ElementDiff): void => {
    counts[d.status]++
    bump(byClass, d.ifcClass, d.status)
    bump(byStorey, d.storey ?? '—', d.status)
    // Per-file tally follows the element's file on each side; a file move
    // counts against the head file (where the reader will look for it).
    const fileKey = d.status === 'removed' ? `${d.baseFile}|` : `|${d.headFile}`
    const fc = perFile.get(fileKey) ?? zeroCounts()
    fc[d.status]++
    perFile.set(fileKey, fc)
    if (d.status !== 'unchanged') elements.push(d)
    for (const cat of new Set(d.changes.map((c) => c.category))) byCategory[cat]++
  }

  for (const [gid, bl] of b.map) {
    const hl = h.map.get(gid)
    if (!hl) {
      record({
        globalId: gid, status: 'removed', ifcClass: bl.el.ifcClass, name: bl.el.name ?? null,
        storey: bl.el.storey ?? null, baseFile: bl.file, baseExpressId: bl.el.expressId, changes: [],
      })
      continue
    }
    const movedFile = pairedHead.get(bl.file) !== hl.file
    const { changes, moveDistance } = diffElement(bl.el, hl.el, opts, movedFile ? { base: bl.file, head: hl.file } : undefined)
    // Geometry compared only when both sides have it — a snapshot taken
    // without geometry must not read as "every shape changed".
    const kept = geometryCompared ? changes : changes.filter((c) => c.category !== 'geometry' && c.category !== 'placement')
    record({
      globalId: gid, status: kept.length ? 'modified' : 'unchanged', ifcClass: hl.el.ifcClass,
      name: hl.el.name ?? null, storey: hl.el.storey ?? null, baseFile: bl.file, headFile: hl.file,
      baseExpressId: bl.el.expressId, headExpressId: hl.el.expressId, changes: kept,
      moveDistance: geometryCompared ? moveDistance : undefined,
    })
  }
  for (const [gid, hl] of h.map) {
    if (b.map.has(gid)) continue
    record({
      globalId: gid, status: 'added', ifcClass: hl.el.ifcClass, name: hl.el.name ?? null,
      storey: hl.el.storey ?? null, headFile: hl.file, headExpressId: hl.el.expressId, changes: [],
    })
  }

  elements.sort((x, y) => STATUS_ORDER[x.status] - STATUS_ORDER[y.status]
    || x.ifcClass.localeCompare(y.ifcClass) || x.globalId.localeCompare(y.globalId))

  // Per-file summary: attribute every element's status to its file pair.
  const files: FilePairing[] = pairs.map((p) => {
    const c = zeroCounts()
    for (const [key, fc] of perFile) {
      const [bf, hf] = key.split('|')
      if ((bf && bf === p.base) || (hf && hf === p.head)) {
        c.added += fc.added; c.removed += fc.removed; c.modified += fc.modified; c.unchanged += fc.unchanged
      }
    }
    return { ...p, counts: c }
  })

  return {
    baseLabel: labels.base, headLabel: labels.head, createdAt: Date.now(),
    counts, byClass, byStorey, byCategory, files, elements,
    duplicateGuids: { base: b.duplicates, head: h.duplicates },
    geometryCompared,
  }
}

/** Share of elements that changed, 0–100 — the headline "how much moved this week". */
export function churnPercent(counts: DiffCounts): number {
  const total = counts.added + counts.removed + counts.modified + counts.unchanged
  if (total === 0) return 0
  return Math.round(((counts.added + counts.removed + counts.modified) / total) * 1000) / 10
}
