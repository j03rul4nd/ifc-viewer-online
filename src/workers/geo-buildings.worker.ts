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

import { bboxAround, OVERPASS_ENDPOINT, overpassRemarkError } from '../lib/geo/buildings'
import {
  newFootprints, extractCovers,
  type OvertureExtract, type OvertureFootprint,
} from '../lib/geo/overture-footprints'
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
      /** Footprints added from the shipped Overture extract. Drives attribution. */
      overture: number
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

    // A busy Overpass answers 200 with an empty body and a `remark`. Treated as
    // success it becomes "nothing is mapped here", which the caller then CACHES
    // — so one unlucky moment blanks the neighbourhood for the whole session
    // and retrying does nothing. Surface it as the failure it is.
    const remark = overpassRemarkError(json)
    if (remark) throw new Error(`Overpass: ${remark}`)

    const elements = (json as { elements?: unknown[] })?.elements

    // Buildings OSM has not mapped yet, from the shipped Overture extract.
    //
    // They are injected as pseudo-Overpass ways rather than parsed separately,
    // on purpose: everything downstream — the local height prior, the surface
    // grain, the audit's estimated count — then treats them exactly like a
    // building that arrived from Overpass. A second parallel path would have to
    // re-derive all of it and would drift the first time one side changed.
    const extra = await overtureExtras(req.lat, req.lon, elements)
    const merged = extra.length > 0 && Array.isArray(elements)
      ? { ...(json as object), elements: [...elements, ...extra] }
      : json

    const features = parseOsmFeatures(merged, { bbox })
    post({
      type: 'done',
      id: req.id,
      features,
      counts: countByKind(features),
      overture: extra.length,
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

/** Where the build step writes its extracts, relative to the app root. */
const OVERTURE_INDEX = '/geo/overture/index.json'

interface OvertureIndex {
  districts?: Array<{ slug?: string; bbox?: [number, number, number, number] }>
}

/**
 * Overture footprints for this site, as pseudo-Overpass ways.
 *
 * Two small same-origin fetches: an index to ask whether any district covers
 * this point, then the district itself. Absent, stale or malformed files are
 * NOT an error — the extract is an enrichment, and a viewer that refuses to
 * draw a city because a supplementary file 404'd would be worse than one that
 * draws the city OSM knows about.
 *
 * The geometric de-duplication runs here rather than in the build step because
 * it must be measured against the OSM data we just fetched: 15% of the
 * ML-sourced rows land on an OSM building anyway, and which ones changes every
 * time somebody maps another block.
 */
async function overtureExtras(
  lat: number, lon: number, elements: unknown[] | undefined,
): Promise<unknown[]> {
  try {
    const idxRes = await fetch(OVERTURE_INDEX)
    if (!idxRes.ok) return []
    const idx = await idxRes.json() as OvertureIndex
    const district = (idx.districts ?? []).find(
      (d) => d.bbox !== undefined && extractCovers({ bbox: d.bbox }, lat, lon),
    )
    if (!district?.slug) return []

    const res = await fetch(`/geo/overture/${district.slug}.json`)
    if (!res.ok) return []
    const data = await res.json() as OvertureExtract
    if (!Array.isArray(data.footprints) || data.footprints.length === 0) return []

    // Compare against what OSM already gave us for this same bbox.
    const osmRings: Array<{ ring: Array<{ lat: number; lon: number }> }> = []
    for (const raw of elements ?? []) {
      const el = raw as { tags?: Record<string, string>; geometry?: Array<{ lat: number; lon: number } | null> }
      if (!el?.tags || !el.geometry) continue
      if (!('building' in el.tags) && !('building:part' in el.tags)) continue
      const ring = el.geometry.filter(
        (p): p is { lat: number; lon: number } =>
          !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon),
      )
      if (ring.length >= 3) osmRings.push({ ring })
    }

    return newFootprints(data.footprints, osmRings).map((f: OvertureFootprint) => ({
      type: 'way',
      // Namespaced so nothing can collide with an OSM way id, and so a picked
      // feature says plainly where it came from.
      id: `ovt-${f.id}`,
      // `building=yes` and nothing else: Overture's China heights are
      // OSM-derived, so these carry none, and inventing a tag here would put a
      // guess beyond the reach of the audit.
      tags: { building: 'yes' },
      geometry: f.ring,
    }))
  } catch {
    return []
  }
}

function post(msg: BuildingsResponse): void {
  self.postMessage(msg)
}
