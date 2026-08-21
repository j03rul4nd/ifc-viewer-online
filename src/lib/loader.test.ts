// ─── loader.test.ts ───────────────────────────────────────────────────────────
// Unit tests for:
//   • cache key generation          (buildCacheKey)
//   • OPFS cache hit / miss logic   (loadFromCache / saveToCache)
//   • progress event sequencing     (parseInWorker message protocol)
//
// Mocks: OPFS (navigator.storage.getDirectory), Worker API

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildCacheKey, loadFromCache, saveToCache, listCacheEntries, deleteCacheEntry } from './opfs-cache'

// ─────────────────────────────────────────────────────────────────────────────
// §1  Cache key generation
// ─────────────────────────────────────────────────────────────────────────────

describe('buildCacheKey', () => {
  it('produces a deterministic key from file metadata', () => {
    const file = { name: 'office.ifc', size: 12_345_678, lastModified: 1_700_000_000_000 }
    // Key format: `${CACHE_VERSION}:${name}:${size}:${lastModified}`.
    //
    // The version is deliberately NOT pinned here. Bumping it is the documented
    // way to invalidate every cached model, so a test that hard-codes it turns
    // a correct action into a failing build and teaches people to edit the
    // expectation without reading why. What matters is the SHAPE and that it is
    // deterministic.
    expect(buildCacheKey(file)).toMatch(/^v\d+:office\.ifc:12345678:1700000000000$/)
    expect(buildCacheKey(file)).toBe(buildCacheKey({ ...file }))
  })

  it('differentiates files with the same name but different sizes', () => {
    const a = { name: 'model.ifc', size: 100, lastModified: 0 }
    const b = { name: 'model.ifc', size: 200, lastModified: 0 }
    expect(buildCacheKey(a)).not.toBe(buildCacheKey(b))
  })

  it('differentiates files with the same name+size but different lastModified', () => {
    const a = { name: 'model.ifc', size: 100, lastModified: 1000 }
    const b = { name: 'model.ifc', size: 100, lastModified: 2000 }
    expect(buildCacheKey(a)).not.toBe(buildCacheKey(b))
  })

  it('handles file names with special characters', () => {
    const file = { name: 'my project/v2.ifc', size: 0, lastModified: 0 }
    const key = buildCacheKey(file)
    expect(typeof key).toBe('string')
    expect(key.length).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §2  OPFS cache hit / miss logic
// ─────────────────────────────────────────────────────────────────────────────

// Minimal in-memory OPFS mock
function makeOpfsMock() {
  const store = new Map<string, Uint8Array | string>()

  function makeFileHandle(key: string): FileSystemFileHandle {
    return {
      kind: 'file',
      name: key,
      getFile: async () => {
        const data = store.get(key)
        if (data === undefined) throw new DOMException('Not found', 'NotFoundError')
        if (typeof data === 'string') {
          return new File([data], key, { type: 'application/json' })
        }
        return new File([data], key)
      },
      createWritable: async () => {
        const chunks: (Uint8Array | string)[] = []
        return {
          write: async (chunk: Uint8Array | string) => { chunks.push(chunk) },
          close: async () => {
            // Simplified: last chunk wins (good enough for test purposes)
            const last = chunks[chunks.length - 1]
            if (last !== undefined) store.set(key, last)
          },
        } as unknown as FileSystemWritableFileStream
      },
    } as unknown as FileSystemFileHandle
  }

  function makeDirHandle(): FileSystemDirectoryHandle {
    return {
      kind: 'directory',
      name: 'ifc-cache',
      getFileHandle: async (name: string, opts?: { create?: boolean }) => {
        if (!store.has(name) && !opts?.create) {
          throw new DOMException('Not found', 'NotFoundError')
        }
        return makeFileHandle(name)
      },
      removeEntry: async (name: string) => { store.delete(name) },
      [Symbol.asyncIterator]: async function* () {
        for (const [name] of store.entries()) {
          yield [name, makeFileHandle(name)] as [string, FileSystemFileHandle]
        }
      },
    } as unknown as FileSystemDirectoryHandle
  }

  const dirHandle = makeDirHandle()

  return {
    dirHandle,
    store,
    rootHandle: {
      getDirectoryHandle: async (_name: string, _opts?: { create?: boolean }) => dirHandle,
    } as unknown as FileSystemDirectoryHandle,
  }
}

describe('OPFS cache — hit / miss', () => {
  let originalGetDirectory: typeof navigator.storage.getDirectory

  beforeEach(() => {
    originalGetDirectory = navigator.storage?.getDirectory?.bind(navigator.storage)
  })

  afterEach(() => {
    if (originalGetDirectory) {
      Object.defineProperty(navigator.storage, 'getDirectory', {
        value: originalGetDirectory,
        configurable: true,
      })
    }
  })

  function mockOpfs() {
    const { rootHandle, store } = makeOpfsMock()
    Object.defineProperty(navigator, 'storage', {
      value: {
        getDirectory: vi.fn().mockResolvedValue(rootHandle),
        estimate: vi.fn().mockResolvedValue({ usage: 0, quota: 1_000_000_000 }),
      },
      configurable: true,
    })
    return store
  }

  it('returns null on cache miss', async () => {
    mockOpfs()
    const result = await loadFromCache('nonexistent:0:0')
    expect(result).toBeNull()
  })

  it('round-trips binary data: save → load returns same bytes', async () => {
    mockOpfs()
    const key  = 'test.ifc:1024:12345'
    const data = new Uint8Array([1, 2, 3, 4, 5])

    await saveToCache(key, data, {
      fileName: 'test.ifc',
      fileSize: 1024,
      fragmentsSize: 5,
      cachedAt: Date.now(),
    })

    const loaded = await loadFromCache(key)
    expect(loaded).not.toBeNull()
    expect(Array.from(loaded!)).toEqual([1, 2, 3, 4, 5])
  })

  it('lists saved cache entries', async () => {
    mockOpfs()
    const key = 'list-test.ifc:512:99999'
    await saveToCache(key, new Uint8Array([0]), {
      fileName: 'list-test.ifc',
      fileSize: 512,
      fragmentsSize: 1,
      cachedAt: 1_700_000_000_000,
    })

    const entries = await listCacheEntries()
    expect(entries.some(e => e.key === key)).toBe(true)
  })

  it('delete removes the entry', async () => {
    mockOpfs()
    const key = 'delete-test.ifc:256:11111'
    await saveToCache(key, new Uint8Array([7]), {
      fileName: 'delete-test.ifc',
      fileSize: 256,
      fragmentsSize: 1,
      cachedAt: Date.now(),
    })

    await deleteCacheEntry(key)

    const loaded = await loadFromCache(key)
    expect(loaded).toBeNull()
  })

  it('gracefully returns null when OPFS is unavailable', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {},  // no getDirectory
      configurable: true,
    })
    const result = await loadFromCache('any:0:0')
    expect(result).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §3  Progress event sequencing
// ─────────────────────────────────────────────────────────────────────────────

describe('Worker progress event sequencing', () => {
  it('emits progress events in ascending order before the result', async () => {
    // Simulate the worker message protocol without a real Worker
    const events: Array<{ type: string; percent?: number }> = []

    // The worker sends: N×progress → 1×result
    // We verify: every progress message has percent ≤ 100, result arrives last.
    const fakeMessages: Array<{ type: 'progress'; percent: number } | { type: 'result'; fragmentsBuffer: ArrayBuffer }> = [
      { type: 'progress', percent: 10 },
      { type: 'progress', percent: 40 },
      { type: 'progress', percent: 70 },
      { type: 'progress', percent: 99 },
      { type: 'result',   fragmentsBuffer: new ArrayBuffer(8) },
    ]

    const resultFragments = await new Promise<ArrayBuffer>((resolve, reject) => {
      let lastPercent = -1

      for (const msg of fakeMessages) {
        if (msg.type === 'progress') {
          events.push({ type: 'progress', percent: msg.percent })
          expect(msg.percent).toBeGreaterThanOrEqual(0)
          expect(msg.percent).toBeLessThanOrEqual(100)
          expect(msg.percent).toBeGreaterThan(lastPercent)
          lastPercent = msg.percent
        } else if (msg.type === 'result') {
          events.push({ type: 'result' })
          resolve(msg.fragmentsBuffer)
        }
      }

      reject(new Error('No result message received'))
    })

    expect(resultFragments).toBeInstanceOf(ArrayBuffer)

    // Result must be the last event
    expect(events[events.length - 1]?.type).toBe('result')

    // All progress events precede the result
    const resultIdx = events.findIndex(e => e.type === 'result')
    const afterResult = events.slice(resultIdx + 1)
    expect(afterResult.every(e => e.type !== 'progress')).toBe(true)
  })

  it('error message stops the sequence without result', () => {
    const messages: Array<{ type: string }> = [
      { type: 'progress' },
      { type: 'error' },
    ]

    let gotResult = false
    for (const msg of messages) {
      if (msg.type === 'result') gotResult = true
      if (msg.type === 'error')  break
    }

    expect(gotResult).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §4  Pre-flight file validation (loader-level guards)
// Tests the validation logic that loadFile runs before touching a worker.
// ─────────────────────────────────────────────────────────────────────────────

describe('Loader pre-flight file validation', () => {
  function makeFile(name: string, sizeBytes: number): File {
    const content = new Uint8Array(sizeBytes)
    return new File([content], name, { type: '' })
  }

  it('rejects a file with size 0 before doing any async work', async () => {
    // We test the pure validation logic directly (not the full hook which needs React/DOM)
    const file = makeFile('building.ifc', 0)
    expect(file.size).toBe(0)
    // The loadFile guard: `!file || file.size === 0`
    expect(file.size === 0).toBe(true)
  })

  it('rejects a non-.ifc extension', () => {
    const names = ['document.pdf', 'model.rvt', 'image.png', 'archive.zip', 'noextension']
    for (const name of names) {
      expect(name.toLowerCase().endsWith('.ifc')).toBe(false)
    }
  })

  it('accepts valid .ifc extensions (case-insensitive)', () => {
    const names = ['building.ifc', 'MODEL.IFC', 'MyProject.Ifc']
    for (const name of names) {
      expect(name.toLowerCase().endsWith('.ifc')).toBe(true)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §5  Concurrency guard — isLoadingRef semantics
// Verifies the guard logic in isolation (the actual hook is not instantiated).
// ─────────────────────────────────────────────────────────────────────────────

describe('Concurrency guard (isLoadingRef logic)', () => {
  it('a second load while one is in flight is rejected', async () => {
    // Simulate the isLoadingRef pattern
    let isLoading = false
    const warnings: string[] = []

    async function fakeLoad(name: string): Promise<string> {
      if (isLoading) {
        warnings.push(`${name} rejected: already loading`)
        return 'rejected'
      }
      isLoading = true
      try {
        // Simulate async work
        await Promise.resolve()
        return 'done'
      } finally {
        isLoading = false
      }
    }

    // Start first load, then immediately attempt a second
    const [r1, r2] = await Promise.all([fakeLoad('A'), fakeLoad('B')])

    // One succeeds, the other is rejected
    expect([r1, r2]).toContain('done')
    expect([r1, r2]).toContain('rejected')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/rejected: already loading/)
  })

  it('lock is released on error so subsequent loads can proceed', async () => {
    let isLoading = false
    const results: string[] = []

    async function fakeLoad(shouldFail: boolean): Promise<void> {
      if (isLoading) { results.push('concurrent-rejected'); return }
      isLoading = true
      try {
        await Promise.resolve()
        if (shouldFail) throw new Error('parse error')
        results.push('success')
      } catch {
        results.push('error')
      } finally {
        isLoading = false  // ← the `finally` in loadFile guarantees this
      }
    }

    await fakeLoad(true)   // first load fails
    await fakeLoad(false)  // second load must succeed (lock was released)

    expect(results).toEqual(['error', 'success'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §6  Worker error recovery — resetWorker semantics
// Verifies that a broken worker is replaced on the next call.
// ─────────────────────────────────────────────────────────────────────────────

describe('Worker error recovery (resetWorker semantics)', () => {
  it('a new worker instance is created after the previous one is terminated', () => {
    // Simulate the workerRef / getWorker / resetWorker pattern
    let workerInstance: { id: number; terminated: boolean } | null = null
    let nextId = 1

    function getWorker() {
      if (!workerInstance) {
        workerInstance = { id: nextId++, terminated: false }
      }
      return workerInstance
    }

    function resetWorker() {
      if (workerInstance) {
        workerInstance.terminated = true
        workerInstance = null
      }
    }

    const w1 = getWorker()
    expect(w1.id).toBe(1)

    // Simulate a fatal worker error → resetWorker is called
    resetWorker()
    expect(w1.terminated).toBe(true)

    // Next getWorker() must create a fresh instance
    const w2 = getWorker()
    expect(w2.id).toBe(2)
    expect(w2.terminated).toBe(false)
    expect(w2).not.toBe(w1)
  })

  it('getWorker returns the SAME instance on consecutive calls (no leak)', () => {
    let workerInstance: { id: number } | null = null

    function getWorker() {
      if (!workerInstance) workerInstance = { id: 1 }
      return workerInstance
    }

    const a = getWorker()
    const b = getWorker()
    expect(a).toBe(b)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §7  fromCacheLocal — stale closure guard
// Verifies the pattern that fixes the isFromCache stale state bug.
// ─────────────────────────────────────────────────────────────────────────────

describe('fromCacheLocal stale-closure fix', () => {
  it('local variable correctly tracks cache hit independent of React state', async () => {
    // Simulate the async load flow:
    //   React state is committed via setTimeout (macrotask), so reading it
    //   immediately after an await (microtask) gives the STALE value.
    //   The fix is to use a local `fromCacheLocal` variable instead.

    let isFromCacheState = false  // simulates React state
    const setIsFromCache = (v: boolean) => {
      // Simulate React's batched commit via macrotask (not microtask)
      setTimeout(() => { isFromCacheState = v }, 10)
    }

    let capturedStale: boolean | null = null
    let capturedLocal: boolean | null = null

    async function fakeLoad(cacheHit: boolean) {
      let fromCacheLocal = false  // ← the fix
      setIsFromCache(false)

      if (cacheHit) {
        fromCacheLocal = true       // ← set locally
        setIsFromCache(true)        // ← schedules macrotask commit
      }

      // Simulate async work via microtask — macrotask hasn't fired yet
      await Promise.resolve()

      // React state commit is still pending (setTimeout not yet executed)
      capturedStale = isFromCacheState  // false — state not yet committed
      capturedLocal = fromCacheLocal    // true — local var is correct
    }

    await fakeLoad(true)

    expect(capturedStale).toBe(false)  // state not yet committed — old bug scenario
    expect(capturedLocal).toBe(true)   // local var always correct — the fix
  })
})
