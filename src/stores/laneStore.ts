// Lane geometry shared by ViewportPanel, the bottom drawers and the overlays
// that share the bottom of the view. Not persisted: it describes the window
// right now. See src/lib/ui/lane.ts and docs/WINDOW_DESIGN.md R6.
import { create } from 'zustand'
import { LANE_RESERVE_EXTRA_PX } from '../lib/ui/lane'

export interface LaneClaim {
  id: string
  widthPx: number
  /** Whether the panel runs down over the drawer (and the drawer must yield width). */
  overDrawer: boolean
}

interface LaneStore {
  /** Width of the main column; 0 means unknown, so nothing extends. */
  columnWidthPx: number
  claim: LaneClaim | null
  setColumnWidth: (px: number) => void
  claimLane: (id: string, widthPx: number, overDrawer: boolean) => void
  /** Clears the claim only when `id` owns it. */
  releaseLane: (id: string) => void
}

export const useLaneStore = create<LaneStore>()((set, get) => ({
  columnWidthPx: 0,
  claim: null,
  setColumnWidth: (px) => {
    const w = Math.round(px)
    if (w === get().columnWidthPx) return
    set({ columnWidthPx: w })
  },
  claimLane: (id, widthPx, overDrawer) => {
    const c = get().claim
    if (c && c.id === id && c.widthPx === widthPx && c.overDrawer === overDrawer) return
    set({ claim: { id, widthPx, overDrawer } })
  },
  releaseLane: (id) => {
    if (get().claim?.id !== id) return
    set({ claim: null })
  },
}))

type LaneState = Pick<LaneStore, 'claim'>

/** Right padding the expanded drawer reserves for a panel that runs over it. */
export const selectDrawerReservePx = (s: LaneState): number =>
  s.claim?.overDrawer ? s.claim.widthPx + LANE_RESERVE_EXTRA_PX : 0

/** Width bottom overlays (TimeBar, DataLegend 'br', ModelInfo) keep clear of. */
export const selectOverlayReservePx = (s: LaneState): number =>
  s.claim ? s.claim.widthPx + LANE_RESERVE_EXTRA_PX : 0
