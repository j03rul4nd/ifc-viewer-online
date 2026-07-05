// ─── MobileSheet ─────────────────────────────────────────────────────────────
// Multi-detent frosted bottom sheet — the shared shell for the mobile panels
// (IDS + Validation). This is the TikTok/Instagram-comments pattern: the sheet
// is a *resizable layer* over live full-bleed content, not a one-way modal.
//
//   • snapPoints: dvh fractions, e.g. [0.16, 0.55, 0.92] → peek / half / full.
//     Position is driven by a framer useMotionValue and settles under projected
//     velocity (iOS deceleration heuristic) to the nearest detent, or dismisses
//     past the lowest one.
//   • Drag works ANYWHERE, not just the handle: a downward pan on the content
//     starts a sheet drag only when the inner scroller is at the top — otherwise
//     the list scrolls (the real native contract). Horizontal swipes (chip rows)
//     are never hijacked.
//   • At a "peek"/resizable detent the scrim never blocks the canvas, so the user
//     can orbit the 3D model WHILE reading results — impossible with the old
//     full-screen sheet.
//   • Haptic tick on every detent settle.
//
// Backward compatible: with no snapPoints it is a single-detent modal sheet
// (heightDvh, solid scrim, tap-to-close) exactly like before.

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  AnimatePresence, motion, animate, useMotionValue, useTransform,
  useDragControls, type PanInfo,
} from 'framer-motion'
import { haptic } from '../../lib/haptics'

interface MobileSheetProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  /** Single-detent height fraction when `snapPoints` is not given. Default 0.9. */
  heightDvh?: number
  /** Detent stops as dvh fractions (ascending). Enables the resizable layer mode. */
  snapPoints?: number[]
  /** Controlled current detent index (into the sorted snapPoints). */
  detentIndex?: number
  /** Fires with the new index whenever the sheet settles on a different detent. */
  onDetentChange?: (index: number) => void
  /** Temporarily slide the sheet fully off-screen WITHOUT unmounting it (e.g. while
   *  a full-screen overlay like the failure reel is on top). Returns to its detent
   *  when cleared — avoids the mount/unmount churn of toggling `open`. */
  suspended?: boolean
  label?: string
}

const SNAP_SPRING = { type: 'spring' as const, damping: 38, stiffness: 360, mass: 0.9 }

/** Nearest scrollable ancestor of `node` up to (not including) `root`, else null. */
function scrollableAncestor(node: EventTarget | null, root: HTMLElement | null): HTMLElement | null {
  let el = node instanceof HTMLElement ? node : null
  while (el && el !== root) {
    const oy = getComputedStyle(el).overflowY
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el
    el = el.parentElement
  }
  return null
}

export function MobileSheet({
  open, onClose, children, heightDvh = 0.9, snapPoints, detentIndex, onDetentChange, suspended = false, label,
}: MobileSheetProps) {
  const controls = useDragControls()
  const y = useMotionValue(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  const [vh, setVh] = useState<number>(() => (typeof window !== 'undefined' ? window.innerHeight : 800))
  const [rendered, setRendered] = useState(false)

  // Sorted, de-duped, in-range detents. Single [heightDvh] keeps legacy behavior.
  const detents = useMemo(() => {
    const pts = (snapPoints && snapPoints.length ? snapPoints : [heightDvh]).filter((n) => n > 0 && n <= 1)
    return Array.from(new Set(pts)).sort((a, b) => a - b)
  }, [snapPoints, heightDvh])

  const topIdx = detents.length - 1
  const maxFrac = detents[topIdx]
  const sheetH = Math.round(maxFrac * vh)
  const resizable = detents.length > 1
  const detentY = useCallback((i: number) => Math.round((maxFrac - detents[i]) * vh), [detents, maxFrac, vh])

  const curIdx = useRef(detentIndex ?? topIdx)

  // Single animation authority: every y animation goes through here, and each
  // call cancels the previous one. This is what makes the sheet deterministic —
  // no two springs ever fight over `y`, so an interrupted move always re-converges
  // to the newest target instead of freezing at an arbitrary pixel.
  const activeAnim = useRef<{ stop: () => void } | null>(null)
  const runAnim = useCallback((target: number, opts?: Record<string, number>) => {
    activeAnim.current?.stop()
    activeAnim.current = animate(y, target, { ...SNAP_SPRING, ...opts })
  }, [y])
  useEffect(() => () => activeAnim.current?.stop(), [])

  // Track viewport height (dynamic viewport / rotation) and re-pin to the detent.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = (): void => setVh(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => {
    if (rendered) { activeAnim.current?.stop(); y.set(detentY(curIdx.current)) }
  }, [vh]) // eslint-disable-line react-hooks/exhaustive-deps

  // Body scroll lock while open (page behind can't rubber-band under the sheet).
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Enter / exit. On open: mount from offscreen only when the sheet was fully
  // closed; when reopening mid-exit, reverse smoothly from the current position
  // (no teleport). On close: slide down, then unmount after the spring settles.
  useEffect(() => {
    if (open) {
      const idx = detentIndex ?? topIdx
      curIdx.current = idx
      if (!rendered) { setRendered(true); y.set(sheetH) } // truly closed → start offscreen
      if (!suspended) runAnim(detentY(idx))
      return
    }
    if (rendered) {
      runAnim(sheetH, { damping: 42 })
      const done = setTimeout(() => setRendered(false), 340)
      return () => clearTimeout(done)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Controlled detent changes from the parent (e.g. snap to peek on element select).
  // Gated on `open` (and not suspended): a detent change that lands while the sheet
  // is closing or hidden must NOT restart a spring — reopening/unsuspending is driven
  // by the effects below, which already read the latest detentIndex.
  useEffect(() => {
    if (!open || !rendered || suspended || detentIndex == null || detentIndex === curIdx.current) return
    curIdx.current = detentIndex
    runAnim(detentY(detentIndex))
  }, [detentIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  // Suspend / restore: slide fully off-screen while a full-screen overlay is up,
  // then return to the current detent. Keeps the sheet mounted (no open toggle),
  // so there's no enter/exit race with whatever dismissed the overlay.
  useEffect(() => {
    if (!open || !rendered) return
    if (suspended) runAnim(sheetH)
    else runAnim(detentY(detentIndex ?? curIdx.current))
  }, [suspended]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scrim: tap-to-close for a modal sheet; a light dim that fades toward the peek
  // detent (and never blocks the canvas) for a resizable layer sheet. Either way
  // opacity is driven by `y` so the scrim fades in step with the slide.
  const dimTop = resizable ? 0.42 : 0.5
  const dimBottom = resizable ? Math.max(1, detentY(0)) : sheetH
  const scrimOpacity = useTransform(y, [0, dimBottom], [dimTop, 0])

  // ── Drag-anywhere handoff ──────────────────────────────────────────────────
  const dragging = useRef(false)
  const armed = useRef(false)
  const startPt = useRef({ x: 0, y: 0 })

  const onRootPointerDown = useCallback((e: React.PointerEvent): void => {
    const sc = scrollableAncestor(e.target, sheetRef.current)
    armed.current = !sc || sc.scrollTop <= 0
    startPt.current = { x: e.clientX, y: e.clientY }
  }, [])

  const onRootPointerMove = useCallback((e: React.PointerEvent): void => {
    if (!armed.current || dragging.current) return
    const dx = e.clientX - startPt.current.x
    const dy = e.clientY - startPt.current.y
    if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
      dragging.current = true
      setHandleDragging(true)
      controls.start(e)
    }
  }, [controls])

  const clearArm = useCallback((): void => { armed.current = false }, [])

  const [handleDragging, setHandleDragging] = useState(false)

  const handleDragEnd = useCallback((_: unknown, info: PanInfo): void => {
    dragging.current = false
    armed.current = false
    setHandleDragging(false)
    const projected = y.get() + info.velocity.y * 0.2
    const lowestY = detentY(0)
    const fastDown = info.velocity.y > 850

    // Dismiss when projected clearly past the lowest detent, or a hard flick down there.
    const dismissLine = lowestY + Math.max(64, vh * 0.1)
    if (projected > dismissLine || (fastDown && Math.abs(y.get() - lowestY) < vh * 0.12)) {
      onClose()
      return
    }

    // Otherwise snap to the nearest detent under projected position.
    let best = 0
    let bestDist = Infinity
    detents.forEach((_frac, i) => {
      const d = Math.abs(projected - detentY(i))
      if (d < bestDist) { bestDist = d; best = i }
    })
    animate(y, detentY(best), SNAP_SPRING)
    if (best !== curIdx.current) {
      curIdx.current = best
      haptic('select')
      onDetentChange?.(best)
    }
  }, [y, detents, detentY, vh, onClose, onDetentChange])

  if (typeof document === 'undefined' || !rendered) {
    return null
  }

  return createPortal(
    <>
      <motion.div
        key="sheet-scrim"
        style={{ opacity: scrimOpacity, background: '#000', pointerEvents: resizable ? 'none' : 'auto' }}
        onClick={resizable ? undefined : onClose}
        className="fixed inset-0 z-[58]"
      />

      <motion.div
        ref={sheetRef}
        key="sheet"
        role="dialog"
        aria-modal={resizable ? undefined : 'true'}
        aria-label={label}
        style={{ y, height: sheetH, borderTopLeftRadius: 22, borderTopRightRadius: 22 }}
        drag="y"
        dragListener={false}
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: sheetH }}
        dragElastic={{ top: 0.05, bottom: 0.5 }}
        onDragEnd={handleDragEnd}
        onPointerDownCapture={onRootPointerDown}
        onPointerMoveCapture={onRootPointerMove}
        onPointerUp={clearArm}
        onPointerCancel={clearArm}
        className="fixed left-0 right-0 bottom-0 z-[59] flex flex-col mobile-sidebar-sheet overflow-hidden touch-pan-y"
      >
        {/* Grab handle — always an immediate drag origin. */}
        <div
          onPointerDown={(e) => { dragging.current = true; setHandleDragging(true); controls.start(e) }}
          className="shrink-0 flex items-center justify-center pt-2.5 pb-1.5 cursor-grab active:cursor-grabbing touch-none select-none"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <div className="sheet-handle" data-dragging={handleDragging} />
        </div>

        {children}
      </motion.div>
    </>,
    document.body,
  )
}
