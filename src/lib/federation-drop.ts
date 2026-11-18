// ─── Federation drop ──────────────────────────────────────────────────────────
// A `.ifcfed.json` dropped on the viewer or the upload dialog is not an IFC: it
// starts the same open flow as the "Open federation" link. IFC files dropped
// with it satisfy the restore straight away. Pure: split only.

import { isIfcFileName } from './upload.utils'
import { FEDERATION_FILE_SUFFIX } from './federation-session'

export function isFederationFileName(name: string): boolean {
  return name.trim().toLowerCase().endsWith(FEDERATION_FILE_SUFFIX)
}

export interface FederationDropSplit<F extends { name: string }> {
  /** The first `.ifcfed.json` in the drop, or null when there is none. */
  manifest: F | null
  /** IFC files dropped with it (used for the restore). */
  ifcs: F[]
  /** Everything else, for the normal drop routing. Extra manifests are ignored. */
  rest: F[]
}

export function splitFederationDrop<F extends { name: string }>(files: readonly F[]): FederationDropSplit<F> {
  let manifest: F | null = null
  const ifcs: F[] = []
  const rest: F[] = []
  for (const f of files) {
    if (isFederationFileName(f.name)) { if (!manifest) manifest = f; continue }
    if (isIfcFileName(f.name)) ifcs.push(f)
    else rest.push(f)
  }
  return { manifest, ifcs, rest }
}
