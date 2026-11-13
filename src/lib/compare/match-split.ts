// ─── compare/match-split.ts ───────────────────────────────────────────────────
// Layer 4 of revision compare (spec 10 §3.2): one element became several
// (a slab split at a construction joint) or several became one (merge).
//
// For each unmatched "whole" on one side, the unmatched "parts" of the same
// canonical class on the other side that lie (≥ 85 % of their own box) inside
// it. The pair is accepted when the parts cover ≥ 85 % of the whole's box.
// Confidence = coverage × 0.9. Greedy by confidence; boxes are AABBs.

import type { ExtraMatcher, LocatedElement, MatchPair, MatcherContext } from './revision-types'
import { canonicalClass } from './normalize'
import { boxOf, intersection, volume, type Box } from './match-geometry'

export const SPLIT_COVERAGE = 0.85

interface Item { l: LocatedElement; box: Box; vol: number; cls: string }

function items(pool: readonly LocatedElement[], schema: string | null, shift: MatcherContext['originShift']): Item[] {
  const out: Item[] = []
  for (const l of pool) {
    const box = boxOf(l.el, shift)
    if (box) out.push({ l, box, vol: volume(box), cls: canonicalClass(l.el.ifcClass, schema) })
  }
  return out
}

interface Group { whole: Item; parts: Item[]; coverage: number }

/** Cell size (m) of the part index: parts are found by the cells a whole's box spans. */
const CELL = 1
const MAX_CELLS = 4096

/** Parts by class + cell of their box centre. */
function indexParts(parts: Item[]): Map<string, Item[]> {
  const m = new Map<string, Item[]>()
  for (const p of parts) {
    const k = `${p.cls}|${[0, 1, 2].map((a) => Math.floor((p.box.min[a] + p.box.max[a]) / 2 / CELL)).join('|')}`
    const cell = m.get(k)
    if (cell) cell.push(p); else m.set(k, [p])
  }
  return m
}

/** Parts of the same class whose centre falls inside the whole's box (a part ≥ 85 % inside has it there). */
function nearParts(w: Item, idx: Map<string, Item[]>, byClass: Map<string, Item[]>): Item[] {
  const lo = w.box.min.map((v) => Math.floor(v / CELL)), hi = w.box.max.map((v) => Math.floor(v / CELL))
  const cells = (hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1)
  if (cells > MAX_CELLS) return byClass.get(w.cls) ?? [] // a huge whole: scan its class
  const out: Item[] = []
  for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) {
    const c = idx.get(`${w.cls}|${i}|${j}|${k}`)
    if (c) out.push(...c)
  }
  return out
}

function groups(wholes: Item[], parts: Item[]): Group[] {
  const out: Group[] = []
  const idx = indexParts(parts)
  const byClass = new Map<string, Item[]>()
  for (const p of parts) { const l = byClass.get(p.cls); if (l) l.push(p); else byClass.set(p.cls, [p]) }
  for (const w of wholes) {
    const inside: Item[] = []
    let covered = 0
    for (const p of nearParts(w, idx, byClass)) {
      if (p.cls !== w.cls) continue
      const i = intersection(w.box, p.box)
      if (i <= 0 || i / p.vol < SPLIT_COVERAGE) continue
      inside.push(p)
      covered += i
    }
    if (inside.length < 2) continue
    // Overlapping parts could sum past the whole; also penalise parts that stick out.
    const partsVol = inside.reduce((a, p) => a + p.vol, 0)
    const coverage = Math.min(covered / w.vol, w.vol / partsVol, 1)
    if (coverage >= SPLIT_COVERAGE) out.push({ whole: w, parts: inside, coverage })
  }
  return out
}

/** Layer 4. Pure: returns 1:N ('split') and N:1 ('merge') pairs. */
export const matchSplitMerge: ExtraMatcher = (unmatchedBase, unmatchedHead, ctx): MatchPair[] => {
  if (unmatchedBase.length === 0 || unmatchedHead.length === 0) return []
  const bs = items(unmatchedBase, ctx.schema.base, null)
  const hs = items(unmatchedHead, ctx.schema.head, ctx.originShift)
  const all = [
    ...groups(bs, hs).map((g) => ({ ...g, method: 'split' as const })),
    ...groups(hs, bs).map((g) => ({ ...g, method: 'merge' as const })),
  ].sort((a, b) => b.coverage - a.coverage)
  const used = new Set<Item>()
  const pairs: MatchPair[] = []
  for (const g of all) {
    if (used.has(g.whole) || g.parts.some((p) => used.has(p))) continue
    used.add(g.whole)
    for (const p of g.parts) used.add(p)
    const whole = [g.whole.l], parts = g.parts.map((p) => p.l)
    pairs.push({
      base: g.method === 'split' ? whole : parts,
      head: g.method === 'split' ? parts : whole,
      method: g.method,
      confidence: Math.round(g.coverage * 0.9 * 1000) / 1000,
    })
  }
  return pairs
}
