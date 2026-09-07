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
 * A line running at a constant FRACTION of the carriageway's half-width.
 *
 * WHY A FRACTION AND NOT A DISTANCE. A ribbon carries a half-width per vertex,
 * because a road that changes width does so as a flare rather than a step —
 * that is what `taperHalfWidths` is for. Offsetting the lane lines by one
 * nominal distance instead throws that away: through a flare the kerb walks
 * outwards while the lane lines stay parallel, so the outer lane silently grows
 * and the paint no longer divides anything. Held as a fraction, every line
 * opens with the carriageway and the lanes stay equal all the way through.
 *
 * The offset is taken along the angle bisector at each vertex, the same
 * construction the borders themselves use, so a lane line turns a corner
 * concentrically with the kerb beside it rather than cutting it.
 */
export function offsetByFraction(
  line: ReadonlyArray<THREE.Vector2>,
  halfWidths: ReadonlyArray<number>,
  frac: number,
): THREE.Vector2[] {
  const out: THREE.Vector2[] = []
  if (line.length < 2) return line.map((p) => p.clone())

  for (let i = 0; i < line.length; i++) {
    const prev = line[Math.max(0, i - 1)]
    const next = line[Math.min(line.length - 1, i + 1)]
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const len = Math.hypot(dx, dy)
    // A repeated vertex has no direction of its own; carrying the last good
    // normal forward beats emitting a point spun to an arbitrary angle.
    const nx = len > 1e-12 ? -dy / len : 0
    const ny = len > 1e-12 ? dx / len : 0
    // Short arrays are a caller error, but falling back to the last stated
    // width keeps the line on the carriageway instead of collapsing it to zero.
    const hw = halfWidths[Math.min(i, halfWidths.length - 1)] ?? 0
    const d = frac * hw
    out.push(new THREE.Vector2(line[i].x + nx * d, line[i].y + ny * d))
  }
  return out
}

// ── Turn indications ──────────────────────────────────────────────────────────

/**
 * How far each `turn:lanes` value bends off the direction of travel, radians.
 *
 * Positive is LEFT, matching `offsetByFraction`, whose normal `(-dy, dx)` points
 * to the left of the line.
 *
 * `merge_to_*` and `none` are deliberately absent: a merge is a lane ending, not
 * a turn, and painting an arrow for it would tell a driver to change lane at a
 * point the survey says nothing about.
 */
export const TURN_ANGLES: Readonly<Record<string, number>> = {
  through: 0,
  slight_left: Math.PI / 4,
  left: Math.PI / 2,
  sharp_left: (3 * Math.PI) / 4,
  slight_right: -Math.PI / 4,
  right: -Math.PI / 2,
  sharp_right: -(3 * Math.PI) / 4,
  reverse: Math.PI,
}

/**
 * Turn indications per lane, or null when the tag cannot be trusted.
 *
 * `turn:lanes` is `|`-separated per lane and `;`-separated within a lane —
 * `left|through|through;right` is a three-lane approach whose right lane allows
 * both. Lanes are ordered LEFT TO RIGHT in the direction of travel.
 *
 * RETURNS NULL ON A COUNT MISMATCH, whole tag discarded. Of the 52 tagged ways
 * in the Barcelona patch, 3 disagree with their own `lanes` — and a mismatch
 * means we cannot know which indication belongs to which lane. Shifting them by
 * one paints "left turn only" over a lane that goes straight on, which is worse
 * than painting nothing: a viewer acts on a turn arrow.
 *
 * An unreadable indication yields an empty list for THAT lane rather than
 * killing the tag — `eft` is a real typo in the Barcelona data, and one
 * fat-fingered lane should not silence the three beside it that are fine.
 */
export function parseTurnLanes(raw: string | undefined, lanes: number): string[][] | null {
  if (!raw || !Number.isFinite(lanes) || lanes < 1) return null
  const cells = raw.split('|')
  if (cells.length !== Math.round(lanes)) return null
  return cells.map((cell) =>
    cell.split(';')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t in TURN_ANGLES))
}

/**
 * The turn indications for the lane sitting at `offsetIndex` in `arrowOffsets`.
 *
 * THE TWO ORDERINGS RUN OPPOSITE WAYS, which is the whole reason this is a
 * function. `turn:lanes` counts lanes from the LEFT in the direction of travel;
 * `arrowOffsets` returns them from the most negative offset, and a negative
 * offset is to the RIGHT. So tag index 0 is the LAST offset, not the first.
 *
 * `reversed` (`oneway=-1`) flips it back: the geometry's offsets are measured
 * against the way as drawn, while the tag is measured against the direction of
 * travel, and those are opposite when the way runs against itself.
 */
export function turnsForOffset(
  perLane: ReadonlyArray<ReadonlyArray<string>>,
  offsetIndex: number,
  reversed = false,
): string[] {
  const n = perLane.length
  if (n === 0 || offsetIndex < 0 || offsetIndex >= n) return []
  const tagIndex = reversed ? offsetIndex : n - 1 - offsetIndex
  return [...perLane[tagIndex]]
}

/**
 * One arrow with a head per turn indication.
 *
 * A lane marked `through;right` carries a stem with TWO heads — one straight on,
 * one turning off — which is what is painted on the road. Each head is the
 * ordinary arrowhead rotated about the top of the stem, so a turn arrow is the
 * same object as a direction arrow with a different angle rather than a
 * separate shape to keep in sync.
 *
 * An empty `angles` falls back to a single straight head: the direction is
 * still known even when the turn is not.
 */
export function turnArrowQuads(
  placement: ArrowPlacement,
  length: number,
  width: number,
  stemWidth: number,
  angles: ReadonlyArray<number>,
): THREE.Vector2[][] {
  const list = angles.length > 0 ? angles : [0]
  const { at, heading } = placement
  const side = new THREE.Vector2(-heading.y, heading.x)
  const headLen = length * ARROW_HEAD_FRACTION
  const stemLen = length - headLen
  const halfBack = length / 2
  const hs = stemWidth / 2
  const hw = width / 2

  const P = (f: number, s: number): THREE.Vector2 => new THREE.Vector2(
    at.x + heading.x * f + side.x * s,
    at.y + heading.y * f + side.y * s,
  )

  const tail = -halfBack
  const neck = -halfBack + stemLen
  const out: THREE.Vector2[][] = [
    [P(tail, -hs), P(neck, -hs), P(neck, hs), P(tail, hs)],
  ]

  // The neck is where every head pivots, so heads fan from one point the way
  // painted ones do.
  const pivot = P(neck, 0)
  for (const a of list) {
    const dir = new THREE.Vector2(
      heading.x * Math.cos(a) - heading.y * Math.sin(a),
      heading.x * Math.sin(a) + heading.y * Math.cos(a),
    )
    const nrm = new THREE.Vector2(-dir.y, dir.x)
    const tip = new THREE.Vector2(pivot.x + dir.x * headLen, pivot.y + dir.y * headLen)
    const b1 = new THREE.Vector2(pivot.x + nrm.x * hw, pivot.y + nrm.y * hw)
    const b2 = new THREE.Vector2(pivot.x - nrm.x * hw, pivot.y - nrm.y * hw)
    out.push([b1, tip, tip, b2])
  }
  return out
}
