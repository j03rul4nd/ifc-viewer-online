// ─── roof runoff ──────────────────────────────────────────────────────────────
// Rain that falls on a roof (or a canopy) does not stay there: downpipes put it
// on the ground at the building's edge, or into the storm sewer. The solver
// only knows a rainfall multiplier per cell, so the roof's share is moved here,
// once, when the grid is built.
//
// 'perimeter': every roofed cell hands its rain to the nearest open cell (a
// multi-source breadth-first search from all open cells at once — a discrete
// Voronoi partition of the roofs among the open ground around them, which is
// how a ring of downpipes splits a roof). Mass is conserved exactly:
// Σ rainFactor over open cells = all cells.
//
// COURTYARDS (open ground walled in by buildings on every side, passed as
// `courtyard`) are drained: they take no roof rain — the roofs around them
// drain to the street instead — and their own rain goes to their drains. Left
// as open ground, every patio of a city block became a closed tank for the
// roofs around it: measured on the Torre Poblenou's block with its OSM
// neighbours, 88 of the 93 cells deeper than half a metre were in nine patios.
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
  /** Courtyard cells drained (their rain left the simulation). */
  courtyardCells: number
}

/**
 * @param roofed 1 = no rain reaches the ground here (a building, a canopy).
 * @param blocked 1 = an obstacle: can never receive water, even routed.
 */
/**
 * @param groups Roof cells that belong to one building (an index, −1 = none).
 *   A building's rain is shared EVENLY along its whole open perimeter — a row
 *   of downpipes — instead of each roof cell going to its nearest open cell.
 *   The nearest-cell rule poured half of a big roof into a 16 m² recess next
 *   to it (59 cm in a dead end among the Torre Poblenou's neighbours). Cells
 *   without a group, and groups with no open perimeter, use the nearest cell.
 */
export function routeRoofRain(nx: number, ny: number, roofed: Uint8Array, blocked: Uint8Array, mode: RoofRunoff, courtyard?: Uint8Array, groups?: Int32Array): RainRouting {
  const n = nx * ny
  const rainFactor = new Float32Array(n)
  let roofCount = 0
  let courtyardCells = 0
  for (let c = 0; c < n; c++) {
    if (roofed[c] || blocked[c]) roofCount++
    else if (courtyard?.[c]) courtyardCells++
    else rainFactor[c] = 1
  }
  if (mode === 'drained' || roofCount === 0) return { rainFactor, routedCells: 0, lostCells: mode === 'drained' ? roofCount : 0, courtyardCells }

  const isTarget = (c: number): boolean => !roofed[c] && !blocked[c] && !courtyard?.[c]
  // Buildings with an open perimeter: their rain goes along it, evenly.
  const handled = new Uint8Array(n)
  let routedByGroup = 0
  if (groups) {
    const perimeter = new Map<number, number[]>()
    const size = new Map<number, number>()
    const stamp = new Int32Array(n).fill(-1)
    for (let c = 0; c < n; c++) {
      const g = groups[c]
      if (g < 0 || !(roofed[c] || blocked[c])) continue
      size.set(g, (size.get(g) ?? 0) + 1)
      const i = c % nx
      const j = (c - i) / nx
      for (const k of [i > 0 ? c - 1 : -1, i < nx - 1 ? c + 1 : -1, j > 0 ? c - nx : -1, j < ny - 1 ? c + nx : -1]) {
        if (k < 0 || !isTarget(k) || stamp[k] === g) continue
        stamp[k] = g
        const list = perimeter.get(g)
        if (list) list.push(k); else perimeter.set(g, [k])
      }
    }
    for (const [g, cells] of perimeter) {
      const share = (size.get(g) ?? 0) / cells.length
      for (const k of cells) rainFactor[k] += share
      routedByGroup += size.get(g) ?? 0
    }
    for (let c = 0; c < n; c++) {
      const g = groups[c]
      if (g >= 0 && (roofed[c] || blocked[c]) && perimeter.has(g)) handled[c] = 1
    }
  }

  // owner[c] = the open cell whose ground receives c's rain.
  const owner = new Int32Array(n).fill(-1)
  const queue = new Int32Array(n)
  let head = 0
  let tail = 0
  for (let c = 0; c < n; c++) {
    if (isTarget(c)) {
      owner[c] = c
      queue[tail++] = c
    }
  }
  if (tail === 0) return { rainFactor, routedCells: 0, lostCells: roofCount, courtyardCells }
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
  let routed = routedByGroup
  for (let c = 0; c < n; c++) {
    if ((roofed[c] || blocked[c]) && !handled[c] && owner[c] >= 0) {
      rainFactor[owner[c]] += 1
      routed++
    }
  }
  return { rainFactor, routedCells: routed, lostCells: roofCount - routed, courtyardCells }
}
