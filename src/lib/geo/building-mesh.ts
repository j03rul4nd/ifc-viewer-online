// ─── building-mesh ────────────────────────────────────────────────────────────
// Extrudes OSM footprints into ONE merged mesh in the normalized planar frame
// (the same frame as the basemap tiles and the terrain patch, so it inherits
// placement, yaw and scale from geoRoot for free).
//
// Why one merged geometry rather than a mesh per building: a town centre is
// easily 2000 footprints, and 2000 draw calls costs more than the whole IFC
// model. Merging makes buildings a single draw call, and since they are pure
// context — never selectable, never measured — nothing is lost by giving up
// per-building objects.
//
// Bases are FLAT per building, sampled at the footprint centroid, plus a skirt
// pushed below ground. Following the terrain per-vertex would shear each
// building into a parallelogram on a slope; a flat base with a hidden skirt is
// what reads as correct, and is what every city renderer does.

import * as THREE from 'three'
import { latLonToNormalized, WEB_MERCATOR_WORLD_M, cosLatScale } from './geo-math'
import type { BuildingFootprint } from './buildings'

/** How far the base is pushed below the sampled ground, metres. */
const SKIRT_M = 6

export interface BuildingMeshResult {
  geometry: THREE.BufferGeometry
  /** Buildings actually included (some rings fail triangulation). */
  count: number
  /** How many of those had an estimated rather than surveyed height. */
  estimatedCount: number
}

export interface BuildingMeshOptions {
  /** Anchor latitude — sets the metres→normalized scale for the whole patch. */
  anchorLat: number
  /**
   * Ground height in METRES at a normalized position, or null for a flat map.
   * Supplied by the terrain patch when 3D terrain is on.
   */
  sampleGroundM?: ((nx: number, ny: number) => number) | null
  /**
   * Elevation the map plane represents, metres. Building bases are expressed
   * relative to it, exactly like terrain vertices, so everything shares a datum.
   */
  anchorElevationM?: number
}

/**
 * Build the merged geometry. Returns null when nothing survived — callers
 * should treat that as "no buildings here", not an error.
 */
export function buildBuildingsGeometry(
  footprints: ReadonlyArray<BuildingFootprint>,
  opts: BuildingMeshOptions,
): BuildingMeshResult | null {
  const metresToNormalized = 1 / (WEB_MERCATOR_WORLD_M * cosLatScale(opts.anchorLat))
  const anchorElevation = opts.anchorElevationM ?? 0

  const positions: number[] = []
  const normals: number[] = []
  // Vertex colours carry a subtle height gradient, so a block of flat-topped
  // extrusions still reads as three-dimensional under an unlit material.
  const colors: number[] = []

  let count = 0
  let estimatedCount = 0

  for (const b of footprints) {
    // Project the ring into the normalized frame once.
    const ring2d: THREE.Vector2[] = b.ring.map((p) => {
      const { nx, ny } = latLonToNormalized(p.lat, p.lon)
      return new THREE.Vector2(nx, ny)
    })
    if (ring2d.length < 3) continue

    // ShapeUtils triangulates counter-clockwise contours; an OSM ring can be
    // either winding, and the wrong one yields zero triangles (a silent hole).
    if (THREE.ShapeUtils.isClockWise(ring2d)) ring2d.reverse()

    // Triangulate in METRES, not normalized units. A 20 m wall is ~3e-8 in
    // normalized space, which is close enough to earcut's degeneracy epsilon
    // that most footprints collapse to zero triangles — measured: only ~11 %
    // of a real city block survived before this. The triangulation is
    // topological, so the indices it returns apply unchanged to the normalized
    // ring; only the numbers fed to the solver need to be well-scaled.
    const metricRing = ring2d.map((p) =>
      new THREE.Vector2(p.x / metresToNormalized, p.y / metresToNormalized),
    )

    let faces: number[][]
    try {
      faces = THREE.ShapeUtils.triangulateShape(metricRing, [])
    } catch {
      continue // self-intersecting footprint — skip it, never fail the batch
    }
    if (faces.length === 0) continue

    // Ground under the centroid: one height for the whole building.
    const centroid = ringCentroid(ring2d)
    const groundM = opts.sampleGroundM ? opts.sampleGroundM(centroid.x, centroid.y) : anchorElevation
    const baseM = groundM + b.height.minHeightM
    const topM = groundM + b.height.heightM

    const baseZ = (baseM - anchorElevation - SKIRT_M) * metresToNormalized
    const topZ = (topM - anchorElevation) * metresToNormalized

    // ── Roof cap ───────────────────────────────────────────────────────────────
    for (const [a, bIdx, c] of faces) {
      pushTriangle(
        positions, normals, colors,
        ring2d[a], ring2d[bIdx], ring2d[c],
        topZ, topZ, topZ,
        0, 0, 1,
        roofShade(b.height.heightM),
      )
    }

    // ── Walls ──────────────────────────────────────────────────────────────────
    for (let i = 0; i < ring2d.length; i++) {
      const p0 = ring2d[i]
      const p1 = ring2d[(i + 1) % ring2d.length]
      const ex = p1.x - p0.x
      const ey = p1.y - p0.y
      const len = Math.hypot(ex, ey)
      if (len === 0) continue
      // Outward normal of a CCW ring is the edge rotated -90°.
      const nx = ey / len
      const ny = -ex / len

      const shadeTop = wallShade(nx, ny) * 1.0
      const shadeBottom = wallShade(nx, ny) * 0.72 // ambient darkening at grade

      pushTriangle(positions, normals, colors, p0, p1, p1, baseZ, baseZ, topZ, nx, ny, 0,
        [shadeBottom, shadeBottom, shadeTop])
      pushTriangle(positions, normals, colors, p0, p1, p0, baseZ, topZ, topZ, nx, ny, 0,
        [shadeBottom, shadeTop, shadeTop])
    }

    count++
    if (b.height.estimated) estimatedCount++
  }

  if (count === 0) return null

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeBoundingSphere()

  return { geometry, count, estimatedCount }
}

/** Area-weighted centroid of a simple polygon (falls back to the mean). */
function ringCentroid(ring: ReadonlyArray<THREE.Vector2>): { x: number; y: number } {
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const cross = a.x * b.y - b.x * a.y
    area += cross
    cx += (a.x + b.x) * cross
    cy += (a.y + b.y) * cross
  }
  if (Math.abs(area) < 1e-18) {
    // Degenerate (collinear) ring — the mean is the only sane answer.
    const mean = ring.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
    return { x: mean.x / ring.length, y: mean.y / ring.length }
  }
  return { x: cx / (3 * area), y: cy / (3 * area) }
}

/**
 * Fixed directional shading for walls, matching the terrain's default
 * north-west light so buildings and ground agree about where the sun is.
 */
function wallShade(nx: number, ny: number): number {
  const lx = -0.707
  const ly = 0.707
  const ndotl = Math.max(0, nx * lx + ny * ly)
  return 0.42 + 0.48 * ndotl
}

/** Taller buildings get a slightly lighter roof — cheap depth cue from above. */
function roofShade(heightM: number): number {
  return 0.62 + 0.22 * Math.min(1, heightM / 60)
}

function pushTriangle(
  positions: number[], normals: number[], colors: number[],
  a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2,
  az: number, bz: number, cz: number,
  nx: number, ny: number, nz: number,
  shade: number | [number, number, number],
): void {
  positions.push(a.x, a.y, az, b.x, b.y, bz, c.x, c.y, cz)
  normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz)
  const s = typeof shade === 'number' ? [shade, shade, shade] as const : shade
  for (const v of s) colors.push(v, v, v)
}
