// ─── stop-lines ───────────────────────────────────────────────────────────────
// WHERE TRAFFIC IS HELD, so a junction reads as a junction.
//
// A crossroads in the scene is currently a blank fan of asphalt: the arms meet,
// the paint stops short of the middle, and nothing says what happens there. It
// could be a signalised intersection, a give-way, or a supermarket forecourt.
// The single marking that settles it is the STOP BAR — the transverse line
// across the approach lanes, which no other kind of paved area has.
//
// ── Where the geometry comes from ─────────────────────────────────────────────
//
// Nowhere new. The node solver already pulls every ribbon BACK from the
// junction it runs into, and records that it did so in `trimmedStart` /
// `trimmedEnd`. That trimmed end is, to within a setback, exactly where a stop
// bar goes — it is the edge of the conflict area. So this module invents no
// position: it reads the end the solver produced and lays a bar across it.
//
// ── Where the fact comes from ─────────────────────────────────────────────────
//
// `highway=traffic_signals` nodes, which the feature query already fetches —
// 88 of them in the measured Lujiazui patch. A bar is drawn only where a signal
// is actually mapped near the end in question. An unsignalised junction gets
// nothing, because a stop bar at one is a claim about priority that OSM did not
// make, and getting priority wrong at a crossroads is the single most
// misleading thing a road render can do.
//
// ── Why one-way approaches only ───────────────────────────────────────────────
//
// A stop bar spans the lanes that STOP at the line, not the whole carriageway.
// On a one-way approach those are all of them, so the bar runs kerb to kerb and
// nothing has to be assumed. On a two-way road it covers only the approaching
// half — and WHICH half is the driving side of the country, which is not a
// property of the way and is not in the tags. Drawing it across the full width
// would put a stop line in front of traffic leaving the junction; guessing the
// half would be right in Shanghai and mirrored in Tokyo.
//
// So two-way approaches get no bar. In the measured district that still covers
// 355 of 455 vehicular ways, because Lujiazui is a one-way-couplet grid.
//
// The honest way to extend this later is to DERIVE the driving side rather than
// assume it: a roundabout's ring is one-way, and which way it circulates is the
// driving side. Eight of them are mapped in the patch. Not done here — a fact
// worth deriving is worth deriving with its own tests.
//
// PURE: points in, quads out. No THREE scene, no tags, no I/O.

import * as THREE from 'three'

/** Width of the painted bar, along the road, metres. */
export const STOP_LINE_M = 0.5

/**
 * How far the bar sits back from the trimmed end, metres.
 *
 * A stop bar is not painted on the edge of the conflict area; it is held back
 * so a stopped vehicle does not overhang the crossing traffic. Small, but the
 * difference between a bar that reads as a stop line and one that reads as the
 * junction's own border.
 */
export const STOP_SETBACK_M = 1.2

/**
 * How near a mapped signal must be to an approach end to signalise it, metres.
 *
 * A `traffic_signals` node sits on the road at the junction, while the ribbon's
 * end has been pulled back by roughly the half-width of the road it crosses —
 * ten to twenty metres on an avenue. This has to clear that pullback without
 * reaching the next junction down the street, which in a dense grid is a
 * hundred metres away.
 */
export const SIGNAL_SEARCH_M = 35

/** The bit of a ribbon a stop bar needs. Structural, to avoid a cycle. */
export interface ApproachRibbon {
  centre: ReadonlyArray<THREE.Vector2>
  left: ReadonlyArray<THREE.Vector2>
  right: ReadonlyArray<THREE.Vector2>
  trimmedStart: boolean
  trimmedEnd: boolean
  oneway?: boolean
  onewayReverse?: boolean
}

/**
 * Which end of a ribbon traffic arrives at, or null when nothing stops here.
 *
 * The downstream end only. The upstream end is where traffic ENTERED from the
 * junction behind it, and a stop bar there would hold vehicles that have
 * already been released — the marking would be pointing at the wrong junction.
 */
export function approachEnd(ribbon: ApproachRibbon): 'start' | 'end' | null {
  if (!ribbon.oneway) return null
  if (ribbon.centre.length < 2) return null
  const downstream = ribbon.onewayReverse ? 'start' : 'end'
  const trimmed = downstream === 'end' ? ribbon.trimmedEnd : ribbon.trimmedStart
  return trimmed ? downstream : null
}

/** Is a mapped signal near enough to this point to signalise it? */
export function isSignalised(
  at: THREE.Vector2, signals: ReadonlyArray<THREE.Vector2>, radius: number,
): boolean {
  const r2 = radius * radius
  for (const s of signals) {
    const dx = s.x - at.x
    const dy = s.y - at.y
    if (dx * dx + dy * dy <= r2) return true
  }
  return false
}

/**
 * The bar itself: a quad spanning the carriageway at one end of a ribbon.
 *
 * Built from the ribbon's own mitred BORDERS rather than from the centreline
 * and a half-width, so the bar meets both kerbs exactly even where the end is
 * skewed — an approach into an oblique junction is trimmed at an angle, and a
 * bar squared off the centreline would leave a wedge of asphalt unpainted on
 * one side and overhang the kerb on the other.
 *
 * Returns null when the end is degenerate; a zero-width bar is a stripe of
 * nothing that still costs two triangles.
 */
export function stopBarQuad(
  ribbon: ApproachRibbon, end: 'start' | 'end',
  setback: number, thickness: number,
): THREE.Vector2[] | null {
  const n = ribbon.centre.length
  if (n < 2 || ribbon.left.length < n || ribbon.right.length < n) return null

  const i = end === 'end' ? n - 1 : 0
  const j = end === 'end' ? n - 2 : 1

  const l = ribbon.left[i]
  const r = ribbon.right[i]
  if (l.distanceToSquared(r) < 1e-18) return null

  // Inward: back down the ribbon, away from the junction.
  const inward = new THREE.Vector2(
    ribbon.centre[j].x - ribbon.centre[i].x,
    ribbon.centre[j].y - ribbon.centre[i].y,
  )
  if (inward.lengthSq() < 1e-18) return null
  inward.normalize()

  const near = setback
  const far = setback + thickness
  const P = (p: THREE.Vector2, d: number): THREE.Vector2 =>
    new THREE.Vector2(p.x + inward.x * d, p.y + inward.y * d)

  return [P(l, near), P(r, near), P(r, far), P(l, far)]
}
