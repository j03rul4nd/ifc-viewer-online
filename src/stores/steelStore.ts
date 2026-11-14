// ─── steelStore ───────────────────────────────────────────────────────────────
// Steel takeoff panel open/closed. Results live in the panel (memory only).
import { create } from 'zustand'

interface SteelState { open: boolean; setOpen: (open: boolean) => void }

export const useSteelStore = create<SteelState>((set) => ({ open: false, setOpen: (open) => set({ open }) }))
