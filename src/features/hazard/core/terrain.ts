// ─── terrain derivatives on a regular DEM ────────────────────────────────────
// Row-major grid (index = j * nx + i), square cells of side dx, elevations in
// metres. NaN = no data / outside the study area: such cells have no slope, do
// not route flow and stop debris.

export interface Dem {
  nx: number
  ny: number
  dx: number
  z: Float32Array
}

const DI = [1, 1, 0, -1, -1, -1, 0, 1]
const DJ = [0, 1, 1, 1, 0, -1, -1, -1]
const DIST = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2]

/** Slope angle β per cell, radians (Horn 1981, edge cells clamp to themselves). */
export function slopeRad(dem: Dem): Float32Array {
  const { nx, ny, dx, z } = dem
  const out = new Float32Array(nx * ny)
  const at = (i: number, j: number, fallback: number): number => {
    if (i < 0 || j < 0 || i >= nx || j >= ny) return fallback
    const v = z[j * nx + i]
    return Number.isNaN(v) ? fallback : v
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = z[j * nx + i]
      if (Number.isNaN(c)) { out[j * nx + i] = NaN; continue }
      const a = at(i - 1, j - 1, c), b = at(i, j - 1, c), cc = at(i + 1, j - 1, c)
      const d = at(i - 1, j, c), f = at(i + 1, j, c)
      const g = at(i - 1, j + 1, c), h = at(i, j + 1, c), k = at(i + 1, j + 1, c)
      const dzdx = ((cc + 2 * f + k) - (a + 2 * d + g)) / (8 * dx)
      const dzdy = ((g + 2 * h + k) - (a + 2 * b + cc)) / (8 * dx)
      out[j * nx + i] = Math.atan(Math.hypot(dzdx, dzdy))
    }
  }
  return out
}

/** D8 receiver of each cell (steepest descent), −1 for pits, edges and no data. */
export function d8Receivers(dem: Dem): Int32Array {
  const { nx, ny, z } = dem
  const out = new Int32Array(nx * ny).fill(-1)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i
      const zc = z[c]
      if (Number.isNaN(zc)) continue
      let best = 0
      for (let d = 0; d < 8; d++) {
        const ii = i + DI[d], jj = j + DJ[d]
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue
        const zn = z[jj * nx + ii]
        if (Number.isNaN(zn)) continue
        const s = (zc - zn) / DIST[d]
        if (s > best) { best = s; out[c] = jj * nx + ii }
      }
    }
  }
  return out
}

/** Upslope contributing area per cell (m², itself included), D8. */
export function flowAccumulation(dem: Dem, receivers = d8Receivers(dem)): Float32Array {
  const n = dem.nx * dem.ny
  const cellArea = dem.dx * dem.dx
  const order = Array.from({ length: n }, (_, c) => c)
    .filter((c) => !Number.isNaN(dem.z[c]))
    .sort((a, b) => dem.z[b] - dem.z[a])
  const acc = new Float32Array(n)
  for (const c of order) acc[c] += cellArea
  for (const c of order) {
    const r = receivers[c]
    if (r >= 0) acc[r] += acc[c]
  }
  return acc
}
