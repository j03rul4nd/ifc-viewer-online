// ─── Sheets across reloads ────────────────────────────────────────────────────
// IndexedDB, in this browser, nothing leaves it. A failure (private window, full
// disk) costs persistence, never the sheet on screen: the dock tells the user.

import type { Drawing } from './types'

const DB = 'ifc-drawings'
const STORE = 'sheets'

export interface StoredSheet { drawing: Drawing; pdf?: Uint8Array; order: number }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function loadSheets(): Promise<StoredSheet[]> {
  const db = await open()
  try {
    return await new Promise<StoredSheet[]>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).getAll()
      req.onsuccess = () => resolve((req.result as StoredSheet[]).sort((a, b) => a.order - b.order))
      req.onerror = () => reject(req.error)
    })
  } finally { db.close() }
}

/** Writes what changed and drops what is gone, in one transaction. */
export async function saveSheets(put: StoredSheet[], keep: readonly string[]): Promise<void> {
  const db = await open()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      for (const s of put) store.put(s, s.drawing.id)
      const keys = store.getAllKeys()
      keys.onsuccess = () => { for (const k of keys.result) if (!keep.includes(String(k))) store.delete(k) }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}
