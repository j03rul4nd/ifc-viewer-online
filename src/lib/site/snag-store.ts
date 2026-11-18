// ─── Snags across reloads ─────────────────────────────────────────────────────
// IndexedDB, in this browser, nothing leaves it. Snags are keyed per project so
// two sites never mix; photos are separate Blobs so listing snags stays cheap.

import type { Snag } from './snags'

const DB = 'ifc-site-snags'
const SNAGS = 'snags'
const PHOTOS = 'photos'

export interface StoredSnag { project: string; snag: Snag }
export interface StoredPhoto { project: string; id: string; blob: Blob; width: number; height: number; createdAt: string }

/** Composite key: project and id, so one store serves every project. */
export const snagKey = (project: string, id: string) => `${project}::${id}`

export function projectKeyRange(project: string): IDBKeyRange {
  return IDBKeyRange.bound(`${project}::`, `${project}::￿`)
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(SNAGS)
      req.result.createObjectStore(PHOTOS)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(store, mode)
      const req = fn(tx.objectStore(store))
      let result: T | undefined
      if (req) req.onsuccess = () => { result = req.result }
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}

export async function loadSnags(project: string): Promise<Snag[]> {
  const rows = (await run<StoredSnag[]>(SNAGS, 'readonly', (s) => s.getAll(projectKeyRange(project)) as IDBRequest<StoredSnag[]>)) ?? []
  return rows.map((r) => r.snag).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

type SnagSavedListener = (project: string, snag: Snag) => void
const listeners = new Set<SnagSavedListener>()

/** Notified after any saveSnag (e.g. a handover defect), so open lists update live. */
export function onSnagSaved(fn: SnagSavedListener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export async function saveSnag(project: string, snag: Snag): Promise<void> {
  await run(SNAGS, 'readwrite', (s) => { s.put({ project, snag } satisfies StoredSnag, snagKey(project, snag.id)) })
  for (const fn of listeners) { try { fn(project, snag) } catch { /* a listener never breaks a save */ } }
}

/** Deletes the snag and its photos. */
export async function deleteSnag(project: string, snag: Snag): Promise<void> {
  await run(SNAGS, 'readwrite', (s) => { s.delete(snagKey(project, snag.id)) })
  if (snag.photoIds.length) await run(PHOTOS, 'readwrite', (s) => { for (const id of snag.photoIds) s.delete(snagKey(project, id)) })
}

export async function savePhoto(photo: StoredPhoto): Promise<void> {
  await run(PHOTOS, 'readwrite', (s) => { s.put(photo, snagKey(photo.project, photo.id)) })
}

export async function loadPhoto(project: string, id: string): Promise<StoredPhoto | undefined> {
  return run<StoredPhoto>(PHOTOS, 'readonly', (s) => s.get(snagKey(project, id)) as IDBRequest<StoredPhoto>)
}

export async function deletePhoto(project: string, id: string): Promise<void> {
  await run(PHOTOS, 'readwrite', (s) => { s.delete(snagKey(project, id)) })
}

export function newPhotoId(): string {
  return `photo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
