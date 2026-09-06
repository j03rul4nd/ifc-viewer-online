// ─── tree geometry tests ──────────────────────────────────────────────────────
// THE RULE THIS FILE EXISTS FOR:
//
//   a shared frame convention that is only written in a comment is not a
//   convention, it is a hope.
//
// This module's header promises every geometry is "unit-sized (radius 1,
// height 1) with its base at z = 0", and osm-scene's instancing does its
// arithmetic as though that were true. Measured, none of the four canopies
// obeyed it: they ran from 0.52 to 3.0 units tall with bases from −0.88 to
// −0.25. A poplar came out three times its tagged height and every crown sat
// at the wrong distance from its own trunk.
//
// Two of them were also built in the wrong frame outright — `zUp` applied
// AFTER `put` rotates the translation too, so the fir's tiers and the poplar's
// spike stacked along −Y instead of +Z, sideways out of their own trunks. It
// survived for the same reason all of this survived: from directly above, a
// clump of green still looks like a clump of green.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { canopyGeometry, trunkGeometry, TREE_PROPORTIONS } from './tree-geometry'
import type { TreeShape } from './feature-variation'

const SHAPES: TreeShape[] = ['broadleaf', 'needleleaf', 'columnar', 'palm']

function box(geo: THREE.BufferGeometry): THREE.Box3 {
  geo.computeBoundingBox()
  return geo.boundingBox!
}

describe('canopyGeometry', () => {
  it.each(SHAPES)('stands %s on z = 0', (shape) => {
    // Anything below zero hangs through the ground when the canopy is
    // base-anchored, and pulls the crown off the trunk when it is not.
    expect(box(canopyGeometry(shape)).min.z).toBeCloseTo(0, 5)
  })

  it.each(SHAPES)('makes %s exactly one unit tall', (shape) => {
    // osm-scene multiplies this by the tree's height in metres. Any other
    // value is a silent scale error on every instance of the species.
    const b = box(canopyGeometry(shape))
    expect(b.max.z - b.min.z).toBeCloseTo(1, 5)
  })

  it.each(SHAPES)('keeps %s within one unit of its own axis', (shape) => {
    // The radial extent is what gets multiplied by the crown radius.
    const b = box(canopyGeometry(shape))
    const reach = Math.max(
      Math.abs(b.min.x), Math.abs(b.max.x), Math.abs(b.min.y), Math.abs(b.max.y),
    )
    expect(reach).toBeCloseTo(1, 5)
  })

  it('stacks a fir UPWARD, not sideways', () => {
    // THE FRAME BUG. zUp after put rotated the tier offsets with the geometry,
    // so a three-tier fir came out as three cones side by side along −Y. The
    // signature is a canopy wider than it is tall in one horizontal axis only.
    const b = box(canopyGeometry('needleleaf'))
    const spanX = b.max.x - b.min.x
    const spanY = b.max.y - b.min.y
    expect(Math.abs(spanX - spanY)).toBeLessThan(0.25)
  })

  it('leaves narrowness to TREE_PROPORTIONS, not to the unit geometry', () => {
    // A poplar IS narrower than an oak, and that is the whole reason it is a
    // separate species — columnar trees line avenues, and rendered round they
    // lose the vertical rhythm that makes such a street recognisable.
    //
    // But it cannot be narrower in the UNIT frame, because normalising fixes
    // every canopy at one unit across. That is the point of normalising: size
    // lives in exactly one place. Asserting it here as well would encode the
    // same fact twice and let the two drift.
    const b = box(canopyGeometry('columnar'))
    expect(b.max.x - b.min.x).toBeCloseTo(2, 5)
    expect(TREE_PROPORTIONS.columnar.crown).toBeLessThan(TREE_PROPORTIONS.broadleaf.crown)
    // And taller: a smaller trunk share leaves more of the tree to the crown.
    expect(TREE_PROPORTIONS.columnar.trunk).toBeLessThan(TREE_PROPORTIONS.broadleaf.trunk)
  })

  it('centres every canopy on the trunk axis it will be threaded onto', () => {
    // Not exactly — a broadleaf leans on purpose, and asymmetry is most of what
    // stops a tree reading as a lollipop. But a crown whose mass sits half a
    // radius off its own trunk reads as a bug, and that is what shipped.
    for (const shape of SHAPES) {
      const b = box(canopyGeometry(shape))
      const centre = b.getCenter(new THREE.Vector3())
      expect(Math.hypot(centre.x, centre.y), `${shape} crown is off-axis`).toBeLessThan(0.25)
    }
  })

  it('gives every species geometry that is actually built', () => {
    for (const shape of SHAPES) {
      const geo = canopyGeometry(shape)
      expect(geo.getAttribute('position').count, shape).toBeGreaterThan(0)
      expect(geo.getAttribute('normal'), shape).toBeDefined()
    }
  })
})

describe('trunkGeometry', () => {
  it.each(SHAPES)('stands %s on z = 0 and rises one unit', (shape) => {
    // The trunk is placed at the tree's base and scaled by its trunk height, so
    // it has to start where it is placed.
    const b = box(trunkGeometry(shape))
    expect(b.min.z).toBeCloseTo(0, 5)
    expect(b.max.z - b.min.z).toBeCloseTo(1, 5)
  })

  it.each(SHAPES)('keeps the %s trunk on its own axis', (shape) => {
    // Measured as INSCRIPTION IN THE UNIT CIRCLE about the z axis, which is
    // the property the instancing actually depends on: osm-scene multiplies
    // this by a trunk radius in metres, so a vertex outside radius 1 is a
    // trunk fatter than it was asked to be, and an off-axis one is a trunk
    // that misses its own crown.
    //
    // TWO EARLIER VERSIONS OF THIS TEST MEASURED ARTEFACTS. The bounding-box
    // centre is not the axis of an odd-sided prism, and the vertex centroid is
    // biased toward angle zero because CylinderGeometry duplicates its seam
    // vertex. Both read ~0.1 units of "offset" on a trunk that is perfectly
    // centred, and either would have sent a fix after a measurement error.
    const pos = trunkGeometry(shape).getAttribute('position')
    let maxR = 0
    for (let i = 0; i < pos.count; i++) {
      maxR = Math.max(maxR, Math.hypot(pos.getX(i), pos.getY(i)))
    }
    expect(maxR).toBeCloseTo(1, 5)
  })

  it('tapers upward rather than flaring', () => {
    // A trunk wider at the top than the base reads as a mistake instantly, and
    // the top ratio is the one number that decides it.
    const geo = trunkGeometry('broadleaf')
    const pos = geo.getAttribute('position')
    let baseReach = 0
    let topReach = 0
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i))
      if (pos.getZ(i) < 0.5) baseReach = Math.max(baseReach, r)
      else topReach = Math.max(topReach, r)
    }
    expect(topReach).toBeLessThan(baseReach)
  })
})

describe('TREE_PROPORTIONS', () => {
  it('covers every shape a canopy can be built for', () => {
    for (const shape of SHAPES) expect(TREE_PROPORTIONS[shape], shape).toBeDefined()
  })

  it('leaves room for a canopy on every species', () => {
    // A trunk share of 1 would leave a tree with no crown at all.
    for (const shape of SHAPES) {
      expect(TREE_PROPORTIONS[shape].trunk).toBeGreaterThan(0)
      expect(TREE_PROPORTIONS[shape].trunk).toBeLessThan(1)
    }
  })

  it('keeps a trunk thinner than its own crown', () => {
    for (const shape of SHAPES) {
      expect(TREE_PROPORTIONS[shape].trunkRadius, shape).toBeLessThan(0.5)
    }
  })
})
