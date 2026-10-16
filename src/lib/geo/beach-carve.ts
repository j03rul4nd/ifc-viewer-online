// ─── beach-carve ──────────────────────────────────────────────────────────────
// Put the sand back BELOW its promenade wall.
//
// On the Costa Daurada and in Barcelona the beach lies a metre or two under
// the promenade, behind a retaining wall. The best open DEM there (ICGC, 5 m)
// spreads that step over 15–20 m of slope, so the sand climbs to the pavement
// as a ramp and a wall drawn at the edge is half buried in it. This corrects
// the GROUND, not a layer on it: inside the beach, in a band along every edge
// where a wall is found (beach-edge), the ground is lowered to the level of
// the sand further in, easing back to the measurement at the band's far side.
// Nothing is ever raised, nothing outside the beach moves, and dunes or
// beaches that rise into a park keep their relief (no wall is found there).
//
// Pure. Everything in local metres about an origin; the caller converts.

import { beachEdgeWalls } from './beach-edge'

type P = { x: number; y: number }

export interface CarveWall {
  a: P
  b: P
  /** The sand's level in front of the wall, m (measured well inside the beach). */
  baseM: number
  /** The promenade's level behind it, m. */
  topM: number
  /** Unit normal pointing INTO the beach. */
  inward: P
}

/** Width of the band the ground is corrected in, m. */
export const CARVE_BAND_M = 22
/** Where the sand's own level is read, this far in from the edge, m. */
const BASE_PROBE_M = 22

function inRing(p: P, ring: ReadonlyArray<P>): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * The walls of every beach, with the level of the sand in front of each: the
 * lowest MEASURED ground on the way 6–22 m in, never above the foot the edge
 * probe found. A beach narrower than the probe reads what it has.
 */
export function planBeachWalls(
  beaches: ReadonlyArray<ReadonlyArray<P>>,
  groundM: (x: number, y: number) => number,
  seaDistanceM: ((x: number, y: number) => number) | null,
  pavedNear?: (x: number, y: number) => boolean,
): CarveWall[] {
  const out: CarveWall[] = []
  for (const ring of beaches) {
    for (const w of beachEdgeWalls(ring, groundM, seaDistanceM, 3, pavedNear)) {
      const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y
      const len = Math.hypot(dx, dy) || 1
      const mx = (w.a.x + w.b.x) / 2, my = (w.a.y + w.b.y) / 2
      let inward = { x: -dy / len, y: dx / len }
      if (!inRing({ x: mx + inward.x * 1.5, y: my + inward.y * 1.5 }, ring)) inward = { x: -inward.x, y: -inward.y }
      let base = w.lowM
      for (let d = 6; d <= BASE_PROBE_M; d += 4) {
        const p = { x: mx + inward.x * d, y: my + inward.y * d }
        if (!inRing(p, ring)) break
        base = Math.min(base, groundM(p.x, p.y))
      }
      out.push({ a: w.a, b: w.b, baseM: base, topM: w.highM, inward })
    }
  }
  return out
}

/**
 * The corrected ground at a point: the measurement, except inside a beach and
 * within CARVE_BAND_M of one of its walls, where it is held down to the sand's
 * level for most of the band and eased back to the measurement over its last
 * third. Returns the measurement untouched everywhere else.
 */
export function carveGround(
  walls: ReadonlyArray<CarveWall>, beaches: ReadonlyArray<ReadonlyArray<P>>,
): (x: number, y: number, measuredM: number) => number {
  if (walls.length === 0) return (_x, _y, h) => h
  // Boxes first: a vertex far from every beach costs four comparisons.
  const boxes = beaches.map((r) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const p of r) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y) }
    return { x0, x1, y0, y1 }
  })
  return (x, y, h) => {
    let inside = false
    for (let k = 0; k < beaches.length && !inside; k++) {
      const b = boxes[k]
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue
      inside = inRing({ x, y }, beaches[k])
    }
    if (!inside) return h
    let target = h
    for (const w of walls) {
      const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y
      const l2 = dx * dx + dy * dy
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - w.a.x) * dx + (y - w.a.y) * dy) / l2)) : 0
      const px = w.a.x + t * dx, py = w.a.y + t * dy
      // Distance in front of the wall (into the beach), not behind it.
      const d = (x - px) * w.inward.x + (y - py) * w.inward.y
      const along = Math.hypot(x - px - w.inward.x * d, y - py - w.inward.y * d)
      if (d < -0.5 || d > CARVE_BAND_M || along > 1.5) continue
      const ease = Math.max(0, (d - CARVE_BAND_M * (2 / 3)) / (CARVE_BAND_M / 3))
      target = Math.min(target, w.baseM + ease * Math.max(0, h - w.baseM))
    }
    return Math.min(h, target)
  }
}
