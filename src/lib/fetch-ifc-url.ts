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

  let buf: ArrayBuffer
  if (!res.body || !opts.onProgress) {
    buf = await res.arrayBuffer()
    opts.onProgress?.({ ratio: 1, receivedBytes: buf.byteLength, totalBytes: total })
  } else {
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
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
    const out = new Uint8Array(received)
    let offset = 0
    for (const c of chunks) {
      out.set(c, offset)
      offset += c.byteLength
    }
    buf = out.buffer
  }

  if (buf.byteLength === 0) throw new IfcUrlFetchError('The downloaded model is empty.')

  return new File([buf], deriveIfcFileName(fileNameHint, parsed), { type: 'application/x-step' })
}
