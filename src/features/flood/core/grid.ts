// ─── flood grid ───────────────────────────────────────────────────────────────
// The regular grid every flood solver runs on: one bed elevation, one obstacle
// flag, one rainfall multiplier and one Manning's n per square cell.
//
// LAYOUT. Cells are row-major, index = j * nx + i, with i along x (columns) and
// j along y (rows). Fluxes live on the cell FACES (a staggered grid): the solvers
// keep them in one (nx + 1) × (ny + 1) array where entry (i, j) holds
//   .x = qx on the face WEST of cell (i, j)   (between cells i − 1 and i, row j)
//   .y = qy on the face SOUTH of cell (i, j)  (between rows j − 1 and j, column i)
// so face index f = j * (nx + 1) + i for both. The last column (i = nx) only has
// a meaningful qx, the last row (j = ny) only a meaningful qy.
//
// ELEVATIONS are stored relative to `zRef` (the lowest bed of the grid): a
// float32 keeps ~7 significant digits, which at 400 m above sea level would be
// ~0.04 mm of depth resolution, and at 0–30 m relative is far below that.
//
// The grid is plain data: the solver does not know where it sits in the world.
// `frame` carries that for the layers that draw or export it.

export interface GridFrame {
  /** World (scene) x / z of the corner of cell (0, 0), metres. */
  originX: number
  originZ: number
  /** Rotation of the grid's +i axis from scene +X, radians (0 = aligned). */
  rotation: number
  /** Projected CRS the grid is aligned to, when it is ('EPSG:25831'…). */
  crs?: string | null
  /** Easting / northing of the corner of cell (0, 0) in that CRS. */
  easting?: number
  northing?: number
}

export interface FloodGrid {
  /** Cells along x (columns) and y (rows). */
  nx: number
  ny: number
  /** Cell size, metres (square cells). */
  dx: number
  /** Bed elevation per cell, metres above `zRef`. */
  z: Float32Array
  /** Absolute elevation of z = 0, metres. */
  zRef: number
  /** 1 = obstacle (a building): water never enters, leaves or falls on it. */
  blocked: Uint8Array
  /** Multiplier of the rain each cell receives (0 under a roof, > 1 where roofs drain). */
  rainFactor: Float32Array
  /** Manning's roughness per cell, s·m^(−1/3). */
  manning: Float32Array
  /** Initial depth per cell, metres. Absent = dry. */
  h0?: Float32Array
  /**
   * How much of the soil's infiltration each cell takes (0 = sealed: asphalt,
   * a roof; 1 = the soil as chosen; more where the ground is looser). Absent =
   * 1 everywhere. Scales the Horton curve, never replaces it.
   */
  infiltration?: Float32Array
  frame?: GridFrame
}

export const cellIndex = (g: { nx: number }, i: number, j: number): number => j * g.nx + i
export const faceIndex = (g: { nx: number }, i: number, j: number): number => j * (g.nx + 1) + i
export const cellCount = (g: { nx: number; ny: number }): number => g.nx * g.ny
export const faceCount = (g: { nx: number; ny: number }): number => (g.nx + 1) * (g.ny + 1)

/** A flat, dry, open grid with uniform roughness. */
export function createGrid(nx: number, ny: number, dx: number, manning = 0.03): FloodGrid {
  const n = nx * ny
  return {
    nx, ny, dx,
    z: new Float32Array(n),
    zRef: 0,
    blocked: new Uint8Array(n),
    rainFactor: new Float32Array(n).fill(1),
    manning: new Float32Array(n).fill(manning),
  }
}

/**
 * Throws when the arrays do not match the dimensions, and zeroes the rain and
 * the initial water of blocked cells — a solver must never have to guess.
 */
export function validateGrid(g: FloodGrid): FloodGrid {
  const n = g.nx * g.ny
  if (!Number.isInteger(g.nx) || !Number.isInteger(g.ny) || g.nx < 1 || g.ny < 1) {
    throw new Error(`flood grid: bad size ${g.nx}×${g.ny}`)
  }
  if (!(g.dx > 0)) throw new Error(`flood grid: bad cell size ${g.dx}`)
  for (const [name, arr] of [['z', g.z], ['blocked', g.blocked], ['rainFactor', g.rainFactor], ['manning', g.manning]] as const) {
    if (arr.length !== n) throw new Error(`flood grid: ${name} has ${arr.length} cells, expected ${n}`)
  }
  if (g.h0 && g.h0.length !== n) throw new Error(`flood grid: h0 has ${g.h0.length} cells, expected ${n}`)
  if (g.infiltration && g.infiltration.length !== n) throw new Error(`flood grid: infiltration has ${g.infiltration.length} cells, expected ${n}`)
  for (let c = 0; c < n; c++) {
    if (!Number.isFinite(g.z[c])) throw new Error(`flood grid: non-finite elevation at cell ${c}`)
    if (!(g.manning[c] >= 0)) throw new Error(`flood grid: bad Manning's n at cell ${c}`)
    if (g.infiltration && !(g.infiltration[c] >= 0)) throw new Error(`flood grid: bad infiltration factor at cell ${c}`)
    if (g.blocked[c]) {
      g.rainFactor[c] = 0
      if (g.h0) g.h0[c] = 0
    }
  }
  return g
}

/** Σ rainFactor · dx² over open cells: the area that turns rain into surface water, m². */
export function effectiveRainArea(g: FloodGrid): number {
  let s = 0
  for (let c = 0; c < g.rainFactor.length; c++) if (!g.blocked[c]) s += g.rainFactor[c]
  return s * g.dx * g.dx
}

/** Water on the grid at the start, m³. */
export function initialVolume(g: FloodGrid): number {
  if (!g.h0) return 0
  let s = 0
  for (let c = 0; c < g.h0.length; c++) if (!g.blocked[c]) s += g.h0[c]
  return s * g.dx * g.dx
}

/** Moves every elevation so the lowest bed is 0 and records the shift in zRef. */
export function normalizeElevations(g: FloodGrid): FloodGrid {
  let min = Infinity
  for (let c = 0; c < g.z.length; c++) if (g.z[c] < min) min = g.z[c]
  if (!Number.isFinite(min) || min === 0) return g
  for (let c = 0; c < g.z.length; c++) g.z[c] -= min
  g.zRef += min
  return g
}

// ── Demo grids ───────────────────────────────────────────────────────────────

export interface Box { i0: number; j0: number; i1: number; j1: number }

export interface PlaneDemoOptions {
  nx: number
  ny: number
  dx: number
  /** Bed slope down towards +x and +y (m/m). */
  slopeX: number
  slopeY?: number
  manning?: number
  /** Rectangular obstacles, cell ranges inclusive of i0/j0, exclusive of i1/j1. */
  obstacles?: Box[]
  /** Small bumps (m) so water collects in pockets instead of sheeting evenly. */
  roughnessAmplitude?: number
  seed?: number
}

/** An inclined plane with buildings — the phase-1 demo and the benchmark scene. */
export function inclinedPlaneDemo(o: PlaneDemoOptions): FloodGrid {
  const g = createGrid(o.nx, o.ny, o.dx, o.manning ?? 0.03)
  const sy = o.slopeY ?? 0
  const amp = o.roughnessAmplitude ?? 0
  let seed = (o.seed ?? 1) >>> 0
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  // Smooth bumps: a few random Gaussian hills/dips, not per-cell noise (noise
  // would turn every cell into its own puddle).
  const bumps = amp > 0
    ? Array.from({ length: 24 }, () => ({
        x: rand() * o.nx * o.dx, y: rand() * o.ny * o.dx,
        r: (0.04 + rand() * 0.08) * Math.max(o.nx, o.ny) * o.dx,
        a: (rand() * 2 - 1) * amp,
      }))
    : []
  for (let j = 0; j < o.ny; j++) {
    for (let i = 0; i < o.nx; i++) {
      const x = (i + 0.5) * o.dx
      const y = (j + 0.5) * o.dx
      let z = (o.nx * o.dx - x) * o.slopeX + (o.ny * o.dx - y) * sy
      for (const b of bumps) {
        const d2 = ((x - b.x) ** 2 + (y - b.y) ** 2) / (b.r * b.r)
        if (d2 < 9) z += b.a * Math.exp(-d2)
      }
      g.z[j * o.nx + i] = z
    }
  }
  for (const b of o.obstacles ?? []) {
    for (let j = Math.max(0, b.j0); j < Math.min(o.ny, b.j1); j++) {
      for (let i = Math.max(0, b.i0); i < Math.min(o.nx, b.i1); i++) g.blocked[j * o.nx + i] = 1
    }
  }
  return normalizeElevations(validateGrid(g))
}

/** A city-block-like layout of obstacles for an nx × ny grid (deterministic). */
export function blockLayout(nx: number, ny: number, blockCells: number, streetCells: number, seed = 7): Box[] {
  const out: Box[] = []
  let s = seed >>> 0
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const pitch = blockCells + streetCells
  for (let j0 = streetCells; j0 + blockCells <= ny - streetCells; j0 += pitch) {
    for (let i0 = streetCells; i0 + blockCells <= nx - streetCells; i0 += pitch) {
      // Each block holds 1–4 buildings with courtyards between them.
      const split = 1 + Math.floor(rand() * 2)
      const w = Math.floor(blockCells / split)
      for (let a = 0; a < split; a++) {
        for (let b = 0; b < split; b++) {
          if (rand() < 0.12) continue // an empty plot / a square
          const inset = Math.floor(rand() * 2)
          out.push({
            i0: i0 + a * w + inset, j0: j0 + b * w + inset,
            i1: i0 + (a + 1) * w - (a === split - 1 ? 0 : 1), j1: j0 + (b + 1) * w - (b === split - 1 ? 0 : 1),
          })
        }
      }
    }
  }
  return out
}
