// ─── analysis-system ──────────────────────────────────────────────────────────
// The solar analysis' owner on the viewer side (lazy chunk, like solar-system):
// builds the sensors from the IFC's own geometry, runs the GPU engine, keeps
// the heatmap in the scene and answers "what is under the cursor".

import * as THREE from 'three'
import {
  buildSensorSet, groundGrid, sampleTriangles, sensorKindFor,
  type SensorElement, type SensorKind, type SensorSet, type PointSample,
} from './sensors'
import { runExposure } from './exposure-engine'
import { sunPath, type AnalysisPeriod, type SunPathOptions } from './sun-paths'
import { elementStats, metricValue, niceRange, type ElementStat, type ExposureResult, type SolarMetric } from './results'
import { reflectedOnSurface } from './irradiance'
import { createHeatmap, type Heatmap } from './heatmap'
import { createLogger } from '../logger'

const log = createLogger('SolarAnalysis')

/** The slice of a fragments model this needs. */
interface FragmentsLike {
  object: THREE.Object3D
  getItemsOfCategories(categories: RegExp[]): Promise<Record<string, number[]>>
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

export interface HoverInfo {
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
  show(run: AnalysisRun, metric: SolarMetric, kinds: ReadonlySet<SensorKind>, range?: { min: number; max: number }): { min: number; max: number }
  hide(): void
  isShown(): boolean
  onHover(cb: ((info: HoverInfo | null) => void) | null): void
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

const MEASURED = /^(IFCWINDOW|IFCCURTAINWALL|IFCPLATE|IFCWALL|IFCWALLSTANDARDCASE|IFCWALLELEMENTEDCASE|IFCDOOR|IFCROOF|IFCSLAB)$/i

export function createSolarAnalysis(ctx: SolarAnalysisContext): SolarAnalysisAPI {
  let heatmap: Heatmap | null = null
  let gridWasVisible: boolean | null = null
  const skyCache = new WeakMap<SensorSet, { share: Float32Array; cos: Float32Array }>()
  let shown: AnalysisRun | null = null
  let hoverCb: ((info: HoverInfo | null) => void) | null = null
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
            }
            if (samples.length) groups.push({ kind, element: { modelId, localId: batch[j], category, kind }, samples })
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
      let sky = skyCache.get(sensors)
      if (!sky) {
        const dirs = hemisphere(SKY_DIRECTIONS)
        const pass = await runExposure(engineCtx, sensors, dirs.map((dir) => ({
          utc: 0, azimuthDeg: 0, altitudeDeg: 0, dir, hours: 1 / SKY_DIRECTIONS, month: 1,
          irradiance: { dni: 0, dhi: 0, ghi: 0 }, beamNormal: 0, diffuseIso: 0, sunProb: 0,
        })), 1, { signal: o.signal, skyWeight: 2 / SKY_DIRECTIONS, onProgress: (f) => o.onProgress?.(f * 0.15) })
        sky = { share: pass.sunHours, cos: pass.skyCos }
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
    },

    show(run, metric, kinds, range) {
      if (!heatmap || shown?.sensors !== run.sensors) {
        heatmap?.dispose()
        heatmap = createHeatmap(run.sensors)
        ctx.scene.add(heatmap.object)
        ctx.canvas.addEventListener('pointermove', onMove)
        ctx.canvas.addEventListener('pointerleave', onLeave)
      }
      if (gridWasVisible === null) gridWasVisible = ctx.setGridVisible(false)
      shown = run
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

    onHover(cb) { hoverCb = cb },

    dispose() {
      api.hide()
      hoverCb = null
    },
  }
  return api
}
