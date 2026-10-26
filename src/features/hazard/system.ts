// ─── slope-hazard system (viewer side) ───────────────────────────────────────
// Runs the rain → runoff → slope failure → debris chain on the flood study's
// grid and draws it. The flood panel prepares the grid (terrain from the map's
// relief or a DEM, OSM, the KMZ's study area as extent); this module:
//
//   run()       coarsens the grid to ≤ MAX_CELLS, places the KMZ (or OSM's
//               schools, health centres, homes, named roads), builds the curve
//               numbers, and sweeps the rain in a worker, frame by frame
//   setStep()   shows one rain step (the timeline of the storm)
//   setLayer() / setBlock() / setLabelsVisible()   how it is drawn
//   rows() / exportCsv() / exportGeoJson()          the critical-rain table
//   clear()     removes the layer and stops the worker

import * as THREE from 'three'
import type { FloodGeoLike, FloodSystemAPI, HazardBasis } from '../flood/system'
import { toGridLocal, fromGridLocal } from '../flood/raster/frame'
import type { KmlPlacemark } from './io/kml'
import { curveNumberGrid, exposureFromKml, exposureFromOsm, type HazardGrid } from './exposure/exposure'
import { criticalRainCsv, criticalRainGeoJson, criticalRows, type CriticalRow } from './exposure/report'
import { d8Receivers, flowAccumulation } from './core/terrain'
import type { LandCover, Moisture, SoilGroup } from './core/scs-cn'
import type { ExposedElement, ExposedKind } from './core/storm'
import type { SoilDistribution } from './core/infinite-slope'
import { HazardLayer, type HazardLayerKind } from './view/hazard-layer'
import type { FromHazardWorker, HazardFrame, ToHazardWorker } from './worker/protocol'

/** Cells the sweep runs on: 200 Monte Carlo samples × 40 steps stays a few seconds. */
export const MAX_CELLS = 160_000
/** Labels drawn at most (the table lists them all). */
const MAX_LABELS = 80

export interface HazardContext {
  scene: THREE.Scene
  requestRender(): void
  getGeo(): FloodGeoLike | null
  getFlood(): Promise<FloodSystemAPI>
}

export interface HazardRunOptions {
  placemarks: KmlPlacemark[] | null
  soilGroup: SoilGroup
  moisture: Moisture
  /** Cover where OSM maps none. */
  fallbackCover: LandCover
  soil: SoilDistribution
  travelAngleDeg: number
  failThreshold: number
  runoffThresholdMm: number
  /** Cumulative rain at each step, mm. */
  cumRainMm: number[]
  samples: number
}

export interface HazardReport {
  nx: number
  ny: number
  dx: number
  coarsen: number
  areaCells: number
  /** Where the elements came from. */
  source: 'kmz' | 'osm' | 'none'
  counts: Record<ExposedKind, number>
  /** KMZ placemarks that fall off the grid. */
  outside: number
  meanCn: number
  /** Cells that fail before any rain (shown apart, never a critical rain). */
  dryCells: number
}

export interface HazardEvents {
  onProgress?(done: number, of: number): void
  onDone?(report: HazardReport, rows: CriticalRow[]): void
  onError?(message: string): void
}

export interface HazardSystemAPI {
  /** Scene points of the KMZ's study area (and its elements), for the flood grid's extent. */
  extentOf(placemarks: KmlPlacemark[]): Array<{ x: number; z: number }> | null
  run(o: HazardRunOptions, ev: HazardEvents): Promise<void>
  /** Steps computed so far. */
  stepCount(): number
  setStep(k: number): void
  setLayer(l: HazardLayerKind): void
  /** The maquette: the block cut out with earth walls, the map hidden. */
  setBlock(on: boolean): void
  setLabelsVisible(on: boolean): void
  rows(): CriticalRow[]
  exportCsv(headers?: string[]): string | null
  exportGeoJson(): string | null
  frame(): void
  clear(): void
}

interface Coarse {
  nx: number
  ny: number
  dx: number
  k: number
  frame: HazardBasis['frame']
  bed: Float32Array
  displayBed: Float32Array
}

/**
 * Global DEMs (Terrarium ~30 m) resampled to a few metres come out in terraces:
 * flat treads and sharp risers, which the slope reads as stripes of 0° and
 * 50°. A box mean over about the source's own resolution takes them out.
 */
const SMOOTH_M = 15

export function smooth(z: Float32Array, nx: number, ny: number, r: number): Float32Array {
  const pass = (src: Float32Array, horizontal: boolean): Float32Array => {
    const out = new Float32Array(src.length)
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let s = 0, n = 0
        for (let d = -r; d <= r; d++) {
          const ii = horizontal ? i + d : i, jj = horizontal ? j : j + d
          if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue
          const v = src[jj * nx + ii]
          if (Number.isFinite(v)) { s += v; n++ }
        }
        out[j * nx + i] = Number.isFinite(src[j * nx + i]) && n ? s / n : src[j * nx + i]
      }
    }
    return out
  }
  return pass(pass(z, true), false)
}

/** Block-averages the flood grid by k so the sweep stays interactive. */
function coarsen(b: HazardBasis): Coarse {
  const k = Math.max(1, Math.ceil(Math.sqrt((b.nx * b.ny) / MAX_CELLS)))
  if (k === 1) return { nx: b.nx, ny: b.ny, dx: b.dx, k, frame: b.frame, bed: b.bed, displayBed: b.displayBed }
  const nx = Math.ceil(b.nx / k), ny = Math.ceil(b.ny / k)
  const bed = new Float32Array(nx * ny)
  const displayBed = new Float32Array(nx * ny)
  for (let J = 0; J < ny; J++) {
    for (let I = 0; I < nx; I++) {
      let s = 0, d = 0, n = 0
      for (let j = J * k; j < Math.min(b.ny, J * k + k); j++) {
        for (let i = I * k; i < Math.min(b.nx, I * k + k); i++) {
          const c = j * b.nx + i
          if (!Number.isFinite(b.bed[c])) continue
          s += b.bed[c]; d += b.displayBed[c]; n++
        }
      }
      bed[J * nx + I] = n ? s / n : NaN
      displayBed[J * nx + I] = n ? d / n : NaN
    }
  }
  return { nx, ny, dx: b.dx * k, k, frame: b.frame, bed, displayBed }
}

export function createHazardSystem(ctx: HazardContext): HazardSystemAPI {
  let worker: Worker | null = null
  let layer: HazardLayer | null = null
  let frames: HazardFrame[] = []
  let elements: ExposedElement[] = []
  let rows: CriticalRow[] = []
  let grid: Coarse | null = null
  let block = false
  let hiddenRoot: THREE.Object3D[] = []

  const stop = (): void => { worker?.terminate(); worker = null }

  // The map and its place names (screen-labels sit at the scene root, not under the map).
  // The map engine re-creates its label group when tiles reload, so the
  // maquette re-hides whatever is there on every frame it draws.
  const setMapHidden = (hide: boolean): void => {
    if (hide) {
      const objs = [ctx.getGeo()?.getContextRoot() ?? null, ctx.scene.getObjectByName('screen-labels') ?? null]
      for (const o of objs) if (o && o.visible) { o.visible = false; hiddenRoot.push(o) }
    } else {
      for (const o of hiddenRoot) o.visible = true
      hiddenRoot = []
    }
  }

  const toLatLonOf = (g: Coarse) => (cell: number): { lat: number; lon: number } => {
    const geo = ctx.getGeo()
    const i = cell % g.nx, j = (cell - i) / g.nx
    const p = fromGridLocal(g.frame, (i + 0.5) * g.dx, (j + 0.5) * g.dx)
    const r = geo?.geoOfScenePoint?.(new THREE.Vector3(p.x, 0, p.z), false)
    return r ? { lat: r.lat, lon: r.lon } : { lat: NaN, lon: NaN }
  }

  const api: HazardSystemAPI = {
    extentOf(placemarks) {
      const geo = ctx.getGeo()
      if (!geo?.sceneOfLatLon) return null
      const out: Array<{ x: number; z: number }> = []
      for (const p of placemarks) {
        for (const g of p.geometries) {
          const pts = g.type === 'point' ? [g.point] : g.type === 'line' ? g.line : g.outer
          for (const q of pts) {
            const s = geo.sceneOfLatLon(q.lat, q.lon)
            if (s) out.push({ x: s.x, z: s.z })
          }
        }
      }
      return out.length ? out : null
    },

    async run(o, ev) {
      api.clear()
      const flood = await ctx.getFlood()
      const basis = flood.getHazardBasis()
      if (!basis) throw new Error('hazard: prepare the flood grid first')
      const geo = ctx.getGeo()
      const g = coarsen(basis)
      grid = g
      const toScene = (lat: number, lon: number): { x: number; z: number } => {
        const s = geo?.sceneOfLatLon?.(lat, lon) ?? null
        if (s) return { x: s.x, z: s.z }
        if (basis.osm) return basis.osm.toScene(lat, lon)
        return { x: NaN, z: NaN }
      }
      const hg: HazardGrid = { nx: g.nx, ny: g.ny, dx: g.dx, toLocal: (lat, lon) => { const s = toScene(lat, lon); return toGridLocal(g.frame, s.x, s.z) } }

      let mask: Uint8Array | null = null
      let outline: Array<{ a: number; b: number }> | null = null
      let source: HazardReport['source'] = 'none'
      let outside = 0
      if (o.placemarks?.length) {
        const ex = exposureFromKml(o.placemarks, hg)
        mask = ex.mask
        outline = ex.area ? ex.area.map((p) => hg.toLocal(p.lat, p.lon)) : null
        elements = ex.elements
        source = 'kmz'
        outside = o.placemarks.length - elements.length - (ex.area ? 1 : 0)
      } else if (basis.osm) {
        elements = exposureFromOsm(basis.osm.features, hg)
        source = elements.length ? 'osm' : 'none'
      } else elements = []

      const cn = curveNumberGrid(hg, basis.osm?.features ?? [], o.soilGroup, o.moisture, o.fallbackCover, mask)
      const dem = { nx: g.nx, ny: g.ny, dx: g.dx, z: smooth(g.bed, g.nx, g.ny, Math.max(1, Math.round(SMOOTH_M / g.dx))) }
      const upslopeArea = flowAccumulation(dem, d8Receivers(dem))

      layer = new HazardLayer({ nx: g.nx, ny: g.ny, dx: g.dx, frame: g.frame, bed: g.displayBed, mask, upslopeArea, outline })
      layer.setBlock(block)
      layer.onFrame = () => { if (block) setMapHidden(true) }
      ctx.scene.add(layer.object)
      if (block) setMapHidden(true)
      ctx.requestRender()

      const counts: Record<ExposedKind, number> = { housing: 0, school: 0, health: 0, road: 0, other: 0 }
      for (const e of elements) counts[e.kind]++
      let cnSum = 0, cnN = 0
      for (const v of cn) if (Number.isFinite(v)) { cnSum += v; cnN++ }
      const report: HazardReport = {
        nx: g.nx, ny: g.ny, dx: g.dx, coarsen: g.k,
        areaCells: mask ? mask.reduce((s, v) => s + v, 0) : g.nx * g.ny,
        source, counts, outside: Math.max(0, outside), meanCn: cnN ? cnSum / cnN : NaN, dryCells: 0,
      }

      await new Promise<void>((resolve) => {
        worker = new Worker(new URL('./worker/hazard.worker.ts', import.meta.url), { type: 'module', name: 'hazard' })
        worker.onerror = (e) => { ev.onError?.(e.message || 'hazard worker failed'); stop(); resolve() }
        worker.onmessage = (e: MessageEvent<FromHazardWorker>) => {
          const m = e.data
          if (m.type === 'frame') {
            frames[m.frame.k] = m.frame
            api.setStep(m.frame.k)
            ev.onProgress?.(m.frame.k + 1, m.of)
          } else if (m.type === 'done') {
            report.dryCells = m.dryCells
            rows = criticalRows(elements, m.critical)
            const byId = new Map(rows.map((r) => [r.id, r]))
            // Labels: the reached first, schools and health centres before homes.
            const prio: Record<ExposedKind, number> = { health: 0, school: 1, housing: 2, road: 3, other: 4 }
            const labelled = [...elements]
              .sort((a, b) => (byId.get(a.id)?.rainMm ?? Infinity) - (byId.get(b.id)?.rainMm ?? Infinity) || prio[a.kind] - prio[b.kind])
              .slice(0, MAX_LABELS)
            layer?.setLabels(labelled.map((e) => {
              const c = e.cells[Math.floor(e.cells.length / 2)]
              const i = c % g.nx, j = (c - i) / g.nx
              return { id: e.id, name: e.name, kind: e.kind, a: (i + 0.5) * g.dx, b: (j + 0.5) * g.dx, rainMm: byId.get(e.id)?.rainMm ?? null }
            }))
            ctx.requestRender()
            ev.onDone?.(report, rows)
            stop()
            resolve()
          } else {
            ev.onError?.(m.message)
            stop()
            resolve()
          }
        }
        const msg: ToHazardWorker = {
          type: 'run',
          req: {
            dem, cn, cumRainMm: o.cumRainMm, soil: o.soil, samples: o.samples, seed: 1,
            runout: { sourceThreshold: o.failThreshold, travelAngleDeg: o.travelAngleDeg, maxSteps: 4 * (g.nx + g.ny) },
            failThreshold: o.failThreshold, runoffThresholdMm: o.runoffThresholdMm, elements, mask,
          },
        }
        worker.postMessage(msg)
      })
    },

    stepCount: () => frames.filter(Boolean).length,

    setStep(k) {
      const f = frames[k]
      if (!f || !layer) return
      layer.setFrame(f)
      ctx.requestRender()
    },

    setLayer(l) { layer?.setLayer(l); ctx.requestRender() },

    setBlock(on) {
      block = on
      layer?.setBlock(on)
      setMapHidden(on && !!layer)
      ctx.requestRender()
    },

    setLabelsVisible(on) { layer?.setLabelsVisible(on); ctx.requestRender() },

    rows: () => rows,

    exportCsv(headers) { return rows.length ? criticalRainCsv(rows, headers) : null },

    exportGeoJson() { return rows.length && grid ? criticalRainGeoJson(rows, elements, toLatLonOf(grid)) : null },

    frame() { void ctx.getFlood().then((f) => f.frame()) },

    clear() {
      stop()
      layer?.dispose()
      layer = null
      setMapHidden(false)
      frames = []
      rows = []
      elements = []
      grid = null
      ctx.requestRender()
    },
  }
  // QA (dev only): the live study, from the console.
  if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__hazard = api
  return api
}
