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
  newFootprints, extractCovers, clearsModelPlan,
  type OvertureExtract, type OvertureFootprint,
} from '../lib/geo/overture-footprints'
import { latLonToNormalized } from '../lib/geo/geo-math'
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

/** A model's plan as it survives a structured clone into the worker. */
export type PlanPolygon = ReadonlyArray<{ x: number; y: number }>

export interface BuildingsRequest {
  type: 'fetch-buildings'
  id: string
  lat: number
  lon: number
  /** Half the side of the square query area, metres. */
  halfSizeM: number
  /**
   * The model's own plan, in normalized planar coordinates.
   *
   * Only the Overture merge reads it, and only to REFUSE footprints — see
   * `overtureExtras`. OSM context is filtered against the model later and far
   * more carefully, by `createSuppressor`, which knows what kind of facility
   * the model is and what it is therefore entitled to replace.
   */
  modelPlan?: PlanPolygon[]
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
    const extra = await overtureExtras(req.lat, req.lon, elements, req.modelPlan ?? [])
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

/**
 * How long the enrichment gets before it is abandoned, milliseconds.
 *
 * Far shorter than `FETCH_TIMEOUT_MS`, and the asymmetry is the point. Overpass
 * is the neighbourhood; these two files are a bonus on top of it. Without a
 * budget of their own a stalled static file would hold the worker until the
 * CALLER's timeout fired and the whole build came back as "buildings request
 * timed out" — turning a slow bonus into no map at all. Two seconds is
 * generous for a same-origin file that is 44 KB at its largest.
 */
const OVERTURE_TIMEOUT_MS = 2_000

/** One district in the shipped index. Everything optional: it is a file on disk. */
interface OvertureDistrict {
  slug?: string
  bbox?: [number, number, number, number]
}

interface OvertureIndex {
  districts?: OvertureDistrict[]
}

/** The bit of an Overpass element the Overture de-duplication reads. */
interface OverpassBuildingLike {
  tags?: Record<string, string>
  geometry?: Array<{ lat: number; lon: number } | null>
}

/**
 * An Overture footprint dressed as an Overpass way.
 *
 * Named rather than left anonymous because the SHAPE IS THE CONTRACT: it is
 * what lets these footprints go through `parseOsmFeatures` beside everything
 * Overpass sent, and therefore inherit the local height prior, the surface
 * grain and the audit's estimated count without a second code path. If this
 * ever drifts from what the parser reads, the footprints stop being buildings
 * and start being nothing, silently.
 */
interface PseudoOverpassWay {
  type: 'way'
  id: string
  tags: Record<string, string>
  geometry: Array<{ lat: number; lon: number }>
}

/**
 * Fetch JSON with a budget of its own, or give up quietly.
 *
 * Returns null for every failure — offline, 404, malformed, too slow — because
 * every one of them means the same thing to the caller: draw the city OSM knows
 * about. A viewer that refused to render a neighbourhood because a
 * supplementary file was slow would be worse than one that never had it.
 */
async function fetchJsonWithin<T>(url: string, timeoutMs: number): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    return await res.json() as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
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
  lat: number, lon: number, elements: readonly unknown[] | undefined,
  modelPlan: readonly PlanPolygon[],
): Promise<PseudoOverpassWay[]> {
  try {
    const idx = await fetchJsonWithin<OvertureIndex>(OVERTURE_INDEX, OVERTURE_TIMEOUT_MS)
    if (!idx) return []
    const district = (idx.districts ?? []).find(
      (d) => d.bbox !== undefined && extractCovers({ bbox: d.bbox }, lat, lon),
    )
    if (!district?.slug) return []

    const data = await fetchJsonWithin<OvertureExtract>(
      `/geo/overture/${encodeURIComponent(district.slug)}.json`, OVERTURE_TIMEOUT_MS,
    )
    if (!data || !Array.isArray(data.footprints) || data.footprints.length === 0) return []

    // Compare against what OSM already gave us for this same bbox.
    const osmRings: Array<{ ring: Array<{ lat: number; lon: number }> }> = []
    for (const raw of elements ?? []) {
      const el = raw as OverpassBuildingLike
      if (!el?.tags || !el.geometry) continue
      if (!('building' in el.tags) && !('building:part' in el.tags)) continue
      const ring = el.geometry.filter(
        (p): p is { lat: number; lon: number } =>
          !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon),
      )
      if (ring.length >= 3) osmRings.push({ ring })
    }

    // A SECOND, STRICTER REFUSAL, and only for these footprints.
    //
    // `createSuppressor` removes context the model replaces, and it asks that a
    // clear majority of a ring's vertices fall inside the model's plan — right
    // for a hand-drawn OSM outline, which roughly coincides with the surveyed
    // building. It is wrong for these: the ML detections over a landmark are
    // small quads that straddle its edge, so two of four vertices land inside,
    // coverage comes out at 0.5 against a 0.6 threshold, and a tower gets a
    // second tower wedged into it. Measured on the SWFC: footprints 20 m and
    // 25 m from the tower's centre, four vertices each, drawn straight through
    // the model the user came to look at.
    //
    // So ANY overlap disqualifies an Overture footprint. The asymmetry is the
    // point: an OSM outline clipping the model may be a real neighbour worth
    // keeping, while an ML quad on a modelled landmark is a duplicate by
    // definition — we already have that building, surveyed.
    //
    // A LIMIT WORTH STATING. This runs at fetch time, and the caller caches the
    // fetch per site — so a model dragged to a new placement keeps the footprints
    // filtered for its old one until the neighbourhood is re-fetched. OSM
    // context does not have this problem because `createSuppressor` re-runs on
    // every rebuild. Closing it properly means carrying the source on the
    // feature so the same rebuild can re-filter, which is a wider change than
    // the regression in front of me warrants.
    const toPlanar = (p: { lat: number; lon: number }): { x: number; y: number } => {
      const n = latLonToNormalized(p.lat, p.lon)
      return { x: n.nx, y: n.ny }
    }

    return newFootprints(data.footprints, osmRings)
      .filter((f) => clearsModelPlan(f, modelPlan, toPlanar))
      .map((f: OvertureFootprint): PseudoOverpassWay => ({
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
