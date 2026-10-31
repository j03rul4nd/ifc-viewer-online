// ─── Sketch actions ───────────────────────────────────────────────────────────
// What buttons, gestures and shortcuts all do, in one place and free of React:
// the camera, the plane, the models under the sketch, exports, sharing.

import { activePage, newId, placeImage, serializeDoc } from '../../lib/sketch/document'
import { exportBlenderScript, exportObj } from '../../lib/sketch/export-blender'
import { encodePsd } from '../../lib/sketch/export-psd'
import { exportSvg } from '../../lib/sketch/export-svg'
import { add, dot, planeFromNormal, planeNormal, scale, type PlanePreset, presetPlane } from '../../lib/sketch/plane'
import { paintLayer, renderLayerCanvas } from '../../lib/sketch/raster'
import { PAPER } from '../../lib/sketch/renderer'
import { fitIntoCard, LINKEDIN_SHARE_URL, shareImage, SHARE_SIZE, type ShareOutcome, type ShareTarget } from '../../lib/sketch/share'
import { saveContext, type ContextItem } from '../../lib/sketch/storage'
import type { OrbitState, ReferenceImage, SketchPlane, Vec3 } from '../../lib/sketch/types'
import { useSketchStore as store } from '../../stores/sketchStore'

const state = () => store.getState()

// ── Camera ───────────────────────────────────────────────────────────────────

export function applyOrbit(next: OrbitState): void {
  state().engine?.setOrbit(next)
  state().set({ orbit: next })
}

const axes = (o: OrbitState): { right: Vec3; up: Vec3 } => ({
  right: [Math.cos(o.azimuth), 0, -Math.sin(o.azimuth)],
  up: [-Math.sin(o.elevation) * Math.sin(o.azimuth), Math.cos(o.elevation), -Math.sin(o.elevation) * Math.cos(o.azimuth)],
})

export function orbitBy(dx: number, dy: number): void {
  const o = state().engine?.orbitState
  if (!o) return
  const limit = Math.PI / 2 - 0.01
  applyOrbit({ ...o, azimuth: o.azimuth - dx * 0.0065, elevation: Math.max(-limit, Math.min(limit, o.elevation + dy * 0.0065)) })
}

export function panBy(dx: number, dy: number): void {
  const engine = state().engine
  if (!engine) return
  const o = engine.orbitState
  const k = engine.worldPerPixel()
  const { right, up } = axes(o)
  applyOrbit({ ...o, target: add(add(o.target, scale(right, -dx * k)), scale(up, dy * k)) })
}

/** Zoom about the fingers: what is under them stays under them. */
export function zoomBy(factor: number, x: number, y: number, boxW: number, boxH: number): void {
  const engine = state().engine
  if (!engine) return
  const o = engine.orbitState
  const distance = Math.max(0.05, Math.min(5000, o.distance / factor))
  const before = engine.worldPerPixel()
  const after = before * (distance / o.distance)
  const { right, up } = axes(o)
  applyOrbit({ ...o, distance, target: add(add(o.target, scale(right, (x - boxW / 2) * (before - after))), scale(up, -(y - boxH / 2) * (before - after))) })
}

export function fitAll(): void {
  const engine = state().engine
  const bounds = engine?.bounds()
  if (engine && bounds) applyOrbit({ ...engine.orbitState, target: bounds.center, distance: bounds.radius * 3.4 })
}

// ── Plane ────────────────────────────────────────────────────────────────────

export function setPlane(next: SketchPlane): void {
  state().engine?.setPlane(next)
  state().set({ plane: next })
}

export const setPlanePreset = (preset: PlanePreset): void => setPlane(presetPlane(preset, state().plane.origin))

export function planeFacingMe(): void {
  const engine = state().engine
  if (engine) setPlane(planeFromNormal(state().plane.origin, scale(engine.viewDirection(), -1)))
}

/** Come round to the side of the plane already facing us. */
export function lookAtPlane(): void {
  const engine = state().engine
  if (!engine) return
  const { plane } = state()
  const n = planeNormal(plane)
  const facing = dot(n, scale(engine.viewDirection(), -1)) >= 0 ? n : scale(n, -1)
  applyOrbit({
    ...engine.orbitState, target: plane.origin,
    azimuth: Math.atan2(facing[0], facing[2]),
    elevation: Math.asin(Math.max(-0.999, Math.min(0.999, facing[1]))),
  })
}

// ── The models under the sketch ──────────────────────────────────────────────

type Tx = (key: string) => string

export async function showContext(items: ContextItem[], announce: boolean, tx: Tx): Promise<boolean> {
  const engine = state().engine
  if (!engine) return false
  try {
    await engine.loadContext(items)
  } catch {
    state().flash(tx('context.failed'))
    return false
  }
  state().set({ context: items.map(({ id, name, kind }) => ({ id, name, kind, visible: true })) })
  // The camera is not saved: without this a reload lands inside the building.
  const bounds = engine.bounds()
  if (bounds && items.length) {
    applyOrbit({ ...engine.orbitState, target: bounds.center, distance: bounds.radius * 3.4 })
    setPlane({ ...state().plane, origin: bounds.center })
    if (announce) state().flash(tx('context.loaded'))
  }
  return true
}

export async function adoptContextFile(file: File, tx: Tx): Promise<void> {
  const items: ContextItem[] = [{ id: newId(), name: file.name, kind: 'mesh', blob: file }]
  if (await showContext(items, true, tx)) state().set({ saveFailed: !(await saveContext(items)) })
}

export function clearContext(): void {
  state().engine?.loadContext([]).catch(() => undefined)
  state().set({ context: [] })
  void saveContext([])
}

export function toggleContext(id: string): void {
  const context = state().context.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c))
  state().set({ context })
  const entry = context.find((c) => c.id === id)
  if (entry) state().engine?.setContextVisible(id, entry.visible)
}

// ── References ───────────────────────────────────────────────────────────────

export function placeReference(image: ReferenceImage, tx: Tx): void {
  const engine = state().engine
  if (!engine) return
  const height = engine.orbitState.distance * 0.45
  const width = height * (image.width / image.height)
  state().edit((doc) => placeImage(doc, { id: newId(), imageId: image.id, plane: state().plane, width, height, opacity: 0.6 }))
  state().flash(tx('refs.placed'))
}

// ── Files ────────────────────────────────────────────────────────────────────

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const visibleLayers = () => activePage(state().history.present).layers

function viewport(): { width: number; height: number; project: (p: Vec3) => { x: number; y: number } | null } | null {
  const engine = state().engine
  if (!engine) return null
  return { width: engine.canvas.clientWidth, height: engine.canvas.clientHeight, project: (p) => engine.project(p) }
}

/** The long side of raster exports: sharp in a layout, light enough for a phone. */
const EXPORT_LONG_SIDE = 2048

export async function exportPng(transparent: boolean): Promise<void> {
  const v = viewport()
  if (!v) return
  const k = EXPORT_LONG_SIDE / Math.max(v.width, v.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(v.width * k)
  canvas.height = Math.round(v.height * k)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  if (!transparent) { ctx.fillStyle = PAPER[state().history.present.paper].bg; ctx.fillRect(0, 0, canvas.width, canvas.height) }
  for (const layer of visibleLayers()) if (layer.visible) paintLayer(ctx, layer, v.project, k)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (blob) downloadBlob(blob, transparent ? 'sketch-transparent.png' : 'sketch.png')
}

export function exportVector(): void {
  const v = viewport()
  if (!v) return
  const svg = exportSvg(visibleLayers(), v.width, v.height, PAPER[state().history.present.paper].bg, v.project)
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'sketch.svg')
}

/** Layers as seen from here, for Procreate, Sketchbook, Krita, Clip Studio, Photoshop. */
export function exportPsd(layerName: (index: number) => string): void {
  const v = viewport()
  if (!v) return
  const k = EXPORT_LONG_SIDE / Math.max(v.width, v.height)
  const w = Math.round(v.width * k)
  const h = Math.round(v.height * k)
  const composite = document.createElement('canvas')
  composite.width = w
  composite.height = h
  const cctx = composite.getContext('2d')
  if (!cctx) return
  const layers = visibleLayers().map((layer, i) => {
    const canvas = renderLayerCanvas(layer, v.width, v.height, v.project, k)
    if (layer.visible) cctx.drawImage(canvas, 0, 0, w, h)
    const rgba = canvas.getContext('2d')!.getImageData(0, 0, w, h).data
    return { name: layerName(i), rgba, visible: layer.visible }
  })
  const bytes = encodePsd(w, h, layers, cctx.getImageData(0, 0, w, h).data)
  downloadBlob(new Blob([bytes as BlobPart], { type: 'image/vnd.adobe.photoshop' }), 'sketch.psd')
}

export function exportBlender(): void {
  const engine = state().engine
  if (!engine) return
  downloadBlob(new Blob([exportBlenderScript('3D sketch', visibleLayers(), engine.worldPerPixel())], { type: 'text/x-python' }), 'sketch-blender.py')
}

export function exportObjFile(): void {
  downloadBlob(new Blob([exportObj(visibleLayers())], { type: 'text/plain' }), 'sketch.obj')
}

export function exportSketchFile(): void {
  downloadBlob(new Blob([serializeDoc(state().history.present)], { type: 'application/json' }), 'drawing.sketch.json')
}

// ── Sharing ──────────────────────────────────────────────────────────────────

async function shareCard(target: ShareTarget): Promise<File | null> {
  const v = viewport()
  if (!v) return null
  const { width, height } = SHARE_SIZE[target]
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const paper = PAPER[state().history.present.paper]
  ctx.fillStyle = paper.bg
  ctx.fillRect(0, 0, width, height)
  // Frame the drawing, not the screen it was drawn on.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const layer of visibleLayers()) {
    if (!layer.visible) continue
    for (const stroke of layer.strokes) {
      for (let i = 0; i < stroke.points.length; i += 4) {
        const s = v.project([stroke.points[i], stroke.points[i + 1], stroke.points[i + 2]])
        if (!s) continue
        minX = Math.min(minX, s.x); minY = Math.min(minY, s.y); maxX = Math.max(maxX, s.x); maxY = Math.max(maxY, s.y)
      }
    }
  }
  if (minX > maxX) { minX = 0; minY = 0; maxX = v.width; maxY = v.height }
  const fit = fitIntoCard(Math.max(1, maxX - minX), Math.max(1, maxY - minY), width, height)
  const project = (p: Vec3) => {
    const s = v.project(p)
    return s && { x: s.x - minX + fit.x / fit.scale, y: s.y - minY + fit.y / fit.scale }
  }
  for (const layer of visibleLayers()) if (layer.visible) paintLayer(ctx, layer, project, fit.scale)
  ctx.fillStyle = paper.ink
  ctx.globalAlpha = 0.55
  ctx.font = '500 26px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('ifcvieweronline.eu/sketch', width / 2, height - 90)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return blob && new File([blob], `sketch-${target}.png`, { type: 'image/png' })
}

export async function shareSketch(target: ShareTarget): Promise<ShareOutcome | null> {
  const file = await shareCard(target)
  if (!file) return null
  const outcome = await shareImage(file, (f) => downloadBlob(f, f.name))
  if (outcome === 'saved' && target === 'linkedin') window.open(LINKEDIN_SHARE_URL, '_blank', 'noopener')
  return outcome
}
