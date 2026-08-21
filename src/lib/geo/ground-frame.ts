// ─── ground-frame ─────────────────────────────────────────────────────────────
// THE single owner of the vertical axis in map mode.
//
// Before this module, thirteen places across four files each spelled out
//
//     z = (metres − anchorElevation) × metresToNormalized
//
// by hand. That duplication is why terrain and objects drifted apart: the
// formula was right in every copy, but no copy knew about anything the TERRAIN
// did to its own surface afterwards. When the terrain patch started honouring
// vertical exaggeration by scaling its mesh (`mesh.scale.z = k`), the displayed
// ground moved and the thirteen copies did not — so every building, tree, lamp
// and carriageway stayed on the un-exaggerated surface. At the anchor the error
// is zero; it grows with |elevation − anchor|, which is exactly why the bug
// looked like "works on the flat, breaks as soon as there is relief".
//
// The rule this module exists to enforce: NOTHING computes a ground height on
// its own. Ask the frame. If the terrain ever changes how it presents its
// surface again, this is the one place that has to learn about it.
//
// Two vertical quantities that must never be confused:
//   • GROUND — where the surface is. Follows the terrain, and IS exaggerated,
//     because that is the surface the user is looking at.
//   • OBJECT HEIGHT — how tall a thing is above its own ground. NEVER
//     exaggerated: vertical exaggeration is a relief-reading aid, and stretching
//     a 20 m building into a 60 m one because the user wanted to read a valley
//     would be a different lie from the one they asked for.

import * as THREE from 'three'
import { metresToNormalized } from './geo-math'

/** Ground elevation in metres at a normalized planar position. */
export type GroundSampler = (nx: number, ny: number) => number

export interface GroundFrameOptions {
  /** Anchor latitude — sets the normalized-to-metres scale. */
  anchorLat: number
  /** Terrain elevation at the anchor, metres. The scene's z = 0 plane. */
  anchorElevationM?: number
  /** Terrain sampler, or null/undefined on the flat basemap. */
  sampleGroundM?: GroundSampler | null
  /**
   * Vertical exaggeration the terrain patch is displaying, ×k. MUST match
   * whatever the patch is doing to its own geometry, or this module reproduces
   * the very bug it exists to prevent.
   */
  exaggeration?: number
  /**
   * Horizontal resolution of the terrain, metres — the DEM vertex spacing.
   * Geometry laid on the ground is densified to this, because a chord longer
   * than the terrain can resolve is a chord that cuts through a hill.
   */
  groundStepM?: number
}

/** DEM vertex spacing at the default zoom (z15, mid latitudes). */
export const DEFAULT_GROUND_STEP_M = 9.5

/**
 * Densifying every polyline to the DEM spacing is unbounded work on a way that
 * crosses the whole patch. This caps the subdivisions of any ONE segment; past
 * it the segment is coarser than the terrain, which is still far better than
 * the two-vertex chord it started as.
 */
const MAX_SUBDIVISIONS = 64

export interface GroundFrame {
  /** Metres → normalized planar units at this latitude. */
  readonly mToN: number
  readonly anchorElevationM: number
  readonly exaggeration: number
  /** True when a real terrain is under the scene, rather than the flat map. */
  readonly hasTerrain: boolean
  /** Densification target in normalized units. */
  readonly stepN: number

  /** Ground elevation in METRES (measured, never exaggerated). */
  groundM(nx: number, ny: number): number
  /** Scene z of the GROUND SURFACE — the one answer everything must use. */
  groundZ(nx: number, ny: number): number
  /** Scene z of a point `heightM` above the ground at that position. */
  zAbove(nx: number, ny: number, heightM: number): number
  /** Scene z of an absolute elevation, for anything level by nature (water). */
  zAtElevationM(elevationM: number): number
  /** Lowest and highest ground over a set of planar points. */
  groundRangeM(points: ReadonlyArray<{ x: number; y: number }>): { minM: number; maxM: number }
  /**
   * Split a polyline so no segment outruns the terrain's own resolution.
   * Returns the input unchanged when there is no terrain to follow.
   */
  densify(line: ReadonlyArray<THREE.Vector2>): THREE.Vector2[]
  /** How many extra stations a segment of this length needs. 0 when none. */
  subdivisionsFor(lengthN: number): number
}

export function createGroundFrame(opts: GroundFrameOptions): GroundFrame {
  const mToN = metresToNormalized(opts.anchorLat)
  const anchorElevationM = opts.anchorElevationM ?? 0
  const sample = opts.sampleGroundM ?? null
  // A non-finite or non-positive exaggeration would silently flatten the world.
  const rawK = opts.exaggeration ?? 1
  const exaggeration = Number.isFinite(rawK) && rawK > 0 ? rawK : 1
  const stepN = Math.max(1e-12, (opts.groundStepM ?? DEFAULT_GROUND_STEP_M) * mToN)

  const groundM = (nx: number, ny: number): number => {
    if (!sample) return anchorElevationM
    const h = sample(nx, ny)
    // A sampler that returns NaN outside its patch would poison the whole
    // merged geometry — one bad vertex makes a mesh un-cullable and invisible.
    return Number.isFinite(h) ? h : anchorElevationM
  }

  const groundZ = (nx: number, ny: number): number =>
    (groundM(nx, ny) - anchorElevationM) * mToN * exaggeration

  const subdivisionsFor = (lengthN: number): number => {
    if (!sample || !(lengthN > stepN)) return 0
    return Math.min(MAX_SUBDIVISIONS, Math.floor(lengthN / stepN))
  }

  return {
    mToN,
    anchorElevationM,
    exaggeration,
    hasTerrain: sample !== null,
    stepN,

    groundM,
    groundZ,
    subdivisionsFor,

    zAbove: (nx, ny, heightM) => groundZ(nx, ny) + heightM * mToN,

    zAtElevationM: (elevationM) => (elevationM - anchorElevationM) * mToN * exaggeration,

    groundRangeM(points) {
      let minM = Infinity
      let maxM = -Infinity
      for (const p of points) {
        const h = groundM(p.x, p.y)
        if (h < minM) minM = h
        if (h > maxM) maxM = h
      }
      // An empty set has no range; the anchor is the only honest answer.
      if (!Number.isFinite(minM)) return { minM: anchorElevationM, maxM: anchorElevationM }
      return { minM, maxM }
    },

    densify(line) {
      if (!sample || line.length < 2) return line.map((p) => p.clone())
      const out: THREE.Vector2[] = [line[0].clone()]
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i]
        const b = line[i + 1]
        const n = subdivisionsFor(a.distanceTo(b))
        for (let s = 1; s <= n; s++) out.push(a.clone().lerp(b, s / (n + 1)))
        out.push(b.clone())
      }
      return out
    },
  }
}
