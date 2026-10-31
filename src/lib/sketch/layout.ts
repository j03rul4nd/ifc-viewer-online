// ─── Studio layout ────────────────────────────────────────────────────────────
// Decided only from the space the studio actually has, re-read on every resize.
// That is how one code path serves a closed foldable, the same device open, half
// of a Split View and a laptop, and why no device is named anywhere. A fold can
// change the size mid-session, so nothing here may be read once and kept.

import { MIN_PANE_PX, type DualLayout } from '../ui/display-segments'

export type StudioDensity = 'compact' | 'regular'
export type PaneMode = 'docked-side' | 'docked-stack' | 'floating'

export interface StudioLayout {
  density: StudioDensity
  /** Too short for the page strip and the panel together (half a Split View). */
  short: boolean
  paneMode: PaneMode
  /** Share of the space the docked pane takes. */
  paneShare: number
}

export const REGULAR_MIN_WIDTH = 600
export const REGULAR_MIN_HEIGHT = 480
const SHORT_HEIGHT = 520
/** What the drawing needs clear of the tool rail, or the pane is not worth docking. */
const MIN_DRAWING_PX = 360
/** The rail sits over the drawing when there is room for one. */
export const RAIL_CLEARANCE_PX = 260

export function resolveStudioLayout(width: number, height: number, hardware?: DualLayout | null): StudioLayout {
  const density: StudioDensity = width >= REGULAR_MIN_WIDTH && height >= REGULAR_MIN_HEIGHT ? 'regular' : 'compact'
  const short = height < SHORT_HEIGHT
  // A real hinge decides the split; the size of each side is the hardware's.
  if (hardware) {
    return { density, short, paneMode: hardware.posture === 'side-by-side' ? 'docked-side' : 'docked-stack', paneShare: 0.5 }
  }
  const side = width * 0.36
  const rail = density === 'regular' ? RAIL_CLEARANCE_PX : 0
  if (side >= MIN_PANE_PX && width - side - rail >= MIN_DRAWING_PX) return { density, short, paneMode: 'docked-side', paneShare: 0.36 }
  const stack = height * 0.36
  if (stack >= 240 && height - stack >= MIN_DRAWING_PX) return { density, short, paneMode: 'docked-stack', paneShare: 0.36 }
  return { density, short, paneMode: 'floating', paneShare: 0 }
}
