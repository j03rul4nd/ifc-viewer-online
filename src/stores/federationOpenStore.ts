// Pending "open federation" state, shared by every entry point (link, bar,
// drop, library): the manifest waiting for its IFC files and the names that
// were missing after the last restore.

import { create } from 'zustand'
import type { FederationManifestV1 } from '../lib/federation-manifest'

export type FederationOpenSource = 'file' | 'drop' | 'library'

interface FederationOpenState {
  pending: { manifest: FederationManifestV1; source: FederationOpenSource } | null
  missing: string[]
  setPending: (p: FederationOpenState['pending']) => void
  setMissing: (m: string[]) => void
  /** Bumped whenever the local library changes, so lists reload. */
  libraryRev: number
  bumpLibrary: () => void
  /** Saved federation picked as the baseline to compare the loaded models against. */
  compareBaseline: FederationManifestV1 | null
  setCompareBaseline: (m: FederationManifestV1 | null) => void
  /** Bumped to ask the app to open the revision compare (old files already set as side A). */
  revisionRequest: number
  requestRevision: () => void
}

export const useFederationOpenStore = create<FederationOpenState>((set) => ({
  pending: null,
  missing: [],
  setPending: (pending) => set({ pending }),
  setMissing: (missing) => set({ missing }),
  libraryRev: 0,
  bumpLibrary: () => set((s) => ({ libraryRev: s.libraryRev + 1 })),
  compareBaseline: null,
  setCompareBaseline: (compareBaseline) => set({ compareBaseline }),
  revisionRequest: 0,
  requestRevision: () => set((s) => ({ revisionRequest: s.revisionRequest + 1 })),
}))
