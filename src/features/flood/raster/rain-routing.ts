// ─── roof runoff ──────────────────────────────────────────────────────────────
// Rain that falls on a roof (or a canopy) does not stay there: downpipes put it
// on the ground at the building's edge, or into the storm sewer. The solver
// only knows a rainfall multiplier per cell, so the roof's share is moved here,
// once, when the grid is built.
//
// 'perimeter': every roofed cell hands its rain to the nearest open cell (a
// multi-source breadth-first search from all open cells at once — a discrete
// Voronoi partition of the roofs among the open ground around them, which is
// how a ring of downpipes splits a roof). Courtyards count as open ground.
// Mass is conserved exactly: Σ rainFactor over open cells = all cells.
// 'drained': roof rain goes to the sewer and leaves the simulation.
//
// Pure.

export type RoofRunoff = 'perimeter' | 'drained'

export interface RainRouting {
  rainFactor: Float32Array
  /** Roofed cells whose rain was moved to the ground. */
  routedCells: number
  /** Roofed cells whose rain left the simulation (drained, or no open cell anywhere). */
  lostCells: number
}

/**
 * @param roofed 1 = no rain reaches the ground here (a building, a canopy).
 * @param blocked 1 = an obstacle: can never receive water, even routed.
 */
export function routeRoofRain(nx: number, ny: number, roofed: Uint8Array, blocked: Uint8Array, mode: RoofRunoff): RainRouting {
  const n = nx * ny
  const rainFactor = new Float32Array(n)
  let roofCount = 0
  for (let c = 0; c < n; c++) {
    if (roofed[c] || blocked[c]) roofCount++
    else rainFactor[c] = 1
  }
  if (mode === 'drained' || roofCount === 0) return { rainFactor, routedCells: 0, lostCells: mode === 'drained' ? roofCount : 0 }

  // owner[c] = the open cell whose ground receives c's rain.
  const owner = new Int32Array(n).fill(-1)
  const queue = new Int32Array(n)
  let head = 0
  let tail = 0
  for (let c = 0; c < n; c++) {
    if (!roofed[c] && !blocked[c]) {
      owner[c] = c
      queue[tail++] = c
    }
  }
  if (tail === 0) return { rainFactor, routedCells: 0, lostCells: roofCount }
  while (head < tail) {
    const c = queue[head++]
    const i = c % nx
    const j = (c - i) / nx
    const o = owner[c]
    if (i > 0 && owner[c - 1] < 0) { owner[c - 1] = o; queue[tail++] = c - 1 }
    if (i < nx - 1 && owner[c + 1] < 0) { owner[c + 1] = o; queue[tail++] = c + 1 }
    if (j > 0 && owner[c - nx] < 0) { owner[c - nx] = o; queue[tail++] = c - nx }
    if (j < ny - 1 && owner[c + nx] < 0) { owner[c + nx] = o; queue[tail++] = c + nx }
  }
  let routed = 0
  for (let c = 0; c < n; c++) {
    if ((roofed[c] || blocked[c]) && owner[c] >= 0) {
      rainFactor[owner[c]] += 1
      routed++
    }
  }
  return { rainFactor, routedCells: routed, lostCells: roofCount - routed }
}
