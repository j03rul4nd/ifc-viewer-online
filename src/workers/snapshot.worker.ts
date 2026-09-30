// ─── snapshot.worker.ts ───────────────────────────────────────────────────────
// Reads one IFC into a ModelSnapshot off the main thread (version comparison).
// One snapshot per worker lifetime; every request gets exactly one `result` or
// one `error` back — the runner has a watchdog, not a second chance.

import { IfcAPI } from 'web-ifc'
import { buildSnapshot, type SnapshotMeta } from '../lib/compare/snapshot'
import type { ModelSnapshot } from '../lib/compare/types'

// Single-threaded WASM (nested pthreads fail inside a worker) — same as ids.worker.
;((): void => {
  const _orig = IfcAPI.prototype.Init
  IfcAPI.prototype.Init = function (locateFile) { return _orig.call(this, locateFile, true) }
})()

export type SnapshotInMsg = { type: 'snapshot'; id: string; buffer: ArrayBuffer; meta: SnapshotMeta }
export type SnapshotOutMsg =
  | { type: 'progress'; id: string; pct: number }
  | { type: 'result'; id: string; snapshot: ModelSnapshot }
  | { type: 'error'; id: string; message: string }

const post = (m: SnapshotOutMsg): void => { (self as unknown as Worker).postMessage(m) }
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

let started = false

async function run(msg: SnapshotInMsg): Promise<void> {
  const { id } = msg
  const api = new IfcAPI()
  let modelId = -1
  let lastPost = 0
  const progress = (pct: number): void => {
    const now = Date.now()
    if (now - lastPost < 100 && pct < 100) return
    lastPost = now
    post({ type: 'progress', id, pct: Math.max(0, Math.min(100, Math.round(pct))) })
  }
  try {
    api.SetWasmPath(import.meta.env.DEV ? `${import.meta.env.BASE_URL}node_modules/web-ifc/` : import.meta.env.BASE_URL)
    await api.Init()
    progress(5)
    modelId = api.OpenModel(new Uint8Array(msg.buffer))
    progress(15)
    const geoShare = msg.meta.geometry ? 0.3 : 0
    const snapshot = await buildSnapshot(api, modelId, msg.meta, {
      // gather reports 20..75 on the IDS scale → remap to 15..(100 − geometry share)
      onProgress: (p) => progress(15 + ((p - 20) / 55) * (85 - geoShare * 100)),
      onGeometryProgress: (f) => progress(100 - geoShare * 100 + f * geoShare * 100),
      yieldNow: tick,
    })
    post({ type: 'result', id, snapshot })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    post({ type: 'error', id, message: /memory|alloc|abort\(/i.test(message) ? `out-of-memory: ${message}` : message })
  } finally {
    try { if (modelId >= 0) api.CloseModel(modelId) } catch { /* ignore */ }
  }
}

self.onmessage = (e: MessageEvent<SnapshotInMsg>): void => {
  const msg = e.data
  if (!msg || msg.type !== 'snapshot' || typeof msg.id !== 'string' || !(msg.buffer instanceof ArrayBuffer)) return
  if (started) { post({ type: 'error', id: msg.id, message: 'snapshot worker already used' }); return }
  started = true
  void run(msg).catch((err: unknown) => post({ type: 'error', id: msg.id, message: String(err) }))
}

export {}
