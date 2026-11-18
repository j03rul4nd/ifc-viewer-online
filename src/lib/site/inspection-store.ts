// ─── Inspections and templates across reloads ────────────────────────────────
// IndexedDB, in this browser, nothing leaves it. Inspections are keyed per
// project (siteProjectKey) like snag-store; the user's templates are shared by
// every project. Photos live in snag-store's photo store. Signed inspections
// can't be deleted here.

import { sanitizeInspection, sanitizeTemplate, type Inspection, type InspectionTemplate } from './inspections'

const DB = 'ifc-site-inspections'
const INSPECTIONS = 'inspections'
const TEMPLATES = 'templates'

export const inspectionKey = (project: string, id: string) => `${project}::${id}`

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(INSPECTIONS)
      req.result.createObjectStore(TEMPLATES)
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

/** Newest first; malformed records are skipped. */
export async function loadInspections(project: string): Promise<Inspection[]> {
  const range = IDBKeyRange.bound(`${project}::`, `${project}::￿`)
  const rows = (await run<unknown[]>(INSPECTIONS, 'readonly', (s) => s.getAll(range) as IDBRequest<unknown[]>)) ?? []
  return rows.map(sanitizeInspection).filter((i): i is Inspection => !!i)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
}

export async function saveInspection(project: string, i: Inspection): Promise<void> {
  await run(INSPECTIONS, 'readwrite', (s) => { s.put(i, inspectionKey(project, i.id)) })
}

export async function deleteInspectionDraft(project: string, i: Inspection): Promise<void> {
  if (i.status === 'signed') throw new Error('Signed inspections are read-only')
  await run(INSPECTIONS, 'readwrite', (s) => { s.delete(inspectionKey(project, i.id)) })
}

export async function loadTemplates(): Promise<InspectionTemplate[]> {
  const rows = (await run<unknown[]>(TEMPLATES, 'readonly', (s) => s.getAll() as IDBRequest<unknown[]>)) ?? []
  return rows.map(sanitizeTemplate).filter((t): t is InspectionTemplate => !!t).sort((a, b) => a.name.localeCompare(b.name))
}

export async function saveTemplate(t: InspectionTemplate): Promise<void> {
  if (t.builtIn) throw new Error('Built-in templates are not stored')
  await run(TEMPLATES, 'readwrite', (s) => { s.put(t, t.id) })
}

export async function deleteTemplate(id: string): Promise<void> {
  await run(TEMPLATES, 'readwrite', (s) => { s.delete(id) })
}
