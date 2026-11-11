// ─── Batch folder fake door ───────────────────────────────────────────────────
// Someone dropped several IFC files at once: the moment "validate the whole
// folder, one report" would help. The feature does not exist. The offer says
// "Pro" and, once clicked, says plainly that it is coming and asks for an email
// to tell them. Counts only (batch_folder_interest), never file names.
//
// Shown once per page load, never in an embed or a reduced viewer.

let offered = false

export interface BatchDoorContext {
  /** The full viewer, not client mode, an embed or a quiet chrome. */
  interactive: boolean
  embedded: boolean
}

export function shouldOfferBatchFolder(ifcCount: number, ctx: BatchDoorContext): boolean {
  if (offered || ifcCount < 2 || !ctx.interactive || ctx.embedded) return false
  offered = true
  return true
}

/** Count bucket for analytics: exact up to 10, then coarse. */
export function batchCountBucket(n: number): number {
  return n <= 10 ? n : n <= 50 ? 50 : 100
}

/** Tests only. */
export function resetBatchFolderDoor(): void {
  offered = false
}
