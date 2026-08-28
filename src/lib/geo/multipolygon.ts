// ─── multipolygon ─────────────────────────────────────────────────────────────
// Assembling an OSM relation's member ways into the rings they actually
// describe. PURE: points in, rings out. No tags, no scene, no three.js.
//
// WHY THIS HAS TO EXIST. An OSM multipolygon does not store a ring. It stores a
// bag of member ways with a role, and the ring is whatever you get when you
// join them end to end. Nothing says how many ways a ring is split into, which
// direction each runs, or what order they appear in the relation — all three
// are editing history, not geometry.
//
// Treating each member as a ring on its own is therefore not an approximation,
// it is a different shape. Measured on Platja de Sant Sebastia (relation
// 7333375), whose outer ring is three open ways of 463 m, 57 m and 608 m: the
// per-member reading produced TWO overlapping polygons of 17 139 m2 and
// 26 603 m2 — together 43 742 m2, twice the beach, neither of them its shape,
// and one of them the shoreline folded back on itself so the sand crossed into
// the water. Joined, the same three ways close exactly, into one 37-vertex ring
// of 21 616 m2. That is the whole difference between a beach and an artefact,
// and it is not specific to this beach: any park, basin, harbour or wood mapped
// as more than one way had the same thing happen to it.

/** A geographic point. Matches the shape Overpass emits for member geometry. */
export interface RingPoint {
  lat: number
  lon: number
}

/**
 * Endpoints are matched at this tolerance, in degrees (~10 cm).
 *
 * Shared nodes come back from Overpass with byte-identical coordinates, so an
 * exact test would very nearly work. Very nearly is not a guarantee worth
 * relying on across a JSON round trip and a rounding step, and 10 cm is far
 * below the distance between two genuinely different corners of a polygon.
 */
const JOIN_EPS = 1e-6

const same = (a: RingPoint, b: RingPoint): boolean =>
  Math.abs(a.lat - b.lat) < JOIN_EPS && Math.abs(a.lon - b.lon) < JOIN_EPS

const isClosedRing = (r: ReadonlyArray<RingPoint>): boolean =>
  r.length >= 4 && same(r[0], r[r.length - 1])

/**
 * Join member ways into the maximal chains they form.
 *
 * REVERSAL IS ALLOWED, and that is the one thing that separates this from
 * `coastline.joinChains`. A coastline's direction is a convention — land on the
 * left, water on the right — so flipping a way there would invert which side is
 * sea, and two ways that only meet tail-to-tail are simply not the same chain.
 * A multipolygon member carries no such meaning: mappers draw the north edge
 * west-to-east and the south edge east-to-west all the time, and refusing to
 * turn one around leaves a ring that plainly closes reported as two fragments.
 *
 * Deterministic: members are consumed in the order given, so the same relation
 * always assembles the same way and a snapshot test means something.
 */
export function assembleRings(
  parts: ReadonlyArray<ReadonlyArray<RingPoint>>,
): RingPoint[][] {
  // A member of fewer than two points contributes no edge. It is dropped rather
  // than kept as a degenerate stub, which would otherwise seed a chain that can
  // never join anything and end up closed into a zero-area sliver.
  const pool = parts.filter((p) => p.length >= 2).map((p) => p.map((q) => ({ lat: q.lat, lon: q.lon })))
  const rings: RingPoint[][] = []

  while (pool.length > 0) {
    const chain = pool.shift()!
    // A member that is already a complete ring is one: an island in a
    // multipolygon, or the ordinary case of a relation whose outer is a single
    // closed way. Trying to grow it would only find its own endpoints.
    if (isClosedRing(chain)) { rings.push(chain); continue }

    let grew = true
    while (grew && !isClosedRing(chain)) {
      grew = false
      for (let i = 0; i < pool.length; i++) {
        const cand = pool[i]
        const head = chain[0]
        const tail = chain[chain.length - 1]
        if (same(tail, cand[0])) {
          chain.push(...cand.slice(1))
        } else if (same(tail, cand[cand.length - 1])) {
          chain.push(...cand.slice(0, -1).reverse())
        } else if (same(head, cand[cand.length - 1])) {
          chain.unshift(...cand.slice(0, -1))
        } else if (same(head, cand[0])) {
          chain.unshift(...cand.slice(1).reverse())
        } else {
          continue
        }
        pool.splice(i, 1)
        grew = true
        break
      }
    }
    rings.push(chain)
  }
  return rings
}

/**
 * The rings of a multipolygon, by role.
 *
 * Inner rings are assembled too even though nothing draws holes yet: they are
 * the same geometry problem, and assembling them here means the day the
 * tessellator learns about holes there is nothing left to work out. A caller
 * that ignores `inner` is exactly as correct as it is today.
 */
export interface MemberLike {
  role?: string
  geometry?: ReadonlyArray<RingPoint> | null
}

export function assembleMultipolygon(
  members: ReadonlyArray<MemberLike> | null | undefined,
): { outer: RingPoint[][]; inner: RingPoint[][] } {
  if (!members) return { outer: [], inner: [] }
  const take = (role: string): RingPoint[][] => assembleRings(
    members
      .filter((m) => (m?.role ?? '') === role && Array.isArray(m?.geometry))
      .map((m) => (m.geometry ?? []).filter(
        (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon),
      )),
  )
  // An untagged role is `outer` by long-standing OSM convention, and dropping
  // those loses whole polygons on older relations that predate the role being
  // mandatory.
  const untagged = assembleRings(
    members
      .filter((m) => !m?.role && Array.isArray(m?.geometry))
      .map((m) => (m.geometry ?? []).filter(
        (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon),
      )),
  )
  return { outer: [...take('outer'), ...untagged], inner: take('inner') }
}
