// ─── tunnel-portal ────────────────────────────────────────────────────────────
// WHERE A WAY GOES UNDER, AND WHAT YOU SEE WHEN IT DOES.
//
// ── What was already right, and what was missing ──────────────────────────────
//
// The linear layer already handles a tunnel by NOT DRAWING IT: a buried
// carriageway is skipped, so the alignment simply ends where it crosses the
// ground, which is exactly where a portal is. That is the right call and this
// module does not change it — drawing the bore would either z-fight through
// the hillside above it or be occluded anyway.
//
// What is missing is the crossing itself. Absence puts the road's end in the
// right PLACE and says nothing about what is there, so an approach ramp runs
// down and stops dead in an unbroken surface: a slot cut in the asphalt with
// no face, no opening and no walls. The eye reads a hole rather than a tunnel.
//
// Measured over Lujiazui — 137 layered ways around the Oriental Pearl — 72 sit
// at negative layers against 56 elevated, 53 of them tagged `tunnel=yes`. The
// district has more infrastructure below ground than above it, and every one of
// those ways currently ends in a slot.
//
// ── What is honest to draw ────────────────────────────────────────────────────
//
// The survey says a way goes under, and where. It does not say what the portal
// looks like: no `tunnel:shape`, no headwall, no lining, no width beyond the
// carriageway's. So a portal here is a plain rectangular headwall with an
// opening the size of the way that passes through it — the minimum that reads
// as "it continues under there". Anything more (an arch, a wingwall, a
// cut-and-cover box) would be invented architecture, and the one thing worse
// than a slot in the asphalt is a confidently wrong tunnel mouth.
//
// PURE: a sampled profile in, portal placements out. No THREE, no scene.

import type { FunctionalType } from './vertical'

/**
 * Headroom above the carriageway at the opening, metres, by what uses it.
 *
 * The same engineering minima the vertical solver clears its bridges to, for
 * the same reason: a portal that a lorry could not enter is as wrong as a
 * bridge it could not pass under.
 */
export const PORTAL_HEADROOM_M: Record<FunctionalType, number> = {
  road: 5.0,
  railway: 6.0,
  pedestrian: 3.0,
  water: 5.5,
}

/**
 * How far the headwall stands proud of the opening on each side, as a share of
 * the opening's width.
 *
 * Enough to read as a face rather than as a picture frame, small enough not to
 * become a structure of its own invention.
 */
export const HEADWALL_MARGIN = 0.22

/** Thickness of the headwall face, metres — it catches light on one edge. */
export const HEADWALL_T_M = 0.6

export interface ProfileStation {
  x: number
  y: number
  /** Way elevation, metres. */
  elevationM: number
  /** Ground above it, metres. */
  groundM: number
}

export interface Portal {
  /** Plan position of the opening, in the caller's units. */
  x: number
  y: number
  /** Plan direction the way runs, normalised, pointing INTO the ground. */
  dx: number
  dy: number
  /** Ground elevation at the portal, metres — the top of the cutting. */
  groundM: number
  /** Way elevation at the portal, metres — the invert. */
  elevationM: number
}

/**
 * Find where an alignment passes under the ground.
 *
 * Returns one portal per crossing, so a way that dips under a plaza and comes
 * back up produces two — which is what a pedestrian underpass IS, and drawing
 * only the first would leave its far end as the slot this module exists to
 * remove.
 *
 * The crossing is INTERPOLATED between stations rather than snapped to one: a
 * way's vertices are wherever the surveyor clicked, and rounding the portal to
 * the nearest of them moves a tunnel mouth by up to the vertex spacing, which
 * on an OSM way is routinely tens of metres.
 */
export function findPortals(
  profile: ReadonlyArray<ProfileStation>, marginM: number,
): Portal[] {
  const portals: Portal[] = []
  if (profile.length < 2) return []

  const buried = (s: ProfileStation): boolean => s.elevationM < s.groundM - marginM

  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i]
    const b = profile[i + 1]
    const inA = buried(a)
    const inB = buried(b)
    if (inA === inB) continue

    // Solve for the crossing: the point where (ground − margin) − elevation
    // changes sign. Both terms move, so this is not simply the ground contour.
    const fa = (a.groundM - marginM) - a.elevationM
    const fb = (b.groundM - marginM) - b.elevationM
    const denom = fa - fb
    const t = Math.abs(denom) < 1e-9 ? 0.5 : Math.max(0, Math.min(1, fa / denom))

    const x = a.x + (b.x - a.x) * t
    const y = a.y + (b.y - a.y) * t
    // Direction always points from daylight into the ground, so a caller can
    // orient a headwall without re-deriving which side is which.
    const sign = inB ? 1 : -1
    let dx = (b.x - a.x) * sign
    let dy = (b.y - a.y) * sign
    const len = Math.hypot(dx, dy)
    if (len < 1e-12) continue
    dx /= len
    dy /= len

    portals.push({
      x, y, dx, dy,
      groundM: a.groundM + (b.groundM - a.groundM) * t,
      elevationM: a.elevationM + (b.elevationM - a.elevationM) * t,
    })
  }

  return portals
}

/**
 * The opening's dimensions at a portal.
 *
 * Height is the greater of the headroom the traffic needs and the cover the
 * ground actually provides: on a shallow crossing the ground is barely above
 * the invert, and forcing a 5 m opening there would punch a hole through the
 * surface above it.
 */
export function portalOpening(
  portal: Portal, functional: FunctionalType, widthM: number,
): { widthM: number; heightM: number } {
  const cover = portal.groundM - portal.elevationM
  return {
    widthM,
    heightM: Math.max(0.5, Math.min(PORTAL_HEADROOM_M[functional], cover)),
  }
}
