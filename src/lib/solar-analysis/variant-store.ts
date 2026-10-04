// ─── variant-store ────────────────────────────────────────────────────────────
// Design variants on the device (IndexedDB), so a comparison survives a reload
// or the next day's session. Typed arrays go in as they are (structured
// clone); a 100 000-sensor variant is ~5 MB. Every call degrades to "nothing
// stored" when IndexedDB is unavailable (private window, blocked storage).

import type { Variant } from './compare'

const DB = 'ifc-solar'
const STORE = 'variants'
/** Kept per device, oldest dropped first. */
export const MAX_VARIANTS = 8

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('no IndexedDB')); return }
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((res, rej) => {
    const t = db.transaction(STORE, mode)
    const r = run(t.objectStore(STORE))
    t.oncomplete = () => { db.close(); res(r.result) }
    t.onerror = () => { db.close(); rej(t.error) }
    t.onabort = () => { db.close(); rej(t.error) }
  }))
}

export async function loadVariants(): Promise<Variant[]> {
  try {
    const all = await tx<Variant[]>('readonly', (s) => s.getAll() as IDBRequest<Variant[]>)
    return all.filter((v) => v && v.elementIndex instanceof Int32Array).sort((a, b) => a.createdAt - b.createdAt)
  } catch { return [] }
}

export async function saveVariant(v: Variant): Promise<void> {
  try {
    await tx('readwrite', (s) => s.put(v))
    const all = await loadVariants()
    for (const old of all.slice(0, Math.max(0, all.length - MAX_VARIANTS))) await deleteVariant(old.id)
  } catch { /* stays in memory only */ }
}

export async function deleteVariant(id: string): Promise<void> {
  try { await tx('readwrite', (s) => s.delete(id)) } catch { /* nothing stored */ }
}
