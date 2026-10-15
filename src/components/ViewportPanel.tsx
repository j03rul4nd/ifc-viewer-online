// ─── ViewportPanel ────────────────────────────────────────────────────────────
// The shell every panel that floats over the 3D canvas shares.
//
// On desktop they are all the same thing: a frosted card pinned to the right
// edge, sized to its contents. That is the right shape when there is room for a
// tool palette beside the model.
//
// On a phone it is the wrong shape twice over. The card keeps its desktop width
// against a 375px screen, so it covers most of the model it is meant to control;
// and it sits against the right edge and vertically centred, which is the part
// of the screen a thumb reaches worst. Neither is a styling problem — the panel
// is simply in the wrong place.
//
// TWO MOBILE BEHAVIOURS, because these panels are not one kind of thing:
//
//   'sheet' — for panels with real content to work through (map placement, a
//             solar study). They become a bottom sheet with two detents: half
//             for a glance, full for the work. Their content is already a
//             header, a pinned action and a scrolling body, which is exactly a
//             sheet's anatomy, so nothing inside has to change.
//
//   'dock'  — for the small palettes of three or four controls (section,
//             measurement, floor plan). A bottom sheet for three buttons is a
//             lot of ceremony; what they need is to stop covering the middle of
//             the model and to sit where a thumb already is. They dock to the
//             bottom of the viewport, full width inside the margins, resting on
//             the floating nav's own clearance.
//
// Desktop rendering is untouched in both cases.

import React, { useEffect, useLayoutEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useIsMobile } from '../hooks/useIsMobile'
import { MobileSheet } from './mobile/MobileSheet'
import { useViewportPanel } from '../hooks/useViewportPanel'
import { useLaneStore } from '../stores/laneStore'
import { canExtendOverDrawer, laneBottomCss } from '../lib/ui/lane'

export type ViewportPanelMobile = 'sheet' | 'dock'

interface ViewportPanelBase {
  /**
   * Stable identity, so the panels can be coordinated with each other.
   * See panel-registry for the rules this buys.
   */
  id: string
  open: boolean
  /** Accessible name for the sheet. */
  label: string
  /** Desktop card width in px, before the viewport clamp. */
  widthPx: number
  /**
   * Desktop vertical placement. 'top' pins below the toolbar; 'center' floats
   * against the right edge with an optional nudge, which is how the small
   * palettes were already positioned.
   */
  anchor?: 'top' | 'center'
  /** For anchor='center': how far to shift from true centre, as a CSS translate. */
  centerShift?: string
  /**
   * Override the computed desktop cap. Rarely needed: the shell already sizes
   * the card to the space between the toolbar and the viewport chrome, and a
   * hand-picked value is how four panels ended up with four different heights
   * — three of which reached down over the camera controls.
   */
  maxHeight?: string
  /**
   * Mobile 'sheet' only: add a low "peek" detent showing just the top of the
   * content. For panels whose point is to WATCH the scene while you drive it
   * (the map, the sun): put the live control first and the sheet can rest
   * low with the scene in full view above it.
   */
  peek?: boolean
  /**
   * Mobile 'sheet' only: whenever this changes to a non-null value the sheet
   * drops to its lowest detent — e.g. the moment the map or the study starts,
   * so the user sees the result instead of the form that produced it.
   */
  collapseKey?: string | number | null
  children: React.ReactNode
}

/**
 * A sheet you cannot drag closed is a trap, so 'sheet' demands an onClose; a
 * docked strip has no dismiss gesture and does not need one. Encoding that in
 * the type is cheaper than remembering it.
 */
export type ViewportPanelProps = ViewportPanelBase & (
  | { mobile: 'sheet'; onClose: () => void }
  | { mobile: 'dock'; onClose?: () => void }
)

/** Detents for the sheet: a glance, then the whole thing. */
const SHEET_DETENTS = [0.55, 0.94]
/** Peek: header + the one live control (≈ 180px on a 812px phone). */
const PEEK_DETENTS = [0.23, 0.55, 0.94]

export function ViewportPanel({
  id, open, onClose, label, mobile, widthPx,
  anchor = 'center', centerShift, maxHeight, peek = false, collapseKey = null, children,
}: ViewportPanelProps) {
  const isMobile = useIsMobile()

  // One-at-a-time and Escape-to-close come from being a ViewportPanel, not from
  // each panel remembering to wire them. The rules live in lib/ui/panel-registry;
  // the hook is the only part that knows about mounting.
  useViewportPanel(id, open, onClose)

  // The lane claim. Only content panels ('sheet' on phones) run down over the
  // results drawer, and only while it keeps MIN_DRAWER_CONTENT_PX of width; the
  // drawer reads the claim to pad its content clear of the card. A layout
  // effect, so the padding lands before paint. Release is owner-only, which is
  // what makes the registry's open-B-then-close-A order safe.
  const columnAllows = useLaneStore((s) => canExtendOverDrawer(s.columnWidthPx, widthPx))
  const isContent = mobile === 'sheet'
  const overDrawer = !isMobile && isContent && columnAllows
  useLayoutEffect(() => {
    if (!open || isMobile || !isContent) return
    useLaneStore.getState().claimLane(id, widthPx, overDrawer)
    return () => useLaneStore.getState().releaseLane(id)
  }, [open, isMobile, isContent, id, widthPx, overDrawer])
  // Half height by default: glancing at the state is the common errand, and
  // opening full every time buries the model the panel is describing.
  // With a peek detent, half is index 1: open on half, collapse to peek.
  const [detent, setDetent] = useState(peek ? 1 : 0)
  useEffect(() => { if (!open) setDetent(peek ? 1 : 0) }, [open, peek])
  useEffect(() => { if (collapseKey != null) setDetent(0) }, [collapseKey])

  if (isMobile && mobile === 'sheet') {
    return (
      <MobileSheet
        open={open}
        onClose={onClose ?? (() => undefined)}
        label={label}
        snapPoints={peek ? PEEK_DETENTS : SHEET_DETENTS}
        detentIndex={detent}
        onDetentChange={setDetent}
      >
        <div className="m-touch flex flex-col h-full min-h-0">{children}</div>
      </MobileSheet>
    )
  }

  if (isMobile) {
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2 }}
            className="absolute left-3 right-3 z-20 pointer-events-auto select-none flex flex-col"
            // ── THE SAME RULE AS THE OTHER TWO FORMS ──────────────────────────
            // Anchored top AND bottom rather than given a height: bottom above
            // the floating nav (its own token, not a copied number — the pill
            // has moved before and will again), top below the app chrome.
            //
            // It used to stop at `46vh`. A fraction of the visual viewport is
            // not the space this card has: measured on a 390x844 phone it
            // capped at 388px inside 724px of actual room, and on a shorter
            // screen the same fraction is a different, equally arbitrary answer.
            // The desktop lane learned this already — anchor it, do not size it.
            style={{
              bottom: 'calc(var(--mobile-nav-clearance) + env(safe-area-inset-bottom, 0px))',
              // Below the floating top capsules on phones (--mobile-top-ui).
              top: 'calc(var(--mobile-top-ui) + 8px)',
              justifyContent: 'flex-end',
            }}
          >
            {/* `max-h-full` and NOT a scroller of its own: the panel inside owns
                the anatomy every other form already follows — header fixed, body
                scrolls, footer pinned. Scrolling the whole card took the header
                with it, which is the one thing a header must not do. */}
            <div className="glass-md border border-[var(--border-strong)] rounded-[14px] overflow-hidden shadow-2xl flex flex-col min-h-0 max-h-full">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    )
  }

  // ── THE LANE IS THE MAIN COLUMN ─────────────────────────────────────────────
  //
  // The card is anchored TOP AND BOTTOM rather than given a height: it cannot
  // overflow a container it is measured against, and needs no magic number.
  //
  // Content panels ('sheet') run to 12px above the bottom of the MAIN COLUMN —
  // over the right side of an open Validation/IDS drawer, which yields WIDTH
  // (it pads its content by this card's width + 68px), never height. The
  // distance is `--lane-drawer-h`, written on [data-main-column] by
  // useMainColumnLaneRef. This only works because the viewer area is unclipped
  // and has no z-index, and the drawer roots are unpositioned — see
  // docs/WINDOW_DESIGN.md R3/R6 and scripts/viewport-lane.test.ts. When the
  // drawer would keep less than 460px, the panel stops above it instead.
  //
  // Palettes ('dock') stop 12px above the bottom of the viewer. Neither form
  // reaches the camera button: it sits right of the lane (right 16-48px), and
  // the lane starts at the rail clearance (right 60px).
  const style: React.CSSProperties = {
    // Measured against the container, not the viewport: the viewer is narrower
    // than the window whenever the tree is open.
    width: `min(${widthPx}px, calc(100% - var(--panel-rail-clearance) - 12px))`,
    // To the LEFT of the rail, which is the panel's own minimised form. Sharing
    // the edge with it would put the card on top of the control that closes it.
    right: 'var(--panel-rail-clearance)',
    top: '3.5rem',
    bottom: laneBottomCss(overDrawer),
  }
  if (maxHeight) style.maxHeight = maxHeight

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 12 }}
          transition={{ duration: 0.2 }}
          // The wrapper spans the whole lane while the card hugs its content,
          // so the wrapper must not take clicks: its transparent part used to
          // swallow clicks on the model (and now would on the drawer).
          className="absolute z-20 pointer-events-none select-none flex flex-col"
          data-viewport-panel={id}
          data-lane={overDrawer ? 'column' : 'viewer'}
          style={style}
        >
          {/* `max-h-full` rather than a height: a short panel stays short, and a
              long one stops at the lane and scrolls inside. */}
          <div className="glass-md pointer-events-auto border border-[var(--border-strong)] rounded-[12px] overflow-hidden shadow-2xl flex flex-col min-h-0 max-h-full">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
