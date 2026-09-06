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
