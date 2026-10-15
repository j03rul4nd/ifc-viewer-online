// ─── DrawerResizeGrip ─────────────────────────────────────────────────────────
// The resize grip shared by the Validation and IDS drawers. Both use one height,
// a share of the main column (uiStore.bottomDrawerRatio); the grip only edits
// that share. See docs/WINDOW_DESIGN.md R6.
//
//   drag            follows the pointer; on release, snaps within 16px of a
//                   detent (25 / 40 / 60 %)
//   double-click    cycles the detents
//   ArrowUp/Down    ±24px (±96 with Shift)
//   PageUp/Down     next / previous detent
//   Home / End      minimum / maximum
//
// Only those six keys are stopped: the IDS drawer handles arrows and Enter for
// its rows, and Escape must still reach it to close it.

import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../stores/uiStore'
import {
  DRAWER_RATIO_MAX, DRAWER_RATIO_MIN, DRAWER_STEP_PX,
  clampDrawerPx, drawerMaxPx, nextDetent, ratioForPx, snapPx,
} from '../lib/ui/lane'

interface DrawerResizeGripProps {
  drawerRef: React.RefObject<HTMLElement | null>
  /** The drawer's own minimum height in px. */
  minPx: number
}

const GRIP_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'])

export function DrawerResizeGrip({ drawerRef, minPx }: DrawerResizeGripProps) {
  const { t } = useTranslation('common')
  const ratio = useUIStore((s) => s.bottomDrawerRatio)
  const setRatio = useUIStore((s) => s.setBottomDrawerRatio)
  const [dragging, setDragging] = useState(false)
  const [hovered, setHovered] = useState(false)
  // Removes the document listeners of a drag in progress (also on unmount).
  const endDragRef = useRef<(() => void) | null>(null)

  useEffect(() => () => endDragRef.current?.(), [])

  // Read at event time, so a step never starts from a stale render.
  const current = (): number => useUIStore.getState().bottomDrawerRatio

  const columnHeight = (): number => {
    const drawer = drawerRef.current
    return drawer?.parentElement?.clientHeight || window.innerHeight - 44
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    const drawer = drawerRef.current
    if (e.button !== 0 || !drawer) return
    e.preventDefault()
    e.stopPropagation()

    const startY = e.clientY
    const startH = drawer.offsetHeight
    const colH = columnHeight()
    let lastPx = startH
    let raf = 0

    setDragging(true)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'ns-resize'

    const onMove = (ev: PointerEvent): void => {
      lastPx = startH + (startY - ev.clientY)
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        setRatio(ratioForPx(lastPx, colH, minPx), { persist: false })
      })
    }
    const cleanup = (): void => {
      if (raf) { cancelAnimationFrame(raf); raf = 0 }
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      endDragRef.current = null
    }
    const onUp = (): void => {
      cleanup()
      setDragging(false)
      setRatio(ratioForPx(snapPx(clampDrawerPx(lastPx, colH, minPx), colH), colH, minPx))
    }

    endDragRef.current = cleanup
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!GRIP_KEYS.has(e.key)) return
    e.preventDefault()
    e.stopPropagation()
    const drawer = drawerRef.current
    const colH = columnHeight()
    const h = drawer?.offsetHeight ?? Math.round(current() * colH)
    const step = e.shiftKey ? DRAWER_STEP_PX * 4 : DRAWER_STEP_PX
    switch (e.key) {
      case 'ArrowUp':   setRatio(ratioForPx(h + step, colH, minPx)); break
      case 'ArrowDown': setRatio(ratioForPx(h - step, colH, minPx)); break
      case 'PageUp':    setRatio(nextDetent(current(), 1)); break
      case 'PageDown':  setRatio(nextDetent(current(), -1)); break
      case 'Home':      setRatio(ratioForPx(minPx, colH, minPx)); break
      case 'End':       setRatio(ratioForPx(drawerMaxPx(colH, minPx), colH, minPx)); break
    }
  }

  const active = dragging || hovered
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      tabIndex={0}
      aria-label={t('layout.resizePanel')}
      title={t('layout.resizePanelHint')}
      aria-valuemin={Math.round(DRAWER_RATIO_MIN * 100)}
      aria-valuemax={Math.round(DRAWER_RATIO_MAX * 100)}
      aria-valuenow={Math.round(ratio * 100)}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => setRatio(nextDetent(current(), 1, true))}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="h-5 shrink-0 cursor-ns-resize flex items-center justify-center select-none touch-none outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:-outline-offset-2"
      style={{
        background: dragging ? 'var(--accent)33' : hovered ? 'var(--accent)1a' : 'var(--surface-2)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="flex gap-[4px] items-center">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="w-[4px] h-[4px] rounded-full"
            style={{ background: active ? 'var(--accent)' : 'var(--text-faint)' }}
          />
        ))}
      </div>
    </div>
  )
}
