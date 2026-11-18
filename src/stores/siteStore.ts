// ─── siteStore ────────────────────────────────────────────────────────────────
// Site (construction) tab of the sidebar: which sub-tab shows, the snags drawn
// as pins in 3D, a pin's request to open its snag, and the progress element
// index cached per project key so switching tabs does not re-read the models.
import { create } from 'zustand'
import type { Snag } from '../lib/site/snags'
import type { ProgressElement } from '../lib/site/progress'

export type SiteTab = 'snags' | 'units' | 'progress' | 'inspections' | 'daily'

interface SiteState {
  tab: SiteTab
  setTab: (tab: SiteTab) => void
  /** True while the site tab is on screen: the pins show only then. */
  active: boolean
  setActive: (active: boolean) => void
  snags: readonly Snag[]
  setSnags: (snags: readonly Snag[]) => void
  openSnagId: string | null
  requestOpenSnag: (id: string | null) => void
  elementsKey: string | null
  elements: readonly ProgressElement[]
  setElements: (key: string | null, elements: readonly ProgressElement[]) => void
}

export const useSiteStore = create<SiteState>((set) => ({
  tab: 'snags',
  setTab: (tab) => set({ tab }),
  active: false,
  setActive: (active) => set({ active }),
  snags: [],
  setSnags: (snags) => set({ snags }),
  openSnagId: null,
  requestOpenSnag: (openSnagId) => set(openSnagId ? { openSnagId, tab: 'snags' } : { openSnagId }),
  elementsKey: null,
  elements: [],
  setElements: (elementsKey, elements) => set({ elementsKey, elements }),
}))
