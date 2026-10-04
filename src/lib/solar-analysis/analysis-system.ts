// ─── analysis-system ──────────────────────────────────────────────────────────
// The solar analysis' owner on the viewer side (lazy chunk, like solar-system):
// builds the sensors from the IFC's own geometry, runs the GPU engine, keeps
// the heatmap in the scene and answers "what is under the cursor".

import * as THREE from 'three'
import {
  buildSensorSet, groundGrid, sampleTriangles, sensorKindFor, growExtent,
  type SensorElement, type SensorKind, type SensorSet, type PointSample,
} from './sensors'
import { runExposure } from './exposure-engine'
import { sunPath, type AnalysisPeriod, type SunPathOptions } from './sun-paths'
import { elementStats, metricValue, niceRange, type ElementStat, type ExposureResult, type SolarMetric } from './results'
import { reflectedOnSurface } from './irradiance'
import { MASK_AZ, MASK_ALT, cellCentre, maskSkyView, type SkyMask } from './sky-mask'
import { sunDirectionScene } from '../solar/sun-math'
import type { DeviceBox } from './shading-devices'
import { createHeatmap, type Heatmap } from './heatmap'
import { createLogger } from '../logger'

const log = createLogger('SolarAnalysis')

/** The slice of a fragments model this needs. */
interface FragmentsLike {
  object: THREE.Object3D
  getItemsOfCategories(categories: RegExp[]): Promise<Record<string, number[]>>
  raycast?(o: { camera: THREE.Camera; mouse: THREE.Vector2; dom: HTMLElement }): Promise<unknown>
  getItemsGeometry(localIds: number[]): Promise<Array<Array<{
    transform: THREE.Matrix4
    positions?: Float32Array | Float64Array
    indices?: Uint8Array | Uint16Array | Uint32Array
  }>>>
}

export interface SolarAnalysisContext {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera(): THREE.Camera
  canvas: HTMLElement
  getLoadedModelIds(): string[]
  getFragmentsModel(modelId: string): FragmentsLike | null
  /** The model's pivot (what the scene moves). */
  getModelObject(modelId: string): THREE.Object3D | null
  /** Stop / resume the viewer's render loop (setPaused). */
  setPaused(paused: boolean): void
  /** Show or hide the scene grid; returns whether it was visible. */
  setGridVisible(visible: boolean): boolean
  /** World bounds of a model, as the viewer reports them. */
  getModelBounds(modelId: string): { center: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } | null
  /** The map, when it is on: ground heights and the context's occluders. */
  getGeo(): { groundHeightAt(x: number, z: number): number | null; getContextRoot(): THREE.Object3D | null } | null
  /**
   * Every element at full detail, whatever the user's camera sees (true), or
   * back to camera-driven streaming (false). Without it the shadow pass only
   * had the tiles the view had loaded — results moved with the camera.
   */
  setFullGeometry?(on: boolean): Promise<void>
}

export interface SensorOptions {
  ground: boolean
  surfaces: boolean
  /** Metres of site around the building on the ground grid. Default: half the building's size, 15–80 m. */
  marginM?: number
  /** Upper bound on sensors (GPU texture size). Default 120 000. */
  budget?: number
}

export interface AnalysisRun {
  sensors: SensorSet
  result: ExposureResult
  stats: ElementStat[]
  /** Shadow renders (sun positions or sky patches). */
  instants: number
  /** Sun-up instants those stand for (every day of the period when binned). */
  rawInstants: number
  period: AnalysisPeriod
  /** Share of the sky dome each sensor sees, 0–1 (its own surface's horizon included). */
  skyView: Float32Array
  /** Ground albedo the reflected share was computed with. */
  albedo: number
  /** 1 for a sensor that sees some sky; 0 for one buried inside a solid (drawn and counted nowhere). */
  open: Uint8Array
}

export interface HeatmapOverride {
  values: Float32Array
  range: { min: number; max: number }
  color: (t: number) => [number, number, number]
}

export interface HoverInfo {
  /** The override's value under the cursor (a comparison's change), when one is shown. */
  delta?: number
  sensor: number
  kind: SensorKind
  sunHoursPerDay: number
  probableSunPerDay: number
  irradiationKwh: number
  /** Share of the period's irradiation: beam + circumsolar, sky diffuse, ground-reflected. */
  split: { direct: number; diffuse: number; reflected: number }
  /** Cosine-weighted sky view, %. */
  skyViewPct: number
  element: SensorElement | null
  clientX: number
  clientY: number
}

export interface SolarAnalysisAPI {
  buildSensors(o: SensorOptions, onProgress?: (f: number) => void): Promise<SensorSet>
  run(sensors: SensorSet, period: AnalysisPeriod, path: SunPathOptions, o?: { onProgress?: (f: number) => void; signal?: AbortSignal; albedo?: number }): Promise<AnalysisRun>
  /**
   * Draw a run. With `override`, the heatmap shows those values (a comparison's
   * B − A) with their own colours instead of the metric.
   */
  show(run: AnalysisRun, metric: SolarMetric, kinds: ReadonlySet<SensorKind>, range?: { min: number; max: number }, override?: HeatmapOverride): { min: number; max: number }
  hide(): void
  isShown(): boolean
  onHover(cb: ((info: HoverInfo | null) => void) | null): void
  /**
   * The surface point under a screen position — the model, the map's
   * buildings and terrain, or the ground plane under the model — and the way
   * back towards the eye (to lift the point off its surface).
   */
  pickPoint(clientX: number, clientY: number): Promise<{ point: THREE.Vector3; back: THREE.Vector3 } | null>
  /** The sky mask at a point (and a marker there). */
  skyMaskAt(point: THREE.Vector3, yawDeg: number): Promise<SkyMask>
  clearMarker(): void
  /** Draw solar protections in the scene; they occlude every later run. null removes them. */
  setShadingDevices(boxes: DeviceBox[] | null): void
  dispose(): void
}

/** Directions spread evenly over the upper hemisphere (Fibonacci), for the sky view. */
function hemisphere(count: number): Array<{ x: number; y: number; z: number }> {
  const out: Array<{ x: number; y: number; z: number }> = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < count; i++) {
    const y = 1 - (i + 0.5) / count   // (0, 1]: the upper half only
    const r = Math.sqrt(1 - y * y)
    const a = i * golden
    out.push({ x: Math.cos(a) * r, y, z: Math.sin(a) * r })
  }
  return out
}

/**
 * Directions for the sky view. 48 left the factor visibly noisy in a street
 * canyon (each direction was 2 % of the sky); 144 is ~0.7 % and costs a
 * fraction of a year's run, once per sensor set.
 */
const SKY_DIRECTIONS = 144
/** Below this share of sky a sensor is inside something (a slab under a roof finish). */
const BURIED_SKY = 0.03


/**
 * Hide everything in the scene except `keep` and what leads to it: what is
 * left is exactly what can block the sky (no sky dome, grid, helpers, heatmap).
 */
function isolate(scene: THREE.Object3D, keep: THREE.Object3D[]): () => void {
  const keepSet = new Set(keep)
  const path = new Set<THREE.Object3D>()
  for (const k of keep) for (let p = k.parent; p; p = p.parent) path.add(p)
  const restore: Array<[THREE.Object3D, boolean]> = []
  const walk = (o: THREE.Object3D): void => {
    for (const c of o.children) {
      if (keepSet.has(c)) continue
      if (path.has(c)) { walk(c); continue }
      restore.push([c, c.visible])
      c.visible = false
    }
  }
  walk(scene)
  return () => { for (const [o, v] of restore) o.visible = v }
}

const MASK_RT = 384

/**
 * The sky mask of a point: the occluders drawn white on black from the point,
 * five 90° views (up and the four sides), then every 2° cell of the hemisphere
 * looked up in whichever view holds its direction. Five renders, ~0.25° per
 * pixel — far finer than the cells.
 */
function renderSkyMask(
  renderer: THREE.WebGLRenderer, scene: THREE.Scene, occluders: THREE.Object3D[],
  point: THREE.Vector3, yawDeg: number,
): SkyMask {
  const yaw = (yawDeg * Math.PI) / 180
  const rt = new THREE.WebGLRenderTarget(MASK_RT, MASK_RT, { depthBuffer: true })
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false })
  const views: Array<{ cam: THREE.PerspectiveCamera; px: Uint8Array }> = []
  const dirs: Array<[number, number]> = [[0, 90], [0, 0], [90, 0], [180, 0], [270, 0]]
  const restoreVis = isolate(scene, occluders)
  const prev = {
    target: renderer.getRenderTarget(), bg: scene.background, fog: scene.fog,
    override: scene.overrideMaterial, clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
    autoClear: renderer.autoClear, shadows: renderer.shadowMap.enabled,
  }
  try {
    scene.background = null
    scene.fog = null
    scene.overrideMaterial = white
    renderer.shadowMap.enabled = false
    renderer.autoClear = true
    renderer.setClearColor(0x000000, 1)
    for (const [az, alt] of dirs) {
      const cam = new THREE.PerspectiveCamera(90, 1, 0.05, 5000)
      cam.position.copy(point)
      const d = sunDirectionScene(az, alt, yaw)
      // Looking straight up needs an "up" that is not parallel to the view.
      if (alt === 90) { const n = sunDirectionScene(0, 0, yaw); cam.up.set(n.x, n.y, n.z) } else cam.up.set(0, 1, 0)
      cam.lookAt(point.x + d.x, point.y + d.y, point.z + d.z)
      cam.updateMatrixWorld(true)
      renderer.setRenderTarget(rt)
      renderer.clear()
      renderer.render(scene, cam)
      const px = new Uint8Array(MASK_RT * MASK_RT * 4)
      renderer.readRenderTargetPixels(rt, 0, 0, MASK_RT, MASK_RT, px)
      views.push({ cam, px })
    }
  } finally {
    restoreVis()
    scene.background = prev.bg
    scene.fog = prev.fog
    scene.overrideMaterial = prev.override
    renderer.shadowMap.enabled = prev.shadows
    renderer.autoClear = prev.autoClear
    renderer.setClearColor(prev.clear, prev.alpha)
    renderer.setRenderTarget(prev.target)
    rt.dispose()
    white.dispose()
  }

  const cells = new Uint8Array(MASK_AZ * MASK_ALT)
  const v = new THREE.Vector3()
  for (let i = 0; i < cells.length; i++) {
    const { azDeg, altDeg } = cellCentre(i)
    const d = sunDirectionScene(azDeg, altDeg, yaw)
    for (const { cam, px } of views) {
      v.set(d.x, d.y, d.z).transformDirection(cam.matrixWorldInverse)
      if (v.z >= 0) continue
      const x = v.x / -v.z, y = v.y / -v.z
      if (Math.abs(x) > 1 || Math.abs(y) > 1) continue
      const col = Math.min(MASK_RT - 1, Math.floor(((x + 1) / 2) * MASK_RT))
      const row = Math.min(MASK_RT - 1, Math.floor(((y + 1) / 2) * MASK_RT))
      cells[i] = px[(row * MASK_RT + col) * 4] > 127 ? 1 : 0
      break
    }
  }
  return { cells, skyView: maskSkyView(cells) }
}

const MEASURED = /^(IFCWINDOW|IFCCURTAINWALL|IFCPLATE|IFCWALL|IFCWALLSTANDARDCASE|IFCWALLELEMENTEDCASE|IFCDOOR|IFCROOF|IFCSLAB)$/i

export function createSolarAnalysis(ctx: SolarAnalysisContext): SolarAnalysisAPI {
  let heatmap: Heatmap | null = null
  let gridWasVisible: boolean | null = null
  const skyCache = new WeakMap<SensorSet, { share: Float32Array; cos: Float32Array; version: number }>()
  /** Bumped when the shading devices change: the sky every sensor sees changes with them. */
  let shadingVersion = 0
  let shown: AnalysisRun | null = null
  let shownOverride: HeatmapOverride | null = null
  let hoverCb: ((info: HoverInfo | null) => void) | null = null
  let marker: THREE.Mesh | null = null
  let shading: THREE.InstancedMesh | null = null
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()

  const onMove = (e: PointerEvent): void => {
    if (!hoverCb || !heatmap || !shown) return
    const rect = ctx.canvas.getBoundingClientRect()
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, ctx.camera())
    const hit = raycaster.intersectObject(heatmap.object, false)[0]
    if (hit?.instanceId === undefined) { hoverCb(null); return }
    const i = heatmap.sensorOf(hit.instanceId)
    const s = shown.sensors
    const e2 = s.element[i]
    const r = shown.result
    const total = Math.max(1e-9, r.directWh[i] + r.diffuseWh[i] + r.reflectedWh[i])
    hoverCb({
      sensor: i,
      kind: (['ground', 'facade', 'window', 'roof'] as const)[s.kind[i]],
      sunHoursPerDay: metricValue(r, 'sunHours', i),
      probableSunPerDay: metricValue(r, 'probableSun', i),
      irradiationKwh: metricValue(r, 'irradiation', i),
      split: { direct: r.directWh[i] / total, diffuse: r.diffuseWh[i] / total, reflected: r.reflectedWh[i] / total },
      skyViewPct: metricValue(r, 'skyView', i),
      ...(shownOverride ? { delta: shownOverride.values[i] } : {}),
      element: e2 >= 0 ? s.elements[e2] : null,
      clientX: e.clientX, clientY: e.clientY,
    })
  }
  const onLeave = (): void => hoverCb?.(null)

  /** Surface samples of every measured element of every loaded model, in world space. */
  async function surfaceSamples(spacing: number, onProgress?: (f: number) => void): Promise<Array<{ kind: SensorKind; element: SensorElement; samples: PointSample[] }>> {
    const groups: Array<{ kind: SensorKind; element: SensorElement; samples: PointSample[] }> = []
    const ids = ctx.getLoadedModelIds()
    let done = 0
    for (const modelId of ids) {
      const model = ctx.getFragmentsModel(modelId)
      if (!model) continue
      model.object.updateMatrixWorld(true)
      const world = model.object.matrixWorld
      let byCategory: Record<string, number[]>
      try {
        byCategory = await model.getItemsOfCategories([MEASURED])
      } catch (err) {
        log.warn(`${modelId}: categories unavailable`, err)
        continue
      }
      const v = new THREE.Vector3()
      for (const [category, localIds] of Object.entries(byCategory)) {
        const kind = sensorKindFor(category)
        if (!kind) continue
        // Roofs and slabs: only the faces looking up. Everything else: vertical-ish and up.
        const accept = kind === 'roof' ? (_x: number, ny: number) => ny > 0.6 : (_x: number, ny: number) => ny > -0.6
        for (let b = 0; b < localIds.length; b += 200) {
          const batch = localIds.slice(b, b + 200)
          const geo = await model.getItemsGeometry(batch)
          geo.forEach((parts, j) => {
            const samples: PointSample[] = []
            let extent: Float32Array | null = null
            for (const part of parts) {
              if (!part?.positions?.length) continue
              const m = new THREE.Matrix4().multiplyMatrices(world, part.transform ?? new THREE.Matrix4())
              const src = part.positions
              const wp = new Float32Array(src.length)
              for (let k = 0; k < src.length; k += 3) {
                v.set(src[k], src[k + 1], src[k + 2]).applyMatrix4(m)
                wp[k] = v.x; wp[k + 1] = v.y; wp[k + 2] = v.z
              }
              samples.push(...sampleTriangles(wp, part.indices ?? null, spacing, accept))
              if (kind === 'window') extent = growExtent(extent, wp)
            }
            if (samples.length) groups.push({ kind, element: { modelId, localId: batch[j], category, kind, ...(extent ? { extent } : {}) }, samples })
          })
        }
      }
      done++
      onProgress?.(done / ids.length)
    }
    return groups
  }

  function sceneBox(): THREE.Box3 {
    const box = new THREE.Box3()
    for (const id of ctx.getLoadedModelIds()) {
      const b = ctx.getModelBounds(id)
      if (!b) continue
      box.expandByPoint(new THREE.Vector3(b.center.x - b.size.x / 2, b.center.y - b.size.y / 2, b.center.z - b.size.z / 2))
      box.expandByPoint(new THREE.Vector3(b.center.x + b.size.x / 2, b.center.y + b.size.y / 2, b.center.z + b.size.z / 2))
    }
    return box
  }

  const api: SolarAnalysisAPI = {
    async buildSensors(o, onProgress) {
      const budget = o.budget ?? 120_000
      const box = sceneBox()
      if (box.isEmpty()) throw new Error('Load a model first')
      const size = box.getSize(new THREE.Vector3())
      const plan = Math.max(size.x, size.z)
      const margin = o.marginM ?? Math.min(80, Math.max(15, plan / 2))

      // Surfaces first at a spacing from the building's size, then thinned if over budget.
      let surfaceSpacing = Math.max(0.5, plan / 90)
      let groups = o.surfaces ? await surfaceSamples(surfaceSpacing, (f) => onProgress?.(f * 0.9)) : []
      let surfaceCount = groups.reduce((a, g) => a + g.samples.length, 0)
      const surfaceBudget = o.ground ? budget * 0.7 : budget
      if (surfaceCount > surfaceBudget) {
        surfaceSpacing *= Math.sqrt(surfaceCount / surfaceBudget) * 1.05
        groups = await surfaceSamples(surfaceSpacing)
        surfaceCount = groups.reduce((a, g) => a + g.samples.length, 0)
      }

      const geo = ctx.getGeo()
      const room = Math.max(1000, budget - surfaceCount)
      const extent = (plan + margin * 2)
      const groundSpacing = Math.max(0.5, extent / Math.sqrt(room) * 1.05, plan / 120)
      const ground = o.ground
        ? groundGrid(
          { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z },
          box.min.y, groundSpacing, margin,
          geo ? (x, z) => geo.groundHeightAt(x, z) : undefined,
        )
        : []
      onProgress?.(1)
      return buildSensorSet(
        [{ kind: 'ground', element: null, samples: ground }, ...groups],
        { ground: groundSpacing, surface: surfaceSpacing },
      )
    },

    async run(sensors, period, path, o = {}) {
      if (sensors.count === 0) throw new Error('Nothing to measure')
      const { samples, days, rawInstants } = sunPath(period, path)
      if (samples.length === 0) throw new Error('The sun does not rise above the horizon in this period')
      const occluders: THREE.Object3D[] = []
      for (const id of ctx.getLoadedModelIds()) {
        const obj = ctx.getModelObject(id)
        if (obj) occluders.push(obj)
      }
      const contextRoot = ctx.getGeo()?.getContextRoot()
      if (contextRoot) occluders.push(contextRoot)
      if (shading) occluders.push(shading)
      const engineCtx = {
        renderer: ctx.renderer, scene: ctx.scene,
        occluders: () => occluders,
        hidden: () => (heatmap ? [heatmap.object] : []),
        pauseViewer: (p: boolean) => ctx.setPaused(p),
      }
      // The sky first (once per sensor set). Two figures from one pass over
      // the dome: the plain share of directions a sensor sees, which finds the
      // buried sensors — a structural slab under the roof finish, a wall face
      // inside another — and the COSINE-weighted view factor, which is what
      // the isotropic diffuse sky actually delivers to a surface.
      await ctx.setFullGeometry?.(true)
      try {
        let sky = skyCache.get(sensors)
        if (!sky || sky.version !== shadingVersion) {
          const dirs = hemisphere(SKY_DIRECTIONS)
          const pass = await runExposure(engineCtx, sensors, dirs.map((dir) => ({
            utc: 0, azimuthDeg: 0, altitudeDeg: 0, dir, hours: 1 / SKY_DIRECTIONS, month: 1,
            irradiance: { dni: 0, dhi: 0, ghi: 0 }, beamNormal: 0, diffuseIso: 0, sunProb: 0,
          })), 1, { signal: o.signal, skyWeight: 2 / SKY_DIRECTIONS, onProgress: (f) => o.onProgress?.(f * 0.15) })
          sky = { share: pass.sunHours, cos: pass.skyCos, version: shadingVersion }
          skyCache.set(sensors, sky)
        }
        const result = await runExposure(engineCtx, sensors, samples, days, {
          onProgress: (f) => o.onProgress?.(0.15 + f * 0.85), signal: o.signal,
        })
        let isoWh = 0, ghiWh = 0
        for (const sm of samples) { isoWh += sm.diffuseIso * sm.hours; ghiWh += sm.irradiance.ghi * sm.hours }
        const albedo = o.albedo ?? 0.2
        const open = new Uint8Array(sensors.count)
        for (let i = 0; i < sensors.count; i++) {
          open[i] = sky.share[i] >= BURIED_SKY ? 1 : 0
          result.skyCos[i] = sky.cos[i]
          result.diffuseWh[i] = isoWh * sky.cos[i]
          // The ground is taken as unobstructed and uniformly lit: a façade's
          // reflected share is an estimate, small next to the beam it sits beside.
          result.reflectedWh[i] = reflectedOnSurface(ghiWh, sensors.normals[i * 3 + 1], albedo)
        }
        return {
          sensors, result, stats: elementStats(sensors, result, open),
          instants: samples.length, rawInstants, period, skyView: sky.share, open, albedo,
        }
      } finally {
        await ctx.setFullGeometry?.(false)
      }
    },

    show(run, metric, kinds, range, override) {
      if (!heatmap || shown?.sensors !== run.sensors) {
        heatmap?.dispose()
        heatmap = createHeatmap(run.sensors)
        ctx.scene.add(heatmap.object)
        ctx.canvas.addEventListener('pointermove', onMove)
        ctx.canvas.addEventListener('pointerleave', onLeave)
      }
      if (gridWasVisible === null) gridWasVisible = ctx.setGridVisible(false)
      shown = run
      shownOverride = override ?? null
      if (override) {
        heatmap.setValues(override.values, override.range.min, override.range.max, override.color)
        heatmap.setKinds(kinds, run.open)
        return override.range
      }
      const values = new Float32Array(run.sensors.count)
      for (let i = 0; i < values.length; i++) values[i] = metricValue(run.result, metric, i)
      const visible = Array.from(values).filter((_v, i) => run.open[i] === 1 && kinds.has((['ground', 'facade', 'window', 'roof'] as const)[run.sensors.kind[i]]))
      const r = range ?? niceRange(visible)
      heatmap.setValues(values, r.min, r.max)
      heatmap.setKinds(kinds, run.open)
      return r
    },

    hide() {
      heatmap?.dispose()
      heatmap = null
      shown = null
      // The grid drew its lines over the map; it comes back as it was.
      if (gridWasVisible !== null) { ctx.setGridVisible(gridWasVisible); gridWasVisible = null }
      ctx.canvas.removeEventListener('pointermove', onMove)
      ctx.canvas.removeEventListener('pointerleave', onLeave)
      hoverCb?.(null)
    },

    isShown: () => heatmap !== null,

    async pickPoint(clientX, clientY) {
      const camera = ctx.camera()
      let best: { point: THREE.Vector3; distance: number } | null = null
      const mouse = new THREE.Vector2(clientX, clientY)
      for (const id of ctx.getLoadedModelIds()) {
        const model = ctx.getFragmentsModel(id)
        if (!model?.raycast) continue
        try {
          const hit = await model.raycast({ camera, mouse, dom: ctx.canvas }) as { point?: THREE.Vector3; distance?: number } | null
          if (hit?.point && hit.distance !== undefined && (!best || hit.distance < best.distance)) best = { point: hit.point.clone(), distance: hit.distance }
        } catch { /* not pickable */ }
      }
      const rect = ctx.canvas.getBoundingClientRect()
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const ctxRoot = ctx.getGeo()?.getContextRoot()
      if (ctxRoot) {
        const h = raycaster.intersectObject(ctxRoot, true)[0]
        if (h && (!best || h.distance < best.distance)) best = { point: h.point.clone(), distance: h.distance }
      }
      if (!best) {
        // Nothing hit: the ground plane under the model.
        const box = sceneBox()
        if (!box.isEmpty()) {
          const hit = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -box.min.y), new THREE.Vector3())
          if (hit) best = { point: hit, distance: hit.distanceTo(raycaster.ray.origin) }
        }
      }
      if (!best) return null
      return { point: best.point, back: raycaster.ray.direction.clone().negate() }
    },

    async skyMaskAt(point, yawDeg) {
      const occluders: THREE.Object3D[] = []
      for (const id of ctx.getLoadedModelIds()) {
        const obj = ctx.getModelObject(id)
        if (obj) occluders.push(obj)
      }
      const contextRoot = ctx.getGeo()?.getContextRoot()
      if (contextRoot) occluders.push(contextRoot)
      if (shading) occluders.push(shading)
      await ctx.setFullGeometry?.(true)
      let mask: SkyMask
      try { mask = renderSkyMask(ctx.renderer, ctx.scene, occluders, point, yawDeg) } finally { await ctx.setFullGeometry?.(false) }
      if (!marker) {
        marker = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffb020, depthTest: false, toneMapped: false }))
        marker.name = 'solar-analysis-probe'
        marker.renderOrder = 10
        ctx.scene.add(marker)
      }
      marker.position.copy(point)
      // A size you can see from where you look, not from the model's scale.
      marker.scale.setScalar(Math.max(0.15, ctx.camera().position.distanceTo(point) * 0.008))
      return mask
    },

    setShadingDevices(boxes) {
      shadingVersion++
      if (shading) {
        shading.removeFromParent()
        shading.geometry.dispose()
        ;(shading.material as THREE.Material).dispose()
        shading.dispose()
        shading = null
      }
      if (!boxes || boxes.length === 0) return
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0xc9ccd3, roughness: 0.7, metalness: 0.1 }),
        boxes.length,
      )
      mesh.name = 'solar-shading-devices'
      mesh.castShadow = true
      mesh.receiveShadow = true
      const m = new THREE.Matrix4()
      const x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3()
      boxes.forEach((b, i) => {
        x.set(b.ax.x, b.ax.y, b.ax.z).multiplyScalar(b.size.x)
        y.set(b.ay.x, b.ay.y, b.ay.z).multiplyScalar(b.size.y)
        z.set(b.az.x, b.az.y, b.az.z).multiplyScalar(b.size.z)
        m.makeBasis(x, y, z).setPosition(b.center.x, b.center.y, b.center.z)
        mesh.setMatrixAt(i, m)
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      ctx.scene.add(mesh)
      shading = mesh
    },

    clearMarker() {
      if (!marker) return
      marker.removeFromParent()
      marker.geometry.dispose()
      ;(marker.material as THREE.Material).dispose()
      marker = null
    },

    onHover(cb) { hoverCb = cb },

    dispose() {
      api.hide()
      api.clearMarker()
      api.setShadingDevices(null)
      hoverCb = null
    },
  }
  // Dev QA: the scene and the API from the console (never in a production build).
  if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__solarAnalysis = { scene: ctx.scene, api }
  return api
}
