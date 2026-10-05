// ─── tilejson ─────────────────────────────────────────────────────────────────
// Resolve a TileJSON to its tile template. Kept apart from vector-overlay so the
// 2D minimap can use it without pulling 3d-tiles-renderer into its chunk.
// OpenFreeMap versions its tiles weekly — the template is never hard-coded.

const TILEJSON_TIMEOUT_MS = 10_000

export interface TileJson { tiles: string[]; maxzoom?: number }

const tileJsonCache = new Map<string, Promise<TileJson>>()

export function loadTileJson(url: string): Promise<TileJson> {
  let p = tileJsonCache.get(url)
  if (!p) {
    p = (async () => {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), TILEJSON_TIMEOUT_MS)
      try {
        const res = await fetch(url, { signal: ctrl.signal })
        if (!res.ok) throw new Error(`TileJSON ${res.status}`)
        const json = (await res.json()) as TileJson
        if (!Array.isArray(json.tiles) || typeof json.tiles[0] !== 'string') throw new Error('TileJSON without tiles')
        return json
      } finally {
        clearTimeout(timer)
      }
    })()
    // A failed lookup must not poison the session: let the next try refetch.
    p.catch(() => tileJsonCache.delete(url))
    tileJsonCache.set(url, p)
  }
  return p
}

