// ─── useViewportPanel ─────────────────────────────────────────────────────────
// The React half of the floating-panel rules: announce that a panel is open,
// and hand the registry a way to close it.
//
// The registry (src/lib/ui/panel-registry) is pure and owns the rules —
// one at a time, Escape closes the open one, a modal on top wins. This hook owns
// the part that depends on a component being mounted, and nothing else.

import { useEffect, useRef } from 'react'
import { announceOpen, announceClosed } from '../lib/ui/panel-registry'

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
  // The properties column and these panels are both pinned to the right of the
  // viewport, and measuring caught them doing it at the same time: a 292px panel
  // at x 864 over a 340px column at x 816, on a canvas 1168 wide.
  //
  // This used to be handled here, by stepping the column aside and restoring it
  // afterwards. That was one-directional — nothing happened when the column
  // opened over a panel — so opening properties while Measure was up left both
  // on screen. The column is now a registry member like any other panel, so the
  // rule is symmetrical and lives in one place instead of two.
  //
  // The cost is that the column no longer springs back when the panel closes.
  // That is the right trade: a peer does not reopen itself, a rail icon brings
  // it back in one click, and a panel that reappears on its own reads as a bug.
}
