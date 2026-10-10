// ─── flood worker protocol ────────────────────────────────────────────────────
// Typed messages between the main thread (FloodRunner) and flood.worker.ts.
// Grid arrays and frames are transferred, never copied.

import type { FloodGrid } from '../core/grid'
import type { Hyetograph } from '../core/hyetograph'
import type { FloodBackend, FloodStats, MaxFields, SolverParams } from '../core/solver-api'
import type { BackendChoice } from '../gpu/create'
import type { CellSeries } from './snapshots'

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

export interface SnapshotInfo {
  count: number
  /** Simulated time of the latest snapshot, s. */
  lastT: number
  /** Simulated seconds between snapshots (doubles when memory runs short). */
  interval: number
  bytes: number
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
      /** Seconds between snapshots; default ~200 per event. */
      snapshotEveryS?: number
    }
  /** speed: simulated seconds per wall second, or 'max' for as fast as possible. */
  | { type: 'play'; speed: number | 'max' }
  | { type: 'pause' }
  | { type: 'frame' }
  /** The frame at a past time, interpolated between snapshots. */
  | { type: 'frameAt'; t: number; req: number }
  /** One cell's depth and speed at every snapshot. */
  | { type: 'cellSeries'; cell: number; req: number }
  | { type: 'max' }
  | { type: 'dispose' }

export type FromWorker =
  | { type: 'ready'; backend: FloodBackend; device: string; fallbackReason: string | null }
  | { type: 'stats'; stats: FloodStats; perf: RunPerf }
  | { type: 'frame'; t: number; nx: number; ny: number; data: Uint16Array }
  | ({ type: 'snapshots' } & SnapshotInfo)
  | { type: 'frameAt'; req: number; t: number; data: Uint16Array | null }
  | { type: 'cellSeries'; req: number; series: CellSeries }
  | { type: 'max'; fields: MaxFields }
  | { type: 'state'; running: boolean; finished: boolean }
  | { type: 'error'; message: string }

/** The buffers of a grid, for postMessage's transfer list. */
export function gridTransferables(g: FloodGrid): ArrayBuffer[] {
  const out = [g.z.buffer, g.blocked.buffer, g.rainFactor.buffer, g.manning.buffer]
  if (g.h0) out.push(g.h0.buffer)
  if (g.infiltration) out.push(g.infiltration.buffer)
  return out.filter((b): b is ArrayBuffer => b instanceof ArrayBuffer)
}
