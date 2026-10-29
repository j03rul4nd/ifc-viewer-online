// ─── mesh-snap ────────────────────────────────────────────────────────────────
// Edge and midpoint snapping on imported meshes (GLB, OBJ, STL…) — the snaps
// a CAD user reaches for first, and the ones meshes used to go without.
//
// They were switched off for a good reason: a triangle soup does not know which
// of its edges are real, and snapping to the diagonal that split a wall's quad
// in two is worse than not snapping. The answer is the one every CAD viewer
// uses: FEATURE edges — edges where the surface actually folds (the dihedral
// angle between the two faces is over a threshold) and boundary edges. A flat
// wall's diagonal has 0° between its faces and is never offered; the corner of
// the wall is.
//
// Feature edges are computed once per geometry (three's EdgesGeometry, which is
// exactly this test) and cached. Very large meshes are skipped: snapping is a
// convenience and must never freeze a click.

import * as THREE from 'three'

/** Faces meeting at less than this are one surface; their shared edge is not real. */
export const FEATURE_ANGLE_DEG = 25
/** Above this many triangles, building the edge list costs more than a snap is worth. */
export const MAX_SNAP_TRIANGLES = 400_000

const cache = new WeakMap<THREE.BufferGeometry, Float32Array | null>()

/** Feature edges of a geometry in its LOCAL space: [ax, ay, az, bx, by, bz, …]. */
export function featureEdges(geometry: THREE.BufferGeometry): Float32Array | null {
  if (cache.has(geometry)) return cache.get(geometry) ?? null
  const pos = geometry.getAttribute('position')
  const tris = geometry.index ? geometry.index.count / 3 : (pos?.count ?? 0) / 3
  let out: Float32Array | null = null
  if (pos && tris > 0 && tris <= MAX_SNAP_TRIANGLES) {
    try {
      const edges = new THREE.EdgesGeometry(geometry, FEATURE_ANGLE_DEG)
      out = Float32Array.from(edges.getAttribute('position').array as ArrayLike<number>)
      edges.dispose()
    } catch {
      out = null
    }
  }
  cache.set(geometry, out)
  return out
}

export interface EdgeCandidate {
  a: THREE.Vector3
  b: THREE.Vector3
  /** Nearest point on the edge to the query, world space. */
  nearest: THREE.Vector3
  /** World distance from the query to `nearest`. */
  distance: number
}

const la = new THREE.Vector3()
const lb = new THREE.Vector3()
const seg = new THREE.Line3()
const tmp = new THREE.Vector3()

/**
 * The feature edges of `geometry` (placed by `matrixWorld`) within `radius`
 * world units of `point`, nearest first. Pure apart from the cache.
 */
export function edgesNear(
  geometry: THREE.BufferGeometry, matrixWorld: THREE.Matrix4, point: THREE.Vector3, radius: number, limit = 8,
): EdgeCandidate[] {
  const edges = featureEdges(geometry)
  if (!edges || edges.length < 6) return []
  const out: EdgeCandidate[] = []
  const r2 = radius * radius
  for (let i = 0; i + 5 < edges.length; i += 6) {
    la.set(edges[i], edges[i + 1], edges[i + 2]).applyMatrix4(matrixWorld)
    lb.set(edges[i + 3], edges[i + 4], edges[i + 5]).applyMatrix4(matrixWorld)
    seg.set(la, lb)
    seg.closestPointToPoint(point, true, tmp)
    const d2 = tmp.distanceToSquared(point)
    if (d2 > r2) continue
    out.push({ a: la.clone(), b: lb.clone(), nearest: tmp.clone(), distance: Math.sqrt(d2) })
  }
  out.sort((x, y) => x.distance - y.distance)
  return out.slice(0, limit)
}

/** The world matrix a hit was drawn with — an InstancedMesh adds the instance's own. */
export function hitMatrix(hit: THREE.Intersection): THREE.Matrix4 {
  const m = hit.object.matrixWorld.clone()
  const inst = hit.object as THREE.InstancedMesh
  if (inst.isInstancedMesh && hit.instanceId !== undefined) {
    const im = new THREE.Matrix4()
    inst.getMatrixAt(hit.instanceId, im)
    m.multiply(im)
  }
  return m
}
