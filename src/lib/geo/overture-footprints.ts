// ─── overture-footprints ──────────────────────────────────────────────────────
// THE BUILDINGS OSM HAS NOT MAPPED YET.
//
// OpenStreetMap maps 937 building outlines in the Lujiazui benchmark patch.
// Overture, over the same bbox, has 1 494 — the same 406 in the core area plus
// several hundred detected by machine learning. Those extra footprints are real
// buildings that are simply not in OSM, and a district drawn without them has
// visible gaps where a city has blocks.
//
// ── Why a shipped extract and not a live query ────────────────────────────────
//
// Overture is GeoParquet on public S3. Getting the 714 buildings of one bbox
// took DuckDB 140 seconds of columnar scanning; no browser is going to do that
// while somebody waits. So the districts we care about are extracted once at
// build time by `scripts/overture-footprints.py` and shipped as a small file.
//
// ── Why the de-duplication lives HERE and not in the extract ──────────────────
//
// Overture publishes each building's provenance, so the extract can drop
// everything it attributes to OpenStreetMap. That is necessary and NOT
// sufficient, which measuring is what showed: of the 308 ML-sourced rows in the
// core bbox, **47 — 15% — land on an OSM building anyway**, because Overture
// kept both where its own matcher failed to pair them. Shipping those would
// draw 47 buildings twice, one slightly beside the other, which is worse than
// the gaps it set out to fill.
//
// So a second, geometric pass is required, and it belongs at RUNTIME: OSM grows,
// and a de-duplication baked in at build time goes stale against exactly the
// data it exists to complement. A footprint suppressed today because OSM has it
// must stay suppressed tomorrow when OSM moves it slightly; one admitted today
// must disappear the day somebody maps it.
//
// ── What these buildings do NOT bring ─────────────────────────────────────────
//
// Heights. Overture's China heights are OSM-derived, so the ML footprints carry
// none: 7 of the 287 in the core bbox, against 39 for the whole set. Every one
// of these arrives `estimated`, which is why this was worth doing only after
// the local height prior landed — before it they would all have been 8 m boxes.
//
// PURE: footprints and OSM rings in, the subset worth drawing out. No fetch, no
// THREE, no tags.

/** One footprint as shipped: a closed ring, and nothing else. */
export interface OvertureFootprint {
  id: string
  /** Outer ring, degrees. Not closed — the last point does not repeat. */
  ring: Array<{ lat: number; lon: number }>
  /**
   * Attributes Overture holds from a NON-OSM source, already as the OSM tags
   * the viewer reads (`height`, `building:levels`, `roof:shape`…). Absent when
   * it holds none, which is most ML detections.
   */
  tags?: Record<string, string>
  /** The dataset(s) those attributes came from — the provenance shown. */
  src?: string[]
}

/** Overture's enrichment of a building whose geometry is OSM's, by OSM id. */
export interface OvertureOsmAttributes {
  tags: Record<string, string>
  src?: string[]
}

/** The file `scripts/overture-footprints.py` writes. */
export interface OvertureExtract {
  /** Overture release the extract came from, e.g. `2026-08-19.0`. */
  release: string
  /** Attribution the viewer must display while these are on screen. */
  attribution: string
  /** [west, south, east, north] the extract covers. */
  bbox: [number, number, number, number]
  footprints: OvertureFootprint[]
  /** Keyed `w123` / `r456`: enrichment for buildings OSM already maps. */
  osm?: Record<string, OvertureOsmAttributes>
}

/**
 * How near an Overture centroid must be to an OSM building to count as the same
 * one, metres.
 *
 * ML footprints are traced from imagery and OSM ones by hand from the same
 * imagery, so the two disagree by roughly the width of a wall rather than by
 * the width of a building. Generous enough to catch that; tight enough that two
 * genuinely adjacent town houses do not collapse into one.
 */
export const DUPLICATE_RADIUS_M = 8

/** Anything this small is imagery noise, not a building. */
export const MIN_AREA_M2 = 25

export interface RingLike {
  ring: ReadonlyArray<{ lat: number; lon: number }>
}

interface Placed {
  lon: number
  lat: number
  west: number
  east: number
  south: number
  north: number
}

function place(ring: ReadonlyArray<{ lat: number; lon: number }>): Placed | null {
  if (ring.length < 3) return null
  let lon = 0
  let lat = 0
  let west = Infinity
  let east = -Infinity
  let south = Infinity
  let north = -Infinity
  for (const p of ring) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null
    lon += p.lon
    lat += p.lat
    if (p.lon < west) west = p.lon
    if (p.lon > east) east = p.lon
    if (p.lat < south) south = p.lat
    if (p.lat > north) north = p.lat
  }
  return { lon: lon / ring.length, lat: lat / ring.length, west, east, south, north }
}

/** Shoelace area in m², local equirectangular. Enough to reject slivers. */
export function ringAreaM2(ring: ReadonlyArray<{ lat: number; lon: number }>): number {
  if (ring.length < 3) return 0
  const kx = 111_320 * Math.cos((ring[0].lat * Math.PI) / 180)
  const ky = 111_132
  let s = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    s += a.lon * kx * (b.lat * ky) - b.lon * kx * (a.lat * ky)
  }
  return Math.abs(s) / 2
}

/**
 * The Overture footprints worth adding, given what OSM already has here.
 *
 * A footprint is dropped when its centroid falls INSIDE an OSM building's
 * bounding box, or within `DUPLICATE_RADIUS_M` of an OSM centroid. Two tests
 * rather than one because they catch different failures: a large OSM building
 * whose centroid is far from a small overlapping ML footprint is caught by the
 * box, and two small footprints offset by a metre are caught by the radius.
 *
 * Deliberately conservative in one direction. A false DROP costs one building
 * the city already had; a false KEEP draws a building twice, slightly offset,
 * which reads as a rendering fault rather than as missing data.
 */
export function newFootprints(
  extract: ReadonlyArray<OvertureFootprint>,
  osm: ReadonlyArray<RingLike>,
  radiusM = DUPLICATE_RADIUS_M,
): OvertureFootprint[] {
  const placed = osm
    .map((b) => place(b.ring))
    .filter((p): p is Placed => p !== null)
  if (extract.length === 0) return []

  const out: OvertureFootprint[] = []
  for (const f of extract) {
    const p = place(f.ring)
    if (!p) continue
    if (ringAreaM2(f.ring) < MIN_AREA_M2) continue

    // Metres per degree at this latitude, computed per footprint rather than
    // once for the patch: a district can be tall enough for the cosine to move.
    const kx = 111_320 * Math.cos((p.lat * Math.PI) / 180)
    const ky = 111_132

    let duplicate = false
    for (const o of placed) {
      if (p.lon >= o.west && p.lon <= o.east && p.lat >= o.south && p.lat <= o.north) {
        duplicate = true
        break
      }
      const dx = (p.lon - o.lon) * kx
      const dy = (p.lat - o.lat) * ky
      if (dx * dx + dy * dy <= radiusM * radiusM) {
        duplicate = true
        break
      }
    }
    if (!duplicate) out.push(f)
  }
  return out
}

/** Does this extract cover the point a model was placed at? */
export function extractCovers(
  extract: Pick<OvertureExtract, 'bbox'>, lat: number, lon: number,
): boolean {
  const [w, s, e, n] = extract.bbox
  return lon >= w && lon <= e && lat >= s && lat <= n
}

/**
 * Does this footprint stay clear of the model's own plan?
 *
 * ANY overlap disqualifies it, and the strictness is the point.
 *
 * `createSuppressor` already removes context the model replaces, but it asks
 * that a clear MAJORITY of a ring's vertices fall inside the plan — the right
 * rule for a hand-drawn OSM outline, which roughly coincides with the surveyed
 * building. It is the wrong rule for these. The ML detections over a landmark
 * are small quads that straddle its edge: two of four vertices land inside,
 * coverage comes out at 0.5 against a 0.6 threshold, and the footprint
 * survives to stand inside the model.
 *
 * Measured on the Shanghai World Financial Center: shipped footprints 20 m and
 * 25 m from the tower's centre, four vertices each, drawn straight through the
 * model the user opened the viewer to look at. Two towers competing for one
 * plot is the single most damaging thing this scene can do, because the model
 * is the subject and everything else is context.
 *
 * The asymmetry against OSM is deliberate: an OSM outline clipping the model
 * may be a real neighbour worth keeping, while an ML quad on a modelled
 * landmark is a duplicate by definition — that building is already here, and
 * surveyed.
 */
export function clearsModelPlan(
  footprint: OvertureFootprint,
  plan: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>,
  project: (p: { lat: number; lon: number }) => { x: number; y: number },
): boolean {
  if (plan.length === 0) return true
  for (const p of footprint.ring) {
    const q = project(p)
    for (const poly of plan) {
      if (poly.length >= 3 && pointInPolygon(q, poly)) return false
    }
  }
  return true
}

/** Ray casting, kept local so this module depends on nothing but numbers. */
function pointInPolygon(
  p: { x: number; y: number }, poly: ReadonlyArray<{ x: number; y: number }>,
): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if ((a.y > p.y) !== (b.y > p.y)
      && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

// ── Field-level fusion ─────────────────────────────────────────────────────────

/** Tag a donated height carries so the building reports Overture as its source. */
export const HEIGHT_SOURCE_TAG = '_src:height'

/** Groups of tags that are ONE answer: OSM stating any member owns the group. */
const FUSION_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  // The height: a measured height OR a storey count is OSM's answer to "how
  // tall", and a donated number must not override either.
  ['height', 'building:levels'],
  ['min_height', 'building:min_level'],
  ['roof:shape'], ['roof:height'], ['roof:direction'], ['roof:orientation'],
  ['building:colour'], ['roof:colour'], ['building:material'], ['roof:material'],
]

/**
 * Fill the gaps in an OSM building's tags from Overture's enrichment of the
 * same building. OSM wins every field it states; Overture only answers what
 * OSM left blank. Returns the tags added (empty when none), and MUTATES `tags`.
 *
 * A donated height is marked as Overture's and as estimated: it was not
 * surveyed by the mapper of this building, and it must not teach the district
 * height prior (see collectHeightSamples).
 */
export function fuseOvertureAttributes(
  tags: Record<string, string>, enrichment: OvertureOsmAttributes,
): Record<string, string> {
  const added: Record<string, string> = {}
  for (const group of FUSION_GROUPS) {
    if (group.some((k) => tags[k] !== undefined && tags[k] !== '')) continue
    for (const k of group) {
      const v = enrichment.tags[k]
      if (v === undefined || v === '') continue
      tags[k] = v
      added[k] = v
    }
  }
  if (added['height'] !== undefined || added['building:levels'] !== undefined) {
    tags[HEIGHT_SOURCE_TAG] = 'overture'
    if (added['height'] !== undefined) tags['note:height'] = tags['note:height'] ?? 'estimated'
  }
  if (Object.keys(added).length && enrichment.src?.length) {
    tags['source:overture'] = enrichment.src.join(';')
  }
  return added
}

/**
 * The tags of a footprint OSM does not have, from Overture's own attributes.
 * Its heights are flagged estimated for the same reason as above.
 */
export function overtureFootprintTags(f: OvertureFootprint): Record<string, string> {
  const t: Record<string, string> = { building: 'yes', ...(f.tags ?? {}) }
  // A `class` that is not a building type OSM would write (Overture uses its
  // own vocabulary in places) still means "a building".
  if (!t['building']) t['building'] = 'yes'
  if (t['height'] !== undefined) t['note:height'] = 'estimated'
  if (f.src?.length) t['source:overture'] = f.src.join(';')
  return t
}
