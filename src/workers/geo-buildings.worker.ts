// ─── Building footprints Web Worker ───────────────────────────────────────────
// Fetches OpenStreetMap building footprints around a site (Overpass) and parses
// them off the main thread. Parsing a dense city block is tens of thousands of
// coordinates — enough to drop frames if it ran on the UI thread.
//
// Message protocol
// ─────────────────
// IN   { type: 'fetch-buildings', id, lat, lon, halfSizeM }
// OUT  { type: 'done',  id, buildings: BuildingFootprint[], truncated: boolean }
//      { type: 'error', id, message }
//
// No three.js here — the mesh is extruded in geo-system.

import {
  parseOverpassBuildings, buildOverpassQuery, bboxAround,
  OVERPASS_ENDPOINT,
  type BuildingFootprint,
} from '../lib/geo/buildings'

/** Server-side budget. Overpass rejects the query if it cannot finish in time. */
const QUERY_TIMEOUT_S = 25
/** Client-side budget, longer than the server's so we see its error, not ours. */
const FETCH_TIMEOUT_MS = 35_000
/** Cap on elements returned; a dense centre must not stream tens of megabytes. */
const MAX_ELEMENTS = 4000

export interface BuildingsRequest {
  type: 'fetch-buildings'
  id: string
  lat: number
  lon: number
  /** Half the side of the square query area, metres. */
  halfSizeM: number
}

export type BuildingsResponse =
  | { type: 'done'; id: string; buildings: BuildingFootprint[]; truncated: boolean }
  | { type: 'error'; id: string; message: string }

self.onmessage = (e: MessageEvent<BuildingsRequest>): void => {
  const msg = e.data
  if (msg?.type === 'fetch-buildings') void handleFetch(msg)
}

async function handleFetch(req: BuildingsRequest): Promise<void> {
  try {
    const bbox = bboxAround(req.lat, req.lon, req.halfSizeM)
    const query = buildOverpassQuery(bbox, QUERY_TIMEOUT_S, MAX_ELEMENTS)

    // AbortController rather than a bare race: a hung request must actually be
    // cancelled, not merely ignored while it keeps the connection open.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    let json: unknown
    try {
      const res = await fetch(OVERPASS_ENDPOINT, {
        method: 'POST',
        // Overpass expects the QL in a form body; this is the documented shape.
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      })
      if (!res.ok) {
        // 429/504 are Overpass telling us it is busy — surface that plainly
        // rather than as a generic failure, since retrying later works.
        throw new Error(`Overpass HTTP ${res.status}`)
      }
      json = await res.json()
    } finally {
      clearTimeout(timer)
    }

    const elements = (json as { elements?: unknown[] })?.elements
    const buildings = parseOverpassBuildings(json)
    post({
      type: 'done',
      id: req.id,
      buildings,
      // Hitting the element cap means the view is showing a partial picture.
      truncated: Array.isArray(elements) && elements.length >= MAX_ELEMENTS,
    })
  } catch (err) {
    post({
      type: 'error',
      id: req.id,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

function post(msg: BuildingsResponse): void {
  self.postMessage(msg)
}
