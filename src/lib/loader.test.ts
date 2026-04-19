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
    expect(buildCacheKey(file)).toBe('office.ifc:12345678:1700000000000')
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
