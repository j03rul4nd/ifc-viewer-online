// ─── weather-store ────────────────────────────────────────────────────────────
// Hour-by-hour weather on the device (IndexedDB): the years of ERA5 hours a
// place was fetched with, so the next visit pairs real hours again without a
// new request to the weather service. ~0.9 MB a place for five years — too
// big for localStorage, where the 12 × 24 typical sky lives — and the typed
// arrays go in as they are (structured clone). Only the most recent few are
// kept. Every call degrades to "nothing stored" when IndexedDB is unavailable
// (private window, blocked storage).
//
// This module only knows the shape (a type import), so climate.ts can use it
// without a cycle.

import type { HourlyWeather } from './weather'

const DB = 'ifc-weather'
const STORE = 'hourly'
/** Places kept per device, the least recently saved dropped first. */
export const MAX_HOURLY = 4
/** HOURS_PER_YEAR of weather.ts. */
const GRID_HOURS = 8760

interface Row {
  key: string
  savedAt: number
  weather: HourlyWeather
}

/** The cache key of a place's ERA5 hours: the request's own rounding (~1 km). */
export function era5Key(lat: number, lon: number): string {
  return `era5:${lat.toFixed(2)},${lon.toFixed(2)}`
}

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('no IndexedDB')); return }
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        // Indexed by date so the trim reads keys only, never the megabytes of hours.
        req.result.createObjectStore(STORE, { keyPath: 'key' }).createIndex('savedAt', 'savedAt')
      }
    }
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}

/** Run requests in one transaction; resolves with the result of the request `run` returns, once committed. */
function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((res, rej) => {
    const t = db.transaction(STORE, mode)
    const r = run(t.objectStore(STORE))
    t.oncomplete = () => { db.close(); res(r.result) }
    t.onerror = () => { db.close(); rej(t.error) }
    t.onabort = () => { db.close(); rej(t.error) }
  }))
}

/** A stored value still has the shape the engine reads (an older or damaged record does not). */
function isHourly(w: unknown): w is HourlyWeather {
  if (!w || typeof w !== 'object') return false
  const h = w as Partial<HourlyWeather>
  const size = (h.layers ?? 0) * GRID_HOURS
  return size > 0 && [h.ghi, h.dni, h.dhi, h.temp, h.sun].every((a) => a instanceof Float32Array && a.length === size)
}

export async function saveHourly(key: string, w: HourlyWeather): Promise<void> {
  try {
    await tx('readwrite', (s) => {
      const put = s.put({ key, savedAt: Date.now(), weather: w } satisfies Row)
      // Requests of a transaction run in order: the keys below include this one.
      const keys = s.index('savedAt').getAllKeys()
      keys.onsuccess = () => {
        for (const old of keys.result.slice(0, Math.max(0, keys.result.length - MAX_HOURLY))) s.delete(old)
      }
      return put
    })
  } catch { /* stays in memory only */ }
}

export async function loadHourly(key: string): Promise<HourlyWeather | null> {
  try {
    const row = await tx<Row | undefined>('readonly', (s) => s.get(key) as IDBRequest<Row | undefined>)
    return row && isHourly(row.weather) ? row.weather : null
  } catch { return null }
}
