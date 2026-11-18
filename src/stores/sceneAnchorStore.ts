// ─── Scene anchor store ───────────────────────────────────────────────────────
// Holds the ONE SceneAnchor every non-IFC data layer projects into (see
// lib/geo/scene-anchor.ts). Serializable intent only, geoStore convention.
//
// Set once — by the first georeferenced layer, or by hand — and then left
// alone: moving an anchor that layers were placed against would silently shift
// all of them. `clear()` is for "remove everything", not for re-anchoring.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { SceneAnchor } from '../lib/geo/scene-anchor'

interface SceneAnchorState {
  anchor: SceneAnchor | null
  /** Set the anchor only if none exists yet. Returns the anchor in force. */
  claim: (a: SceneAnchor) => SceneAnchor
  /** Replace the anchor explicitly (user action). */
  set: (a: SceneAnchor | null) => void
  clear: () => void
}

export const useSceneAnchorStore = create<SceneAnchorState>()(
  devtools(
    (set, get) => ({
      anchor: null,
      claim: (a) => {
        const current = get().anchor
        if (current) return current
        set({ anchor: a }, false, 'claim')
        return a
      },
      set: (a) => set({ anchor: a }, false, 'set'),
      clear: () => set({ anchor: null }, false, 'clear'),
    }),
    { name: 'SceneAnchorStore', enabled: import.meta.env.DEV },
  ),
)

export const selectSceneAnchor = (s: SceneAnchorState): SceneAnchor | null => s.anchor
