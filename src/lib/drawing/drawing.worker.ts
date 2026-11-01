// ─── Heavy drawing work, off the main thread ──────────────────────────────────
// A large DXF or a cut of a whole hospital must not freeze the model beside it.

import { parseDxf } from './dxf-parse'
import { buildCut, type BuildCutOptions, type CutPlane } from './plan-cut'
import { sliceScan, type ScanSliceOptions } from './scan-slice'
import type { Pt } from './types'

export type DrawingJob =
  | { kind: 'dxf'; bytes: Uint8Array }
  | { kind: 'cut'; soups: [string, Float32Array[]][]; plane: CutPlane; options: BuildCutOptions }
  | { kind: 'scan'; positions: Float32Array; reference: Pt[][] | null; options: ScanSliceOptions }

export function runJob(job: DrawingJob): unknown {
  if (job.kind === 'dxf') return parseDxf(job.bytes)
  if (job.kind === 'cut') return buildCut(job.soups, job.plane, job.options)
  return sliceScan(job.positions, job.reference, job.options)
}

// Only in a worker: run-job imports runJob for its fallback on this thread.
if (typeof document === 'undefined' && typeof self !== 'undefined' && 'onmessage' in self) {
  self.onmessage = (e: MessageEvent<{ id: number; job: DrawingJob }>) => {
    const { id, job } = e.data
    try {
      self.postMessage({ id, result: runJob(job) })
    } catch (err) {
      const x = err as { name?: string; code?: string; message?: string }
      self.postMessage({ id, error: { name: x.name, code: x.code, message: x.message ?? String(err) } })
    }
  }
}
