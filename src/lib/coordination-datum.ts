// ─── Shared scene datum for models moved to the origin ────────────────────────
// A model whose coordinates run past 100 km is converted with
// COORDINATE_TO_ORIGIN (see ifc-far-coordinates): web-ifc subtracts the
// position of the FIRST mesh it meets and the .frag records that shift as the
// coordination matrix. Each file picks its own shift, so two such files from
// the same project — the road and the drainage, both exported from Civil 3D in
// UTM — would land tens of metres apart although their real coordinates agree
// to the millimetre.
//
// The fix is one datum for the scene. The first shifted model sets it; every
// later model whose REAL position lies within reach of it is drawn with that
// same shift, by offsetting its object by `datum − ownShift` (a small vector:
// the difference between two first-mesh positions on one site). Its recorded
// coordination then IS the datum, so every consumer that subtracts it — real
// coordinates under the cursor, point-cloud registration, the map's ground
// plane — keeps reading the file's own numbers.
//
// A model too far from the datum is on another site (or in another CRS) and
// keeps its own shift: forcing it into the datum would draw it hundreds of
// kilometres out, where float32 loses the geometry, which is the very failure
// this exists to avoid. Unshifted models near the origin (local coordinates)
// stay where they are for the same reason in reverse.
//
// All vectors are in SCENE axes (y up), the convention of
// viewer.getModelCoordination: drawn = real + coordination.

import { FAR_COORDINATE_THRESHOLD } from './ifc-far-coordinates'

export interface Vec3 { x: number; y: number; z: number }

/**
 * How far a model's real centre may sit from the datum's real origin and
 * still join it. The same 100 km bound the converter uses: inside it, every
 * joined model is drawn within float32's comfortable range of the origin.
 */
export const DATUM_JOIN_RADIUS_M = FAR_COORDINATE_THRESHOLD

/** A shift smaller than this is "not moved" (float noise from the matrix). */
const SHIFT_EPS_M = 1e-6

export const ZERO: Readonly<Vec3> = Object.freeze({ x: 0, y: 0, z: 0 })

export function isShifted(c: Vec3 | null | undefined): boolean {
  if (!c) return false
  return Math.abs(c.x) > SHIFT_EPS_M || Math.abs(c.y) > SHIFT_EPS_M || Math.abs(c.z) > SHIFT_EPS_M
}

export interface DatumInput {
  /** Shift the loader applied to this model (its coordination matrix translation). */
  own: Vec3
  /** Centre of the model's geometry as drawn, before any datum offset. */
  drawnCentre: Vec3 | null
  /** The scene's datum, if a shifted model already set one. */
  datum: Vec3 | null
}

export interface DatumResult {
  /** What the viewer records as this model's coordination: drawn = real + this. */
  coordination: Vec3
  /** Translation to put on the model's object so it is drawn in the datum. */
  objectOffset: Vec3
  /** The scene datum after this model (unchanged, or set by it). */
  datum: Vec3 | null
  /**
   * 'set'      — first shifted model, it defines the datum
   * 'joined'   — drawn in the existing datum
   * 'separate' — shifted, but on another site: keeps its own shift
   * 'local'    — not shifted, nothing to reconcile
   */
  role: 'set' | 'joined' | 'separate' | 'local'
}

/** Horizontal distance in scene axes (x, z); elevation does not split a site. */
function planDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/** Where the model's centre is in its own real coordinates (scene axes). */
function realCentre(drawn: Vec3, own: Vec3): Vec3 {
  return { x: drawn.x - own.x, y: drawn.y - own.y, z: drawn.z - own.z }
}

/** The datum's real origin: the real point drawn at the scene origin. */
function datumOrigin(datum: Vec3): Vec3 {
  return { x: -datum.x, y: -datum.y, z: -datum.z }
}

/**
 * True when a model, given where its geometry is drawn and the shift it
 * carries, belongs to the site the datum describes.
 */
export function withinDatum(drawnCentre: Vec3 | null, own: Vec3, datum: Vec3): boolean {
  // No geometry to measure: trust the shift itself. Two shifts on one site
  // differ by the distance between two first meshes, not by a country.
  const real = drawnCentre ? realCentre(drawnCentre, own) : datumOrigin(own)
  return planDistance(real, datumOrigin(datum)) <= DATUM_JOIN_RADIUS_M
}

export function resolveDatum({ own, drawnCentre, datum }: DatumInput): DatumResult {
  const shifted = isShifted(own)

  if (!datum) {
    if (!shifted) return { coordination: { ...own }, objectOffset: { ...ZERO }, datum: null, role: 'local' }
    return { coordination: { ...own }, objectOffset: { ...ZERO }, datum: { ...own }, role: 'set' }
  }

  if (!withinDatum(drawnCentre, own, datum)) {
    return { coordination: { ...own }, objectOffset: { ...ZERO }, datum, role: shifted ? 'separate' : 'local' }
  }

  return {
    coordination: { ...datum },
    objectOffset: { x: datum.x - own.x, y: datum.y - own.y, z: datum.z - own.z },
    datum,
    role: 'joined',
  }
}
