// ─── history-store ────────────────────────────────────────────────────────────
// Where a live layer's past lives: IndexedDB in the browser (gzip'd frames,
// device-local like everything else), or memory in tests. A SERIES is one
// source (its URL), so history survives reloads and removing/re-adding a layer.
//
// The recorder decides keyframe vs delta (history-codec) and enforces the
// retention window — pruning never strands a delta without the keyframe it
// builds on.

import { nextFrame, toStored, frameBytes, type Frame, type StoredFeature } from './history-codec'
import type { Identity } from './live-feed'
import type { VectorLayerData } from './geojson'

export interface SeriesStats { frames: number; bytes: number; from: number | null; to: number | null }

export interface HistoryBackend {
  put(series: string, frame: Frame): Promise<void>
  load(series: string): Promise<Frame[]>
  /** Delete frames with t < `before`. */
  deleteBefore(series: string, before: number): Promise<void>
  stats(series: string): Promise<SeriesStats>
  clear(series: string): Promise<void>
}

// ── Memory backend (tests, and the fallback when IndexedDB is unavailable) ────

export function memoryBackend(): HistoryBackend {
  const m = new Map<string, Frame[]>()
  const list = (s: string): Frame[] => { let l = m.get(s); if (!l) { l = []; m.set(s, l) } return l }
  return {
    async put(s, f) { const l = list(s); l.push(f); l.sort((a, b) => a.t - b.t) },
    async load(s) { return [...list(s)] },
    async deleteBefore(s, before) { m.set(s, list(s).filter((f) => f.t >= before)) },
    async stats(s) {
      const l = list(s)
      return { frames: l.length, bytes: l.reduce((n, f) => n + frameBytes(f), 0), from: l[0]?.t ?? null, to: l[l.length - 1]?.t ?? null }
    },
    async clear(s) { m.delete(s) },
  }
}

// ── IndexedDB backend ──────────────────────────────────────────────────────────

const DB = 'ifc-layer-history'
const STORE = 'frames'

interface Row { series: string; t: number; kind: Frame['kind']; bytes: number; packed: Uint8Array | string }

async function gzip(text: string): Promise<Uint8Array | string> {
  if (typeof CompressionStream === 'undefined') return text
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch { return text }
}

async function gunzip(p: Uint8Array | string): Promise<string> {
  if (typeof p === 'string') return p
  const stream = new Blob([p as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return }
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => {
        const os = req.result.createObjectStore(STORE, { keyPath: ['series', 't'] })
        os.createIndex('series', 'series')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
}

let dbp: Promise<IDBDatabase | null> | null = null
const db = (): Promise<IDBDatabase | null> => (dbp ??= open())

function rows(d: IDBDatabase, series: string, upper?: number): Promise<Row[]> {
  return new Promise((resolve) => {
    const range = IDBKeyRange.bound([series, -Infinity], [series, upper ?? Infinity], false, upper !== undefined)
    const req = d.transaction(STORE, 'readonly').objectStore(STORE).getAll(range)
    req.onsuccess = () => resolve(req.result as Row[])
    req.onerror = () => resolve([])
  })
}

export function indexedDbBackend(): HistoryBackend {
  const mem = memoryBackend()
  return {
    async put(series, frame) {
      const d = await db()
      if (!d) return mem.put(series, frame)
      const text = JSON.stringify(frame)
      const row: Row = { series, t: frame.t, kind: frame.kind, bytes: text.length, packed: await gzip(text) }
      await new Promise<void>((res) => {
        const tx = d.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(row)
        tx.oncomplete = () => res(); tx.onerror = () => res(); tx.onabort = () => res()
      })
    },
    async load(series) {
      const d = await db()
      if (!d) return mem.load(series)
      const out: Frame[] = []
      for (const r of await rows(d, series)) {
        try { out.push(JSON.parse(await gunzip(r.packed)) as Frame) } catch { /* a damaged frame is skipped */ }
      }
      return out.sort((a, b) => a.t - b.t)
    },
    async deleteBefore(series, before) {
      const d = await db()
      if (!d) return mem.deleteBefore(series, before)
      await new Promise<void>((res) => {
        const tx = d.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).delete(IDBKeyRange.bound([series, -Infinity], [series, before], false, true))
        tx.oncomplete = () => res(); tx.onerror = () => res()
      })
    },
    async stats(series) {
      const d = await db()
      if (!d) return mem.stats(series)
      const rs = await rows(d, series)
      const packed = rs.reduce((n, r) => n + (typeof r.packed === 'string' ? r.packed.length : r.packed.byteLength), 0)
      return { frames: rs.length, bytes: packed, from: rs[0]?.t ?? null, to: rs[rs.length - 1]?.t ?? null }
    },
    async clear(series) {
      const d = await db()
      if (!d) return mem.clear(series)
      await this.deleteBefore(series, Infinity)
    },
  }
}

// ── Recorder ───────────────────────────────────────────────────────────────────

export interface Recorder {
  /** Store one refresh. Returns the frame stored, or null when nothing changed. */
  record(series: string, data: VectorLayerData, id: Identity, t: number, retentionMs: number): Promise<Frame | null>
  /** Forget the in-memory baseline (next record writes a keyframe). */
  reset(series: string): void
}

/**
 * Keeps the previous state per series in memory to compute deltas. After a
 * reload there is no baseline: the first record is a keyframe, which is also
 * what makes every stored stretch rebuildable on its own.
 */
export function createRecorder(backend: HistoryBackend): Recorder {
  const prev = new Map<string, { state: Record<string, StoredFeature>; lastKey: number }>()
  const writes = new Map<string, number>()
  return {
    async record(series, data, id, t, retentionMs) {
      const p = prev.get(series)
      const next = toStored(data, id)
      const frame = nextFrame(p?.state ?? null, next, t, p?.lastKey ?? null)
      prev.set(series, { state: next, lastKey: frame?.kind === 'key' ? t : p?.lastKey ?? t })
      if (!frame) return null
      await backend.put(series, frame)
      // Retention, every 20 writes: drop what is older than the window, but
      // keep the last keyframe at/before the cutoff so the edge still rebuilds.
      const n = (writes.get(series) ?? 0) + 1
      writes.set(series, n)
      if (n % 20 === 0) await prune(backend, series, t - retentionMs)
      return frame
    },
    reset(series) { prev.delete(series) },
  }
}

export async function prune(backend: HistoryBackend, series: string, cutoff: number): Promise<void> {
  const frames = await backend.load(series)
  let keepFrom = -1
  for (const f of frames) if (f.t <= cutoff && f.kind === 'key') keepFrom = f.t
  if (keepFrom > -1) await backend.deleteBefore(series, keepFrom)
}
