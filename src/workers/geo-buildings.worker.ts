// ─── OSM scene features Web Worker ────────────────────────────────────────────
// Fetches the surroundings of a site from OpenStreetMap (Overpass) and parses
// them off the main thread: buildings, water, greenery, trees and bridges in
// ONE query. Parsing a dense neighbourhood is hundreds of thousands of
// coordinates — enough to drop frames if it ran on the UI thread.
//
// One query for every layer is deliberate: it keeps us to a single request per
// site against a shared public service, and makes toggling a layer instant
// rather than a several-second refetch.
//
// Message protocol
// ─────────────────
// IN   { type: 'fetch-buildings', id, lat, lon, halfSizeM }
// OUT  { type: 'done',  id, buildings: BuildingFootprint[], truncated: boolean }
//      { type: 'error', id, message }
//
// No three.js here — the mesh is extruded in geo-system.

import { bboxAround, OVERPASS_ENDPOINT } from '../lib/geo/buildings'
import { parseOsmFeatures, buildFeaturesQuery, countByKind, type OsmFeature, type FeatureKind } from '../lib/geo/osm-features'

/** Server-side budget. Overpass rejects the query if it cannot finish in time. */
const QUERY_TIMEOUT_S = 25
/** Client-side budget, longer than the server's so we see its error, not ours. */
const FETCH_TIMEOUT_MS = 35_000
/**
 * Cap on elements returned; a dense centre must not stream tens of megabytes.
 * Raised from the buildings-only era because ONE query now serves every layer.
 */
const MAX_ELEMENTS = 6000

export interface BuildingsRequest {
  type: 'fetch-buildings'
  id: string
  lat: number
  lon: number
  /** Half the side of the square query area, metres. */
  halfSizeM: number
}

export type BuildingsResponse =
  | {
      type: 'done'
      id: string
      /** Every layer, in one payload — toggling a layer never refetches. */
      features: OsmFeature[]
      counts: Record<FeatureKind, number>
      truncated: boolean
    }
  | { type: 'error'; id: string; message: string }

self.onmessage = (e: MessageEvent<BuildingsRequest>): void => {
  const msg = e.data
  if (msg?.type === 'fetch-buildings') void handleFetch(msg)
}

async function handleFetch(req: BuildingsRequest): Promise<void> {
  try {
    const bbox = bboxAround(req.lat, req.lon, req.halfSizeM)
    const query = buildFeaturesQuery(bbox, QUERY_TIMEOUT_S, MAX_ELEMENTS)

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
    const features = parseOsmFeatures(json, { bbox })
    post({
      type: 'done',
      id: req.id,
      features,
      counts: countByKind(features),
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
