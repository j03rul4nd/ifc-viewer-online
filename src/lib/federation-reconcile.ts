// ─── Federation reconcile ─────────────────────────────────────────────────────
// Match the files a user drops when reopening a manifest against its refs.
// Priority: sha256 > name+size > normalised name > stackKey (other revision).
// A file is assigned to at most one ref. Nothing is loaded here.

import type { FederationManifestV1, FederationModelRef, RefId } from './federation-manifest'
import { baseName } from './federation-manifest'
import { parseContainerName } from './federation-index'

export interface DroppedFile { name: string; size: number; sha256?: string }

export type ReconcileStatus = 'matched' | 'revision' | 'missing'
export type MatchedBy = 'sha256' | 'name+size' | 'name' | 'stackKey'

export interface RefReconcile {
  refId: RefId
  status: ReconcileStatus
  /** Index into the `files` array, when matched or revision. */
  fileIndex?: number
  fileName?: string
  matchedBy?: MatchedBy
}

export interface ReconcileResult {
  refs: RefReconcile[]
  /** Indexes of files not assigned to any ref. */
  unassigned: number[]
}

/** Case- and whitespace-insensitive basename. */
export function normalizeName(name: string): string {
  return baseName(name).toLowerCase().replace(/\s+/g, ' ').trim().replace(/\s*([._-])\s*/g, '$1')
}

export function reconcile(manifest: FederationManifestV1, files: DroppedFile[]): ReconcileResult {
  const used = new Set<number>()
  const out = new Map<RefId, RefReconcile>()

  const pass = (by: MatchedBy, status: ReconcileStatus, test: (ref: FederationModelRef, f: DroppedFile) => boolean) => {
    for (const ref of manifest.models) {
      if (out.has(ref.refId)) continue
      const idx = files.findIndex((f, i) => !used.has(i) && test(ref, f))
      if (idx < 0) continue
      used.add(idx)
      out.set(ref.refId, { refId: ref.refId, status, fileIndex: idx, fileName: files[idx].name, matchedBy: by })
    }
  }

  pass('sha256', 'matched', (r, f) => !!r.sha256 && !!f.sha256 && r.sha256.toLowerCase() === f.sha256.toLowerCase())
  pass('name+size', 'matched', (r, f) => r.fileName === baseName(f.name) && r.size === f.size)
  pass('name', 'matched', (r, f) => normalizeName(r.fileName) === normalizeName(f.name))
  pass('stackKey', 'revision', (r, f) => {
    const key = r.stackKey ?? parseContainerName(r.fileName).stackKey
    return key === parseContainerName(baseName(f.name)).stackKey
  })

  const refs = manifest.models.map((m) => out.get(m.refId) ?? { refId: m.refId, status: 'missing' as const })
  const unassigned = files.map((_, i) => i).filter((i) => !used.has(i))
  return { refs, unassigned }
}
