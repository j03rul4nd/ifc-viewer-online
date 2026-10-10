// ─── flood solver contract ────────────────────────────────────────────────────
// What the rest of the feature (worker loop, UI, exports) may know about a
// solver: it advances in simulated time and hands out CELL-CENTRED fields —
// depth h and velocity (u, v) — plus running maxima and a mass balance. The
// numerical scheme stays private: the local-inertial solvers keep fluxes on
// faces, a finite-volume Godunov-type solver (Kurganov–Petrova, HLL) would keep
// (h, hu, hv) in the cells, and both fit behind this interface unchanged.
//
// SHARED CLOCK. Every backend counts time in whole milliseconds (u32 on the
// GPU): the step is the CFL step floored to the millisecond and clamped so it
// never crosses a rain interval or the requested stop time. That makes the
// clock identical across CPU, WebGPU and WebGL2, lets the rain volume be known
// exactly from the time alone, and avoids float time drift over long events.

import type { FloodGrid } from './grid'
import type { Hyetograph } from './hyetograph'

export type FloodBackend = 'webgpu' | 'webgl2' | 'cpu'
export type EdgeBoundary = 'closed' | 'free'

export interface BoundaryConfig {
  west: EdgeBoundary
  east: EdgeBoundary
  south: EdgeBoundary
  north: EdgeBoundary
}

export interface SolverParams {
  /** Gravity, m/s². */
  g: number
  /**
   * de Almeida et al. (2012) weighting of the face flux against its two
   * neighbours. 1 = the original Bates et al. (2010) scheme; 0.7–0.9 damps the
   * checkerboard oscillations it shows at low friction.
   */
  theta: number
  /**
   * How friction enters the momentum update: 'implicit' solves for the new
   * discharge (stable on shallow sheet flow), 'bates' lags it one step as in
   * Bates et al. (2010). See frictionSolve (cpu-inertial.ts).
   */
  friction: 'implicit' | 'bates'
  /** CFL coefficient α in Δt = α·Δx / √(g·h_max). */
  alpha: number
  /** Below this depth at a face, no water crosses it (m). */
  hEps: number
  /** Longest step, seconds (a dry domain has no CFL limit). */
  dtMax: number
  /** Water-surface slope driving a free outlet whose bed does not fall outwards. */
  freeSlopeMin: number
  /** Depth that counts as flooded for metrics and maximum velocity (m). */
  wetThreshold: number
  boundary: BoundaryConfig
  /** Water the ground absorbs, or null for an impervious surface. */
  infiltration: Infiltration | null
}

/**
 * Horton's infiltration: f(t) = fc + (f0 − fc)·e^(−k·t), t the time since the
 * event began (the soil wets from the first drop), in mm/h. f0 = fc is a
 * constant rate. Applied to every open cell, never more than the water there.
 */
export interface Infiltration {
  initialMmH: number
  finalMmH: number
  /** k, per hour. */
  decayPerHour: number
}

/** The infiltration rate at time tS (s), m/s. */
export function infiltrationRate(inf: Infiltration | null, tS: number): number {
  if (!inf) return 0
  const f = inf.finalMmH + (inf.initialMmH - inf.finalMmH) * Math.exp(-inf.decayPerHour * (tS / 3600))
  return Math.max(0, f) / 3_600_000
}

export const DEFAULT_PARAMS: SolverParams = {
  g: 9.81,
  theta: 0.8,
  friction: 'implicit',
  alpha: 0.7,
  hEps: 1e-4,
  dtMax: 10,
  freeSlopeMin: 1e-3,
  wetThreshold: 0.05,
  boundary: { west: 'free', east: 'free', south: 'free', north: 'free' },
  infiltration: null,
}

/** Below this, √(g·h) would be zero; the step is then limited by dtMax. */
export const H_FLOOR = 1e-6

/** Bit per free edge, as the GPU parameter blocks carry it. */
export function edgeBits(b: BoundaryConfig): number {
  return (b.west === 'free' ? 1 : 0) | (b.east === 'free' ? 2 : 0) | (b.south === 'free' ? 4 : 0) | (b.north === 'free' ? 8 : 0)
}

/**
 * The next step, in whole milliseconds — the single definition every backend
 * implements (the shaders mirror it line by line). 0 = stop (t reached tStop).
 */
export function nextStepMs(
  tMs: number,
  tStopMs: number,
  hMax: number,
  dx: number,
  p: Pick<SolverParams, 'g' | 'alpha' | 'dtMax'>,
  rainIntervalMs: number,
  rainCount: number,
): number {
  if (tStopMs <= tMs) return 0
  const cfl = (p.alpha * dx) / Math.sqrt(p.g * Math.max(hMax, H_FLOOR))
  let d = Math.max(1, Math.floor(Math.min(cfl, p.dtMax) * 1000))
  d = Math.min(d, tStopMs - tMs)
  const idx = Math.floor(tMs / rainIntervalMs)
  if (idx < rainCount) d = Math.min(d, (idx + 1) * rainIntervalMs - tMs)
  return d
}

export interface FloodStats {
  /** Simulated time, s. */
  t: number
  /** Last step taken, s. */
  dt: number
  steps: number
  /** Deepest water now, m. */
  hMax: number
  /** Fastest water now (cells deeper than wetThreshold), m/s. */
  vMax: number
  /** Water on the surface, m³. */
  volume: number
  /** Area deeper than wetThreshold, m². */
  floodedArea: number
  /** Rain that has reached the grid, m³. */
  rainVolume: number
  /** Water that has left through free edges, m³. */
  outflowVolume: number
  /** Water the ground has absorbed, m³. */
  infiltratedVolume: number
  initialVolume: number
  /** (stored + out + infiltrated − rain − initial) / (rain + initial). */
  massError: number
}

/** Cell-centred fields at one instant. */
export interface FieldFrame {
  t: number
  nx: number
  ny: number
  h: Float32Array
  u: Float32Array
  v: Float32Array
}

/** Running maxima since the start. */
export interface MaxFields {
  nx: number
  ny: number
  hMax: Float32Array
  /** Fastest velocity while deeper than wetThreshold, m/s. */
  vMax: Float32Array
  /** When the peak depth was reached, s. */
  tPeak: Float32Array
  /** When the cell first became deeper than wetThreshold, s (−1 = never). */
  tWet: Float32Array
}

export interface AdvanceResult {
  /** Simulated time reached, s. */
  t: number
  /** Steps taken by this call (no-op steps excluded). */
  steps: number
  /** Last real step, s. */
  dt: number
}

export interface FloodSolver {
  readonly backend: FloodBackend
  readonly grid: FloodGrid
  /**
   * Advances towards `tStopS` with at most `maxSteps` steps (GPU backends
   * record exactly that many and turn the ones past tStop into no-ops, so the
   * CPU never waits on the GPU mid-batch). Resolves once the work is done.
   */
  advance(tStopS: number, maxSteps: number): Promise<AdvanceResult>
  stats(): Promise<FloodStats>
  fields(): Promise<FieldFrame>
  maxFields(): Promise<MaxFields>
  /**
   * Display frame: per cell (h, u, v, hMax) as IEEE half floats, the layout a
   * THREE.DataTexture(RGBA, HalfFloatType) takes as-is.
   */
  displayFrame(): Promise<Uint16Array>
  dispose(): void
}

export interface SolverInit {
  grid: FloodGrid
  hyetograph: Hyetograph
  params?: Partial<SolverParams>
}

export function resolveParams(p?: Partial<SolverParams>): SolverParams {
  return { ...DEFAULT_PARAMS, ...p, boundary: { ...DEFAULT_PARAMS.boundary, ...p?.boundary } }
}
