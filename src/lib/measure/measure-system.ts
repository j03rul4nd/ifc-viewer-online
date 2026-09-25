// ─── measure-system ───────────────────────────────────────────────────────────
// The measurement engine: tool state, the measurement being drawn, the finished
// measurements and everything they draw in the scene.
//
// WHAT THE OLD TOOLS LACKED, and what this is organised around:
//
//   SEE WHAT YOU WILL GET. Every pointer move re-picks with snapping and draws
//   the measurement as it would be if you clicked now — the rubber band, its
//   live value, the edge or face it locked onto. A click then commits exactly
//   that; it does not pick again unless the view changed in between.
//
//   ONE STEP AT A TIME. The engine publishes which step it is waiting for
//   ("second point", "the vertex of the angle", "a face") and the panel turns
//   it into an instruction. Nobody should have to guess that an area is closed
//   with Enter.
//
//   MEASUREMENTS ARE THINGS. Each has a stable id, a name, a visibility and a
//   selection state; it can be focused, renamed, copied or deleted on its own —
//   from the list or from the label in the scene. The old list identified them
//   by their position in a Set, so deleting one renumbered the rest.
//
// The engine knows nothing about React or i18n: the panel reads snapshots
// (useSyncExternalStore) and hover state on a second, faster channel.

import * as THREE from 'three'
import './measure.css'
import type { ScenePicker, PickResult, PickOptions } from './picker'
import { Stroke, Dots, Fill, Label, OVERLAY_COLORS, paintLabel } from './overlay'
import * as M from './measure-math'
import { createTaskQueue } from './async'
import {
  DEFAULT_MEASURE_SETTINGS,
  type AreaMode, type DistanceMode, type IfcAxis, type MeasureHover, type MeasureItem,
  type MeasureKind, type MeasureSettings, type MeasureSnapshot, type MeasureStep, type MeasureTool,
  type Vec3,
} from './measure-types'

export interface MeasureSystemDeps {
  scene: THREE.Scene
  canvas: HTMLCanvasElement
  getCamera(): THREE.Camera
  picker: ScenePicker
  /** A scene point in the IFC coordinates of the model it lies on. */
  toModelCoordinates(point: THREE.Vector3, modelId: string | null): { coords: Vec3; frame: 'model' | 'scene' }
  /** Fly the camera to a box. */
  frameBox(box: THREE.Box3): void
  /** Client coordinates the pointer is aiming at (canvas centre under pointer lock). */
  aim(e: { clientX: number; clientY: number }): { x: number; y: number }
}

export interface MeasureSystem {
  getSnapshot(): MeasureSnapshot
  subscribe(listener: () => void): () => void
  getHover(): MeasureHover | null
  subscribeHover(listener: () => void): () => void

  setTool(tool: MeasureTool): void
  isActive(): boolean
  setDistanceMode(mode: DistanceMode): void
  setAreaMode(mode: AreaMode): void
  setSettings(patch: Partial<MeasureSettings>): void
  setStrings(strings: { deleteTitle: string }): void

  pointerMove(e: PointerEvent): void
  pointerLeave(): void
  click(e: MouseEvent): void
  /** True when the double-click was consumed by the active tool. */
  doubleClick(e: MouseEvent): boolean
  /** True when the key was consumed. */
  keyDown(e: KeyboardEvent): boolean
  keyUp(e: KeyboardEvent): void
  /** The camera moved: re-project what the HUD shows. */
  cameraChanged(): void

  finishDraft(): void
  undoLastPoint(): void
  cancelDraft(): void

  select(id: string | null): void
  setHighlighted(id: string | null): void
  remove(id: string): void
  removeLast(): void
  clear(): void
  setVisible(id: string, visible: boolean): void
  setAllVisible(visible: boolean): void
  rename(id: string, name: string | null): void
  focus(id: string): void
  /**
   * Paint every visible measurement label into a 2D canvas that holds the
   * rendered frame (width × height px, `s` px per CSS px). False when there
   * was nothing to paint, so a caller can keep the plain frame.
   */
  paintLabels(ctx: CanvasRenderingContext2D, width: number, height: number, s: number): boolean
  /** Hide the whole overlay for one render (a clean presentation image). Returns the undo. */
  hideForCapture(): () => void
  dispose(): void
}

// ── Visuals of one finished measurement ──────────────────────────────────────

interface ItemVisuals {
  group: THREE.Group
  strokes: Stroke[]
  dots: Dots
  fill: Fill | null
  label: Label
  /** Axis legs of a distance, or segment tags of a path — drawn when selected. */
  extras: { strokes: Stroke[]; labels: Label[] } | null
}

interface Entry {
  item: MeasureItem
  visuals: ItemVisuals
}

const KIND_COLOR: Record<MeasureKind, number> = {
  distance: OVERLAY_COLORS.distance,
  path: OVERLAY_COLORS.path,
  area: OVERLAY_COLORS.area,
  angle: OVERLAY_COLORS.angle,
  point: OVERLAY_COLORS.point,
}
const AXIS_COLOR: Record<IfcAxis, number> = { x: OVERLAY_COLORS.axisX, y: OVERLAY_COLORS.axisY, z: OVERLAY_COLORS.axisZ }

const v3 = (p: Vec3): THREE.Vector3 => new THREE.Vector3(p.x, p.y, p.z)
const plain = (p: THREE.Vector3): Vec3 => ({ x: p.x, y: p.y, z: p.z })

/** Pixels within which a click on the first vertex closes an area. */
const CLOSE_PX = 12
/** A second click this close to the previous point is the second half of a double-click. */
const DUPLICATE_PX = 4

let idCounter = 0
const nextId = (): string => `m${Date.now().toString(36)}${(idCounter++).toString(36)}`

export function createMeasureSystem(deps: MeasureSystemDeps): MeasureSystem {
  const root = new THREE.Group()
  root.name = 'measure-overlay'
  deps.scene.add(root)

  let tool: MeasureTool = 'none'
  let distanceMode: DistanceMode = 'point'
  let areaMode: AreaMode = 'polygon'
  let settings: MeasureSettings = { ...DEFAULT_MEASURE_SETTINGS }
  let deleteTitle = 'Delete'
  const entries = new Map<string, Entry>()
  const seq: Record<MeasureKind, number> = { distance: 0, path: 0, area: 0, angle: 0, point: 0 }
  let selectedId: string | null = null
  let highlightedId: string | null = null

  // ── Draft ────────────────────────────────────────────────────────────────────
  const draft = {
    points: [] as THREE.Vector3[],
    /** Perpendicular mode: the reference face's plane. */
    plane: null as { point: THREE.Vector3; normal: THREE.Vector3; face: THREE.Vector3[] | null } | null,
  }

  interface HoverState {
    pick: PickResult
    /** The point a click would place (after axis lock / closing). */
    point: THREE.Vector3
    axis: IfcAxis | null
    closing: boolean
    cursor: { x: number; y: number }
    camera: string
  }
  let hover: HoverState | null = null
  let lastPick: { pick: PickResult; cursor: { x: number; y: number }; camera: string } | null = null
  let hudHover: MeasureHover | null = null
  let shiftDown = false

  // Draft visuals: placed polyline, rubber band, dots, area fill, angle arc,
  // axis guide, snapped edge and hovered face.
  const draftStroke = new Stroke({ color: OVERLAY_COLORS.distance, width: 2.5 })
  const rubber = new Stroke({ color: OVERLAY_COLORS.preview, width: 2, dashed: true })
  const draftDots = new Dots(OVERLAY_COLORS.distance, 9)
  const draftFill = new Fill(OVERLAY_COLORS.area, 0.16)
  const draftArc = new Stroke({ color: OVERLAY_COLORS.angle, width: 2, ghost: false })
  const edgeHighlight = new Stroke({ color: OVERLAY_COLORS.highlight, width: 3.5, ghost: false })
  const faceFill = new Fill(OVERLAY_COLORS.highlight, 0.14)
  const faceOutline = new Stroke({ color: OVERLAY_COLORS.highlight, width: 2, ghost: false, closed: true })
  const planeFill = new Fill(OVERLAY_COLORS.highlight, 0.1)
  const planeOutline = new Stroke({ color: OVERLAY_COLORS.highlight, width: 1.5, ghost: false, closed: true, dashed: true })
  const draftGroup = new THREE.Group()
  draftGroup.name = 'measure-draft'
  for (const o of [draftFill, faceFill, planeFill, draftStroke, rubber, draftArc, edgeHighlight, faceOutline, planeOutline, draftDots]) {
    draftGroup.add(o.object)
  }
  root.add(draftGroup)

  // ── Subscriptions ────────────────────────────────────────────────────────────
  const listeners = new Set<() => void>()
  const hoverListeners = new Set<() => void>()
  let snapshot: MeasureSnapshot = buildSnapshot()

  function buildSnapshot(): MeasureSnapshot {
    return {
      tool,
      distanceMode,
      areaMode,
      step: currentStep(),
      draftPoints: draft.points.length,
      canFinish: canFinish(),
      items: [...entries.values()].map((e) => e.item),
      selectedId,
      settings,
    }
  }

  function emit(): void {
    snapshot = buildSnapshot()
    for (const l of listeners) { try { l() } catch { /* a broken listener must not stop the rest */ } }
  }

  function emitHover(): void {
    for (const l of hoverListeners) { try { l() } catch { /* ok */ } }
  }

  function currentStep(): MeasureStep {
    const n = draft.points.length
    switch (tool) {
      case 'none': return 'idle'
      case 'point': return 'first-point'
      case 'distance':
        if (distanceMode === 'perpendicular') return draft.plane ? 'perpendicular-target' : 'pick-plane-face'
        return n === 0 ? 'first-point' : 'second-point'
      case 'path': return n === 0 ? 'first-point' : 'next-point'
      case 'area':
        if (areaMode === 'face') return 'pick-face'
        return n === 0 ? 'first-point' : 'next-point'
      case 'angle': return n === 0 ? 'first-point' : n === 1 ? 'angle-vertex' : 'angle-end'
    }
  }

  function canFinish(): boolean {
    if (tool === 'path') return draft.points.length >= 2
    if (tool === 'area' && areaMode === 'polygon') return draft.points.length >= 3
    return false
  }

  // ── Camera signature: a hover taken before the view changed is stale ────────
  function cameraSignature(): string {
    const c = deps.getCamera()
    c.updateMatrixWorld()
    const e = c.matrixWorld.elements
    const proj = c.projectionMatrix.elements
    return `${e[12].toFixed(4)},${e[13].toFixed(4)},${e[14].toFixed(4)},${e[8].toFixed(4)},${e[9].toFixed(4)},${e[10].toFixed(4)},${proj[0].toFixed(5)},${proj[5].toFixed(5)}`
  }

  // ── Picking ──────────────────────────────────────────────────────────────────

  function pickOptions(): PickOptions {
    if (tool === 'area' && areaMode === 'face') return { snaps: null, wantFace: true }
    if (tool === 'distance' && distanceMode === 'perpendicular' && !draft.plane) return { snaps: null, wantFace: true }
    return { snaps: settings.snaps }
  }

  let picking = false
  let pickQueued = false
  let pointer: { x: number; y: number } | null = null

  function schedulePick(): void {
    if (picking) { pickQueued = true; return }
    const at = pointer
    if (!at) return
    picking = true
    const toolAtStart = tool
    void deps.picker.pick(at.x, at.y, pickOptions()).then((result) => {
      picking = false
      if (tool !== toolAtStart || tool === 'none') return
      // Only the latest cursor position matters; an older answer is dropped
      // unless it is all we have.
      if (!pickQueued || !pointer || (pointer.x === at.x && pointer.y === at.y)) {
        lastPick = result ? { pick: result, cursor: at, camera: cameraSignature() } : null
        applyHover()
      }
      if (pickQueued) { pickQueued = false; schedulePick() }
    }, () => { picking = false })
  }

  /** Derive what a click would place from the last pick and the modifiers. */
  function applyHover(): void {
    if (!lastPick || tool === 'none') {
      hover = null
      renderDraft()
      publishHud()
      return
    }
    const { pick, cursor } = lastPick
    let point = pick.point.clone()
    let axis: IfcAxis | null = null
    let closing = false
    const anchor = draft.points[draft.points.length - 1]
    const lockable = tool === 'distance' ? distanceMode === 'point' : tool === 'path' || tool === 'area' && areaMode === 'polygon' || tool === 'angle'
    if (anchor && shiftDown && lockable) {
      const locked = M.lockToAxis(anchor, point)
      point = v3(locked.point)
      axis = locked.axis
    }
    if (tool === 'area' && areaMode === 'polygon' && draft.points.length >= 3) {
      const first = deps.picker.project(draft.points[0])
      if (first && Math.hypot(first.x - cursor.x, first.y - cursor.y) <= CLOSE_PX) {
        closing = true
        point = draft.points[0].clone()
        axis = null
      }
    }
    hover = { pick, point, axis, closing, cursor, camera: lastPick.camera }
    renderDraft()
    publishHud()
  }

  function liveValue(): MeasureHover['live'] {
    if (!hover) return null
    const p = hover.point
    const n = draft.points.length
    switch (tool) {
      case 'distance':
        if (distanceMode === 'perpendicular') {
          if (!draft.plane) return null
          return { kind: 'length', value: Math.abs(p.clone().sub(draft.plane.point).dot(draft.plane.normal)) }
        }
        return n === 1 ? { kind: 'length', value: draft.points[0].distanceTo(p) } : null
      case 'path':
        if (n === 0) return null
        return { kind: 'length', value: M.pathLength([...draft.points, p]).total }
      case 'area':
        if (areaMode === 'face') {
          const face = hover.pick.face
          return face && face.length >= 3 ? { kind: 'area', value: M.polygonArea(face) } : null
        }
        if (n < 2) return n === 1 ? { kind: 'length', value: draft.points[0].distanceTo(p) } : null
        return { kind: 'area', value: M.polygonArea(hover.closing ? draft.points : [...draft.points, p]) }
      case 'angle':
        return n === 2 ? { kind: 'angle', value: M.angleAt(draft.points[0], draft.points[1], p) } : null
      default:
        return null
    }
  }

  function publishHud(): void {
    if (!hover || tool === 'none') {
      if (hudHover !== null) { hudHover = null; emitHover() }
      return
    }
    const screen = deps.picker.project(hover.point)
    if (!screen) {
      if (hudHover !== null) { hudHover = null; emitHover() }
      return
    }
    hudHover = {
      clientX: screen.x,
      clientY: screen.y,
      kind: hover.closing ? 'vertex' : hover.pick.kind,
      axis: hover.axis,
      live: liveValue(),
      closing: hover.closing,
    }
    emitHover()
  }

  // ── Draft rendering ──────────────────────────────────────────────────────────

  function toolColor(): number {
    if (tool === 'none') return OVERLAY_COLORS.distance
    return KIND_COLOR[tool]
  }

  function hideDraft(): void {
    for (const o of [draftStroke, rubber, draftDots, draftFill, draftArc, edgeHighlight, faceFill, faceOutline, planeFill, planeOutline]) {
      o.object.visible = false
    }
  }

  function renderDraft(): void {
    hideDraft()
    if (tool === 'none') return
    const color = toolColor()
    const pts = draft.points
    const h = hover

    draftStroke.setColor(color)
    draftDots.setColor(color)

    // Snap feedback: the edge or face the cursor has locked onto.
    if (h?.pick.edge && (h.pick.kind === 'edge' || h.pick.kind === 'midpoint')) {
      edgeHighlight.setPoints(h.pick.edge)
    }
    const wantsFace = (tool === 'area' && areaMode === 'face') || (tool === 'distance' && distanceMode === 'perpendicular' && !draft.plane)
    if (wantsFace && h?.pick.face && h.pick.face.length >= 3) {
      faceFill.setPolygon(h.pick.face)
      faceOutline.setPoints(h.pick.face)
    }

    // Perpendicular: keep the reference plane on screen while aiming at the target.
    if (tool === 'distance' && distanceMode === 'perpendicular' && draft.plane) {
      const outline = draft.plane.face && draft.plane.face.length >= 3 ? draft.plane.face : null
      if (outline) { planeFill.setPolygon(outline); planeOutline.setPoints(outline) }
      if (h) {
        const foot = v3(M.perpendicularFoot(h.point, draft.plane.point, draft.plane.normal))
        rubber.setColor(color)
        rubber.setDashScale(deps.picker.worldPerPixel(foot))
        rubber.setPoints([foot, h.point])
        draftDots.setPoints([foot, h.point])
      } else {
        draftDots.setPoints([draft.plane.point])
      }
      return
    }

    if (pts.length > 0) {
      draftStroke.setPoints(pts)
      draftDots.setPoints(pts)
    }
    if (h && pts.length > 0) {
      const last = pts[pts.length - 1]
      rubber.setColor(h.axis ? AXIS_COLOR[h.axis] : OVERLAY_COLORS.preview)
      rubber.setDashScale(deps.picker.worldPerPixel(h.point))
      rubber.setPoints([last, h.point])
      if (tool === 'area' && areaMode === 'polygon' && pts.length >= 2) {
        const poly = h.closing ? pts : [...pts, h.point]
        draftFill.setColor(color)
        draftFill.setPolygon(poly)
      }
      if (tool === 'angle' && pts.length === 2) {
        draftArc.setPoints(arcPoints(pts[0], pts[1], h.point))
      }
    }
  }

  // ── Items ────────────────────────────────────────────────────────────────────

  function arcPoints(a: THREE.Vector3, vertex: THREE.Vector3, c: THREE.Vector3): THREE.Vector3[] {
    const u = a.clone().sub(vertex)
    const w = c.clone().sub(vertex)
    const lu = u.length()
    const lw = w.length()
    if (lu < 1e-9 || lw < 1e-9) return []
    const r = Math.min(lu, lw) * 0.32
    u.normalize(); w.normalize()
    const theta = Math.acos(Math.min(1, Math.max(-1, u.dot(w))))
    let axis = new THREE.Vector3().crossVectors(u, w)
    if (axis.lengthSq() < 1e-12) {
      // Straight angle: any perpendicular will do as the arc's plane.
      axis = Math.abs(u.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(u) : new THREE.Vector3(1, 0, 0).cross(u)
    }
    axis.normalize()
    const out: THREE.Vector3[] = []
    const steps = Math.max(8, Math.ceil(theta / (Math.PI / 48)))
    for (let i = 0; i <= steps; i++) {
      const q = new THREE.Quaternion().setFromAxisAngle(axis, (theta * i) / steps)
      out.push(vertex.clone().add(u.clone().applyQuaternion(q).multiplyScalar(r)))
    }
    return out
  }

  function labelAnchor(item: MeasureItem): THREE.Vector3 {
    const p = item.points.map(v3)
    switch (item.kind) {
      case 'distance':
        return p[0].clone().add(p[1]).multiplyScalar(0.5)
      case 'path': {
        // The middle of the longest leg: the most room for a tag.
        let best = 1
        for (let i = 1; i < p.length; i++) if (p[i].distanceTo(p[i - 1]) > p[best].distanceTo(p[best - 1])) best = i
        return p[best].clone().add(p[best - 1]).multiplyScalar(0.5)
      }
      case 'area': {
        const c = new THREE.Vector3()
        for (const q of p) c.add(q)
        return c.multiplyScalar(1 / p.length)
      }
      case 'angle': {
        const arc = arcPoints(p[0], p[1], p[2])
        return arc.length ? arc[Math.floor(arc.length / 2)].clone().sub(p[1]).multiplyScalar(1.35).add(p[1]) : p[1]
      }
      case 'point':
        return p[0]
    }
  }

  function labelText(item: MeasureItem): string {
    switch (item.kind) {
      case 'distance':
        return `${item.perpendicular ? '⊥ ' : ''}${M.formatLength(item.value, settings)}`
      case 'path':
        return `Σ ${M.formatLength(item.value, settings)}`
      case 'point':
        return [
          `X ${M.formatCoordinate(item.coords.x, settings)}`,
          `Y ${M.formatCoordinate(item.coords.y, settings)}`,
          `Z ${M.formatCoordinate(item.coords.z, settings)}`,
        ].join('\n')
      default:
        return M.formatItemValue(item, settings)
    }
  }

  function buildVisuals(item: MeasureItem): ItemVisuals {
    const group = new THREE.Group()
    group.name = `measure-${item.id}`
    const color = KIND_COLOR[item.kind]
    const p = item.points.map(v3)
    const strokes: Stroke[] = []
    let fill: Fill | null = null

    if (item.kind === 'distance' || item.kind === 'path') {
      const s = new Stroke({ color, width: 2.5 })
      s.setPoints(p)
      strokes.push(s)
    } else if (item.kind === 'area') {
      fill = new Fill(color, 0.2)
      fill.setPolygon(p)
      group.add(fill.object)
      const s = new Stroke({ color, width: 2.5, closed: true })
      s.setPoints(p)
      strokes.push(s)
    } else if (item.kind === 'angle') {
      const legs = new Stroke({ color, width: 2.5 })
      legs.setPoints([p[0], p[1], p[2]])
      strokes.push(legs)
      const arc = new Stroke({ color, width: 2, ghost: false })
      arc.setPoints(arcPoints(p[0], p[1], p[2]))
      strokes.push(arc)
    }
    for (const s of strokes) group.add(s.object)

    const dots = new Dots(color, item.kind === 'point' ? 11 : 8)
    dots.setPoints(p)
    group.add(dots.object)

    const label = new Label(item.kind, {
      onClick: () => select(item.id === selectedId ? null : item.id),
      onDelete: () => remove(item.id),
      onHover: (on) => setHighlighted(on ? item.id : null),
    }, { deleteTitle })
    if (item.kind === 'point') label.object.center.set(0.5, 1.2)
    label.setText(labelText(item))
    label.setPosition(labelAnchor(item))
    group.add(label.object)

    root.add(group)
    return { group, strokes, dots, fill, label, extras: null }
  }

  /** Axis legs of a distance / segment tags of a path, shown when selected. */
  function buildExtras(item: MeasureItem): ItemVisuals['extras'] {
    const strokes: Stroke[] = []
    const labels: Label[] = []
    if (item.kind === 'distance' && !item.perpendicular) {
      const a = v3(item.points[0])
      const b = v3(item.points[1])
      // X leg (scene x), then IFC Y leg (scene z), then the vertical (scene y).
      const p1 = new THREE.Vector3(b.x, a.y, a.z)
      const p2 = new THREE.Vector3(b.x, a.y, b.z)
      const legs: Array<[IfcAxis, THREE.Vector3, THREE.Vector3, number]> = [
        ['x', a, p1, item.components.dx],
        ['y', p1, p2, item.components.dy],
        ['z', p2, b, item.components.dz],
      ]
      for (const [axis, from, to, value] of legs) {
        // A leg that is the whole distance, or a rounding error of it, is noise.
        if (value < Math.max(1e-4, item.value * 0.005) || value / Math.max(item.value, 1e-9) > 0.9999) continue
        const s = new Stroke({ color: AXIS_COLOR[axis], width: 1.5, dashed: true, ghost: false })
        s.setDashScale(deps.picker.worldPerPixel(from.clone().add(to).multiplyScalar(0.5)))
        s.setPoints([from, to])
        strokes.push(s)
        const l = new Label(`axis-${axis}`, {}, { sub: true })
        l.setText(`${axis.toUpperCase()} ${M.formatLength(value, settings)}`)
        l.setPosition(from.clone().add(to).multiplyScalar(0.5))
        labels.push(l)
      }
    } else if (item.kind === 'path' && item.points.length > 2) {
      for (let i = 1; i < item.points.length; i++) {
        const l = new Label('path', {}, { sub: true })
        l.setText(M.formatLength(item.segments[i - 1], settings))
        l.setPosition(v3(item.points[i - 1]).add(v3(item.points[i])).multiplyScalar(0.5))
        labels.push(l)
      }
    } else if (item.kind === 'area') {
      const l = new Label('area', {}, { sub: true })
      l.setText(`P ${M.formatLength(item.perimeter, settings)}`)
      const c = labelAnchor(item)
      l.object.center.set(0.5, -0.6)
      l.setPosition(c)
      labels.push(l)
    }
    return strokes.length || labels.length ? { strokes, labels } : null
  }

  function disposeExtras(v: ItemVisuals): void {
    if (!v.extras) return
    for (const s of v.extras.strokes) s.dispose()
    for (const l of v.extras.labels) l.dispose()
    v.extras = null
  }

  function refreshVisual(entry: Entry): void {
    const { item, visuals } = entry
    const selected = item.id === selectedId
    const highlighted = item.id === highlightedId
    visuals.group.visible = item.visible
    const width = selected ? 3.5 : highlighted ? 3 : 2.5
    for (const s of visuals.strokes) s.setWidth(width)
    visuals.dots.setSize(selected ? 10 : item.kind === 'point' ? 11 : 8)
    visuals.fill?.setOpacity(selected ? 0.3 : highlighted ? 0.26 : 0.2)
    visuals.label.setState({ selected, hovered: highlighted })
    visuals.label.setText(labelText(item))
    visuals.label.setDeleteTitle(deleteTitle)

    const wantExtras = item.visible && (selected || (settings.showComponents && item.kind === 'distance'))
    disposeExtras(visuals)
    if (wantExtras) {
      visuals.extras = buildExtras(item)
      for (const s of visuals.extras?.strokes ?? []) visuals.group.add(s.object)
      for (const l of visuals.extras?.labels ?? []) visuals.group.add(l.object)
    }
  }

  function refreshAll(): void {
    for (const e of entries.values()) refreshVisual(e)
  }

  function addItem(item: MeasureItem): void {
    const entry: Entry = { item, visuals: buildVisuals(item) }
    entries.set(item.id, entry)
    selectedId = item.id
    refreshAll()
    emit()
  }

  function newBase<K extends MeasureKind>(kind: K, points: THREE.Vector3[]) {
    seq[kind] += 1
    return { id: nextId(), seq: seq[kind], name: null, visible: true, points: points.map(plain) }
  }

  function createDistance(a: THREE.Vector3, b: THREE.Vector3, perpendicular: boolean): void {
    const base = newBase('distance', [a, b])
    addItem({
      ...base, kind: 'distance',
      value: a.distanceTo(b),
      components: M.distanceComponents(plain(a), plain(b)),
      perpendicular,
    })
  }

  function createPath(points: THREE.Vector3[]): void {
    const base = newBase('path', points)
    const r = M.pathLength(base.points)
    addItem({ ...base, kind: 'path', value: r.total, segments: r.segments })
  }

  function createArea(points: THREE.Vector3[], source: AreaMode): void {
    const base = newBase('area', points)
    addItem({
      ...base, kind: 'area',
      value: M.polygonArea(base.points),
      perimeter: M.polygonPerimeter(base.points),
      source,
      planar: M.isPlanar(base.points),
    })
  }

  function createAngle(a: THREE.Vector3, vertex: THREE.Vector3, c: THREE.Vector3): void {
    const base = newBase('angle', [a, vertex, c])
    addItem({ ...base, kind: 'angle', value: M.angleAt(plain(a), plain(vertex), plain(c)) })
  }

  function createPoint(p: THREE.Vector3, modelId: string | null): void {
    const base = newBase('point', [p])
    const { coords, frame } = deps.toModelCoordinates(p, modelId)
    addItem({ ...base, kind: 'point', coords, frame })
  }

  // ── Placing points ───────────────────────────────────────────────────────────

  function resetDraft(): void {
    draft.points = []
    draft.plane = null
  }

  function isDuplicate(p: THREE.Vector3): boolean {
    const last = draft.points[draft.points.length - 1]
    if (!last) return false
    if (last.distanceTo(p) < 1e-6) return true
    const a = deps.picker.project(last)
    const b = deps.picker.project(p)
    return !!a && !!b && Math.hypot(a.x - b.x, a.y - b.y) < DUPLICATE_PX
  }

  function place(h: HoverState): void {
    const p = h.point.clone()
    switch (tool) {
      case 'point':
        createPoint(p, h.pick.modelId)
        break
      case 'distance':
        if (distanceMode === 'perpendicular') {
          if (!draft.plane) {
            if (!h.pick.normal) return
            draft.plane = {
              point: h.pick.surfacePoint.clone(),
              normal: h.pick.normal.clone().normalize(),
              face: h.pick.face ? h.pick.face.map((q) => q.clone()) : null,
            }
          } else {
            const foot = v3(M.perpendicularFoot(p, draft.plane.point, draft.plane.normal))
            createDistance(foot, p, true)
            resetDraft()
          }
          break
        }
        if (isDuplicate(p)) return
        draft.points.push(p)
        if (draft.points.length === 2) {
          createDistance(draft.points[0], draft.points[1], false)
          resetDraft()
        }
        break
      case 'path':
        if (isDuplicate(p)) return
        draft.points.push(p)
        break
      case 'area':
        if (areaMode === 'face') {
          const face = h.pick.face
          if (face && face.length >= 3) createArea(face, 'face')
          break
        }
        if (h.closing) { finishDraft(); return }
        if (isDuplicate(p)) return
        draft.points.push(p)
        break
      case 'angle':
        if (isDuplicate(p)) return
        draft.points.push(p)
        if (draft.points.length === 3) {
          createAngle(draft.points[0], draft.points[1], draft.points[2])
          resetDraft()
        }
        break
      case 'none':
        return
    }
    // The next preview starts from the point just placed.
    applyHover()
    emit()
  }

  // Clicks are processed in order, and a double-click's "finish" waits for the
  // clicks before it: a fresh pick is asynchronous, and finishing a polygon
  // before its last vertex has landed would drop that vertex.
  // A ceiling per task: a pick that never answers delays the next click by
  // seconds, not forever (it used to freeze the tool for the session).
  const enqueue = createTaskQueue(4000, (err) => { console.debug('[measure] input task failed:', err) })

  function click(e: MouseEvent): void {
    if (tool === 'none') return
    const at = deps.aim(e)
    shiftDown = e.shiftKey
    enqueue(async () => {
      if (tool === 'none') return
      const fresh = hover
        && Math.hypot(hover.cursor.x - at.x, hover.cursor.y - at.y) <= 3
        && hover.camera === cameraSignature()
      if (!fresh) {
        const result = await deps.picker.pick(at.x, at.y, pickOptions())
        lastPick = result ? { pick: result, cursor: at, camera: cameraSignature() } : null
        applyHover()
      }
      if (hover) place(hover)
    })
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  function setTool(next: MeasureTool): void {
    if (next === tool) return
    tool = next
    resetDraft()
    hover = null
    lastPick = null
    deps.canvas.style.cursor = tool === 'none' ? '' : 'crosshair'
    renderDraft()
    publishHud()
    emit()
  }

  function finishDraft(): void {
    if (tool === 'path' && draft.points.length >= 2) {
      createPath(draft.points)
      resetDraft()
    } else if (tool === 'area' && areaMode === 'polygon' && draft.points.length >= 3) {
      createArea(draft.points, 'polygon')
      resetDraft()
    } else {
      return
    }
    applyHover()
    emit()
  }

  function undoLastPoint(): void {
    if (draft.plane && draft.points.length === 0) {
      draft.plane = null
    } else if (draft.points.length > 0) {
      draft.points.pop()
    } else {
      return
    }
    applyHover()
    emit()
  }

  function cancelDraft(): void {
    if (draft.points.length === 0 && !draft.plane) return
    resetDraft()
    applyHover()
    emit()
  }

  function select(id: string | null): void {
    if (id !== null && !entries.has(id)) id = null
    if (id === selectedId) return
    selectedId = id
    refreshAll()
    emit()
  }

  function setHighlighted(id: string | null): void {
    if (id === highlightedId) return
    highlightedId = id
    refreshAll()
  }

  function remove(id: string): void {
    const entry = entries.get(id)
    if (!entry) return
    disposeExtras(entry.visuals)
    for (const s of entry.visuals.strokes) s.dispose()
    entry.visuals.dots.dispose()
    entry.visuals.fill?.dispose()
    entry.visuals.label.dispose()
    entry.visuals.group.removeFromParent()
    entries.delete(id)
    if (selectedId === id) selectedId = null
    if (highlightedId === id) highlightedId = null
    emit()
  }

  function clear(): void {
    for (const id of [...entries.keys()]) remove(id)
    for (const k of Object.keys(seq) as MeasureKind[]) seq[k] = 0
    resetDraft()
    applyHover()
    emit()
  }

  function hasDraft(): boolean {
    return draft.points.length > 0 || draft.plane !== null
  }

  function keyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Shift') {
      if (!shiftDown) { shiftDown = true; applyHover() }
      return false
    }
    const mod = e.ctrlKey || e.metaKey
    if (e.key === 'Escape') {
      if (hasDraft()) { cancelDraft(); return true }
      if (tool !== 'none') { setTool('none'); return true }
      if (selectedId) { select(null); return true }
      return false
    }
    if (e.key === 'Enter' && canFinish()) { finishDraft(); return true }
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      if (hasDraft()) { undoLastPoint(); return true }
      if (entries.size > 0) { removeLast(); return true }
      return false
    }
    if (e.key === 'Backspace') {
      if (hasDraft()) { undoLastPoint(); return true }
      if (selectedId) { remove(selectedId); return true }
      return false
    }
    if (e.key === 'Delete' && selectedId) { remove(selectedId); return true }
    return false
  }

  function removeLast(): void {
    const ids = [...entries.keys()]
    const last = ids[ids.length - 1]
    if (last) remove(last)
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    getHover: () => hudHover,
    subscribeHover(listener) { hoverListeners.add(listener); return () => { hoverListeners.delete(listener) } },

    setTool,
    isActive: () => tool !== 'none',
    setDistanceMode(mode) {
      if (mode === distanceMode) return
      distanceMode = mode
      resetDraft()
      lastPick = null
      applyHover()
      emit()
      if (pointer) schedulePick()
    },
    setAreaMode(mode) {
      if (mode === areaMode) return
      areaMode = mode
      resetDraft()
      lastPick = null
      applyHover()
      emit()
      if (pointer) schedulePick()
    },
    setSettings(patch) {
      settings = { ...settings, ...patch, snaps: { ...settings.snaps, ...(patch.snaps ?? {}) } }
      refreshAll()
      publishHud()
      emit()
    },
    setStrings(strings) {
      deleteTitle = strings.deleteTitle
      for (const e of entries.values()) e.visuals.label.setDeleteTitle(deleteTitle)
    },

    pointerMove(e) {
      if (tool === 'none') return
      // A held button is a camera drag: what was under the cursor is moving.
      if (e.buttons !== 0) {
        if (lastPick) { lastPick = null; applyHover() }
        return
      }
      if (e.shiftKey !== shiftDown) shiftDown = e.shiftKey
      pointer = deps.aim(e)
      schedulePick()
    },
    pointerLeave() {
      pointer = null
      if (lastPick) { lastPick = null; applyHover() }
    },
    click,
    doubleClick() {
      if (tool === 'none') return false
      enqueue(() => finishDraft())
      return true
    },
    keyDown,
    keyUp(e) {
      if (e.key === 'Shift' && shiftDown) { shiftDown = false; applyHover() }
    },
    cameraChanged() {
      if (hudHover) publishHud()
    },

    finishDraft,
    undoLastPoint,
    cancelDraft,

    select,
    setHighlighted,
    remove,
    removeLast,
    clear,
    setVisible(id, visible) {
      const entry = entries.get(id)
      if (!entry || entry.item.visible === visible) return
      entry.item = { ...entry.item, visible }
      refreshVisual(entry)
      emit()
    },
    setAllVisible(visible) {
      for (const entry of entries.values()) {
        if (entry.item.visible === visible) continue
        entry.item = { ...entry.item, visible }
        refreshVisual(entry)
      }
      emit()
    },
    rename(id, name) {
      const entry = entries.get(id)
      if (!entry) return
      const clean = name?.trim() || null
      entry.item = { ...entry.item, name: clean }
      emit()
    },
    focus(id) {
      const entry = entries.get(id)
      if (!entry) return
      const box = new THREE.Box3()
      for (const p of entry.item.points) box.expandByPoint(v3(p))
      const size = box.getSize(new THREE.Vector3()).length()
      box.expandByScalar(Math.max(size * 0.35, 0.75))
      if (!entry.item.visible) {
        entry.item = { ...entry.item, visible: true }
        refreshVisual(entry)
      }
      select(id)
      deps.frameBox(box)
    },
    paintLabels(ctx, width, height, s) {
      if (!root.visible) return false
      const camera = deps.getCamera()
      camera.updateMatrixWorld()
      const p = new THREE.Vector3()
      let painted = false
      for (const { visuals } of entries.values()) {
        for (const label of [visuals.label, ...(visuals.extras?.labels ?? [])]) {
          if (!label.isShown()) continue
          label.object.getWorldPosition(p).project(camera)
          if (!Number.isFinite(p.x) || p.z < -1 || p.z > 1) continue
          paintLabel(ctx, label, ((p.x + 1) / 2) * width, ((1 - p.y) / 2) * height, s)
          painted = true
        }
      }
      return painted
    },
    hideForCapture() {
      const was = root.visible
      root.visible = false
      return () => { root.visible = was }
    },
    dispose() {
      clear()
      for (const o of [draftStroke, rubber, draftDots, draftFill, draftArc, edgeHighlight, faceFill, faceOutline, planeFill, planeOutline]) o.dispose()
      root.removeFromParent()
      listeners.clear()
      hoverListeners.clear()
    },
  }
}
