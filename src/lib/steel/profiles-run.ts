// Main-thread side of the geometry profile reader: finds the model's IFC
// bytes (registry, else the OPFS cache) and asks the worker. Any failure or
// a model with no IFC bytes (.frag) → null, never an error.

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

export async function geometryProfiles(modelId: string): Promise<Map<number, GeometryInfo> | null> {
  try {
    const buffer = await ifcBytesOf(modelId)
    if (!buffer || buffer.byteLength === 0 || buffer.byteLength > LIMIT_BYTES) return null
    const worker = new Worker(new URL('../../workers/steel-profiles.worker.ts', import.meta.url), { type: 'module' })
    const id = crypto.randomUUID()
    return await new Promise((resolve) => {
      worker.onmessage = (e: MessageEvent<{ id: string; ok: boolean; entries?: Array<[number, GeometryInfo]> }>) => {
        if (e.data.id !== id) return
        worker.terminate()
        resolve(e.data.ok && e.data.entries ? new Map(e.data.entries) : null)
      }
      worker.onerror = () => { worker.terminate(); resolve(null) }
      worker.postMessage({ id, buffer: buffer.slice(0) })
    })
  } catch {
    return null
  }
}
