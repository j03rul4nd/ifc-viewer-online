// ─── Unit statuses across reloads ─────────────────────────────────────────────
// IndexedDB, in this browser, nothing leaves it. One record per project key
// (e.g. the model file names). A failure (private window, full disk) costs
// persistence, never the statuses on screen.

import { isUnitStatus, type UnitState } from './units'

const DB = 'ifc-site-units'
const STORE = 'projects'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Stable project key from the loaded models' file names. */
export function projectKey(fileNames: readonly string[]): string {
  return [...fileNames].sort().join('|')
}

/** Drops anything malformed from a stored record. */
export function sanitizeStates(raw: unknown): Record<string, UnitState> {
  const out: Record<string, UnitState> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const s = v as Partial<UnitState> | null
    if (!s || !isUnitStatus(s.status)) continue
    out[k] = {
      status: s.status,
      ...(typeof s.buyer === 'string' && s.buyer ? { buyer: s.buyer } : {}),
      ...(typeof s.notes === 'string' && s.notes ? { notes: s.notes } : {}),
    }
  }
  return out
}

export async function loadUnitStates(project: string): Promise<Record<string, UnitState>> {
  const db = await open()
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(project)
      req.onsuccess = () => resolve(sanitizeStates(req.result))
      req.onerror = () => reject(req.error)
    })
  } finally { db.close() }
}

export async function saveUnitStates(project: string, states: Record<string, UnitState>): Promise<void> {
  const db = await open()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(states, project)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}
