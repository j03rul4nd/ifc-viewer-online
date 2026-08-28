// ─── ring-checks ──────────────────────────────────────────────────────────────
// Cheap geometric predicates on a lat/lon ring, shared by the generator and by
// the audit that measures it.
//
// They exist because the failures worth catching are not subtle: a 100 m quay
// whose bounding box comes out 20 km across, a sea whose area is near zero, a
// polygon that crosses itself and triangulates to three faces. Every one of
// those has a single arithmetic cause, every one is invisible in a count of
// features, and every one is a couple of lines to detect.
//
// PURE: coordinates in, numbers out.

export interface RingMetrics {
  verts: number
  areaM2: number
  perimeterM: number
  /** Extent of the bounding box, metres. */
  widthM: number
  heightM: number
}

/**
 * Measure a lat/lon ring in metres.
 *
 * Local equirectangular about the ring's own first point — exact enough at the
 * scale of a city block and, unlike a degrees-based measure, not wrong by a
 * factor of cos(latitude) in one axis.
 */
export function ringMetrics(ring: ReadonlyArray<{ lat: number; lon: number }>): RingMetrics {
  if (ring.length === 0) return { verts: 0, areaM2: 0, perimeterM: 0, widthM: 0, heightM: 0 }
  const lat0 = ring[0].lat
  const mLat = 111_132
  const mLon = 111_320 * Math.cos((lat0 * Math.PI) / 180)
  const xs = ring.map((p) => p.lon * mLon)
  const ys = ring.map((p) => p.lat * mLat)

  let twice = 0
  let perimeter = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    twice += xs[j] * ys[i] - xs[i] * ys[j]
    perimeter += Math.hypot(xs[i] - xs[j], ys[i] - ys[j])
  }
  return {
    verts: ring.length,
    areaM2: Math.abs(twice) / 2,
    perimeterM: perimeter,
    widthM: Math.max(...xs) - Math.min(...xs),
    heightM: Math.max(...ys) - Math.min(...ys),
  }
}

/** Segments that cross another segment of the same ring. Zero for a simple polygon. */
export function selfIntersections(ring: ReadonlyArray<{ lat: number; lon: number }>): number {
  const n = ring.length
  if (n < 4) return 0
  const side = (o: { lat: number; lon: number }, a: { lat: number; lon: number }, b: { lat: number; lon: number }): number =>
    (a.lon - o.lon) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lon - o.lon)
  const crosses = (p1: number, p2: number, p3: number, p4: number): boolean => {
    const d1 = side(ring[p3], ring[p4], ring[p1])
    const d2 = side(ring[p3], ring[p4], ring[p2])
    const d3 = side(ring[p1], ring[p2], ring[p3])
    const d4 = side(ring[p1], ring[p2], ring[p4])
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  }
  let hits = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      if (crosses(i, (i + 1) % n, j, (j + 1) % n)) hits++
    }
  }
  return hits
}

/** Vertices that repeat. A ring closed by repeating its first point scores 0 here. */
export function duplicateVertices(ring: ReadonlyArray<{ lat: number; lon: number }>): number {
  const seen = new Set<string>()
  let dupes = 0
  const body = ring.length > 1
    && ring[0].lat === ring[ring.length - 1].lat
    && ring[0].lon === ring[ring.length - 1].lon
    ? ring.slice(0, -1) : ring
  for (const p of body) {
    const k = `${p.lat.toFixed(9)},${p.lon.toFixed(9)}`
    if (seen.has(k)) dupes++
    seen.add(k)
  }
  return dupes
}

/** Everything wrong with a ring, as short codes. Empty means "fit to triangulate". */
export function ringProblems(
  ring: ReadonlyArray<{ lat: number; lon: number }>,
  minAreaM2 = 1,
): string[] {
  const problems: string[] = []
  if (ring.length < 3) { problems.push('fewer-than-three-vertices'); return problems }
  const m = ringMetrics(ring)
  if (m.areaM2 < minAreaM2) problems.push('near-zero-area')
  if (duplicateVertices(ring) > 0) problems.push('duplicate-vertices')
  if (selfIntersections(ring) > 0) problems.push('self-intersecting')
  return problems
}
