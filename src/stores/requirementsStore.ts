// ─── Requirements store ───────────────────────────────────────────────────────
// The receiver's requirements opened from a `#r=` link (lib/requirements). Set
// once at boot; the banner reads it and compares the model's results against it.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { RequirementsPayload } from '../lib/requirements/requirements-link'

interface RequirementsState {
  active: RequirementsPayload | null
  /** The supplier closed the banner (the requirements stay applied). */
  dismissed: boolean
  setActive: (req: RequirementsPayload | null) => void
  setDismissed: (dismissed: boolean) => void
}

export const useRequirementsStore = create<RequirementsState>()(
  devtools(
    (set) => ({
      active: null,
      dismissed: false,
      setActive: (active) => set({ active, dismissed: false }, false, 'requirements/setActive'),
      setDismissed: (dismissed) => set({ dismissed }, false, 'requirements/setDismissed'),
    }),
    { name: 'RequirementsStore', enabled: import.meta.env.DEV },
  ),
)
