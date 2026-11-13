// ─── Revision compare for 2D sheets ───────────────────────────────────────────
// Two sets of sheets (two PDFs, usually), old and new. Pair the sheets by their
// number or title, not their order; register each old sheet onto its new one
// (align.ts); leave the frame and title block out, because every revision
// changes its date and letter; compare what is left with a tolerance in paper
// millimetres; and gather what changed into revision clouds, one box per place.
// The result lives in B's sheet units, so it overlays B and exports onto B.
// Pure: tests feed it entities, the panel feeds it what pdf.js read.

import { alignSheets, area, boundsOf, detectFrame, grow, inside, isFurniture, overlaps, segmentsOf, type Alignment, type Seg, type SheetFrame } from './align'
import { DIFF_LAYERS } from './diff'
import { entityExtent, toModel, type Bounds2, type Layer, type NewEntity, type Placement, type Pt } from './types'

export interface RevisionSheet {
  /** Page number in its file, 1-based. */
  pageNumber: number
  width: number
  height: number
  /** Millimetres per sheet unit (PDF: 25.4 / 72). */
  mmPerUnit: number
  entities: NewEntity[]
}

export interface RevisionCloud {
  id: number
  /** In B's sheet units, already padded. */
  bounds: Bounds2
  added: number
  removed: number
  /** Text that appeared or went, to say what the cloud is about. */
  texts: string[]
}

export type SheetStatus = 'compared' | 'notVector' | 'onlyA' | 'onlyB' | 'noAlignment'

export interface SheetComparison {
  a: RevisionSheet | null
  b: RevisionSheet | null
  label: string
  status: SheetStatus
  alignment: Alignment | null
  /** Overlay in B's units: grey same, red only in A, green only in B, clouds. */
  layers: Layer[]
  entities: NewEntity[]
  clouds: RevisionCloud[]
  added: number
  removed: number
  same: number
  /** What was left out of the comparison, in B's units. */
  excluded: Bounds2[]
}

export interface CompareOptions {
  /** Two lines are the same when within this, in mm of B's paper. */
  toleranceMm?: number
  /** Changes closer than this share a cloud, in mm of B's paper. */
  cloudGapMm?: number
  /** Extra zones to leave out, in B's units (and, mapped back, A's). */
  exclude?: Bounds2[]
  /** Leave the detected title block in. Off by default. */
  keepTitleBlock?: boolean
}

export const CLOUD_LAYER = 'REVISION CLOUDS'
export const CLOUD_COLOR = '#ff2d2d'
/** Fewer vector lines than this and the page is a picture: a scan. */
const MIN_VECTOR_SEGMENTS = 8

export function revisionLayers(): Layer[] {
  return [
    { name: DIFF_LAYERS.same, color: '#8a909c', visible: true, locked: false },
    { name: DIFF_LAYERS.removed, color: '#ff5a5a', visible: true, locked: false },
    { name: DIFF_LAYERS.added, color: '#2fbf71', visible: true, locked: false },
    { name: CLOUD_LAYER, color: CLOUD_COLOR, visible: true, locked: false },
  ]
}

// ── sheet identity ────────────────────────────────────────────────────────────

const tokenize = (s: string) => s.toLowerCase().split(/[\s,;:|/()]+/).filter((t) => t.length >= 2)
/** Tokens with a digit (A-101, 02, L2) say which sheet far more than words do. */
const weight = (t: string) => (/\d/.test(t) ? 3 : 1)

export interface SheetIdentity { tokens: Set<string>; label: string }

/** Who a sheet is, read from its title block (or, without one, its text). */
export function sheetIdentity(sheet: RevisionSheet, frame = detectFrame(sheet.entities, sheet)): SheetIdentity {
  const texts = sheet.entities.filter((e): e is Extract<NewEntity, { kind: 'text' }> => e.kind === 'text')
  const zone = frame.titleBlock
  const own = zone ? texts.filter((t) => inside(t.at, grow(zone, 1))) : texts
  const tokens = new Set(own.flatMap((t) => tokenize(t.text)))
  // A sheet number looks like A-101 or 02.03; failing that, the largest text in the block.
  const number = own.find((t) => /^[A-Z]{1,4}[-_. ]?\d{2,4}([._-]\d{1,3})?$/i.test(t.text.trim()) && !/^(p|c|rev)\d{1,2}$/i.test(t.text.trim()))
  const biggest = [...own].sort((x, y) => y.height - x.height)[0]
  const label = (number ?? biggest)?.text.trim() || `#${sheet.pageNumber}`
  return { tokens, label }
}

function similarity(x: Set<string>, y: Set<string>): number {
  let common = 0; let all = 0
  for (const t of x) { all += weight(t); if (y.has(t)) common += weight(t) }
  for (const t of y) if (!x.has(t)) all += weight(t)
  return all ? common / all : 0
}

/**
 * Pair old and new sheets by what their title blocks say, so a set that was
 * reordered, or gained a sheet, still pairs right. Greedy on the best score;
 * what is left pairs by order when it has no text to go by.
 */
export function matchSheets(a: readonly SheetIdentity[], b: readonly SheetIdentity[]): [number | null, number | null][] {
  const scored: { i: number; j: number; s: number }[] = []
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    const sameLabel = a[i].label === b[j].label && !a[i].label.startsWith('#') ? 1 : 0
    scored.push({ i, j, s: similarity(a[i].tokens, b[j].tokens) + sameLabel })
  }
  scored.sort((x, y) => y.s - x.s || Math.abs(x.i - x.j) - Math.abs(y.i - y.j))
  const usedA = new Set<number>(); const usedB = new Set<number>()
  const pairs: [number | null, number | null][] = []
  for (const { i, j, s } of scored) {
    if (s < 0.35 || usedA.has(i) || usedB.has(j)) continue
    usedA.add(i); usedB.add(j); pairs.push([i, j])
  }
  // No text to tell them apart (both empty): fall back to page order.
  const restA = a.map((_, i) => i).filter((i) => !usedA.has(i))
  const restB = b.map((_, j) => j).filter((j) => !usedB.has(j))
  while (restA.length && restB.length && !a[restA[0]].tokens.size && !b[restB[0]].tokens.size) pairs.push([restA.shift()!, restB.shift()!])
  for (const i of restA) pairs.push([i, null])
  for (const j of restB) pairs.push([null, j])
  pairs.sort((x, y) => (x[1] ?? Infinity) - (y[1] ?? Infinity) || (x[0] ?? 0) - (y[0] ?? 0))
  return pairs
}

// ── tolerant comparison ───────────────────────────────────────────────────────

/** Segments by grid cell, each filed under every cell its tolerance band reaches: one cell answers a query. */
class SegGrid {
  private cells = new Map<number, Seg[]>()
  private static readonly EMPTY: Seg[] = []
  constructor(segs: readonly Seg[], private cell: number, pad: number) {
    for (const s of segs) {
      const i0 = Math.floor((Math.min(s.a.x, s.b.x) - pad) / cell); const i1 = Math.floor((Math.max(s.a.x, s.b.x) + pad) / cell)
      const j0 = Math.floor((Math.min(s.a.y, s.b.y) - pad) / cell); const j1 = Math.floor((Math.max(s.a.y, s.b.y) + pad) / cell)
      // A long diagonal crosses only the cells near its line: walk it instead of filling its box.
      const steps = Math.max(i1 - i0, j1 - j0)
      if (steps > 16 && i1 - i0 > 2 && j1 - j0 > 2) {
        const n = steps * 2
        for (let k = 0; k <= n; k++) {
          const t = k / n
          const i = Math.floor((s.a.x + (s.b.x - s.a.x) * t) / cell); const j = Math.floor((s.a.y + (s.b.y - s.a.y) * t) / cell)
          for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) this.add(i + di, j + dj, s)
        }
        continue
      }
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) this.add(i, j, s)
    }
  }
  private add(i: number, j: number, s: Seg) {
    const k = (i + 0x8000) * 0x10000 + (j + 0x8000)
    const list = this.cells.get(k)
    if (!list) this.cells.set(k, [s]); else if (list[list.length - 1] !== s && !(list.length > 1 && list[list.length - 2] === s)) list.push(s)
  }
  near(p: Pt): readonly Seg[] {
    return this.cells.get((Math.floor(p.x / this.cell) + 0x8000) * 0x10000 + (Math.floor(p.y / this.cell) + 0x8000)) ?? SegGrid.EMPTY
  }
}

function distToSeg(p: Pt, s: Seg): number {
  const dx = s.b.x - s.a.x; const dy = s.b.y - s.a.y
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / l2)) : 0
  return Math.hypot(p.x - (s.a.x + t * dx), p.y - (s.a.y + t * dy))
}

/** Is this segment drawn in the other sheet, however its lines were split? */
function covered(s: Seg, grid: SegGrid, tol: number, step: number): boolean {
  const dx = s.b.x - s.a.x; const dy = s.b.y - s.a.y
  const len = Math.hypot(dx, dy)
  const n = Math.max(2, Math.min(200, Math.ceil(len / step)))
  for (let k = 0; k <= n; k++) {
    const p = { x: s.a.x + (dx * k) / n, y: s.a.y + (dy * k) / n }
    let hit = false
    for (const o of grid.near(p)) {
      if (distToSeg(p, o) > tol) continue
      // Same heading, or a dot of a crossing line would count as the line.
      const ox = o.b.x - o.a.x; const oy = o.b.y - o.a.y
      const ol = Math.hypot(ox, oy)
      if (len > tol * 2 && ol > tol * 2 && Math.abs(dx * oy - dy * ox) / (len * ol) > 0.09) continue
      hit = true; break
    }
    if (!hit) return false
  }
  return true
}

type Text = Extract<NewEntity, { kind: 'text' }>

interface Item { seg?: Seg; text?: Text; box: Bounds2 }

function itemsOf(entities: readonly NewEntity[], map: (p: Pt) => Pt, scale: number, rotation: number): Item[] {
  const out: Item[] = []
  for (const e of entities) {
    if (e.kind === 'text') {
      const at = map(e.at)
      const t: Text = { ...e, at, height: e.height * scale, rotation: e.rotation + rotation }
      out.push({ text: t, box: boundsOf(entityExtent(t as Parameters<typeof entityExtent>[0])) })
      continue
    }
    for (const s of segmentsOf([e])) {
      const seg = { a: map(s.a), b: map(s.b) }
      out.push({ seg, box: boundsOf([seg.a, seg.b]) })
    }
  }
  return out
}

function textPresent(t: Text, others: readonly Text[], tol: number): boolean {
  const s = t.text.trim()
  return others.some((o) => o.text.trim() === s && Math.hypot(o.at.x - t.at.x, o.at.y - t.at.y) <= Math.max(tol * 3, t.height))
}

/** Changes close together share a cloud: union of boxes closer than `gap`. */
export function clusterBoxes(boxes: readonly Bounds2[], gap: number): number[][] {
  const parent = boxes.map((_, i) => i)
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
  const order = boxes.map((_, i) => i).sort((x, y) => boxes[x].minX - boxes[y].minX)
  for (let u = 0; u < order.length; u++) {
    const i = order[u]; const bi = grow(boxes[i], gap)
    for (let v = u + 1; v < order.length; v++) {
      const j = order[v]
      if (boxes[j].minX > bi.maxX) break
      if (overlaps(bi, boxes[j])) parent[find(i)] = find(j)
    }
  }
  const groups = new Map<number, number[]>()
  for (let i = 0; i < boxes.length; i++) {
    const r = find(i)
    const g = groups.get(r)
    if (g) g.push(i); else groups.set(r, [i])
  }
  return [...groups.values()]
}

/** A revision cloud around a box: a closed run of outward arcs, the way it is drawn by hand. */
export function cloudOutline(b: Bounds2, arc: number): Pt[] {
  const pts: Pt[] = []
  const corners: Pt[] = [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }]
  for (let c = 0; c < 4; c++) {
    const p = corners[c]; const q = corners[(c + 1) % 4]
    const len = Math.hypot(q.x - p.x, q.y - p.y)
    const n = Math.max(1, Math.round(len / arc))
    // Outward normal of a counter-clockwise box.
    const nx = (q.y - p.y) / (len || 1); const ny = -(q.x - p.x) / (len || 1)
    for (let k = 0; k < n; k++) {
      const s = { x: p.x + ((q.x - p.x) * k) / n, y: p.y + ((q.y - p.y) * k) / n }
      const e = { x: p.x + ((q.x - p.x) * (k + 1)) / n, y: p.y + ((q.y - p.y) * (k + 1)) / n }
      const r = len / n / 2
      for (let m = 0; m < 6; m++) {
        const t = m / 6
        const bulge = Math.sin(Math.PI * t) * r * 0.8
        pts.push({ x: s.x + (e.x - s.x) * t + nx * bulge, y: s.y + (e.y - s.y) * t + ny * bulge })
      }
    }
  }
  return pts
}

/** Sheet A onto sheet B. Both are already one sheet each; `compareSheetSets` pairs them. */
export function compareSheets(a: RevisionSheet, b: RevisionSheet, o: CompareOptions = {}, label = ''): SheetComparison {
  const base = { a, b, label, layers: revisionLayers(), entities: [] as NewEntity[], clouds: [] as RevisionCloud[], added: 0, removed: 0, same: 0, excluded: [] as Bounds2[] }
  const segA = segmentsOf(a.entities); const segB = segmentsOf(b.entities)
  if (segA.length < MIN_VECTOR_SEGMENTS || segB.length < MIN_VECTOR_SEGMENTS) return { ...base, status: 'notVector', alignment: null }

  const fA = detectFrame(a.entities, a); const fB = detectFrame(b.entities, b)
  const noTb = (f: SheetFrame): SheetFrame => (o.keepTitleBlock ? { ...f, titleBlock: null } : f)
  const bandA = 1 / a.mmPerUnit; const bandB = 1 / b.mmPerUnit
  const zonesB = o.exclude ?? []
  const keptB = b.entities.filter((e) => !isFurniture(e, noTb(fB), zonesB, bandB))
  const keptA0 = a.entities.filter((e) => !isFurniture(e, noTb(fA), [], bandA))

  const alignment = alignSheets(segmentsOf(keptA0), segmentsOf(keptB), { mmPerUnitA: a.mmPerUnit, mmPerUnitB: b.mmPerUnit, toleranceMm: Math.max(1, o.toleranceMm ?? 0.5), frameA: fA, frameB: fB })
  if (alignment.method === 'identity' || alignment.inlierRatio < 0.2) return { ...base, status: 'noAlignment', alignment }
  const P: Placement = alignment.placement
  const map = (p: Pt) => toModel(P, p)

  const excluded: Bounds2[] = [...zonesB]
  const tbB = noTb(fB).titleBlock
  if (tbB) excluded.push(tbB)
  const tol = (o.toleranceMm ?? 0.5) / b.mmPerUnit
  // A's content that lands on B's furniture can't be compared: B has nothing there to say.
  const inB = (box: Bounds2) => !excluded.some((z) => overlaps(z, box)) && (!fB.frame || overlaps(fB.frame, box))
  const itemsA = itemsOf(keptA0, map, P.scale, P.rotation).filter((it) => inB(it.box))
  const itemsB = itemsOf(keptB, (p) => p, 1, 0)

  const cell = Math.max(tol * 4, 2 / b.mmPerUnit)
  const gridA = new SegGrid(itemsA.flatMap((i) => (i.seg ? [i.seg] : [])), cell, tol)
  const gridB = new SegGrid(itemsB.flatMap((i) => (i.seg ? [i.seg] : [])), cell, tol)
  const textsA = itemsA.flatMap((i) => (i.text ? [i.text] : []))
  const textsB = itemsB.flatMap((i) => (i.text ? [i.text] : []))
  const step = 5 / b.mmPerUnit

  const entities: NewEntity[] = []
  const changes: { box: Bounds2; added: boolean; text?: string }[] = []
  let added = 0; let removed = 0; let same = 0
  const emit = (it: Item, layer: string) => {
    if (it.seg) entities.push({ kind: 'line', layer, color: null, a: it.seg.a, b: it.seg.b })
    else if (it.text) entities.push({ ...it.text, layer, color: null })
  }
  for (const it of itemsB) {
    const ok = it.seg ? covered(it.seg, gridA, tol, step) : textPresent(it.text!, textsA, tol)
    if (ok) { same++; emit(it, DIFF_LAYERS.same) } else { added++; emit(it, DIFF_LAYERS.added); changes.push({ box: it.box, added: true, text: it.text?.text }) }
  }
  for (const it of itemsA) {
    const ok = it.seg ? covered(it.seg, gridB, tol, step) : textPresent(it.text!, textsB, tol)
    if (!ok) { removed++; emit(it, DIFF_LAYERS.removed); changes.push({ box: it.box, added: false, text: it.text?.text }) }
  }

  const gap = (o.cloudGapMm ?? 8) / b.mmPerUnit
  const pad = 3 / b.mmPerUnit
  const clouds: RevisionCloud[] = clusterBoxes(changes.map((c) => c.box), gap).map((g, k) => {
    let box = changes[g[0]].box
    for (const i of g) {
      const c = changes[i].box
      box = { minX: Math.min(box.minX, c.minX), minY: Math.min(box.minY, c.minY), maxX: Math.max(box.maxX, c.maxX), maxY: Math.max(box.maxY, c.maxY) }
    }
    const texts = [...new Set(g.flatMap((i) => (changes[i].text ? [changes[i].text!.trim()] : [])))]
    return { id: k + 1, bounds: grow(box, pad), added: g.filter((i) => changes[i].added).length, removed: g.filter((i) => !changes[i].added).length, texts }
  })
  // Top to bottom, left to right: the order a sheet is read in.
  clouds.sort((x, y) => y.bounds.maxY - x.bounds.maxY || x.bounds.minX - y.bounds.minX)
  clouds.forEach((c, i) => { c.id = i + 1 })
  entities.push(...cloudEntities(clouds, b.mmPerUnit))
  return { ...base, status: 'compared', alignment, entities, clouds, added, removed, same, excluded }
}

export function cloudEntities(clouds: readonly RevisionCloud[], mmPerUnit: number): NewEntity[] {
  const out: NewEntity[] = []
  for (const c of clouds) {
    out.push({ kind: 'polyline', layer: CLOUD_LAYER, color: CLOUD_COLOR, points: cloudOutline(c.bounds, 6 / mmPerUnit), closed: true })
    out.push({ kind: 'text', layer: CLOUD_LAYER, color: CLOUD_COLOR, at: { x: c.bounds.maxX + 1.5 / mmPerUnit, y: c.bounds.maxY + 1.5 / mmPerUnit }, height: 3.5 / mmPerUnit, rotation: 0, text: String(c.id), align: 'left' })
  }
  return out
}

/** Regions whose clouds come back on every compared sheet: the title block, in all but name. */
export function commonChangeZones(results: readonly SheetComparison[]): Bounds2[] {
  const compared = results.filter((r) => r.status === 'compared')
  if (compared.length < 2) return []
  const iou = (x: Bounds2, y: Bounds2) => {
    const i = area({ minX: Math.max(x.minX, y.minX), minY: Math.max(x.minY, y.minY), maxX: Math.min(x.maxX, y.maxX), maxY: Math.min(x.maxY, y.maxY) })
    return i / (area(x) + area(y) - i || 1)
  }
  return compared[0].clouds
    .filter((c) => compared.every((r) => r.clouds.some((d) => iou(c.bounds, d.bounds) > 0.5)))
    .map((c) => c.bounds)
}

export interface SetComparison {
  sheets: SheetComparison[]
  /** Zones found to change on every sheet and left out after a second pass. */
  autoExcluded: Bounds2[]
  /** Pages with no vectors (scans): reported, not compared. */
  notVector: number
}

/** Old set → new set: pair, register, compare, cloud. */
export function compareSheetSets(a: readonly RevisionSheet[], b: readonly RevisionSheet[], o: CompareOptions = {}): SetComparison {
  const idA = a.map((s) => sheetIdentity(s)); const idB = b.map((s) => sheetIdentity(s))
  const pairs = matchSheets(idA, idB)
  const run = (opts: CompareOptions) => pairs.map(([i, j]): SheetComparison => {
    const sa = i === null ? null : a[i]; const sb = j === null ? null : b[j]
    const label = (j !== null ? idB[j].label : idA[i!].label)
    if (sa && sb) return compareSheets(sa, sb, opts, label)
    return { a: sa, b: sb, label, status: sa ? 'onlyA' : 'onlyB', alignment: null, layers: revisionLayers(), entities: [], clouds: [], added: 0, removed: 0, same: 0, excluded: [] }
  })
  let sheets = run(o)
  const autoExcluded = commonChangeZones(sheets)
  if (autoExcluded.length) sheets = run({ ...o, exclude: [...(o.exclude ?? []), ...autoExcluded] })
  return { sheets, autoExcluded, notVector: sheets.filter((s) => s.status === 'notVector').length }
}
