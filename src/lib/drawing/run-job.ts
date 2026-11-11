// ─── Run a drawing job in the worker ──────────────────────────────────────────
// Falls back to this thread where a module worker can't start: slower, same result.

import { DxfError } from './dxf-parse'
import { runJob, type DrawingJob } from './drawing.worker'

let worker: Worker | null = null
let broken = false
let seq = 1
const waiting = new Map<number, { resolve(v: unknown): void; reject(e: unknown): void }>()

function start(): Worker | null {
  if (worker || broken || typeof Worker === 'undefined') return worker
  try {
    worker = new Worker(new URL('./drawing.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      const w = waiting.get(e.data.id)
      if (!w) return
      waiting.delete(e.data.id)
      if (!e.data.error) { w.resolve(e.data.result); return }
      w.reject(e.data.error.code ? new DxfError(e.data.error.code, e.data.error.message) : new Error(e.data.error.message))
    }
    worker.onerror = () => {
      broken = true; worker = null
      for (const w of waiting.values()) w.reject(new Error('worker'))
      waiting.clear()
    }
  } catch { broken = true; worker = null }
  return worker
}

export async function runDrawingJob<T>(job: DrawingJob): Promise<T> {
  const w = start()
  if (!w) return runJob(job) as T
  try {
    return await new Promise<T>((resolve, reject) => {
      const id = seq++
      waiting.set(id, { resolve: resolve as (v: unknown) => void, reject })
      w.postMessage({ id, job })
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'worker') return runJob(job) as T
    throw err
  }
}
