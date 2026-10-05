// ─── paint-pool ───────────────────────────────────────────────────────────────
// A small pool of basemap-paint workers (see that file for why they exist).
//
// Two workers at most: tiles arrive in bursts of a few, painting is ~10–35 ms
// each, and every extra worker holds its own copy of the decoded z14 tiles.
// Requests are routed by content tile, so the regions overzoomed from one z14
// tile land on the same worker and share its decoded copy.

import type { PaintRequest, PaintResponse } from '../../../workers/basemap-paint.worker'

export interface PaintPool {
  paint(req: Omit<PaintRequest, 'type' | 'id'>, signal?: AbortSignal): Promise<Extract<PaintResponse, { type: 'painted' }>>
  dispose(): void
}

/** True where the worker path can run (OffscreenCanvas + module workers). */
export function canPaintOffThread(): boolean {
  // DEV switch to compare against the main-thread painter.
  try { if (import.meta.env.DEV && localStorage.getItem('ifc-dev-paint-main')) return false } catch { /* no storage */ }
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
    && typeof createImageBitmap !== 'undefined'
}

export function createPaintPool(size = Math.max(1, Math.min(2, (navigator.hardwareConcurrency ?? 2) - 1))): PaintPool {
  const workers: Worker[] = []
  const pending = new Map<number, { resolve: (r: Extract<PaintResponse, { type: 'painted' }>) => void; reject: (e: Error) => void }>()
  let nextId = 1

  for (let i = 0; i < size; i++) {
    const w = new Worker(new URL('../../../workers/basemap-paint.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<PaintResponse>) => {
      const msg = e.data
      const p = pending.get(msg.id)
      if (!p) { if (msg.type === 'painted') msg.bitmap.close(); return } // aborted meanwhile
      pending.delete(msg.id)
      if (msg.type === 'painted') p.resolve(msg)
      else p.reject(new Error(msg.message))
    }
    workers.push(w)
  }

  return {
    paint(req, signal) {
      const id = nextId++
      // Route by the first content tile: overzoomed siblings share a decode.
      const f = req.frames[0]
      const w = workers[f ? Math.abs((f.x * 31 + f.y) % workers.length) : 0]
      const transfer: Transferable[] = []
      for (const r of req.rasters) for (const p of r.pieces) transfer.push(p.image as ImageBitmap)
      return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }
        pending.set(id, { resolve, reject })
        signal?.addEventListener('abort', () => {
          if (!pending.has(id)) return
          pending.delete(id)
          reject(new DOMException('Aborted', 'AbortError'))
        }, { once: true })
        w.postMessage({ ...req, type: 'paint', id } satisfies PaintRequest, transfer)
      })
    },
    dispose() {
      for (const w of workers) w.terminate()
      workers.length = 0
      for (const p of pending.values()) p.reject(new Error('paint pool disposed'))
      pending.clear()
    },
  }
}
