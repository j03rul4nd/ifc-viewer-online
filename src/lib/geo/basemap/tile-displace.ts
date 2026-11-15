// ─── tile-displace ────────────────────────────────────────────────────────────
// The flat map on the city's relief (WP2). Every basemap tile is a single quad
// made by 3d-tiles-renderer's GeneratedSurfacePlugin; on load it is swapped for
// a grid and its vertices lifted to the coarse DEM (coarse-dem), on the CPU.
// The grid is the DEM's sample-corner lattice (see tileGridSegments).
//
// Why CPU and not a vertex shader: TilesFadePlugin already wraps each tile
// material's onBeforeCompile, and the overlay plugin may too; a third wrapper
// would have to be chained in the right order on every material, and a float
// height texture is not filterable on every phone. A grid of at most 33² per
// tile is a few hundred bilinear reads, once per tile load.
//
// The tile's bounding box has ZERO height in the plugin (a flat plane). A
// lifted tile would leave it and be culled at the frustum edge.
// `createReliefBoundsPlugin` gives every box the height of the relief under it
// before three builds the OBB from it, re-applies it to existing tiles when the
// relief arrives, and keeps the level of detail measured from the old plane.

import * as THREE from 'three'
import { coarseTexelN, sampleCoarseN, type CoarseDem } from '../coarse-dem'

export interface TileRelief {
  dem: CoarseDem
  /** Elevation of the anchor, metres — the plane z = 0. */
  anchorM: number
  /** Normalized units per metre at the anchor's latitude. */
  metresToN: number
  /**
   * Elevation, metres, of the plane the tiles' level of detail is measured
   * from (see createReliefBoundsPlugin.adjustViewError): where the flat map
   * stood before WP2, the patch rim's datum. Without it, the relief itself.
   */
  lodDatumM?: number
}

/**
 * Most grid segments per side. A tile at most this many DEM samples wide (z15
 * and finer at z12's DEM: 32, 16, 8 samples) gets ONE segment per sample, its
 * vertices on the sample-corner lattice (coarse-dem latticeSurfaceN): every
 * such tile then draws the same surface, and the fine patch's rim eases onto
 * it. Wider tiles get TILE_GRID_FAR and only approximate it.
 */
export const TILE_GRID_MAX = 32
export const TILE_GRID_MIN = 1
/**
 * Segments of a tile wider than TILE_GRID_MAX samples (z14 and coarser). These
 * are only drawn far from the camera, hence far from the hole: off the lattice,
 * and few. 129² vertices on each z13 tile was ≈1 M triangles on the wide view, and z14 at
 * 65² still ≈4 fps there with the city cells on: hills seen from kilometres away.
 */
export const TILE_GRID_FAR = 8

/** Grid segments per side for a tile `sizeN` normalized units wide. */
export function tileGridSegments(sizeN: number, dem: CoarseDem): number {
  const texels = Math.round(sizeN / coarseTexelN(dem))
  return texels > TILE_GRID_MAX ? TILE_GRID_FAR : Math.max(TILE_GRID_MIN, texels)
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
    const segments = relief ? tileGridSegments(flat.w, relief.dem) : 1
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
    // The plugin stands the mesh at its box's centre z, which the bounds plugin
    // below moves to the tile's own relief: vertices are relative to it.
    const cx = mesh.position.x, cy = mesh.position.y, cz = mesh.position.z
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, (relief
        ? (sampleCoarseN(relief.dem, cx + pos.getX(i), cy + pos.getY(i)) - relief.anchorM) * relief.metresToN
        : 0) - cz)
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

/** DEM samples per side of one block of the min/max grid (reliefRangeM). */
const RANGE_BLOCK = 8
const rangeGrids = new WeakMap<CoarseDem, { n: number; min: Float32Array; max: Float32Array }>()

function rangeGrid(dem: CoarseDem): { n: number; min: Float32Array; max: Float32Array } {
  let g = rangeGrids.get(dem)
  if (g) return g
  const s = dem.size, n = Math.ceil(s / RANGE_BLOCK)
  const min = new Float32Array(n * n).fill(Infinity), max = new Float32Array(n * n).fill(-Infinity)
  for (let y = 0; y < s; y++) {
    const by = ((y / RANGE_BLOCK) | 0) * n
    for (let x = 0; x < s; x++) {
      const h = dem.heights[y * s + x], k = by + ((x / RANGE_BLOCK) | 0)
      if (h < min[k]) min[k] = h
      if (h > max[k]) max[k] = h
    }
  }
  g = { n, min, max }
  rangeGrids.set(dem, g)
  return g
}

/**
 * Lowest and highest DEM elevation, metres, over a normalized rectangle (plus a
 * sample of margin: the lattice interpolates the neighbours). Conservative —
 * read per block of RANGE_BLOCK² samples — and clamped like sampleCoarseN, so
 * a tile beyond the mosaic gets its edge.
 */
export function reliefRangeM(dem: CoarseDem, minNx: number, minNy: number, maxNx: number, maxNy: number): { minM: number; maxM: number } {
  const n = 2 ** dem.zoom, s = dem.size, px = 256
  const cl = (v: number) => Math.min(s - 1, Math.max(0, Math.floor(v)))
  const x0 = cl(((minNx + 0.5) * n - dem.tileX0) * px - 1.5), x1 = cl(((maxNx + 0.5) * n - dem.tileX0) * px + 1.5)
  const y0 = cl(((0.5 - maxNy) * n - dem.tileY0) * px - 1.5), y1 = cl(((0.5 - minNy) * n - dem.tileY0) * px + 1.5)
  const g = rangeGrid(dem)
  let minM = Infinity, maxM = -Infinity
  for (let by = (y0 / RANGE_BLOCK) | 0; by <= ((y1 / RANGE_BLOCK) | 0); by++) {
    for (let bx = (x0 / RANGE_BLOCK) | 0; bx <= ((x1 / RANGE_BLOCK) | 0); bx++) {
      const k = by * g.n + bx
      if (g.min[k] < minM) minM = g.min[k]
      if (g.max[k] > maxM) maxM = g.max[k]
    }
  }
  return { minM, maxM }
}

/**
 * A 3d-tiles-renderer plugin that gives every planar tile box the height of the
 * relief UNDER THAT TILE (not the whole city's: a box ±500 m tall put a low
 * camera inside every nearby box, its distance to them ≈ 0, and the renderer
 * refined the flat map to z21 all round it — 5 fps). Its preprocessNode runs
 * (from the base class) BEFORE three builds the tile's OBB from
 * `boundingVolume.box`, so new tiles need nothing else.
 */
export function createReliefBoundsPlugin(): {
  name: string
  preprocessNode(tile: PlanarTile): void
  /** Set the relief and re-apply it to every tile already processed. */
  setRelief(relief: TileRelief | null, tiles: { traverse(cb: (t: PlanarTile) => boolean | void, after: null, ensure: boolean): void } | null): void
  /**
   * Level of detail as if the tile lay flat at `lodDatumM`, as the flat map did
   * before WP2. Called after the renderer's own calculateTileViewError, whose
   * frustum test (on the relief box above) stands. Measuring the error from
   * the relief instead refined the tiles on a hill near a low camera a level
   * deeper, which cost ≈15 fps panning the low view at Carmel (49 → 33) with
   * the same triangles and draw calls, even with the tiles hidden (the cost is
   * in loading and preparing the extra level, not in drawing it).
   */
  adjustViewError(
    tile: PlanarTile & { geometricError?: number },
    target: { inView: boolean; error: number; distanceFromCamera: number },
    cameras: readonly { isOrthographic?: boolean; position: THREE.Vector3; sseDenominator: number }[],
  ): void
} {
  let relief: TileRelief | null = null
  const apply = (tile: PlanarTile): boolean => {
    const box = tile.boundingVolume?.box
    if (!box || box.length < 12) return false
    let cz = 0, hz = 0
    if (relief) {
      const { minM, maxM } = reliefRangeM(relief.dem, box[0] - box[3], box[1] - box[7], box[0] + box[3], box[1] + box[7])
      // Half a metre of slack each way: the box is cheap, a culled hill is not.
      cz = ((minM + maxM) / 2 - relief.anchorM) * relief.metresToN
      hz = ((maxM - minM) / 2 + 0.5) * relief.metresToN
    }
    if (box[2] === cz && box[11] === hz) return false
    box[2] = cz
    box[11] = hz
    const ed = tile.engineData
    if (ed?.boundingVolume && ed.transform) ed.boundingVolume.setObbData(box, ed.transform)
    return false
  }
  return {
    name: 'RELIEF_BOUNDS',
    preprocessNode(tile) { apply(tile) },
    setRelief(next, tiles) {
      relief = next
      tiles?.traverse((t) => apply(t), null, false)
    },
    adjustViewError(tile, target, cameras) {
      if (!relief || relief.lodDatumM === undefined || !target.inView) return
      const box = tile.boundingVolume?.box
      if (!box || box.length < 12 || !(tile.geometricError! >= 0)) return
      const z = (relief.lodDatumM - relief.anchorM) * relief.metresToN
      let error = 0, distance = Infinity
      for (const c of cameras) {
        if (c.isOrthographic) return
        const p = c.position
        const d = Math.hypot(
          Math.max(0, Math.abs(p.x - box[0]) - box[3]),
          Math.max(0, Math.abs(p.y - box[1]) - box[7]),
          p.z - z)
        error = Math.max(error, d === 0 ? Infinity : tile.geometricError! / (d * c.sseDenominator))
        distance = Math.min(distance, d)
      }
      target.error = error
      target.distanceFromCamera = distance
    },
  }
}

/**
 * Height, normalized above the anchor plane, of the displaced tile surface at
 * (nx, ny): exactly what displaceTileScene draws — the grid's vertices on the
 * coarse DEM, linear across each of three's PlaneGeometry triangles (cells
 * split along the bottom-left → top-right diagonal). `cx, cy` is the tile
 * centre and `w, h` its size, normalized. For measuring the seam at the hole
 * on the CPU (the library switches the tiles' raycast off).
 */
export function tileSurfaceN(
  relief: TileRelief, cx: number, cy: number, w: number, h: number, segments: number, nx: number, ny: number,
): number {
  const z = (x: number, y: number) => (sampleCoarseN(relief.dem, x, y) - relief.anchorM) * relief.metresToN
  // u east, v DOWN (three's PlaneGeometry builds rows from the top).
  const fu = Math.min(segments, Math.max(0, ((nx - cx) / w + 0.5) * segments))
  const fv = Math.min(segments, Math.max(0, (0.5 - (ny - cy) / h) * segments))
  const i = Math.min(segments - 1, Math.floor(fu)), j = Math.min(segments - 1, Math.floor(fv))
  const u = fu - i, v = fv - j
  const X = (k: number) => cx - w / 2 + (k / segments) * w
  const Y = (k: number) => cy + h / 2 - (k / segments) * h
  const za = z(X(i), Y(j)), zb = z(X(i), Y(j + 1)), zc = z(X(i + 1), Y(j + 1)), zd = z(X(i + 1), Y(j))
  return u + v <= 1
    ? za + u * (zd - za) + v * (zb - za)
    : zc + (1 - u) * (zb - zc) + (1 - v) * (zd - zc)
}
