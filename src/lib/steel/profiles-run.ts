// Main-thread side of the geometry profile reader: finds the model's IFC
// bytes (registry, else the OPFS cache) and asks the worker. Any failure,
// an abort, or a model with no IFC bytes (.frag) → null, never an error.

import { modelRegistry } from '../model-registry'
import { cacheRepo } from '../cache-repository'
import type { GeometryInfo } from './profiles'

/** Same ceiling as the browser auto-fix: beyond this the text is too big. */
const LIMIT_BYTES = 300 * 1024 * 1024

async function ifcBytesOf(modelId: string): Promise<ArrayBuffer | null> {
  const entry = modelRegistry.get(modelId)
  if (!entry) return null
  if (entry.ifcBuffer && entry.ifcBuffer.byteLength > 0) return entry.ifcBuffer
  if (!entry.opfsCacheKey || !cacheRepo.isAvailable()) return null
  const r = await cacheRepo.findIfcBuffer(entry.opfsCacheKey)
  return r.ok ? r.value : null
}

type Reply = { id: string; ok: boolean; entries?: Array<[number, GeometryInfo]> }

/** Minimal worker surface, so the protocol can be tested with a fake. */
export interface WorkerLike {
  onmessage: ((e: MessageEvent<Reply>) => void) | null
  onerror: ((e: unknown) => void) | null
  onmessageerror: ((e: unknown) => void) | null
  postMessage(msg: unknown, transfer: Transferable[]): void
  terminate(): void
}

const makeWorker = (): WorkerLike =>
  new Worker(new URL('../../workers/steel-profiles.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike

/**
 * Ask a worker for the geometry of `buffer`. The buffer is copied and the copy
 * transferred (the registry keeps its own). Abort → terminate, resolve null.
 */
export function askWorker(buffer: ArrayBuffer, signal?: AbortSignal, create: () => WorkerLike = makeWorker): Promise<Map<number, GeometryInfo> | null> {
  if (signal?.aborted) return Promise.resolve(null)
  const worker = create()
  const id = crypto.randomUUID()
  return new Promise((resolve) => {
    let settled = false
    const finish = (v: Map<number, GeometryInfo> | null) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null
      worker.terminate()
      resolve(v)
    }
    const onAbort = () => finish(null)
    signal?.addEventListener('abort', onAbort, { once: true })
    worker.onmessage = (e) => {
      if (e.data?.id !== id) return
      finish(e.data.ok && e.data.entries ? new Map(e.data.entries) : null)
    }
    worker.onerror = () => finish(null)
    worker.onmessageerror = () => finish(null)
    const copy = buffer.slice(0)
    worker.postMessage({ id, buffer: copy }, [copy])
  })
}

export async function geometryProfiles(modelId: string, signal?: AbortSignal): Promise<Map<number, GeometryInfo> | null> {
  try {
    const buffer = await ifcBytesOf(modelId)
    if (!buffer || buffer.byteLength === 0 || buffer.byteLength > LIMIT_BYTES) return null
    return await askWorker(buffer, signal)
  } catch {
    return null
  }
}
