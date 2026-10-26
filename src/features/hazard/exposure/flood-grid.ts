// ─── the flood grid as a hazard grid ─────────────────────────────────────────
// The hazard runs on the same cells as the flood simulation, so the KMZ, the
// curve numbers and the 3D layers line up with the water. These adapters read
// the flood grid's frame; the viewer supplies lat/lon ⇄ scene.

import type { FloodGrid, GridFrame } from '../../flood/core/grid'
import { fromGridLocal, toGridLocal } from '../../flood/raster/frame'
import type { Dem } from '../core/terrain'
import type { HazardGrid } from './exposure'

export function hazardGrid(
  grid: Pick<FloodGrid, 'nx' | 'ny' | 'dx'> & { frame: GridFrame },
  toScene: (lat: number, lon: number) => { x: number; z: number },
): HazardGrid {
  return {
    nx: grid.nx, ny: grid.ny, dx: grid.dx,
    toLocal: (lat, lon) => { const s = toScene(lat, lon); return toGridLocal(grid.frame, s.x, s.z) },
  }
}

/** DEM in absolute metres; buildings (blocked cells) keep the bed under them. */
export function demOf(grid: Pick<FloodGrid, 'nx' | 'ny' | 'dx' | 'z' | 'zRef'>): Dem {
  const z = new Float32Array(grid.z.length)
  for (let c = 0; c < z.length; c++) z[c] = grid.z[c] + grid.zRef
  return { nx: grid.nx, ny: grid.ny, dx: grid.dx, z }
}

export function cellToLatLon(
  grid: Pick<FloodGrid, 'nx' | 'dx'> & { frame: GridFrame },
  toLatLon: (x: number, z: number) => { lat: number; lon: number },
): (cell: number) => { lat: number; lon: number } {
  return (cell) => {
    const i = cell % grid.nx, j = (cell - i) / grid.nx
    const p = fromGridLocal(grid.frame, (i + 0.5) * grid.dx, (j + 0.5) * grid.dx)
    return toLatLon(p.x, p.z)
  }
}
