// ─── Demo model fetcher ───────────────────────────────────────────────────────
// Downloads a demo IFC over the network into a File the loader can consume.
// Streams the response so the gallery can show a real download progress bar, and
// transparently falls back to a secondary URL if the primary host is down.

import type { DemoModel } from './models'
import { lastModifiedFromResponse } from '../lib/fetch-ifc-url'

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

interface Fetched {
  /**
   * The body as it arrived: the streamed chunks, or the one Blob of a plain
   * read. Never concatenated here — `new File(parts)` copies them into Blob
   * storage once, where a joined buffer would be a second full copy of the
   * model on the main heap (see fetchIfcFromUrl).
   */
  parts: BlobPart[]
  size: number
  /** From `Last-Modified`, else 0 — see lastModifiedFromResponse. */
  lastModified: number
}

async function fetchOne(
  url: string,
  fallbackTotal: number,
  signal: AbortSignal | undefined,
  onProgress?: (p: FetchProgress) => void,
): Promise<Fetched> {
  const res = await fetch(url, { signal, cache: 'force-cache' })
  if (!res.ok) throw new DemoFetchError(`HTTP ${res.status} ${res.statusText}`)

  const lenHeader = res.headers.get('Content-Length')
  const total = lenHeader ? Number(lenHeader) : fallbackTotal || null
  const lastModified = lastModifiedFromResponse(res)

  // Stream when possible so the UI can report progress; fall back to a plain
  // blob() read for browsers/responses without a readable body.
  if (!res.body || !onProgress) {
    const blob = await res.blob()
    onProgress?.({ ratio: 1, receivedBytes: blob.size, totalBytes: total })
    return { parts: [blob], size: blob.size, lastModified }
  }

  const reader = res.body.getReader()
  const chunks: BlobPart[] = []
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
  return { parts: chunks, size: received, lastModified }
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
      const { parts, size, lastModified } = await fetchOne(url, model.sizeBytes, opts.signal, opts.onProgress)
      if (size === 0) throw new DemoFetchError('Empty response')
      // A stable lastModified keeps the OPFS cache key (and the placement /
      // validation results keyed by it) the same on every visit, so a repeat
      // demo load is a cache hit instead of a re-parse plus a duplicate entry.
      // The primary and the fallback host may disagree on the date; that costs
      // one extra conversion when the host changes, never a stale model (the
      // entry's content fingerprint is checked on lookup).
      return new File(parts, model.fileName, { type: '', lastModified })
    } catch (err) {
      if (opts.signal?.aborted) throw err
      lastErr = err
    }
  }
  throw new DemoFetchError(`Could not load "${model.name}" from any source`, lastErr)
}
