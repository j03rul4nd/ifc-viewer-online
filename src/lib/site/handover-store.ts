// ─── Handovers across reloads ─────────────────────────────────────────────────
// IndexedDB, in this browser, nothing leaves it. Keyed per project like
// snag-store so two sites never mix. Signed handovers can't be deleted here.

import { sanitizeHandover, type Handover } from './handover'

const DB = 'ifc-site-handovers'
const STORE = 'handovers'

export const handoverKey = (project: string, id: string) => `${project}::${id}`

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      let result: T | undefined
      if (req) req.onsuccess = () => { result = req.result }
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}

/** Newest first; malformed records are skipped. */
export async function loadHandovers(project: string, unitId?: string): Promise<Handover[]> {
  const range = IDBKeyRange.bound(`${project}::`, `${project}::￿`)
  const rows = (await run<unknown[]>('readonly', (s) => s.getAll(range) as IDBRequest<unknown[]>)) ?? []
  return rows.map(sanitizeHandover).filter((h): h is Handover => !!h && (!unitId || h.unitId === unitId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function saveHandover(project: string, h: Handover): Promise<void> {
  await run('readwrite', (s) => { s.put(h, handoverKey(project, h.id)) })
}

export async function deleteHandoverDraft(project: string, h: Handover): Promise<void> {
  if (h.status === 'signed') throw new Error('Signed handovers are read-only')
  await run('readwrite', (s) => { s.delete(handoverKey(project, h.id)) })
}
