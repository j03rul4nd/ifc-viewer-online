/**
 * Decoded-node cache for COPC streaming.
 *
 * Every time the octree selector wants a node, `CopcReader.decodeNode` range-reads
 * its bytes and runs them through the laz-perf WASM decompressor one record at a
 * time. That decode is the expensive half, and it was being repeated in full
 * whenever a node was evicted and the camera later came back to it — and again
 * from scratch the next time the same scan was opened.
 *
 * So this keeps the DECODED records, in two tiers:
 *
 *   • an in-memory LRU, which is what makes orbiting back and forth free;
 *   • IndexedDB, which is what makes re-opening the same scan in a new session
 *     free.
 *
 * ── Why the decompressed form, when it is several times larger than the source
 * It is the CPU that is scarce here, not the bytes. The source is either already
 * on disk (a picked File) or already in the HTTP cache (a fetched URL), so
 * re-reading it costs nothing; re-running WASM over twenty million points costs
 * seconds of a frozen-looking viewer.
 *
 * ── Budgets are hard, and exceeding them is not an error
 * A LiDAR survey will happily fill a disk. Both tiers evict least-recently-used
 * on insert, and every IndexedDB failure — quota, private browsing, a blocked
 * upgrade, no IDB at all in a test environment — degrades to the memory tier
 * instead of failing the read. A cache that can break loading is worse than no
 * cache, so this one cannot: `get` returning null is always a legal answer.
 */

/** Records are ~34 bytes/point; 64 MB holds a good working set of nodes. */
const MEMORY_BUDGET_BYTES = 64 * 1024 * 1024
/** Generous but bounded. Browsers may still evict the whole origin under pressure. */
const DISK_BUDGET_BYTES = 256 * 1024 * 1024
/** A single node bigger than this is not worth persisting — it would evict everything else. */
const MAX_ENTRY_BYTES = 24 * 1024 * 1024

const DB_NAME = 'ifc-pointcloud-nodes'
const DB_VERSION = 1
const STORE = 'nodes'
const INDEX_LAST_USED = 'lastUsed'

export interface NodeCacheStats {
  memoryHits: number
  diskHits: number
  misses: number
  memoryBytes: number
  /** Set when the disk tier gave up; the cache keeps working in memory only. */
  diskDisabledReason: string | null
}

export interface PointNodeCache {
  get(key: string): Promise<Uint8Array | null>
  set(key: string, bytes: Uint8Array): Promise<void>
  stats(): NodeCacheStats
  /** Drop everything, both tiers. Used by the "clear cached scans" control. */
  clear(): Promise<void>
}

interface StoredNode {
  k: string
  bytes: ArrayBuffer
  size: number
  lastUsed: number
}

/**
 * Build a key that identifies a scan across sessions.
 *
 * For a fetched cloud the URL is the identity. For a picked File it is
 * name+size+lastModified — the same triple a browser download manager uses, and
 * enough that editing a scan misses the cache instead of serving stale points.
 *
 * Note the URL case matters more than it looks: `App.tsx` wraps fetched bytes in
 * `new File(...)`, whose lastModified is the moment of the fetch. Keyed on the
 * File alone, a demo scan would never hit across sessions.
 */
export function cacheKeyForSource(
  source: { url?: string | null; name: string; size: number; lastModified?: number },
): string {
  if (source.url) return `url:${source.url}`
  return `file:${source.name}:${source.size}:${source.lastModified ?? 0}`
}

/** `<scan key>|<node id>` — the unit this cache stores. */
export function nodeKey(scanKey: string, nodeId: string): string {
  return `${scanKey}|${nodeId}`
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Absent in Node test runs and in some privacy modes. Not an error.
    if (typeof indexedDB === 'undefined') { reject(new Error('noIndexedDb')); return }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'k' })
        store.createIndex(INDEX_LAST_USED, 'lastUsed')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('idbOpenFailed'))
    // Another tab holding an old version open. Give up rather than hang.
    req.onblocked = () => reject(new Error('idbBlocked'))
  })
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('idbRequestFailed'))
  })
}

/**
 * The real cache. `deps` exists so the tests can drive the memory tier and the
 * eviction arithmetic without an IndexedDB implementation in the room.
 */
export function createNodeCache(deps: { db?: () => Promise<IDBDatabase> } = {}): PointNodeCache {
  const memory = new Map<string, Uint8Array>()   // Map iteration order == insertion order == LRU
  let memoryBytes = 0
  let memoryHits = 0
  let diskHits = 0
  let misses = 0
  let diskDisabledReason: string | null = null

  let dbPromise: Promise<IDBDatabase> | null = null
  function db(): Promise<IDBDatabase> {
    if (diskDisabledReason) return Promise.reject(new Error(diskDisabledReason))
    dbPromise ??= (deps.db ?? openDb)().catch((e: unknown) => {
      // One failure disables the tier for the session. Retrying an unavailable
      // IndexedDB on every node would just add latency to every miss.
      diskDisabledReason = e instanceof Error ? e.message : 'idbUnavailable'
      throw e
    })
    return dbPromise
  }

  function touchMemory(key: string, bytes: Uint8Array): void {
    memory.delete(key)
    memory.set(key, bytes)
  }

  function admitToMemory(key: string, bytes: Uint8Array): void {
    if (memory.has(key)) {
      memoryBytes -= memory.get(key)!.byteLength
      memory.delete(key)
    }
    memory.set(key, bytes)
    memoryBytes += bytes.byteLength
    // Evict oldest-first until under budget. Never evict the entry just added,
    // or a single oversized node would loop for ever.
    for (const k of memory.keys()) {
      if (memoryBytes <= MEMORY_BUDGET_BYTES || memory.size <= 1) break
      if (k === key) continue
      memoryBytes -= memory.get(k)!.byteLength
      memory.delete(k)
    }
  }

  async function readDisk(key: string): Promise<Uint8Array | null> {
    const database = await db()
    const tx = database.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const row = await promisify<StoredNode | undefined>(
      store.get(key) as IDBRequest<StoredNode | undefined>,
    )
    if (!row) return null
    // Refresh recency so a node in daily use is not evicted by a one-off import.
    row.lastUsed = Date.now()
    store.put(row)
    return new Uint8Array(row.bytes)
  }

  async function writeDisk(key: string, bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength > MAX_ENTRY_BYTES) return
    const database = await db()
    const tx = database.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)

    // Copy: the caller keeps using this array, and structured-clone of a view
    // onto a shared buffer would persist the whole buffer.
    const copy = bytes.slice()
    store.put({
      k: key, bytes: copy.buffer, size: copy.byteLength, lastUsed: Date.now(),
    } satisfies StoredNode)

    // Total is recomputed from the store rather than tracked in memory, because
    // another tab writes to the same database and a stale running total would
    // let the budget drift upward without bound.
    let total = 0
    const sizes: Array<{ k: string; size: number; lastUsed: number }> = []
    await new Promise<void>((resolve, reject) => {
      const cursorReq = store.index(INDEX_LAST_USED).openCursor()
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (!cursor) { resolve(); return }
        const row = cursor.value as StoredNode
        total += row.size
        sizes.push({ k: row.k, size: row.size, lastUsed: row.lastUsed })
        cursor.continue()
      }
      cursorReq.onerror = () => reject(cursorReq.error ?? new Error('idbCursorFailed'))
    })

    // sizes arrives ordered by the lastUsed index — oldest first.
    for (const row of sizes) {
      if (total <= DISK_BUDGET_BYTES) break
      if (row.k === key) continue
      store.delete(row.k)
      total -= row.size
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('idbTxFailed'))
      tx.onabort = () => reject(tx.error ?? new Error('idbTxAborted'))
    })
  }

  return {
    async get(key) {
      const hot = memory.get(key)
      if (hot) {
        touchMemory(key, hot)
        memoryHits++
        return hot
      }
      try {
        const cold = await readDisk(key)
        if (cold) {
          admitToMemory(key, cold)
          diskHits++
          return cold
        }
      } catch {
        // Disk tier unavailable or failing — a miss, never a load failure.
      }
      misses++
      return null
    },

    async set(key, bytes) {
      admitToMemory(key, bytes)
      try {
        await writeDisk(key, bytes)
      } catch {
        // QuotaExceededError lands here. The memory tier already has it, so the
        // session still benefits; only cross-session reuse is lost.
      }
    },

    stats() {
      return { memoryHits, diskHits, misses, memoryBytes, diskDisabledReason }
    },

    async clear() {
      memory.clear()
      memoryBytes = 0
      try {
        const database = await db()
        const tx = database.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).clear()
        await new Promise<void>((resolve) => {
          tx.oncomplete = () => resolve()
          tx.onerror = () => resolve()
          tx.onabort = () => resolve()
        })
      } catch {
        // Nothing persisted, nothing to clear.
      }
    },
  }
}

/**
 * Serve `compute()` through the cache: hit if there is one, otherwise compute
 * and store.
 *
 * The policy lives here rather than in the reader so it can be tested without a
 * LAZ-compressed COPC in the room, and so there is exactly one place where the
 * rules are written down:
 *
 *   • No cache, or no key → just compute. The cache is always optional.
 *   • A hit of the wrong length is NOT a hit. Callers interpret these bytes
 *     through a record layout derived from the file header, so a buffer of
 *     unexpected size would be misread record by record rather than rejected.
 *   • Any throw from the cache is a miss. Storing is fire-and-forget. Nothing
 *     the cache does may turn a working read into a failed one.
 */
export async function throughCache(
  cache: PointNodeCache | undefined | null,
  key: string | null,
  expectedBytes: number,
  compute: () => Promise<Uint8Array>,
): Promise<Uint8Array> {
  if (!cache || !key) return compute()

  try {
    const hit = await cache.get(key)
    if (hit && hit.byteLength === expectedBytes) return hit
  } catch {
    // Treat a broken cache as an empty one.
  }

  const fresh = await compute()
  // Deliberately not awaited — persisting must never sit between the camera and
  // its points. The rejection handler is attached to the PROMISE rather than
  // wrapping this in try/catch: a try/catch here would only see a synchronous
  // throw, and a rejecting `set` (QuotaExceededError is the realistic one) would
  // escape as an unhandled rejection.
  void Promise.resolve(cache.set(key, fresh)).catch(() => {})
  return fresh
}

/** Process-wide instance. One database, one memory budget, shared by every scan. */
let shared: PointNodeCache | null = null
export function sharedNodeCache(): PointNodeCache {
  shared ??= createNodeCache()
  return shared
}
