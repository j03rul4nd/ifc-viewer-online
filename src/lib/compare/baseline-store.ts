// ─── compare/baseline-store.ts ────────────────────────────────────────────────
// Saved baselines: the snapshots of a delivery, kept in the browser so next
// week's delivery can be compared against this one without keeping (or
// re-uploading) the old IFC files. A baseline is a named set — "Semana 39",
// "Entrega PB 2026-09-28" — and the list of them is the project's timeline.
//
// IndexedDB, gzip-compressed JSON (a snapshot is ~10× smaller than its IFC
// before compression and compresses another ~8×). Nothing leaves the device.
// Baselines can also be exported as a file and imported on another machine —
// that is how a team shares them without a server.

import type { ModelSnapshot } from './types'

const DB = 'ifc-version-baselines'
const STORE = 'baselines'
const INDEX_STORE = 'index'

export interface BaselineSummary {
  id: string
  label: string
  createdAt: number
  files: Array<{ fileName: string; elements: number; schema: string | null }>
  elements: number
  /** IDS score at save time, when one was run (timeline chart). */
  idsScore?: number | null
  bytes: number
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = (): void => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      if (!db.objectStoreNames.contains(INDEX_STORE)) db.createObjectStore(INDEX_STORE, { keyPath: 'id' })
    }
    req.onsuccess = (): void => resolve(req.result)
    req.onerror = (): void => reject(req.error)
  })
}

function tx<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode)
    const req = fn(t)
    t.oncomplete = (): void => resolve(req ? req.result : undefined)
    t.onerror = (): void => reject(t.error)
    t.onabort = (): void => reject(t.error)
  })
}

export async function gzipJson(value: unknown): Promise<Blob> {
  const blob = new Blob([JSON.stringify(value)], { type: 'application/json' })
  if (typeof CompressionStream === 'undefined') return blob
  return new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob()
}

export async function gunzipJson<T>(blob: Blob): Promise<T> {
  // Sniff the gzip magic: an uncompressed blob (old browser) parses directly.
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
  const text = head[0] === 0x1f && head[1] === 0x8b
    ? await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : await blob.text()
  return JSON.parse(text) as T
}

export async function listBaselines(): Promise<BaselineSummary[]> {
  const db = await open()
  try {
    const all = await tx<BaselineSummary[]>(db, [INDEX_STORE], 'readonly', (t) => t.objectStore(INDEX_STORE).getAll())
    return (all ?? []).sort((a, b) => b.createdAt - a.createdAt)
  } finally { db.close() }
}

export async function saveBaseline(label: string, snapshots: ModelSnapshot[], idsScore?: number | null, createdAt = Date.now()): Promise<BaselineSummary> {
  const blob = await gzipJson(snapshots)
  const summary: BaselineSummary = {
    id: crypto.randomUUID(), label, createdAt,
    files: snapshots.map((s) => ({ fileName: s.fileName, elements: s.elements.length, schema: s.schema })),
    elements: snapshots.reduce((n, s) => n + s.elements.length, 0),
    idsScore: idsScore ?? null, bytes: blob.size,
  }
  const db = await open()
  try {
    await tx(db, [STORE, INDEX_STORE], 'readwrite', (t) => {
      t.objectStore(STORE).put(blob, summary.id)
      t.objectStore(INDEX_STORE).put(summary)
    })
  } finally { db.close() }
  return summary
}

export async function loadBaseline(id: string): Promise<ModelSnapshot[]> {
  const db = await open()
  try {
    const blob = await tx<Blob>(db, [STORE], 'readonly', (t) => t.objectStore(STORE).get(id))
    if (!blob) throw new Error('baseline not found')
    return gunzipJson<ModelSnapshot[]>(blob)
  } finally { db.close() }
}

export async function deleteBaseline(id: string): Promise<void> {
  const db = await open()
  try {
    await tx(db, [STORE, INDEX_STORE], 'readwrite', (t) => {
      t.objectStore(STORE).delete(id)
      t.objectStore(INDEX_STORE).delete(id)
    })
  } finally { db.close() }
}

/** Portable file: `.ifcbaseline` = gzip JSON { format, label, createdAt, snapshots }. */
export async function exportBaselineFile(id: string): Promise<{ blob: Blob; fileName: string }> {
  const list = await listBaselines()
  const summary = list.find((b) => b.id === id)
  if (!summary) throw new Error('baseline not found')
  const snapshots = await loadBaseline(id)
  const blob = await gzipJson({ format: 'ifc-baseline', version: 1, label: summary.label, createdAt: summary.createdAt, idsScore: summary.idsScore ?? null, snapshots })
  const safe = summary.label.replace(/[^\p{L}\p{N}_ -]+/gu, '').trim() || 'baseline'
  return { blob, fileName: `${safe}.ifcbaseline` }
}

export async function importBaselineFile(file: Blob): Promise<BaselineSummary> {
  const data = await gunzipJson<{ format?: string; label?: string; createdAt?: number; idsScore?: number | null; snapshots?: ModelSnapshot[] }>(file)
  if (data.format !== 'ifc-baseline' || !Array.isArray(data.snapshots)) throw new Error('not a baseline file')
  return saveBaseline(data.label ?? 'Imported', data.snapshots, data.idsScore, data.createdAt ?? Date.now())
}
