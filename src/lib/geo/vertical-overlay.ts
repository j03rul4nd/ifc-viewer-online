// ─── vertical overlay ─────────────────────────────────────────────────────────
// THE AUDIT, DRAWN.
//
// `vertical-audit.ts` answers "which ways are guesses" as data. This draws that
// answer over the scene, because the failure it exists to catch is spatial: a
// list of way ids cannot tell you that every guessed way in the district is
// clustered on one interchange, and a picture can.
//
// ── The rule it enforces ──────────────────────────────────────────────────────
//
// The brief: if a height does not exist in the source, degrade honestly and
// VISIBLY — never fabricate a plausible value. The solver already keeps the
// first half of that bargain: `assumed` is recorded rather than laundered into
// a measurement. But a default clearance nobody can see is, from the outside,
// indistinguishable from a survey. This is what makes it distinguishable.
//
// ── Why a separate layer and not a recolour ───────────────────────────────────
//
// Tinting the real meshes would mean every builder growing a debug branch, and
// the audit would then depend on the same code it is auditing — if a bridge
// never reaches geometry, a recoloured bridge layer cannot show you the bridge
// that is missing. This draws from the SOLVED PROFILES instead, which is one
// stage upstream, so it can show a way the geometry dropped.
//
// Deliberately unlit, depth-tested off, and drawn last: it is an instrument,
// not part of the scene. It must be readable through a building, because the
// road that matters is usually the one inside one.

import * as THREE from 'three'
import type { VerticalConfidence } from './vertical'
import type { SolvedProfile } from './vertical-network'

/**
 * The palette, ordered by how much is known.
 *
 * Green→red is deliberate and is the one place a traffic-light scale is the
 * right choice: this axis genuinely runs from good to bad, and the reading is
 * "how much should I trust this", which is exactly what that scale means to
 * everyone without a legend.
 */
export const CONFIDENCE_COLORS: Record<VerticalConfidence, number> = {
  /** Measured. */
  surveyed: 0x2ecc71,
  /** Derived from what the way was observed to cross. */
  inferred: 0x3aa8dd,
  /** An ordering honoured, not a height read. */
  tagged: 0xf0a52e,
  /** A default. Nothing under this but the fallback. */
  assumed: 0xe0483a,
}

export interface VerticalOverlayOptions {
  /** Scene z for an absolute elevation in metres — from the ground frame. */
  zAtElevationM: (elevationM: number) => number
  /**
   * Draw ways whose height is well evidenced too.
   *
   * Off by default: the question the overlay is asked is "what is a guess",
   * and drawing the 90 % that are fine over the top of it is how an instrument
   * becomes wallpaper. On, it doubles as a map of the whole solved network.
   */
  includeConfident?: boolean
}

export interface VerticalOverlay {
  object: THREE.LineSegments
  /** How many ways were drawn. */
  count: number
  /** Of those, how many carry no evidence better than a default. */
  assumedCount: number
}

/**
 * Draw each solved profile as a polyline at its solved height, coloured by how
 * well that height is evidenced.
 *
 * One LineSegments for the whole overlay: a debug layer that costs a draw call
 * per way would change the frame rate it is being used to diagnose.
 */
export function buildVerticalOverlay(
  profiles: Iterable<SolvedProfile>,
  opts: VerticalOverlayOptions,
): VerticalOverlay | null {
  const positions: number[] = []
  const colors: number[] = []
  const tint = new THREE.Color()
  let count = 0
  let assumedCount = 0

  for (const p of profiles) {
    if (p.points.length < 2) continue
    const confident = p.confidence === 'surveyed' || p.confidence === 'inferred'
    if (confident && opts.includeConfident !== true) continue

    count++
    if (p.confidence === 'assumed') assumedCount++
    tint.setHex(CONFIDENCE_COLORS[p.confidence])

    for (let i = 0; i < p.points.length - 1; i++) {
      const a = p.points[i]
      const b = p.points[i + 1]
      positions.push(
        a.x, a.y, opts.zAtElevationM(p.elevationM[i]),
        b.x, b.y, opts.zAtElevationM(p.elevationM[i + 1]),
      )
      // Both ends of a segment, so a way is one flat colour rather than a
      // gradient — the confidence is a property of the WAY, not of a station.
      for (let k = 0; k < 2; k++) colors.push(tint.r, tint.g, tint.b)
    }
  }

  if (count === 0) return null

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeBoundingSphere()

  const object = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    vertexColors: true,
    // Readable through solid geometry. The road worth looking at is usually the
    // one buried in a building, and an instrument that hides behind the thing
    // it is diagnosing is not an instrument.
    depthTest: false,
    transparent: true,
    opacity: 0.9,
  }))
  object.name = 'geo-vertical-overlay'
  object.renderOrder = 9999
  // An overlay is a measurement of the scene, never part of its lighting.
  object.castShadow = false
  object.receiveShadow = false
  // Never let a debug layer answer a click meant for the model.
  object.raycast = () => {}

  return { object, count, assumedCount }
}

/** Free the overlay's GPU memory. */
export function disposeVerticalOverlay(overlay: VerticalOverlay): void {
  overlay.object.geometry.dispose()
  const material = overlay.object.material
  if (Array.isArray(material)) material.forEach((m) => m.dispose())
  else material.dispose()
}
