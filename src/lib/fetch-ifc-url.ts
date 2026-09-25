// ─── fetch-ifc-url.ts ─────────────────────────────────────────────────────────
// Download a public file from an arbitrary URL into a File the normal loader
// pipeline can consume. Streams the response so callers can show a progress bar.
// `fetchIfcFromUrl` produces a guaranteed ".ifc"-named File (the IFC loader
// rejects other names); `fetchFileFromUrl` keeps the URL's own name and
// extension, which is what the point cloud and mesh readers route on.
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

/**
 * A safe filename for a download that keeps the URL's own extension.
 *
 * The name comes from the URL's PATH, never from the raw string: a signed or
 * versioned URL ("…/scan.copc.laz?X-Amz-Signature=…") used to be named with
 * `url.split('/').pop()`, which kept the query — ".laz?x-amz-…" is no
 * extension any reader knows, so the scan failed as unsupported, and a glTF's
 * "model.bin?sig" sidecar never matched the "model.bin" its JSON references.
 */
export function deriveFileName(hint: string | undefined, parsed: URL, fallback: string): string {
  let name = (hint ?? '').trim()
  // A data: URL's "path" is its payload, and a blob: URL's is an opaque id.
  if (!name && (parsed.protocol === 'data:' || parsed.protocol === 'blob:')) return fallback
  if (!name) {
    try {
      name = decodeURIComponent(parsed.pathname.split('/').pop() ?? '').trim()
    } catch {
      // A malformed escape: the raw segment is still a better name than none.
      name = (parsed.pathname.split('/').pop() ?? '').trim()
    }
  }
  name = name.replace(/[\\/?:*"<>|]+/g, '_').trim()
  return name || fallback
}

export interface FileFetchOptions {
  /** Explicit name (the host's, the demo's). Default: derived from the URL path. */
  fileName?: string
  /** Name when neither the hint nor the URL yields one. */
  fallbackName: string
  /** MIME type of the File. */
  type?: string
  /** What the CORS error calls the resource ("IFC", "file"). */
  what?: string
  /**
   * HTTP cache mode. Default 'force-cache' (demos, deep links: immutable);
   * a host's URL is fetched with 'default' so a changed file is revalidated.
   */
  cache?: RequestCache
  signal?: AbortSignal
  onProgress?: (p: UrlFetchProgress) => void
}

/**
 * Stream a URL into a File. Rejects with an `IfcUrlFetchError` whose message
 * the loading adapters classify (HTTP status, CORS / network, empty body,
 * refused scheme); an abort rejects with the signal's own error.
 */
export async function fetchFileFromUrl(url: string, opts: FileFetchOptions): Promise<File> {
  // data: and blob: too: a host handing a mesh or a scan over as a data URL
  // (or an object URL of its own page) used to work through a plain fetch().
  // The IFC path keeps refusing them — an embed link must be a real URL.
  const parsed = parseDownloadUrl(url, true)
  const res = await startDownload(parsed, opts.signal, opts.what ?? 'file', opts.cache ?? 'force-cache')
  const { parts, size } = await readBody(res, opts)
  if (size === 0) throw new IfcUrlFetchError('The downloaded model is empty.')
  return new File(parts, deriveFileName(opts.fileName, parsed, opts.fallbackName), {
    ...(opts.type ? { type: opts.type } : {}),
    lastModified: lastModifiedFromResponse(res),
  })
}

export async function fetchIfcFromUrl(
  url: string,
  fileNameHint?: string,
  opts: { signal?: AbortSignal; onProgress?: (p: UrlFetchProgress) => void } = {},
): Promise<File> {
  const parsed = parseDownloadUrl(url, false)
  const res = await startDownload(parsed, opts.signal, 'IFC', 'force-cache')
  const { parts, size } = await readBody(res, opts)
  if (size === 0) throw new IfcUrlFetchError('The downloaded model is empty.')
  return new File(parts, deriveIfcFileName(fileNameHint, parsed), {
    type: 'application/x-step',
    lastModified: lastModifiedFromResponse(res),
  })
}

function parseDownloadUrl(url: string, allowLocal: boolean): URL {
  let parsed: URL
  try {
    parsed = new URL(url, window.location.href)
  } catch {
    throw new IfcUrlFetchError(`Invalid model URL: ${url}`)
  }
  const local = allowLocal && (parsed.protocol === 'data:' || parsed.protocol === 'blob:')
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && !local) {
    throw new IfcUrlFetchError(
      `Unsupported URL scheme "${parsed.protocol}". Only http(s) URLs can be embedded.`,
    )
  }
  return parsed
}

async function startDownload(parsed: URL, signal: AbortSignal | undefined, what: string, cache: RequestCache): Promise<Response> {
  let res: Response
  try {
    // A data: or blob: URL takes no CORS mode or cache mode of its own.
    const local = parsed.protocol === 'data:' || parsed.protocol === 'blob:'
    res = await fetch(parsed.toString(), local ? { signal } : { signal, cache, mode: 'cors' })
  } catch (err) {
    if (signal?.aborted) throw err
    // A network-level failure here is almost always CORS or an unreachable host.
    throw new IfcUrlFetchError(
      `Could not fetch the ${what} from ${parsed.host}. The host must allow cross-origin ` +
      `requests (CORS) for the model URL to be embeddable.`,
      err,
    )
  }
  if (!res.ok) {
    throw new IfcUrlFetchError(`Failed to download model: HTTP ${res.status} ${res.statusText}`)
  }
  return res
}

async function readBody(
  res: Response,
  opts: { signal?: AbortSignal; onProgress?: (p: UrlFetchProgress) => void },
): Promise<{ parts: BlobPart[]; size: number }> {
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

  return { parts, size }
}
