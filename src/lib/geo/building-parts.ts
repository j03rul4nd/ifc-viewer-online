// ─── building-parts ───────────────────────────────────────────────────────────
// SIMPLE 3D BUILDINGS: the layer with the heights in it.
//
// ── What we were missing ──────────────────────────────────────────────────────
//
// The buildings query asks for `building` ways and relations. Measured over
// Lujiazui — the Oriental Pearl and the Shanghai World Financial Center — that
// returns 156 outlines of which 22 carry a `height`: fourteen per cent. The
// other 108 fall through to a fallback, and 83 of those are `building=yes`,
// which means eighty-three blocks of one of the densest business districts on
// earth were drawn eight metres tall around towers of 632, 492 and 420.
//
// In the same box there are 132 `building:part` ways, and 98 of them carry a
// height. Seventy-four per cent. The data was there the whole time and we never
// asked for it.
//
// ── Why parts also fix the shape, not just the height ─────────────────────────
//
// `building:part` is the OSM Simple 3D Buildings schema: a tower is modelled as
// a podium, a shaft and a crown, each with its own `height` and `min_height`,
// rather than as one prism. Extruding the outline alone is what makes a
// skyline of flat boxes — and "context buildings are flat extrusions" was the
// first complaint on the list this work started from.
//
// ── The rule that makes them safe to draw ─────────────────────────────────────
//
// A part is not an extra building. It is a REPLACEMENT for the volume of the
// outline it sits in, so drawing both leaves the outline's prism standing
// around its own parts like a shrink-wrap — visible wherever the outline is
// taller than the podium, which is most of the time.
//
// So an outline that has parts inside it stands down. That is the spec's rule
// and it is the only thing here that is a decision rather than a lookup.
//
// PURE: rings and tags in, a partition out. No THREE, no fetch, no scene.

import { pointInPolygon } from './context-suppression'

export interface PartCandidate {
  id: string
  /** Plan ring, in whatever planar units the caller uses. */
  ring: ReadonlyArray<{ x: number; y: number }>
}

export interface OutlineCandidate {
  id: string
  ring: ReadonlyArray<{ x: number; y: number }>
}

/** Centroid of a ring — the point used to ask which outline a part sits in. */
export function ringCentroid(
  ring: ReadonlyArray<{ x: number; y: number }>,
): { x: number; y: number } | null {
  if (ring.length === 0) return null
  let x = 0
  let y = 0
  for (const p of ring) { x += p.x; y += p.y }
  return { x: x / ring.length, y: y / ring.length }
}

export interface PartitionResult {
  /** Outline ids that must NOT be extruded, because parts describe them. */
  supersededOutlines: Set<string>
  /** How many parts were matched to an outline. */
  matched: number
  /**
   * Parts whose centroid fell inside no outline.
   *
   * Drawn anyway — a part without its parent is still a surveyed volume with a
   * surveyed height, and dropping it would lose real data to a bookkeeping
   * mismatch. Counted so the audit can say how often the two layers disagree.
   */
  orphans: string[]
}

/**
 * Decide which building outlines their own parts replace.
 *
 * Matched on the PART'S CENTROID inside the outline rather than on full
 * containment: parts routinely overhang the footprint they belong to — a
 * cantilevered floor, a canopy, a crown wider than its shaft — and a strict
 * containment test would leave those buildings drawn twice, which is the exact
 * artefact this function exists to prevent.
 */
export function partitionBuildingParts(
  outlines: ReadonlyArray<OutlineCandidate>,
  parts: ReadonlyArray<PartCandidate>,
): PartitionResult {
  const supersededOutlines = new Set<string>()
  const orphans: string[] = []
  let matched = 0

  for (const part of parts) {
    const centre = ringCentroid(part.ring)
    if (!centre) continue
    let found = false
    for (const outline of outlines) {
      if (outline.ring.length < 3) continue
      if (pointInPolygon(centre, outline.ring)) {
        supersededOutlines.add(outline.id)
        found = true
        // No break: a part can sit inside nested outlines (a mall inside a
        // block), and both of them are described by it.
      }
    }
    if (found) matched++
    else orphans.push(part.id)
  }

  return { supersededOutlines, matched, orphans }
}

// ── Matching by overlap, and the outline that parts only partly describe ─────

/** A part's share of its own area that must lie in an outline to belong to it. */
export const PART_MATCH_SHARE = 0.5
/**
 * Share of an outline its parts must cover before the outline stands down.
 * Not 1: mappers draw parts a little inside the outline all the time, and a
 * band of outline left standing round them would z-fight their walls. Below
 * this, the parts plainly describe only part of the building.
 */
export const OUTLINE_COVERED_SHARE = 0.6
/** Samples per axis when measuring a part's or an outline's area. */
const GRID = 16

export interface SizedPart extends PartCandidate {
  /** Top of the part, metres — what caps an outline it only partly covers. */
  heightM?: number
}

export interface OverlapPartition extends PartitionResult {
  /**
   * Outlines their parts cover only PARTLY, with the height to cap them at.
   *
   * Dropping such an outline lost the building wherever no part was mapped —
   * a wing, a courtyard range, the podium a mapper never got to. Keeping it at
   * its own height wrapped the parts in a shrink-wrap. Kept at the MEDIAN
   * height of its parts, it fills the gap without towering over them.
   */
  cappedOutlines: Map<string, number>
}

type P = { x: number; y: number }

function bbox(ring: ReadonlyArray<P>): [number, number, number, number] {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity
  for (const p of ring) {
    if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y
  }
  return [x0, y0, x1, y1]
}

/** Grid points inside `ring` — an area sample that is exact enough and never fails on a concave or messy ring. */
function samplesIn(ring: ReadonlyArray<P>): P[] {
  if (ring.length < 3) return []
  const [x0, y0, x1, y1] = bbox(ring)
  const out: P[] = []
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const p = { x: x0 + ((i + 0.5) / GRID) * (x1 - x0), y: y0 + ((j + 0.5) / GRID) * (y1 - y0) }
      if (pointInPolygon(p, ring)) out.push(p)
    }
  }
  // A sliver can miss every grid point; its centroid still says where it is.
  if (out.length === 0) {
    const c = ringCentroid(ring)
    if (c) out.push(c)
  }
  return out
}

/**
 * `partitionBuildingParts`, decided by AREA rather than by the centroid.
 *
 * The centroid of an L-shaped part can lie outside it — and outside its
 * outline — which orphaned it and left the outline standing over it. Here a
 * part belongs to an outline when at least half of its own area lies inside;
 * and an outline stands down only when its parts cover nine tenths of it.
 * Covered less, it is kept and capped (see `cappedOutlines`).
 */
export function partitionBuildingPartsByOverlap(
  outlines: ReadonlyArray<OutlineCandidate>,
  parts: ReadonlyArray<SizedPart>,
): OverlapPartition {
  const supersededOutlines = new Set<string>()
  const cappedOutlines = new Map<string, number>()
  const orphans: string[] = []
  let matched = 0

  const outlineBoxes = outlines.map((o) => bbox(o.ring))
  const partsOf = new Map<number, SizedPart[]>()
  for (const part of parts) {
    const samples = samplesIn(part.ring)
    if (samples.length === 0) continue
    const [px0, py0, px1, py1] = bbox(part.ring)
    let found = false
    outlines.forEach((outline, oi) => {
      if (outline.ring.length < 3) return
      const [x0, y0, x1, y1] = outlineBoxes[oi]
      if (px1 < x0 || px0 > x1 || py1 < y0 || py0 > y1) return
      let inside = 0
      for (const s of samples) if (pointInPolygon(s, outline.ring)) inside++
      if (inside / samples.length >= PART_MATCH_SHARE) {
        found = true
        const list = partsOf.get(oi)
        if (list) list.push(part)
        else partsOf.set(oi, [part])
      }
    })
    if (found) matched++
    else orphans.push(part.id)
  }

  for (const [oi, list] of partsOf) {
    const outline = outlines[oi]
    const samples = samplesIn(outline.ring)
    let covered = 0
    for (const s of samples) if (list.some((p) => pointInPolygon(s, p.ring))) covered++
    if (samples.length === 0 || covered / samples.length >= OUTLINE_COVERED_SHARE) {
      supersededOutlines.add(outline.id)
      continue
    }
    const heights = list.map((p) => p.heightM).filter((h): h is number => h !== undefined && h > 0)
    // Parts with no height say nothing about where to cap; then the outline
    // is described by them and stands down, the old rule.
    if (heights.length === 0) supersededOutlines.add(outline.id)
    else {
      // The MEDIAN part, not the lowest: the lowest is routinely a back-plot
      // ground floor (2.7 m in the Eixample fixture) and capping there drew
      // the unmapped street fronts as a plinth. A part lower than the median
      // is hidden inside the kept volume — a smaller loss than a missing block.
      const sorted = [...heights].sort((x, y) => x - y)
      const mid = sorted.length >> 1
      cappedOutlines.set(outline.id, sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2)
    }
  }

  return { supersededOutlines, cappedOutlines, matched, orphans }
}
