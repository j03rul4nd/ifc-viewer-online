// ─── coarse-dem ───────────────────────────────────────────────────────────────
// The relief of the WHOLE city, coarse (WP2). A 3×3 mosaic of Terrarium z12
// tiles around the anchor's tile: 768² samples, ≈38 m apart in Barcelona,
// ≈30 km a side. The fine patch (geo-terrain) still carries the measured
// ground around the site; this is what the flat map and everything beyond the
// patch stand on, so Montjuïc and Collserola are hills instead of a plane.
//
// Pure: no three, no fetch. The worker fills `heights`; the main thread samples.

export const COARSE_DEM_ZOOM = 12
export const COARSE_DEM_TILES = 3
const TILE_PX = 256
export const COARSE_DEM_PX = COARSE_DEM_TILES * TILE_PX

export interface CoarseDem {
  zoom: number
  /** Slippy x / y of the mosaic's north-west tile. */
  tileX0: number
  tileY0: number
  /** Samples per side (COARSE_DEM_PX). Row 0 = north edge. */
  size: number
  /** Absolute elevations, metres, size² (never below 0: see clampSea). */
  heights: Float32Array
  minM: number
  maxM: number
}

/** The NW tile of the mosaic centred on the tile holding (fx, fy) at `zoom`. */
export function coarseMosaicOrigin(fx: number, fy: number, zoom = COARSE_DEM_ZOOM): { tileX0: number; tileY0: number } {
  const n = 2 ** zoom
  const cx = Math.min(Math.max(Math.floor(fx), 1), n - 2)
  const cy = Math.min(Math.max(Math.floor(fy), 1), n - 2)
  return { tileX0: cx - 1, tileY0: cy - 1 }
}

/**
 * The sea at 0. Terrarium carries bathymetry, and the flat map draws the sea as
 * a surface: dropping it tens of metres would make the coast a cliff. Land below
 * sea level (polders) is flattened to 0 too — a few metres, accepted.
 */
export function clampSea(heights: Float32Array): void {
  for (let i = 0; i < heights.length; i++) if (!(heights[i] > 0)) heights[i] = 0
}

export function heightRange(heights: Float32Array): { minM: number; maxM: number } {
  let minM = Infinity
  let maxM = -Infinity
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i]
    if (h < minM) minM = h
    if (h > maxM) maxM = h
  }
  return Number.isFinite(minM) ? { minM, maxM } : { minM: 0, maxM: 0 }
}

/**
 * Elevation, metres, at a centred-normalized position (X east, Y north, the
 * world = 1×1 around the origin — geo-math.latLonToNormalized). Bilinear,
 * clamped to the mosaic's edge: beyond 30 km the ground keeps its edge height.
 */
export function sampleCoarseN(dem: CoarseDem, nx: number, ny: number): number {
  const n = 2 ** dem.zoom
  const s = dem.size
  const px = ((nx + 0.5) * n - dem.tileX0) * TILE_PX - 0.5
  const py = ((0.5 - ny) * n - dem.tileY0) * TILE_PX - 0.5
  const fx = Math.min(Math.max(px, 0), s - 1)
  const fy = Math.min(Math.max(py, 0), s - 1)
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(x0 + 1, s - 1)
  const y1 = Math.min(y0 + 1, s - 1)
  const tx = fx - x0
  const ty = fy - y0
  const h = dem.heights
  const top = h[y0 * s + x0] * (1 - tx) + h[y0 * s + x1] * tx
  const bot = h[y1 * s + x0] * (1 - tx) + h[y1 * s + x1] * tx
  return top * (1 - ty) + bot * ty
}

/** Normalized extent of the mosaic. */
export function coarseBoundsN(dem: CoarseDem): { minNx: number; maxNx: number; minNy: number; maxNy: number } {
  const n = 2 ** dem.zoom
  return {
    minNx: dem.tileX0 / n - 0.5,
    maxNx: (dem.tileX0 + COARSE_DEM_TILES) / n - 0.5,
    maxNy: 0.5 - dem.tileY0 / n,
    minNy: 0.5 - (dem.tileY0 + COARSE_DEM_TILES) / n,
  }
}
