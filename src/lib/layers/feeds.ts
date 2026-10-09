// ─── feeds ────────────────────────────────────────────────────────────────────
// Live sources do not all refresh the same way, and asking every one "every
// 5 s" is wrong in both directions — it hammers some and under-samples others.
// Each protocol says, in its own words, how fresh its data is and when it is
// worth asking again. This module reads those words.
//
// Measured on the Barcelona sources (2026-10):
//   Bicing      GBFS 3.0: gbfs.json → station_information (static) + station_status
//               (ttl 0, max-age 0, CORS *). Join on station_id.
//   FGC trains  Opendatasoft: /exports/geojson, no-cache, CORS *, and a QUOTA:
//               x-ratelimit-limit 5000/day — at 2 s it would be gone by lunch.
//   Renfe       GTFS-Realtime (.pb, and a .json variant): max-age=30 + Expires +
//               ETag — and NO CORS: a browser cannot read it without a proxy.
//
// Every adapter returns GeoJSON text (what the layer pipeline eats) plus
// FRESHNESS: when the data was produced, how long it stays valid, and a
// fingerprint to skip rebuilding when nothing changed.

import { parseCellTime } from './table-transforms'

export type FeedKind = 'geojson' | 'gbfs' | 'gtfs-rt' | 'ods' | 'wfs' | 'join'

export interface Freshness {
  /** When the SOURCE produced this data (feed timestamp), ms — not when we fetched it. */
  dataAt: number | null
  /** Seconds the source says the data stays valid (ttl / max-age / Expires). */
  validForS: number | null
  /** Changes iff the content changed: last_updated, feed timestamp, ETag… */
  fingerprint: string | null
  /** Requests left in the current quota window, and when it resets (ms). */
  quota: { remaining: number; limit: number; resetAt: number } | null
}

export interface FeedResult {
  text: string
  freshness: Freshness
}

export type FeedError =
  | 'error.network' | 'error.http' | 'error.cors' | 'error.notGbfs' | 'error.notGtfsRt' | 'error.aborted'

/** Server-side freshness from HTTP headers (Cache-Control, Expires, Age, ETag, Last-Modified). */
export function httpFreshness(h: Headers, now = Date.now()): Freshness {
  const cc = h.get('cache-control') ?? ''
  let validForS: number | null = null
  // Several Cache-Control headers arrive joined with ", " — Renfe sends two.
  const maxAge = /(?:^|[,\s])max-age=(\d+)/i.exec(cc)
  if (/no-store|no-cache/i.test(cc)) validForS = 0
  else if (maxAge) validForS = Math.max(0, Number(maxAge[1]) - Number(h.get('age') ?? 0))
  else {
    const exp = Date.parse(h.get('expires') ?? '')
    if (Number.isFinite(exp)) validForS = Math.max(0, Math.round((exp - now) / 1000))
  }
  const lm = Date.parse(h.get('last-modified') ?? '')
  return {
    dataAt: Number.isFinite(lm) ? lm : null,
    validForS,
    fingerprint: h.get('etag') ?? (Number.isFinite(lm) ? `lm:${lm}` : null),
    quota: quotaOf(h),
  }
}

/** Opendatasoft (and other) rate-limit headers, when exposed to the page. */
function quotaOf(h: Headers): Freshness['quota'] {
  const remaining = Number(h.get('x-ratelimit-remaining'))
  const limit = Number(h.get('x-ratelimit-limit'))
  const resetRaw = h.get('x-ratelimit-reset')
  if (!Number.isFinite(remaining) || !resetRaw || h.get('x-ratelimit-remaining') === null) return null
  // ODS sends a datetime ("2026-10-09 00:00:00+00:00"); others send epoch seconds.
  const asNum = Number(resetRaw)
  const resetAt = Number.isFinite(asNum) && asNum > 0
    ? (asNum < 1e12 ? asNum * 1000 : asNum)
    : Date.parse(resetRaw.replace(' ', 'T'))
  return Number.isFinite(resetAt) ? { remaining, limit: Number.isFinite(limit) ? limit : remaining, resetAt } : null
}

/**
 * When to ask again. The user's interval is a WISH; the source has the last
 * word in two directions:
 *   • never sooner than the data can change (validForS), with a 2 s floor;
 *   • never faster than the quota allows: spread what is left until the reset,
 *     keeping a 20 % reserve for the user's own clicks and restarts.
 */
export function plannedDelayMs(intervalS: number, f: Freshness | null, now = Date.now()): number {
  let ms = Math.max(2, intervalS) * 1000
  if (f?.validForS && f.validForS > 0) ms = Math.max(ms, f.validForS * 1000)
  if (f?.quota) {
    const left = Math.max(1, f.quota.remaining * 0.8)
    const window = Math.max(0, f.quota.resetAt - now)
    ms = Math.max(ms, Math.ceil(window / left))
  }
  return Math.min(ms, 3_600_000)
}

/** Kind of an URL, by shape — the user should not have to say "this is GBFS". */
export function detectFeedKind(url: string, body?: unknown): FeedKind {
  if (/\/gbfs(\.json)?$|gbfs\/v?[\d.]+\/gbfs/i.test(url)) return 'gbfs'
  if (/\/api\/explore\/v2(\.\d)?\/catalog\/datasets\//i.test(url)) return 'ods'
  if (/gtfs-?rt|vehicle_?positions|tripupdates|trip_updates/i.test(url)) return 'gtfs-rt'
  if (/[?&]service=wfs/i.test(url) || /\/wfs\b/i.test(url)) return 'wfs'
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    if (b.header && Array.isArray(b.entity)) return 'gtfs-rt'
    if (b.data && typeof b.ttl === 'number') return 'gbfs'
  }
  return 'geojson'
}

// ── GBFS ───────────────────────────────────────────────────────────────────────

interface GbfsEnvelope { last_updated?: number | string; ttl?: number; version?: string; data?: unknown }

const gbfsTime = (v: number | string | undefined): number | null => {
  if (v === undefined) return null
  // GBFS ≤ 2.x: POSIX seconds. 3.0: RFC 3339.
  if (typeof v === 'number') return v * 1000
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}

/** Feed URLs from an auto-discovery document (2.x per-language or 3.0 flat). */
export function gbfsFeedUrls(doc: GbfsEnvelope, lang = 'en'): Record<string, string> {
  const data = doc.data as Record<string, unknown> | undefined
  if (!data) return {}
  const feeds = (Array.isArray(data.feeds) ? data.feeds
    : ((data[lang] ?? Object.values(data)[0]) as { feeds?: unknown[] } | undefined)?.feeds) as Array<{ name: string; url: string }> | undefined
  return Object.fromEntries((feeds ?? []).map((f) => [f.name, f.url]))
}

/** GBFS 2/3 names differ ("name" string vs [{text, language}]). */
function gbfsText(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return (v[0] as { text?: string } | undefined)?.text ?? null
  return null
}

/**
 * Join station_information (where, what) with station_status (how it is now)
 * into GeoJSON points. Vehicle-type counts (mechanical vs e-bike) become their
 * own properties so a rule can colour "no e-bikes left".
 */
export function gbfsToGeoJson(info: GbfsEnvelope, status: GbfsEnvelope): string {
  const st = (status.data as { stations?: Array<Record<string, unknown>> } | undefined)?.stations ?? []
  const byId = new Map(st.map((s) => [String(s.station_id), s]))
  const stations = (info.data as { stations?: Array<Record<string, unknown>> } | undefined)?.stations ?? []
  const features = stations
    .filter((s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lon)))
    .map((s) => {
      const live = byId.get(String(s.station_id)) ?? {}
      const types = Object.fromEntries(
        ((live.vehicle_types_available as Array<{ vehicle_type_id: string; count: number }>) ?? [])
          .map((t) => [`available_${t.vehicle_type_id}`, t.count]),
      )
      const bikes = Number(live.num_vehicles_available ?? live.num_bikes_available ?? 0)
      const docks = Number(live.num_docks_available ?? 0)
      const renting = live.is_renting !== false && live.is_installed !== false
      return {
        type: 'Feature',
        id: String(s.station_id),
        properties: {
          station_id: String(s.station_id),
          name: gbfsText(s.name) ?? String(s.station_id),
          address: s.address ?? null,
          capacity: s.capacity ?? null,
          bikes_available: bikes,
          // 0 = empty … 1 = full: what a hexbin / ramp reads directly.
          occupancy: Number(s.capacity) > 0 ? Math.round((bikes / Number(s.capacity)) * 100) / 100 : null,
          docks_available: docks,
          ...types,
          // A ready-made category for "style by": what a rider needs to know.
          state: !renting ? 'out_of_service' : bikes === 0 ? 'empty' : docks === 0 ? 'full' : bikes <= 2 ? 'low' : 'ok',
          last_reported: live.last_reported ?? null,
        },
        geometry: { type: 'Point', coordinates: [Number(s.lon), Number(s.lat)] },
      }
    })
  return JSON.stringify({ type: 'FeatureCollection', features })
}

export function gbfsFreshness(status: GbfsEnvelope): Partial<Freshness> {
  const at = gbfsTime(status.last_updated)
  return {
    dataAt: at,
    // ttl 0 means "real time": the transport layer decides; it is not "never".
    validForS: typeof status.ttl === 'number' && status.ttl > 0 ? status.ttl : null,
    fingerprint: at !== null ? `gbfs:${at}` : null,
  }
}

// ── GTFS-Realtime (JSON variant) ───────────────────────────────────────────────

interface GtfsRtJson {
  header?: { timestamp?: string | number }
  entity?: Array<{
    id: string
    vehicle?: {
      trip?: { tripId?: string; routeId?: string }
      position?: { latitude: number; longitude: number; bearing?: number; speed?: number }
      currentStatus?: string
      timestamp?: string | number
      stopId?: string
      vehicle?: { id?: string; label?: string }
    }
  }>
}

/**
 * VehiclePositions → GeoJSON points. The vehicle id is the identity across
 * refreshes (entity ids can be per-message in some feeds). Renfe's labels
 * carry the line ("C5-23713-PLATF.(5)"), which is lifted into `line`.
 */
export function gtfsRtToGeoJson(feed: GtfsRtJson, bbox?: [number, number, number, number] | null): string {
  const features = (feed.entity ?? [])
    .filter((e) => e.vehicle?.position && Number.isFinite(e.vehicle.position.latitude))
    .filter((e) => {
      if (!bbox) return true
      const { latitude: lat, longitude: lon } = e.vehicle!.position!
      return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]
    })
    .map((e) => {
      const v = e.vehicle!
      const label = v.vehicle?.label ?? ''
      return {
        type: 'Feature',
        id: v.vehicle?.id ?? e.id,
        properties: {
          vehicle_id: v.vehicle?.id ?? e.id,
          label,
          // "R2N-28424-PLATF.(2)" → R2N: Rodalies branches carry a letter (R2N/R2S).
          line: v.trip?.routeId ?? (/^([A-Z]+\d+[A-Z]?)-/.exec(label)?.[1] ?? null),
          trip_id: v.trip?.tripId ?? null,
          status: v.currentStatus ?? null,
          stop_id: v.stopId ?? null,
          bearing: v.position!.bearing ?? null,
          speed_ms: v.position!.speed ?? null,
          timestamp: v.timestamp ? new Date(Number(v.timestamp) * 1000).toISOString() : null,
        },
        geometry: { type: 'Point', coordinates: [v.position!.longitude, v.position!.latitude] },
      }
    })
  return JSON.stringify({ type: 'FeatureCollection', features })
}

export function gtfsRtFreshness(feed: GtfsRtJson): Partial<Freshness> {
  const ts = Number(feed.header?.timestamp)
  return Number.isFinite(ts) && ts > 0 ? { dataAt: ts * 1000, fingerprint: `gtfsrt:${ts}` } : {}
}

// ── Opendatasoft ───────────────────────────────────────────────────────────────

/** Dataset base + id from any Opendatasoft URL (records API, explore page, export). */
export function odsDataset(url: string): { base: string; id: string } | null {
  const m = /^(https?:\/\/[^/]+)\/(?:api\/explore\/v2(?:\.\d)?\/catalog\/datasets|explore\/dataset)\/([^/?#]+)/i.exec(url)
  return m ? { base: m[1], id: m[2] } : null
}

/** Dataset metadata URL — read once, for the geo field and the processing time. */
export function odsMetaUrl(ds: { base: string; id: string }): string {
  return `${ds.base}/api/explore/v2.1/catalog/datasets/${ds.id}`
}

/** The dataset's geometry field (geo_point_2d / geo_shape), from its metadata. */
export function odsGeoField(meta: unknown): string | null {
  const fields = (meta as { fields?: Array<{ name: string; type: string }> })?.fields ?? []
  return fields.find((f) => f.type === 'geo_point_2d')?.name ?? fields.find((f) => f.type === 'geo_shape')?.name ?? null
}

/**
 * The GeoJSON export, limited to the site. Measured: the export IGNORES
 * `geofilter.bbox` (55 trains back for a 27-train box) and honours an ODSQL
 * `where=in_bbox(<geo field>, lat1, lon1, lat2, lon2)` — whose field name
 * differs per dataset, hence odsGeoField.
 */
export function odsGeoJsonUrl(
  ds: { base: string; id: string }, geoField: string | null, bbox?: [number, number, number, number] | null,
): string {
  const out = new URL(`${ds.base}/api/explore/v2.1/catalog/datasets/${ds.id}/exports/geojson`)
  if (bbox && geoField) {
    const [w, s, e, n] = bbox
    out.searchParams.set('where', `in_bbox(${geoField},${s},${w},${n},${e})`)
  }
  return out.toString()
}

// ── Tables (status feeds without geometry) ─────────────────────────────────────

/**
 * Newest timestamp in a table column, when it holds machine timestamps:
 * 14-digit compact (20261008171601, Barcelona's traffic), ISO 8601, or epoch.
 * A time without an offset is read in `timeZone` when the source names one
 * (its own city's zone: a viewer in Tokyo must not shift Barcelona by 7 h),
 * else as the viewer's local time.
 */
export function tableTime(values: string[], timeZone?: string): number | null {
  let best: number | null = null
  for (const raw of values.slice(0, 2000)) {
    const v = raw.trim()
    let t = NaN
    if (timeZone) t = parseCellTime(v, timeZone)
    else {
      const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(v)
      if (m) t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime()
      else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v)) t = Date.parse(v.replace(' ', 'T'))
      else if (/^\d{10}$/.test(v)) t = Number(v) * 1000
      else if (/^\d{13}$/.test(v)) t = Number(v)
    }
    if (Number.isFinite(t) && (best === null || t > best)) best = t
  }
  return best
}

/**
 * How long to wait before asking again after a TRANSIENT refusal — 429 or a
 * 5xx — or null to stop. Measured on Barcelona's open-data portal: four
 * requests at once from one browser (a scene opening) drew an error on one of
 * them that a second request a few seconds later did not. Two retries, short,
 * jittered so several layers do not come back in step; `Retry-After` is
 * honoured when the server sends one (and is reasonable).
 */
export function transientRetryMs(res: { status: number; headers: Headers }, attempt: number, random = Math.random): number | null {
  if (attempt >= 2 || !(res.status === 429 || (res.status >= 500 && res.status <= 504))) return null
  const ra = Number(res.headers.get('retry-after'))
  if (Number.isFinite(ra) && ra > 0 && ra <= 20) return ra * 1000
  return Math.round(1500 * 2 ** attempt * (0.85 + random() * 0.3))
}
