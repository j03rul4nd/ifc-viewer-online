// ─── Demo model fetcher ───────────────────────────────────────────────────────
// Downloads a demo IFC over the network into a File the loader can consume.
// Streams the response so the gallery can show a real download progress bar, and
// transparently falls back to a secondary URL if the primary host is down.

import type { DemoModel } from './models'

export interface FetchProgress {
  /** 0–1, or null when total size is unknown (no Content-Length). */
  ratio: number | null
  receivedBytes: number
  totalBytes: number | null
}

export class DemoFetchError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'DemoFetchError'
  }
}

async function fetchOne(
  url: string,
  fallbackTotal: number,
  signal: AbortSignal | undefined,
  onProgress?: (p: FetchProgress) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal, cache: 'force-cache' })
  if (!res.ok) throw new DemoFetchError(`HTTP ${res.status} ${res.statusText}`)

  const lenHeader = res.headers.get('Content-Length')
  const total = lenHeader ? Number(lenHeader) : fallbackTotal || null

  // Stream when possible so the UI can report progress; fall back to a plain
  // arrayBuffer() read for browsers/responses without a readable body.
  if (!res.body || !onProgress) {
    const buf = await res.arrayBuffer()
    onProgress?.({ ratio: 1, receivedBytes: buf.byteLength, totalBytes: total })
    return buf
  }

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      received += value.byteLength
      onProgress({ ratio: total ? Math.min(received / total, 1) : null, receivedBytes: received, totalBytes: total })
    }
  }

  const out = new Uint8Array(received)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out.buffer
}

/**
 * Fetch a demo model as a File, trying `ifcUrl` then `fallbackUrl`.
 * Throws DemoFetchError if every source fails.
 */
export async function fetchDemoModel(
  model: DemoModel,
  opts: { signal?: AbortSignal; onProgress?: (p: FetchProgress) => void } = {},
): Promise<File> {
  const urls = [model.ifcUrl, model.fallbackUrl].filter((u): u is string => Boolean(u))
  let lastErr: unknown
  for (const url of urls) {
    try {
      const buf = await fetchOne(url, model.sizeBytes, opts.signal, opts.onProgress)
      if (buf.byteLength === 0) throw new DemoFetchError('Empty response')
      return new File([buf], model.fileName, { type: '' })
    } catch (err) {
      if (opts.signal?.aborted) throw err
      lastErr = err
    }
  }
  throw new DemoFetchError(`Could not load "${model.name}" from any source`, lastErr)
}
