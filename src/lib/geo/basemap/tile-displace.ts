// ─── tile-displace ────────────────────────────────────────────────────────────
// The flat map on the city's relief (WP2). Every basemap tile is a single quad
// made by 3d-tiles-renderer's GeneratedSurfacePlugin; on load it is swapped for
// a grid and its vertices lifted to the coarse DEM (coarse-dem), on the CPU.
//
// Why CPU and not a vertex shader: TilesFadePlugin already wraps each tile
// material's onBeforeCompile, and the overlay plugin may too; a third wrapper
// would have to be chained in the right order on every material, and a float
// height texture is not filterable on every phone. A grid of at most 33² per
// tile is a few hundred bilinear reads, once per tile load.
//
// The tile's bounding box has ZERO height in the plugin (a flat plane). A
// lifted tile would leave it: culled at the frustum edge, its screen error
// measured from too low. `createReliefBoundsPlugin` gives every box the
// relief's half-height before three builds the OBB from it, and `refresh()`
// re-applies it to the tiles that already exist when the relief arrives.

import * as THREE from 'three'
import { sampleCoarseN, type CoarseDem } from '../coarse-dem'

export interface TileRelief {
  dem: CoarseDem
  /** Elevation of the anchor, metres — the plane z = 0. */
  anchorM: number
  /** Normalized units per metre at the anchor's latitude. */
  metresToN: number
}

/** Spacing the tile grid aims at, metres: about the DEM's own (≈38 m at z12). */
export const TILE_GRID_TARGET_M = 40
export const TILE_GRID_MIN = 4
export const TILE_GRID_MAX = 32

/** Grid segments per side for a tile `sizeN` normalized units wide. */
export function tileGridSegments(sizeN: number, metresToN: number): number {
  const sizeM = sizeN / Math.max(1e-30, metresToN)
  return Math.min(TILE_GRID_MAX, Math.max(TILE_GRID_MIN, Math.round(sizeM / TILE_GRID_TARGET_M)))
}

/** Half-height, normalized, every tile box must have to hold the relief. */
export function reliefHalfHeightN(r: TileRelief | null): number {
  if (!r) return 0
  const up = Math.max(Math.abs(r.dem.maxM - r.anchorM), Math.abs(r.dem.minM - r.anchorM))
  // A metre of slack: bilinear never overshoots, but the box is cheap.
  return (up + 1) * r.metresToN
}

interface FlatTile {
  w: number
  h: number
  u0: number; v0: number; u1: number; v1: number
}

const FLAT = Symbol('flatTile')
type TileMesh = THREE.Mesh & { [FLAT]?: FlatTile & { segments: number } }

function readFlat(mesh: TileMesh): FlatTile | null {
  if (mesh[FLAT]) return mesh[FLAT]
  const g = mesh.geometry as THREE.PlaneGeometry
  const p = g.parameters
  const uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined
  if (!p || !uv || !(p.width > 0)) return null
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i)
    if (u < u0) u0 = u
    if (u > u1) u1 = u
    if (v < v0) v0 = v
    if (v > v1) v1 = v
  }
  return { w: p.width, h: p.height, u0, v0, u1, v1 }
}

/**
 * Lift one tile scene onto the relief (or flatten it back with null). Safe to
 * call again: the grid is rebuilt only when its segment count changes.
 */
export function displaceTileScene(scene: THREE.Object3D, relief: TileRelief | null): void {
  scene.traverse((o) => {
    const mesh = o as TileMesh
    if (!(mesh as THREE.Mesh).isMesh) return
    const flat = readFlat(mesh)
    if (!flat) return
    const segments = relief ? tileGridSegments(flat.w, relief.metresToN) : 1
    let geometry = mesh.geometry as THREE.PlaneGeometry
    if (!mesh[FLAT] || mesh[FLAT].segments !== segments) {
      const next = new THREE.PlaneGeometry(flat.w, flat.h, segments, segments)
      const uv = next.getAttribute('uv') as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i,
          flat.u0 + uv.getX(i) * (flat.u1 - flat.u0),
          flat.v0 + uv.getY(i) * (flat.v1 - flat.v0))
      }
      geometry.dispose()
      mesh.geometry = next
      geometry = next
      mesh[FLAT] = { ...flat, segments }
    }
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute
    const cx = mesh.position.x, cy = mesh.position.y
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, relief
        ? (sampleCoarseN(relief.dem, cx + pos.getX(i), cy + pos.getY(i)) - relief.anchorM) * relief.metresToN
        : 0)
    }
    pos.needsUpdate = true
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
  })
}

/** Tile shape the plugin hands preprocessNode (only what is read here). */
interface PlanarTile {
  boundingVolume?: { box?: number[] }
  engineData?: { boundingVolume?: { setObbData(box: number[], m: THREE.Matrix4): void }; transform?: THREE.Matrix4 }
}

/**
 * A 3d-tiles-renderer plugin that gives every planar tile box the relief's
 * height. Its preprocessNode runs (from the base class) BEFORE three builds the
 * tile's OBB from `boundingVolume.box`, so new tiles need nothing else.
 */
export function createReliefBoundsPlugin(): {
  name: string
  preprocessNode(tile: PlanarTile): void
  /** Set the half-height and re-apply it to every tile already processed. */
  setHalfHeight(halfN: number, tiles: { traverse(cb: (t: PlanarTile) => boolean | void, after: null, ensure: boolean): void } | null): void
} {
  let halfN = 0
  const apply = (tile: PlanarTile): boolean => {
    const box = tile.boundingVolume?.box
    if (!box || box.length < 12 || box[11] === halfN) return false
    box[11] = halfN
    const ed = tile.engineData
    if (ed?.boundingVolume && ed.transform) ed.boundingVolume.setObbData(box, ed.transform)
    return false
  }
  return {
    name: 'RELIEF_BOUNDS',
    preprocessNode(tile) { apply(tile) },
    setHalfHeight(next, tiles) {
      halfN = next
      tiles?.traverse((t) => apply(t), null, false)
    },
  }
}
