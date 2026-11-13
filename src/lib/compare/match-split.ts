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

function groups(wholes: Item[], parts: Item[]): Group[] {
  const out: Group[] = []
  for (const w of wholes) {
    const inside: Item[] = []
    let covered = 0
    for (const p of parts) {
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
