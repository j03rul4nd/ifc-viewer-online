// ─── Cache Repository — Repository Pattern ────────────────────────────────────
// Single seam for all OPFS cache I/O. Callers deal with Result<T> instead of
// catching OPFS exceptions themselves. Swapping the storage backend (IndexedDB,
// S3, etc.) only requires changes here — no loader or hook changes.
//
// Usage:
//   const r = await cacheRepo.findFragments(key)
//   if (r.ok) loadFragments(r.value)
//   else      log.warn('Cache miss:', r.error.message)

import { ok, err, safeAsync } from './result'
import type { Result } from './result'
import { createLogger } from './logger'
import { isCacheEntry } from './type-guards'
import type { CacheEntry } from '../types'
import {
  loadFromCache,
  saveToCache,
  loadIfcBuffer,
  saveIfcBuffer,
  listCacheEntries,
  deleteCacheEntry,
  getStorageEstimate,
} from './opfs-cache'

const log = createLogger('CacheRepo')

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SaveFragmentsOpts {
  fileName:      string
  fileSize:      number
  fragmentsSize: number
}

export interface StorageInfo {
  usedMB:  number
  quotaMB: number
}

// ── Repository class ───────────────────────────────────────────────────────────

export class CacheRepository {

  // ── Fragments ──────────────────────────────────────────────────────────────

  async findFragments(key: string): Promise<Result<Uint8Array | null, Error>> {
    const r = await safeAsync(() => loadFromCache(key))
    if (!r.ok) log.warn('findFragments failed:', r.error.message)
    return r
  }

  async saveFragments(
    key:  string,
    data: Uint8Array,
    opts: SaveFragmentsOpts,
  ): Promise<Result<void, Error>> {
    const meta: Omit<CacheEntry, 'key'> = {
      fileName:      opts.fileName,
      fileSize:      opts.fileSize,
      fragmentsSize: opts.fragmentsSize,
      cachedAt:      Date.now(),
    }
    const r = await safeAsync(() => saveToCache(key, data, meta))
    if (r.ok) {
      log.debug('Saved fragments:', key, `(${(data.byteLength / 1024).toFixed(0)} KB)`)
    } else {
      log.warn('saveFragments failed:', r.error.message)
    }
    return r
  }

  // ── IFC buffer ─────────────────────────────────────────────────────────────

  async findIfcBuffer(key: string): Promise<Result<ArrayBuffer | null, Error>> {
    const r = await safeAsync(() => loadIfcBuffer(key))
    if (!r.ok) log.warn('findIfcBuffer failed:', r.error.message)
    return r
  }

  async saveIfcBuffer(key: string, data: Uint8Array): Promise<Result<void, Error>> {
    const r = await safeAsync(() => saveIfcBuffer(key, data))
    if (r.ok) {
      log.debug('Saved IFC buffer:', key, `(${(data.byteLength / 1024).toFixed(0)} KB)`)
    } else {
      log.warn('saveIfcBuffer failed:', r.error.message)
    }
    return r
  }

  // ── Entry management ────────────────────────────────────────────────────────

  async listEntries(): Promise<Result<CacheEntry[], Error>> {
    const r = await safeAsync(() => listCacheEntries())
    if (!r.ok) { log.warn('listEntries failed:', r.error.message); return r }

    // Validate each entry before returning — OPFS JSON could be corrupted
    const valid = r.value.filter((e) => {
      if (isCacheEntry(e)) return true
      log.warn('Discarding malformed cache entry:', e)
      return false
    })

    if (valid.length !== r.value.length) {
      log.warn(`Filtered ${r.value.length - valid.length} malformed entries`)
    }
    return ok(valid)
  }

  async deleteEntry(key: string): Promise<Result<void, Error>> {
    const r = await safeAsync(() => deleteCacheEntry(key))
    if (r.ok) log.debug('Deleted cache entry:', key)
    else      log.warn('deleteEntry failed:', r.error.message)
    return r
  }

  async deleteEntries(keys: string[]): Promise<Result<void[], Error[]>> {
    const results = await Promise.all(keys.map((k) => this.deleteEntry(k)))
    const errors  = results.filter((r): r is { ok: false; error: Error } => !r.ok)
    if (errors.length > 0) {
      log.warn(`${errors.length}/${keys.length} deletes failed`)
      return err(errors.map((r) => r.error))
    }
    return ok(results.map(() => undefined as void))
  }

  // ── Storage info ────────────────────────────────────────────────────────────

  async getStorageInfo(): Promise<Result<StorageInfo, Error>> {
    return safeAsync(() => getStorageEstimate())
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
// Import this instead of creating new instances.

export const cacheRepo = new CacheRepository()
