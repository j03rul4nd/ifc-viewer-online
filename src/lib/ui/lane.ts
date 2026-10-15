// The lane: where floating content panels live, and how much of the main column
// the Validation/IDS drawer takes. Pure numbers — no React, no store — so the
// geometry can be pinned by unit tests. See docs/WINDOW_DESIGN.md R6.

/** Gap between a panel and the bottom edge of its lane. */
export const LANE_EDGE_GAP_PX = 12
/** Mirrors `--panel-rail-clearance` in index.css (rail 40px + 20px). Pinned by scripts/viewport-lane.test.ts. */
export const RAIL_CLEARANCE_PX = 60
/** Gap between an extended panel and the drawer's last control. */
export const LANE_GAP_PX = 8
/** What a drawer reserves beyond the panel's own width: rail clearance plus the gap. */
export const LANE_RESERVE_EXTRA_PX = RAIL_CLEARANCE_PX + LANE_GAP_PX
/** Below this drawer width the collapse button would be the first thing clipped. */
export const MIN_DRAWER_CONTENT_PX = 460

export const DRAWER_DEFAULT_RATIO = 0.4
export const DRAWER_RATIO_MIN = 0.1
export const DRAWER_RATIO_MAX = 0.9
export const DRAWER_DETENTS: readonly number[] = [0.25, 0.4, 0.6]
export const DRAWER_MIN_PX = 180
export const IDS_DRAWER_MIN_PX = 220
/** The scene never gets less than this while a drawer is expanded. */
export const SCENE_MIN_PX = 240
export const DRAWER_STEP_PX = 24
export const DRAWER_SNAP_PX = 16

/** Whether a content panel of `panelWidthPx` may run down over the drawer. */
export function canExtendOverDrawer(columnWidthPx: number, panelWidthPx: number): boolean {
  if (!(columnWidthPx > 0)) return false
  return columnWidthPx - (panelWidthPx + LANE_RESERVE_EXTRA_PX) >= MIN_DRAWER_CONTENT_PX
}

/** The CSS `bottom` of a panel's desktop wrapper. */
export function laneBottomCss(overDrawer: boolean): string {
  return overDrawer ? `calc(${LANE_EDGE_GAP_PX}px - var(--lane-drawer-h, 0px))` : `${LANE_EDGE_GAP_PX}px`
}

export function clampRatio(r: number): number {
  if (!Number.isFinite(r)) return DRAWER_DEFAULT_RATIO
  return Math.min(DRAWER_RATIO_MAX, Math.max(DRAWER_RATIO_MIN, r))
}

/** The drawer height as CSS; `100%` is the main column. */
export function drawerHeightCss(ratio: number, minPx: number): string {
  return `clamp(${minPx}px, ${(clampRatio(ratio) * 100).toFixed(2)}%, calc(100% - ${SCENE_MIN_PX}px))`
}

export function drawerMaxPx(colH: number, minPx: number): number {
  return Math.max(minPx, colH - SCENE_MIN_PX)
}

export function clampDrawerPx(px: number, colH: number, minPx: number): number {
  return Math.max(minPx, Math.min(px, drawerMaxPx(colH, minPx)))
}

/** The ratio to store for a drawer of `px`, always computed from the clamped size. */
export function ratioForPx(px: number, colH: number, minPx: number): number {
  if (!(colH > 0)) return DRAWER_DEFAULT_RATIO
  return clampRatio(clampDrawerPx(px, colH, minPx) / colH)
}

/** Magnetic snap: the first detent within DRAWER_SNAP_PX, else `px` unchanged. */
export function snapPx(px: number, colH: number): number {
  for (const d of DRAWER_DETENTS) {
    const target = Math.round(d * colH)
    if (Math.abs(px - target) <= DRAWER_SNAP_PX) return target
  }
  return px
}

/** The next detent strictly beyond `ratio` in `dir`; at the end, wrap or stay. */
export function nextDetent(ratio: number, dir: 1 | -1, wrap = false): number {
  const eps = 0.005
  if (dir === 1) {
    const found = DRAWER_DETENTS.find((d) => d > ratio + eps)
    if (found !== undefined) return found
    return wrap ? DRAWER_DETENTS[0] : DRAWER_DETENTS[DRAWER_DETENTS.length - 1]
  }
  for (let i = DRAWER_DETENTS.length - 1; i >= 0; i--) {
    if (DRAWER_DETENTS[i] < ratio - eps) return DRAWER_DETENTS[i]
  }
  return wrap ? DRAWER_DETENTS[DRAWER_DETENTS.length - 1] : DRAWER_DETENTS[0]
}

/** Reads the persisted `ifc-ui-drawer:v1` value; anything unexpected gives the default. */
export function parseDrawerRatio(raw: string | null): number {
  if (!raw) return DRAWER_DEFAULT_RATIO
  try {
    const parsed = JSON.parse(raw) as { ratio?: unknown } | null
    const r = parsed && typeof parsed === 'object' ? parsed.ratio : undefined
    if (typeof r !== 'number' || !Number.isFinite(r) || r <= 0 || r > 1) return DRAWER_DEFAULT_RATIO
    return clampRatio(r)
  } catch {
    return DRAWER_DEFAULT_RATIO
  }
}
