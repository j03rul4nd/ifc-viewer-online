// ─── Display segments ─────────────────────────────────────────────────────────
// Where the screen is physically split, and how the viewer should lay out
// around it. Pure: everything the browser reports is passed in, so the rules
// can be tested without a foldable on the desk. docs/DUAL_SCREEN.md.
//
// What browsers actually expose (verified 2026-10, see the doc for sources):
//   - Viewport Segments API — `window.viewport.segments`, plus the CSS media
//     features `horizontal-/vertical-viewport-segments` and the
//     `env(viewport-segment-*)` variables. Chromium on Android foldables and
//     Windows dual-screen. Reports >1 segment only when the device is folded
//     (book / tabletop posture) or spans two physical panels; a foldable lying
//     flat reports ONE segment, because there is nothing to avoid.
//   - `window.getWindowSegments()` — the older Edge-on-Surface-Duo API, kept as
//     a fallback; removed from current browsers.
//   - Device Posture API (`navigator.devicePosture.type`) — 'continuous' or
//     'folded'. Informational only: it says the device is bent, not where.
//   - Safari/WebKit implements none of these. No commercial device name is
//     exposed to the web, so there is nothing to detect "an iPhone Duo" by and
//     we do not try: a device is dual when it REPORTS two segments.

export interface SegmentRect { x: number; y: number; width: number; height: number }

/** How the two panes sit relative to each other. */
export type DualPosture = 'side-by-side' | 'stacked'

/** Where the layout comes from: the hardware, or the user asking for a split. */
export type DualSource = 'hardware' | 'manual'

export interface DualLayout {
  posture: DualPosture
  source: DualSource
  /** Rect the 3D viewer gets (CSS px, viewport coordinates). */
  viewer: SegmentRect
  /** Rect the companion pane gets. */
  pane: SegmentRect
  /** The dead zone between them — hinge or seam. Zero-size for a manual split. */
  hinge: SegmentRect
}

/** 'auto' follows the hardware; 'off' never splits; 'split' also splits a wide touch screen. */
export type DualScreenPref = 'auto' | 'off' | 'split'

interface SegmentsSource {
  viewport?: { segments?: ArrayLike<SegmentRect> | null } | null
  getWindowSegments?: () => ArrayLike<SegmentRect>
}

/** Read the segments the browser reports, newest API first. Never throws. */
export function readSegments(win: SegmentsSource | undefined): SegmentRect[] {
  if (!win) return []
  try {
    const modern = win.viewport?.segments
    if (modern && modern.length > 0) return Array.from(modern, toRect)
  } catch { /* a half-implemented API must not stop the layout */ }
  try {
    if (typeof win.getWindowSegments === 'function') return Array.from(win.getWindowSegments(), toRect)
  } catch { /* same */ }
  return []
}

function toRect(r: SegmentRect): SegmentRect {
  return { x: r.x, y: r.y, width: r.width, height: r.height }
}

/**
 * Below this a pane cannot hold either the viewer or a property list usefully,
 * so a split that would produce one is refused — a narrow sliver beside the
 * hinge is worse than ignoring the hinge.
 */
export const MIN_PANE_PX = 280

/** A manual split is offered only on touch screens at least this wide. */
export const MANUAL_SPLIT_MIN_WIDTH = 720

export interface ResolveInput {
  segments: SegmentRect[]
  viewportWidth: number
  viewportHeight: number
  pref: DualScreenPref
  /** Primary pointer is coarse (a finger), from `(pointer: coarse)`. */
  coarsePointer: boolean
  /** Put the viewer on the second segment instead of the first. */
  swap: boolean
}

/** Whether the user can ask for a split here at all (drives showing the toggle). */
export function canOfferSplit(i: Pick<ResolveInput, 'segments' | 'viewportWidth' | 'coarsePointer'>): boolean {
  return hardwarePair(i.segments) !== null || (i.coarsePointer && i.viewportWidth >= MANUAL_SPLIT_MIN_WIDTH)
}

/** The layout to use, or null for the normal single-screen app. */
export function resolveDualLayout(i: ResolveInput): DualLayout | null {
  if (i.pref === 'off') return null

  const pair = hardwarePair(i.segments)
  if (pair) {
    const [a, b] = pair
    const posture: DualPosture = Math.abs(a.y - b.y) < 1 ? 'side-by-side' : 'stacked'
    const hinge: SegmentRect = posture === 'side-by-side'
      ? { x: a.x + a.width, y: a.y, width: Math.max(0, b.x - (a.x + a.width)), height: a.height }
      : { x: a.x, y: a.y + a.height, width: a.width, height: Math.max(0, b.y - (a.y + a.height)) }
    const [viewer, pane] = i.swap ? [b, a] : [a, b]
    return { posture, source: 'hardware', viewer, pane, hinge }
  }

  // No hardware split: only when asked, and only where two panes fit.
  if (i.pref !== 'split' || !i.coarsePointer || i.viewportWidth < MANUAL_SPLIT_MIN_WIDTH) return null
  const landscape = i.viewportWidth >= i.viewportHeight
  if (landscape) {
    // The viewer keeps the larger share: it is the thing being navigated.
    const paneW = Math.max(MIN_PANE_PX, Math.round(i.viewportWidth * 0.38))
    const viewerW = i.viewportWidth - paneW
    const viewer = { x: i.swap ? paneW : 0, y: 0, width: viewerW, height: i.viewportHeight }
    const pane = { x: i.swap ? 0 : viewerW, y: 0, width: paneW, height: i.viewportHeight }
    return { posture: 'side-by-side', source: 'manual', viewer, pane, hinge: { x: i.swap ? paneW : viewerW, y: 0, width: 0, height: i.viewportHeight } }
  }
  const paneH = Math.max(MIN_PANE_PX, Math.round(i.viewportHeight * 0.4))
  const viewerH = i.viewportHeight - paneH
  const viewer = { x: 0, y: i.swap ? paneH : 0, width: i.viewportWidth, height: viewerH }
  const pane = { x: 0, y: i.swap ? 0 : viewerH, width: i.viewportWidth, height: paneH }
  return { posture: 'stacked', source: 'manual', viewer, pane, hinge: { x: 0, y: viewerH, width: i.viewportWidth, height: 0 } }
}

/** The two usable segments, or null when the hardware does not report exactly a usable pair. */
function hardwarePair(segments: SegmentRect[]): [SegmentRect, SegmentRect] | null {
  if (segments.length !== 2) return null
  const [a, b] = [...segments].sort((p, q) => (p.y - q.y) || (p.x - q.x))
  const sideBySide = Math.abs(a.y - b.y) < 1
  const smallest = sideBySide ? Math.min(a.width, b.width) : Math.min(a.height, b.height)
  return smallest >= MIN_PANE_PX ? [a, b] : null
}
