import { describe, it, expect, vi } from 'vitest'
import {
  createNodeCache, throughCache, cacheKeyForSource, nodeKey, type PointNodeCache,
} from './pc-node-cache'

const bytes = (n: number, fill = 1): Uint8Array => new Uint8Array(n).fill(fill)

describe('pc-node-cache · scan identity', () => {
  it('identifies a fetched scan by its URL, not by the File wrapped around it', () => {
    // The bug this exists to prevent: `new File(downloadedBytes, name)` stamps
    // lastModified with the moment of the fetch, so the same demo scan arrives
    // with a different identity on every load and nothing keyed by it persists.
    const first = cacheKeyForSource({
      url: 'https://x/autzen.copc.laz', name: 'autzen.copc.laz', size: 100, lastModified: 1_000,
    })
    const second = cacheKeyForSource({
      url: 'https://x/autzen.copc.laz', name: 'autzen.copc.laz', size: 100, lastModified: 9_999,
    })
    expect(first).toBe(second)
  })

  it('identifies a picked file by name, size and mtime', () => {
    const base = { name: 'site.copc.laz', size: 2048, lastModified: 7 }
    const key = cacheKeyForSource(base)
    expect(cacheKeyForSource({ ...base, lastModified: 8 })).not.toBe(key)
    expect(cacheKeyForSource({ ...base, size: 2049 })).not.toBe(key)
  })

  it('namespaces nodes under their scan so two scans cannot collide', () => {
    expect(nodeKey('url:a', '1-0-0-0')).not.toBe(nodeKey('url:b', '1-0-0-0'))
  })
})

describe('pc-node-cache · throughCache policy', () => {
  const stub = (over: Partial<PointNodeCache> = {}): PointNodeCache => ({
    get: async () => null,
    set: async () => {},
    stats: () => ({
      memoryHits: 0, diskHits: 0, misses: 0, memoryBytes: 0, diskDisabledReason: null,
    }),
    clear: async () => {},
    ...over,
  })

  it('serves a hit without decoding', async () => {
    const cached = bytes(64, 7)
    const compute = vi.fn(async () => bytes(64, 9))
    const out = await throughCache(stub({ get: async () => cached }), 'k', 64, compute)
    expect(compute).not.toHaveBeenCalled()
    expect(out[0]).toBe(7)
  })

  it('rejects a hit of the wrong length instead of misreading it', async () => {
    // These bytes are interpreted through a record layout derived from the file
    // header. A buffer of unexpected size is not a smaller answer — it is every
    // record after the first landing at the wrong offset.
    const compute = vi.fn(async () => bytes(64, 9))
    const out = await throughCache(stub({ get: async () => bytes(48, 7) }), 'k', 64, compute)
    expect(compute).toHaveBeenCalledTimes(1)
    expect(out).toHaveLength(64)
    expect(out[0]).toBe(9)
  })

  it('stores what it computed on a miss', async () => {
    const set = vi.fn(async () => {})
    await throughCache(stub({ set }), 'k', 8, async () => bytes(8))
    expect(set).toHaveBeenCalledWith('k', expect.any(Uint8Array))
  })

  it('computes normally when there is no cache or no key', async () => {
    expect(await throughCache(null, 'k', 8, async () => bytes(8, 3))).toHaveLength(8)
    expect(await throughCache(stub(), null, 8, async () => bytes(8, 3))).toHaveLength(8)
  })

  it('never lets a broken cache break the read', async () => {
    // The whole safety contract in one test. A cache that throws on read AND on
    // write must be indistinguishable from no cache at all.
    const hostile = stub({
      get: async () => { throw new Error('idb exploded') },
      set: async () => { throw new Error('QuotaExceededError') },
    })
    const out = await throughCache(hostile, 'k', 16, async () => bytes(16, 5))
    expect(out[0]).toBe(5)
  })
})

describe('pc-node-cache · memory tier', () => {
  // A db factory that always rejects: exercises the memory tier alone, and with
  // it the degradation path, which is what a private-browsing session gets.
  const memoryOnly = (): PointNodeCache =>
    createNodeCache({ db: () => Promise.reject(new Error('noIndexedDb')) })

  it('round-trips a node', async () => {
    const c = memoryOnly()
    await c.set('a', bytes(32, 4))
    const got = await c.get('a')
    expect(got?.[0]).toBe(4)
    expect(c.stats().memoryHits).toBe(1)
  })

  it('reports a miss rather than throwing when the disk tier is unavailable', async () => {
    const c = memoryOnly()
    expect(await c.get('never-stored')).toBeNull()
    expect(c.stats().misses).toBe(1)
    expect(c.stats().diskDisabledReason).toBe('noIndexedDb')
  })

  it('evicts least-recently-used once the budget is exceeded', async () => {
    const c = memoryOnly()
    const CHUNK = 8 * 1024 * 1024          // 8 MB — 9 of these exceed the 64 MB budget
    for (let i = 0; i < 9; i++) await c.set(`n${i}`, bytes(CHUNK, i))

    expect(c.stats().memoryBytes).toBeLessThanOrEqual(64 * 1024 * 1024)
    expect(await c.get('n0')).toBeNull()   // oldest went first
    expect(await c.get('n8')).not.toBeNull()
  })

  it('a read makes an entry recent, so it survives the next eviction', async () => {
    const c = memoryOnly()
    const CHUNK = 8 * 1024 * 1024
    for (let i = 0; i < 8; i++) await c.set(`n${i}`, bytes(CHUNK, i))
    await c.get('n0')                       // touch the oldest
    await c.set('n8', bytes(CHUNK, 8))      // forces one eviction

    expect(await c.get('n0')).not.toBeNull()
    expect(await c.get('n1')).toBeNull()    // n1 is now the oldest
  })

  it('still returns an entry larger than the whole budget', async () => {
    // Eviction must never consume the entry it was called for, or an oversized
    // node would loop and then be reported as absent immediately after storing.
    const c = memoryOnly()
    await c.set('huge', bytes(80 * 1024 * 1024))
    expect(await c.get('huge')).not.toBeNull()
  })

  it('clear empties the memory tier', async () => {
    const c = memoryOnly()
    await c.set('a', bytes(16))
    await c.clear()
    expect(await c.get('a')).toBeNull()
    expect(c.stats().memoryBytes).toBe(0)
  })
})
