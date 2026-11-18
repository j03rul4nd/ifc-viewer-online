// ─── Daily reports across reloads ────────────────────────────────────────────
// IndexedDB, in this browser, nothing leaves it. One record per project and
// date (`<project>::<YYYY-MM-DD>`); photos live in snag-store's photo store.

import { sanitizeDailyReport, type DailyReport } from './daily-report'

const DB = 'ifc-site-daily'
const STORE = 'reports'

export const dailyKey = (project: string, date: string) => `${project}::${date}`

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

/** Every report of the project, oldest first. */
export async function loadDailyReports(project: string): Promise<DailyReport[]> {
  const range = IDBKeyRange.bound(`${project}::`, `${project}::￿`)
  const rows = (await run<unknown[]>('readonly', (s) => s.getAll(range) as IDBRequest<unknown[]>)) ?? []
  return rows.map(sanitizeDailyReport).filter((r): r is DailyReport => !!r).sort((a, b) => a.date.localeCompare(b.date))
}

export async function saveDailyReport(project: string, r: DailyReport): Promise<void> {
  await run('readwrite', (s) => { s.put(r, dailyKey(project, r.date)) })
}

export async function deleteDailyReport(project: string, date: string): Promise<void> {
  await run('readwrite', (s) => { s.delete(dailyKey(project, date)) })
}
