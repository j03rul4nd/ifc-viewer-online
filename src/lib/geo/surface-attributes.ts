// ─── surface-attributes ───────────────────────────────────────────────────────
// Deriving the attributes the PBR ground materials need from a geometry that
// was built without them.
//
// The polygon layers (grass, sand, rock, water) compute `aSurf` while they
// tessellate, because they already work in metres. The RIBBON layers — roads,
// rail, bridge decks — do not: they buffer centrelines straight into normalized
// coordinates, and threading a metric position through every quad, kerb face
// and rail head would mean touching a dozen push sites for one attribute.
//
// It is cheaper and far less invasive to read the positions back afterwards.
// The conversion runs in double precision here, before anything reaches a
// Float32Array, so `aSurf` still lands in metres at full precision — which is
// the whole reason it exists (see surface-shaders on the float32 cliff).

import * as THREE from 'three'

/**
 * Add `aSurf` (planar metres, relative to the geometry's own first vertex) and
 * a constant `aRough` to a geometry whose positions are in normalized units.
 *
 * The origin is per geometry rather than global. For a ribbon layer that is
 * fine: the pattern only has to be continuous WITHIN the layer, and every road
 * in one patch shares this one mesh.
 */
export function metricAttributes(
  geometry: THREE.BufferGeometry, metresToNormalized: number, roughness: number,
): void {
  const pos = geometry.getAttribute('position')
  if (!pos) return

  const count = pos.count
  const surf = new Float32Array(count * 2)
  const rough = new Float32Array(count)
  const originX = count > 0 ? pos.getX(0) : 0
  const originY = count > 0 ? pos.getY(0) : 0

  for (let i = 0; i < count; i++) {
    surf[i * 2] = (pos.getX(i) - originX) / metresToNormalized
    surf[i * 2 + 1] = (pos.getY(i) - originY) / metresToNormalized
    rough[i] = roughness
  }

  geometry.setAttribute('aSurf', new THREE.BufferAttribute(surf, 2))
  geometry.setAttribute('aRough', new THREE.BufferAttribute(rough, 1))
}
