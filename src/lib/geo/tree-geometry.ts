// ─── Tree geometry ────────────────────────────────────────────────────────────
//
// Canopy and trunk shapes for the OSM tree layer, built procedurally.
//
// Why not imported models: a neighbourhood is hundreds to thousands of trees.
// Everything here is drawn as ONE InstancedMesh per species, so the whole
// canopy costs four draw calls regardless of count — and it ships as code, so
// the viewer keeps working offline with nothing to download. An authored asset
// would look better in isolation and worse in aggregate: more bytes, a loader,
// a licence to track, and per-instance cost that scales with its triangle count.
//
// The trade is spent where it shows: silhouette. At map scale a tree IS its
// outline, so a broadleaf gets fused lobes rather than one ball, a conifer gets
// stacked tiers rather than a single cone, and a palm gets actual fronds.
//
// Convention shared with osm-scene.ts: every geometry is built in a Z-up frame,
// unit-sized (radius 1, height 1) with its base at z = 0, so an instance matrix
// scales it directly into metres.

import * as THREE from 'three'
import type { TreeShape } from './feature-variation'

/**
 * Merge parts into one geometry. Only position + normal are kept: the layer
 * colours per instance, so vertex colours and UVs would be dead weight across
 * every tree in the scene.
 */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  let offset = 0

  for (const part of parts) {
    const nonIndexed = part.index ? part.toNonIndexed() : part
    nonIndexed.computeVertexNormals()
    const p = nonIndexed.getAttribute('position')
    const n = nonIndexed.getAttribute('normal')
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i))
      normals.push(n.getX(i), n.getY(i), n.getZ(i))
      indices.push(offset + i)
    }
    offset += p.count
    if (nonIndexed !== part) nonIndexed.dispose()
    part.dispose()
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setIndex(indices)
  return geo
}

/** Place a part in the unit frame: scale, then translate. */
function put(
  geo: THREE.BufferGeometry,
  scale: [number, number, number],
  at: [number, number, number],
): THREE.BufferGeometry {
  geo.scale(scale[0], scale[1], scale[2])
  geo.translate(at[0], at[1], at[2])
  return geo
}

/**
 * Cone/cylinder primitives are built around +Y; the planar frame is Z-up.
 *
 * MUST BE APPLIED BEFORE `put`, never after. `put` translates, and a rotation
 * applied afterwards rotates the translation with it: `zUp(put(cone, s, [0, 0,
 * 0.3]))` stacks the part along −Y instead of +Z. That is not hypothetical —
 * it is what smeared the fir's tiers and the poplar's spike sideways out of
 * their own trunks, and it survived because the result still looked like a
 * plausible clump of green from directly above.
 */
function zUp(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.rotateX(Math.PI / 2)
  return geo
}

/**
 * A cone standing on z = 0 in the Z-up frame, `radius` across and `height` tall.
 *
 * Wraps the ordering trap above so no caller has to remember it, and folds in
 * the half-height shift that `ConeGeometry` needs to stand on its base rather
 * than straddle the origin.
 */
function cone(
  radius: number, height: number, segments: number, baseZ: number,
): THREE.BufferGeometry {
  const geo = zUp(new THREE.ConeGeometry(1, 1, segments))
  geo.scale(radius, radius, height)
  geo.translate(0, 0, baseZ + height / 2)
  return geo
}

/**
 * Force a canopy into the frame the whole module claims to work in: base at
 * z = 0, one unit tall, one unit across.
 *
 * THE CONVENTION WAS A COMMENT, NOT A FACT. Measured, the four canopies ran
 * from 0.52 to 3.0 units tall with bases anywhere from −0.88 to −0.25, and the
 * instancing in osm-scene scales them as though all of it were true — so a
 * poplar came out three times its tagged height and every crown sat at the
 * wrong distance from its own trunk.
 *
 * Normalising here rather than by hand-tuning each builder keeps proportion in
 * ONE place: `TREE_PROPORTIONS`, which is where the module says it lives. A
 * builder's numbers are then free to describe a SHAPE without also having to
 * encode a size.
 */
function normalize(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.computeBoundingBox()
  const box = geo.boundingBox
  if (!box) return geo

  const height = box.max.z - box.min.z
  // Radial extent, not the bounding box's width: a crown is scaled by a radius
  // and taking the half-width of an off-centre box would shrink a leaning tree.
  const reach = Math.max(
    Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.y), Math.abs(box.max.y),
  )
  if (height > 1e-6) geo.scale(1, 1, 1 / height)
  if (reach > 1e-6) geo.scale(1 / reach, 1 / reach, 1)
  geo.computeBoundingBox()
  geo.translate(0, 0, -(geo.boundingBox?.min.z ?? 0))
  return geo
}

// ── Canopies ──────────────────────────────────────────────────────────────────

/**
 * Broadleaf: three fused lobes on a slight lean. One sphere reads as a lollipop
 * from every angle; overlapping lobes give the crown a profile that changes as
 * the camera moves, which is most of what makes a tree read as a tree.
 */
function broadleafCanopy(): THREE.BufferGeometry {
  return merge([
    put(new THREE.IcosahedronGeometry(1, 1), [1.0, 0.95, 0.9], [0, 0, 0.52]),
    put(new THREE.IcosahedronGeometry(1, 1), [0.62, 0.6, 0.58], [0.42, 0.14, 0.74]),
    put(new THREE.IcosahedronGeometry(1, 1), [0.55, 0.58, 0.5], [-0.36, -0.22, 0.4]),
  ])
}

/**
 * Needleleaf: three tapering tiers with a gap between them, which is what makes
 * a fir silhouette rather than a traffic cone.
 */
function needleleafCanopy(): THREE.BufferGeometry {
  return merge([
    cone(1.00, 0.52, 7, 0),
    cone(0.78, 0.46, 7, 0.30),
    cone(0.52, 0.44, 7, 0.62),
  ])
}

/**
 * Columnar (poplar, cypress): a tall narrow spindle. These line avenues and
 * boundaries, and rendering them as round crowns loses the vertical rhythm that
 * makes such a street recognisable.
 */
function columnarCanopy(): THREE.BufferGeometry {
  return merge([
    put(new THREE.IcosahedronGeometry(1, 1), [0.62, 0.62, 1.5], [0, 0, 0.62]),
    cone(0.5, 0.42, 8, 1.5),
  ])
}

/**
 * Palm: a radial burst of fronds. Nothing else in this set looks remotely like
 * one, and a coastal or Mediterranean site rendered with round green balls is
 * the kind of detail a client notices immediately.
 */
function palmCanopy(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const FRONDS = 7
  for (let i = 0; i < FRONDS; i++) {
    const a = (i / FRONDS) * Math.PI * 2
    // A frond is a flattened, tapered wedge that droops away from the crown.
    const frond = new THREE.ConeGeometry(1, 1, 4)
    zUp(frond)
    frond.scale(0.16, 0.16, 1.0)
    frond.rotateY(Math.PI / 2)          // lay it flat, pointing along +X
    frond.scale(1, 1, 0.34)             // flatten into a blade
    frond.rotateY(-0.55)                // droop
    frond.rotateZ(a)                    // fan around the crown
    frond.translate(0, 0, 0.06)
    parts.push(frond)
  }
  // A small core hides the point where every frond meets.
  parts.push(put(new THREE.IcosahedronGeometry(1, 0), [0.18, 0.18, 0.16], [0, 0, 0.04]))
  return merge(parts)
}

const CANOPY_BUILDERS: Record<TreeShape, () => THREE.BufferGeometry> = {
  broadleaf: broadleafCanopy,
  needleleaf: needleleafCanopy,
  columnar: columnarCanopy,
  palm: palmCanopy,
}

/**
 * Canopy for one species, in the unit frame: base at z = 0, roughly 1 tall and
 * 1 in radius. Callers scale it per instance.
 */
export function canopyGeometry(shape: TreeShape): THREE.BufferGeometry {
  return normalize(CANOPY_BUILDERS[shape]())
}

/** Trunk: tapered, base at z = 0, height 1, radius 1 at the base. */
export function trunkGeometry(shape: TreeShape): THREE.BufferGeometry {
  // Palms taper less and lean into a gentle curve; the rest narrow upward.
  const topRatio = shape === 'palm' ? 0.72 : 0.62
  const geo = new THREE.CylinderGeometry(topRatio, 1, 1, shape === 'palm' ? 7 : 5)
  zUp(geo)
  geo.translate(0, 0, 0.5)
  return geo
}

// ── Proportions ───────────────────────────────────────────────────────────────

export interface TreeProportions {
  /** Share of total height taken by the trunk. */
  trunk: number
  /** Crown radius as a multiple of the tagged/estimated crown radius. */
  crown: number
  /** Trunk radius as a share of crown radius. */
  trunkRadius: number
  /**
   * How far the crown SINKS PAST the top of the trunk, as a share of the
   * crown's own height.
   *
   * REPLACES a `baseAnchored` boolean, which stopped meaning anything once
   * `canopyGeometry` normalised every species to base-at-zero. That flag was
   * only ever a patch over the builders disagreeing about their own frame: one
   * branch placed the crown by its centre and scaled it by half its height,
   * which — against a geometry that now genuinely starts at zero — left a
   * broadleaf's crown squashed to half size and floating a full half-crown
   * above its own trunk. Visible immediately in a render, invisible to every
   * test, because both halves were self-consistent.
   *
   * A real crown swallows the top of its trunk; only a lollipop balances on the
   * end of one. So the overlap is stated as a number per species instead of
   * being implied by an anchoring mode. The tree's total height is unchanged by
   * it — the crown grows downward by the same amount it sinks.
   */
  crownDrop: number
}

/**
 * Per-species proportions. A palm is mostly trunk, a fir is mostly canopy, and
 * a poplar is narrow — getting these wrong is more visible than any amount of
 * polygon detail.
 */
export const TREE_PROPORTIONS: Record<TreeShape, TreeProportions> = {
  // A round crown swallows a good part of its trunk — this is the species the
  // old centre-anchoring was trying to express, and the one it broke.
  broadleaf:  { trunk: 0.34, crown: 1.0,  trunkRadius: 0.11, crownDrop: 0.28 },
  // A fir's skirt reaches the ground-most branches but the trunk still shows.
  needleleaf: { trunk: 0.18, crown: 0.82, trunkRadius: 0.09, crownDrop: 0.08 },
  columnar:   { trunk: 0.20, crown: 0.55, trunkRadius: 0.10, crownDrop: 0.12 },
  // Fronds spring from the very top of the stem. Nothing overlaps.
  palm:       { trunk: 0.68, crown: 1.15, trunkRadius: 0.07, crownDrop: 0 },
}
