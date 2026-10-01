// ─── Cover Studio open state ──────────────────────────────────────────────────
// Was local state in CaptureToolbar. Lifted so the embed bridge can open the
// studio too (SDK createCover), and so App can host it when there is no
// toolbar at all — kiosk and client embeds.

import { create } from 'zustand'

interface CoverStudioStore {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useCoverStudioStore = create<CoverStudioStore>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
