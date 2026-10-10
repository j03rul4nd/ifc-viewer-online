// ─── flood system (viewer side) ───────────────────────────────────────────────
// Owns a flood study inside the viewer: builds the grid from what is loaded
// (IFC geometry, the map's terrain and buildings, an imported DEM), draws the
// water, and runs the solver in its worker. Loaded on demand through
// viewer.getFlood(), so none of it ships with the viewer.
//
//   prepare()  geometry → plan-view rasterisation → grid (+ report)
//   start()    the worker solves (and keeps snapshots); live frames update the water
//   seek() / setPlayback() / follow()   the timeline: any computed instant,
//              replayed from the snapshots at a chosen speed, or the live run
//   setProbing()  a click on the scene reads depth, speed, ground and the cell's history
//   setView()  depth now / maximum / speed, threshold, flow particles, ground
//   analyzeAffected()  the doors, windows, spaces and equipment the water reaches
//   exportResult()     maximum depth (speed, arrival) as GeoTIFF / ASC / CSV
//   setCaptureOverlay() legend, instant and disclaimer in every capture
//   clear()    removes every layer and stops the worker

import * as THREE from 'three'
import { collectItemTriangles, trianglesMesh, type ItemGeometrySource } from '../../lib/scene/item-triangles'
import { createLogger } from '../../lib/logger'
import type { FloodGrid } from './core/grid'
import type { Hyetograph } from './core/hyetograph'
import type { SolverParams } from './core/solver-api'
import type { BackendChoice } from './gpu/create'
import { FloodRunner, type RunnerEvents } from './worker/runner'
import type { SnapshotInfo } from './worker/protocol'
import type { CellSeries } from './worker/snapshots'
import { cellAt, fromGridLocal, planGrid, type GridPlan, type PlanPoint } from './raster/frame'
import { proxyOf, rasterize } from './raster/rasterize'
import { buildFloodGrid, type BuildReport, type PlaneGround } from './raster/build'
import type { RoofRunoff } from './raster/rain-routing'
import { readDemFile, sampleDem, type DemRaster } from './raster/dem-import'
import { affineFrom, elevationToSceneY, gridRotation, sceneToGrid, type FloodGeoref } from './raster/georef'
import { northUp, writeAsc, writeGeoTiff, type RasterOut } from './raster/dem-export'
import { AFFECTED_CLASSES, elevationFrom, findAffected, type AffectedElement, type AffectedReport, type Box3Like, type Candidate } from './validation/affected'
import { WaterLayer, type WaterMode } from './view/water-layer'
import { createGroundLayer } from './view/ground-layer'
import { FlowParticles } from './view/flow-particles'
import { fromHalf } from './core/half'

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
  /** The viewer's camera and canvas, for the probe's clicks. */
  camera?(): THREE.Camera
  canvas?: HTMLElement
  /** While true the viewer neither hovers nor selects: the probe owns the click. */
  setPointerSuppressed?(on: boolean): void
  /** Elements of the given IFC classes in a model, per class. */
  getItemsOfClasses?(modelId: string, classes: readonly string[]): Promise<Array<{ ifcClass: string; ids: number[] }>>
  /** World boxes of elements, in the order asked (null: no geometry). */
  getBoxes?(modelId: string, ids: number[]): Promise<Array<Box3Like | null>>
  /** Name, GlobalId and storey of elements, for the affected list. */
  getElementsInfo?(modelId: string, ids: number[]): Promise<Array<{ expressId: number; name: string | null; globalId: string | null; storey: string | null }>>
  /** Paints a 2-D overlay into every capture (PNG, clips, recordings); returns the remover. */
  addCapturePainter?(paint: CapturePaint): () => void
}

/** A 2-D overlay painted into captures; `s` = device pixels per CSS pixel. True when it drew. */
export type CapturePaint = (c: CanvasRenderingContext2D, width: number, height: number, s: number) => boolean

export type { AffectedReport }

export const AFFECTED_LIST_MAX = 1000

export type ResultField = 'hMax' | 'vMax' | 'tWet'
export type ResultFormat = 'geotiff' | 'asc' | 'csv'

export interface ResultFile {
  blob: Blob
  ext: 'tif' | 'asc' | 'csv'
  /** False: local plan coordinates of the model, no CRS. */
  georeferenced: boolean
  crs: string | null
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
  /**
   * Stand an external ground (the map's relief, a DEM with a height datum) on
   * the model's ground floor when the two disagree by more than
   * GROUND_FIT_TOLERANCE_M. Default true.
   */
  fitGround?: boolean
  onStage?(stage: 'geometry' | 'raster' | 'terrain' | 'layers'): void
}

export type DemNote = 'reprojected' | 'assumedSameCrs' | 'sameCrs' | 'noHeightDatum' | 'notGeoreferenced' | 'outside'

/**
 * An external ground that did not meet the model. A file's stated height
 * (IfcMapConversion.OrthogonalHeight) can be off by metres: the Torre
 * Poblenou states 12.5 m and the ICGC's bare earth under it reads 1.8 m lower.
 * As it was, the tower classified as a canopy (water ran under it) and, once
 * its slab was a wall again (build.ts floorY), stood 1.8 m above the street:
 * no water could ever reach a door.
 */
export interface GroundFit {
  source: 'map' | 'dem'
  /** The plane level (ground floor − 15 cm) minus the ground under the model, m: > 0 = the ground lay below. */
  offsetM: number
  /** The ground was shifted by offsetM (else used as it is). */
  applied: boolean
}

/** Disagreement tolerated before fitting: survey noise and a ground floor a step above the street. */
export const GROUND_FIT_TOLERANCE_M = 0.5

export interface PrepareResult extends BuildReport {
  georeferenced: boolean
  groundFit: GroundFit | null
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
  /** Flow streaks over the water. */
  particles: boolean
}

/** One reading of the run, for the timeline's curves. */
export interface TimelinePoint {
  t: number
  /** Area deeper than the threshold, m². */
  area: number
  /** Water on the surface, m³. */
  volume: number
  hMax: number
}

export interface TimelineState {
  /** End of the event, s. */
  endS: number
  /** How far the solver has got, s. */
  computedT: number
  /** The instant on screen, s. */
  viewT: number
  /** Showing the live run (true) or a replayed instant (false). */
  following: boolean
  playing: boolean
  /** Replay speed, simulated seconds per wall second. */
  speed: number
  computing: boolean
  finished: boolean
  snapshots: SnapshotInfo | null
  /** Readings so far (shared array; read, do not keep). */
  points: TimelinePoint[]
}

export interface ProbeResult {
  i: number
  j: number
  x: number
  z: number
  /** The instant read, s. */
  t: number
  depth: number
  speed: number
  /** Deepest so far at that instant, m. */
  peak: number
  /** Scene Y of the ground as drawn. */
  groundY: number
  /** Absolute elevation of the ground, when the model states its datum. */
  groundElevationM: number | null
  obstacle: boolean
  /** When the cell first got wet / reached its peak (whole run), s; null = never. */
  wetAt: number | null
  peakAt: number | null
  series: CellSeries | null
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
  /** Show a computed instant (stops following the live run). */
  seek(t: number): void
  /** Back to the live run. */
  follow(): void
  /** Replay from the snapshots at `speed` simulated s per wall s (or stop). */
  setPlayback(playing: boolean, speed?: number): void
  getTimeline(): TimelineState
  /** Called (≤ 10 per second) when the timeline changes; returns an unsubscribe. */
  subscribe(cb: (s: TimelineState) => void): () => void
  /** While on, a click on the scene probes the water there. */
  setProbing(on: boolean, onResult?: (r: ProbeResult | null) => void): void
  /** Reads the water at a screen point (client coordinates). */
  probe(clientX: number, clientY: number): Promise<ProbeResult | null>
  clearProbe(): void
  /** The elements the water reaches, from the maximum depths so far. */
  analyzeAffected(): Promise<AffectedReport | null>
  /** A per-cell result as a GIS file: GeoTIFF / ESRI ASCII grid (north up), or CSV of the wet cells. */
  exportResult(format: ResultFormat, field?: ResultField): Promise<ResultFile | null>
  /** The overlay painted into captures while the water is shown (the panel owns its strings). */
  setCaptureOverlay(paint: CapturePaint | null): void
  isPrepared(): boolean
  /** Removes the layers and stops the worker; the geometry cache stays. */
  clear(): void
  dispose(): void
}

interface ModelMeshes { terrain: THREE.Mesh | null; obstacles: THREE.Mesh | null }

/** 25831 from 'EPSG:25831' (or '25831'); null when there is no code. */
function epsgNumber(code: string | null): number | null {
  const m = code ? /(\d{4,6})\s*$/.exec(code) : null
  return m ? Number(m[1]) : null
}

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
  const view: FloodView = { mode: 'now', threshold: 0.05, showGround: true, visible: true, particles: true }
  let particles: FlowParticles | null = null
  let plan: GridPlan | null = null
  let displayBed: Float32Array | null = null
  let georef: FloodGeoref | null = null
  // ── Timeline ──
  const tl: TimelineState = {
    endS: 0, computedT: 0, viewT: 0, following: true, playing: false, speed: 300,
    computing: false, finished: false, snapshots: null, points: [],
  }
  const subscribers = new Set<(s: TimelineState) => void>()
  let lastEmit = 0
  let emitPending = false
  let raf = 0
  let lastTick = 0
  let frameInFlight = false
  let wantedT: number | null = null
  // ── Probe ──
  let marker: THREE.Group | null = null
  let probeHandlers: { down: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null = null
  // ── Affected elements / exports ──
  const candidates = new Map<string, Candidate[]>()
  let lastAffected: AffectedReport | null = null
  let overlay: CapturePaint | null = null
  let removePainter: (() => void) | null = null

  /** Scene Y → absolute elevation, when the model states its datum. */
  const elevationOf = (): ((y: number) => number) | null =>
    georef && georef.heightM !== null ? elevationFrom({ heightM: georef.heightM, sceneY0: georef.coordination.y, scale: georef.scale }) : null

  /** Every element of the reported classes in a model, with its box (cached until the next prepare). */
  async function candidatesOf(id: string): Promise<Candidate[]> {
    const hit = candidates.get(id)
    if (hit) return hit
    if (!ctx.getItemsOfClasses || !ctx.getBoxes) return []
    const out: Candidate[] = []
    for (const g of await ctx.getItemsOfClasses(id, AFFECTED_CLASSES)) {
      if (!g.ids.length) continue
      const boxes = await ctx.getBoxes(id, g.ids)
      g.ids.forEach((expressId, k) => {
        const b = boxes[k]
        if (b) out.push({ modelId: id, expressId, ifcClass: g.ifcClass, box: b })
      })
    }
    candidates.set(id, out)
    return out
  }

  function emit(force = false): void {
    const now = performance.now()
    if (!force && now - lastEmit < 100) {
      if (!emitPending) {
        emitPending = true
        setTimeout(() => { emitPending = false; emit(true) }, 100)
      }
      return
    }
    lastEmit = now
    for (const cb of subscribers) cb(tl)
  }

  /** Asks the worker for the frame at wantedT (one request at a time; the latest wins). */
  function pumpFrame(): void {
    if (frameInFlight || wantedT === null || !runner) return
    const t = wantedT
    wantedT = null
    frameInFlight = true
    void runner.frameAt(t).then((r) => {
      frameInFlight = false
      if (r?.data && !tl.following && water) {
        water.setFrame(r.data)
        ctx.requestRender()
      }
      pumpFrame()
    })
  }

  function tick(now: number): void {
    raf = 0
    const dt = lastTick ? (now - lastTick) / 1000 : 0
    lastTick = now
    if (tl.playing) {
      const limit = tl.finished ? tl.endS : tl.computedT
      tl.viewT = Math.min(tl.viewT + dt * tl.speed, limit)
      if (tl.viewT >= tl.endS - 1e-6 && tl.finished) tl.playing = false
      wantedT = tl.viewT
      pumpFrame()
      emit()
    }
    if (particles && view.particles && view.visible && water) {
      particles.step(dt)
      ctx.requestRender()
    }
    if (tl.playing || (particles && view.particles && view.visible)) raf = requestAnimationFrame(tick)
    else lastTick = 0
  }

  function wake(): void {
    if (!raf) { lastTick = 0; raf = requestAnimationFrame(tick) }
  }

  function resetTimeline(endS: number): void {
    Object.assign(tl, {
      endS, computedT: 0, viewT: 0, following: true, playing: false,
      computing: false, finished: false, snapshots: null, points: [],
    })
    wantedT = null
    emit(true)
  }

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
    particles?.dispose()
    particles = null
    removeMarker()
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
    if (particles) {
      particles.setThreshold(view.threshold)
      particles.setVisible(view.visible && view.particles)
    }
    wake()
    ctx.requestRender()
  }

  function removeMarker(): void {
    if (!marker) return
    marker.removeFromParent()
    marker.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      ;(m.material as THREE.Material | undefined)?.dispose()
    })
    marker = null
  }

  function placeMarker(x: number, yGround: number, ySurface: number, z: number): void {
    removeMarker()
    const g = new THREE.Group()
    g.name = 'flood-probe'
    const top = Math.max(ySurface, yGround) + 2.5
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 })
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, top - yGround, 8), mat)
    stem.position.set(x, (top + yGround) / 2, z)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), new THREE.MeshBasicMaterial({ color: 0x5e6ad2, depthTest: false }))
    head.position.set(x, top, z)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.9 }))
    ring.rotation.x = -Math.PI / 2
    ring.position.set(x, ySurface + 0.02, z)
    for (const m of [stem, head, ring]) { m.renderOrder = 20; m.raycast = () => { /* not pickable */ } }
    g.add(stem, head, ring)
    ctx.scene.add(g)
    marker = g
    ctx.requestRender()
  }

  /** Where a screen ray meets the grid's surface (water or ground), iterating on the heightfield. */
  function hitGrid(clientX: number, clientY: number): { x: number; z: number; i: number; j: number } | null {
    const cam = ctx.camera?.()
    const canvas = ctx.canvas
    if (!cam || !canvas || !plan || !displayBed || !water) return null
    const rect = canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, cam)
    const frame = water.frameData
    let y = displayBed[Math.floor(plan.ny / 2) * plan.nx + Math.floor(plan.nx / 2)]
    let hit: { x: number; z: number; i: number; j: number } | null = null
    for (let k = 0; k < 6; k++) {
      const d = ray.ray.direction
      if (Math.abs(d.y) < 1e-6) return null
      const s = (y - ray.ray.origin.y) / d.y
      if (s < 0) return null
      const x = ray.ray.origin.x + d.x * s
      const z = ray.ray.origin.z + d.z * s
      const c = cellAt(plan, x, z)
      if (!c) return hit
      hit = { x, z, ...c }
      const idx = c.j * plan.nx + c.i
      y = displayBed[idx] + Math.max(0, fromHalf(frame[idx * 4]))
    }
    return hit
  }

  const api: FloodSystemAPI = {
    async prepare(o) {
      runner?.dispose()
      runner = null
      removeLayers()
      resetTimeline(0)
      georef = o.georef ?? null
      // Boxes are world-space: a model moved since the last study has new ones.
      candidates.clear()
      lastAffected = null
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

      const gp = planGrid({
        points, rotation: o.georef ? gridRotation(o.georef) : 0,
        marginM: o.marginM, cellM: o.cellM, maxCells: o.maxCells,
      })
      plan = gp

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
      let mapTrue = useMap ? (x: number, z: number) => (geo!.trueGroundHeightAt ? geo!.trueGroundHeightAt(x, z) : geo!.groundHeightAt(x, z)) : null
      let mapDrawn = useMap ? (x: number, z: number) => geo!.groundHeightAt(x, z) : null
      if (mapTrue) {
        // The terrain can sit well below or above the models (a valley, a hill).
        for (const [i, j] of [[0, 0], [gp.nx, 0], [0, gp.ny], [gp.nx, gp.ny], [gp.nx / 2, gp.ny / 2]]) {
          const c = fromGridLocal(gp.frame, i * gp.dx, j * gp.dx)
          const y = mapDrawn!(c.x, c.z)
          if (y !== null && Number.isFinite(y)) { yMin = Math.min(yMin, y); yMax = Math.max(yMax, y) }
        }
      }

      const groundY = o.plane.y ?? await autoGroundY(ids)
      const plane: PlaneGround = { y: groundY, slopePct: o.plane.slopePct, towardsDeg: o.plane.towardsDeg }

      // An imported DEM, through the model's georeference.
      let demFn: ((x: number, z: number) => number) | null = null
      let demHasDatum = false
      const demNotes: DemNote[] = []
      if (o.demFile) {
        const g = o.georef
        if (!g) demNotes.push('notGeoreferenced')
        else {
          const crs = await import('../../lib/geo/crs')
          const modelCrs = g.epsg ? crs.resolveCrs(g.epsg) : null
          const corners = [[0, 0], [gp.nx, 0], [0, gp.ny], [gp.nx, gp.ny]].map(([i, j]) => {
            const c = fromGridLocal(gp.frame, i * gp.dx, j * gp.dx)
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
          const pad = 4 * gp.dx
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
          demHasDatum = g.heightM !== null
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

      // The external ground against the model's own ground floor: the median
      // under the footprint (its corners and a 5 × 5 sample of its extent)
      // against the plane level. A DEM without a datum was already stood there.
      let groundFit: GroundFit | null = null
      {
        const xs = points.map((q) => q.x)
        const zs = points.map((q) => q.z)
        const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
        const samples: PlanPoint[] = [...points]
        for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) samples.push({ x: x0 + ((x1 - x0) * (a + 0.5)) / 5, z: z0 + ((z1 - z0) * (b + 0.5)) / 5 })
        const fit = o.fitGround !== false
        /** Plane level minus the ground under the model; null within tolerance or unreadable. */
        const offsetOf = (fn: (x: number, z: number) => number | null): number | null => {
          const under: number[] = []
          for (const q of samples) {
            const v = fn(q.x, q.z)
            if (v !== null && Number.isFinite(v)) under.push(v)
          }
          if (under.length < 3) return null
          const off = groundY - median(under)
          return Math.abs(off) > GROUND_FIT_TOLERANCE_M ? off : null
        }
        if (demFn && demHasDatum) {
          const d = offsetOf(demFn)
          if (d !== null) {
            groundFit = { source: 'dem', offsetM: d, applied: fit }
            if (fit) { const f = demFn; demFn = (x, z) => f(x, z) + d }
          }
        }
        if (mapTrue) {
          const d = offsetOf(mapTrue)
          if (d !== null) {
            groundFit ??= { source: 'map', offsetM: d, applied: fit }
            if (fit) {
              const f = mapTrue
              mapTrue = (x, z) => { const v = f(x, z); return v === null ? null : v + d }
              // The map's own relief no longer matches: the simulation draws its
              // ground (true heights, shifted) and the water sits on that.
              mapDrawn = mapTrue
            }
          }
        }
      }
      const fitted = groundFit?.applied === true

      o.onStage?.('raster')
      const raster = rasterize({
        renderer: ctx.renderer, plan: gp, terrain, obstacles: [...obstacles, ...proxies],
        yMin: Math.min(yMin, groundY) - 5, yMax: Math.max(yMax, groundY) + 5,
      })
      const tRaster = performance.now()

      o.onStage?.('terrain')
      const built = buildFloodGrid({
        plan: gp, raster,
        ground: { dem: demFn, map: mapTrue, mapDrawn, plane },
        roofRunoff: o.roofRunoff, manning: o.manning,
        floorY: groundY,
      })
      if (o.demFile && demFn && built.report.terrainCells.dem === 0) demNotes.push('outside')
      const tBuild = performance.now()

      o.onStage?.('layers')
      grid = built.grid
      {
        const cs = [[0, 0], [gp.nx, 0], [0, gp.ny], [gp.nx, gp.ny]].map(([i, j]) => fromGridLocal(gp.frame, i * gp.dx, j * gp.dx))
        extent = {
          min: { x: Math.min(...cs.map((c) => c.x)), y: built.report.zMin, z: Math.min(...cs.map((c) => c.z)) },
          max: { x: Math.max(...cs.map((c) => c.x)), y: Math.max(built.report.zMax, yMax), z: Math.max(...cs.map((c) => c.z)) },
        }
      }
      water = new WaterLayer({ nx: gp.nx, ny: gp.ny, dx: gp.dx, frame: gp.frame, displayBed: built.displayBed })
      ctx.scene.add(water.object)
      displayBed = built.displayBed
      particles = new FlowParticles({
        renderer: ctx.renderer, nx: gp.nx, ny: gp.ny, dx: gp.dx, frame: gp.frame,
        frameTexture: water.frameTexture, bedTexture: water.bedTexture,
        count: Math.min(65536, Math.max(8192, Math.round(gp.nx * gp.ny / 4))),
      })
      ctx.scene.add(particles.object)
      if (ctx.setGridVisible) gridWasVisible = ctx.setGridVisible(false)
      // Draw the ground only where the scene has none of its own.
      groundWanted = built.report.terrain === 'plane' || built.report.terrain === 'dem' || fitted
      if (groundWanted && (fitted || !(info?.relief && useMap))) {
        const bed = new Float32Array(gp.nx * gp.ny)
        for (let c = 0; c < bed.length; c++) bed[c] = built.grid.z[c] + built.grid.zRef
        ground = createGroundLayer({ nx: gp.nx, ny: gp.ny, dx: gp.dx, frame: gp.frame, bed, blocked: built.grid.blocked })
        ctx.scene.add(ground)
      }
      applyView()

      return {
        ...built.report,
        georeferenced: !!o.georef,
        groundFit,
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
      resetTimeline(o.durationS)
      tl.computing = true
      lastAffected = null
      runner = new FloodRunner({
        ...ev,
        onFrame: (f) => {
          tl.computedT = Math.max(tl.computedT, f.t)
          if (tl.following) {
            water?.setFrame(f.data)
            tl.viewT = f.t
            ctx.requestRender()
          }
          emit()
          ev.onFrame?.(f)
        },
        onStats: (st, perf) => {
          const last = tl.points[tl.points.length - 1]
          if (!last || st.t > last.t) tl.points.push({ t: st.t, area: st.floodedArea, volume: st.volume, hMax: st.hMax })
          tl.computedT = Math.max(tl.computedT, st.t)
          emit()
          ev.onStats?.(st, perf)
        },
        onSnapshots: (info) => {
          tl.snapshots = info
          emit()
          ev.onSnapshots?.(info)
        },
        onState: (x) => {
          tl.computing = x.running
          if (x.finished) { tl.finished = true; tl.computedT = tl.endS }
          emit(true)
          ev.onState?.(x)
        },
      })
      runner.init({ grid: copy, hyetograph: o.hyetograph, params: o.params, endS: o.durationS, backend: o.backend })
      runner.play(o.speed)
      wake()
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

    seek(t) {
      tl.following = false
      tl.viewT = Math.max(0, Math.min(t, tl.finished ? tl.endS : tl.computedT))
      wantedT = tl.viewT
      pumpFrame()
      emit(true)
    },

    follow() {
      tl.following = true
      tl.playing = false
      tl.viewT = tl.computedT
      runner?.requestFrame()
      emit(true)
    },

    setPlayback(playing, speed) {
      if (speed !== undefined) tl.speed = speed
      if (playing) {
        tl.following = false
        if (tl.finished && tl.viewT >= tl.endS - 1e-6) tl.viewT = 0
      }
      tl.playing = playing && !!runner
      wake()
      emit(true)
    },

    getTimeline() { return tl },

    subscribe(cb) {
      subscribers.add(cb)
      return () => { subscribers.delete(cb) }
    },

    setProbing(on, onResult) {
      const canvas = ctx.canvas
      if (probeHandlers && canvas) {
        canvas.removeEventListener('pointerdown', probeHandlers.down, true)
        canvas.removeEventListener('pointerup', probeHandlers.up, true)
        probeHandlers = null
      }
      ctx.setPointerSuppressed?.(on)
      if (canvas) canvas.style.cursor = on ? 'crosshair' : ''
      if (!on || !canvas) return
      let down: { x: number; y: number; t: number } | null = null
      probeHandlers = {
        down: (e) => { if (e.button === 0) down = { x: e.clientX, y: e.clientY, t: performance.now() } },
        up: (e) => {
          if (!down || e.button !== 0) return
          const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
          const long = performance.now() - down.t > 400
          down = null
          if (moved > 5 || long) return // a camera drag, not a probe
          void api.probe(e.clientX, e.clientY).then((r) => onResult?.(r))
        },
      }
      canvas.addEventListener('pointerdown', probeHandlers.down, true)
      canvas.addEventListener('pointerup', probeHandlers.up, true)
    },

    async probe(clientX, clientY) {
      const hit = hitGrid(clientX, clientY)
      if (!hit || !plan || !displayBed || !water || !grid) return null
      const c = hit.j * plan.nx + hit.i
      const f = water.frameData
      const depth = Math.max(0, fromHalf(f[c * 4]))
      const groundY = displayBed[c]
      placeMarker(hit.x, groundY, groundY + depth, hit.z)
      const elevation = georef && georef.heightM !== null ? georef.heightM + (grid.z[c] + grid.zRef - georef.coordination.y) * georef.scale : null
      const r = runner
      const [series, mx] = r ? await Promise.all([r.cellSeries(c), r.maxFields()]) : [null, null]
      return {
        i: hit.i, j: hit.j, x: hit.x, z: hit.z, t: tl.viewT,
        depth,
        speed: Math.hypot(fromHalf(f[c * 4 + 1]), fromHalf(f[c * 4 + 2])),
        peak: Math.max(depth, fromHalf(f[c * 4 + 3])),
        groundY,
        groundElevationM: elevation,
        obstacle: grid.blocked[c] === 1,
        wetAt: mx && mx.tWet[c] >= 0 ? mx.tWet[c] : null,
        peakAt: mx && mx.hMax[c] > 0 ? mx.tPeak[c] : null,
        series: series && series.t.length ? series : null,
      }
    },

    clearProbe() {
      removeMarker()
    },

    async analyzeAffected() {
      const r = runner, g = grid, p = plan
      if (!r || !g || !p) return null
      const finished = tl.finished
      const t = finished ? tl.endS : tl.computedT
      const mx = await r.maxFields()
      if (r !== runner) return null
      const bedY = new Float32Array(g.z.length)
      for (let c = 0; c < bedY.length; c++) bedY[c] = g.z[c] + g.zRef
      const cands: Candidate[] = []
      for (const id of ctx.getLoadedModelIds()) {
        try { cands.push(...await candidatesOf(id)) } catch (err) { log.warn(`affected: ${id}`, err) }
      }
      // Water is what the view calls water (the threshold): during a storm a
      // centimetre of rain film covers everything, and on a step 18 cm up it
      // read as "19 cm over the entrance hall" (Poblenou A-0001).
      const all = findAffected(cands, { plan: p, bedY, blocked: g.blocked, hMax: mx.hMax, tWet: mx.tWet, tPeak: mx.tPeak }, { minDepthM: view.threshold })
      const elements = all.slice(0, AFFECTED_LIST_MAX)
      if (ctx.getElementsInfo) {
        const byModel = new Map<string, AffectedElement[]>()
        for (const e of elements) byModel.set(e.modelId, [...(byModel.get(e.modelId) ?? []), e])
        for (const [id, list] of byModel) {
          try {
            const info = await ctx.getElementsInfo(id, list.map((e) => e.expressId))
            const m = new Map(info.map((x) => [x.expressId, x]))
            for (const e of list) {
              const x = m.get(e.expressId)
              e.name = x?.name ?? null
              e.globalId = x?.globalId ?? null
              e.storey = x?.storey ?? null
            }
          } catch (err) { log.warn(`affected names: ${id}`, err) }
        }
      }
      if (r !== runner) return null
      const datum = georef && georef.heightM !== null ? { heightM: georef.heightM, sceneY0: georef.coordination.y, scale: georef.scale } : null
      lastAffected = { elements, total: all.length, checked: cands.length, t, finished, datum }
      return lastAffected
    },

    async exportResult(format, field = 'hMax') {
      const r = runner, g = grid, p = plan
      if (!r || !g || !p) return null
      const mx = await r.maxFields()
      const { nx, ny, dx } = p
      const src = mx[field]
      const value = (c: number): number => (g.blocked[c] ? NaN : field === 'tWet' ? (src[c] >= 0 ? src[c] : NaN) : src[c])
      // North-west corner: the grid is aligned to grid north when georeferenced
      // (r = −γ), to the scene's −Z otherwise (r = 0).
      const nw = fromGridLocal(p.frame, 0, ny * dx)
      const geo = georef
      const corner = geo ? sceneToGrid(geo, nw.x, nw.z) : { e: nw.x, n: -nw.z }
      const px = geo ? dx * geo.scale : dx
      const epsg = geo ? epsgNumber(geo.epsg) : null
      const crs = epsg !== null ? `EPSG:${epsg}` : null
      if (format === 'csv') {
        const elev = elevationOf()
        const head = [geo ? 'easting' : 'x', geo ? 'northing' : 'y', 'i', 'j', elev ? 'ground_elevation_m' : 'ground_y', 'max_depth_m', 'max_speed_ms', 'wet_at_s', 'peak_at_s']
        const lines = [head.join(',')]
        for (let j = 0; j < ny; j++) {
          for (let i = 0; i < nx; i++) {
            const c = j * nx + i
            if (g.blocked[c] || !(mx.hMax[c] >= view.threshold)) continue
            const ground = g.z[c] + g.zRef
            lines.push([
              (corner.e + (i + 0.5) * px).toFixed(2), (corner.n - (ny - j - 0.5) * px).toFixed(2), i, j,
              (elev ? elev(ground) : ground).toFixed(3), mx.hMax[c].toFixed(3), mx.vMax[c].toFixed(3),
              mx.tWet[c] >= 0 ? mx.tWet[c].toFixed(0) : '', mx.tPeak[c].toFixed(0),
            ].join(','))
          }
        }
        return { blob: new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }), ext: 'csv', georeferenced: !!geo, crs }
      }
      const vals = new Float32Array(nx * ny)
      for (let c = 0; c < vals.length; c++) vals[c] = value(c)
      const raster: RasterOut = { width: nx, height: ny, data: northUp(vals, nx, ny), x0: corner.e, y0: corner.n, px, epsg }
      if (format === 'asc') return { blob: new Blob([writeAsc(raster)], { type: 'text/plain' }), ext: 'asc', georeferenced: !!geo, crs }
      const tif = writeGeoTiff(raster)
      return { blob: new Blob([tif.buffer.slice(tif.byteOffset, tif.byteOffset + tif.byteLength) as ArrayBuffer], { type: 'image/tiff' }), ext: 'tif', georeferenced: !!geo, crs }
    },

    setCaptureOverlay(paint) {
      overlay = paint
      if (!removePainter && ctx.addCapturePainter) {
        removePainter = ctx.addCapturePainter((c, w, h, sc) => !!(overlay && water && view.visible && overlay(c, w, h, sc)))
      }
    },

    isPrepared() { return grid !== null },

    clear() {
      api.setProbing(false)
      runner?.dispose()
      runner = null
      removeLayers()
      grid = null
      extent = null
      plan = null
      displayBed = null
      lastAffected = null
      resetTimeline(0)
      ctx.requestRender()
    },

    dispose() {
      api.clear()
      removePainter?.()
      removePainter = null
      overlay = null
      candidates.clear()
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
  if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__flood = { api, ctx, grid: () => grid, water: () => water, overlay: () => overlay }
  return api
}
