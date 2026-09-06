// ─── shadow policy ────────────────────────────────────────────────────────────
// WHICH CONTEXT LAYERS PARTICIPATE IN SHADOWS, and how big the shadow camera
// has to be for a district rather than a building.
//
// ── The gap this closes ───────────────────────────────────────────────────────
//
// Before this module `castShadow` appeared exactly zero times across the whole
// of src/lib/geo. Every OSM mesh — buildings, piers, trees, cars, street
// furniture — was lit but cast nothing and received nothing. What looked like a
// tree's shadow in a screenshot was a `green` ground polygon it happened to be
// standing in.
//
// The sun direction was never the problem: `aimKeyLight` already points the
// viewer's key light at the same sun the hillshade and the sky environment use.
// The problem was that nothing opted in, and that the shadow camera was framed
// for a model on a turntable (±50 units, far 200) while the context it now has
// to cover is several hundred metres across.
//
// ── Why a policy and not a blanket flag ───────────────────────────────────────
//
// `castShadow = true` on everything is worse than nothing. Ground planes are
// the case that matters: a large, near-flat surface that casts onto itself
// produces shadow acne across the entire scene, and no bias setting fixes it at
// district scale. So ground cover RECEIVES and does not CAST. Standing objects
// do both. Water does neither while it is transparent — Three's shadow pass
// does not order transparent receivers correctly, and the result reads worse
// than an unshadowed sea.
//
// PURE: no THREE objects are created here, nothing is mutated, no scene is
// touched. Geometry and policy in, policy out. The caller applies it.

import type { FeatureKind } from './osm-features'

/** What a layer does in the shadow pass. */
export interface ShadowRole {
  /** Blocks light: appears in the shadow map. */
  cast: boolean
  /** Is darkened by the shadow map. */
  receive: boolean
}

const STANDING: ShadowRole = { cast: true, receive: true }
const GROUND: ShadowRole = { cast: false, receive: true }
const NONE: ShadowRole = { cast: false, receive: false }

/**
 * The shadow role of each context layer, and the reason for each departure
 * from "standing objects do both".
 */
export const SHADOW_ROLES: Record<FeatureKind, ShadowRole> = {
  // Standing volumes. The whole point: without these the context has no
  // contact with the ground it stands on.
  building: STANDING,
  tree: STANDING,
  signal: STANDING,
  // A pier has real thickness and a real side face, and its shadow on the water
  // is what tells a viewer it stands above rather than floats on it.
  pier: STANDING,
  // Carried structures. A bridge that casts no shadow on what it crosses is the
  // single clearest way to make a deck read as a decal.
  bridge: STANDING,

  // Ground cover. Receives so that buildings and trees land on it; never casts,
  // because a near-flat surface casting onto itself is shadow acne at every
  // bias setting once the shadow camera is district-sized.
  green: GROUND,
  sand: GROUND,
  rock: GROUND,
  // Carriageways are draped ground, with the same self-shadowing problem — and
  // where a road IS elevated it is the bridge layer that carries it.
  road: GROUND,
  rail: GROUND,

  // Water is excluded entirely while it is transparent: Three does not order
  // transparent receivers against the shadow map correctly, and a sea with
  // banded artefacts across it is worse than a sea with no shadows. Revisit
  // when the water layer stops being transparent.
  water: NONE,
}

/**
 * Half-extent of the shadow camera, given the radius of what must be covered.
 *
 * Padded, because a shadow camera framed exactly to the content clips the
 * shadows of anything at the edge — and the caster is often outside the frame
 * of what receives its shadow, which is exactly the case for a tall building at
 * the boundary and low sun.
 */
export const SHADOW_FRUSTUM_PAD = 1.15

/**
 * Smallest half-extent worth using, scene units.
 *
 * Below this the caller is looking at a model on its own with no context, and
 * shrinking further buys no resolution that the model's own shadow did not
 * already have.
 */
export const MIN_SHADOW_HALF_EXTENT = 50

/**
 * Coarsest shadow texel worth rendering, scene units per texel.
 *
 * Past this a contact shadow stops reading as contact and becomes a grey smear
 * under the object, which is worse for credibility than no shadow at all — the
 * viewer sees a mistake rather than an absence. When the requested extent would
 * exceed it at the given map size, `shadowCameraPlan` reports `degraded` so the
 * caller can decline rather than ship the smear.
 */
export const MAX_USABLE_TEXEL = 1.0

export interface ShadowCameraPlan {
  /** Half-extent for left/right/top/bottom, scene units. */
  halfExtent: number
  /** Far plane needed to reach across the frustum from the light. */
  far: number
  /** Scene units covered by one shadow-map texel. */
  texelSize: number
  /**
   * True when `texelSize` exceeds `MAX_USABLE_TEXEL` — the frustum is too big
   * for the map size to serve. Honest signal, not an error: the caller decides
   * between a bigger map, a cascade, or no context shadows.
   */
  degraded: boolean
}

/**
 * Size a directional light's shadow camera to cover a scene of a given radius.
 *
 * `lightDistance` is preserved by the caller, never derived here: `aimKeyLight`
 * moves the light on a sphere of fixed radius precisely so that the shadow
 * frustum keeps covering the same thing as the sun moves, and recomputing the
 * distance from the extent would undo that.
 */
export function shadowCameraPlan(
  sceneRadius: number,
  lightDistance: number,
  mapSize: number,
): ShadowCameraPlan {
  const halfExtent = Math.max(MIN_SHADOW_HALF_EXTENT, sceneRadius * SHADOW_FRUSTUM_PAD)
  // The light sits at `lightDistance` from the origin; the far corner of the
  // frustum is further still, by the frustum's own half-diagonal.
  const far = lightDistance + halfExtent * Math.SQRT2
  const texelSize = (halfExtent * 2) / Math.max(1, mapSize)
  return { halfExtent, far, texelSize, degraded: texelSize > MAX_USABLE_TEXEL }
}
