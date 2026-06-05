// ─── embed-loader.ts ──────────────────────────────────────────────────────────
// Lightweight IFC fetch + parse + load pipeline for embedded blog viewers.
// No Zustand stores, no OPFS, no toast — entirely self-contained.

import type { ViewerAPI } from './viewer'
import type { WorkerOutMessage } from '../workers/ifc-parser.worker'
import type { Category } from '../types'

export type EmbedPhase = 'downloading' | 'parsing' | 'rendering'

export interface EmbedLoadResult {
  categories: Category[]
  elementCount: number
  modelId: string
}

/**
 * Fetch an IFC file from `url`, parse it to Fragments via web worker,
 * and load it into the given ViewerAPI. Progress is reported 0–100 across
 * three phases: downloading (0–45), parsing (45–95), rendering (95–100).
 */
export async function loadIfcForEmbed(
  url: string,
  fileName: string,
  api: ViewerAPI,
  signal: AbortSignal,
  onProgress: (phase: EmbedPhase, pct: number) => void,
): Promise<EmbedLoadResult> {
  // ── 1. Download ─────────────────────────────────────────────────────────────
  const response = await fetch(url, { signal, cache: 'force-cache' })
  if (!response.ok) throw new Error(`Failed to download model: HTTP ${response.status} ${response.statusText}`)

  const total = Number(response.headers.get('Content-Length')) || null
  const chunks: Uint8Array[] = []
  let received = 0

  if (response.body) {
    const reader = response.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (signal.aborted) throw new Error('Aborted')
      if (value) {
        chunks.push(value)
        received += value.byteLength
        onProgress('downloading', total ? Math.min((received / total) * 45, 44) : 22)
      }
    }
  } else {
    const buf = await response.arrayBuffer()
    chunks.push(new Uint8Array(buf))
    received = buf.byteLength
    onProgress('downloading', 44)
  }

  // Reassemble into one contiguous buffer
  const combined = new Uint8Array(received)
  let offset = 0
  for (const c of chunks) { combined.set(c, offset); offset += c.byteLength }

  // ── 2. Parse IFC → Fragments via dedicated web worker ───────────────────────
  const fragmentsBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/ifc-parser.worker.ts', import.meta.url),
      { type: 'module' },
    )

    const id = crypto.randomUUID()

    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data
      if (msg.id !== id) return
      switch (msg.type) {
        case 'progress':
          onProgress('parsing', 45 + (msg.percent / 2))
          break
        case 'result':
          resolve(msg.fragmentsBuffer)
          worker.terminate()
          break
        case 'error':
          reject(new Error(msg.message))
          worker.terminate()
          break
      }
    }

    worker.onerror = (e) => {
      reject(new Error(e.message ?? 'IFC parser worker error'))
      worker.terminate()
    }

    signal.addEventListener('abort', () => {
      worker.terminate()
      reject(new Error('Aborted'))
    }, { once: true })

    // Transfer the buffer zero-copy to the worker
    const transfer = combined.buffer.slice(
      combined.byteOffset,
      combined.byteOffset + combined.byteLength,
    ) as ArrayBuffer
    worker.postMessage({ type: 'parse', id, buffer: transfer, fileName }, [transfer])
  })

  // ── 3. Load fragments into viewer ────────────────────────────────────────────
  onProgress('rendering', 96)
  const result = await api.loadFragments(new Uint8Array(fragmentsBuffer), fileName)

  return {
    categories: result.modelInfo.categories,
    elementCount: result.modelInfo.elementCount,
    modelId: result.modelId,
  }
}
