// ─── overlayStore ─────────────────────────────────────────────────────────────
// UX options for the 3D highlight overlay (the isolate-issues view). These are
// "how to show the problems" knobs — distinct from validationMode/highlightMode
// (the on/off switches) and from the validation panel's list filters.
//
// The OverlayHud writes these; App's overlay effect reads them and feeds them to
// the viewer, which forwards them to the OverlayController.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { clamp } from '../lib/utils'
import type { SeverityFilter } from '../lib/overlay-controller'

export type Severity = keyof SeverityFilter // 'error' | 'warning' | 'info'

/** Ghost (dim) opacity bounds — low enough to nearly hide context, never 0. */
export const GHOST_OPACITY_MIN = 0.02
export const GHOST_OPACITY_MAX = 0.4
export const GHOST_OPACITY_DEFAULT = 0.1

interface OverlayStore {
  /** Which severities are painted in colour; the rest fall back to the ghost. */
  severities: SeverityFilter
  /** Opacity of the dimmed (ghosted) context, 0.02–0.4. */
  ghostOpacity: number
  /** X-ray: render the flagged elements through occluding geometry (no depth test). */
  xray: boolean

  /** Toggle one severity. Never lets the user turn ALL three off (keeps ≥1 on). */
  toggleSeverity: (severity: Severity) => void
  setGhostOpacity: (value: number) => void
  toggleXray: () => void
  /** Restore defaults — called when the overlay turns off / on a fresh model. */
  resetOverlayOptions: () => void
}

const DEFAULTS = {
  severities: { error: true, warning: true, info: true } as SeverityFilter,
  ghostOpacity: GHOST_OPACITY_DEFAULT,
  xray: false,
}

export const useOverlayStore = create<OverlayStore>()(
  devtools(
    (set) => ({
      ...DEFAULTS,

      toggleSeverity: (severity) =>
        set(
          (s) => {
            const next = { ...s.severities, [severity]: !s.severities[severity] }
            // Guard: at least one severity must stay on, otherwise the overlay would
            // dim the whole scene to show nothing.
            if (!next.error && !next.warning && !next.info) return s
            return { severities: next }
          },
          false,
          `overlay/toggleSeverity:${severity}`,
        ),

      setGhostOpacity: (value) =>
        set(
          { ghostOpacity: clamp(value, GHOST_OPACITY_MIN, GHOST_OPACITY_MAX) },
          false,
          'overlay/setGhostOpacity',
        ),

      toggleXray: () => set((s) => ({ xray: !s.xray }), false, 'overlay/toggleXray'),

      resetOverlayOptions: () =>
        set(
          { severities: { ...DEFAULTS.severities }, ghostOpacity: DEFAULTS.ghostOpacity, xray: DEFAULTS.xray },
          false,
          'overlay/reset',
        ),
    }),
    { name: 'overlay' },
  ),
)
