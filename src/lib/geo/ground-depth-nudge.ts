// ─── ground depth nudge ───────────────────────────────────────────────────────
// WHY THE OSM GROUND STOPS LOSING TO THE MAP WHEN THE CAMERA MOVES.
//
// Every ground layer — paving, carriageways, greenery, water — is draped on the
// same relief as the terrain patch, centimetres above it. The terrain is opaque
// and writes depth; the layers do not (their render order settles them among
// themselves, see `createSurfaceMaterial`). So each layer fragment has to pass
// a depth test against a surface that is, for the depth buffer, the same place.
//
// `polygonOffset` was the only thing deciding that test, and it is not enough:
//
//   - it is a bias in depth-buffer units, so it shrinks to nothing exactly
//     where the buffer is coarsest — far away and at grazing angles, the view
//     a 3D map is used from;
//   - the two surfaces are not coplanar to begin with. The terrain is a regular
//     grid, the layers are triangulated on their own outlines and sample the
//     DEM at their own vertices, so between vertices one bulges through the
//     other by decimetres on any slope.
//
// What that looked like: the raster tile draped on the terrain showing through
// plazas and streets in patches that crawl as you orbit — two maps fighting.
//
// ── The fix ───────────────────────────────────────────────────────────────────
//
// Pull every ground-layer vertex a fixed FRACTION of its distance toward the
// eye, along its own view ray. Moving a point along the ray it is seen on does
// not move it on screen — not a pixel of the outline shifts — it only changes
// the depth it is tested at. And because the pull is proportional to distance,
// it holds the same margin at 20 m and at 2 km, which is exactly the property a
// metre lift or a depth-unit bias lacks.
//
// The cost is honest and bounded: ground that lies within `GROUND_EYE_NUDGE` of
// the distance BEHIND a thin object can draw over that object's foot — 4 cm of
// a kerb seen from 20 m, 40 cm of a facade seen from 200 m, under a tree crown
// that already hides it. Raised geometry with real height is untouched.
//
// Orthographic views are left alone: their depth is linear, polygonOffset is
// already exact there, and scaling a view-space position in an orthographic
// projection WOULD move it on screen.

import type * as THREE from 'three'

/** Fraction of the eye distance each ground vertex is pulled toward the eye. */
export const GROUND_EYE_NUDGE = 0.002

/** GLSL line that replaces the projection for a nudged material. */
export const GROUND_NUDGE_GLSL =
  '\nif ( projectionMatrix[ 2 ][ 3 ] != 0.0 ) '
  + `gl_Position = projectionMatrix * vec4( mvPosition.xyz * ${(1 - GROUND_EYE_NUDGE).toFixed(6)}, 1.0 );\n`

/** Patch a vertex shader source: re-project after `project_vertex`. */
export function nudgeVertexShader(vertexShader: string): string {
  return vertexShader.replace('#include <project_vertex>', `#include <project_vertex>${GROUND_NUDGE_GLSL}`)
}

/**
 * Mark a ground-layer material so its fragments win the depth test against
 * the terrain they are draped on. Chains any `onBeforeCompile` already set,
 * and keys the program so three never shares it with an un-nudged twin.
 */
export function applyGroundDepthNudge<M extends THREE.Material>(material: M): M {
  const previous = material.onBeforeCompile
  const previousKey = material.customProgramCacheKey.bind(material)
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer)
    shader.vertexShader = nudgeVertexShader(shader.vertexShader)
  }
  material.customProgramCacheKey = () => `${previousKey()}|ground-nudge`
  material.userData.groundNudge = true
  return material
}
