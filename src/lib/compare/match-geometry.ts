// ─── compare/match-geometry.ts ────────────────────────────────────────────────
// Layer 3 of revision compare (spec 10 §3.2): pair what GlobalId and piece
// mark left unmatched by where it is and what it looks like. The case it is
// for: the author regenerated every GlobalId on export.
//
//   candidates  same canonical class, box centres ≤ matchRadius apart
//               (after removing the origin shift), via a uniform grid
//   score       0.5·IoU(AABB) + 0.3·proximity + 0.2·property similarity
//   assignment  greedy by descending score, accepted from 0.6
//
// Greedy on a global ranking is what keeps a grid of identical columns
// straight: each column scores ~1.0 with itself, so the one that moved only
// gets the leftovers and never steals a neighbour.
//
// Pure, on snapshots only.

import type { SnapElement } from './types'
import type { ExtraMatcher, LocatedElement, MatchPair, MatcherContext } from './revision-types'
import { canonicalClass, type Vec3 } from './normalize'

export const GEOMETRY_ACCEPT = 0.6
/** Shape likeness (IoU once anchored) needed to judge a pair by its anchor instead of its centre. */
export const ANCHOR_MIN_IOU = 0.75

/** World AABB in the mesh frame, origin shift already removed. */
export interface Box { min: Vec3; max: Vec3 }

/** Thin elements (a membrane, a line) still have a volume to intersect. */
const PAD = 0.0005

/**
 * Box of an element: `geo.m` + `geo.s` when the snapshot has them; older
 * baselines only have the placement point `c` (+ size), centred on it.
 */
export function boxOf(el: SnapElement, shift: Vec3 | null = null): Box | null {
  const g = el.geo
  if (!g) return null
  const sh = shift ?? [0, 0, 0]
  const s = g.s ?? [0, 0, 0]
  const min: Vec3 = g.m
    ? [g.m[0] - sh[0], g.m[1] - sh[1], g.m[2] - sh[2]]
    : [g.c[0] - sh[0] - s[0] / 2, g.c[1] - sh[1] - s[1] / 2, g.c[2] - sh[2] - s[2] / 2]
  return {
    min: [min[0] - PAD, min[1] - PAD, min[2] - PAD],
    max: [min[0] + s[0] + PAD, min[1] + s[1] + PAD, min[2] + s[2] + PAD],
  }
}

export const centre = (b: Box): Vec3 => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]
export const volume = (b: Box): number => (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2])

export function intersection(a: Box, b: Box): number {
  let v = 1
  for (let k = 0; k < 3; k++) {
    const d = Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k])
    if (d <= 0) return 0
    v *= d
  }
  return v
}

export function iou(a: Box, b: Box): number {
  const i = intersection(a, b)
  return i > 0 ? i / (volume(a) + volume(b) - i) : 0
}

/**
 * Translation estimated between two boxes of the same piece whose shape may
 * have changed: per axis, the delta of the side that stayed put (the smaller
 * of min/max deltas). When both sides moved apart or together (grew or shrank
 * around its middle), that axis did not move.
 */
export function anchoredMove(a: Box, b: Box): Vec3 {
  const out: Vec3 = [0, 0, 0]
  for (let k = 0; k < 3; k++) {
    const dMin = b.min[k] - a.min[k], dMax = b.max[k] - a.max[k]
    if (Math.sign(dMin) !== Math.sign(dMax) && Math.abs(dMin) > 1e-9 && Math.abs(dMax) > 1e-9) continue
    out[k] = Math.abs(dMin) <= Math.abs(dMax) ? dMin : dMax
  }
  return out
}

/** IoU of the two boxes once `b` is moved back by `t`: how alike the shapes are. */
function alignedIou(a: Box, b: Box, t: Vec3): number {
  return iou(a, { min: [b.min[0] - t[0], b.min[1] - t[1], b.min[2] - t[2]], max: [b.max[0] - t[0], b.max[1] - t[1], b.max[2] - t[2]] })
}

/** Name, type, predefined type and every pset value, as one comparable set. */
function propSignature(el: SnapElement): Set<string> {
  const out = new Set<string>()
  if (el.name) out.add(`n=${el.name}`)
  if (el.typeName) out.add(`t=${el.typeName}`)
  if (el.predefinedType) out.add(`p=${el.predefinedType}`)
  for (const [pset, props] of Object.entries(el.psets)) {
    for (const [k, v] of Object.entries(props)) if (v != null) out.add(`${pset}.${k}=${String(v)}`)
  }
  return out
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let n = 0
  const [small, big] = a.size <= b.size ? [a, b] : [b, a]
  for (const x of small) if (big.has(x)) n++
  return n / (a.size + b.size - n)
}

interface Item { l: LocatedElement; box: Box; c: Vec3; cls: string }

function items(pool: readonly LocatedElement[], schema: string | null, shift: Vec3 | null): Item[] {
  const out: Item[] = []
  for (const l of pool) {
    const box = boxOf(l.el, shift)
    if (box) out.push({ l, box, c: centre(box), cls: canonicalClass(l.el.ifcClass, schema) })
  }
  return out
}

/** Uniform grid keyed by class + cell: neighbours within one cell of a radius-sized grid. */
class Grid {
  private cells = new Map<string, Item[]>()
  constructor(private size: number) {}
  private key(cls: string, i: number, j: number, k: number): string { return `${cls}|${i}|${j}|${k}` }
  add(it: Item, at: Vec3 = it.c): void {
    const [i, j, k] = at.map((v) => Math.floor(v / this.size))
    const key = this.key(it.cls, i, j, k)
    const cell = this.cells.get(key)
    if (cell) cell.push(it); else this.cells.set(key, [it])
  }
  near(cls: string, c: Vec3): Item[] {
    const [i, j, k] = c.map((v) => Math.floor(v / this.size))
    const out: Item[] = []
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) {
      const cell = this.cells.get(this.key(cls, i + a, j + b, k + d))
      if (cell) out.push(...cell)
    }
    return out
  }
}

/** Layer 3. Pure: returns 1:1 pairs with method 'geometry'. */
export const matchByGeometry: ExtraMatcher = (unmatchedBase, unmatchedHead, ctx: MatcherContext): MatchPair[] => {
  const radius = ctx.options.matchRadius
  if (!(radius > 0) || !unmatchedBase.length || !unmatchedHead.length) return []
  let bs = items(unmatchedBase, ctx.schema.base, null)
  let hs = items(unmatchedHead, ctx.schema.head, ctx.originShift)
  const pairs: MatchPair[] = []

  // Pre-pass: identical boxes (1 mm) of the same class pair off directly. Many
  // coincident copies (a model federated twice, duplicated GlobalIds) would
  // otherwise all land in one grid cell and make the candidate search quadratic.
  const exactKey = (it: Item): string => `${it.cls}|${[...it.box.min, ...it.box.max].map((v) => Math.round(v * 1000)).join(',')}`
  const byKey = new Map<string, Item[]>()
  for (const h of hs) { const k = exactKey(h); const l = byKey.get(k); if (l) l.push(h); else byKey.set(k, [h]) }
  const taken = new Set<Item>()
  for (const b of bs) {
    const l = byKey.get(exactKey(b))
    const h = l?.pop()
    if (!h) continue
    taken.add(b); taken.add(h)
    const score = 0.8 + 0.2 * jaccard(propSignature(b.l.el), propSignature(h.l.el))
    pairs.push({ base: [b.l], head: [h.l], method: 'geometry', confidence: Math.round(score * 1000) / 1000 })
  }
  if (taken.size) { bs = bs.filter((x) => !taken.has(x)); hs = hs.filter((x) => !taken.has(x)) }

  // Indexed by box centre and by box minimum (the anchor that stays put when
  // a column gets longer or a wall taller): a piece moved and reshaped at once
  // has its centre far off, its anchor close.
  const grid = new Grid(radius), anchors = new Grid(radius)
  for (const h of hs) { grid.add(h); anchors.add(h, h.box.min) }

  const sig = new Map<LocatedElement, Set<string>>()
  const sigOf = (l: LocatedElement): Set<string> => {
    let s = sig.get(l)
    if (!s) { s = propSignature(l.el); sig.set(l, s) }
    return s
  }

  const cands: Array<{ b: Item; h: Item; score: number }> = []
  const seen = new Set<Item>()
  for (const b of bs) {
    seen.clear()
    for (const h of [...grid.near(b.cls, b.c), ...anchors.near(b.cls, b.box.min)]) {
      if (seen.has(h)) continue
      seen.add(h)
      const dc = Math.hypot(h.c[0] - b.c[0], h.c[1] - b.c[1], h.c[2] - b.c[2])
      const t = anchoredMove(b.box, h.box)
      const da = Math.hypot(t[0], t[1], t[2])
      const raw = iou(b.box, h.box)
      // Anchor on anchor, a moved-and-reshaped piece (a column 25 % longer)
      // still looks like itself; a piece cut in half does not (that is layer 4).
      const aligned = da < dc ? alignedIou(b.box, h.box, t) : 0
      const anchored = aligned >= ANCHOR_MIN_IOU
      const d = anchored ? Math.min(dc, da) : dc
      if (d > radius) continue
      const shape = anchored ? Math.max(raw, aligned) : raw
      const score = 0.5 * shape + 0.3 * (1 - d / radius) + 0.2 * jaccard(sigOf(b.l), sigOf(h.l))
      if (score >= GEOMETRY_ACCEPT) cands.push({ b, h, score })
    }
  }
  cands.sort((x, y) => y.score - x.score)
  const used = new Set<Item>()
  for (const { b, h, score } of cands) {
    if (used.has(b) || used.has(h)) continue
    used.add(b); used.add(h)
    pairs.push({ base: [b.l], head: [h.l], method: 'geometry', confidence: Math.round(score * 1000) / 1000 })
  }
  return pairs
}
