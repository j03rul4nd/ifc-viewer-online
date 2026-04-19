// ─── OPFS fragments cache ─────────────────────────────────────────────────────
// Stores pre-parsed fragments binaries + original IFC files in the Origin Private
// File System so subsequent loads of the same IFC file skip web-ifc parsing.
//
// Layout (under the OPFS root):
//   ifc-cache/
//     <key>.frag          – raw fragments binary
//     <key>.ifc           – original IFC bytes (for validation + export)
//     <key>.meta.json     – CacheEntry metadata (JSON)
//
// Key format:  `${file.name}:${file.size}:${file.lastModified}`

import type { CacheEntry } from '../types'

const DIR_NAME = 'ifc-cache'

// ── Key ──────────────────────────────────────────────────────────────────────

export function buildCacheKey(file: { name: string; size: number; lastModified: number }): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function keyToFileName(key: string): string {
  return key.replace(/[^a-zA-Z0-9.\-]/g, '_')
}

// ── OPFS access ───────────────────────────────────────────────────────────────

async function getCacheDir(): Promise<FileSystemDirectoryHandle | null> {
  if (!('storage' in navigator) || typeof navigator.storage.getDirectory !== 'function') {
    return null
  }
  try {
    const root = await navigator.storage.getDirectory()
    return root.getDirectoryHandle(DIR_NAME, { create: true })
  } catch {
    return null
  }
}

// ── Fragments cache ───────────────────────────────────────────────────────────

export async function loadFromCache(key: string): Promise<Uint8Array | null> {
  const dir = await getCacheDir()
  if (!dir) return null

  const base = keyToFileName(key)
  try {
    const fh   = await dir.getFileHandle(`${base}.frag`)
    const file = await fh.getFile()
    return new Uint8Array(await file.arrayBuffer())
  } catch {
    return null
  }
}

export async function saveToCache(
  key: string,
  data: Uint8Array,
  meta: Omit<CacheEntry, 'key'>,
): Promise<void> {
  const dir = await getCacheDir()
  if (!dir) return

  const base = keyToFileName(key)

  try {
    const fragHandle   = await dir.getFileHandle(`${base}.frag`, { create: true })
    const fragWritable = await fragHandle.createWritable()
    await fragWritable.write(data)
    await fragWritable.close()

    const entry: CacheEntry = { key, ...meta }
    const metaHandle   = await dir.getFileHandle(`${base}.meta.json`, { create: true })
    const metaWritable = await metaHandle.createWritable()
    await metaWritable.write(JSON.stringify(entry))
    await metaWritable.close()
  } catch {
    // Non-fatal: proceed without caching
  }
}

// ── IFC buffer cache ──────────────────────────────────────────────────────────

/**
 * Persist the original IFC bytes to OPFS so the validator can read them
 * on subsequent sessions (cache-hit path).
 */
export async function saveIfcBuffer(key: string, data: Uint8Array): Promise<void> {
  const dir = await getCacheDir()
  if (!dir) return

  const base = keyToFileName(key)
  try {
    const fh       = await dir.getFileHandle(`${base}.ifc`, { create: true })
    const writable = await fh.createWritable()
    await writable.write(data)
    await writable.close()
  } catch {
    // Non-fatal
  }
}

/**
 * Load the original IFC bytes from OPFS.
 * Returns null if not cached (may happen for entries cached before this feature).
 */
export async function loadIfcBuffer(key: string): Promise<ArrayBuffer | null> {
  const dir = await getCacheDir()
  if (!dir) return null

  const base = keyToFileName(key)
  try {
    const fh   = await dir.getFileHandle(`${base}.ifc`)
    const file = await fh.getFile()
    return file.arrayBuffer()
  } catch {
    return null
  }
}

// ── Cache management ──────────────────────────────────────────────────────────

export async function listCacheEntries(): Promise<CacheEntry[]> {
  const dir = await getCacheDir()
  if (!dir) return []

  const entries: CacheEntry[] = []
  try {
    const iterable = dir as unknown as AsyncIterable<[string, FileSystemHandle]>
    for await (const [name, handle] of iterable) {
      if (!name.endsWith('.meta.json') || handle.kind !== 'file') continue
      try {
        const file = await (handle as FileSystemFileHandle).getFile()
        const text = await file.text()
        entries.push(JSON.parse(text) as CacheEntry)
      } catch {
        // Skip corrupted entries
      }
    }
  } catch {
    // Return empty on iteration failure
  }

  return entries.sort((a, b) => b.cachedAt - a.cachedAt)
}

export async function deleteCacheEntry(key: string): Promise<void> {
  const dir = await getCacheDir()
  if (!dir) return

  const base = keyToFileName(key)
  await Promise.allSettled([
    dir.removeEntry(`${base}.frag`),
    dir.removeEntry(`${base}.ifc`),
    dir.removeEntry(`${base}.meta.json`),
  ])
}

export async function getStorageEstimate(): Promise<{ usedMB: number; quotaMB: number }> {
  if (!('storage' in navigator) || typeof navigator.storage.estimate !== 'function') {
    return { usedMB: 0, quotaMB: 0 }
  }
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    return {
      usedMB:  Math.round(usage  / (1024 * 1024)),
      quotaMB: Math.round(quota  / (1024 * 1024)),
    }
  } catch {
    return { usedMB: 0, quotaMB: 0 }
  }
}
