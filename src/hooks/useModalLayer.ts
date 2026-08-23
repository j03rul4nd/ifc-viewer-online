// ─── useModalLayer ────────────────────────────────────────────────────────────
// The React half of the modal stack: membership while mounted, and the z-index
// that follows from it.
//
// The stack itself (src/lib/ui/modal-stack) is pure — no React, no DOM — so the
// ordering rules can be tested without mounting anything. This hook is the only
// thing that knows a component has a lifecycle, which keeps the two concerns
// from growing into each other.

import { useEffect, useRef, useState } from 'react'
import { pushModal, popModal, isTopModal, modalZIndex } from '../lib/ui/modal-stack'

export interface ModalLayer {
  /** z-index for the backdrop; the card sits one above. */
  z: number
  /** True when this modal is the one the user is actually looking at. */
  isTop: () => boolean
}

/**
 * Join the modal stack while `open`, and leave it on close or unmount.
 *
 * Returns the layer this modal occupies. The value is recomputed when the stack
 * moves, so a dialog opened on top of this one actually lands on top of it —
 * which a z-index chosen at write time cannot do.
 */
export function useModalLayer(id: string, open: boolean, onClose?: () => void): ModalLayer {
  // A counter, not the stack itself: the stack is module state, so the only
  // thing a render needs is a reason to read it again.
  const [, bump] = useState(0)

  // Through a ref so a changing handler identity does not re-run the effect and
  // re-announce the modal — which would look like it closed and reopened.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    // The close handler is what makes exclusivity possible: a modal opening
    // needs a way to dismiss whatever it is taking over from.
    pushModal(id, () => onCloseRef.current?.())
    bump((n) => n + 1)
    return () => {
      popModal(id)
      bump((n) => n + 1)
    }
  }, [open, id])

  return {
    z: modalZIndex(id),
    // A function rather than a boolean: the answer is read inside event
    // handlers, where a value captured at render time would be stale by exactly
    // the case that matters — a dialog opened after this one.
    isTop: () => isTopModal(id),
  }
}
