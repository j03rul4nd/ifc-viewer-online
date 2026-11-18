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

export type FederationOpenResult = 'invalid' | 'pending' | 'restored'

/**
 * Open the dropped manifest with its IFCs. When the manifest does not parse
 * (the opener already showed the error), the IFCs still load the normal way.
 */
export async function openDroppedFederation<F extends { name: string }>(
  split: FederationDropSplit<F>,
  open: (manifest: F, ifcs: F[]) => Promise<FederationOpenResult>,
  loadIfcs: (ifcs: F[]) => void,
): Promise<FederationOpenResult> {
  if (!split.manifest) return 'invalid'
  const r = await open(split.manifest, split.ifcs)
  if (r === 'invalid' && split.ifcs.length > 0) loadIfcs(split.ifcs)
  return r
}
