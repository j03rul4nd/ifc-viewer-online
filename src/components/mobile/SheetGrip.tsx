// ─── SheetGrip ────────────────────────────────────────────────────────────────
// The drag handle a dialog shows when it is a bottom sheet (phones only; the
// `.m-sheet-grip` class is display:none above 768px). Pull it down and the card
// follows the finger; let go past the threshold — or flick — and it closes.
//
// Deliberately framework-free: it moves the nearest `.m-sheet` ancestor through
// the CSS `translate` property, which neither framer-motion's inline transform
// nor Radix' positioning touches, so it composes with every dialog as written.

import React, { useRef } from 'react'
import { haptic } from '../../lib/haptics'

const DISMISS_PX = 90
const FLICK_PX_PER_MS = 0.6

export function SheetGrip({ onClose }: { onClose: () => void }) {
  const drag = useRef<{ y: number; t: number; card: HTMLElement | null } | null>(null)
  const [active, setActive] = React.useState(false)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    const card = e.currentTarget.closest('.m-sheet') as HTMLElement | null
    drag.current = { y: e.clientY, t: performance.now(), card }
    e.currentTarget.setPointerCapture(e.pointerId)
    if (card) card.style.transition = 'none'
    setActive(true)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d?.card) return
    const dy = Math.max(0, e.clientY - d.y)
    d.card.style.translate = `0 ${dy}px`
  }

  const finish = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    drag.current = null
    setActive(false)
    if (!d) return
    const dy = Math.max(0, e.clientY - d.y)
    const v = dy / Math.max(1, performance.now() - d.t)
    const card = d.card
    if (dy > DISMISS_PX || v > FLICK_PX_PER_MS) {
      haptic('select')
      if (card) {
        card.style.transition = 'translate 200ms ease-in'
        card.style.translate = '0 100%'
      }
      setTimeout(onClose, 180)
      return
    }
    if (card) {
      card.style.transition = 'translate 220ms cubic-bezier(0.32,0.72,0,1)'
      card.style.translate = ''
    }
  }

  return (
    <div
      className="m-sheet-grip cursor-grab select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      aria-hidden
    >
      <div className="sheet-handle" data-dragging={active} />
    </div>
  )
}
