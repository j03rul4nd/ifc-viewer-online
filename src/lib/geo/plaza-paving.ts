// ─── plaza paving ─────────────────────────────────────────────────────────────
// HOW A SQUARE IS DRAWN AS ONE FLOOR, NOT AS A ROUTING DIAGRAM ON A PATCHWORK.
//
// Measured on Plaça de Catalunya, which is how this came up. The square is
// mapped the way OSM asks squares to be mapped:
//
//   - the floor is FOUR `highway=pedestrian` + `area=yes` polygons (and a
//     multipolygon) that meet edge to edge;
//   - across that floor run 60 `highway=footway` ways, 1.6–2 m wide, radiating
//     from the centre and ringing it. They are there for ROUTING — so a router
//     can cross the square — and say nothing about the paving. There is no
//     path there to see; it is one continuous floor.
//
// Two artefacts came out of that, and both read as "the map underneath is
// showing through":
//
//   1. Every footway was drawn as a 2 m ribbon with its own edge shading, so
//      the square wore a spider's web of grey lines — the same web the raster
//      basemap prints, which is why it was taken for the tile.
//   2. Each floor polygon is densified and split against the DEM on its OWN
//      budget, so two neighbours do not share the vertices along the edge they
//      share. On any slope their edges sit at slightly different heights, and
//      seen at an angle the step between them is a hairline crack straight
//      through to the terrain — a long dark line across the square.
//
// The answers, both pure and both here:
//
//   - `routingOverPaving` names the walkways that lie wholly on a paved
//     pedestrian area, so the builder can leave them out. Wholly: a path that
//     leaves the square, a crossing, a flight of steps or anything carried on a
//     structure is real and is kept.
//   - `outsetRing` grows a floor polygon by a few decimetres, so neighbours
//     overlap instead of abutting and no crack can open between them.
//   - `pavedAreaOrder` draws the big floors first and the small things set into
//     them — a mosaic, an island, a court — after, so they land on top.

import type { LatLonPoint, OsmFeature } from './osm-features'
import { pointInLatLonRing } from './osm-features'

/** Is this feature a paved pedestrian FLOOR — a square, an esplanade? */
export function isPedestrianFloor(f: OsmFeature): boolean {
  return f.kind === 'road' && f.widthM === undefined && !!f.ring && f.ring.length >= 3
    && f.style.roadClass === 'pedestrian' && !f.style.parking && !f.style.court
    && !f.style.accessKind && f.vertical?.structure !== 'tunnel'
}

/** Could this walkway be a routing line drawn across a floor? */
function isRoutingCandidate(f: OsmFeature): boolean {
  if (f.kind !== 'road' || f.widthM === undefined || !f.ring || f.ring.length < 2) return false
  if (f.style.roadClass !== 'pedestrian') return false
  // Paint, stairs and lifts are things you SEE on a square.
  if (f.style.crossing || f.style.accessKind) return false
  const structure = f.vertical?.structure
  if (structure && structure !== 'ground') return false
  if ((f.vertical?.layer ?? 0) !== 0) return false
  return true
}

interface Floor {
  ring: ReadonlyArray<LatLonPoint>
  holes: ReadonlyArray<ReadonlyArray<LatLonPoint>>
  minLat: number; maxLat: number; minLon: number; maxLon: number
}

function floorOf(f: OsmFeature): Floor {
  let minLat = Infinity; let maxLat = -Infinity; let minLon = Infinity; let maxLon = -Infinity
  for (const p of f.ring!) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lon < minLon) minLon = p.lon
    if (p.lon > maxLon) maxLon = p.lon
  }
  return { ring: f.ring!, holes: f.holes ?? [], minLat, maxLat, minLon, maxLon }
}

function onFloor(p: LatLonPoint, floors: ReadonlyArray<Floor>): boolean {
  for (const fl of floors) {
    if (p.lat < fl.minLat || p.lat > fl.maxLat || p.lon < fl.minLon || p.lon > fl.maxLon) continue
    if (!pointInLatLonRing(p, fl.ring)) continue
    if (fl.holes.some((h) => h.length >= 3 && pointInLatLonRing(p, h))) continue
    return true
  }
  return false
}

/**
 * Ids of walkways that run entirely over paved pedestrian floors.
 *
 * Every vertex AND the midpoint of every segment must be on a floor (any
 * floor: a path crossing from one of the square's polygons into the next is
 * still on the square). Sampling midpoints is what keeps a path that cuts a
 * concave corner — both ends on the paving, the middle over a lawn — on screen.
 */
export function routingOverPaving(features: ReadonlyArray<OsmFeature>): Set<string> {
  const floors = features.filter(isPedestrianFloor).map(floorOf)
  const out = new Set<string>()
  if (floors.length === 0) return out
  for (const f of features) {
    if (!isRoutingCandidate(f)) continue
    const pts = f.ring!
    let all = true
    for (let i = 0; i < pts.length && all; i++) {
      if (!onFloor(pts[i], floors)) all = false
      else if (i > 0) {
        const mid = { lat: (pts[i - 1].lat + pts[i].lat) / 2, lon: (pts[i - 1].lon + pts[i].lon) / 2 }
        if (!onFloor(mid, floors)) all = false
      }
    }
    if (all) out.add(f.id)
  }
  return out
}

/**
 * Gardens and pools set INTO a paved area, as rings to cut out of its floor.
 *
 * The floor is in the road layer and paints over the greenery and the water,
 * which is right for a square laid across a park — the larger thing is the
 * ground, the smaller is set into it. It is wrong the other way round: a lawn
 * or a basin mapped inside a square that does not punch it out as a hole.
 * OSM leaves that to the mapper, and the vector-tile fallback drops every hole
 * anyway, so Plaça de Catalunya came out as one grey slab with its gardens and
 * fountains painted out. Anything green or wet lying wholly inside the floor,
 * and smaller than it, is cut out of it instead.
 */
export function islandsInFloor(
  floor: OsmFeature,
  candidates: ReadonlyArray<OsmFeature>,
): LatLonPoint[][] {
  if (!floor.ring || floor.ring.length < 3) return []
  const fl = floorOf(floor)
  const floorArea = ringArea(floor.ring)
  const out: LatLonPoint[][] = []
  for (const c of candidates) {
    if (c === floor || !c.ring || c.ring.length < 3) continue
    if (c.kind !== 'green' && c.kind !== 'water') continue
    if (c.isSea) continue
    let inside = true
    for (const p of c.ring) {
      if (p.lat < fl.minLat || p.lat > fl.maxLat || p.lon < fl.minLon || p.lon > fl.maxLon
        || !pointInLatLonRing(p, fl.ring)) { inside = false; break }
    }
    if (!inside) continue
    // Already a hole the mapper punched: cutting it twice breaks the triangulation.
    if (fl.holes.some((h) => h.length >= 3 && pointInLatLonRing(c.ring![0], h))) continue
    if (ringArea(c.ring) >= floorArea) continue
    out.push(c.ring)
  }
  // A lawn inside a lawn is one hole, not two overlapping ones.
  return out.filter((r, i) => !out.some((o, j) => j !== i && ringArea(o) > ringArea(r) && pointInLatLonRing(r[0], o)))
}

/** Planar area of a lat/lon ring, in square degrees scaled by cos(lat). */
function ringArea(ring: ReadonlyArray<LatLonPoint>): number {
  if (ring.length < 3) return 0
  const k = Math.cos((ring[0].lat * Math.PI) / 180)
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j].lon * k * ring[i].lat - ring[i].lon * k * ring[j].lat
  }
  return Math.abs(a / 2)
}

/**
 * Order a road layer's features so paved AREAS come first, largest first, and
 * every ribbon after them in its original order.
 *
 * The ground layers do not write depth — the order they are emitted in IS the
 * order they paint — so the floor of a square must go down before the mosaic
 * set into it, or the floor paints the mosaic out.
 */
export function pavedAreaOrder<T extends OsmFeature>(features: ReadonlyArray<T>): T[] {
  const areas: Array<{ f: T; a: number }> = []
  const rest: T[] = []
  for (const f of features) {
    if (f.kind === 'road' && f.widthM === undefined && f.ring && f.ring.length >= 3) {
      areas.push({ f, a: ringArea(f.ring) })
    } else rest.push(f)
  }
  areas.sort((x, y) => y.a - x.a)
  return [...areas.map((x) => x.f), ...rest]
}

/** A point in any planar frame. */
export interface XY { x: number; y: number }

/**
 * Grow a simple polygon outward by `d` (same units as its coordinates).
 *
 * Each vertex moves along the bisector of its two edge normals by the miter
 * distance, so straight edges move by exactly `d`. The miter is capped at
 * `2d`, which keeps a needle-sharp corner from shooting a spike across the
 * street. Orientation-independent: the signed area decides which side is out.
 * A ring with fewer than three vertices, or no area, comes back unchanged.
 */
export function outsetRing<P extends XY>(ring: ReadonlyArray<P>, d: number, make: (x: number, y: number) => P): P[] {
  const n = ring.length
  if (n < 3 || d === 0) return ring.slice()
  let signed = 0
  for (let i = 0, j = n - 1; i < n; j = i++) signed += ring[j].x * ring[i].y - ring[i].x * ring[j].y
  if (signed === 0) return ring.slice()
  // For a counter-clockwise ring the outward normal of edge (a→b) is (dy, -dx).
  const s = signed > 0 ? 1 : -1
  const out: P[] = []
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n]
    const cur = ring[i]
    const next = ring[(i + 1) % n]
    const n1 = edgeNormal(prev, cur, s)
    const n2 = edgeNormal(cur, next, s)
    let bx = n1.x + n2.x
    let by = n1.y + n2.y
    const bl = Math.hypot(bx, by)
    if (bl < 1e-12) { out.push(make(cur.x + n1.x * d, cur.y + n1.y * d)); continue }
    bx /= bl; by /= bl
    // cos of half the turn angle; the miter length is d / cos.
    const cosHalf = Math.max(0.5, bx * n1.x + by * n1.y)
    const m = d / cosHalf
    out.push(make(cur.x + bx * m, cur.y + by * m))
  }
  return out
}

function edgeNormal(a: XY, b: XY, s: number): XY {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l = Math.hypot(dx, dy)
  if (l < 1e-15) return { x: 0, y: 0 }
  return { x: (s * dy) / l, y: (-s * dx) / l }
}
