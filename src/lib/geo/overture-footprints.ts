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
