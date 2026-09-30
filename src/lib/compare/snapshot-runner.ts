// ─── compare/snapshot-runner.ts ───────────────────────────────────────────────
// Main-thread launcher for snapshot.worker. One worker per file (web-ifc memory
// is released by terminating it); files of a set run with bounded concurrency
// so a weekly delivery of 8 IFCs does not open 8 WASM heaps at once.

import type { ModelSnapshot } from './types'
import type { SnapshotInMsg, SnapshotOutMsg } from '../../workers/snapshot.worker'

const WATCHDOG_MS = 180_000

export interface SnapshotJob {
  fileName: string
  buffer: ArrayBuffer | Uint8Array
  geometry?: boolean
}

export function snapshotIfc(
  job: SnapshotJob,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<ModelSnapshot> {
  // Copy: the transfer detaches, and the registry's buffer must stay intact.
  const buffer = job.buffer instanceof Uint8Array ? job.buffer.slice().buffer : job.buffer.slice(0)
  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/snapshot.worker.ts', import.meta.url), { type: 'module' })
    let watchdog: ReturnType<typeof setTimeout> | null = null
    let done = false
    const settle = (fn: () => void): void => {
      if (done) return
      done = true
      if (watchdog) clearTimeout(watchdog)
      worker.terminate()
      fn()
    }
    const arm = (): void => {
      if (watchdog) clearTimeout(watchdog)
      watchdog = setTimeout(() => settle(() => reject(new Error(`timeout reading ${job.fileName}`))), WATCHDOG_MS)
    }
    signal?.addEventListener('abort', () => settle(() => reject(new DOMException('aborted', 'AbortError'))), { once: true })
    worker.onmessage = (e: MessageEvent<SnapshotOutMsg>): void => {
      const m = e.data
      if (!m || m.id !== id) return
      arm()
      if (m.type === 'progress') onProgress?.(m.pct)
      else if (m.type === 'result') settle(() => resolve(m.snapshot))
      else settle(() => reject(new Error(m.message)))
    }
    worker.onerror = (e): void => settle(() => reject(new Error(e.message || 'snapshot worker failed to start')))
    arm()
    const msg: SnapshotInMsg = {
      type: 'snapshot', id, buffer,
      meta: { id: crypto.randomUUID(), fileName: job.fileName, sourceBytes: buffer.byteLength, geometry: job.geometry !== false },
    }
    worker.postMessage(msg, [buffer])
  })
}

/** Snapshot several files, `concurrency` at a time. Progress is per file. */
export async function snapshotMany(
  jobs: readonly SnapshotJob[],
  onProgress?: (fileName: string, pct: number) => void,
  signal?: AbortSignal,
  concurrency = 2,
): Promise<ModelSnapshot[]> {
  const out: ModelSnapshot[] = new Array(jobs.length)
  let next = 0
  const lane = async (): Promise<void> => {
    while (next < jobs.length) {
      const i = next++
      out[i] = await snapshotIfc(jobs[i], (p) => onProgress?.(jobs[i].fileName, p), signal)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, lane))
  return out
}
