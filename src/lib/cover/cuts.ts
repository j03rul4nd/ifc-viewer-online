// ─── Section cuts and exploded storeys ─────────────────────────────────────────
// Two of the most "architectural" images a board has, both derived from data
// the IFC already carries:
//   - a section: one plane through the building's own box, cut solids filled
//     in poché (the viewer does the fill; this decides where the plane goes and
//     which camera looks at it square-on);
//   - an exploded axonometric: storeys from the spatial tree, lifted apart.
// Pure, so the plane maths and the storey grouping are testable.

import type { Box } from '../camera-framing'
import type { CameraPreset, SpatialNode } from '../../types'

export type CutMode = 'none' | 'plan' | 'long' | 'cross'

export const CUT_MODES: readonly CutMode[] = ['none', 'plan', 'long', 'cross']

export interface CutPlane {
  normal: { x: number; y: number; z: number }
  point: { x: number; y: number; z: number }
  /** The preset that looks at the cut face square-on. */
  preset: CameraPreset
}

/**
 * Plane for a cut at `t` (0–1) through the box. Plans keep what is below the
 * cut and look down; sections keep the far half and look at the cut face.
 * three.js keeps the side the normal points TOWARD (negative distance is clipped).
 */
export function cutPlane(box: Box, mode: Exclude<CutMode, 'none'>, t: number): CutPlane {
  const k = Math.min(0.98, Math.max(0.02, t))
  const cx = (box.min.x + box.max.x) / 2
  const cy = (box.min.y + box.max.y) / 2
  const cz = (box.min.z + box.max.z) / 2
  if (mode === 'plan') {
    return { normal: { x: 0, y: -1, z: 0 }, point: { x: cx, y: box.min.y + (box.max.y - box.min.y) * k, z: cz }, preset: 'top' }
  }
  if (mode === 'long') {
    // Cut across Z, keep z ≤ cut (the far half), look from the front (+Z).
    return { normal: { x: 0, y: 0, z: -1 }, point: { x: cx, y: cy, z: box.min.z + (box.max.z - box.min.z) * k }, preset: 'front' }
  }
  // Cut across X, keep x ≤ cut, look from the right (+X).
  return { normal: { x: -1, y: 0, z: 0 }, point: { x: box.min.x + (box.max.x - box.min.x) * k, y: cy, z: cz }, preset: 'right' }
}

export interface StoreyEntry {
  modelId: string
  name: string
  ids: number[]
}

/** Storeys of one model's spatial tree, each with every element beneath it (spaces included). */
export function storeysFromTree(modelId: string, roots: readonly SpatialNode[]): StoreyEntry[] {
  const out: StoreyEntry[] = []
  const collect = (n: SpatialNode, acc: number[]) => {
    for (const e of n.containedElements) acc.push(e.expressId)
    for (const c of n.children) collect(c, acc)
  }
  const walk = (n: SpatialNode) => {
    if (n.ifcClass.toUpperCase() === 'IFCBUILDINGSTOREY') {
      const ids: number[] = []
      collect(n, ids)
      if (ids.length) out.push({ modelId, name: n.longName || n.name, ids })
      return
    }
    n.children.forEach(walk)
  }
  roots.forEach(walk)
  return out
}

export interface Layer {
  /** Base elevation (m) the layer was grouped at. */
  elevation: number
  names: string[]
  parts: Array<{ modelId: string; ids: number[] }>
}

/**
 * Merge storeys whose base elevations fall within `tolerance` (architecture
 * and structure models each have a "Level 2"), bottom to top.
 */
export function groupLayers(storeys: Array<StoreyEntry & { elevation: number }>, tolerance = 0.6): Layer[] {
  const sorted = [...storeys].sort((a, b) => a.elevation - b.elevation)
  const layers: Layer[] = []
  for (const s of sorted) {
    const last = layers[layers.length - 1]
    if (last && Math.abs(s.elevation - last.elevation) <= tolerance) {
      if (!last.names.includes(s.name)) last.names.push(s.name)
      const part = last.parts.find((p) => p.modelId === s.modelId)
      if (part) part.ids.push(...s.ids)
      else last.parts.push({ modelId: s.modelId, ids: [...s.ids] })
    } else {
      layers.push({ elevation: s.elevation, names: [s.name], parts: [{ modelId: s.modelId, ids: [...s.ids] }] })
    }
  }
  return layers
}

/**
 * Lift between consecutive storeys: the building's height spread over its
 * storeys, times `spread`. One storey height of air reads clearly as
 * "exploded" without the tower leaving the frame.
 */
export function explodeGap(buildingHeight: number, layers: number, spread = 1): number {
  if (layers < 2) return 0
  return (Math.max(1, buildingHeight) / layers) * spread
}

/**
 * Merge consecutive layers into at most `max` bands. A 20-storey tower pulled
 * apart floor by floor is a thin stick in the frame; podium / typical floors /
 * crown in a handful of bands is how exploded axonometrics are drawn.
 */
export function chunkLayers(layers: Layer[], max: number): Layer[] {
  if (layers.length <= max || max < 1) return layers
  const out: Layer[] = []
  for (let b = 0; b < max; b++) {
    const from = Math.floor((b * layers.length) / max)
    const to = Math.floor(((b + 1) * layers.length) / max)
    const band = layers.slice(from, to)
    const parts = new Map<string, number[]>()
    for (const l of band) for (const p of l.parts) parts.set(p.modelId, [...(parts.get(p.modelId) ?? []), ...p.ids])
    out.push({
      elevation: band[0].elevation,
      names: band.length > 1 ? [`${band[0].names[0]} – ${band[band.length - 1].names[0]}`] : band[0].names,
      parts: [...parts].map(([modelId, ids]) => ({ modelId, ids })),
    })
  }
  return out
}

/** Plan cut height above a storey's floor — the drawing convention. */
export const PLAN_CUT_HEIGHT = 1.2

/**
 * Where a storey plan is cut: 1.2 m above its floor, but always below the next
 * storey's floor so a low mezzanine never shows the slab above it.
 */
export function planCutY(elevation: number, nextElevation: number | null): number {
  const y = elevation + PLAN_CUT_HEIGHT
  return nextElevation === null ? y : Math.min(y, nextElevation - 0.05)
}

/**
 * At most `max` items spread evenly, first and last always included — a
 * 30-storey tower gets ground floor, typical floors and the top, not the
 * bottom twelve.
 */
export function sampleEvenly<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items]
  if (max <= 1) return items.slice(0, Math.max(0, max))
  const out: T[] = []
  for (let i = 0; i < max; i++) out.push(items[Math.round((i * (items.length - 1)) / (max - 1))])
  return out
}

/**
 * Camera height above a floor plate so its footprint (x × z) exactly fills a
 * top-down view, with `margin` of air. The bounding-sphere fit used for 3-D
 * views wastes most of a plan's page on a wide screen.
 */
export function planFitDistance(box: Box, fovDeg: number, aspect: number, margin = 1.08): number {
  const vHalf = ((fovDeg > 0 && fovDeg < 179 ? fovDeg : 45) * Math.PI) / 360
  const hHalf = Math.atan(Math.tan(vHalf) * (aspect > 0 ? aspect : 1))
  const halfW = (box.max.x - box.min.x) / 2
  const halfD = (box.max.z - box.min.z) / 2
  return Math.max(halfD / Math.tan(vHalf), halfW / Math.tan(hHalf), 1) * margin
}
