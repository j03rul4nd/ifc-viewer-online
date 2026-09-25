// ─── overlay ──────────────────────────────────────────────────────────────────
// Drawing primitives for measurement and section gizmos: thick lines, round
// end-point dots, translucent fills and HTML labels.
//
// NEVER CLIPPED. Section planes are global renderer planes, and three applies
// global planes to every built-in material with no opt-out. A dimension drawn
// across a cut, or the handle that moves the cut, must not be sliced by it — so
// every material here is a ShaderMaterial with `clipping: false`, which is the
// one kind three leaves alone.
//
// TWO PASSES PER STROKE. A line drawn with the depth test is hidden by the model
// as soon as it runs behind a column; drawn without it, it floats over walls
// with no hint that it is behind them. So each stroke is drawn twice: solid
// where it is in view and faint where it is occluded, which reads as depth
// without losing the measurement.

import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

export const OVERLAY_COLORS = {
  distance: 0xFFB224,
  path: 0xFFB224,
  area: 0x3DD68C,
  angle: 0xF76B8A,
  point: 0xB49CFF,
  preview: 0xFFFFFF,
  highlight: 0x6CE0FF,
  axisX: 0xFF5A5A,
  axisY: 0x4CD964,
  axisZ: 0x4C8DFF,
  section: 0x6CE0FF,
} as const

/** Above the model and its selection box; below nothing that matters. */
const ORDER = { fill: 990, ghost: 995, line: 1000, dots: 1005 }

function lineMaterial(color: number, width: number, opacity: number, depthTest: boolean, dashed: boolean): LineMaterial {
  const m = new LineMaterial({
    color,
    linewidth: width,
    transparent: true,
    opacity,
    depthTest,
    depthWrite: false,
    dashed,
    dashSize: 0.12,
    gapSize: 0.08,
  })
  m.clipping = false
  m.toneMapped = false
  return m
}

export interface StrokeOptions {
  color: number
  /** CSS pixels. */
  width?: number
  dashed?: boolean
  /** Draw the faint occluded pass as well (default true). */
  ghost?: boolean
  closed?: boolean
}

/** A polyline drawn in screen-space pixels, solid where visible, faint where hidden. */
export class Stroke {
  readonly object = new THREE.Group()
  private readonly front: Line2
  private readonly back: Line2 | null
  private readonly geometry = new LineGeometry()
  private readonly frontMat: LineMaterial
  private readonly backMat: LineMaterial | null
  private closed: boolean
  private dashed: boolean

  constructor(options: StrokeOptions) {
    const width = options.width ?? 2.5
    this.closed = options.closed ?? false
    this.dashed = options.dashed ?? false
    this.frontMat = lineMaterial(options.color, width, 1, true, this.dashed)
    this.front = new Line2(this.geometry, this.frontMat)
    this.front.renderOrder = ORDER.line
    this.front.frustumCulled = false
    this.front.onBeforeRender = (renderer) => { renderer.getSize(this.frontMat.resolution) }
    this.object.add(this.front)
    if (options.ghost !== false) {
      this.backMat = lineMaterial(options.color, Math.max(1, width - 0.5), 0.32, false, this.dashed)
      this.back = new Line2(this.geometry, this.backMat)
      this.back.renderOrder = ORDER.ghost
      this.back.frustumCulled = false
      this.back.onBeforeRender = (renderer) => { renderer.getSize(this.backMat!.resolution) }
      this.object.add(this.back)
    } else {
      this.backMat = null
      this.back = null
    }
    this.object.visible = false
  }

  setPoints(points: readonly THREE.Vector3[]): void {
    const pts = this.closed && points.length > 2 ? [...points, points[0]] : points
    if (pts.length < 2) { this.object.visible = false; return }
    const flat: number[] = []
    for (const p of pts) flat.push(p.x, p.y, p.z)
    this.geometry.setPositions(flat)
    if (this.dashed) {
      this.front.computeLineDistances()
      this.back?.computeLineDistances()
    }
    this.object.visible = true
  }

  setColor(color: number): void {
    this.frontMat.color.setHex(color)
    this.backMat?.color.setHex(color)
  }

  setWidth(width: number): void {
    this.frontMat.linewidth = width
    if (this.backMat) this.backMat.linewidth = Math.max(1, width - 0.5)
  }

  /** Dash length in world units — call when the scale of the scene changes. */
  setDashScale(worldPerPx: number): void {
    if (!this.dashed) return
    for (const m of [this.frontMat, this.backMat]) {
      if (!m) continue
      m.dashSize = worldPerPx * 8
      m.gapSize = worldPerPx * 6
    }
  }

  dispose(): void {
    this.object.removeFromParent()
    this.geometry.dispose()
    this.frontMat.dispose()
    this.backMat?.dispose()
  }
}

/** Many independent segments in one draw (box edges, arrow heads). */
export class Segments {
  readonly object = new THREE.Group()
  private readonly geometry = new LineSegmentsGeometry()
  private readonly frontMat: LineMaterial
  private readonly backMat: LineMaterial | null
  private readonly front: LineSegments2
  private readonly back: LineSegments2 | null

  constructor(options: { color: number; width?: number; ghost?: boolean; opacity?: number }) {
    const width = options.width ?? 2
    this.frontMat = lineMaterial(options.color, width, options.opacity ?? 1, true, false)
    this.front = new LineSegments2(this.geometry, this.frontMat)
    this.front.renderOrder = ORDER.line
    this.front.frustumCulled = false
    this.front.onBeforeRender = (renderer) => { renderer.getSize(this.frontMat.resolution) }
    this.object.add(this.front)
    if (options.ghost !== false) {
      this.backMat = lineMaterial(options.color, Math.max(1, width - 0.5), 0.3 * (options.opacity ?? 1), false, false)
      this.back = new LineSegments2(this.geometry, this.backMat)
      this.back.renderOrder = ORDER.ghost
      this.back.frustumCulled = false
      this.back.onBeforeRender = (renderer) => { renderer.getSize(this.backMat!.resolution) }
      this.object.add(this.back)
    } else {
      this.backMat = null
      this.back = null
    }
    this.object.visible = false
  }

  /** Pairs of points: [a0, b0, a1, b1, …]. */
  setSegments(points: readonly THREE.Vector3[]): void {
    if (points.length < 2) { this.object.visible = false; return }
    const flat: number[] = []
    for (const p of points) flat.push(p.x, p.y, p.z)
    this.geometry.setPositions(flat)
    this.object.visible = true
  }

  setColor(color: number): void {
    this.frontMat.color.setHex(color)
    this.backMat?.color.setHex(color)
  }

  setWidth(width: number): void {
    this.frontMat.linewidth = width
    if (this.backMat) this.backMat.linewidth = Math.max(1, width - 0.5)
  }

  dispose(): void {
    this.object.removeFromParent()
    this.geometry.dispose()
    this.frontMat.dispose()
    this.backMat?.dispose()
  }
}

// ── Dots ──────────────────────────────────────────────────────────────────────

const DOT_VERTEX = /* glsl */`
  uniform float size;
  uniform float pixelRatio;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * pixelRatio;
  }
`
const DOT_FRAGMENT = /* glsl */`
  uniform vec3 color;
  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float r = length(c);
    if (r > 0.5) discard;
    // Dark rim so a dot stays legible on a white wall as well as a black sky.
    vec3 col = r > 0.34 ? vec3(0.004, 0.004, 0.006) : color;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

/** Screen-sized round markers at vertices. Always on top: a vertex is a target. */
export class Dots {
  readonly object: THREE.Points
  private readonly geometry = new THREE.BufferGeometry()
  private readonly material: THREE.ShaderMaterial

  constructor(color: number, sizePx = 9) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(color) },
        size: { value: sizePx },
        pixelRatio: { value: 1 },
      },
      vertexShader: DOT_VERTEX,
      fragmentShader: DOT_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    })
    this.object = new THREE.Points(this.geometry, this.material)
    this.object.renderOrder = ORDER.dots
    this.object.frustumCulled = false
    this.object.onBeforeRender = (renderer) => {
      this.material.uniforms.pixelRatio.value = renderer.getPixelRatio()
    }
    this.object.visible = false
  }

  setPoints(points: readonly THREE.Vector3[]): void {
    if (points.length === 0) { this.object.visible = false; return }
    const flat = new Float32Array(points.length * 3)
    points.forEach((p, i) => { flat[i * 3] = p.x; flat[i * 3 + 1] = p.y; flat[i * 3 + 2] = p.z })
    this.geometry.setAttribute('position', new THREE.BufferAttribute(flat, 3))
    this.geometry.computeBoundingSphere()
    this.object.visible = true
  }

  setColor(color: number): void { (this.material.uniforms.color.value as THREE.Color).setHex(color) }
  setSize(px: number): void { this.material.uniforms.size.value = px }

  dispose(): void {
    this.object.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
  }
}

// ── Fill ──────────────────────────────────────────────────────────────────────

const FILL_VERTEX = /* glsl */`
  void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const FILL_FRAGMENT = /* glsl */`
  uniform vec3 color;
  uniform float opacity;
  void main() {
    gl_FragColor = vec4(color, opacity);
    #include <colorspace_fragment>
  }
`

/**
 * Triangulate a planar 3D polygon: project it onto its own plane, let three's
 * ear-clipper do the 2D work, and keep the 3D vertices. Handles concave rooms.
 */
export function triangulatePolygon(points: readonly THREE.Vector3[]): number[] {
  if (points.length < 3) return []
  const normal = new THREE.Vector3()
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    normal.x += (a.y - b.y) * (a.z + b.z)
    normal.y += (a.z - b.z) * (a.x + b.x)
    normal.z += (a.x - b.x) * (a.y + b.y)
  }
  if (normal.lengthSq() < 1e-18) return []
  normal.normalize()
  const u = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(normal).normalize() : new THREE.Vector3(1, 0, 0).cross(normal).normalize()
  const v = normal.clone().cross(u)
  const contour = points.map((p) => new THREE.Vector2(p.dot(u), p.dot(v)))
  const tris = THREE.ShapeUtils.triangulateShape(contour, [])
  return tris.flat()
}

/** A translucent polygon fill, visible through geometry. */
export class Fill {
  readonly object: THREE.Mesh
  private readonly geometry = new THREE.BufferGeometry()
  private readonly material: THREE.ShaderMaterial

  constructor(color: number, opacity = 0.18) {
    this.material = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity } },
      vertexShader: FILL_VERTEX,
      fragmentShader: FILL_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.object = new THREE.Mesh(this.geometry, this.material)
    this.object.renderOrder = ORDER.fill
    this.object.frustumCulled = false
    this.object.visible = false
  }

  setPolygon(points: readonly THREE.Vector3[], indices?: readonly number[]): void {
    const idx = indices ?? triangulatePolygon(points)
    if (points.length < 3 || idx.length < 3) { this.object.visible = false; return }
    const flat = new Float32Array(points.length * 3)
    points.forEach((p, i) => { flat[i * 3] = p.x; flat[i * 3 + 1] = p.y; flat[i * 3 + 2] = p.z })
    this.geometry.setAttribute('position', new THREE.BufferAttribute(flat, 3))
    this.geometry.setIndex([...idx])
    this.geometry.computeBoundingSphere()
    this.object.visible = true
  }

  /** Two triangles for a quad given as four corners in order. */
  setQuad(corners: readonly THREE.Vector3[]): void {
    this.setPolygon(corners, [0, 1, 2, 0, 2, 3])
  }

  setColor(color: number): void { (this.material.uniforms.color.value as THREE.Color).setHex(color) }
  setOpacity(opacity: number): void { this.material.uniforms.opacity.value = opacity }

  dispose(): void {
    this.object.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
  }
}

// ── Labels ────────────────────────────────────────────────────────────────────

export interface LabelHandlers {
  onClick?: () => void
  onDelete?: () => void
  onHover?: (hovering: boolean) => void
}

/**
 * An HTML value tag anchored to a world point (rendered by the viewer's
 * CSS2DRenderer, so it is crisp at any zoom and costs nothing on the GPU).
 * Clicking it selects its measurement; its × deletes it.
 */
export class Label {
  readonly object: CSS2DObject
  readonly element: HTMLDivElement
  private readonly valueEl: HTMLSpanElement
  private readonly deleteEl: HTMLButtonElement | null

  constructor(kind: string, handlers: LabelHandlers = {}, options: { sub?: boolean; deleteTitle?: string } = {}) {
    const el = document.createElement('div')
    el.className = options.sub ? 'pv-mlabel pv-mlabel--sub' : 'pv-mlabel'
    el.dataset.kind = kind
    const dot = document.createElement('span')
    dot.className = 'pv-mlabel__dot'
    el.appendChild(dot)
    this.valueEl = document.createElement('span')
    this.valueEl.className = 'pv-mlabel__value'
    el.appendChild(this.valueEl)
    if (handlers.onDelete) {
      const del = document.createElement('button')
      del.type = 'button'
      del.className = 'pv-mlabel__del'
      del.textContent = '×'
      del.title = options.deleteTitle ?? ''
      del.setAttribute('aria-label', options.deleteTitle ?? 'Delete')
      del.addEventListener('pointerdown', (e) => { e.stopPropagation() })
      del.addEventListener('click', (e) => { e.stopPropagation(); handlers.onDelete?.() })
      el.appendChild(del)
      this.deleteEl = del
    } else {
      this.deleteEl = null
    }
    if (handlers.onClick) {
      el.classList.add('pv-mlabel--interactive')
      el.addEventListener('pointerdown', (e) => { e.stopPropagation() })
      el.addEventListener('click', (e) => { e.stopPropagation(); handlers.onClick?.() })
    }
    if (handlers.onHover) {
      el.addEventListener('pointerenter', () => handlers.onHover?.(true))
      el.addEventListener('pointerleave', () => handlers.onHover?.(false))
    }
    this.element = el
    this.object = new CSS2DObject(el)
    this.object.visible = false
  }

  setText(text: string): void {
    if (this.valueEl.textContent !== text) this.valueEl.textContent = text
  }

  setPosition(p: THREE.Vector3): void {
    this.object.position.copy(p)
    this.object.visible = true
  }

  setState(state: { selected?: boolean; hovered?: boolean; muted?: boolean }): void {
    this.element.classList.toggle('is-selected', !!state.selected)
    this.element.classList.toggle('is-hovered', !!state.hovered)
    this.element.classList.toggle('is-muted', !!state.muted)
  }

  setDeleteTitle(title: string): void {
    if (!this.deleteEl) return
    this.deleteEl.title = title
    this.deleteEl.setAttribute('aria-label', title)
  }

  get text(): string { return this.valueEl.textContent ?? '' }
  get kind(): string { return this.element.dataset.kind ?? '' }
  get isSub(): boolean { return this.element.classList.contains('pv-mlabel--sub') }
  get isSelected(): boolean { return this.element.classList.contains('is-selected') }

  /** Shown: its own flag and every ancestor's (what CSS2DRenderer draws). */
  isShown(): boolean {
    for (let o: THREE.Object3D | null = this.object; o; o = o.parent) if (!o.visible) return false
    return true
  }

  dispose(): void {
    this.object.removeFromParent()
    this.element.remove()
  }
}

// ── Labels in a picture ───────────────────────────────────────────────────────
// The HTML labels live in the DOM, so a screenshot of the WebGL canvas had the
// lines of every measurement and none of its numbers. These paint the same tag
// into a 2D canvas, from the same text and anchor, so a captured view carries
// its dimensions.

const LABEL_INK: Record<string, string> = {
  distance: '#FFB224', path: '#FFB224', area: '#3DD68C', angle: '#F76B8A', point: '#B49CFF',
  'axis-x': '#FF5A5A', 'axis-y': '#4CD964', 'axis-z': '#4C8DFF',
}

/**
 * Paint `label` with its anchor at canvas pixel (x, y). `s` is canvas pixels
 * per CSS pixel, so the tag keeps its on-screen size in a hi-res capture.
 */
export function paintLabel(ctx: CanvasRenderingContext2D, label: Label, x: number, y: number, s: number): void {
  const text = label.text
  if (!text) return
  const sub = label.isSub
  const ink = LABEL_INK[label.kind] ?? '#FFB224'
  const size = (sub ? 10.5 : 11.5) * s
  const lines = text.split('\n')
  ctx.save()
  ctx.font = `600 ${size}px Geist, ui-sans-serif, system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  const lineH = size * 1.3
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width))
  const dotW = sub ? 0 : 7 * s + 6 * s
  const padX = (sub ? 6 : 8) * s
  const padY = (sub ? 1 : 3) * s
  const w = padX * 2 + dotW + textW
  const h = padY * 2 + lineH * lines.length
  // Same anchoring as CSS2DObject.center: the default centres the tag.
  const cx = label.object.center.x
  const cy = label.object.center.y
  const left = x - w * cx
  const top = y - h * cy
  const r = (sub ? 6 : 8) * s
  ctx.beginPath()
  ctx.roundRect(left, top, w, h, r)
  ctx.fillStyle = sub ? 'rgba(10,10,14,0.74)' : 'rgba(10,10,14,0.86)'
  ctx.fill()
  ctx.lineWidth = Math.max(1, s)
  ctx.strokeStyle = label.isSelected ? ink : 'rgba(255,255,255,0.12)'
  ctx.stroke()
  if (!sub) {
    ctx.beginPath()
    ctx.arc(left + padX + 3.5 * s, lines.length > 1 ? top + padY + lineH / 2 : top + h / 2, 3.5 * s, 0, Math.PI * 2)
    ctx.fillStyle = ink
    ctx.fill()
  }
  ctx.fillStyle = sub ? ink : '#F2F3F5'
  lines.forEach((line, i) => {
    ctx.fillText(line, left + padX + dotW, top + padY + lineH * (i + 0.5))
  })
  ctx.restore()
}

/** Size of a screen pixel in world units at `point` — for constant-size gizmos. */
export function pixelWorldSize(camera: THREE.Camera, point: THREE.Vector3, viewportHeight: number): number {
  const persp = camera as THREE.PerspectiveCamera
  if (persp.isPerspectiveCamera) {
    const d = camera.position.distanceTo(point)
    return (2 * d * Math.tan(THREE.MathUtils.degToRad(persp.fov) / 2)) / Math.max(1, viewportHeight)
  }
  const ortho = camera as THREE.OrthographicCamera
  return (ortho.top - ortho.bottom) / (ortho.zoom || 1) / Math.max(1, viewportHeight)
}
