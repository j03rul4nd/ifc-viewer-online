// ─── Sketch studio: the document ──────────────────────────────────────────────
// A sketch is a set of pages; a page holds layers of strokes that live in 3D,
// each drawn on whatever plane was active at the time. Everything here is plain
// data, compared by identity: an edit replaces what it touches and shares the
// rest, which is what makes undo and the renderer's diff cheap.
// docs/SKETCH_STUDIO.md.

export type Vec3 = readonly [number, number, number]

/** A drawing plane: a point on it and two orthonormal directions along it. */
export interface SketchPlane {
  origin: Vec3
  u: Vec3
  v: Vec3
}

export type BrushKind = 'pen' | 'pencil' | 'marker'

export interface Stroke {
  id: string
  brush: BrushKind
  /** #rrggbb */
  color: string
  /** Screen pixels at full pressure. Strokes keep their weight at any zoom. */
  width: number
  /** x, y, z, pressure (0..1) per point. */
  points: Float32Array
}

export interface SketchLayer {
  id: string
  name: string
  visible: boolean
  locked: boolean
  strokes: readonly Stroke[]
}

/** A reference image set into the scene, on the plane it was placed on. */
export interface PlacedImage {
  id: string
  imageId: string
  plane: SketchPlane
  /** World units. */
  width: number
  height: number
  opacity: number
}

export type CameraMode = 'perspective' | 'orthographic'

export interface OrbitState {
  target: Vec3
  /** Around the vertical axis, radians. */
  azimuth: number
  /** Above the horizon, radians. */
  elevation: number
  distance: number
  mode: CameraMode
}

export interface SavedView {
  id: string
  orbit: OrbitState
  plane: SketchPlane
  /** A small data URL, so the strip needs no renderer to show it. */
  thumb: string
}

export interface SketchPage {
  id: string
  layers: readonly SketchLayer[]
  activeLayerId: string
  placed: readonly PlacedImage[]
  views: readonly SavedView[]
  thumb: string
}

export type PaperKind = 'warm' | 'white' | 'night'

export interface SketchDoc {
  version: 1
  pages: readonly SketchPage[]
  activePageId: string
  paper: PaperKind
}

/** A reference image the user brought in. The bytes live in IndexedDB. */
export interface ReferenceImage {
  id: string
  name: string
  width: number
  height: number
  blob: Blob
}
