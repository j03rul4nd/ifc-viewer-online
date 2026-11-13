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
  add(it: Item): void {
    const [i, j, k] = it.c.map((v) => Math.floor(v / this.size))
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
  const bs = items(unmatchedBase, ctx.schema.base, null)
  const hs = items(unmatchedHead, ctx.schema.head, ctx.originShift)
  const grid = new Grid(radius)
  for (const h of hs) grid.add(h)

  const sig = new Map<LocatedElement, Set<string>>()
  const sigOf = (l: LocatedElement): Set<string> => {
    let s = sig.get(l)
    if (!s) { s = propSignature(l.el); sig.set(l, s) }
    return s
  }

  const cands: Array<{ b: Item; h: Item; score: number }> = []
  for (const b of bs) {
    for (const h of grid.near(b.cls, b.c)) {
      const d = Math.hypot(h.c[0] - b.c[0], h.c[1] - b.c[1], h.c[2] - b.c[2])
      if (d > radius) continue
      const score = 0.5 * iou(b.box, h.box) + 0.3 * (1 - d / radius) + 0.2 * jaccard(sigOf(b.l), sigOf(h.l))
      if (score >= GEOMETRY_ACCEPT) cands.push({ b, h, score })
    }
  }
  cands.sort((x, y) => y.score - x.score)
  const used = new Set<Item>()
  const pairs: MatchPair[] = []
  for (const { b, h, score } of cands) {
    if (used.has(b) || used.has(h)) continue
    used.add(b); used.add(h)
    pairs.push({ base: [b.l], head: [h.l], method: 'geometry', confidence: Math.round(score * 1000) / 1000 })
  }
  return pairs
}
