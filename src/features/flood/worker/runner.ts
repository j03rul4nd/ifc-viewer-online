// ─── FloodRunner ──────────────────────────────────────────────────────────────
// Main-thread handle on the flood worker: start a run, play / pause it, ask for
// any past instant (snapshots) or one cell's history, and receive stats and
// frames as callbacks.

import type { FloodGrid } from '../core/grid'
import type { Hyetograph } from '../core/hyetograph'
import type { FloodBackend, FloodStats, MaxFields, SolverParams } from '../core/solver-api'
import type { BackendChoice } from '../gpu/create'
import type { CellSeries } from './snapshots'
import { gridTransferables, type FromWorker, type RunPerf, type SnapshotInfo, type ToWorker } from './protocol'

export interface RunnerEvents {
  onReady?(info: { backend: FloodBackend; device: string; fallbackReason: string | null }): void
  onStats?(stats: FloodStats, perf: RunPerf): void
  /** The live state of the run (while it computes). */
  onFrame?(frame: { t: number; nx: number; ny: number; data: Uint16Array }): void
  onSnapshots?(info: SnapshotInfo): void
  onState?(state: { running: boolean; finished: boolean }): void
  onError?(message: string): void
}

export interface RunnerInit {
  grid: FloodGrid
  hyetograph: Hyetograph
  params?: Partial<SolverParams>
  backend?: BackendChoice
  powerPreference?: 'low-power' | 'high-performance'
  endS: number
  snapshotEveryS?: number
}

export class FloodRunner {
  private readonly worker: Worker
  private pendingMax: Array<(f: MaxFields) => void> = []
  private pending = new Map<number, (v: unknown) => void>()
  private req = 0

  constructor(private readonly ev: RunnerEvents = {}) {
    this.worker = new Worker(new URL('./flood.worker.ts', import.meta.url), { type: 'module', name: 'flood' })
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.handle(e.data)
    this.worker.onerror = (e) => this.ev.onError?.(e.message || 'flood worker failed to start')
  }

  private handle(m: FromWorker): void {
    switch (m.type) {
      case 'ready': this.ev.onReady?.(m); break
      case 'stats': this.ev.onStats?.(m.stats, m.perf); break
      case 'frame': this.ev.onFrame?.(m); break
      case 'snapshots': this.ev.onSnapshots?.(m); break
      case 'state': this.ev.onState?.(m); break
      case 'error': this.ev.onError?.(m.message); break
      case 'frameAt': this.settle(m.req, m); break
      case 'cellSeries': this.settle(m.req, m.series); break
      case 'max': {
        const waiting = this.pendingMax
        this.pendingMax = []
        for (const w of waiting) w(m.fields)
        break
      }
    }
  }

  private settle(req: number, v: unknown): void {
    const r = this.pending.get(req)
    this.pending.delete(req)
    r?.(v)
  }

  private ask<T>(m: (req: number) => ToWorker): Promise<T> {
    const req = ++this.req
    return new Promise<T>((resolve) => {
      this.pending.set(req, resolve as (v: unknown) => void)
      this.send(m(req))
    })
  }

  private send(m: ToWorker, transfer: Transferable[] = []): void {
    this.worker.postMessage(m, transfer)
  }

  /**
   * Starts a fresh run. The grid's arrays are TRANSFERRED to the worker and
   * unusable here afterwards — pass a copy if the caller still needs them.
   */
  init(r: RunnerInit): void {
    this.send({
      type: 'init', grid: r.grid, hyetograph: r.hyetograph, params: r.params,
      backend: r.backend ?? 'auto', powerPreference: r.powerPreference, endS: r.endS, snapshotEveryS: r.snapshotEveryS,
    }, gridTransferables(r.grid))
  }

  play(speed: number | 'max' = 'max'): void { this.send({ type: 'play', speed }) }
  pause(): void { this.send({ type: 'pause' }) }
  requestFrame(): void { this.send({ type: 'frame' }) }

  /** The state at a past time (interpolated between snapshots); data null before the first. */
  frameAt(t: number): Promise<{ t: number; data: Uint16Array | null }> {
    return this.ask((req) => ({ type: 'frameAt', t, req }))
  }

  /** One cell's depth and speed at every snapshot. */
  cellSeries(cell: number): Promise<CellSeries> {
    return this.ask((req) => ({ type: 'cellSeries', cell, req }))
  }

  maxFields(): Promise<MaxFields> {
    return new Promise((resolve) => {
      this.pendingMax.push(resolve)
      this.send({ type: 'max' })
    })
  }

  dispose(): void {
    this.send({ type: 'dispose' })
    for (const r of this.pending.values()) r(null)
    this.pending.clear()
    // Let the worker release its GPU resources before it is torn down.
    setTimeout(() => this.worker.terminate(), 250)
  }
}
