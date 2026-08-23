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

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useIsMobile } from '../hooks/useIsMobile'
import { MobileSheet } from './mobile/MobileSheet'
import { useViewportPanel } from '../hooks/useViewportPanel'

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

export function ViewportPanel({
  id, open, onClose, label, mobile, widthPx,
  anchor = 'center', centerShift, maxHeight, children,
}: ViewportPanelProps) {
  const isMobile = useIsMobile()

  // One-at-a-time and Escape-to-close come from being a ViewportPanel, not from
  // each panel remembering to wire them. The rules live in lib/ui/panel-registry;
  // the hook is the only part that knows about mounting.
  useViewportPanel(id, open, onClose)
  // Half height by default: glancing at the state is the common errand, and
  // opening full every time buries the model the panel is describing.
  const [detent, setDetent] = useState(0)

  if (isMobile && mobile === 'sheet') {
    return (
      <MobileSheet
        open={open}
        onClose={onClose ?? (() => undefined)}
        label={label}
        snapPoints={SHEET_DETENTS}
        detentIndex={detent}
        onDetentChange={setDetent}
      >
        <div className="flex flex-col h-full min-h-0">{children}</div>
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
              top: '3.5rem',
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

  // ── THE RIGHT LANE, SHARED VERTICALLY ───────────────────────────────────────
  //
  // Measured on a real session: the viewport is 1168x546 once the tree and the
  // validation panel have taken their share, while `100dvh` is 950. Panels sized
  // against dvh were therefore 585px tall in a 546px viewport — they hung out of
  // the bottom of the scene and over the panel below it.
  //
  // So the card is anchored TOP AND BOTTOM inside the viewport instead of being
  // given a height. It cannot overflow a container it is measured against, and
  // it needs no magic number to stay inside one.
  //
  // The bottom anchor also leaves the scene its own corner. The camera and
  // position controls live bottom-right at z-8, UNDER these panels: a panel that
  // reaches the bottom edge buries the controls for the very scene it describes.
  // Earlier I made the controls move aside instead, and measuring showed why
  // that was wrong — with no room in the lane they ended up over the middle of
  // the model. The scene is the subject; the window yields to it, not the
  // reverse.
  const style: React.CSSProperties = {
    width: `min(${widthPx}px, calc(100vw - 24px))`,
    // To the LEFT of the rail, which is the panel's own minimised form. Sharing
    // the edge with it would put the card on top of the control that closes it.
    right: 'var(--panel-rail-clearance)',
    top: anchor === 'top' ? '3.5rem' : undefined,
    bottom: 'var(--viewport-chrome-clearance)',
  }
  if (anchor === 'center') {
    // Centre what is left of the lane, never the whole viewport.
    style.top = '3.5rem'
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
          className="absolute z-20 pointer-events-auto select-none flex flex-col"
          style={style}
        >
          {/* `max-h-full` rather than a height: a short panel stays short, and a
              long one stops at the lane and scrolls inside. */}
          <div className="glass-md border border-[var(--border-strong)] rounded-[12px] overflow-hidden shadow-2xl flex flex-col min-h-0 max-h-full">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
