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
export function useViewportPanel(
  id: string,
  open: boolean,
  onClose?: () => void,
  /** Desktop width in px, so the viewport chrome can step aside. */
  widthPx?: number,
): void {
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

  // TELL THE VIEWPORT CHROME TO STEP ASIDE.
  //
  // Reserving height was not enough, and the measurement said so: the camera
  // controls run 530 px tall when their view presets are open, so a panel and
  // the controls both want the right-hand column and there is no height at
  // which they both fit. Measured on a 950 px viewport they overlapped by
  // 281 px — the panel covering the controls for the very scene it describes.
  //
  // So the panel publishes how much of the right edge it is using, and the
  // chrome offsets itself by that. One variable, read by whoever needs it,
  // rather than every overlay knowing about every panel.
  useEffect(() => {
    if (!open || typeof document === 'undefined' || !widthPx) return
    const root = document.documentElement
    const previous = root.style.getPropertyValue('--viewport-right-occupied')
    root.style.setProperty('--viewport-right-occupied', `${widthPx + 12}px`)
    return () => {
      if (previous) root.style.setProperty('--viewport-right-occupied', previous)
      else root.style.removeProperty('--viewport-right-occupied')
    }
  }, [open, widthPx])
}
