// ─── fetch-ifc-url.ts ─────────────────────────────────────────────────────────
// Download a public IFC file from an arbitrary URL into a File the normal loader
// pipeline can consume. Streams the response so callers can show a progress bar,
// and produces a guaranteed ".ifc"-named File (the loader rejects other names).
//
// Purely client-side: the browser fetches the URL directly, so the host must
// allow cross-origin reads (CORS). No data ever touches our servers.

export interface UrlFetchProgress {
  /** 0–1, or null when the total size is unknown (no Content-Length). */
  ratio: number | null
  receivedBytes: number
  totalBytes: number | null
}

export class IfcUrlFetchError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'IfcUrlFetchError'
  }
}

/**
 * `lastModified` for a File built from a download: the response's
 * `Last-Modified`, or 0 when the server sends none (or an unparseable one).
 *
 * Why not "now", which is what `new File([buf], name)` does by default: the
 * file's lastModified is part of the OPFS cache key (`buildCacheKey`), and that
 * same key names the saved georef placement and the cached validation results.
 * With "now" every fetch of the same URL got a new key — the cache never hit,
 * OPFS gained a duplicate entry per load, and a placement saved on a URL/demo
 * model was never found again. A server-stated date (or a constant 0) keeps the
 * key stable across sessions.
 *
 * What that gives up is noticing a changed file by its key alone, which matters
 * mostly for the 0 case (same name and size, new bytes). The cache entry stores
 * the content fingerprint and a lookup whose fingerprint differs is evicted as
 * stale (cacheRepo.findEntry), so a changed file still re-converts.
 *
 * `Last-Modified` is a CORS-safelisted response header: cross-origin hosts
 * expose it without `Access-Control-Expose-Headers`.
 */
export function lastModifiedFromResponse(res: { headers: Pick<Headers, 'get'> }): number {
  const raw = res.headers.get('Last-Modified')
  if (!raw) return 0
  const t = Date.parse(raw)
  return Number.isFinite(t) ? t : 0
}

/** Turn a URL/hint into a safe filename that ends in .ifc. */
export function deriveIfcFileName(hint: string | undefined, parsed: URL): string {
  let name = (hint ?? '').trim()
  if (!name) {
    name = decodeURIComponent(parsed.pathname.split('/').pop() ?? '').trim()
  }
  // Drop any query-like leftovers and path separators.
  name = name.replace(/[\\/?:*"<>|]+/g, '_').trim()
  if (!name) name = 'model.ifc'
  if (!name.toLowerCase().endsWith('.ifc')) name += '.ifc'
  return name
}

export async function fetchIfcFromUrl(
  url: string,
  fileNameHint?: string,
  opts: { signal?: AbortSignal; onProgress?: (p: UrlFetchProgress) => void } = {},
): Promise<File> {
  let parsed: URL
  try {
    parsed = new URL(url, window.location.href)
  } catch {
    throw new IfcUrlFetchError(`Invalid model URL: ${url}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new IfcUrlFetchError(
      `Unsupported URL scheme "${parsed.protocol}". Only http(s) URLs can be embedded.`,
    )
  }

  let res: Response
  try {
    res = await fetch(parsed.toString(), { signal: opts.signal, cache: 'force-cache', mode: 'cors' })
  } catch (err) {
    if (opts.signal?.aborted) throw err
    // A network-level failure here is almost always CORS or an unreachable host.
    throw new IfcUrlFetchError(
      `Could not fetch the IFC from ${parsed.host}. The host must allow cross-origin ` +
      `requests (CORS) for the model URL to be embeddable.`,
      err,
    )
  }
  if (!res.ok) {
    throw new IfcUrlFetchError(`Failed to download model: HTTP ${res.status} ${res.statusText}`)
  }

  const lenHeader = res.headers.get('Content-Length')
  const total = lenHeader ? Number(lenHeader) : null

  // The File is built from the pieces as they arrived, never from one
  // concatenated buffer. A concatenation is a second full copy of the model on
  // the main heap, alive next to the chunks while `new File` copies both into
  // Blob storage: about 3× the file at the peak of a large download, and there
  // can be two downloads at once. Building from the chunks (or, without
  // progress, from the Blob the browser already holds) leaves the chunks plus
  // the File at worst, and the chunks are garbage as soon as this returns.
  let parts: BlobPart[]
  let size: number
  if (!res.body || !opts.onProgress) {
    const blob = await res.blob()
    parts = [blob]
    size = blob.size
    opts.onProgress?.({ ratio: 1, receivedBytes: size, totalBytes: total })
  } else {
    const reader = res.body.getReader()
    const chunks: BlobPart[] = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (opts.signal?.aborted) throw new IfcUrlFetchError('Aborted')
      if (value) {
        chunks.push(value)
        received += value.byteLength
        opts.onProgress({
          ratio: total ? Math.min(received / total, 1) : null,
          receivedBytes: received,
          totalBytes: total,
        })
      }
    }
    parts = chunks
    size = received
  }

  if (size === 0) throw new IfcUrlFetchError('The downloaded model is empty.')

  return new File(parts, deriveIfcFileName(fileNameHint, parsed), {
    type: 'application/x-step',
    lastModified: lastModifiedFromResponse(res),
  })
}
