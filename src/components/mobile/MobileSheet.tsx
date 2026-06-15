// ─── MobileSheet ─────────────────────────────────────────────────────────────
// Shared full-height frosted bottom-sheet shell for the mobile panel variants
// (IDS + Validation). Mirrors the language already shipped in MobileBottomNav's
// MiniSheet and the `.mobile-sidebar-sheet` Sidebar: spring slide-up, drag-to-
// dismiss from the grab handle, rounded top, safe-area aware, portalled to
// <body> with a high z-index so it never renders behind the floating viewer
// panels or the ProfileDropdown portal.
//
// Drag is wired through `useDragControls` and started only from the handle, so
// the scrollable body underneath scrolls normally (dragging content does not
// fight the dismiss gesture — the iOS-native pattern).

import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'framer-motion'

interface MobileSheetProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  /** Sheet height as a fraction of the dynamic viewport. Default 0.9 (90dvh). */
  heightDvh?: number
  label?: string
}

export function MobileSheet({ open, onClose, children, heightDvh = 0.9, label }: MobileSheetProps) {
  const controls = useDragControls()

  // Lock the page behind the sheet so the body doesn't scroll under the scrim.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const handleDragEnd = (_: unknown, info: PanInfo): void => {
    if (info.offset.y > 110 || info.velocity.y > 650) onClose()
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="sheet-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[58]"
            style={{
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
            }}
          />

          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 34, stiffness: 340, mass: 0.85 }}
            drag="y"
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={handleDragEnd}
            className="fixed left-0 right-0 bottom-0 z-[59] flex flex-col mobile-sidebar-sheet overflow-hidden"
            style={{
              height: `${Math.round(heightDvh * 100)}dvh`,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
            }}
          >
            {/* Grab handle — the only drag origin so the body scrolls freely. */}
            <div
              onPointerDown={(e) => controls.start(e)}
              className="shrink-0 flex items-center justify-center pt-2.5 pb-1.5 cursor-grab active:cursor-grabbing touch-none select-none"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="sheet-handle" />
            </div>

            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
