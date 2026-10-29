import { create } from 'zustand'
import type { DualScreenPref } from '../lib/ui/display-segments'

// ── Dual-screen preferences ───────────────────────────────────────────────────
// What the user chose about the split, not whether the hardware has one — that
// is read live by useDualLayout. Persisted, because a layout is a working
// preference: unfolding the device tomorrow should land in the same place.
// docs/DUAL_SCREEN.md.

/** What the companion pane shows. */
export type DualPaneView = 'inspect' | 'explore' | 'tree'

interface DualScreenPrefs { pref: DualScreenPref; view: DualPaneView; swap: boolean }

const LS_KEY = 'ifc-dual-screen:v1'
const DEFAULTS: DualScreenPrefs = { pref: 'auto', view: 'explore', swap: false }

function load(): DualScreenPrefs {
  if (typeof localStorage === 'undefined') return DEFAULTS
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as Partial<DualScreenPrefs>
    return {
      pref: saved.pref === 'off' || saved.pref === 'split' ? saved.pref : 'auto',
      view: saved.view === 'inspect' || saved.view === 'tree' ? saved.view : 'explore',
      swap: saved.swap === true,
    }
  } catch {
    return DEFAULTS
  }
}

interface DualScreenStore extends DualScreenPrefs {
  /**
   * Live, not persisted: published by the one useDualLayout call in App so
   * other surfaces (the View menu) can offer the toggle without listening to
   * the geometry themselves.
   */
  status: { active: boolean; canSplit: boolean; hardware: boolean }
  setStatus: (status: DualScreenStore['status']) => void
  setPref: (pref: DualScreenPref) => void
  setView: (view: DualPaneView) => void
  toggleSwap: () => void
}

export const useDualScreenStore = create<DualScreenStore>()((set, get) => {
  const persist = (patch: Partial<DualScreenPrefs>): void => {
    set(patch)
    const { pref, view, swap } = get()
    try { localStorage.setItem(LS_KEY, JSON.stringify({ pref, view, swap })) } catch { /* private mode */ }
  }
  return {
    ...load(),
    status: { active: false, canSplit: false, hardware: false },
    setStatus: (status) => {
      const cur = get().status
      if (cur.active !== status.active || cur.canSplit !== status.canSplit || cur.hardware !== status.hardware) set({ status })
    },
    setPref: (pref) => persist({ pref }),
    setView: (view) => persist({ view }),
    toggleSwap: () => persist({ swap: !get().swap }),
  }
})
