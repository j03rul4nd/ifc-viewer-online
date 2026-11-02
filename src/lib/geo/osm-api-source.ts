// ─── osm-api-source ───────────────────────────────────────────────────────────
// The OpenStreetMap API as the map's second source, asked from the browser.
//
// When every Overpass mirror fails, vector tiles give a city without OSM ids or
// fine tags: no landmarks by id, no park paths, footbridges, lifts or tunnels.
// The API has all of it, so its reply is rewritten into the shape `out geom`
// gives and the same parser reads it. It exists for editors, not for maps, so
// it is only a last resort before the tiles and its replies are cached locally.

export interface OsmBbox { south: number; west: number; north: number; east: number }

interface ApiElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  nodes?: number[]
  members?: Array<{ type: string; ref: number; role: string }>
  tags?: Record<string, string>
}

const API_MAP = 'https://api.openstreetmap.org/api/0.6/map.json'
/** Splits per side a too-dense box can go through: 2^3 = 8 boxes a side at most. */
const MAX_SPLIT_DEPTH = 3
const REQUEST_TIMEOUT_MS = 30_000

/** Merge API replies into Overpass `out geom` elements. Untagged geometry stays inline. */
export function osmApiToOverpass(replies: ReadonlyArray<{ elements?: ApiElement[] }>): unknown[] {
  const nodes = new Map<number, ApiElement>()
  const ways = new Map<number, ApiElement>()
  const relations = new Map<number, ApiElement>()
  for (const reply of replies) {
    for (const el of reply.elements ?? []) {
      if (el.type === 'node') nodes.set(el.id, el)
      else if (el.type === 'way') ways.set(el.id, el)
      else if (el.type === 'relation') relations.set(el.id, el)
    }
  }
  const geometryOf = (way: ApiElement): Array<{ lat: number; lon: number }> => {
    const out: Array<{ lat: number; lon: number }> = []
    for (const id of way.nodes ?? []) {
      const n = nodes.get(id)
      if (n?.lat !== undefined && n.lon !== undefined) out.push({ lat: n.lat, lon: n.lon })
    }
    return out
  }
  const out: unknown[] = []
  for (const n of nodes.values()) {
    if (n.tags) out.push({ type: 'node', id: n.id, lat: n.lat, lon: n.lon, tags: n.tags })
  }
  for (const w of ways.values()) {
    if (w.tags) out.push({ type: 'way', id: w.id, tags: w.tags, geometry: geometryOf(w) })
  }
  for (const r of relations.values()) {
    if (!r.tags) continue
    out.push({
      type: 'relation',
      id: r.id,
      tags: r.tags,
      members: (r.members ?? []).flatMap((m) => {
        if (m.type !== 'way') return [m]
        const way = ways.get(m.ref)
        return way ? [{ ...m, geometry: geometryOf(way) }] : []
      }),
    })
  }
  return out
}

/** One box; a box over the API's node limit (HTTP 400) comes back split in four. */
async function fetchBox(box: OsmBbox, depth: number, deadline: number): Promise<Array<{ elements?: ApiElement[] }>> {
  const left = deadline - Date.now()
  if (left <= 0) throw new Error('OSM API: out of time')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(left, REQUEST_TIMEOUT_MS))
  try {
    const bbox = [box.west, box.south, box.east, box.north].map((v) => v.toFixed(6)).join(',')
    const res = await fetch(`${API_MAP}?bbox=${bbox}`, { signal: controller.signal })
    if (res.status === 400 && depth < MAX_SPLIT_DEPTH) {
      const midLat = (box.south + box.north) / 2
      const midLon = (box.west + box.east) / 2
      const quads: OsmBbox[] = [
        { ...box, north: midLat, east: midLon }, { ...box, north: midLat, west: midLon },
        { ...box, south: midLat, east: midLon }, { ...box, south: midLat, west: midLon },
      ]
      const replies: Array<{ elements?: ApiElement[] }> = []
      // One at a time: this is a shared service and the fallback of a fallback.
      for (const q of quads) replies.push(...await fetchBox(q, depth + 1, deadline))
      return replies
    }
    if (!res.ok) throw new Error(`OSM API HTTP ${res.status}`)
    return [await res.json() as { elements?: ApiElement[] }]
  } finally {
    clearTimeout(timer)
  }
}

/** The whole box as Overpass-shaped elements. All of it or an error: never half a city. */
export async function fetchOsmApiElements(box: OsmBbox, budgetMs: number): Promise<unknown[]> {
  return osmApiToOverpass(await fetchBox(box, 0, Date.now() + budgetMs))
}

// ── Local cache ──────────────────────────────────────────────────────────────
// IndexedDB, reachable from the worker. Best effort: any failure is a cache miss.

const DB_NAME = 'ifc-osm-cache'
const STORE = 'replies'
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** A key per site, rounded to about 10 m so a nudged placement still hits. */
export function osmCacheKey(lat: number, lon: number, halfSizeM: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)},${halfSizeM}`
}

export async function readOsmCache(key: string, now = Date.now()): Promise<unknown | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key)
      req.onsuccess = () => {
        const hit = req.result as { at: number; json: unknown } | undefined
        resolve(hit && now - hit.at < CACHE_TTL_MS ? hit.json : null)
      }
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function writeOsmCache(key: string, json: unknown): Promise<void> {
  try {
    const db = await openDb()
    db.transaction(STORE, 'readwrite').objectStore(STORE).put({ at: Date.now(), json }, key)
  } catch {
    // Quota or private mode: the next visit simply downloads again.
  }
}
