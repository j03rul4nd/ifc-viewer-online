// ─── shanghai-ground ──────────────────────────────────────────────────────────
// THE GROUND OF SHANGHAI IS A KNOWN NUMBER, NOT A RADAR GUESS.
//
// The global mosaic is a SURFACE model, and over central Shanghai it measures
// roofs: median 11 m in the former French Concession, 31 m at Xujiahui, in a
// city that stands two metres above the sea. The opening and the flat-ground
// cap (lower-envelope) bring that down, but to a level each terrain patch
// derives from its own samples. Measured with the app's own pipeline:
//
//   patch centred on            ground level it settles on
//   the Concession's middle     4.7 m
//   Wukang Mansion              4.1 m
//   Xintiandi                   5.6 m
//   the Bund                    1.3 m
//
// So the same street corner stood at a different height depending on which
// model the map was anchored to, a fifth of every patch was noise below that
// level (pits to −16 m), and a file's stated height was compared against a
// number that moved by metres with where the file happened to be.
//
// DeltaDTM (Pronk et al. 2024, CC BY 4.0) is a bare-earth model of the world's
// coastal lowlands, corrected against spaceborne lidar, 0.45 m mean error. Over
// the same Concession it reads 1.9 m (EGM2008) with a 1.0–3.1 m spread, which
// is what the city's own water authority gives once the datum is converted
// (about 3.3 m Wusong). A grid of it is shipped with the app
// (shanghai-ground-data.ts, baked by scripts/bake-shanghai-ground.mjs), so the
// ground is one function of latitude and longitude: the same wherever the
// patch is centred, with no tile request and no server.
//
// Water is the one thing the grid does not carry at its 9" cell: a cell only
// says whether there is water in or beside it. The banks come from the surface
// model, which does see open water as water — where a cell is beside water and
// the surface reads at river level, the sample is the river bed.
//
// PURE apart from `loadShanghaiGround`, which decodes the data module once.

/** Where the shipped grid is trusted. */
export const SHANGHAI_GROUND_BOX = { south: 31.0, west: 121.2, north: 31.45, east: 121.8 } as const

export const SHANGHAI_GROUND_ATTRIBUTION =
  'Ground level in Shanghai: DeltaDTM v1.1 — Pronk et al. 2024 (CC BY 4.0), contains modified Copernicus DEM data'

/** Height of a river bed in the terrain, metres: under the water drawn over it. */
export const SHANGHAI_RIVER_BED_M = -1
/** How far a bed is held under the ground beside it at least, metres. */
const BED_BELOW_GROUND_M = 1.5
/** The surface model reads open water at or under this, metres (measured on the Huangpu: −0.9 to 1.1). */
export const SHANGHAI_WATER_SURFACE_MAX_M = 1.5

export interface ShanghaiGround {
  cols: number
  rows: number
  /** Metres above EGM2008 per cell, row 0 = north; NaN = open water. */
  heights: Float32Array
  /** 1 where the cell has water in it or beside it. */
  nearWater: Uint8Array
}

/** Inside the grid, optionally with room around the point (degrees). */
export function inShanghaiGround(lat: number, lon: number, marginDeg = 0): boolean {
  const b = SHANGHAI_GROUND_BOX
  return lat >= b.south + marginDeg && lat <= b.north - marginDeg
    && lon >= b.west + marginDeg && lon <= b.east - marginDeg
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function decodeShanghaiGround(d: {
  cols: number; rows: number; offset: number; scale: number; nodata: number
  heightsB64: string; waterB64: string
}): ShanghaiGround {
  const bytes = decodeBase64(d.heightsB64)
  const bits = decodeBase64(d.waterB64)
  const n = d.cols * d.rows
  if (bytes.length !== n) throw new Error(`Shanghai ground: ${bytes.length} cells, expected ${n}`)
  const heights = new Float32Array(n)
  const nearWater = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    heights[i] = bytes[i] === d.nodata ? NaN : (bytes[i] - d.offset) / d.scale
    nearWater[i] = (bits[i >> 3] >> (i & 7)) & 1
  }
  return { cols: d.cols, rows: d.rows, heights, nearWater }
}

let loaded: Promise<ShanghaiGround> | null = null

/** The shipped grid, decoded once. Its data is a chunk of its own. */
export function loadShanghaiGround(): Promise<ShanghaiGround> {
  loaded ??= import('./shanghai-ground-data').then((m) => decodeShanghaiGround({
    cols: m.SHANGHAI_GROUND_COLS, rows: m.SHANGHAI_GROUND_ROWS,
    offset: m.SHANGHAI_GROUND_OFFSET, scale: m.SHANGHAI_GROUND_SCALE, nodata: m.SHANGHAI_GROUND_NODATA,
    heightsB64: m.SHANGHAI_GROUND_HEIGHTS_B64, waterB64: m.SHANGHAI_GROUND_WATER_B64,
  }))
  return loaded
}

/** Fractional cell coordinates of a position, cell centres at integers. */
function cellOf(g: ShanghaiGround, lat: number, lon: number): { fx: number; fy: number } {
  const b = SHANGHAI_GROUND_BOX
  return {
    fx: ((lon - b.west) / (b.east - b.west)) * g.cols - 0.5,
    fy: ((b.north - lat) / (b.north - b.south)) * g.rows - 0.5,
  }
}

/**
 * Bare ground at a position, metres above EGM2008: bilinear between cell
 * centres, so the surface is continuous. Open-water cells are left out of the
 * blend; a point with nothing but water around it is the river bed.
 */
export function shanghaiGroundM(g: ShanghaiGround, lat: number, lon: number): number {
  const { fx, fy } = cellOf(g, lat, lon)
  const x0 = Math.floor(fx), y0 = Math.floor(fy)
  const tx = fx - x0, ty = fy - y0
  let sum = 0, weight = 0
  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = 0; dx <= 1; dx++) {
      const x = Math.min(g.cols - 1, Math.max(0, x0 + dx))
      const y = Math.min(g.rows - 1, Math.max(0, y0 + dy))
      const v = g.heights[y * g.cols + x]
      if (Number.isNaN(v)) continue
      const w = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty)
      sum += v * w
      weight += w
    }
  }
  if (weight > 1e-6) return sum / weight
  // On a cell centre the far neighbours weigh nothing: take any land there is.
  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = 0; dx <= 1; dx++) {
      const v = g.heights[Math.min(g.rows - 1, Math.max(0, y0 + dy)) * g.cols + Math.min(g.cols - 1, Math.max(0, x0 + dx))]
      if (!Number.isNaN(v)) return v
    }
  }
  return SHANGHAI_RIVER_BED_M
}

/** Whether the cell holding a position has water in it or beside it. */
export function nearShanghaiWater(g: ShanghaiGround, lat: number, lon: number): boolean {
  const { fx, fy } = cellOf(g, lat, lon)
  const x = Math.min(g.cols - 1, Math.max(0, Math.round(fx)))
  const y = Math.min(g.rows - 1, Math.max(0, Math.round(fy)))
  return g.nearWater[y * g.cols + x] === 1
}

/**
 * Replace a surface grid over Shanghai with the known ground, in place.
 *
 * `grid` is the surface model after its own cleaning (row-major, `lats.length`
 * rows by `lons.length` columns), used for one thing only: telling water from
 * land where the shipped grid says there is water about.
 */
export function applyShanghaiGround(
  grid: Float32Array, lats: ArrayLike<number>, lons: ArrayLike<number>, g: ShanghaiGround,
): { water: number; minM: number; maxM: number } {
  const w = lons.length, h = lats.length
  let water = 0, minM = Infinity, maxM = -Infinity
  if (grid.length !== w * h) return { water, minM: 0, maxM: 0 }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      let v = shanghaiGroundM(g, lats[y], lons[x])
      if (grid[i] <= SHANGHAI_WATER_SURFACE_MAX_M && nearShanghaiWater(g, lats[y], lons[x])) {
        v = Math.min(SHANGHAI_RIVER_BED_M, v - BED_BELOW_GROUND_M)
        water++
      }
      grid[i] = v
      if (v < minM) minM = v
      if (v > maxM) maxM = v
    }
  }
  return { water, minM, maxM }
}
