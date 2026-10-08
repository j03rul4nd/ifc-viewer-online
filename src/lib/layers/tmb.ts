// ─── tmb ──────────────────────────────────────────────────────────────────────
// Barcelona's buses and metro (TMB) with the USER's own free keys.
//
// Why the user's keys: TMB's free plan is per application. One shared key in
// the app would be spent by everyone at once — so each user registers at
// developer.tmb.cat and pastes app_id / app_key here. They live in this
// browser only (localStorage) and are added to the request at the last moment
// (vector-runner.fetchRaw): never written into a layer's saved URL, never
// exported, never sent anywhere but api.tmb.cat.
//
// What TMB serves (measured 2026-10): CORS open to any origin, so no proxy.
//   /v1/transit/...            static GeoJSON, WGS84 — stops, lines (with the
//                              official colour COLOR_LINIA), metro stations.
//   /v1/itransit/bus/parades/  live: next buses for ONE stop. Never polled for
//                              the whole network — only for the stop the user
//                              selected, every 30 s while it stays selected.

const KEY = 'ifc-tmb-keys:v1'
export const TMB_HOST = 'api.tmb.cat'
const BASE = 'https://api.tmb.cat/v1'

export const TMB_URLS = {
  busStops: `${BASE}/transit/parades`,
  busLines: `${BASE}/transit/linies/bus`,
  metroLines: `${BASE}/transit/linies/metro`,
  metroStations: `${BASE}/transit/estacions`,
} as const

export interface TmbKeys { appId: string; appKey: string }

let keys: TmbKeys | null = read()
const listeners = new Set<() => void>()

function read(): TmbKeys | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as TmbKeys | null
    return v && v.appId && v.appKey ? v : null
  } catch { return null }
}

export function getTmbKeys(): TmbKeys | null { return keys }

export function setTmbKeys(k: TmbKeys | null): void {
  keys = k && k.appId.trim() && k.appKey.trim() ? { appId: k.appId.trim(), appKey: k.appKey.trim() } : null
  try {
    if (keys) localStorage.setItem(KEY, JSON.stringify(keys)); else localStorage.removeItem(KEY)
  } catch { /* private mode: kept for this session only */ }
  for (const l of listeners) l()
}

export function onTmbKeys(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function isTmbUrl(url: string): boolean {
  try { return new URL(url).host === TMB_HOST } catch { return false }
}

/** The request URL with the keys added — only ever built right before fetch. */
export function withTmbKeys(url: string, k: TmbKeys | null = keys): string {
  if (!k || !isTmbUrl(url)) return url
  const u = new URL(url)
  u.searchParams.set('app_id', k.appId)
  u.searchParams.set('app_key', k.appKey)
  return u.toString()
}

/** Strip keys from a URL that may have been pasted with them (saved / shown). */
export function withoutTmbKeys(url: string): string {
  if (!isTmbUrl(url)) return url
  const u = new URL(url)
  u.searchParams.delete('app_id')
  u.searchParams.delete('app_key')
  return u.toString()
}

/** Map a TMB HTTP status to what the user can do about it. */
export function tmbErrorKey(status: number): string | null {
  if (status === 401 || status === 403) return 'error.tmbKey'
  if (status === 429) return 'error.quota'
  return null
}

/** Check a pair of keys with the smallest request there is (metro lines). */
export async function testTmbKeys(k: TmbKeys): Promise<'ok' | 'bad' | 'network'> {
  try {
    const r = await fetch(withTmbKeys(TMB_URLS.metroLines, k))
    if (r.ok) return 'ok'
    return r.status === 401 || r.status === 403 ? 'bad' : 'network'
  } catch { return 'network' }
}

// ── Style by line, with TMB's own colours ─────────────────────────────────────

interface LineInfo { name: string; color: string }

/**
 * Distinct lines in a TMB dataset with their official colour: NOM_LINIA +
 * COLOR_LINIA ("DC241F"). Ordered as TMB orders them (ORDRE_LINIA), else by name.
 */
export function tmbLines(features: Array<{ properties: Record<string, unknown> }>): LineInfo[] {
  const seen = new Map<string, { color: string; order: number }>()
  for (const f of features) {
    const p = f.properties
    const name = p.NOM_LINIA ?? p.PICTO
    if (name === undefined || name === null) continue
    const n = String(name)
    if (seen.has(n)) continue
    const c = String(p.COLOR_LINIA ?? '').replace(/^#/, '')
    seen.set(n, { color: /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : '#888888', order: Number(p.ORDRE_LINIA ?? Infinity) })
  }
  return [...seen.entries()]
    .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([name, v]) => ({ name, color: v.color }))
}

// ── Live: next buses at one stop ──────────────────────────────────────────────

export interface TmbArrival {
  line: string
  destination: string
  /** Minutes until each of the next buses, ascending. */
  minutes: number[]
}

interface ItransitResponse {
  timestamp?: number
  parades?: Array<{
    codi_parada?: string | number
    linies_trajectes?: Array<{
      nom_linia?: string
      codi_linia?: string | number
      desti_trajecte?: string
      propers_busos?: Array<{ temps_arribada?: number }>
    }>
  }>
}

/** iBus response → one row per line and direction, soonest first. */
export function parseArrivals(json: unknown, now = Date.now()): TmbArrival[] {
  const r = json as ItransitResponse
  const at = typeof r?.timestamp === 'number' ? r.timestamp : now
  const out: TmbArrival[] = []
  for (const stop of r?.parades ?? []) {
    for (const route of stop.linies_trajectes ?? []) {
      const minutes = (route.propers_busos ?? [])
        .map((b) => (typeof b.temps_arribada === 'number' ? Math.max(0, Math.round((b.temps_arribada - at) / 60_000)) : NaN))
        .filter((m) => Number.isFinite(m))
        .sort((a, b) => a - b)
      out.push({ line: String(route.nom_linia ?? route.codi_linia ?? '?'), destination: String(route.desti_trajecte ?? ''), minutes })
    }
  }
  return out.sort((a, b) => (a.minutes[0] ?? Infinity) - (b.minutes[0] ?? Infinity))
}

export async function fetchArrivals(stopCode: string, signal?: AbortSignal): Promise<{ ok: true; arrivals: TmbArrival[] } | { ok: false; errorKey: string }> {
  if (!keys) return { ok: false, errorKey: 'error.tmbKey' }
  try {
    const r = await fetch(withTmbKeys(`${BASE}/itransit/bus/parades/${encodeURIComponent(stopCode)}`), { signal })
    if (!r.ok) return { ok: false, errorKey: tmbErrorKey(r.status) ?? 'error.http' }
    return { ok: true, arrivals: parseArrivals(await r.json()) }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return { ok: false, errorKey: 'error.aborted' }
    return { ok: false, errorKey: 'error.network' }
  }
}

/** A TMB bus stop's code from its properties (transit/parades → CODI_PARADA). */
export function tmbStopCode(props: Record<string, unknown>): string | null {
  const c = props.CODI_PARADA
  return c === undefined || c === null || c === '' ? null : String(c)
}
