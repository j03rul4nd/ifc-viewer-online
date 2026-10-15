// ─── selection ────────────────────────────────────────────────────────────────
// Pure, generic list selection (Explorer/Figma rules). Each surface passes its
// own visible order: the point cloud list uses load order, the Scene tree its
// group order — a Shift range is taken in the order the user is looking at.
//   click        → replace (anchor = clicked)
//   Ctrl/⌘      → toggle  (anchor = clicked)
//   Shift        → range from the anchor
//   Ctrl/⌘+Shift → add that range to the selection

export type ClickMode = 'replace' | 'toggle' | 'range' | 'addRange'

export interface SelectionState {
  ids: string[]
  anchor: string | null
}

export function modeFromEvent(e: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }): ClickMode {
  const mod = !!(e.ctrlKey || e.metaKey)
  if (e.shiftKey) return mod ? 'addRange' : 'range'
  return mod ? 'toggle' : 'replace'
}

function ordered(ids: Iterable<string>, order: readonly string[]): string[] {
  const set = new Set(ids)
  return order.filter((id) => set.has(id))
}

function rangeOf(order: readonly string[], a: string, b: string): string[] {
  const i = order.indexOf(a)
  const j = order.indexOf(b)
  if (i < 0 || j < 0) return [b]
  return order.slice(Math.min(i, j), Math.max(i, j) + 1)
}

export function nextSelection(
  prev: SelectionState, clicked: string, mode: ClickMode, order: readonly string[],
): SelectionState {
  switch (mode) {
    case 'replace':
      return { ids: ordered([clicked], order), anchor: clicked }
    case 'toggle': {
      const set = new Set(prev.ids)
      if (set.has(clicked)) set.delete(clicked)
      else set.add(clicked)
      return { ids: ordered(set, order), anchor: clicked }
    }
    case 'range': {
      const anchor = prev.anchor && order.includes(prev.anchor) ? prev.anchor : clicked
      return { ids: ordered(rangeOf(order, anchor, clicked), order), anchor }
    }
    case 'addRange': {
      const anchor = prev.anchor && order.includes(prev.anchor) ? prev.anchor : clicked
      return { ids: ordered([...prev.ids, ...rangeOf(order, anchor, clicked)], order), anchor }
    }
  }
}

export function selectAll(order: readonly string[]): SelectionState {
  return { ids: [...order], anchor: order[0] ?? null }
}

/** Drop ids that no longer exist; a missing anchor becomes null. */
export function pruneSelection(prev: SelectionState, existing: ReadonlySet<string>): SelectionState {
  return {
    ids: prev.ids.filter((id) => existing.has(id)),
    anchor: prev.anchor && existing.has(prev.anchor) ? prev.anchor : null,
  }
}

/**
 * Solo semantics (the DataLegend's): show only the selected items; when exactly
 * the selected set is already what is visible, show everything instead.
 */
export function soloPlan(
  items: ReadonlyArray<{ id: string; visible: boolean }>, selected: ReadonlySet<string>,
): Record<string, boolean> {
  const alreadySolo = items.length > 0 && items.every((i) => i.visible === selected.has(i.id))
  const plan: Record<string, boolean> = {}
  for (const i of items) plan[i.id] = alreadySolo ? true : selected.has(i.id)
  return plan
}
