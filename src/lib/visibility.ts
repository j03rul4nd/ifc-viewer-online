// ── Visibility helpers ────────────────────────────────────────────────────────
//
// Shared between ModelTree, Sidebar, App, and viewer so that multi-model
// hidden-element tracking stays consistent.

/**
 * Composite key used in the hiddenElements Set.
 * Scopes each expressId to its owning model so hiding element 100 in model A
 * never accidentally hides element 100 in model B.
 */
export function makeHiddenKey(modelId: string, expressId: number): string {
  return `${modelId}:${expressId}`
}

/**
 * BFS expansion of a single expressId through the physical-element decomposition
 * map (IfcRelAggregates, non-spatial only).  Needed so that hiding an IfcStair
 * assembly also hides its IfcStairFlight / IfcSlab sub-components, which are the
 * entities that actually carry geometry in the Fragments model.
 *
 * Visited set prevents infinite loops on circular aggregation graphs.
 */
export function expandWithDecomp(
  id: number,
  decompMap: Map<number, number[]> | undefined,
): number[] {
  if (!decompMap) return [id]
  const result: number[] = [id]
  const visited = new Set([id])
  const queue = [...(decompMap.get(id) ?? [])]
  while (queue.length) {
    const sub = queue.shift()!
    if (visited.has(sub)) continue
    visited.add(sub)
    result.push(sub)
    queue.push(...(decompMap.get(sub) ?? []))
  }
  return result
}
