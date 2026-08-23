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
 * A run of vertices that shares one surface grain. `end` is exclusive.
 *
 * The alternative was threading a roughness through every push site in the
 * ribbon builder — a dozen of them, for one number. A layer emits its geometry
 * in class order anyway, so the runs are contiguous by construction and a
 * handful of ranges says the same thing for free.
 */
export interface RoughnessBand {
  start: number
  end: number
  value: number
}

/**
 * Add `aSurf` (planar metres, relative to the geometry's own first vertex) and
 * `aRough` to a geometry whose positions are in normalized units.
 *
 * The origin is per geometry rather than global. For a ribbon layer that is
 * fine: the pattern only has to be continuous WITHIN the layer, and every road
 * in one patch shares this one mesh.
 *
 * `roughness` is the value every vertex starts at; `bands` overrides the runs
 * that are made of something else — paving slabs and gravel among the tarmac.
 */
export function metricAttributes(
  geometry: THREE.BufferGeometry, metresToNormalized: number, roughness: number,
  bands?: ReadonlyArray<RoughnessBand>,
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

  for (const band of bands ?? []) {
    const from = Math.max(0, Math.min(count, Math.floor(band.start)))
    const to = Math.max(from, Math.min(count, Math.floor(band.end)))
    for (let i = from; i < to; i++) rough[i] = band.value
  }

  geometry.setAttribute('aSurf', new THREE.BufferAttribute(surf, 2))
  geometry.setAttribute('aRough', new THREE.BufferAttribute(rough, 1))
}
