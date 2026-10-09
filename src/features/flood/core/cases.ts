// ─── reference cases ──────────────────────────────────────────────────────────
// The scenarios the solvers are verified on, shared by the unit tests (CPU) and
// the browser suite that runs the same cases on WebGPU and WebGL2 and compares
// them with the CPU. Each case builds its own grid, rain and parameters.

import { createGrid, inclinedPlaneDemo, blockLayout, validateGrid, type FloodGrid } from './grid'
import { constantStorm, type Hyetograph } from './hyetograph'
import type { SolverParams } from './solver-api'

export interface FloodCase {
  id: string
  title: string
  grid: FloodGrid
  hyetograph: Hyetograph
  params: Partial<SolverParams>
  /** Simulated duration to run, s. */
  durationS: number
}

const closed = { west: 'closed', east: 'closed', south: 'closed', north: 'closed' } as const
const dry: Hyetograph = { intervalS: 3600, intensityMmH: [0] }

/** Still water over a bumpy bed with islands and obstacles: nothing may move. */
export function lakeAtRest(n = 64): FloodCase {
  const g = createGrid(n, n, 2, 0.03)
  g.h0 = new Float32Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = i / n
      const y = j / n
      // Elevations on a 1/4096 m lattice: then 1 − z is exact in float32 and
      // float64 alike, and η = z + h is exactly 1 in every wet cell on the CPU
      // and on the GPU — the test is about the scheme, not about rounding.
      const raw = 0.6 + 0.45 * Math.sin(6.1 * x) * Math.cos(4.3 * y) + 0.25 * Math.sin(17 * x * y)
      const z = Math.round(raw * 4096) / 4096
      const c = j * n + i
      g.z[c] = z
      g.h0[c] = Math.max(0, 1 - z)
    }
  }
  for (let j = 20; j < 28; j++) for (let i = 30; i < 40; i++) g.blocked[j * n + i] = 1
  return {
    id: 'lake-at-rest', title: 'Lake at rest (η = 1 m)', grid: validateGrid(g), hyetograph: dry,
    params: { boundary: { ...closed } }, durationS: 1800,
  }
}

/** Dam break over a dry, nearly frictionless bed (Ritter). A 1-D strip. */
export function damBreak(nx = 400, dx = 0.5): FloodCase {
  const ny = 3
  const g = createGrid(nx, ny, dx, 0.001)
  g.h0 = new Float32Array(nx * ny)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx / 2; i++) g.h0[j * nx + i] = 1
  return {
    id: 'dam-break', title: 'Dam break, dry bed (Ritter)', grid: validateGrid(g), hyetograph: dry,
    params: { boundary: { ...closed }, theta: 0.8 }, durationS: 12,
  }
}

/** Constant rain on a plane draining to a free outlet (kinematic wave). A 1-D strip. */
export function rainOnPlane(L = 100, dx = 1, slope = 0.01, n = 0.03, mmH = 50, minutes = 60): FloodCase {
  const nx = Math.round(L / dx)
  const ny = 3
  const g = createGrid(nx, ny, dx, n)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) g.z[j * nx + i] = (L - (i + 0.5) * dx) * slope
  return {
    id: 'rain-on-plane', title: `Rain on a ${slope * 100}% plane`, grid: validateGrid(g),
    hyetograph: constantStorm(mmH, minutes, minutes),
    params: { boundary: { west: 'closed', east: 'free', south: 'closed', north: 'closed' } },
    durationS: minutes * 60,
  }
}

/** Rain on a sloping street grid between buildings — the demo and the benchmark. */
export function cityDemo(n = 500, dx = 2, mmH = 90, minutes = 45): FloodCase {
  const grid = inclinedPlaneDemo({
    nx: n, ny: n, dx, slopeX: 0.012, slopeY: 0.004, roughnessAmplitude: 0.8, seed: 11,
    obstacles: blockLayout(n, n, Math.round(40 / dx), Math.round(12 / dx)),
  })
  return {
    id: 'city-demo', title: 'Storm over a sloping city grid', grid, hyetograph: constantStorm(mmH, minutes, 5),
    params: { boundary: { west: 'closed', east: 'free', south: 'closed', north: 'free' } },
    durationS: minutes * 60 + 15 * 60,
  }
}
