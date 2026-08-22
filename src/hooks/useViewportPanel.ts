// ─── useViewportPanel ─────────────────────────────────────────────────────────
// The React half of the floating-panel rules: announce that a panel is open,
// and hand the registry a way to close it.
//
// The registry (src/lib/ui/panel-registry) is pure and owns the rules —
// one at a time, Escape closes the open one, a modal on top wins. This hook owns
// the part that depends on a component being mounted, and nothing else.

import { useEffect, useRef } from 'react'
import { announceOpen, announceClosed } from '../lib/ui/panel-registry'
import { useUIStore } from '../stores/uiStore'

/**
 * Register a floating panel while it is open.
 *
 * `onClose` is read through a ref rather than captured, so the registry always
 * calls the current one. Passing the callback itself as a dependency would
 * re-run this effect on every render of the parent — closing and reopening the
 * panel for no reason, and re-ordering the stack while it did.
 */
export function useViewportPanel(id: string, open: boolean, onClose?: () => void): void {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) {
      announceClosed(id)
      return
    }
    announceOpen(id, () => closeRef.current?.())
    return () => announceClosed(id)
  }, [id, open])

  // ── ONE LANE ────────────────────────────────────────────────────────────────
  // The selection sidebar and these panels are both pinned to the right of the
  // viewport, and measuring caught them doing it at the same time: a 292px panel
  // at x 864 over a 340px sidebar at x 816, on a canvas 1168 wide. Two windows,
  // one lane, one on top of the other.
  //
  // So the lane holds one at a time. The sidebar collapses to its strip while a
  // panel is open and comes back when it closes — it is not closed, it is
  // stepped aside, and its rail icon is still the way back to it.
  const restoreSidebar = useRef(false)
  useEffect(() => {
    if (!open) return
    const store = useUIStore.getState()
    if (!store.sidebarExpanded) return
    restoreSidebar.current = true
    store.setSidebarExpanded(false)
    return () => {
      if (!restoreSidebar.current) return
      restoreSidebar.current = false
      // Only if the user has not since expanded it themselves — their action
      // outranks this one.
      if (!useUIStore.getState().sidebarExpanded) useUIStore.getState().setSidebarExpanded(true)
    }
  }, [open])
}
