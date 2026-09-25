// ─── Cover Studio model numbers ────────────────────────────────────────────────
// The numbers a cover prints must describe the building, not the file. A
// loaded model's categories include every IFC entity type — property sets,
// quantities, materials — which inflated "elements" on a 3 MB tower to 19 k.
// Only physical elements (subtypes of IfcElement, minus openings and virtual
// elements) count, and only they can be highlighted in the scene.

import { isSubtypeOf } from '../ids/ifc-hierarchy'
import type { CoverStats } from './types'

interface CategoryLike { id: string; label: string; count: number }

const NOT_BUILT = ['IFCOPENINGELEMENT', 'IFCOPENINGSTANDARDCASE', 'IFCVIRTUALELEMENT', 'IFCFEATUREELEMENT']

export function isPhysicalCategory(id: string): boolean {
  const cls = id.toUpperCase()
  if (NOT_BUILT.some((n) => cls === n || isSubtypeOf(cls, n))) return false
  return isSubtypeOf(cls, 'IFCELEMENT') || isSubtypeOf(cls.replace(/STANDARDCASE$/, ''), 'IFCELEMENT')
}

/** Physical categories across models, merged by id, largest first. */
export function physicalCategories(models: ReadonlyArray<{ categories: ReadonlyArray<CategoryLike> }>): CategoryLike[] {
  const byId = new Map<string, CategoryLike>()
  for (const m of models) for (const c of m.categories) {
    if (!isPhysicalCategory(c.id)) continue
    const e = byId.get(c.id) ?? { id: c.id, label: c.label, count: 0 }
    e.count += c.count
    byId.set(c.id, e)
  }
  return [...byId.values()].sort((a, b) => b.count - a.count)
}

export function coverStats(models: ReadonlyArray<{ categories: ReadonlyArray<CategoryLike> }>, score: number | null | undefined): CoverStats {
  const cats = physicalCategories(models)
  return {
    elements: cats.reduce((n, c) => n + c.count, 0),
    categories: cats.length,
    models: models.length,
    score: score === null || score === undefined ? null : Math.round(score),
    topCategories: cats.slice(0, 8).map(({ label, count }) => ({ label, count })),
  }
}
