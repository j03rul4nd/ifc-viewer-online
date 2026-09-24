// ─── Scene model ids ──────────────────────────────────────────────────────────
// The scene-level model id is the join key of a dozen stores, the viewer's maps
// and fragments' own model list. Its shape is `${fileName}-${13-digit ms}` and
// `fileNameFromModelId` (spatial-tree.ts) strips `-\d{13,}$` to recover the
// file name, so the shape must not change.
//
// Two things changed around it:
//   1. It is minted BEFORE the load starts, by the loading manager, so a queued
//      or running load can be cancelled (`core.abort(modelId)`), prioritised and
//      correlated. The viewer still mints one when a caller passes none.
//   2. Two loads of the same file name in the same millisecond used to collide
//      (same id → the second silently replaced the first inside fragments). The
//      timestamp is now strictly increasing per page, so ids are unique and still
//      look exactly like they always did.

let lastStamp = 0

/** Mint a unique `${fileName}-${13-digit timestamp}` id. */
export function mintModelId(fileName: string, now: number = Date.now()): string {
  const stamp = Math.max(now, lastStamp + 1)
  lastStamp = stamp
  return `${fileName}-${stamp}`
}

/** Test hook: forget the last stamp. */
export function resetModelIdClock(): void {
  lastStamp = 0
}
