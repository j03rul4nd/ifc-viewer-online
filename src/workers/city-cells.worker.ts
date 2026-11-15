// ─── city-cells.worker ────────────────────────────────────────────────────────
// Builds one cell of the far city off the main thread (see lib/geo/city-cells):
// reads the z14 vector tile the basemap already has in the browser cache, takes
// the buildings of one z15 quarter of it, and extrudes them with the SAME mesh
// builder the district uses at Simple — so a cell looks like the district, not
// like a second product.
//
// IN  { type:'build-cell', id, template, x, y, tile, lod, anchorLat, anchorLon,
//       contextTone, exclude }
// OUT { type:'cell', id, attributes, index, origin, ranges, triangles, buildings, quarters }
//     | { type:'error', id, message }

import * as THREE from 'three'
import { buildBuildingsGeometry, type BuildingLike, type ContextTone } from '../lib/geo/building-mesh'
import { clipToTile, tilePointToLatLon } from '../lib/geo/omt-fallback'
import {
  CELL_Z, CELL_DATA_Z, cellDataTile, groupRings, simplifyRing, ringArea2,
  FAR_TOLERANCE_M, FAR_MIN_AREA_M2, type CellLod, type Pt,
} from '../lib/geo/city-cells'

export interface CellRequest {
  type: 'build-cell'
  id: number
  /** OpenMapTiles URL template (from the TileJSON). */
  template: string
  /** Address at CELL_Z — or, with `tile`, of the whole z14 data tile. */
  x: number
  y: number
  /** One mesh for all four cells of the data tile (far level only). */
  tile?: boolean
  lod: CellLod
  /** The scene's anchor: sets the metres → scene scale, as for the district. */
  anchorLat: number
  anchorLon: number
  contextTone: ContextTone
  /**
   * The full-detail district's box, centred-normalized mercator. A building
   * whose outline touches it is the district's to draw, never the cell's.
   */
  exclude: { minNx: number; maxNx: number; minNy: number; maxNy: number } | null
}

export interface CellAttribute { name: string; array: Float32Array | Uint8Array | Int8Array | Uint16Array; itemSize: number; normalized: boolean }

export type CellResponse =
  | {
    type: 'cell'; id: number
    attributes: CellAttribute[]
    index: Uint32Array | Uint16Array | null
    /** Mesh position, scene units (the geometry is local to it). */
    origin: { x: number; y: number }
    /** [first vertex, end vertex) per building, flattened. */
    ranges: Uint32Array
    triangles: number
    buildings: number
    /** With `tile`: triangles of each of its four cells, in tileCells order. */
    quarters: number[] | null
  }
  | { type: 'error'; id: number; message: string }

interface TileBuilding {
  outer: Pt[]
  holes: Pt[][]
  heightM: number
  minHeightM: number
  /** Bounding box, tile units. */
  x0: number; y0: number; x1: number; y1: number
}

interface DecodedTile { extent: number; buildings: TileBuilding[] }

/** Decoded data tiles: four cells share one, and neighbours are asked for next. */
const TILE_CACHE = 6
const tiles = new Map<string, Promise<DecodedTile | null>>()

function dataTile(template: string, z: number, x: number, y: number): Promise<DecodedTile | null> {
  const key = `${template}|${z}/${x}/${y}`
  const hit = tiles.get(key)
  if (hit) { tiles.delete(key); tiles.set(key, hit); return hit }
  const p = (async (): Promise<DecodedTile | null> => {
    const res = await fetch(template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)))
    // No tile is not an error: the sea has none.
    if (res.status === 204 || res.status === 404) return { extent: 4096, buildings: [] }
    if (!res.ok) throw new Error(`data tile HTTP ${res.status}`)
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0) return { extent: 4096, buildings: [] }
    const [{ VectorTile }, { default: Pbf }] = await Promise.all([import('@mapbox/vector-tile'), import('pbf')])
    const layer = new VectorTile(new Pbf(buf)).layers.building
    if (!layer) return { extent: 4096, buildings: [] }
    const extent = layer.extent
    const buildings: TileBuilding[] = []
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i)
      if (f.type !== 3) continue
      const h = Number(f.properties.render_height)
      const min = Number(f.properties.render_min_height)
      for (const poly of groupRings(f.loadGeometry() as unknown as Pt[][])) {
        // A tile carries a margin of its neighbours: cut to the tile's own
        // square, so the two halves of a building on the seam abut.
        const outer = clipToTile(poly.outer, extent)
        if (outer.length < 3) continue
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
        for (const p of outer) {
          if (p.x < x0) x0 = p.x
          if (p.x > x1) x1 = p.x
          if (p.y < y0) y0 = p.y
          if (p.y > y1) y1 = p.y
        }
        buildings.push({
          outer,
          holes: poly.holes.map((hole) => clipToTile(hole, extent)).filter((hole) => hole.length >= 3),
          heightM: Number.isFinite(h) && h > 0 ? h : 5,
          minHeightM: Number.isFinite(min) && min > 0 ? min : 0,
          x0, y0, x1, y1,
        })
      }
    }
    return { extent, buildings }
  })()
  p.catch(() => { tiles.delete(key) })
  tiles.set(key, p)
  while (tiles.size > TILE_CACHE) tiles.delete(tiles.keys().next().value as string)
  return p
}

self.onmessage = (e: MessageEvent<CellRequest>): void => {
  if (e.data?.type === 'build-cell') void build(e.data)
}

async function build(req: CellRequest): Promise<void> {
  try {
    const t = req.tile ? { z: CELL_DATA_Z, x: req.x, y: req.y } : cellDataTile(req)
    const tile = await dataTile(req.template, t.z, t.x, t.y)
    if (!tile) throw new Error('no data tile')
    const k = 2 ** (CELL_Z - CELL_DATA_Z)
    const E = tile.extent
    // The cell's quarter of the tile (or the whole tile), tile units.
    const qx0 = req.tile ? 0 : ((req.x % k) * E) / k, qx1 = req.tile ? E : qx0 + E / k
    const qy0 = req.tile ? 0 : ((req.y % k) * E) / k, qy1 = req.tile ? E : qy0 + E / k
    const quarterOf = (cx: number, cy: number): number =>
      Math.min(k - 1, Math.floor((cy / E) * k)) * k + Math.min(k - 1, Math.floor((cx / E) * k))
    const n = 2 ** CELL_DATA_Z
    // The district's box in THIS tile's units (y down).
    const ex = req.exclude && {
      x0: ((req.exclude.minNx + 0.5) * n - t.x) * E, x1: ((req.exclude.maxNx + 0.5) * n - t.x) * E,
      y0: ((0.5 - req.exclude.maxNy) * n - t.y) * E, y1: ((0.5 - req.exclude.minNy) * n - t.y) * E,
    }
    const metresPerUnit = (40_075_016.686 * Math.cos((req.anchorLat * Math.PI) / 180)) / n / E
    const toLatLon = (p: Pt): { lat: number; lon: number } => tilePointToLatLon(p.x, p.y, E, t.z, t.x, t.y)

    const footprints: BuildingLike[] = []
    /** Footprint id → the quarter of the tile it is centred in. */
    const quarterById = new Map<string, number>()
    let i = 0
    for (const b of tile.buildings) {
      i++
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2
      // A building belongs to the cell its box is centred in — exactly one.
      if (cx < qx0 || cx >= qx1 || cy < qy0 || cy >= qy1) continue
      if (ex && b.x0 < ex.x1 && b.x1 > ex.x0 && b.y0 < ex.y1 && b.y1 > ex.y0) continue
      let outer = b.outer
      let holes = b.holes
      if (req.lod === 'far') {
        if ((Math.abs(ringArea2(outer)) / 2) * metresPerUnit * metresPerUnit < FAR_MIN_AREA_M2) continue
        const simple = simplifyRing(outer, FAR_TOLERANCE_M / metresPerUnit)
        if (!simple) continue
        outer = simple
        holes = []
      }
      const id = `omt/${t.x}/${t.y}/${i}`
      if (req.tile) quarterById.set(id, quarterOf(cx, cy))
      footprints.push({
        id,
        ring: outer.map(toLatLon),
        holes: holes.length > 0 ? holes.map((h) => h.map(toLatLon)) : undefined,
        height: {
          heightM: Math.max(3, b.heightM), minHeightM: b.minHeightM,
          // At or below 5 m OpenMapTiles is giving its own default, not data.
          estimated: b.heightM <= 5, basis: b.heightM <= 5 ? 'guess' : 'height',
        },
      })
    }

    const built = footprints.length > 0
      ? buildBuildingsGeometry(footprints, {
        anchorLat: req.anchorLat, anchorLon: req.anchorLon,
        detail: 'simple', lit: false, localOrigin: true, contextTone: req.contextTone,
      })
      : null
    if (!built) {
      post({
        type: 'cell', id: req.id, attributes: [], index: null, origin: { x: 0, y: 0 },
        ranges: new Uint32Array(0), triangles: 0, buildings: 0, quarters: req.tile ? new Array<number>(k * k).fill(0) : null,
      }, [])
      return
    }
    const g = built.geometry
    const attributes: CellAttribute[] = []
    const transfer: Transferable[] = []
    for (const [name, attr] of Object.entries(g.attributes)) {
      const a = attr as THREE.BufferAttribute
      const packed = pack(name, a.array as Float32Array)
      attributes.push({ name, array: packed.array, itemSize: a.itemSize, normalized: packed.normalized })
      transfer.push(packed.array.buffer)
    }
    const index = g.index ? (g.index.array as Uint32Array | Uint16Array) : null
    if (index) transfer.push(index.buffer)
    const ranges = new Uint32Array(built.ranges.length * 2)
    built.ranges.forEach((r, j) => { ranges[j * 2] = r.start; ranges[j * 2 + 1] = r.end })
    transfer.push(ranges.buffer)
    const vertices = g.attributes.position.count
    const triangles = Math.round((index ? index.length : vertices) / 3)
    let quarters: number[] | null = null
    if (req.tile) {
      quarters = new Array<number>(k * k).fill(0)
      if (index) quarters.fill(Math.round(triangles / (k * k)))
      else for (const r of built.ranges) quarters[quarterById.get(r.id) ?? 0] += (r.end - r.start) / 3
    }
    post({
      type: 'cell', id: req.id, attributes, index,
      origin: { x: built.origin?.x ?? 0, y: built.origin?.y ?? 0 },
      ranges, triangles, buildings: built.count, quarters,
    }, transfer)
  } catch (err) {
    post({ type: 'error', id: req.id, message: err instanceof Error ? err.message : String(err) }, [])
  }
}

/**
 * A whole city of cells is held at once, so every byte per vertex counts —
 * measured: 277 cells were 266 MB as the builder emits them (40 bytes a
 * vertex). Colours and normals do not need 32-bit floats: a byte each is more
 * than a facade seen from a kilometre can show, and a building's top height
 * in whole metres is all the night wash reads. Positions stay floats here: the
 * main thread seats each building on the ground and then packs them to 16
 * bits (city-cells quantizePositions). 14 bytes a vertex on the GPU.
 */
function pack(name: string, src: Float32Array): { array: CellAttribute['array']; normalized: boolean } {
  if (name === 'color') {
    const out = new Uint8Array(src.length)
    for (let i = 0; i < src.length; i++) out[i] = Math.round(Math.min(1, Math.max(0, src[i])) * 255)
    return { array: out, normalized: true }
  }
  if (name === 'normal') {
    const out = new Int8Array(src.length)
    for (let i = 0; i < src.length; i++) out[i] = Math.round(Math.min(1, Math.max(-1, src[i])) * 127)
    return { array: out, normalized: true }
  }
  if (name === 'aTopH') {
    const out = new Uint16Array(src.length)
    for (let i = 0; i < src.length; i++) out[i] = Math.round(Math.min(65_535, Math.max(0, src[i])))
    return { array: out, normalized: false }
  }
  return { array: src, normalized: false }
}

function post(msg: CellResponse, transfer: Transferable[]): void {
  ;(self as unknown as Worker).postMessage(msg, transfer)
}
