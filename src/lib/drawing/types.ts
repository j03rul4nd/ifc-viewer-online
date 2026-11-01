// ─── Technical drawings: the data model ───────────────────────────────────────
// A drawing is a flat list of 2D entities on named layers, plus an optional
// page picture (a PDF is a picture until someone reads its vectors, see
// docs/DRAWINGS.md). Every importer flattens to this; every exporter reads it.
// No three.js, no DOM: this and everything pure in lib/drawing runs in tests.

export interface Pt { x: number; y: number }

/** Drawing → model: uniform scale, then rotation, then translation. */
export interface Placement { scale: number; rotation: number; x: number; y: number }

export const IDENTITY: Placement = { scale: 1, rotation: 0, x: 0, y: 0 }

interface Base {
  id: number
  layer: string
  /** '#rrggbb', or null to follow the layer. */
  color: string | null
}

export interface LineEntity extends Base { kind: 'line'; a: Pt; b: Pt }
export interface PolylineEntity extends Base { kind: 'polyline'; points: Pt[]; closed: boolean }
export interface CircleEntity extends Base { kind: 'circle'; c: Pt; r: number }
/** Angles in radians, counter-clockwise from start to end. */
export interface ArcEntity extends Base { kind: 'arc'; c: Pt; r: number; start: number; end: number }
export interface TextEntity extends Base { kind: 'text'; at: Pt; height: number; rotation: number; text: string; align: 'left' | 'center' | 'right' }
/** A solid polygon: SOLID, 3DFACE, solid HATCH. */
export interface FillEntity extends Base { kind: 'fill'; points: Pt[] }
export interface PointEntity extends Base { kind: 'point'; at: Pt }

export type Entity = LineEntity | PolylineEntity | CircleEntity | ArcEntity | TextEntity | FillEntity | PointEntity

/** Entity without identity: what parsers and tools produce before it joins a drawing. */
export type NewEntity = Entity extends infer E ? E extends Entity ? Omit<E, 'id'> : never : never

export interface Layer {
  name: string
  color: string
  visible: boolean
  locked: boolean
}

/** A rendered PDF page, in drawing units (1 unit = 1 PDF point until calibrated). */
export interface PageImage {
  /** Data URL (image/png). Stays in this browser; nothing uploads it. */
  url: string
  width: number
  height: number
  pixelWidth: number
  pixelHeight: number
  pageNumber: number
  pageCount: number
}

export type DrawingSource = 'dxf' | 'pdf' | 'plan' | 'section' | 'blank'

export interface Drawing {
  id: string
  name: string
  source: DrawingSource
  layers: Layer[]
  entities: Entity[]
  page?: PageImage
  placement: Placement
  /** Metres per drawing unit, when the file or a calibration says so. */
  metresPerUnit: number | null
  visible: boolean
  /** Also drawn in the 3D scene, at this height (metres, IFC Z). */
  in3d: boolean
  elevation: number
  /** Entity types the importer could not read, with counts. Reported, never hidden. */
  skipped: Record<string, number>
}

export interface Bounds2 { minX: number; minY: number; maxX: number; maxY: number }

export const toModel = (p: Placement, q: Pt): Pt => {
  const c = Math.cos(p.rotation) * p.scale
  const s = Math.sin(p.rotation) * p.scale
  return { x: c * q.x - s * q.y + p.x, y: s * q.x + c * q.y + p.y }
}

export const toDrawing = (p: Placement, q: Pt): Pt => {
  const dx = q.x - p.x
  const dy = q.y - p.y
  const c = Math.cos(-p.rotation) / p.scale
  const s = Math.sin(-p.rotation) / p.scale
  return { x: c * dx - s * dy, y: s * dx + c * dy }
}

/** The placement that takes a1→b1 and a2→b2 (the two-point alignment). Null when a1 = a2. */
export function placementFromPairs(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Placement | null {
  const ax = a2.x - a1.x
  const ay = a2.y - a1.y
  const la = Math.hypot(ax, ay)
  const lb = Math.hypot(b2.x - b1.x, b2.y - b1.y)
  if (la < 1e-12 || lb < 1e-12) return null
  const scale = lb / la
  const rotation = Math.atan2(b2.y - b1.y, b2.x - b1.x) - Math.atan2(ay, ax)
  const c = Math.cos(rotation) * scale
  const s = Math.sin(rotation) * scale
  return { scale, rotation, x: b1.x - (c * a1.x - s * a1.y), y: b1.y - (s * a1.x + c * a1.y) }
}

/** Points that describe an entity's reach (arcs and circles by their box). */
export function entityExtent(e: Entity): Pt[] {
  switch (e.kind) {
    case 'line': return [e.a, e.b]
    case 'polyline': case 'fill': return e.points
    case 'circle': case 'arc': return [{ x: e.c.x - e.r, y: e.c.y - e.r }, { x: e.c.x + e.r, y: e.c.y + e.r }]
    case 'text': return [e.at, { x: e.at.x + Math.cos(e.rotation) * e.height * e.text.length * 0.6, y: e.at.y + Math.sin(e.rotation) * e.height * e.text.length * 0.6 + e.height }]
    case 'point': return [e.at]
  }
}

export function drawingBounds(d: Pick<Drawing, 'entities' | 'page'>): Bounds2 | null {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
  const add = (p: Pt) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  for (const e of d.entities) for (const p of entityExtent(e)) add(p)
  if (d.page) { add({ x: 0, y: 0 }); add({ x: d.page.width, y: d.page.height }) }
  return minX === Infinity ? null : { minX, minY, maxX, maxY }
}

/**
 * The bounding box most of a drawing lives in: real CAD files carry a stray
 * entity at 0,0 or a km away, and fitting to it shows an empty screen.
 */
export function robustBounds(d: Pick<Drawing, 'entities' | 'page'>): Bounds2 | null {
  const full = drawingBounds(d)
  if (!full || d.entities.length < 50) return full
  const xs: number[] = []
  const ys: number[] = []
  const step = Math.max(1, Math.floor(d.entities.length / 20000))
  for (let i = 0; i < d.entities.length; i += step) {
    const p = entityExtent(d.entities[i])[0]
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) { xs.push(p.x); ys.push(p.y) }
  }
  if (xs.length < 50) return full
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b)
  const q = (v: number[], f: number) => v[Math.floor((v.length - 1) * f)]
  const pad = (lo: number, hi: number) => (hi - lo) * 0.5 || 1
  const px = pad(q(xs, 0.02), q(xs, 0.98))
  const py = pad(q(ys, 0.02), q(ys, 0.98))
  return {
    minX: Math.max(full.minX, q(xs, 0.02) - px), maxX: Math.min(full.maxX, q(xs, 0.98) + px),
    minY: Math.max(full.minY, q(ys, 0.02) - py), maxY: Math.min(full.maxY, q(ys, 0.98) + py),
  }
}

/** Only what is on a layer that is switched on: what fitting should frame. */
export function shownEntities<E extends { layer: string }>(entities: E[], layers: Layer[]): E[] {
  const off = new Set(layers.filter((l) => !l.visible).map((l) => l.name))
  return off.size ? entities.filter((e) => !off.has(e.layer)) : entities
}

/** Turn an arc into points, for anything that only speaks polylines. */
export function arcPoints(c: Pt, r: number, start: number, end: number, tolerance = r / 200): Pt[] {
  let sweep = end - start
  while (sweep <= 0) sweep += Math.PI * 2
  const dt = r > tolerance ? 2 * Math.acos(1 - Math.min(1, tolerance / r)) : Math.PI / 2
  const n = Math.max(2, Math.min(256, Math.ceil(sweep / Math.max(dt, 0.01))))
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = start + (sweep * i) / n
    out.push({ x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) })
  }
  return out
}

/** Any entity as polylines in drawing units (text excluded: callers treat it apart). */
export function entityPolylines(e: Entity): { points: Pt[]; closed: boolean }[] {
  switch (e.kind) {
    case 'line': return [{ points: [e.a, e.b], closed: false }]
    case 'polyline': return [{ points: e.points, closed: e.closed }]
    case 'fill': return [{ points: e.points, closed: true }]
    case 'circle': return [{ points: arcPoints(e.c, e.r, 0, Math.PI * 2), closed: true }]
    case 'arc': return [{ points: arcPoints(e.c, e.r, e.start, e.end), closed: false }]
    default: return []
  }
}

/** Layer colours for generated plans and new layers: distinct on dark and on paper. */
export const LAYER_PALETTE = ['#e6e6e6', '#ff5a5a', '#4cc38a', '#4aa8ff', '#f5c04a', '#c58cff', '#3fd0d0', '#ff9a4a']
