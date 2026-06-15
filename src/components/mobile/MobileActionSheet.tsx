// ─── MobileActionSheet ───────────────────────────────────────────────────────
// Content-height bottom sheet listing secondary actions (Share · Copy for AI ·
// Badge · Export …). Keeps the panel header to a single primary CTA + an
// overflow button, so nothing ever clips off a 320px-wide screen. Portalled to
// <body> above the parent sheet.

import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'framer-motion'

const TAP = { WebkitTapHighlightColor: 'transparent' } as const

export interface SheetAction {
  key: string
  icon?: React.ReactNode
  label: string
  desc?: string
  tone?: 'default' | 'accent' | 'ok'
  disabled?: boolean
  onClick: () => void
}

export function MobileActionSheet({
  open, title, actions, onClose, closeLabel = 'Close',
}: {
  open: boolean
  title?: string
  actions: SheetAction[]
  onClose: () => void
  closeLabel?: string
}) {
  const controls = useDragControls()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (typeof document === 'undefined') return null

  const handleDragEnd = (_: unknown, info: PanInfo): void => {
    if (info.offset.y > 90 || info.velocity.y > 600) onClose()
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="action-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[68]"
          style={{ background: 'rgba(0,0,0,0.45)' }}
        />
      )}
      {open && (
        <motion.div
          key="action-sheet"
          role="menu"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 34, stiffness: 360, mass: 0.8 }}
          drag="y"
          dragListener={false}
          dragControls={controls}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.5 }}
          onDragEnd={handleDragEnd}
          className="fixed left-2 right-2 z-[69] mobile-sheet-glass overflow-hidden flex flex-col"
          style={{
            bottom: `calc(env(safe-area-inset-bottom, 0px) + 8px)`,
            maxHeight: 'calc(100dvh - 24px)',
            borderRadius: 26,
          }}
        >
          <div
            onPointerDown={(e) => controls.start(e)}
            className="shrink-0 flex items-center justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing touch-none"
          >
            <div className="sheet-handle" />
          </div>
            {title && (
              <div className="shrink-0 px-5 pt-1 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.09em]" style={{ color: 'rgba(255,255,255,0.32)' }}>
                {title}
              </div>
            )}
            <div className="px-2.5 pb-2.5 flex flex-col gap-1 overflow-y-auto scroll-contain overscroll-contain">
              {actions.map((a) => {
                const color = a.tone === 'accent' ? 'var(--accent-2)' : a.tone === 'ok' ? 'var(--ok)' : 'var(--text)'
                return (
                  <button
                    key={a.key}
                    role="menuitem"
                    disabled={a.disabled}
                    onClick={() => { a.onClick(); onClose() }}
                    className="flex items-center gap-3.5 w-full px-3.5 py-3 rounded-2xl text-left transition-all active:scale-[0.98] disabled:opacity-35"
                    style={{ background: 'rgba(255,255,255,0.04)', ...TAP }}
                  >
                    {a.icon && (
                      <span className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)', color }}>
                        {a.icon}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold leading-tight" style={{ color }}>{a.label}</span>
                      {a.desc && <span className="block text-[11.5px] text-[var(--text-faint)] leading-snug mt-0.5">{a.desc}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
            <div
              className="shrink-0 mx-2.5 mb-2.5 h-12 rounded-2xl flex items-center justify-center text-[14px] font-semibold text-[var(--text-dim)]"
              style={{ background: 'rgba(255,255,255,0.05)' }}
              role="button"
              onClick={onClose}
            >
              {closeLabel}
            </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
