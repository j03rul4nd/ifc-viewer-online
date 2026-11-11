// ─── estimated cost to resolve ────────────────────────────────────────────────
// An ORDER, not a quote. Moving a cable tray is cheap; coring a beam or
// re-routing a duct main through structure is not. Each class gets a rough
// "effort to move" weight; the cheaper side of a clash is the one that moves,
// so a clash costs about the cheaper element's weight, more when it is hard
// and deep. Figures are euros of rework at design stage, rounded, and the UI
// always labels them as an estimate.

import type { ClashResult } from './model'

/** Rough euros to re-model/re-route one element of this class at design stage. */
const WEIGHT: Array<[RegExp, number]> = [
  [/FOOTING|PILE/, 2500],
  [/COLUMN|BEAM/, 1200],
  [/SLAB|ROOF|WALL|STAIR|RAMP/, 900],
  [/DUCTSEGMENT|DUCTFITTING/, 450],
  [/PIPESEGMENT|PIPEFITTING/, 350],
  [/CABLECARRIER|CABLESEGMENT/, 120],
  [/FLOWTERMINAL|AIRTERMINAL|LIGHT|OUTLET|SWITCH|SANITARY/, 90],
  [/CURTAINWALL|PLATE|MEMBER/, 500],
  [/DOOR|WINDOW/, 300],
  [/COVERING|RAILING|FURNISH|FURNITURE/, 80],
]

export function classWeight(category: string): number {
  const c = category.toUpperCase()
  for (const [re, w] of WEIGHT) if (re.test(c)) return w
  return 200
}

/** Estimated euros to resolve a clash (rounded to 10). */
export function estimateCost(r: ClashResult): number {
  const cheap = Math.min(classWeight(r.a.category), classWeight(r.b.category))
  const dear = Math.max(classWeight(r.a.category), classWeight(r.b.category))
  let k = r.kind === 'hard' ? 1 : 0.35
  // Deep hard clashes need a re-route, not a nudge.
  if (r.kind === 'hard') k *= 1 + Math.min(1.5, r.depth / 0.2)
  // Through structure: a sleeve/opening has to be coordinated too.
  if (dear >= 900 && cheap < 900) k *= 1.3
  return Math.max(10, Math.round((cheap * k) / 10) * 10)
}

export function sortByCost(results: ClashResult[]): ClashResult[] {
  return results.map((r) => [estimateCost(r), r] as const).sort((x, y) => y[0] - x[0]).map(([, r]) => r)
}

export function totalCost(results: ClashResult[]): number {
  let t = 0
  for (const r of results) t += estimateCost(r)
  return t
}
