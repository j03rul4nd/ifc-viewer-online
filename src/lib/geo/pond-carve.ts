// ─── pond carve ───────────────────────────────────────────────────────────────
// The bed of an inland pond, cut into the terrain under its water.
//
// A pond's water is drawn flat at the low ground of its shore (osm-scene's
// waterLevelM). The DEM inside a small pond is not flat: it smears the banks
// and the planting across it, so parts of the terrain stand above the water and
// pierce it. Which surface wins then changes as the camera moves, and the pond
// reads as a patchwork of water and ground — the Plaça de Gaudí pond in front
// of the Sagrada Família was the case that showed it.
//
// The answer is the beach-carve one: correct the ground where the map knows
// better. Inside each pond the terrain is held a little under the water level
// that pond is drawn at, so the water always lies over its own bed.

export interface P { x: number; y: number }

/** How far under the water the bed is held, metres: clear of depth precision. */
export const POND_BED_DEPTH_M = 1.5

function inRing(p: P, ring: ReadonlyArray<P>): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * The water level of a pond, as osm-scene draws it: a low percentile of the
 * ground under its outline, so one bad DEM pixel does not sink it.
 */
export function pondLevelM(ring: ReadonlyArray<P>, groundM: (x: number, y: number) => number): number {
  const samples = ring.map((p) => groundM(p.x, p.y)).sort((a, b) => a - b)
  return samples[Math.min(samples.length - 1, Math.round(0.05 * (samples.length - 1)))]
}

/**
 * The corrected ground: inside a pond, never above its bed; elsewhere the
 * measurement. Rings and levels are parallel arrays, in local metres.
 */
export function carvePonds(
  rings: ReadonlyArray<ReadonlyArray<P>>, levelsM: ReadonlyArray<number>,
): (x: number, y: number, measuredM: number) => number {
  if (rings.length === 0) return (_x, _y, h) => h
  const boxes = rings.map((r) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const p of r) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y) }
    return { x0, x1, y0, y1 }
  })
  return (x, y, h) => {
    for (let k = 0; k < rings.length; k++) {
      const b = boxes[k]
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue
      if (inRing({ x, y }, rings[k])) return Math.min(h, levelsM[k] - POND_BED_DEPTH_M)
    }
    return h
  }
}
