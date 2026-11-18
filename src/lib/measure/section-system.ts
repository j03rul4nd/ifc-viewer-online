// ─── section-system ───────────────────────────────────────────────────────────
// Section planes and the section box: creating them, moving them, and drawing
// the handles that move them.
//
// WHAT THE OLD TOOL WAS: one button — "click a face" — that dropped a plane
// along whatever normal the face happened to have, with no way to move it
// except a gizmo the panel never mentioned, no way to put it at a height, and
// no box. Every BIM viewer people come from opens sections the other way round:
//
//   PLAN / ELEVATION CUTS. One click for a horizontal cut through the model, or
//   a vertical one along X or Y, placed in the middle and then slid — by a
//   handle in the scene, a slider, or a typed value ("Z = 1.20 m").
//
//   THE SECTION BOX. Six planes around the model or around the selection, each
//   face draggable. It is the single most used section tool in coordination,
//   because it isolates a room or a riser without hiding anything by hand.
//
//   FACE CUTS stay, for the odd angle, and now cut AWAY from the camera — the
//   face you clicked stays, the stuff between you and it goes.
//
// Handles are hit-tested in screen space (a disc under the cursor, or the arrow
// through it), dragged along their axis by intersecting the cursor ray with that
// axis, and take the pointer BEFORE camera-controls sees it, so grabbing one
// never also orbits the camera.

import * as THREE from 'three'
import type { ScenePicker, PickResult } from './picker'
import { Dots, Fill, Segments, Stroke, OVERLAY_COLORS } from './overlay'
import { sceneAxisVector } from './measure-math'
import {
  IFC_AXES, boundsFromIfcRanges, closestParamOnAxis, ifcRange, ifcRanges, moveRangeSide,
  niceStep, padRange, projectBounds,
  type AxisRanges, type Bounds, type Range,
} from './section-math'
import type { IfcAxis } from './measure-types'

export interface SectionSystemDeps {
  scene: THREE.Scene
  canvas: HTMLCanvasElement
  /** An ancestor of the canvas: handles listen here, in the capture phase. */
  container: HTMLElement
  getCamera(): THREE.Camera
  picker: ScenePicker
  /** Register / unregister a global clipping plane with the renderer. */
  setPlane(active: boolean, plane: THREE.Plane): void
  getSceneBounds(): THREE.Box3 | null
  getSelectionBounds(): Promise<THREE.Box3 | null>
  setControlsEnabled(enabled: boolean): void
  /** Planes moved: re-cull streamed geometry. `final` after a drag or an edit. */
  planesChanged(final: boolean): void
  /** Fill cut solids with a colour, or stop (null). */
  setPoche(color: string | null): void
  /** Fly the camera to look at `target` from `position`. */
  lookAt(position: THREE.Vector3, target: THREE.Vector3): void
  aim(e: { clientX: number; clientY: number }): { x: number; y: number }
  /** A measurement tool owns the pointer: handles stand down. */
  isPointerBusy(): boolean
}

export interface SectionPlaneInfo {
  id: string
  kind: 'axis' | 'face'
  axis: IfcAxis | null
  /** 1-based, per kind, fixed at creation. */
  seq: number
  enabled: boolean
  /** IFC coordinate along `axis` for axis planes; displacement along the normal for face planes. */
  offset: number
  range: Range
  step: number
  /** Keeping the other side than the one it was created with. */
  flipped: boolean
}

export interface SectionBoxInfo {
  enabled: boolean
  ranges: AxisRanges
  limits: AxisRanges
  step: number
}

export type SectionSelection = string | 'box' | null

export interface SectionSnapshot {
  planes: readonly SectionPlaneInfo[]
  box: SectionBoxInfo | null
  placing: boolean
  selectedId: SectionSelection
  poche: boolean
  pocheColor: string
  gizmos: boolean
  /** Enabled planes, counting the box as one. */
  active: number
  hasBounds: boolean
}

export interface SectionSystem {
  getSnapshot(): SectionSnapshot
  subscribe(listener: () => void): () => void

  addAxisPlane(axis: IfcAxis): string | null
  startFacePlacement(): void
  cancelFacePlacement(): void
  isPlacing(): boolean
  setOffset(id: string, offset: number, final?: boolean): void
  flip(id: string): void
  setEnabled(id: string, enabled: boolean): void
  remove(id: string): void
  select(id: SectionSelection): void
  lookAt(id: string): void

  enableBox(fit: 'model' | 'selection'): Promise<boolean>
  setBoxRange(axis: IfcAxis, range: Range, final?: boolean): void
  setBoxEnabled(enabled: boolean): void
  removeBox(): void

  setPoche(on: boolean): void
  setPocheColor(color: string): void
  setGizmosVisible(on: boolean): void
  /** The section panel is open: show and accept the handles. */
  setInteractive(on: boolean): void
  refreshBounds(): void
  clear(): void

  /** Pointer routing from the viewer. */
  pointerMove(e: PointerEvent): void
  /** True when a face placement consumed the click. */
  click(e: MouseEvent): boolean
  /** A handle is under the cursor — the viewer skips its own hover. */
  isOverHandle(): boolean
  keyDown(e: KeyboardEvent): boolean
  /** Hide handles and placement preview for one render. Returns the undo. */
  hideForCapture(): () => void
  dispose(): void
}

// ── Internals ─────────────────────────────────────────────────────────────────

interface PlaneEntry {
  info: SectionPlaneInfo
  origin: THREE.Vector3
  /** Unit direction the plane slides along (its normal before flipping). */
  dir: THREE.Vector3
  plane: THREE.Plane
  gizmo: PlaneGizmo
}

interface BoxEntry {
  enabled: boolean
  ranges: AxisRanges
  limits: AxisRanges
  planes: Array<{ axis: IfcAxis; side: 'min' | 'max'; plane: THREE.Plane }>
  gizmo: BoxGizmo
}

type HandleTarget =
  | { type: 'plane'; id: string }
  | { type: 'box'; axis: IfcAxis; side: 'min' | 'max' }

interface Handle {
  target: HandleTarget
  anchor: THREE.Vector3
  dir: THREE.Vector3
}

const AXIS_COLOR: Record<IfcAxis, number> = { x: OVERLAY_COLORS.axisX, y: OVERLAY_COLORS.axisY, z: OVERLAY_COLORS.axisZ }
const HANDLE_PX = 15
const SHAFT_PX = 7
const ARROW_PX = 30
const MIN_BOX_GAP = 0.05
export const POCHE_COLORS = ['#2B2F3A', '#C0392B', '#5E6AD2', '#E8E6E1'] as const

let idCounter = 0
const nextId = (): string => `s${Date.now().toString(36)}${(idCounter++).toString(36)}`

function toBounds(box: THREE.Box3): Bounds {
  return { min: { x: box.min.x, y: box.min.y, z: box.min.z }, max: { x: box.max.x, y: box.max.y, z: box.max.z } }
}

/** Two unit vectors spanning the plane with normal `n`. */
function planeBasis(n: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  const helper = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const u = new THREE.Vector3().crossVectors(helper, n).normalize()
  const v = new THREE.Vector3().crossVectors(n, u).normalize()
  return [u, v]
}

/** Arrow shaft plus heads at both ends, as segment pairs, sized in pixels. */
function arrowSegments(anchor: THREE.Vector3, dir: THREE.Vector3, camera: THREE.Camera, wpp: number): THREE.Vector3[] {
  const len = ARROW_PX * wpp
  const head = 7 * wpp
  const view = (camera as THREE.OrthographicCamera).isOrthographicCamera
    ? camera.getWorldDirection(new THREE.Vector3())
    : anchor.clone().sub(camera.position).normalize()
  let side = new THREE.Vector3().crossVectors(dir, view)
  if (side.lengthSq() < 1e-8) side = planeBasis(dir)[0]
  side.normalize()
  const a = anchor.clone().addScaledVector(dir, -len)
  const b = anchor.clone().addScaledVector(dir, len)
  const out = [a, b]
  for (const [tip, sign] of [[b, 1], [a, -1]] as const) {
    const back = tip.clone().addScaledVector(dir, -sign * head)
    out.push(tip, back.clone().addScaledVector(side, head * 0.7))
    out.push(tip, back.clone().addScaledVector(side, -head * 0.7))
  }
  return out
}

class PlaneGizmo {
  readonly group = new THREE.Group()
  readonly outline = new Stroke({ color: OVERLAY_COLORS.section, width: 1.5, closed: true })
  readonly fill = new Fill(OVERLAY_COLORS.section, 0.05)
  readonly arrow: Segments
  readonly knob: Dots
  constructor(color: number) {
    this.arrow = new Segments({ color, width: 2.5, ghost: false })
    this.knob = new Dots(color, 15)
    for (const o of [this.fill, this.outline, this.arrow, this.knob]) this.group.add(o.object)
  }
  dispose(): void {
    for (const o of [this.fill, this.outline, this.arrow, this.knob]) o.dispose()
    this.group.removeFromParent()
  }
}

class BoxGizmo {
  readonly group = new THREE.Group()
  readonly edges = new Segments({ color: OVERLAY_COLORS.section, width: 1.5 })
  readonly faceFill = new Fill(OVERLAY_COLORS.section, 0.08)
  readonly arrows: Record<IfcAxis, Segments>
  readonly knobs: Record<IfcAxis, Dots>
  constructor() {
    this.arrows = {
      x: new Segments({ color: AXIS_COLOR.x, width: 2.5, ghost: false }),
      y: new Segments({ color: AXIS_COLOR.y, width: 2.5, ghost: false }),
      z: new Segments({ color: AXIS_COLOR.z, width: 2.5, ghost: false }),
    }
    this.knobs = { x: new Dots(AXIS_COLOR.x, 13), y: new Dots(AXIS_COLOR.y, 13), z: new Dots(AXIS_COLOR.z, 13) }
    this.group.add(this.faceFill.object, this.edges.object)
    for (const a of IFC_AXES) this.group.add(this.arrows[a].object, this.knobs[a].object)
  }
  dispose(): void {
    this.edges.dispose()
    this.faceFill.dispose()
    for (const a of IFC_AXES) { this.arrows[a].dispose(); this.knobs[a].dispose() }
    this.group.removeFromParent()
  }
}

export function createSectionSystem(deps: SectionSystemDeps): SectionSystem {
  const root = new THREE.Group()
  root.name = 'section-gizmos'
  deps.scene.add(root)

  const planes = new Map<string, PlaneEntry>()
  const seq: Record<IfcAxis | 'face', number> = { x: 0, y: 0, z: 0, face: 0 }
  let box: BoxEntry | null = null
  let placing = false
  let selectedId: SectionSelection = null
  let poche = true
  let pocheColor: string = POCHE_COLORS[0]
  let gizmos = true
  /** Handles are only offered while the section panel is open. */
  let interactive = false
  let bounds: Bounds | null = null
  let hovered: HandleTarget | null = null
  let appliedPoche: string | null = null

  const listeners = new Set<() => void>()
  let snapshot = buildSnapshot()

  // Face placement preview.
  const previewFill = new Fill(OVERLAY_COLORS.section, 0.16)
  const previewOutline = new Stroke({ color: OVERLAY_COLORS.section, width: 2, ghost: false, closed: true })
  root.add(previewFill.object, previewOutline.object)

  function readBounds(): Bounds | null {
    const b = deps.getSceneBounds()
    return b && !b.isEmpty() ? toBounds(b) : null
  }
  bounds = readBounds()

  function boundsCenter(): THREE.Vector3 {
    if (!bounds) return new THREE.Vector3()
    return new THREE.Vector3(
      (bounds.min.x + bounds.max.x) / 2, (bounds.min.y + bounds.max.y) / 2, (bounds.min.z + bounds.max.z) / 2,
    )
  }

  function diag(): number {
    if (!bounds) return 10
    return Math.hypot(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z)
  }

  // ── Snapshot ────────────────────────────────────────────────────────────────

  function buildSnapshot(): SectionSnapshot {
    const list = [...planes.values()].map((e) => e.info)
    const boxInfo: SectionBoxInfo | null = box
      ? { enabled: box.enabled, ranges: box.ranges, limits: box.limits, step: niceStep(Math.max(...IFC_AXES.map((a) => box!.limits[a].max - box!.limits[a].min))) }
      : null
    return {
      planes: list,
      box: boxInfo,
      placing,
      selectedId,
      poche,
      pocheColor,
      gizmos,
      active: list.filter((p) => p.enabled).length + (box?.enabled ? 1 : 0),
      hasBounds: bounds !== null,
    }
  }

  function emit(): void {
    snapshot = buildSnapshot()
    for (const l of listeners) { try { l() } catch { /* ok */ } }
  }

  // ── Planes ──────────────────────────────────────────────────────────────────

  function normalOf(entry: PlaneEntry): THREE.Vector3 {
    return entry.dir.clone().multiplyScalar(entry.info.flipped ? -1 : 1)
  }

  /** Where the plane is: origin + dir·offset (the handle sits here). */
  function anchorOf(entry: PlaneEntry): THREE.Vector3 {
    const onPlane = entry.origin.clone().addScaledVector(entry.dir, entry.info.offset)
    if (entry.info.kind === 'face' || !bounds) return onPlane
    // Axis planes: the handle goes where the model is, not at the world origin.
    const c = boundsCenter()
    return c.addScaledVector(entry.dir, entry.info.offset - c.dot(entry.dir))
  }

  function applyPlane(entry: PlaneEntry): void {
    const n = normalOf(entry)
    const p = entry.origin.clone().addScaledVector(entry.dir, entry.info.offset)
    entry.plane.setFromNormalAndCoplanarPoint(n, p)
  }

  function rangeFor(origin: THREE.Vector3, dir: THREE.Vector3, axis: IfcAxis | null): Range {
    if (!bounds) return { min: -10, max: 10 }
    const r = axis ? ifcRange(bounds, axis) : projectBounds(bounds, origin, dir)
    return padRange(r, 0.02, 0.05)
  }

  function makeEntry(kind: 'axis' | 'face', axis: IfcAxis | null, origin: THREE.Vector3, dir: THREE.Vector3, offset: number, flipped: boolean): PlaneEntry {
    const key = axis ?? 'face'
    seq[key] += 1
    const range = rangeFor(origin, dir, axis)
    const info: SectionPlaneInfo = {
      id: nextId(), kind, axis, seq: seq[key], enabled: true,
      offset, range, step: niceStep(range.max - range.min), flipped,
    }
    const gizmo = new PlaneGizmo(axis ? AXIS_COLOR[axis] : OVERLAY_COLORS.section)
    root.add(gizmo.group)
    const entry: PlaneEntry = { info, origin, dir, plane: new THREE.Plane(), gizmo }
    applyPlane(entry)
    deps.setPlane(true, entry.plane)
    planes.set(info.id, entry)
    return entry
  }

  function addAxisPlane(axis: IfcAxis): string | null {
    bounds = readBounds()
    if (!bounds) return null
    const dir = new THREE.Vector3().copy(sceneAxisVector(axis) as THREE.Vector3Like)
    const r = ifcRange(bounds, axis)
    const camera = deps.getCamera()
    const c = boundsCenter()
    // Keep the far side, so the cut opens the model TOWARDS the viewer. A plan
    // cut always keeps what is below: that is what a plan is.
    const flipped = axis === 'z' ? true : camera.position.clone().sub(c).dot(dir) > 0
    const entry = makeEntry('axis', axis, new THREE.Vector3(), dir, (r.min + r.max) / 2, flipped)
    selectedId = entry.info.id
    afterChange(true)
    return entry.info.id
  }

  function addFacePlane(pick: PickResult): void {
    if (!pick.normal) return
    bounds = readBounds()
    // The pick normal faces the camera. Keep the side AWAY from it: the face
    // clicked stays, whatever is between it and the viewer goes.
    const dir = pick.normal.clone().negate().normalize()
    const entry = makeEntry('face', null, pick.surfacePoint.clone(), dir, 0, false)
    selectedId = entry.info.id
    afterChange(true)
  }

  function remove(id: string): void {
    const entry = planes.get(id)
    if (!entry) return
    deps.setPlane(false, entry.plane)
    entry.gizmo.dispose()
    planes.delete(id)
    if (selectedId === id) selectedId = null
    if (hovered?.type === 'plane' && hovered.id === id) hovered = null
    afterChange(true)
  }

  // ── Box ─────────────────────────────────────────────────────────────────────

  function applyBox(): void {
    if (!box) return
    for (const p of box.planes) {
      const d = new THREE.Vector3().copy(sceneAxisVector(p.axis) as THREE.Vector3Like)
      const r = box.ranges[p.axis]
      if (p.side === 'min') p.plane.setFromNormalAndCoplanarPoint(d, d.clone().multiplyScalar(r.min))
      else p.plane.setFromNormalAndCoplanarPoint(d.clone().negate(), d.clone().multiplyScalar(r.max))
    }
  }

  function registerBox(on: boolean): void {
    if (!box) return
    for (const p of box.planes) deps.setPlane(on, p.plane)
  }

  async function enableBox(fit: 'model' | 'selection'): Promise<boolean> {
    bounds = readBounds()
    if (!bounds) return false
    let target: Bounds = bounds
    if (fit === 'selection') {
      const sel = await deps.getSelectionBounds()
      if (!sel || sel.isEmpty()) return false
      const size = sel.getSize(new THREE.Vector3()).length()
      target = toBounds(sel.clone().expandByScalar(Math.max(size * 0.08, 0.25)))
    }
    const limits = ifcRanges(bounds)
    for (const a of IFC_AXES) limits[a] = padRange(limits[a], 0.05, 0.25)
    const ranges = ifcRanges(target)
    for (const a of IFC_AXES) {
      // A selection can stick out of the model's box (a site element); widen the
      // limits rather than clamp the box the person asked for.
      limits[a] = { min: Math.min(limits[a].min, ranges[a].min), max: Math.max(limits[a].max, ranges[a].max) }
      if (fit === 'model') ranges[a] = padRange(ranges[a], 0.01, 0.02)
    }
    if (box) registerBox(false)
    else {
      const gizmo = new BoxGizmo()
      root.add(gizmo.group)
      box = {
        enabled: true, ranges, limits, gizmo,
        planes: IFC_AXES.flatMap((axis) => (['min', 'max'] as const).map((side) => ({ axis, side, plane: new THREE.Plane() }))),
      }
    }
    box.ranges = ranges
    box.limits = limits
    box.enabled = true
    applyBox()
    registerBox(true)
    selectedId = 'box'
    afterChange(true)
    return true
  }

  function setBoxRange(axis: IfcAxis, range: Range, final = false): void {
    if (!box) return
    const limits = box.limits[axis]
    let r = moveRangeSide(box.ranges[axis], 'min', range.min, limits, MIN_BOX_GAP)
    r = moveRangeSide(r, 'max', range.max, limits, MIN_BOX_GAP)
    box.ranges = { ...box.ranges, [axis]: r }
    applyBox()
    afterChange(final)
  }

  function removeBox(): void {
    if (!box) return
    registerBox(false)
    box.gizmo.dispose()
    box = null
    if (selectedId === 'box') selectedId = null
    if (hovered?.type === 'box') hovered = null
    afterChange(true)
  }

  // ── After any change ────────────────────────────────────────────────────────

  function syncPoche(): void {
    const active = [...planes.values()].some((e) => e.info.enabled) || !!box?.enabled
    const want = poche && active ? pocheColor : null
    if (want === appliedPoche) return
    appliedPoche = want
    deps.setPoche(want)
  }

  function afterChange(final: boolean): void {
    syncPoche()
    updateGizmos()
    deps.planesChanged(final)
    emit()
  }

  // ── Gizmos ──────────────────────────────────────────────────────────────────

  function handlesShown(): boolean {
    return gizmos && interactive && !deps.isPointerBusy()
  }

  function viewportHeight(): number {
    return Math.max(1, deps.canvas.getBoundingClientRect().height)
  }

  function planeQuad(entry: PlaneEntry): THREE.Vector3[] | null {
    if (!bounds) return null
    const n = entry.dir
    const anchor = anchorOf(entry)
    const [u, v] = planeBasis(n)
    let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const d = new THREE.Vector3(x, y, z).sub(anchor)
      const a = d.dot(u)
      const b = d.dot(v)
      umin = Math.min(umin, a); umax = Math.max(umax, a); vmin = Math.min(vmin, b); vmax = Math.max(vmax, b)
    }
    const pad = diag() * 0.03
    umin -= pad; umax += pad; vmin -= pad; vmax += pad
    const at = (a: number, b: number) => anchor.clone().addScaledVector(u, a).addScaledVector(v, b)
    return [at(umin, vmin), at(umax, vmin), at(umax, vmax), at(umin, vmax)]
  }

  function isSelected(target: HandleTarget): boolean {
    return target.type === 'plane' ? selectedId === target.id : selectedId === 'box'
  }

  function isHovered(target: HandleTarget): boolean {
    if (!hovered) return false
    if (target.type === 'plane') return hovered.type === 'plane' && hovered.id === target.id
    return hovered.type === 'box' && target.type === 'box' && hovered.axis === target.axis && hovered.side === target.side
  }

  function handles(): Handle[] {
    const out: Handle[] = []
    for (const entry of planes.values()) {
      if (!entry.info.enabled) continue
      out.push({ target: { type: 'plane', id: entry.info.id }, anchor: anchorOf(entry), dir: entry.dir.clone() })
    }
    if (box?.enabled) {
      const b = boundsFromIfcRanges(box.ranges)
      const c = new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2)
      for (const axis of IFC_AXES) {
        const d = new THREE.Vector3().copy(sceneAxisVector(axis) as THREE.Vector3Like)
        for (const side of ['min', 'max'] as const) {
          const value = box.ranges[axis][side]
          const anchor = c.clone().addScaledVector(d, value - c.dot(d))
          out.push({ target: { type: 'box', axis, side }, anchor, dir: d })
        }
      }
    }
    return out
  }

  function updateGizmos(): void {
    const camera = deps.getCamera()
    camera.updateMatrixWorld()
    const h = viewportHeight()
    const show = handlesShown()
    for (const entry of planes.values()) {
      const g = entry.gizmo
      g.group.visible = show && entry.info.enabled
      if (!g.group.visible) continue
      const target: HandleTarget = { type: 'plane', id: entry.info.id }
      const quad = planeQuad(entry)
      const sel = isSelected(target)
      const hov = isHovered(target)
      if (quad) {
        g.outline.setPoints(quad)
        g.fill.setQuad(quad)
        g.fill.setOpacity(sel ? 0.08 : 0.04)
        g.outline.setWidth(sel ? 2 : 1.25)
      }
      const anchor = anchorOf(entry)
      const wpp = pixelSize(camera, anchor, h)
      g.arrow.setSegments(arrowSegments(anchor, entry.dir, camera, wpp * (hov ? 1.15 : 1)))
      g.arrow.setWidth(hov || sel ? 3.5 : 2.5)
      g.knob.setPoints([anchor])
      g.knob.setSize(hov ? 18 : sel ? 16 : 14)
    }
    if (box) {
      const g = box.gizmo
      g.group.visible = show && box.enabled
      if (g.group.visible) {
        const b = boundsFromIfcRanges(box.ranges)
        const cs = [
          new THREE.Vector3(b.min.x, b.min.y, b.min.z), new THREE.Vector3(b.max.x, b.min.y, b.min.z),
          new THREE.Vector3(b.max.x, b.min.y, b.max.z), new THREE.Vector3(b.min.x, b.min.y, b.max.z),
          new THREE.Vector3(b.min.x, b.max.y, b.min.z), new THREE.Vector3(b.max.x, b.max.y, b.min.z),
          new THREE.Vector3(b.max.x, b.max.y, b.max.z), new THREE.Vector3(b.min.x, b.max.y, b.max.z),
        ]
        const e: THREE.Vector3[] = []
        for (let i = 0; i < 4; i++) {
          e.push(cs[i], cs[(i + 1) % 4], cs[i + 4], cs[((i + 1) % 4) + 4], cs[i], cs[i + 4])
        }
        g.edges.setSegments(e)
        g.edges.setWidth(selectedId === 'box' ? 2 : 1.5)
        const byAxis: Record<IfcAxis, THREE.Vector3[]> = { x: [], y: [], z: [] }
        const knobs: Record<IfcAxis, THREE.Vector3[]> = { x: [], y: [], z: [] }
        let hoveredFace: THREE.Vector3[] | null = null
        for (const handle of handles()) {
          if (handle.target.type !== 'box') continue
          const wpp = pixelSize(camera, handle.anchor, h)
          const hov = isHovered(handle.target)
          byAxis[handle.target.axis].push(...arrowSegments(handle.anchor, handle.dir, camera, wpp * (hov ? 1.15 : 1)))
          knobs[handle.target.axis].push(handle.anchor)
          if (hov) hoveredFace = boxFace(b, handle.target.axis, handle.target.side)
        }
        for (const a of IFC_AXES) {
          g.arrows[a].setSegments(byAxis[a])
          g.knobs[a].setPoints(knobs[a])
        }
        if (hoveredFace) g.faceFill.setQuad(hoveredFace)
        else g.faceFill.object.visible = false
      }
    }
  }

  function boxFace(b: Bounds, axis: IfcAxis, side: 'min' | 'max'): THREE.Vector3[] {
    // Scene coordinates of the face; IFC Y max is scene z min.
    if (axis === 'x') {
      const x = side === 'min' ? b.min.x : b.max.x
      return [new THREE.Vector3(x, b.min.y, b.min.z), new THREE.Vector3(x, b.max.y, b.min.z), new THREE.Vector3(x, b.max.y, b.max.z), new THREE.Vector3(x, b.min.y, b.max.z)]
    }
    if (axis === 'z') {
      const y = side === 'min' ? b.min.y : b.max.y
      return [new THREE.Vector3(b.min.x, y, b.min.z), new THREE.Vector3(b.max.x, y, b.min.z), new THREE.Vector3(b.max.x, y, b.max.z), new THREE.Vector3(b.min.x, y, b.max.z)]
    }
    const z = side === 'min' ? b.max.z : b.min.z
    return [new THREE.Vector3(b.min.x, b.min.y, z), new THREE.Vector3(b.max.x, b.min.y, z), new THREE.Vector3(b.max.x, b.max.y, z), new THREE.Vector3(b.min.x, b.max.y, z)]
  }

  function pixelSize(camera: THREE.Camera, point: THREE.Vector3, h: number): number {
    const persp = camera as THREE.PerspectiveCamera
    if (persp.isPerspectiveCamera) {
      return (2 * camera.position.distanceTo(point) * Math.tan(THREE.MathUtils.degToRad(persp.fov) / 2)) / h
    }
    const o = camera as THREE.OrthographicCamera
    return (o.top - o.bottom) / (o.zoom || 1) / h
  }

  // Keep the handles a constant size on screen while the camera moves.
  let raf = 0
  let lastCamera = ''
  function cameraSignature(): string {
    const c = deps.getCamera()
    c.updateMatrixWorld()
    const e = c.matrixWorld.elements
    const p = c.projectionMatrix.elements
    return `${e[12].toFixed(3)},${e[13].toFixed(3)},${e[14].toFixed(3)},${e[8].toFixed(4)},${e[9].toFixed(4)},${e[10].toFixed(4)},${p[0].toFixed(5)},${p[5].toFixed(5)}`
  }
  function tick(): void {
    raf = 0
    const needed = gizmos && interactive && (planes.size > 0 || box !== null)
    if (!needed) return
    const sig = cameraSignature() + (deps.isPointerBusy() ? 'b' : '')
    if (sig !== lastCamera) { lastCamera = sig; updateGizmos() }
    raf = requestAnimationFrame(tick)
  }
  function ensureTicking(): void {
    if (raf || typeof requestAnimationFrame === 'undefined') return
    raf = requestAnimationFrame(tick)
  }

  // ── Handle picking and dragging ─────────────────────────────────────────────

  function hitHandle(x: number, y: number): Handle | null {
    if (!handlesShown() || placing) return null
    let best: Handle | null = null
    let bestPx = Infinity
    const camera = deps.getCamera()
    const h = viewportHeight()
    for (const handle of handles()) {
      const c = deps.picker.project(handle.anchor)
      if (!c) continue
      let px = Math.hypot(c.x - x, c.y - y)
      if (px > HANDLE_PX) {
        // The arrow through the knob is grabbable too.
        const wpp = pixelSize(camera, handle.anchor, h)
        const a = deps.picker.project(handle.anchor.clone().addScaledVector(handle.dir, -ARROW_PX * wpp))
        const b = deps.picker.project(handle.anchor.clone().addScaledVector(handle.dir, ARROW_PX * wpp))
        if (a && b) {
          const d = distanceToSegment(x, y, a.x, a.y, b.x, b.y)
          px = d <= SHAFT_PX ? d + 1 : Infinity
        } else px = Infinity
      }
      if (px < bestPx) { bestPx = px; best = handle }
    }
    return bestPx <= HANDLE_PX ? best : null
  }

  function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  }

  const raycaster = new THREE.Raycaster()
  function cursorRay(x: number, y: number): THREE.Ray {
    const r = deps.canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
    raycaster.setFromCamera(ndc, deps.getCamera())
    return raycaster.ray
  }

  interface Drag {
    handle: Handle
    startParam: number | null
    startValue: number
    startY: number
    wpp: number
  }
  let drag: Drag | null = null

  function handleValue(target: HandleTarget): number {
    if (target.type === 'plane') return planes.get(target.id)?.info.offset ?? 0
    return box?.ranges[target.axis][target.side] ?? 0
  }

  function setHandleValue(target: HandleTarget, value: number, final: boolean): void {
    if (target.type === 'plane') {
      const entry = planes.get(target.id)
      if (!entry) return
      setOffset(target.id, Math.min(entry.info.range.max, Math.max(entry.info.range.min, value)), final)
    } else if (box) {
      const r = moveRangeSide(box.ranges[target.axis], target.side, value, box.limits[target.axis], MIN_BOX_GAP)
      box.ranges = { ...box.ranges, [target.axis]: r }
      applyBox()
      afterChange(final)
    }
  }

  const onDragMove = (e: PointerEvent): void => {
    if (!drag) return
    e.preventDefault()
    e.stopPropagation()
    const at = deps.aim(e)
    const ray = cursorRay(at.x, at.y)
    const { handle } = drag
    let value: number
    const t = drag.startParam === null ? null : closestParamOnAxis(handle.anchor, handle.dir, ray.origin, ray.direction)
    if (t === null || drag.startParam === null) {
      // The axis points at the camera: map vertical mouse travel onto it.
      value = drag.startValue + (drag.startY - at.y) * drag.wpp
    } else {
      value = drag.startValue + (t - drag.startParam)
    }
    setHandleValue(handle.target, value, false)
  }

  const endDrag = (e: PointerEvent): void => {
    if (!drag) return
    e.preventDefault()
    e.stopPropagation()
    const target = drag.handle.target
    drag = null
    window.removeEventListener('pointermove', onDragMove, true)
    window.removeEventListener('pointerup', endDrag, true)
    window.removeEventListener('pointercancel', endDrag, true)
    deps.setControlsEnabled(true)
    deps.canvas.style.cursor = hitHandle(e.clientX, e.clientY) ? 'grab' : ''
    setHandleValue(target, handleValue(target), true)
  }

  const onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || e.target !== deps.canvas || drag) return
    const at = deps.aim(e)
    const handle = hitHandle(at.x, at.y)
    if (!handle) return
    // Ours, before camera-controls (which listens on the canvas) sees it.
    e.preventDefault()
    e.stopPropagation()
    const ray = cursorRay(at.x, at.y)
    const startParam = closestParamOnAxis(handle.anchor, handle.dir, ray.origin, ray.direction)
    drag = {
      handle,
      startParam,
      startValue: handleValue(handle.target),
      startY: at.y,
      wpp: pixelSize(deps.getCamera(), handle.anchor, viewportHeight()),
    }
    selectedId = handle.target.type === 'plane' ? handle.target.id : 'box'
    hovered = handle.target
    deps.setControlsEnabled(false)
    deps.canvas.style.cursor = 'grabbing'
    window.addEventListener('pointermove', onDragMove, true)
    window.addEventListener('pointerup', endDrag, true)
    window.addEventListener('pointercancel', endDrag, true)
    updateGizmos()
    emit()
  }
  deps.container.addEventListener('pointerdown', onPointerDown, true)

  // ── Face placement ──────────────────────────────────────────────────────────

  let picking = false
  let queuedAt: { x: number; y: number } | null = null

  function hidePreview(): void {
    previewFill.object.visible = false
    previewOutline.object.visible = false
  }

  function schedulePlacementPick(at: { x: number; y: number }): void {
    if (picking) { queuedAt = at; return }
    picking = true
    void deps.picker.pick(at.x, at.y, { snaps: null, wantFace: true }).then((r) => {
      picking = false
      if (!placing) return
      hidePreview()
      if (r?.face && r.face.length >= 3) {
        previewFill.setPolygon(r.face)
        previewOutline.setPoints(r.face)
      }
      if (queuedAt) { const next = queuedAt; queuedAt = null; schedulePlacementPick(next) }
    }, () => { picking = false })
  }

  function setOffset(id: string, offset: number, final = false): void {
    const entry = planes.get(id)
    if (!entry || !Number.isFinite(offset)) return
    entry.info = { ...entry.info, offset }
    applyPlane(entry)
    afterChange(final)
  }

  function clear(): void {
    for (const id of [...planes.keys()]) {
      const entry = planes.get(id)!
      deps.setPlane(false, entry.plane)
      entry.gizmo.dispose()
      planes.delete(id)
    }
    if (box) { registerBox(false); box.gizmo.dispose(); box = null }
    seq.x = 0; seq.y = 0; seq.z = 0; seq.face = 0
    selectedId = null
    hovered = null
    placing = false
    hidePreview()
    afterChange(true)
  }

  ensureTicking()

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); ensureTicking(); return () => { listeners.delete(listener) } },

    addAxisPlane(axis) {
      const id = addAxisPlane(axis)
      ensureTicking()
      return id
    },
    startFacePlacement() {
      placing = true
      deps.canvas.style.cursor = 'crosshair'
      emit()
    },
    cancelFacePlacement() {
      if (!placing) return
      placing = false
      hidePreview()
      deps.canvas.style.cursor = ''
      emit()
    },
    isPlacing: () => placing,
    setOffset,
    flip(id) {
      const entry = planes.get(id)
      if (!entry) return
      entry.info = { ...entry.info, flipped: !entry.info.flipped }
      applyPlane(entry)
      afterChange(true)
    },
    setEnabled(id, enabled) {
      const entry = planes.get(id)
      if (!entry || entry.info.enabled === enabled) return
      entry.info = { ...entry.info, enabled }
      deps.setPlane(enabled, entry.plane)
      afterChange(true)
    },
    remove,
    select(id) {
      if (id === selectedId) return
      selectedId = id
      updateGizmos()
      emit()
    },
    lookAt(id) {
      const entry = planes.get(id)
      if (!entry) return
      const anchor = anchorOf(entry)
      // Look INTO the kept side, from the side that was cut away.
      const n = normalOf(entry)
      const camera = deps.getCamera()
      const dist = Math.max(camera.position.distanceTo(anchor), diag() * 0.6, 3)
      const up = Math.abs(n.y) > 0.99
      const pos = anchor.clone().addScaledVector(n, -dist)
      // A tiny tilt stops camera-controls from gimbal-locking on a pure plan view.
      if (up) pos.add(new THREE.Vector3(0, 0, dist * 1e-3))
      deps.lookAt(pos, anchor)
    },

    enableBox: async (fit) => {
      const ok = await enableBox(fit)
      ensureTicking()
      return ok
    },
    setBoxRange,
    setBoxEnabled(enabled) {
      if (!box || box.enabled === enabled) return
      box.enabled = enabled
      registerBox(enabled)
      afterChange(true)
    },
    removeBox,

    setPoche(on) { poche = on; syncPoche(); emit() },
    setPocheColor(color) { pocheColor = color; syncPoche(); emit() },
    setGizmosVisible(on) {
      if (gizmos === on) return
      gizmos = on
      if (!on) hovered = null
      updateGizmos()
      ensureTicking()
      emit()
    },
    setInteractive(on) {
      if (interactive === on) return
      interactive = on
      if (!on) {
        hovered = null
        if (placing) { placing = false; hidePreview(); deps.canvas.style.cursor = '' }
      }
      lastCamera = ''
      updateGizmos()
      ensureTicking()
      emit()
    },
    refreshBounds() {
      bounds = readBounds()
      for (const entry of planes.values()) {
        const range = rangeFor(entry.origin, entry.dir, entry.info.axis)
        entry.info = { ...entry.info, range, step: niceStep(range.max - range.min) }
      }
      updateGizmos()
      emit()
    },
    clear,

    pointerMove(e) {
      const at = deps.aim(e)
      if (placing) {
        if (e.buttons === 0) schedulePlacementPick(at)
        return
      }
      if (drag || e.buttons !== 0) return
      const handle = hitHandle(at.x, at.y)
      const next = handle?.target ?? null
      const same = next === hovered || (!!next && !!hovered && next.type === hovered.type
        && (next.type === 'plane' ? hovered.type === 'plane' && next.id === hovered.id
          : hovered.type === 'box' && next.axis === hovered.axis && next.side === hovered.side))
      if (!same) {
        hovered = next
        deps.canvas.style.cursor = next ? 'grab' : (deps.isPointerBusy() ? 'crosshair' : '')
        updateGizmos()
      }
    },
    click(e) {
      if (!placing) return false
      const at = deps.aim(e)
      void deps.picker.pick(at.x, at.y, { snaps: null, wantFace: true }).then((pick) => {
        // Only what is under the click counts: a click on empty sky must not
        // cut along whatever face the cursor crossed on its way there.
        if (!placing) return
        if (!pick?.normal) return
        placing = false
        hidePreview()
        deps.canvas.style.cursor = ''
        addFacePlane(pick)
        ensureTicking()
      })
      return true
    },
    isOverHandle: () => hovered !== null || drag !== null,
    keyDown(e) {
      if (e.key === 'Escape' && placing) {
        placing = false
        hidePreview()
        deps.canvas.style.cursor = ''
        emit()
        return true
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        if (selectedId === 'box') removeBox()
        else remove(selectedId)
        return true
      }
      return false
    },
    hideForCapture() {
      // Handles are interface, not content: a screenshot of a section is a
      // picture of the cut, never of the arrows that move it.
      const was = root.visible
      root.visible = false
      return () => { root.visible = was }
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      deps.container.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('pointermove', onDragMove, true)
      window.removeEventListener('pointerup', endDrag, true)
      window.removeEventListener('pointercancel', endDrag, true)
      clear()
      previewFill.dispose()
      previewOutline.dispose()
      root.removeFromParent()
      listeners.clear()
    },
  }
}
