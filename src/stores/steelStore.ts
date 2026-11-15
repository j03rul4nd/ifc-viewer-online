// ─── steelStore ───────────────────────────────────────────────────────────────
// Steel takeoff panel open/closed. Results live in the panel (memory only).
// `demo`: this page view was opened by the steel demo link (lib/steel/demo).
// `autoRun`: calculate once as soon as the demo model is in the scene.
// `tour`: the guided tour is showing (or waiting for the table to show).
import { create } from 'zustand'

interface SteelState {
  open: boolean
  setOpen: (open: boolean) => void
  demo: boolean
  autoRun: boolean
  tour: boolean
  startDemo: (tour: boolean) => void
  consumeAutoRun: () => void
  setTour: (tour: boolean) => void
}

export const useSteelStore = create<SteelState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  demo: false,
  autoRun: false,
  tour: false,
  startDemo: (tour) => set({ open: true, demo: true, autoRun: true, tour }),
  consumeAutoRun: () => set({ autoRun: false }),
  setTour: (tour) => set({ tour }),
}))
