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
  // The width is passed so the viewport chrome (camera controls, HUD) can move
  // out from under the panel rather than being covered by it.
  useViewportPanel(id, open, onClose, isMobile ? undefined : widthPx)
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
            className="absolute left-3 right-3 z-20 pointer-events-auto select-none"
            // Above the floating nav, using the nav's own clearance token rather
            // than a copied number — the pill has moved before and will again.
            style={{ bottom: 'calc(var(--mobile-nav-clearance) + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="glass-md border border-[var(--border-strong)] rounded-[14px] overflow-hidden shadow-2xl max-h-[46vh] overflow-y-auto">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    )
  }

  const style: React.CSSProperties = { width: `min(${widthPx}px, calc(100vw - 24px))` }
  if (anchor === 'center') {
    style.top = '50%'
    style.transform = centerShift ?? 'translateY(-50%)'
  }

  // THE CARD STOPS ABOVE THE VIEWPORT CHROME.
  //
  // The bottom-right of the viewport belongs to the scene: the camera controls,
  // the model strip and the HUD live there at z-8, under these panels at z-20. A
  // panel that reaches the bottom edge covers the camera controls outright —
  // hiding the controls for the very scene it is describing.
  //
  // A top-anchored card starts below the toolbar and gives back the reserve; a
  // centred one is centred, so it must give back twice as much to stay clear at
  // the bottom. Computed here rather than per panel, which is how four panels
  // ended up with four different answers.
  const chrome = 'var(--viewport-chrome-clearance)'
  style.maxHeight = maxHeight ?? (anchor === 'top'
    ? `calc(100dvh - 3.5rem - ${chrome} - 12px)`
    : `calc(100dvh - 2 * ${chrome})`)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 12 }}
          transition={{ duration: 0.2 }}
          className={`absolute right-3 z-20 pointer-events-auto select-none${anchor === 'top' ? ' top-14' : ''}`}
          style={style}
        >
          <div
            className="glass-md border border-[var(--border-strong)] rounded-[12px] overflow-hidden shadow-2xl flex flex-col min-h-0"
            style={{ maxHeight: style.maxHeight }}
          >
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
