// ─── lane-markings ────────────────────────────────────────────────────────────
// WHAT A CARRIAGEWAY IS DOING, drawn from what the data actually states.
//
// A road rendered as a grey ribbon is a texture, not a road. Reading one in a
// client meeting, nobody can say how many lanes it has, which way it runs, or
// which side of it they would be driving on. All three are mapped in OSM for
// the roads that matter, and the district this was measured against says so
// plainly — of 455 vehicular ways in Lujiazui:
//
//   oneway   79.8%   (355 of them, and NONE of it was being drawn)
//   lanes    63.7%   overall — trunk 100%, primary 93%, secondary 75%
//   width     0.0%   never mapped; width is derived from lanes, not surveyed
//
// So direction is the single best-attested fact about a Shanghai carriageway
// and was the one thing the scene said nothing about.
//
// ── What this module refuses to draw ──────────────────────────────────────────
//
// `turn:lanes` is mapped on ZERO ways in the district, and `lanes:forward` /
// `lanes:backward` on one apiece. That rules out two things that a road render
// is otherwise tempted to invent:
//
//   • TURN ARROWS. A left-turn arrow in the left lane is the most recognisable
//     road marking there is, and every one we drew would be a guess about a
//     junction we know nothing about. Not drawn — the arrows here state
//     DIRECTION OF TRAVEL only, which is exactly what `oneway` says.
//   • AN ASYMMETRIC SPLIT. On a two-way road we know the total lane count and
//     nothing about how it divides. Splitting 3 lanes as 2+1 would be fiction;
//     an odd count on a two-way road therefore gets its centre line and no
//     interior dividers at all, because any divider we drew would assert a
//     split the source does not make. See `laneDividers`.
//
// PURE: numbers and points in, offsets and quads out. No THREE scene, no tags,
// no I/O. Everything here is decided from `lanes` and `oneway` alone.

import * as THREE from 'three'

/** Longitudinal spacing of direction arrows along a lane, metres. */
export const ARROW_SPACING_M = 26
/** Overall length of one arrow, metres — head plus stem. */
export const ARROW_LENGTH_M = 3.4
/** Width across the arrowhead's barbs, metres. */
export const ARROW_WIDTH_M = 1.15
/** Width of the arrow's stem, metres. */
export const ARROW_STEM_M = 0.32
/** Fraction of the total length taken by the head. */
export const ARROW_HEAD_FRACTION = 0.42

/**
 * Keep an arrow off the very ends of a ribbon, as a fraction of its length.
 *
 * A ribbon is already trimmed back from its junctions, so its ends sit at the
 * stop line. An arrow painted right at the end reads as though it were inside
 * the junction — and one painted across the last metre of a short ribbon looks
 * like a mistake rather than a marking.
 */
export const ARROW_END_MARGIN = 0.18

/**
 * Where the interior lane dividers of a carriageway go, as signed offsets from
 * the centreline in units of the half-width.
 *
 * Returns offsets in [-1, 1], excluding the two kerbs and excluding the centre
 * line of a two-way road — that line is not a lane divider, it separates
 * opposing traffic and is drawn solid by the caller.
 *
 * THE TWO-WAY ODD CASE IS DELIBERATELY EMPTY. Three lanes on a two-way road is
 * either 2+1 or 1+2 and the data does not say which; drawing dividers at the
 * thirds asserts a symmetric split that exists nowhere on the ground. The
 * centre line still goes in, so the road reads as two-way — it simply does not
 * claim a lane count it cannot support.
 */
export function laneDividers(lanes: number, oneway: boolean): number[] {
  if (!Number.isFinite(lanes) || lanes < 2) return []
  const n = Math.round(lanes)
  if (n < 2) return []

  if (oneway) {
    // Every boundary between adjacent lanes, kerbs excluded.
    const out: number[] = []
    for (let i = 1; i < n; i++) out.push(-1 + (2 * i) / n)
    return out
  }

  // Two-way: only a symmetric split is defensible, and only an even count is
  // symmetric. The middle boundary is the centre line and is not returned.
  if (n % 2 !== 0) return []
  const out: number[] = []
  for (let i = 1; i < n; i++) {
    if (i === n / 2) continue          // the centre line, drawn solid elsewhere
    out.push(-1 + (2 * i) / n)
  }
  return out
}

/**
 * Where direction arrows go across the carriageway, as signed offsets in
 * [-1, 1] of the half-width.
 *
 * One arrow per lane when the lane count is known, sitting in the middle of
 * each lane. When it is not known, ONE arrow on the centreline: we know the
 * direction — that is what `oneway` states — and inventing a lane count to
 * place more of them would assert something the source never said.
 *
 * Two-way roads get none. An arrow on a two-way carriageway would have to pick
 * a side to be true of, and which lanes run which way is not mapped here.
 */
export function arrowOffsets(lanes: number | undefined, oneway: boolean): number[] {
  if (!oneway) return []
  const n = lanes !== undefined && Number.isFinite(lanes) ? Math.round(lanes) : 0
  if (n < 1) return [0]
  if (n === 1) return [0]
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(-1 + (2 * i + 1) / n)
  return out
}

/** Cumulative length along a polyline, and its total. */
function arcLengths(line: ReadonlyArray<THREE.Vector2>): { at: number[]; total: number } {
  const at = [0]
  let total = 0
  for (let i = 0; i < line.length - 1; i++) {
    total += line[i].distanceTo(line[i + 1])
    at.push(total)
  }
  return { at, total }
}

export interface ArrowPlacement {
  /** Centre of the arrow, on the lane's own centreline. */
  at: THREE.Vector2
  /** Unit vector along the direction of travel. */
  heading: THREE.Vector2
}

/**
 * Evenly spaced arrow placements along a lane centreline.
 *
 * Spacing is measured in the caller's units, so a caller working in normalised
 * mercator passes `spacing * mToN`. Placement is BY INDEX along the arc length
 * rather than by walking-and-advancing, so a degenerate segment cannot spin the
 * loop — the same reason `dashCentreline` counts its stripes.
 *
 * `reversed` flips the heading for `oneway=-1`, where the way is drawn against
 * the direction of travel. Nothing in the measured district uses it, but the
 * value is legal OSM and silently drawing those arrows backwards would be worse
 * than not drawing them.
 */
export function arrowPlacements(
  line: ReadonlyArray<THREE.Vector2>,
  spacing: number,
  arrowLength: number,
  reversed = false,
): ArrowPlacement[] {
  const out: ArrowPlacement[] = []
  if (line.length < 2 || !(spacing > 0)) return out
  const { at, total } = arcLengths(line)
  if (!(total > 0)) return out

  // Keep clear of both ends, and give up rather than cram when there is no room
  // for a whole arrow inside the margins.
  const margin = Math.max(total * ARROW_END_MARGIN, arrowLength * 0.5)
  const usable = total - 2 * margin
  if (usable < arrowLength) return out

  const count = Math.max(1, Math.floor(usable / spacing) + 1)
  // A mis-scaled spacing must not allocate a city's worth of arrows.
  if (count > 512) return out
  // Centre the run inside the usable stretch so arrows sit evenly rather than
  // bunching at the start with a long bare tail.
  const span = (count - 1) * spacing
  const start = margin + (usable - span) / 2

  for (let k = 0; k < count; k++) {
    const s = start + k * spacing
    let i = 0
    while (i < at.length - 2 && at[i + 1] < s) i++
    const segLen = at[i + 1] - at[i]
    const t = segLen > 0 ? (s - at[i]) / segLen : 0
    const a = line[i]
    const b = line[i + 1]
    const dir = new THREE.Vector2(b.x - a.x, b.y - a.y)
    if (dir.lengthSq() === 0) continue
    dir.normalize()
    if (reversed) dir.negate()
    out.push({
      at: new THREE.Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t),
      heading: dir,
    })
  }
  return out
}

/**
 * One arrow as quads, in the caller's units.
 *
 * Returned as quads rather than triangles so the caller can push them through
 * the same routine as every other piece of paint — which is what keeps an arrow
 * subject to the same buried-road test, the same lift and the same surface
 * grain as the dashes beside it. The head is a quad with its two leading
 * corners coincident, i.e. a triangle expressed as a quad; the degenerate edge
 * costs one collapsed triangle and saves the caller a second code path.
 */
export function arrowQuads(
  placement: ArrowPlacement,
  length: number,
  width: number,
  stemWidth: number,
  headFraction = ARROW_HEAD_FRACTION,
): THREE.Vector2[][] {
  const { at, heading } = placement
  const side = new THREE.Vector2(-heading.y, heading.x)
  const headLen = length * headFraction
  const stemLen = length - headLen
  const halfBack = length / 2

  // Local frame: `f` metres forward of the arrow's centre, `s` metres to its
  // left, expressed in world units.
  const P = (f: number, s: number): THREE.Vector2 => new THREE.Vector2(
    at.x + heading.x * f + side.x * s,
    at.y + heading.y * f + side.y * s,
  )

  const tail = -halfBack
  const neck = -halfBack + stemLen
  const tip = halfBack

  const hs = stemWidth / 2
  const hw = width / 2

  return [
    // Stem.
    [P(tail, -hs), P(neck, -hs), P(neck, hs), P(tail, hs)],
    // Head, as a triangle written with a doubled tip vertex.
    [P(neck, -hw), P(tip, 0), P(tip, 0), P(neck, hw)],
  ]
}
