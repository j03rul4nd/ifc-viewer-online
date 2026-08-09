// ── Visibility helpers ────────────────────────────────────────────────────────
//
// Shared between ModelTree, Sidebar, App, and viewer so that multi-model
// hidden-element tracking stays consistent.

/**
 * An expressId scoped to the model it belongs to.
 *
 * THIS IS THE ONLY SAFE WAY TO IDENTIFY AN ELEMENT once more than one model is
 * loaded, and the reason is not obvious: every IFC file numbers its entities
 * from #1 independently. In the federated Poblenou set, #348 is a column in the
 * structural model, a glazed panel in the architectural one and a duct in the
 * services one. Any state keyed on the bare number — expansion, selection,
 * "which row am I editing" — silently applies to all three at once.
 *
 * So anything that remembers something ABOUT an element keys on this.
 */
export function scopedElementKey(modelId: string, expressId: number): string {
  return `${modelId}:${expressId}`
}

/**
 * Composite key used in the hiddenElements Set — the same scoping, kept under
 * its original name because half the app already calls it that.
 */
export function makeHiddenKey(modelId: string, expressId: number): string {
  return scopedElementKey(modelId, expressId)
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
