// ─── surface-tessellation ─────────────────────────────────────────────────────
// Turning an OSM polygon into a surface you can actually light and texture.
// PURE — plain {x,y} metres in, plain metres out. No Three.js, no scene.
//
// Why this exists. Earcut gives the *minimum* triangulation of a ring: a park
// the size of a city block can come back as four enormous triangles whose only
// vertices sit on its outline. That is fine for a flat coloured patch and wrong
// for everything we want here:
//
//   • a park on a hillside gets a flat plane stretched between its corners,
//     because the interior has no vertices to sample the terrain at;
//   • per-vertex lighting has nothing to shade with — three normals over 200 m;
//   • water has no way to know where its own shore is, since every vertex IS
//     the shore.
//
// Subdividing fixes all three at once, so grass, sand, rock and water share it.
//
// The split is UNIFORM — every triangle, every pass — rather than adaptive.
// Adaptive splitting leaves hanging nodes where a fine triangle meets a coarse
// one, and on draped ground a hanging node is a visible crack in the surface.
// Uniform levels keep the mesh conformal by construction; the vertex budget,
// not cleverness, is what stops it running away.

export interface Vec2 { x: number; y: number }

/** Triangle as indices into a point array. */
export type Face = [number, number, number]

export interface SubdivideOptions {
  /** Keep splitting until no edge is longer than this, in metres. */
  maxEdgeM: number
  /** Hard ceiling on the resulting vertex count. The split stops UNDER it. */
  maxPoints: number
}

/** Safety valve: 4^7 is already 16k triangles per source triangle. */
const MAX_LEVELS = 7

/** Longest edge in the mesh, metres. */
export function longestEdge(points: ReadonlyArray<Vec2>, faces: ReadonlyArray<Face>): number {
  let longest = 0
  for (const [a, b, c] of faces) {
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      const dx = points[i].x - points[j].x
      const dy = points[i].y - points[j].y
      const d = Math.hypot(dx, dy)
      if (d > longest) longest = d
    }
  }
  return longest
}

/**
 * Split every triangle into four, repeatedly, until the edge target is met or
 * the budget would be exceeded.
 *
 * Midpoints are cached per undirected edge, so the two triangles sharing an
 * edge get the SAME new vertex. Without that the mesh would come apart into
 * loose triangles and every seam would show under lighting.
 */
export function subdivideMesh(
  points: ReadonlyArray<Vec2>,
  faces: ReadonlyArray<Face>,
  opts: SubdivideOptions,
): { points: Vec2[]; faces: Face[] } {
  let pts: Vec2[] = points.map((p) => ({ x: p.x, y: p.y }))
  let fcs: Face[] = faces.map((f) => [f[0], f[1], f[2]] as Face)
  if (!(opts.maxEdgeM > 0)) return { points: pts, faces: fcs }

  for (let level = 0; level < MAX_LEVELS; level++) {
    if (longestEdge(pts, fcs) <= opts.maxEdgeM) break
    // Each pass adds one vertex per unique edge. For a triangulation that is
    // at most 3F/2 + boundary/2, and 1.5F + 3 bounds it comfortably — checked
    // BEFORE splitting so the budget is never blown, only approached.
    if (pts.length + Math.ceil(fcs.length * 1.5) + 3 > opts.maxPoints) break

    const mid = new Map<number, number>()
    const nextFaces: Face[] = []
    const midpoint = (i: number, j: number): number => {
      const key = i < j ? i * 0x40000000 + j : j * 0x40000000 + i
      const seen = mid.get(key)
      if (seen !== undefined) return seen
      const idx = pts.length
      pts.push({ x: (pts[i].x + pts[j].x) / 2, y: (pts[i].y + pts[j].y) / 2 })
      mid.set(key, idx)
      return idx
    }

    for (const [a, b, c] of fcs) {
      const ab = midpoint(a, b)
      const bc = midpoint(b, c)
      const ca = midpoint(c, a)
      nextFaces.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca])
    }
    fcs = nextFaces
  }

  return { points: pts, faces: fcs }
}

// ── Shore distance ─────────────────────────────────────────────────────────────

/** Distance from a point to a segment, metres. */
export function pointSegmentDistance(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): number {
  const vx = bx - ax
  const vy = by - ay
  const len2 = vx * vx + vy * vy
  if (len2 === 0) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * vx + (py - ay) * vy) / len2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy))
}

/**
 * Distance from every point to the nearest edge of a closed ring, metres.
 *
 * This is what a water surface needs and cannot get any other way: foam and the
 * pale shallows both live in the first few metres off the bank, and both are
 * the difference between "a blue polygon" and "a river". Interior points come
 * out large, points on the outline come out ~0.
 *
 * Brute force on purpose. It is O(points × ring edges), and both are bounded by
 * the vertex budget above; a spatial index would be more code for a cost that
 * never shows up at neighbourhood scale.
 */
export function distanceToRing(
  points: ReadonlyArray<Vec2>, ring: ReadonlyArray<Vec2>,
): Float32Array {
  const out = new Float32Array(points.length)
  if (ring.length < 2) return out
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    let best = Infinity
    for (let e = 0; e < ring.length; e++) {
      const a = ring[e]
      const b = ring[(e + 1) % ring.length]
      const d = pointSegmentDistance(p.x, p.y, a.x, a.y, b.x, b.y)
      if (d < best) best = d
    }
    out[i] = best
  }
  return out
}
