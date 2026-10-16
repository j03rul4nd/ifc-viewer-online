// ─── Pending edits by element ─────────────────────────────────────────────────
// Which elements carry an edit that has not been exported yet, scoped to the
// model the edit was made in. Built from the editor HISTORY rather than the
// flattened `diffs`: the modelId lives on the command, and flattening drops
// it — which is how a rename of #348 in one model used to mark #348 "edited"
// in every other loaded model.

import type { EditorCommand } from '../../types'

export interface PendingIndex {
  /** The element has a pending rename (any field) or GUID fix. */
  has(modelId: string | undefined, expressId: number): boolean
  /** The element has a pending rename of its Name — what the batch rename skips. */
  hasName(modelId: string | undefined, expressId: number): boolean
  /** Distinct edited elements, counted per model. */
  size: number
}

/** Commands without a modelId (single-model or older sessions) match every model. */
const ANY_MODEL = '\u0000any'

class Index implements PendingIndex {
  private readonly edited = new Map<string, Set<number>>()
  private readonly named  = new Map<string, Set<number>>()
  size = 0

  add(modelId: string | undefined, expressId: number, isName: boolean): void {
    const key = modelId ?? ANY_MODEL
    let set = this.edited.get(key)
    if (!set) this.edited.set(key, (set = new Set()))
    if (!set.has(expressId)) { set.add(expressId); this.size++ }
    if (isName) {
      let names = this.named.get(key)
      if (!names) this.named.set(key, (names = new Set()))
      names.add(expressId)
    }
  }

  private lookup(map: Map<string, Set<number>>, modelId: string | undefined, expressId: number): boolean {
    if (map.get(ANY_MODEL)?.has(expressId)) return true
    // An issue that does not know its model (older result) cannot be told apart:
    // any model's edit on that number counts.
    if (modelId === undefined) {
      for (const set of map.values()) if (set.has(expressId)) return true
      return false
    }
    return map.get(modelId)?.has(expressId) ?? false
  }

  has(modelId: string | undefined, expressId: number): boolean {
    return this.lookup(this.edited, modelId, expressId)
  }

  hasName(modelId: string | undefined, expressId: number): boolean {
    return this.lookup(this.named, modelId, expressId)
  }
}

/** Index the commands that are applied (up to `historyIndex`). Counts RENAME and FIX_GUID. */
export function buildPendingIndex(history: readonly EditorCommand[], historyIndex: number): PendingIndex {
  const index = new Index()
  for (let i = 0; i <= historyIndex && i < history.length; i++) {
    const cmd = history[i]
    for (const d of cmd.diffs) {
      if (d.type === 'RENAME')        index.add(cmd.modelId, d.expressId, d.field === 'Name')
      else if (d.type === 'FIX_GUID') index.add(cmd.modelId, d.expressId, false)
    }
  }
  return index
}

/** An index with nothing in it. */
export const EMPTY_PENDING: PendingIndex = buildPendingIndex([], -1)
