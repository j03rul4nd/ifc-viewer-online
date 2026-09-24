// @vitest-environment node
// ─── opfs-cache.test.ts ───────────────────────────────────────────────────────
// The OPFS cache has to survive the ways real writes fail: a quota error half
// way through a set, a tab closed between files, a 0-byte file that
// `getFileHandle({ create: true })` leaves behind, a rewrite of an entry that
// already exists, two loads of the same file at once. The mock below behaves
// like OPFS where those failures come from:
//   • getFileHandle({ create: true }) creates an EMPTY file immediately;
//   • a writable stages chunks and only replaces the file on close() (Chrome's
//     swap file) — abort() discards them;
//   • write() keeps a reference to the chunk and reads it on close(), so a
//     caller that resolves before close() and then transfers its ArrayBuffer
//     loses the bytes, exactly the bug the transfer guarantee exists to prevent;
//   • removeEntry of a missing file throws NotFoundError;
//   • writes can be made to fail (QuotaExceededError) or to block, per file.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildCacheKey,
  cacheDirAvailable,
  deleteCacheEntry,
  evictForSpace,
  getCacheBudget,
  listCacheEntries,
  loadCacheEntry,
  loadFromCache,
  loadIfcBuffer,
  saveCacheEntry,
  saveIfcBuffer,
  saveToCache,
  touchCacheEntry,
} from './opfs-cache'
import { cacheRepo } from './cache-repository'
import type { CacheEntry } from '../types'

// ── In-memory OPFS ────────────────────────────────────────────────────────────

type Chunk = Uint8Array | ArrayBuffer | Blob | string

interface StoredFile {
  bytes: Uint8Array
  lastModified: number
}

interface MemoryOpfsOptions {
  quota?: number
}

function notFound(name: string): DOMException {
  return new DOMException(`${name} not found`, 'NotFoundError')
}

async function chunkBytes(chunk: Chunk): Promise<Uint8Array> {
  if (typeof chunk === 'string') return new TextEncoder().encode(chunk)
  if (chunk instanceof Blob) return new Uint8Array(await chunk.arrayBuffer())
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk.slice(0))
  return chunk.slice()
}

function createMemoryOpfs(opts: MemoryOpfsOptions = {}) {
  const files = new Map<string, StoredFile>()
  /** File names in the order their writes committed (close()). */
  const commits: string[] = []
  /** What each write() received, by file name — to prove a Blob went in as a Blob. */
  const chunkKinds = new Map<string, string[]>()
  const failures = new Map<string, () => Error>()
  const blockers = new Map<string, Promise<void>>()
  const hooks = new Map<string, () => void>()
  /** File names whose bytes were read (arrayBuffer / text), in order. */
  const contentReads: string[] = []
  let clock = 1_000_000

  function fileHandle(name: string): FileSystemFileHandle {
    return {
      kind: 'file',
      name,
      getFile: async () => {
        const f = files.get(name)
        if (!f) throw notFound(name)
        // A snapshot like the real one: size and lastModified are free, the
        // bytes cost a read — which is what the stale-content check must avoid.
        const file = new File([f.bytes], name, { lastModified: f.lastModified })
        const arrayBuffer = file.arrayBuffer.bind(file)
        const text = file.text.bind(file)
        file.arrayBuffer = () => { contentReads.push(name); return arrayBuffer() }
        file.text = () => { contentReads.push(name); return text() }
        return file
      },
      createWritable: async () => {
        let staged: Chunk[] = []
        let closed = false
        return {
          write: async (chunk: Chunk) => {
            if (closed) throw new TypeError('stream closed')
            const kinds = chunkKinds.get(name) ?? []
            kinds.push(chunk instanceof Blob ? 'blob'
              : chunk instanceof ArrayBuffer ? 'arraybuffer'
              : typeof chunk === 'string' ? 'string' : 'uint8array')
            chunkKinds.set(name, kinds)
            hooks.get(name)?.()
            const blocker = blockers.get(name)
            if (blocker) await blocker
            const fail = failures.get(name)
            if (fail) throw fail()
            staged.push(chunk)
          },
          close: async () => {
            if (closed) throw new TypeError('stream closed')
            closed = true
            // The commit happens on a later task, and only then are the staged
            // chunks read — a caller that does not await close() and transfers
            // its buffer meanwhile commits a detached (empty) buffer.
            await new Promise<void>((r) => setTimeout(r, 0))
            const parts = await Promise.all(staged.map(chunkBytes))
            const total = parts.reduce((n, p) => n + p.byteLength, 0)
            const out = new Uint8Array(total)
            let o = 0
            for (const p of parts) { out.set(p, o); o += p.byteLength }
            files.set(name, { bytes: out, lastModified: clock })
            commits.push(name)
          },
          abort: async () => {
            closed = true
            staged = []
          },
        } as unknown as FileSystemWritableFileStream
      },
    } as unknown as FileSystemFileHandle
  }

  const dir = {
    kind: 'directory',
    name: 'ifc-cache',
    getFileHandle: async (name: string, o?: { create?: boolean }) => {
      if (!files.has(name)) {
        if (!o?.create) throw notFound(name)
        // Real OPFS: the file exists (empty) from this moment on.
        files.set(name, { bytes: new Uint8Array(0), lastModified: clock })
      }
      return fileHandle(name)
    },
    removeEntry: async (name: string) => {
      if (!files.delete(name)) throw notFound(name)
    },
    [Symbol.asyncIterator]: async function* () {
      for (const name of Array.from(files.keys())) {
        yield [name, fileHandle(name)] as [string, FileSystemFileHandle]
      }
    },
  } as unknown as FileSystemDirectoryHandle

  const root = {
    getDirectoryHandle: async () => dir,
  } as unknown as FileSystemDirectoryHandle

  let usage = 0
  const storage = {
    getDirectory: vi.fn(async () => root),
    estimate: vi.fn(async () => ({ usage, quota: opts.quota ?? 100 * 1024 ** 3 })),
  }

  return {
    files,
    commits,
    chunkKinds,
    contentReads,
    storage,
    /** Make every write() to `name` reject. */
    failWrites(name: string, make: () => Error = () => new DOMException('Quota exceeded', 'QuotaExceededError')) {
      failures.set(name, make)
    },
    /** Hold every write() to `name` until the returned release() is called. */
    blockWrites(name: string): () => void {
      let release!: () => void
      blockers.set(name, new Promise<void>((r) => { release = r }))
      return () => { blockers.delete(name); release() }
    },
    /** Run `fn` at the start of every write() to `name`. */
    onWrite(name: string, fn: () => void) { hooks.set(name, fn) },
    setClock(t: number) { clock = t },
    setUsage(u: number) { usage = u },
    put(name: string, content: Uint8Array | string, lastModified = clock) {
      const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
      files.set(name, { bytes, lastModified })
    },
    text(name: string): string | null {
      const f = files.get(name)
      return f ? new TextDecoder().decode(f.bytes) : null
    },
    names(): string[] { return Array.from(files.keys()).sort() },
  }
}

type MemoryOpfs = ReturnType<typeof createMemoryOpfs>

/** The on-disk base name for a key (mirrors opfs-cache's sanitiser). */
function base(key: string): string {
  return key.replace(/[^a-zA-Z0-9.\-]/g, '_')
}

function install(opfs: MemoryOpfs): void {
  vi.stubGlobal('navigator', { storage: opfs.storage })
}

function meta(over: Partial<CacheEntry> = {}): Omit<CacheEntry, 'key'> {
  return { fileName: 'tower.ifc', fileSize: 1234, fragmentsSize: 0, cachedAt: 1_700_000_000_000, ...over }
}

const KEY = buildCacheKey({ name: 'tower.ifc', size: 1234, lastModified: 0 })
const B = base(KEY)

let opfs: MemoryOpfs

beforeEach(() => {
  opfs = createMemoryOpfs()
  install(opfs)
  // The logger prints to the console outside the browser; keep the output clean.
  for (const m of ['debug', 'info', 'warn', 'log', 'error'] as const) {
    vi.spyOn(console, m as 'log').mockImplementation(() => {})
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ── Round trip + commit order ─────────────────────────────────────────────────

describe('saveCacheEntry / loadCacheEntry', () => {
  it('round-trips fragments and meta, recording the sizes actually written', async () => {
    const fragments = new Uint8Array([1, 2, 3, 4, 5])
    const ifc = new Blob([new Uint8Array(40)])
    const r = await saveCacheEntry(KEY, {
      fragments,
      ifc,
      // A wrong fragmentsSize from the caller must not poison the lookup.
      meta: meta({ fragmentsSize: 999, contentHash: 'f1:1234:abc' }),
    })
    expect(r).toEqual({ ok: true })

    const hit = await loadCacheEntry(KEY)
    expect(hit).not.toBeNull()
    expect(Array.from(hit!.fragments)).toEqual([1, 2, 3, 4, 5])
    expect(hit!.meta).toMatchObject({
      key: KEY,
      fragmentsSize: 5,
      ifcSize: 40,
      contentHash: 'f1:1234:abc',
      lastUsedAt: 1_700_000_000_000,
    })
    expect(await loadFromCache(KEY)).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
  })

  it('commits .frag, then .ifc, then .meta.json last', async () => {
    await saveCacheEntry(KEY, { fragments: new Uint8Array([9]), ifc: new Uint8Array([1, 2]), meta: meta() })
    expect(opfs.commits).toEqual([`${B}.frag`, `${B}.ifc`, `${B}.meta.json`])
  })

  it('removes the previous meta before rewriting an entry', async () => {
    await saveCacheEntry(KEY, { fragments: new Uint8Array([1, 1]), meta: meta() })
    let metaPresentDuringFragWrite: boolean | null = null
    opfs.onWrite(`${B}.frag`, () => { metaPresentDuringFragWrite = opfs.files.has(`${B}.meta.json`) })

    await saveCacheEntry(KEY, { fragments: new Uint8Array([2, 2, 2]), meta: meta() })
    expect(metaPresentDuringFragWrite).toBe(false)
    expect(Array.from((await loadCacheEntry(KEY))!.fragments)).toEqual([2, 2, 2])
  })

  it('writes a Blob IFC as a Blob (no main-thread buffer)', async () => {
    const file = new File([new Uint8Array(64)], 'tower.ifc')
    await saveCacheEntry(KEY, { fragments: new Uint8Array([1]), ifc: file, meta: meta() })
    expect(opfs.chunkKinds.get(`${B}.ifc`)).toEqual(['blob'])
    expect(opfs.files.get(`${B}.ifc`)!.bytes.byteLength).toBe(64)
  })

  it('has fully consumed an ArrayBuffer before resolving (safe to transfer)', async () => {
    const src = new Uint8Array(4096)
    for (let i = 0; i < src.length; i++) src[i] = i & 0xff
    const buf = src.buffer.slice(0)

    const r = await saveCacheEntry(KEY, { fragments: buf, meta: meta() })
    expect(r.ok).toBe(true)

    // What the caller does next: hand the buffer to the fragments worker.
    structuredClone(buf, { transfer: [buf] })
    expect(buf.byteLength).toBe(0)

    const hit = await loadCacheEntry(KEY)
    expect(hit!.fragments.byteLength).toBe(4096)
    expect(Array.from(hit!.fragments.subarray(0, 4))).toEqual([0, 1, 2, 3])
    expect(hit!.meta.fragmentsSize).toBe(4096)
  })

  it('refuses empty fragments (also a buffer already transferred away)', async () => {
    const buf = new ArrayBuffer(8)
    structuredClone(buf, { transfer: [buf] })
    const r = await saveCacheEntry(KEY, { fragments: buf, meta: meta() })
    expect(r.ok).toBe(false)
    expect(opfs.names()).toEqual([])
  })

  it('ifc: null removes a stale .ifc; omitted leaves it alone', async () => {
    await saveCacheEntry(KEY, { fragments: new Uint8Array([1]), ifc: new Uint8Array([7, 7]), meta: meta() })
    await saveCacheEntry(KEY, { fragments: new Uint8Array([1]), meta: meta() })
    expect(opfs.files.has(`${B}.ifc`)).toBe(true)

    await saveCacheEntry(KEY, { fragments: new Uint8Array([1]), ifc: null, meta: meta() })
    expect(opfs.files.has(`${B}.ifc`)).toBe(false)
    expect((await loadCacheEntry(KEY))!.meta.ifcSize).toBeUndefined()
  })
})

// ── Failure handling ──────────────────────────────────────────────────────────

describe('saveCacheEntry failures', () => {
  it('a quota error on the .ifc removes every file of the key and reports it', async () => {
    opfs.failWrites(`${B}.ifc`)
    const r = await saveCacheEntry(KEY, { fragments: new Uint8Array([1, 2, 3]), ifc: new Uint8Array(10), meta: meta() })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Quota/)
    // Including the 0-byte .ifc getFileHandle({ create: true }) created.
    expect(opfs.names()).toEqual([])
    expect(await loadCacheEntry(KEY)).toBeNull()
  })

  it('a failure on the .frag leaves no 0-byte file behind', async () => {
    opfs.failWrites(`${B}.frag`)
    const r = await saveCacheEntry(KEY, { fragments: new Uint8Array([1, 2, 3]), meta: meta() })
    expect(r.ok).toBe(false)
    expect(opfs.names()).toEqual([])
  })

  it('a failed rewrite leaves no stale meta vouching for the old entry', async () => {
    await saveCacheEntry(KEY, { fragments: new Uint8Array([1, 2]), meta: meta() })
    opfs.failWrites(`${B}.frag`)
    const r = await saveCacheEntry(KEY, { fragments: new Uint8Array([3, 4, 5]), meta: meta() })
    expect(r.ok).toBe(false)
    expect(await loadCacheEntry(KEY)).toBeNull()
    expect(opfs.names()).toEqual([])
  })

  it('reports OPFS absence as unavailable, never throws', async () => {
    vi.stubGlobal('navigator', {})
    expect(cacheDirAvailable()).toBe(false)
    const r = await saveCacheEntry(KEY, { fragments: new Uint8Array([1]), meta: meta() })
    expect(r).toMatchObject({ ok: false, unavailable: true })
    expect(await loadCacheEntry(KEY)).toBeNull()
    expect(await evictForSpace(10)).toEqual([])
  })

  it('treats a rejected getDirectoryHandle as unavailable instead of throwing', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: async () => ({ getDirectoryHandle: async () => { throw new DOMException('denied', 'SecurityError') } }),
      },
    })
    await expect(loadFromCache(KEY)).resolves.toBeNull()
  })
})

// ── Lookup validation ─────────────────────────────────────────────────────────

describe('loadCacheEntry validation', () => {
  it('an orphan .frag without meta, past the grace period, is a miss and is deleted', async () => {
    opfs.setClock(1_000)
    opfs.put(`${B}.frag`, new Uint8Array([1, 2, 3]))
    opfs.put(`${B}.ifc`, new Uint8Array([4]))
    expect(await loadCacheEntry(KEY, { now: 1_000 + 11 * 60_000 })).toBeNull()
    expect(opfs.names()).toEqual([])
    // With the real clock too: the mock's files are dated decades ago.
    opfs.put(`${B}.frag`, new Uint8Array([1, 2, 3]))
    expect(await loadCacheEntry(KEY)).toBeNull()
    expect(opfs.names()).toEqual([])
  })

  it('a young meta-less set is a plain miss, left for the eviction sweep', async () => {
    // What another tab's write looks like from here: meta removed, .frag
    // committed, .ifc still streaming. `writing` cannot know about it.
    opfs.setClock(1_000)
    opfs.put(`${B}.frag`, new Uint8Array([1, 2, 3]))
    opfs.put(`${B}.ifc`, new Uint8Array([4]))
    const soon = 1_000 + 9 * 60_000

    expect(await loadCacheEntry(KEY, { now: soon })).toBeNull()
    expect(opfs.names()).toEqual([`${B}.frag`, `${B}.ifc`].sort())
    expect(opfs.contentReads).not.toContain(`${B}.frag`)

    // The sweep applies the same grace, then removes a real leftover.
    await evictForSpace(0, { now: soon })
    expect(opfs.names()).toHaveLength(2)
    await evictForSpace(0, { now: 1_000 + 11 * 60_000 })
    expect(opfs.names()).toEqual([])
  })

  it('counts a freshly written .ifc toward the grace, like the sweep does', async () => {
    // An old-generation .frag being replaced next to a brand-new .ifc.
    opfs.setClock(1_000)
    opfs.put(`${B}.frag`, new Uint8Array([1, 2, 3]))
    opfs.setClock(1_000 + 9 * 60_000)
    opfs.put(`${B}.ifc`, new Uint8Array([4]))
    expect(await loadCacheEntry(KEY, { now: 1_000 + 11 * 60_000 })).toBeNull()
    expect(opfs.names()).toHaveLength(2)
  })

  it('does not delete an entry another tab is writing, which then commits intact', async () => {
    // A second copy of the module is a second tab: its own `writing` set, the
    // same origin's files.
    opfs.setClock(Date.now())
    vi.resetModules()
    const otherTab = await import('./opfs-cache')
    const release = opfs.blockWrites(`${B}.ifc`)
    const saving = otherTab.saveCacheEntry(KEY, { fragments: new Uint8Array([1, 2]), ifc: new Uint8Array([3]), meta: meta() })
    await vi.waitFor(() => expect(opfs.commits).toContain(`${B}.frag`))

    expect(await loadCacheEntry(KEY)).toBeNull()
    expect(opfs.files.has(`${B}.frag`)).toBe(true)

    release()
    expect(await saving).toEqual({ ok: true })
    const hit = await loadCacheEntry(KEY)
    expect(Array.from(hit!.fragments)).toEqual([1, 2])
    expect(hit!.meta.ifcSize).toBe(1)
  })

  it('a 0-byte .frag is a miss even with a meta', async () => {
    opfs.put(`${B}.frag`, new Uint8Array(0))
    opfs.put(`${B}.meta.json`, JSON.stringify({ key: KEY, ...meta() }))
    expect(await loadCacheEntry(KEY)).toBeNull()
    expect(opfs.names()).toEqual([])
  })

  it('a .frag whose size differs from the meta is a miss', async () => {
    opfs.put(`${B}.frag`, new Uint8Array([1, 2]))
    opfs.put(`${B}.meta.json`, JSON.stringify({ key: KEY, ...meta({ fragmentsSize: 3 }) }))
    expect(await loadCacheEntry(KEY)).toBeNull()
    expect(opfs.names()).toEqual([])
  })

  it('an unparseable meta is a miss', async () => {
    opfs.put(`${B}.frag`, new Uint8Array([1, 2]))
    opfs.put(`${B}.meta.json`, '{"key": "v3:tow')
    expect(await loadCacheEntry(KEY)).toBeNull()
    expect(opfs.names()).toEqual([])
  })

  it('a meta whose .frag is gone is a miss and is deleted', async () => {
    opfs.put(`${B}.meta.json`, JSON.stringify({ key: KEY, ...meta({ fragmentsSize: 2 }) }))
    expect(await loadCacheEntry(KEY)).toBeNull()
    expect(opfs.names()).toEqual([])
  })

  it('accepts an entry from an older build (meta without the new fields)', async () => {
    opfs.put(`${B}.frag`, new Uint8Array([5, 6]))
    opfs.put(`${B}.meta.json`, JSON.stringify({ key: KEY, fileName: 'tower.ifc', fileSize: 1234, fragmentsSize: 2, cachedAt: 1 }))
    const hit = await loadCacheEntry(KEY)
    expect(hit).not.toBeNull()
    expect(hit!.meta.contentHash).toBeUndefined()
  })

  it('leaves alone an entry of another key that sanitises to the same file name', async () => {
    opfs.put(`${B}.frag`, new Uint8Array([5, 6]))
    opfs.put(`${B}.meta.json`, JSON.stringify({ key: 'v3:tower_ifc:1234:0', ...meta({ fragmentsSize: 2 }) }))
    expect(await loadCacheEntry(KEY)).toBeNull()
    expect(opfs.names()).toHaveLength(2)
  })

  it('does not "repair" an entry this tab is writing right now', async () => {
    const release = opfs.blockWrites(`${B}.ifc`)
    const saving = saveCacheEntry(KEY, { fragments: new Uint8Array([1, 2]), ifc: new Uint8Array([3]), meta: meta() })
    // Let the .frag commit and the .ifc write start.
    await vi.waitFor(() => expect(opfs.commits).toContain(`${B}.frag`))

    expect(await loadCacheEntry(KEY)).toBeNull()
    expect(opfs.files.has(`${B}.frag`)).toBe(true)
    const second = await saveCacheEntry(KEY, { fragments: new Uint8Array([9]), meta: meta() })
    expect(second.ok).toBe(false)

    release()
    expect(await saving).toEqual({ ok: true })
    expect(Array.from((await loadCacheEntry(KEY))!.fragments)).toEqual([1, 2])
  })
})

// ── Legacy API ────────────────────────────────────────────────────────────────

describe('legacy exports', () => {
  it('saveToCache → loadFromCache still round-trips and lists', async () => {
    await saveToCache(KEY, new Uint8Array([1, 2, 3]), meta({ fragmentsSize: 3 }))
    expect(await loadFromCache(KEY)).toEqual(new Uint8Array([1, 2, 3]))
    expect((await listCacheEntries()).map((e) => e.key)).toEqual([KEY])
    await deleteCacheEntry(KEY)
    expect(opfs.names()).toEqual([])
  })

  it('saveToCache swallows failures (old contract) but leaves nothing behind', async () => {
    opfs.failWrites(`${B}.frag`)
    await expect(saveToCache(KEY, new Uint8Array([1]), meta())).resolves.toBeUndefined()
    expect(opfs.names()).toEqual([])
  })

  it('loadIfcBuffer ignores an empty or mis-sized .ifc', async () => {
    await saveCacheEntry(KEY, { fragments: new Uint8Array([1]), ifc: new Uint8Array([1, 2, 3]), meta: meta() })
    expect((await loadIfcBuffer(KEY))!.byteLength).toBe(3)

    opfs.put(`${B}.ifc`, new Uint8Array([1, 2]))
    expect(await loadIfcBuffer(KEY)).toBeNull()

    opfs.put(`${B}.ifc`, new Uint8Array(0))
    expect(await loadIfcBuffer(KEY)).toBeNull()
  })

  it('saveIfcBuffer removes the empty file a failed write created', async () => {
    opfs.failWrites(`${B}.ifc`)
    await saveIfcBuffer(KEY, new Uint8Array([1, 2]))
    expect(opfs.files.has(`${B}.ifc`)).toBe(false)
  })
})

// ── touch ─────────────────────────────────────────────────────────────────────

describe('touchCacheEntry', () => {
  it('rewrites lastUsedAt and keeps the entry valid', async () => {
    await saveCacheEntry(KEY, { fragments: new Uint8Array([1, 2]), meta: meta() })
    expect(await touchCacheEntry(KEY, 5_000)).toBe(true)
    const hit = await loadCacheEntry(KEY)
    expect(hit!.meta.lastUsedAt).toBe(5_000)
    expect(hit!.meta.fragmentsSize).toBe(2)
  })

  it('backfills a missing contentHash but never replaces one', async () => {
    await saveCacheEntry(KEY, { fragments: new Uint8Array([1]), meta: meta() })
    await touchCacheEntry(KEY, 1, { contentHash: 'f1:1:aaa' })
    expect((await loadCacheEntry(KEY))!.meta.contentHash).toBe('f1:1:aaa')
    await touchCacheEntry(KEY, 2, { contentHash: 'f1:1:bbb' })
    expect((await loadCacheEntry(KEY))!.meta.contentHash).toBe('f1:1:aaa')
  })

  it('returns false when there is nothing to touch', async () => {
    expect(await touchCacheEntry(KEY)).toBe(false)
    expect(opfs.names()).toEqual([])
  })
})

// ── Eviction ──────────────────────────────────────────────────────────────────

describe('evictForSpace', () => {
  function keyOf(name: string): string {
    return buildCacheKey({ name, size: 1, lastModified: 0 })
  }

  async function seed(name: string, bytes: number, used: Partial<CacheEntry>): Promise<string> {
    const key = keyOf(name)
    await saveCacheEntry(key, { fragments: new Uint8Array(bytes), meta: meta({ fileName: name, ...used }) })
    return key
  }

  /** Bytes on disk, meta files included (eviction counts what the files take). */
  function diskBytes(): number {
    let n = 0
    for (const f of opfs.files.values()) n += f.bytes.byteLength
    return n
  }

  it('evicts least-recently-used first until the newcomer fits', async () => {
    const old    = await seed('old.ifc', 1000, { lastUsedAt: 100 })
    const newest = await seed('newest.ifc', 1000, { lastUsedAt: 300 })
    const middle = await seed('middle.ifc', 1000, { lastUsedAt: 200 })
    const perEntry = diskBytes() / 3

    // Room for exactly two entries: adding one more must evict the oldest only.
    const evicted = await evictForSpace(1000, { maxCacheBytes: Math.ceil(perEntry * 3) })
    expect(evicted).toEqual([old])
    expect(await loadCacheEntry(newest)).not.toBeNull()
    expect(await loadCacheEntry(middle)).not.toBeNull()

    // A tighter budget evicts the next oldest, in order.
    const more = await evictForSpace(1000, { maxCacheBytes: Math.ceil(perEntry * 2) })
    expect(more).toEqual([middle])
    expect(await loadCacheEntry(newest)).not.toBeNull()
  })

  it('falls back to cachedAt for entries from older builds (no lastUsedAt)', async () => {
    // Written the way the previous build wrote them: no lastUsedAt at all.
    function legacy(name: string, cachedAt: number): string {
      const key = keyOf(name)
      opfs.put(`${base(key)}.frag`, new Uint8Array(1000))
      opfs.put(`${base(key)}.meta.json`, JSON.stringify({ key, fileName: name, fileSize: 1, fragmentsSize: 1000, cachedAt }))
      return key
    }
    const older   = legacy('older.ifc', 10)
    const touched = legacy('touched.ifc', 5)
    const younger = legacy('younger.ifc', 20)
    await touchCacheEntry(touched, 50)

    // Must drop two of three: by last use that is older (10), then younger (20);
    // the entry cached first (5) survives because it was used last (50).
    const evicted = await evictForSpace(10, { maxCacheBytes: diskBytes() / 3 + 100 })
    expect(evicted).toEqual([older, younger])
    expect(await loadCacheEntry(touched)).not.toBeNull()
  })

  it('does nothing when everything fits', async () => {
    await seed('a.ifc', 100, { lastUsedAt: 1 })
    expect(await evictForSpace(100, { maxCacheBytes: 10_000 })).toEqual([])
    expect(opfs.names()).toHaveLength(2)
  })

  it('caps the budget at half the origin quota', async () => {
    opfs = createMemoryOpfs({ quota: 4000 })
    install(opfs)
    expect(await getCacheBudget({ maxCacheBytes: 1e12 })).toBe(2000)
    const a = await seed('a.ifc', 900, { lastUsedAt: 1 })
    await seed('b.ifc', 900, { lastUsedAt: 2 })
    // ~1.9 KB cached + 500 incoming > 2000 → the older entry goes.
    expect(await evictForSpace(500, { maxCacheBytes: 1e12 })).toEqual([a])
  })

  it('evicts nothing for a newcomer larger than the whole budget', async () => {
    await seed('a.ifc', 100, { lastUsedAt: 1 })
    expect(await evictForSpace(5000, { maxCacheBytes: 1000 })).toEqual([])
    expect(opfs.names()).toHaveLength(2)
  })

  it('sweeps orphans past the grace period and spares fresh ones', async () => {
    opfs.setClock(1_000)
    opfs.put('v3_stale.ifc_1_0.frag', new Uint8Array(10))
    opfs.setClock(1_000 + 9 * 60_000)
    opfs.put('v3_fresh.ifc_1_0.frag', new Uint8Array(10))
    await evictForSpace(0, { now: 1_000 + 11 * 60_000 })
    expect(opfs.names()).toEqual(['v3_fresh.ifc_1_0.frag'])
  })
})

// ── Repository ────────────────────────────────────────────────────────────────

describe('cacheRepo entry API', () => {
  it('findEntry evicts an entry whose fingerprint does not match, without reading its fragments', async () => {
    await saveCacheEntry(KEY, { fragments: new Uint8Array([1]), meta: meta({ contentHash: 'f1:1234:old' }) })
    const r = await cacheRepo.findEntry(KEY, 'f1:1234:new')
    expect(r).toEqual({ ok: true, value: null })
    expect(opfs.names()).toEqual([])
    expect(opfs.contentReads).not.toContain(`${B}.frag`)
  })

  it('loadCacheEntry compares the fingerprint on the meta, before the .frag is read', async () => {
    await saveCacheEntry(KEY, { fragments: new Uint8Array([1, 2]), meta: meta({ contentHash: 'f1:1234:same' }) })

    const match = await loadCacheEntry(KEY, { expectedFingerprint: 'f1:1234:same' })
    expect(Array.from(match!.fragments)).toEqual([1, 2])
    expect(opfs.contentReads.filter((n) => n === `${B}.frag`)).toHaveLength(1)

    // No expectation (null or omitted): served, as before.
    expect(await loadCacheEntry(KEY, { expectedFingerprint: null })).not.toBeNull()

    opfs.contentReads.length = 0
    expect(await loadCacheEntry(KEY, { expectedFingerprint: 'f1:1234:changed' })).toBeNull()
    expect(opfs.contentReads).toEqual([`${B}.meta.json`])
    expect(opfs.names()).toEqual([])
  })

  it('a stale entry of another key that shares the file name is left alone', async () => {
    opfs.put(`${B}.frag`, new Uint8Array([5, 6]))
    opfs.put(`${B}.meta.json`, JSON.stringify({ key: 'v3:tower_ifc:1234:0', ...meta({ fragmentsSize: 2, contentHash: 'f1:x' }) }))
    expect(await loadCacheEntry(KEY, { expectedFingerprint: 'f1:y' })).toBeNull()
    expect(opfs.names()).toHaveLength(2)
  })

  it('findEntry serves a match, an unhashed entry, and a lookup without a fingerprint', async () => {
    await saveCacheEntry(KEY, { fragments: new Uint8Array([1]), meta: meta({ contentHash: 'f1:1234:same' }) })
    const match = await cacheRepo.findEntry(KEY, 'f1:1234:same')
    expect(match.ok && match.value?.meta.contentHash).toBe('f1:1234:same')
    const noExpectation = await cacheRepo.findEntry(KEY)
    expect(noExpectation.ok && noExpectation.value !== null).toBe(true)

    const other = buildCacheKey({ name: 'legacy.ifc', size: 1, lastModified: 0 })
    await saveCacheEntry(other, { fragments: new Uint8Array([1]), meta: meta() })
    const legacy = await cacheRepo.findEntry(other, 'f1:1:any')
    expect(legacy.ok && legacy.value !== null).toBe(true)
  })

  it('saveEntry turns a failed write into an Err', async () => {
    opfs.failWrites(`${B}.meta.json`)
    const r = await cacheRepo.saveEntry(KEY, { fragments: new Uint8Array([1]), meta: meta() })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/Quota/)
    expect(opfs.names()).toEqual([])
  })

  it('saveFragments (legacy) reports failures but stays quiet without OPFS', async () => {
    opfs.failWrites(`${B}.frag`)
    const failed = await cacheRepo.saveFragments(KEY, new Uint8Array([1]), { fileName: 'tower.ifc', fileSize: 1234, fragmentsSize: 1 })
    expect(failed.ok).toBe(false)

    vi.stubGlobal('navigator', {})
    const none = await cacheRepo.saveFragments(KEY, new Uint8Array([1]), { fileName: 'tower.ifc', fileSize: 1234, fragmentsSize: 1 })
    expect(none.ok).toBe(true)
    const entry = await cacheRepo.saveEntry(KEY, { fragments: new Uint8Array([1]), meta: meta() })
    expect(entry.ok).toBe(false)
  })

  it('touch and evictForSpace wrap their results', async () => {
    await saveCacheEntry(KEY, { fragments: new Uint8Array([1]), meta: meta() })
    expect(await cacheRepo.touch(KEY)).toEqual({ ok: true, value: true })
    const r = await cacheRepo.evictForSpace(0, { maxCacheBytes: 1e9 })
    expect(r).toEqual({ ok: true, value: [] })
    expect(cacheRepo.isAvailable()).toBe(true)
  })
})
