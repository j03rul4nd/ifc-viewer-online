// ─── flood system (viewer side) ───────────────────────────────────────────────
// Owns a flood study inside the viewer: builds the grid from what is loaded
// (IFC geometry, the map's terrain and buildings, an imported DEM), draws the
// water, and runs the solver in its worker. Loaded on demand through
// viewer.getFlood(), so none of it ships with the viewer.
//
//   prepare()  geometry → plan-view rasterisation → grid (+ report)
//   start()    the worker solves; display frames update the water layer
//   setView()  depth now / maximum, threshold, ground on/off
//   clear()    removes every layer and stops the worker

import * as THREE from 'three'
import { collectItemTriangles, trianglesMesh, type ItemGeometrySource } from '../../lib/scene/item-triangles'
import { createLogger } from '../../lib/logger'
import type { FloodGrid } from './core/grid'
import type { Hyetograph } from './core/hyetograph'
import type { SolverParams } from './core/solver-api'
import type { BackendChoice } from './gpu/create'
import { FloodRunner, type RunnerEvents } from './worker/runner'
import { fromGridLocal, planGrid, type PlanPoint } from './raster/frame'
import { proxyOf, rasterize } from './raster/rasterize'
import { buildFloodGrid, type BuildReport, type PlaneGround } from './raster/build'
import type { RoofRunoff } from './raster/rain-routing'
import { readDemFile, sampleDem, type DemRaster } from './raster/dem-import'
import { affineFrom, elevationToSceneY, gridRotation, sceneToGrid, type FloodGeoref } from './raster/georef'
import { WaterLayer, type WaterMode } from './view/water-layer'
import { createGroundLayer } from './view/ground-layer'

const log = createLogger('Flood')

/** Ground: the site's terrain in the IFC. */
const TERRAIN = /^(IFCSITE|IFCGEOGRAPHICELEMENT)$/i
/** Never an obstacle: spaces, openings, abstract or indoor-only things. */
const SKIP = /^(IFCSPACE|IFCOPENINGELEMENT|IFCANNOTATION|IFCGRID|IFCVIRTUALELEMENT|IFCBUILDING|IFCBUILDINGSTOREY|IFCZONE|IFCSPATIALZONE|IFCPROJECT|IFCFURNISHINGELEMENT|IFCFURNITURE|IFCSYSTEMFURNITUREELEMENT|IFCDISTRIBUTIONPORT|IFCALIGNMENT|IFCFACILITY|IFCFACILITYPART)$/i

export interface FloodGeoLike {
  groundHeightAt(x: number, z: number): number | null
  trueGroundHeightAt?(x: number, z: number): number | null
  getTerrainInfo?(): { relief: boolean; exaggeration: number; source: string | null } | null
  getContextRoot(): THREE.Object3D | null
}

export interface FloodContext {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  getLoadedModelIds(): string[]
  getFragmentsModel(modelId: string): (ItemGeometrySource & { object: THREE.Object3D }) | null
  getModelFootprint(modelId: string): PlanPoint[] | null
  getModelBounds(modelId: string): { center: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } | null
  getStoreyLevels(): Promise<Array<{ name: string; y: number }>>
  getGeo(): FloodGeoLike | null
  requestRender(): void
  /**
   * Show or hide the viewer's grid; returns whether it was visible. The grid
   * is a transparent plane at y = 0 that WRITES depth: drawn before the water
   * in the transparent pass, it hid every square metre of water below y = 0
   * (measured on the Torre Poblenou: water at −1.4…−0.7 m, invisible).
   */
  setGridVisible?(visible: boolean): boolean
  /** Points the camera at a world box (the simulated area). */
  frameBox?(min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number }): void
}

export interface PrepareOptions {
  cellM: number
  marginM: number
  maxCells: number
  roofRunoff: RoofRunoff
  manning: number
  /** Treat the map's buildings as obstacles (when the map is on). */
  includeMapBuildings: boolean
  /** Use the map's terrain (when the map is on). */
  useMapTerrain: boolean
  /** An ESRI ASCII grid or GeoTIFF the user chose; read here, only the part the grid needs. */
  demFile?: File | null
  georef?: FloodGeoref | null
  /** Ground when nothing else gives it; y null = the project's ground floor − 15 cm. */
  plane: { y: number | null; slopePct: number; towardsDeg: number }
  onStage?(stage: 'geometry' | 'raster' | 'terrain' | 'layers'): void
}

export type DemNote = 'reprojected' | 'assumedSameCrs' | 'sameCrs' | 'noHeightDatum' | 'notGeoreferenced' | 'outside'

export interface PrepareResult extends BuildReport {
  georeferenced: boolean
  mapTerrain: { source: string | null; exaggeration: number } | null
  mapBuildings: number
  dem: { used: boolean; notes: DemNote[] } | null
  planeY: number
  rasterSupersample: number
  ms: { geometry: number; raster: number; build: number }
}

export interface RunOptions {
  hyetograph: Hyetograph
  params?: Partial<SolverParams>
  durationS: number
  backend?: BackendChoice
  speed: number | 'max'
}

export interface FloodView {
  mode: WaterMode
  threshold: number
  showGround: boolean
  visible: boolean
}

export interface FloodSystemAPI {
  prepare(o: PrepareOptions): Promise<PrepareResult>
  /** Starts (or restarts) the run on the prepared grid. */
  start(o: RunOptions, ev: RunnerEvents): void
  play(speed: number | 'max'): void
  pause(): void
  setView(v: Partial<FloodView>): void
  /** Camera on the simulated area. */
  frame(): void
  isPrepared(): boolean
  /** Removes the layers and stops the worker; the geometry cache stays. */
  clear(): void
  dispose(): void
}

interface ModelMeshes { terrain: THREE.Mesh | null; obstacles: THREE.Mesh | null }

function median(v: number[]): number {
  if (!v.length) return NaN
  const s = [...v].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

export function createFloodSystem(ctx: FloodContext): FloodSystemAPI {
  const geometry = new Map<string, ModelMeshes>()
  let water: WaterLayer | null = null
  let ground: THREE.Mesh | null = null
  let runner: FloodRunner | null = null
  let grid: FloodGrid | null = null
  let groundWanted = false
  let gridWasVisible: boolean | null = null
  let extent: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null = null
  const view: FloodView = { mode: 'now', threshold: 0.05, showGround: true, visible: true }

  async function modelMeshes(id: string): Promise<ModelMeshes | null> {
    const cached = geometry.get(id)
    if (cached) return cached
    const model = ctx.getFragmentsModel(id)
    if (!model) return null
    const buckets = await collectItemTriangles(model, {
      skip: SKIP,
      bucket: (category) => (TERRAIN.test(category) ? 'terrain' : 'obstacle'),
      onWarn: (msg, err) => log.warn(`${id}: ${msg}`, err),
    })
    const make = (key: string): THREE.Mesh | null => {
      const chunks = buckets.get(key)
      return chunks?.length ? trianglesMesh(chunks, `flood-${key}-${id}`) : null
    }
    const m = { terrain: make('terrain'), obstacles: make('obstacle') }
    geometry.set(id, m)
    return m
  }

  /** The project's ground floor (storey nearest ±0.00), else the lowest model bottom. */
  async function autoGroundY(ids: string[]): Promise<number> {
    let levels: Array<{ y: number }> = []
    try { levels = await ctx.getStoreyLevels() } catch { /* none */ }
    const nearZero = levels.filter((l) => Math.abs(l.y) <= 1.5).sort((a, b) => Math.abs(a.y) - Math.abs(b.y))[0]
    if (nearZero) return nearZero.y - 0.15
    let min = Infinity
    for (const id of ids) {
      const b = ctx.getModelBounds(id)
      if (b) min = Math.min(min, b.center.y - b.size.y / 2)
    }
    return Number.isFinite(min) ? min : 0
  }

  function removeLayers(): void {
    water?.dispose()
    water = null
    if (gridWasVisible !== null) {
      ctx.setGridVisible?.(gridWasVisible)
      gridWasVisible = null
    }
    if (ground) {
      ground.removeFromParent()
      ground.geometry.dispose()
      ;(ground.material as THREE.Material).dispose()
      ground = null
    }
  }

  function applyView(): void {
    if (water) {
      water.setMode(view.mode)
      water.setThreshold(view.threshold)
      water.setVisible(view.visible)
    }
    if (ground) ground.visible = view.visible && view.showGround && groundWanted
    ctx.requestRender()
  }

  const api: FloodSystemAPI = {
    async prepare(o) {
      runner?.dispose()
      runner = null
      removeLayers()
      const ids = ctx.getLoadedModelIds()
      if (!ids.length) throw new Error('flood: no model loaded')
      // Models unloaded since the last study take their geometry with them.
      for (const [id, m] of geometry) {
        if (ids.includes(id)) continue
        for (const mesh of [m.terrain, m.obstacles]) { mesh?.geometry.dispose(); (mesh?.material as THREE.Material | undefined)?.dispose() }
        geometry.delete(id)
      }
      const t0 = performance.now()
      o.onStage?.('geometry')
      const terrain: THREE.Object3D[] = []
      const obstacles: THREE.Object3D[] = []
      const points: PlanPoint[] = []
      let yMin = Infinity
      let yMax = -Infinity
      for (const id of ids) {
        const m = await modelMeshes(id)
        const model = ctx.getFragmentsModel(id)
        if (!m || !model) continue
        model.object.updateMatrixWorld(true)
        for (const mesh of [m.terrain, m.obstacles]) {
          if (!mesh) continue
          mesh.matrix.copy(model.object.matrixWorld)
          mesh.matrixWorld.copy(model.object.matrixWorld)
        }
        if (m.terrain) terrain.push(m.terrain)
        if (m.obstacles) obstacles.push(m.obstacles)
        const fp = ctx.getModelFootprint(id)
        if (fp) points.push(...fp)
        const b = ctx.getModelBounds(id)
        if (b) {
          yMin = Math.min(yMin, b.center.y - b.size.y / 2)
          yMax = Math.max(yMax, b.center.y + b.size.y / 2)
          if (!fp) points.push({ x: b.center.x - b.size.x / 2, z: b.center.z - b.size.z / 2 }, { x: b.center.x + b.size.x / 2, z: b.center.z + b.size.z / 2 })
        }
      }
      if (!points.length) throw new Error('flood: the models have no extent')
      const tGeo = performance.now()

      const plan = planGrid({
        points, rotation: o.georef ? gridRotation(o.georef) : 0,
        marginM: o.marginM, cellM: o.cellM, maxCells: o.maxCells,
      })

      // The map: its buildings as obstacles, its terrain as ground.
      const geo = ctx.getGeo()
      const info = geo?.getTerrainInfo?.() ?? null
      const proxies: THREE.Mesh[] = []
      if (geo && o.includeMapBuildings) {
        geo.getContextRoot()?.traverseVisible((obj) => {
          if (obj.name === 'osm-buildings' && (obj as THREE.Mesh).isMesh) proxies.push(proxyOf(obj as THREE.Mesh))
        })
        for (const p of proxies) {
          p.geometry.computeBoundingBox()
          const bb = p.geometry.boundingBox?.clone().applyMatrix4(p.matrixWorld)
          if (bb) { yMin = Math.min(yMin, bb.min.y); yMax = Math.max(yMax, bb.max.y) }
        }
      }
      const useMap = !!geo && o.useMapTerrain
      const mapTrue = useMap ? (x: number, z: number) => (geo!.trueGroundHeightAt ?? geo!.groundHeightAt)(x, z) : null
      const mapDrawn = useMap ? (x: number, z: number) => geo!.groundHeightAt(x, z) : null
      if (mapTrue) {
        // The terrain can sit well below or above the models (a valley, a hill).
        for (const [i, j] of [[0, 0], [plan.nx, 0], [0, plan.ny], [plan.nx, plan.ny], [plan.nx / 2, plan.ny / 2]]) {
          const c = fromGridLocal(plan.frame, i * plan.dx, j * plan.dx)
          const y = mapDrawn!(c.x, c.z)
          if (y !== null && Number.isFinite(y)) { yMin = Math.min(yMin, y); yMax = Math.max(yMax, y) }
        }
      }

      const groundY = o.plane.y ?? await autoGroundY(ids)
      const plane: PlaneGround = { y: groundY, slopePct: o.plane.slopePct, towardsDeg: o.plane.towardsDeg }

      // An imported DEM, through the model's georeference.
      let demFn: ((x: number, z: number) => number) | null = null
      const demNotes: DemNote[] = []
      if (o.demFile) {
        const g = o.georef
        if (!g) demNotes.push('notGeoreferenced')
        else {
          const crs = await import('../../lib/geo/crs')
          const modelCrs = g.epsg ? crs.resolveCrs(g.epsg) : null
          const corners = [[0, 0], [plan.nx, 0], [0, plan.ny], [plan.nx, plan.ny]].map(([i, j]) => {
            const c = fromGridLocal(plan.frame, i * plan.dx, j * plan.dx)
            return sceneToGrid(g, c.x, c.z)
          })
          const box = {
            minX: Math.min(...corners.map((c) => c.e)), maxX: Math.max(...corners.map((c) => c.e)),
            minY: Math.min(...corners.map((c) => c.n)), maxY: Math.max(...corners.map((c) => c.n)),
          }
          // model CRS → DEM CRS, linearised over the grid (identity when they agree).
          let toDem = (e: number, n: number): { x: number; y: number } => ({ x: e, y: n })
          const demCrsFor = (epsg: number | null): 'same' | 'assumed' | ((e: number, n: number) => { x: number; y: number }) => {
            const code = epsg ? `EPSG:${epsg}` : null
            if (!code || !g.epsg) return 'assumed'
            if (code === g.epsg.toUpperCase()) return 'same'
            const to = crs.resolveCrs(code)
            if (!modelCrs?.ok || !to.ok) return 'assumed'
            const from = modelCrs.value
            return affineFrom((e, n) => {
              const r = crs.gridToGrid(from, to.value, e, n)
              return r.ok ? { x: r.value.eastings, y: r.value.northings } : { x: NaN, y: NaN }
            }, box)
          }
          let mode: ReturnType<typeof demCrsFor> = 'assumed'
          const pad = 4 * plan.dx
          const dem: DemRaster = await readDemFile(o.demFile, (epsg) => {
            mode = demCrsFor(epsg)
            if (typeof mode === 'function') {
              const f = mode
              const pts = [f(box.minX, box.minY), f(box.maxX, box.minY), f(box.minX, box.maxY), f(box.maxX, box.maxY)]
              return { minX: Math.min(...pts.map((p) => p.x)) - pad, maxX: Math.max(...pts.map((p) => p.x)) + pad, minY: Math.min(...pts.map((p) => p.y)) - pad, maxY: Math.max(...pts.map((p) => p.y)) + pad }
            }
            return { minX: box.minX - pad, maxX: box.maxX + pad, minY: box.minY - pad, maxY: box.maxY + pad }
          })
          if (dem.epsg !== null && mode === 'assumed') mode = demCrsFor(dem.epsg) // an ASC has no CRS; a TIFF told the reader
          if (typeof mode === 'function') { toDem = mode; demNotes.push('reprojected') }
          else demNotes.push(mode === 'same' ? 'sameCrs' : 'assumedSameCrs')
          const raw = (x: number, z: number): number => {
            const { e, n } = sceneToGrid(g, x, z)
            const p = toDem(e, n)
            return sampleDem(dem, p.x, p.y)
          }
          let shift: (elev: number) => number
          if (g.heightM !== null) shift = (elev) => elevationToSceneY(g, elev) ?? NaN
          else {
            // No height datum in the file: stand the DEM on the project's ground under the model.
            demNotes.push('noHeightDatum')
            const under = points.map((p) => raw(p.x, p.z)).filter(Number.isFinite)
            const off = groundY - median(under)
            shift = (elev) => elev + off
          }
          demFn = (x, z) => {
            const v = raw(x, z)
            return Number.isFinite(v) ? shift(v) : NaN
          }
        }
      }

      o.onStage?.('raster')
      const raster = rasterize({
        renderer: ctx.renderer, plan, terrain, obstacles: [...obstacles, ...proxies],
        yMin: Math.min(yMin, groundY) - 5, yMax: Math.max(yMax, groundY) + 5,
      })
      const tRaster = performance.now()

      o.onStage?.('terrain')
      const built = buildFloodGrid({
        plan, raster,
        ground: { dem: demFn, map: mapTrue, mapDrawn, plane },
        roofRunoff: o.roofRunoff, manning: o.manning,
      })
      if (o.demFile && demFn && built.report.terrainCells.dem === 0) demNotes.push('outside')
      const tBuild = performance.now()

      o.onStage?.('layers')
      grid = built.grid
      {
        const cs = [[0, 0], [plan.nx, 0], [0, plan.ny], [plan.nx, plan.ny]].map(([i, j]) => fromGridLocal(plan.frame, i * plan.dx, j * plan.dx))
        extent = {
          min: { x: Math.min(...cs.map((c) => c.x)), y: built.report.zMin, z: Math.min(...cs.map((c) => c.z)) },
          max: { x: Math.max(...cs.map((c) => c.x)), y: Math.max(built.report.zMax, yMax), z: Math.max(...cs.map((c) => c.z)) },
        }
      }
      water = new WaterLayer({ nx: plan.nx, ny: plan.ny, dx: plan.dx, frame: plan.frame, displayBed: built.displayBed })
      ctx.scene.add(water.object)
      if (ctx.setGridVisible) gridWasVisible = ctx.setGridVisible(false)
      // Draw the ground only where the scene has none of its own.
      groundWanted = built.report.terrain === 'plane' || built.report.terrain === 'dem'
      if (groundWanted && !(info?.relief && useMap)) {
        const bed = new Float32Array(plan.nx * plan.ny)
        for (let c = 0; c < bed.length; c++) bed[c] = built.grid.z[c] + built.grid.zRef
        ground = createGroundLayer({ nx: plan.nx, ny: plan.ny, dx: plan.dx, frame: plan.frame, bed, blocked: built.grid.blocked })
        ctx.scene.add(ground)
      }
      applyView()

      return {
        ...built.report,
        georeferenced: !!o.georef,
        mapTerrain: useMap && info ? { source: info.source, exaggeration: info.exaggeration } : null,
        mapBuildings: proxies.length,
        dem: o.demFile ? { used: built.report.terrainCells.dem > 0, notes: demNotes } : null,
        planeY: groundY,
        rasterSupersample: raster.supersample,
        ms: { geometry: tGeo - t0, raster: tRaster - tGeo, build: tBuild - tRaster },
      }
    },

    start(o, ev) {
      if (!grid) throw new Error('flood: prepare the grid first')
      runner?.dispose()
      const g = grid
      // The worker takes ownership of what it is sent: send a copy.
      const copy: FloodGrid = {
        ...g, z: g.z.slice(), blocked: g.blocked.slice(), rainFactor: g.rainFactor.slice(), manning: g.manning.slice(), h0: g.h0?.slice(),
      }
      runner = new FloodRunner({
        ...ev,
        onFrame: (f) => {
          water?.setFrame(f.data)
          ctx.requestRender()
          ev.onFrame?.(f)
        },
      })
      runner.init({ grid: copy, hyetograph: o.hyetograph, params: o.params, endS: o.durationS, backend: o.backend })
      runner.play(o.speed)
    },

    play(speed) { runner?.play(speed) },
    pause() { runner?.pause() },

    setView(v) {
      Object.assign(view, v)
      applyView()
    },

    frame() {
      if (extent) ctx.frameBox?.(extent.min, extent.max)
    },

    isPrepared() { return grid !== null },

    clear() {
      runner?.dispose()
      runner = null
      removeLayers()
      grid = null
      extent = null
      ctx.requestRender()
    },

    dispose() {
      api.clear()
      for (const m of geometry.values()) {
        for (const mesh of [m.terrain, m.obstacles]) {
          if (!mesh) continue
          mesh.geometry.dispose()
          ;(mesh.material as THREE.Material).dispose()
        }
      }
      geometry.clear()
    },
  }
  // QA handle (dev only), like the solar analysis': the scene, the API and the last grid.
  if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__flood = { api, ctx, grid: () => grid, water: () => water }
  return api
}
