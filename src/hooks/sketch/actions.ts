// ─── Sketch actions ───────────────────────────────────────────────────────────
// What buttons, gestures and shortcuts all do, in one place and free of React:
// the camera, the plane, the models under the sketch, exports, sharing.

import { inkFor, paintBrandMark, type SketchBrand } from '../../lib/sketch/brand'
import type { BrushPreset } from '../../lib/sketch/brushes'
import { activePage, addStrokes, mapLayerStrokes, newId, placeImage, serializeDoc } from '../../lib/sketch/document'
import { mapStroke, rotateOnPlane, scaleAbout, strokesCenter } from '../../lib/sketch/edit'
import { exportBlenderScript, exportObj } from '../../lib/sketch/export-blender'
import { encodePsd } from '../../lib/sketch/export-psd'
import { exportSvg } from '../../lib/sketch/export-svg'
import { add, dot, planeFromNormal, planeNormal, scale, type PlanePreset, presetPlane } from '../../lib/sketch/plane'
import { extractPalette } from '../../lib/sketch/filters'
import { COMPOSITE_OP, paintLayer, renderLayerCanvas } from '../../lib/sketch/raster'
import { encodeOra } from '../../lib/sketch/export-ora'
import { encodeSketchLink, SAFE_LINK_LENGTH } from '../../lib/sketch/share-link'
import { PAPER } from '../../lib/sketch/renderer'
import { fitIntoCard, LINKEDIN_SHARE_URL, shareImage, SHARE_SIZE, type ShareOutcome, type ShareTarget } from '../../lib/sketch/share'
import { readImageFile, saveBrand, saveContext, saveImage, saveOutbox, type ContextItem } from '../../lib/sketch/storage'
import { SKETCH_CHANNEL, type HandoffMessage } from '../../lib/sketch/handoff'
import type { OrbitState, ReferenceImage, SketchPlane, Stroke, Vec3 } from '../../lib/sketch/types'
import { useSketchStore as store } from '../../stores/sketchStore'

const state = () => store.getState()

// ── Camera ───────────────────────────────────────────────────────────────────

export function applyOrbit(next: OrbitState): void {
  state().engine?.setOrbit(next)
  state().set({ orbit: next })
}

const axes = (o: OrbitState): { right: Vec3; up: Vec3 } => {
  const right: Vec3 = [Math.cos(o.azimuth), 0, -Math.sin(o.azimuth)]
  const up: Vec3 = [-Math.sin(o.elevation) * Math.sin(o.azimuth), Math.cos(o.elevation), -Math.sin(o.elevation) * Math.cos(o.azimuth)]
  const c = Math.cos(o.roll ?? 0), s = Math.sin(o.roll ?? 0)
  return { right: add(scale(right, c), scale(up, s)), up: add(scale(up, c), scale(right, -s)) }
}

export function rollBy(angle: number): void {
  const o = state().engine?.orbitState
  if (o) applyOrbit({ ...o, roll: (o.roll ?? 0) + angle })
}

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

export function updateReference(id: string, patch: Partial<ReferenceImage>): void {
  const images = state().images.map((i) => (i.id === id ? { ...i, ...patch } : i))
  state().set({ images })
  const image = images.find((i) => i.id === id)
  if (image) void saveImage(image)
}

/** Float it over the drawing, or put it away. */
export function togglePin(image: ReferenceImage): void {
  const offset = state().images.filter((i) => i.pin).length * 28
  updateReference(image.id, { pin: image.pin ? undefined : { x: 280 + offset, y: 112 + offset, width: 260, opacity: 1, through: false } })
}

/** The colours of a reference, into the recent ones. */
export async function paletteFrom(image: ReferenceImage): Promise<void> {
  const bitmap = await createImageBitmap(image.blob)
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = Math.max(1, Math.round((64 * bitmap.height) / bitmap.width))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  if (ctx) state().setPrefs({ recent: extractPalette(ctx.getImageData(0, 0, canvas.width, canvas.height).data, 8) })
}

/** What is on screen now, as a reference: a model angle or an earlier idea to keep in view. */
export async function captureViewAsReference(name: string): Promise<void> {
  const blob = await state().engine?.toBlob('image/jpeg')
  if (!blob) return
  const file = new File([blob], `${name}.jpg`, { type: 'image/jpeg' })
  const image = await readImageFile(file, newId())
  if (!image) return
  state().set({ saveFailed: !(await saveImage(image)), images: [...state().images, image] })
}

// ── Selection and colour ─────────────────────────────────────────────────────

export function pickColorAt(x: number, y: number): void {
  const { engine, color, setPrefs } = state()
  if (engine) setPrefs({ color: engine.pickColor(x, y), colorB: color })
}

export function selectedStrokes(): Stroke[] {
  const ids = new Set(state().selection)
  return activePage(state().history.present).layers.flatMap((l) => l.strokes).filter((s) => ids.has(s.id))
}

export function syncSelection(): void {
  state().engine?.setSelection(selectedStrokes())
}

export function clearSelection(): void {
  state().set({ selection: [] })
  syncSelection()
}

/** Every change is one undo step, and keeps the strokes selected. */
function changeSelection(f: (p: Vec3) => Vec3): void {
  const ids = new Set(state().selection)
  state().edit((doc) => mapLayerStrokes(doc, (strokes) => (strokes.some((s) => ids.has(s.id)) ? strokes.map((s) => (ids.has(s.id) ? mapStroke(s, f) : s)) : strokes)))
  syncSelection()
}

export const scaleSelection = (k: number): void => changeSelection(scaleAbout(strokesCenter(selectedStrokes()), k))

export const rotateSelection = (angle: number): void => changeSelection(rotateOnPlane(state().plane, strokesCenter(selectedStrokes()), angle))

export function deleteSelection(): void {
  const ids = new Set(state().selection)
  state().edit((doc) => mapLayerStrokes(doc, (strokes) => (strokes.some((s) => ids.has(s.id)) ? strokes.filter((s) => !ids.has(s.id)) : strokes)))
  clearSelection()
}

/** A copy, nudged so it shows, which becomes the selection. */
export function duplicateSelection(): void {
  const { engine, plane } = state()
  const nudge = scale(plane.u, (engine?.worldPerPixel() ?? 0.01) * 24)
  const copies = selectedStrokes().map((s) => mapStroke(s, (p) => add(p, nudge), newId()))
  state().edit((doc) => addStrokes(doc, copies))
  state().set({ selection: copies.map((s) => s.id) })
  syncSelection()
}

export function saveBrush(name: string): void {
  const { tool, width, opacity, ink, brushes, setPrefs } = state()
  const brush = tool === 'pencil' || tool === 'marker' ? tool : 'pen'
  setPrefs({ brushes: [...brushes, { id: newId(), name, brush, width, opacity, ink }] })
}

export function applyBrush(preset: BrushPreset): void {
  state().setPrefs({ tool: preset.brush, width: preset.width, opacity: preset.opacity, ink: preset.ink })
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

type View = NonNullable<ReturnType<typeof viewport>>

const sheetColor = (): string => {
  const doc = state().history.present
  return doc.background?.color ?? PAPER[doc.paper].bg
}

/** The sheet, its picture if it has one, then the layers with their blend. */
async function composeInto(ctx: CanvasRenderingContext2D, w: number, h: number, v: Pick<View, 'width' | 'height' | 'project'>, k: number, sheet: boolean): Promise<void> {
  if (sheet) {
    ctx.fillStyle = sheetColor()
    ctx.fillRect(0, 0, w, h)
    const id = state().history.present.background?.imageId
    const blob = id ? state().images.find((i) => i.id === id)?.blob : undefined
    if (blob) {
      const bitmap = await createImageBitmap(blob)
      const f = Math.max(w / bitmap.width, h / bitmap.height)
      ctx.drawImage(bitmap, (w - bitmap.width * f) / 2, (h - bitmap.height * f) / 2, bitmap.width * f, bitmap.height * f)
      bitmap.close()
    }
  }
  for (const layer of visibleLayers()) {
    if (!layer.visible) continue
    const canvas = renderLayerCanvas(layer, v.width, v.height, v.project, k)
    ctx.globalAlpha = layer.opacity ?? 1
    ctx.globalCompositeOperation = COMPOSITE_OP[layer.blend ?? 'normal']
    ctx.drawImage(canvas, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
  if (sheet) await paintBrandMark(ctx, w, h, state().brand, inkFor(sheetColor()))
}

export function setBrand(patch: Partial<SketchBrand>): void {
  const brand = { ...state().brand, ...patch }
  state().set({ brand })
  void saveBrand(brand).then((ok) => state().set({ saveFailed: !ok }))
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
  await composeInto(ctx, canvas.width, canvas.height, v, k, !transparent)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (blob) downloadBlob(blob, transparent ? 'sketch-transparent.png' : 'sketch.png')
}

export function exportVector(): void {
  const v = viewport()
  if (!v) return
  const svg = exportSvg(visibleLayers(), v.width, v.height, sheetColor(), v.project)
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
    if (layer.visible) {
      cctx.globalAlpha = layer.opacity ?? 1
      cctx.globalCompositeOperation = COMPOSITE_OP[layer.blend ?? 'normal']
      cctx.drawImage(canvas, 0, 0, w, h)
      cctx.globalAlpha = 1
      cctx.globalCompositeOperation = 'source-over'
    }
    const rgba = canvas.getContext('2d')!.getImageData(0, 0, w, h).data
    return { name: layerName(i), rgba, visible: layer.visible, opacity: layer.opacity ?? 1, blend: layer.blend }
  })
  const bytes = encodePsd(w, h, layers, cctx.getImageData(0, 0, w, h).data)
  downloadBlob(new Blob([bytes as BlobPart], { type: 'image/vnd.adobe.photoshop' }), 'sketch.psd')
}

const pngBytes = async (canvas: HTMLCanvasElement): Promise<Uint8Array> => {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return new Uint8Array(await blob!.arrayBuffer())
}

/** OpenRaster: Krita, GIMP and MyPaint, with layers, opacity and blend. */
export async function exportOraFile(layerName: (index: number) => string): Promise<void> {
  const v = viewport()
  if (!v) return
  const k = EXPORT_LONG_SIDE / Math.max(v.width, v.height)
  const w = Math.round(v.width * k)
  const h = Math.round(v.height * k)
  const layers = await Promise.all(visibleLayers().map(async (layer, i) => ({
    name: layerName(i), png: await pngBytes(renderLayerCanvas(layer, v.width, v.height, v.project, k)),
    visible: layer.visible, opacity: layer.opacity ?? 1, blend: layer.blend ?? 'normal',
  })))
  const merged = document.createElement('canvas')
  merged.width = w
  merged.height = h
  await composeInto(merged.getContext('2d')!, w, h, v, k, false)
  const thumb = document.createElement('canvas')
  thumb.width = Math.min(256, w)
  thumb.height = Math.round(thumb.width * h / w)
  thumb.getContext('2d')!.drawImage(merged, 0, 0, thumb.width, thumb.height)
  const bytes = encodeOra(w, h, layers, await pngBytes(merged), await pngBytes(thumb))
  downloadBlob(new Blob([bytes as BlobPart], { type: 'image/openraster' }), 'sketch.ora')
}

const post = (message: HandoffMessage): void => {
  const channel = new BroadcastChannel(SKETCH_CHANNEL)
  channel.postMessage(message)
  channel.close()
}

/** Leave this view for the viewer's cover studio and Clip Studio to take. */
export async function sendImageToStudios(): Promise<boolean> {
  const v = viewport()
  if (!v) return false
  const k = EXPORT_LONG_SIDE / Math.max(v.width, v.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(v.width * k)
  canvas.height = Math.round(v.height * k)
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  await composeInto(ctx, canvas.width, canvas.height, v, k, true)
  const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!image || !(await saveOutbox({ image, width: canvas.width, height: canvas.height }))) return false
  post({ type: 'outbox' })
  return true
}

export async function sendVideoToStudios(video: Blob): Promise<boolean> {
  const { engine } = state()
  if (!engine || !(await saveOutbox({ video, width: engine.canvas.width, height: engine.canvas.height }))) return false
  post({ type: 'outbox' })
  return true
}

// ── Meetings ─────────────────────────────────────────────────────────────────

export function startMeeting(): void {
  state().set({ meeting: true, uiHidden: true, sheetOpen: false })
  state().setPrefs({ tool: 'laser' })
  void document.documentElement.requestFullscreen?.().catch(() => undefined)
}

export function endMeeting(): void {
  state().set({ meeting: false, uiHidden: false, laser: null })
  state().setPrefs({ tool: 'pen' })
  if (document.fullscreenElement) void document.exitFullscreen?.()
}

export function stepPage(by: number): void {
  const doc = state().history.present
  const at = doc.pages.findIndex((p) => p.id === doc.activePageId)
  const next = doc.pages[at + by]
  if (next) state().touch((d) => ({ ...d, activePageId: next.id }))
}

/** A read-only snapshot in a link. Null if it is too long to travel safely. */
export async function copySketchLink(): Promise<'copied' | 'too-long' | 'failed'> {
  try {
    const code = await encodeSketchLink(state().history.present)
    if (code.length > SAFE_LINK_LENGTH) return 'too-long'
    await navigator.clipboard.writeText(`${location.origin}/sketch#s=${code}`)
    return 'copied'
  } catch {
    return 'failed'
  }
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
  ctx.fillStyle = sheetColor()
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
  const { brand } = state()
  if (brand.mark && (brand.name || brand.logo)) await paintBrandMark(ctx, width, height, brand, inkFor(sheetColor()))
  else {
    ctx.fillStyle = paper.ink
    ctx.globalAlpha = 0.55
    ctx.font = '500 26px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('ifcvieweronline.eu/sketch', width / 2, height - 90)
  }
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
