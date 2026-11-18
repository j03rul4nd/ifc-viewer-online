// ─── Federation library ───────────────────────────────────────────────────────
// Saved federations kept in this browser (IndexedDB) so they can be reopened
// without hunting for the downloaded .ifcfed.json. Manifests only — never IFC
// bytes; nothing leaves the device (ADR D-37). When storage is blocked
// (private mode, disabled IndexedDB) it falls back to memory for the session.

import { parseManifest, type FederationManifestV1 } from './federation-manifest'

export const LIBRARY_CAP = 50
const DB = 'ifc-federation-library'
const STORE = 'manifests'

export interface LibraryEntry {
  id: string
  name: string
  savedAt: number
  modelCount: number
  manifest: FederationManifestV1
}

export interface LibraryBackend {
  getAll(): Promise<LibraryEntry[]>
  put(e: LibraryEntry): Promise<void>
  delete(id: string): Promise<void>
}

export function memoryBackend(): LibraryBackend {
  const map = new Map<string, LibraryEntry>()
  return {
    getAll: async () => [...map.values()],
    put: async (e) => { map.set(e.id, e) },
    delete: async (id) => { map.delete(id) },
  }
}

function idbBackend(): LibraryBackend {
  const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = (): void => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = (): void => resolve(req.result)
    req.onerror = (): void => reject(req.error)
  })
  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open()
    try {
      return await new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = fn(t.objectStore(STORE))
        t.oncomplete = (): void => resolve(req.result)
        t.onerror = (): void => reject(t.error)
        t.onabort = (): void => reject(t.error)
      })
    } finally { db.close() }
  }
  return {
    getAll: () => run<LibraryEntry[]>('readonly', (s) => s.getAll()),
    put: async (e) => { await run('readwrite', (s) => s.put(e)) },
    delete: async (id) => { await run('readwrite', (s) => s.delete(id)) },
  }
}

let backend: LibraryBackend | null = null
let fallback: LibraryBackend | null = null
const mem = (): LibraryBackend => (fallback ??= memoryBackend())

/** Tests inject a backend; `null` resets to the default. */
export function setLibraryBackend(b: LibraryBackend | null): void { backend = b; fallback = null }

function primary(): LibraryBackend {
  if (backend) return backend
  return typeof indexedDB === 'undefined' ? mem() : (backend = idbBackend())
}

async function withFallback<T>(fn: (b: LibraryBackend) => Promise<T>): Promise<T> {
  try { return await fn(primary()) } catch { return fn(mem()) }
}

/** Newest first; entries that no longer parse are skipped. */
export function sortAndValidate(entries: LibraryEntry[]): LibraryEntry[] {
  return entries
    .filter((e) => e && typeof e.id === 'string' && parseManifest(e.manifest).ok)
    .sort((a, b) => b.savedAt - a.savedAt)
}

/** Ids to drop so at most `cap` remain (oldest go first). */
export function overCap(entries: LibraryEntry[], cap = LIBRARY_CAP): string[] {
  return [...entries].sort((a, b) => b.savedAt - a.savedAt).slice(cap).map((e) => e.id)
}

export async function listLibrary(): Promise<LibraryEntry[]> {
  try { return sortAndValidate(await withFallback((b) => b.getAll())) } catch { return [] }
}

/** Keep a manifest (same manifest id replaces the older copy). Never throws. */
export async function saveToLibrary(manifest: FederationManifestV1, now = Date.now()): Promise<boolean> {
  const entry: LibraryEntry = {
    id: manifest.id, name: manifest.name, savedAt: now,
    modelCount: manifest.models.length, manifest,
  }
  try {
    await withFallback(async (b) => {
      await b.put(entry)
      for (const id of overCap(await b.getAll())) await b.delete(id)
    })
    return true
  } catch { return false }
}

export async function deleteFromLibrary(id: string): Promise<void> {
  try { await withFallback((b) => b.delete(id)) } catch { /* nothing to do */ }
}
