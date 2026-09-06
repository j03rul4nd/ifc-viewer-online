// ─── multi-placement ──────────────────────────────────────────────────────────
// PUTTING EVERY GEOREFERENCED MODEL WHERE IT ACTUALLY IS, not just the first one.
//
// ── The limit this lifts ──────────────────────────────────────────────────────
//
// `model-sites.ts` opens by stating the constraint this module removes: "Map
// mode has exactly ONE placement, because the basemap is aligned to the scene
// and the scene has one origin." That was true of the MAP — there is one
// basemap and it can only be aligned once — but it was being applied to the
// MODELS too, and that does not follow. The map is aligned to one anchor; every
// other model can then be moved to wherever the map says its own coordinates
// land.
//
// Without that step, loading the Oriental Pearl Tower and then the Shanghai
// World Financial Center puts both at the scene origin, stacked inside each
// other, three kilometres from where either of them stands.
//
// ── Why this does not break a federated set ───────────────────────────────────
//
// The worry is the normal case: several files of ONE building, which currently
// line up because they share a project origin and are drawn in scene
// coordinates. Placing each by its own georeference sounds like it would
// collapse them onto one point.
//
// It does not, and the reason is worth stating because it is what makes this
// safe. A file's placement is derived from ITS OWN BOUNDING-BOX CENTRE pushed
// through ITS OWN map conversion (see `placement.ts`, "anchor-at-centroid").
// Two files sharing an origin therefore resolve to two DIFFERENT lat/lons,
// offset by exactly the distance between their centroids. Sending each to its
// own coordinates reproduces that offset — it is the same rigid transform
// expressed geographically. The federation survives because the geometry says
// the same thing in both coordinate systems.
//
// What it does NOT survive is a file whose georeferencing is wrong. That is the
// point: it becomes visible instead of being hidden by a shared origin.
//
// PURE: numbers in, numbers out. No THREE, no scene, no viewer.

import {
  WEB_MERCATOR_WORLD_M, cosLatScale, latLonToNormalized, mapYawRad,
} from './geo-math'
import type { GeoPlacement } from './geo-types'

/** Where the map's anchor model sits in the scene, and how the map is turned. */
export interface AnchorFrame {
  /** The placement the basemap was aligned to. */
  placement: GeoPlacement
  /** Scene x/z the anchor's lat/lon was landed on. */
  anchorScene: { x: number; z: number }
  /** Scene Y of the map plane — `GeoRootTransform.position.y`. */
  groundY: number
}

export interface ScenePoint {
  x: number
  y: number
  z: number
}

/**
 * Where a given lat/lon lands in scene coordinates, on an already-placed map.
 *
 * The inverse of `composeGeoRootTransform`, and deliberately derived from it
 * rather than re-guessed: that function positions the map so the anchor's
 * normalized mercator point lands on `anchorScene`, so any OTHER normalized
 * point lands at the same place plus the rotated, scaled difference between
 * them. Same scale and same yaw — both are properties of the map, not of the
 * model being placed, which is why a model far from the anchor still lands
 * correctly.
 *
 * `heightM` is measured above the map plane, so a model states its own ground
 * floor exactly as the anchor does.
 */
export function sceneOfLatLon(
  frame: AnchorFrame, lat: number, lon: number, heightM = 0,
): ScenePoint {
  const scale = WEB_MERCATOR_WORLD_M * cosLatScale(frame.placement.lat)
  const yawRad = mapYawRad(frame.placement.rotationDeg)

  const a = latLonToNormalized(frame.placement.lat, frame.placement.lon)
  const p = latLonToNormalized(lat, lon)

  // Rx(−π/2) takes (nx, ny, 0) to (nx, 0, −ny); the difference is what matters,
  // because the anchor's own contribution is already baked into the map's
  // position.
  const ax = scale * (p.nx - a.nx)
  const az = -scale * (p.ny - a.ny)
  const cos = Math.cos(yawRad)
  const sin = Math.sin(yawRad)

  return {
    x: frame.anchorScene.x + ax * cos + az * sin,
    y: frame.groundY + heightM,
    z: frame.anchorScene.z + (-ax * sin + az * cos),
  }
}

/** The bit of a model's bounds this module needs. Structural, to avoid imports. */
export interface BoundsLike {
  center: { x: number; y: number; z: number }
  size: { x: number; y: number; z: number }
}

/**
 * The translation that moves a model from where the scene put it to where its
 * own georeferencing says it belongs.
 *
 * Returned as a DELTA rather than an absolute position because that is what the
 * viewer's per-model transform takes, and because a delta composes with a
 * manual nudge instead of silently discarding one.
 *
 * The vertical term uses the model's own `minY`, not its centre: a building is
 * placed by the ground it stands on, and two towers of different heights
 * sharing a centre elevation would float one and bury the other.
 */
export function satelliteOffset(
  frame: AnchorFrame, placement: GeoPlacement, bounds: BoundsLike,
): ScenePoint {
  const target = sceneOfLatLon(frame, placement.lat, placement.lon, placement.heightOffsetM)
  const minY = bounds.center.y - bounds.size.y / 2
  return {
    x: target.x - bounds.center.x,
    y: target.y - minY,
    z: target.z - bounds.center.z,
  }
}

/**
 * Whether a model should be moved at all.
 *
 * The anchor never is — the map was aligned to it, so it is already right, and
 * translating it would move the building away from the basemap that was fitted
 * to it. A model with no usable placement is also left alone: the scene put it
 * somewhere, that somewhere is the project origin, and inventing a location for
 * it would be exactly the fabrication the rest of this pipeline refuses.
 */
export function shouldPlaceSatellite(
  modelId: string, anchorModelId: string | null, placement: GeoPlacement | null,
): boolean {
  if (placement === null) return false
  if (anchorModelId !== null && modelId === anchorModelId) return false
  return Number.isFinite(placement.lat) && Number.isFinite(placement.lon)
}
