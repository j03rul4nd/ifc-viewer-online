// @vitest-environment node
// ─── fetch-ifc-url.test.ts ────────────────────────────────────────────────────
// A fetched model must come out as a File whose lastModified is the SAME on
// every visit — it is part of the OPFS cache key, which also names the saved
// georef placement and the cached validation results. It used to be "now", so
// URL and demo loads never hit the cache and forgot their placement.
// And it must be built from the body as it arrived (the chunks, or the Blob):
// joining the chunks first was one more full copy of the model at the peak.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchIfcFromUrl, lastModifiedFromResponse, IfcUrlFetchError } from './fetch-ifc-url'
import { fetchDemoModel, DemoFetchError } from '../demo-models/fetchDemoModel'
import type { DemoModel } from '../demo-models/models'
import { buildCacheKey } from './opfs-cache'

const IFC_BYTES = new TextEncoder().encode('ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n')
const LAST_MODIFIED = 'Wed, 21 Oct 2025 07:28:00 GMT'

function respond(headers: Record<string, string> = {}, status = 200): Response {
  return new Response(IFC_BYTES.slice(), {
    status,
    headers: { 'Content-Length': String(IFC_BYTES.byteLength), ...headers },
  })
}

/** A body that arrives in these pieces, like a real network read. */
function streamed(chunks: Uint8Array[], headers: Record<string, string> = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const chunk of chunks) c.enqueue(chunk)
      c.close()
    },
  })
  return new Response(body, { status: 200, headers })
}

const PIECES = [IFC_BYTES.slice(0, 10), IFC_BYTES.slice(10, 30), IFC_BYTES.slice(30)]

/**
 * Record what every `new File(parts)` receives. The point of building from the
 * chunks is that no joined copy of the whole body is ever made, and a joined
 * copy would show up here as a single part the size of the file.
 */
function captureFileParts(): BlobPart[][] {
  const seen: BlobPart[][] = []
  const RealFile = File
  vi.stubGlobal('File', class extends RealFile {
    constructor(parts: BlobPart[], name: string, opts?: FilePropertyBag) {
      seen.push(parts)
      super(parts, name, opts)
    }
  })
  return seen
}

async function bytesOf(file: File): Promise<number[]> {
  return Array.from(new Uint8Array(await file.arrayBuffer()))
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('window', { location: { href: 'https://viewer.example/app' } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('lastModifiedFromResponse', () => {
  it('parses a Last-Modified date', () => {
    expect(lastModifiedFromResponse(respond({ 'Last-Modified': LAST_MODIFIED }))).toBe(Date.parse(LAST_MODIFIED))
  })

  it('is 0 without the header or with an unparseable one', () => {
    expect(lastModifiedFromResponse(respond())).toBe(0)
    expect(lastModifiedFromResponse(respond({ 'Last-Modified': 'yesterday-ish' }))).toBe(0)
  })
})

describe('fetchIfcFromUrl', () => {
  it('stamps the File with the server Last-Modified', async () => {
    fetchMock.mockResolvedValue(respond({ 'Last-Modified': LAST_MODIFIED }))
    const file = await fetchIfcFromUrl('https://models.example/tower.ifc')
    expect(file.name).toBe('tower.ifc')
    expect(file.lastModified).toBe(Date.parse(LAST_MODIFIED))
    expect(file.size).toBe(IFC_BYTES.byteLength)
  })

  it('uses 0 when the server sends no Last-Modified, so the cache key is stable', async () => {
    fetchMock.mockImplementation(async () => respond())
    const a = await fetchIfcFromUrl('https://models.example/tower.ifc')
    await new Promise((r) => setTimeout(r, 5))
    const b = await fetchIfcFromUrl('https://models.example/tower.ifc')
    expect(a.lastModified).toBe(0)
    expect(buildCacheKey(a)).toBe(buildCacheKey(b))
  })

  it('keeps the stamp on the streaming (progress) path and still reports progress', async () => {
    fetchMock.mockResolvedValue(respond({ 'Last-Modified': LAST_MODIFIED }))
    const onProgress = vi.fn()
    const file = await fetchIfcFromUrl('https://models.example/a/b/site.ifc', undefined, { onProgress })
    expect(file.lastModified).toBe(Date.parse(LAST_MODIFIED))
    expect(onProgress).toHaveBeenCalled()
    expect(onProgress.mock.calls[onProgress.mock.calls.length - 1][0]).toMatchObject({
      ratio: 1,
      receivedBytes: IFC_BYTES.byteLength,
    })
  })

  it('builds the File from the streamed chunks, never from one joined buffer', async () => {
    fetchMock.mockResolvedValue(streamed(PIECES, { 'Content-Length': String(IFC_BYTES.byteLength) }))
    const seen = captureFileParts()
    const onProgress = vi.fn()
    const file = await fetchIfcFromUrl('https://models.example/tower.ifc', undefined, { onProgress })

    expect(seen).toHaveLength(1)
    expect(seen[0]).toHaveLength(PIECES.length)
    expect(seen[0].map((p) => (p as Uint8Array).byteLength)).toEqual(PIECES.map((p) => p.byteLength))
    expect(await bytesOf(file)).toEqual(Array.from(IFC_BYTES))
    expect(file.type).toBe('application/x-step')
    expect(onProgress).toHaveBeenCalledTimes(PIECES.length)
  })

  it('without progress, wraps the response Blob instead of an ArrayBuffer copy', async () => {
    fetchMock.mockResolvedValue(respond({ 'Last-Modified': LAST_MODIFIED }))
    const seen = captureFileParts()
    const file = await fetchIfcFromUrl('https://models.example/tower.ifc')
    expect(seen[0]).toHaveLength(1)
    expect(seen[0][0]).toBeInstanceOf(Blob)
    expect(await bytesOf(file)).toEqual(Array.from(IFC_BYTES))
    expect(file.lastModified).toBe(Date.parse(LAST_MODIFIED))
  })

  it('still refuses an empty body, streaming or not', async () => {
    fetchMock.mockImplementation(async () => new Response(new Uint8Array(0)))
    await expect(fetchIfcFromUrl('https://models.example/empty.ifc')).rejects.toThrow(/empty/)
    fetchMock.mockImplementation(async () => streamed([]))
    await expect(fetchIfcFromUrl('https://models.example/empty.ifc', undefined, { onProgress: () => {} }))
      .rejects.toThrow(/empty/)
  })

  it('passes the abort signal through and keeps its error contract', async () => {
    fetchMock.mockResolvedValue(respond({}, 404))
    const ctrl = new AbortController()
    await expect(fetchIfcFromUrl('https://models.example/missing.ifc', undefined, { signal: ctrl.signal }))
      .rejects.toBeInstanceOf(IfcUrlFetchError)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal: ctrl.signal })
  })
})

describe('fetchDemoModel', () => {
  const demo = {
    id: 'demo',
    name: 'Demo',
    fileName: 'demo.ifc',
    ifcUrl: 'https://primary.example/demo.ifc',
    fallbackUrl: 'https://fallback.example/demo.ifc',
    sizeBytes: IFC_BYTES.byteLength,
  } as DemoModel

  it('stamps the File with Last-Modified, streaming or not', async () => {
    fetchMock.mockImplementation(async () => respond({ 'Last-Modified': LAST_MODIFIED }))
    const plain = await fetchDemoModel(demo)
    const streamed = await fetchDemoModel(demo, { onProgress: () => {} })
    expect(plain.lastModified).toBe(Date.parse(LAST_MODIFIED))
    expect(streamed.lastModified).toBe(Date.parse(LAST_MODIFIED))
    expect(plain.name).toBe('demo.ifc')
  })

  it('uses 0 without the header, and the fallback header when the primary fails', async () => {
    fetchMock.mockImplementationOnce(async () => respond())
    expect((await fetchDemoModel(demo)).lastModified).toBe(0)

    fetchMock
      .mockImplementationOnce(async () => respond({}, 503))
      .mockImplementationOnce(async () => respond({ 'Last-Modified': LAST_MODIFIED }))
    const file = await fetchDemoModel(demo)
    expect(fetchMock).toHaveBeenLastCalledWith(demo.fallbackUrl, expect.anything())
    expect(file.lastModified).toBe(Date.parse(LAST_MODIFIED))
  })

  it('builds the File from the streamed chunks, or the response Blob', async () => {
    const seen = captureFileParts()
    fetchMock.mockImplementationOnce(async () => streamed(PIECES))
    const streamedFile = await fetchDemoModel(demo, { onProgress: () => {} })
    expect(seen[0].map((p) => (p as Uint8Array).byteLength)).toEqual(PIECES.map((p) => p.byteLength))
    expect(await bytesOf(streamedFile)).toEqual(Array.from(IFC_BYTES))
    expect(streamedFile.name).toBe('demo.ifc')

    fetchMock.mockImplementationOnce(async () => respond())
    const plain = await fetchDemoModel(demo)
    expect(seen[1]).toHaveLength(1)
    expect(seen[1][0]).toBeInstanceOf(Blob)
    expect(await bytesOf(plain)).toEqual(Array.from(IFC_BYTES))
  })

  it('treats an empty body as a failed source and tries the fallback', async () => {
    fetchMock
      .mockImplementationOnce(async () => streamed([]))
      .mockImplementationOnce(async () => streamed(PIECES))
    const file = await fetchDemoModel(demo, { onProgress: () => {} })
    expect(fetchMock).toHaveBeenLastCalledWith(demo.fallbackUrl, expect.anything())
    expect(file.size).toBe(IFC_BYTES.byteLength)

    fetchMock.mockImplementation(async () => new Response(new Uint8Array(0)))
    await expect(fetchDemoModel(demo)).rejects.toBeInstanceOf(DemoFetchError)
  })
})
