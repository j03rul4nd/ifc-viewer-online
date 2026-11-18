// ─── Progress across reloads ──────────────────────────────────────────────────
// IndexedDB, in this browser, nothing leaves it (same pattern as
// lib/drawing/persist). One entry per project key: current records + snapshots.
// A failure (private window, full disk) costs persistence, never the panel.

import type { ProgressRecord, ProgressSnapshot } from './progress'

const DB = 'ifc-site-progress'
const STORE = 'projects'

export interface StoredProgress { records: ProgressRecord[]; snapshots: ProgressSnapshot[]; updatedAt: number }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function loadProgress(projectKey: string): Promise<StoredProgress | null> {
  const db = await open()
  try {
    return await new Promise<StoredProgress | null>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(projectKey)
      req.onsuccess = () => resolve((req.result as StoredProgress | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
  } finally { db.close() }
}

export async function saveProgress(projectKey: string, data: Omit<StoredProgress, 'updatedAt'>): Promise<void> {
  const db = await open()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ ...data, updatedAt: Date.now() }, projectKey)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}

export async function deleteProgress(projectKey: string): Promise<void> {
  const db = await open()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(projectKey)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally { db.close() }
}
