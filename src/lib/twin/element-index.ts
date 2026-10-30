// ─── element-index ────────────────────────────────────────────────────────────
// Everything the twin needs to know about the loaded elements, built once per
// set of spatial trees however many consumers ask. The runner, the panel, the
// labels and the inspector each used to walk the trees on their own: four walks
// and four copies in memory whenever a model loaded.

import { buildCatalog, buildGuidIndex, type CatalogEntry, type ElementLoc } from './devices'
import type { SpatialNode } from '../../types'

export interface TwinElements {
  guidIndex: Map<string, ElementLoc[]>
  catalog: CatalogEntry[]
  /** "<modelId>#<expressId>" → its catalog entry. */
  byLoc: Map<string, CatalogEntry>
  classes: string[]
  storeys: string[]
}

const cache = new WeakMap<Record<string, SpatialNode[]>, TwinElements>()

export function twinElements(trees: Record<string, SpatialNode[]>): TwinElements {
  let hit = cache.get(trees)
  if (hit) return hit
  const catalog = buildCatalog(trees)
  const byLoc = new Map<string, CatalogEntry>()
  const classes = new Set<string>()
  const storeys = new Set<string>()
  for (const e of catalog) {
    byLoc.set(`${e.modelId}#${e.expressId}`, e)
    classes.add(e.ifcClass)
    if (e.storey) storeys.add(e.storey)
  }
  hit = { guidIndex: buildGuidIndex(trees), catalog, byLoc, classes: [...classes].sort(), storeys: [...storeys].sort() }
  cache.set(trees, hit)
  return hit
}
