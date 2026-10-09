// ─── flood worker protocol ────────────────────────────────────────────────────
// Typed messages between the main thread (FloodRunner) and flood.worker.ts.
// Grid arrays and display frames are transferred, never copied.

import type { FloodGrid } from '../core/grid'
import type { Hyetograph } from '../core/hyetograph'
import type { FloodBackend, FloodStats, MaxFields, SolverParams } from '../core/solver-api'
import type { BackendChoice } from '../gpu/create'

export interface RunPerf {
  /** Steps per wall-clock second over the last batches. */
  stepsPerSecond: number
  /** Simulated seconds per wall-clock second (∞ when paused). */
  speedup: number
  /** Wall-clock time of the last batch, ms. */
  batchMs: number
  /** Steps in the last batch. */
  batchSteps: number
}

export type ToWorker =
  | {
      type: 'init'
      grid: FloodGrid
      hyetograph: Hyetograph
      params?: Partial<SolverParams>
      backend: BackendChoice
      powerPreference?: 'low-power' | 'high-performance'
      /** Simulated time at which the run ends, s. */
      endS: number
    }
  /** speed: simulated seconds per wall second, or 'max' for as fast as possible. */
  | { type: 'play'; speed: number | 'max' }
  | { type: 'pause' }
  | { type: 'frame' }
  | { type: 'max' }
  | { type: 'dispose' }

export type FromWorker =
  | { type: 'ready'; backend: FloodBackend; device: string; fallbackReason: string | null }
  | { type: 'stats'; stats: FloodStats; perf: RunPerf }
  | { type: 'frame'; t: number; nx: number; ny: number; data: Uint16Array }
  | { type: 'max'; fields: MaxFields }
  | { type: 'state'; running: boolean; finished: boolean }
  | { type: 'error'; message: string }

/** The buffers of a grid, for postMessage's transfer list. */
export function gridTransferables(g: FloodGrid): ArrayBuffer[] {
  const out = [g.z.buffer, g.blocked.buffer, g.rainFactor.buffer, g.manning.buffer]
  if (g.h0) out.push(g.h0.buffer)
  return out.filter((b): b is ArrayBuffer => b instanceof ArrayBuffer)
}
