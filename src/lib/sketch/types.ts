// ─── Sketch studio: the document ──────────────────────────────────────────────
// A sketch is a set of pages; a page holds layers of strokes that live in 3D,
// each drawn on whatever plane was active at the time. Everything here is plain
// data, compared by identity: an edit replaces what it touches and shares the
// rest, which is what makes undo and the renderer's diff cheap.
// docs/SKETCH_STUDIO.md.

import type { LayerFilters } from './filters'

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
  /** 0..1, on top of the brush's own. Absent means 1. */
  opacity?: number
  /** x, y, z, pressure (0..1) per point. */
  points: Float32Array
}

export type LayerBlend = 'normal' | 'multiply' | 'screen' | 'add'

export interface SketchLayer {
  id: string
  name: string
  visible: boolean
  locked: boolean
  /** 0..1. Absent means 1. */
  opacity?: number
  /** Absent means normal. */
  blend?: LayerBlend
  filters?: LayerFilters
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
  /** Canvas rotation, radians. Absent means level. */
  roll?: number
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
export type GridPattern = 'dots' | 'grid' | 'lines' | 'plain'

/** Over the paper kind: a colour of one's own, the guide's pattern, a picture. */
export interface SketchBackground {
  color?: string
  pattern?: GridPattern
  /** A reference image from the library. */
  imageId?: string
}

export interface SketchDoc {
  version: 1
  pages: readonly SketchPage[]
  activePageId: string
  paper: PaperKind
  background?: SketchBackground
}

/** A reference image the user brought in. The bytes live in IndexedDB. */
export interface ReferenceImage {
  id: string
  name: string
  width: number
  height: number
  blob: Blob
  /** Where it sits on the reference board. */
  board?: { x: number; y: number; scale: number }
  /** Floating over the drawing, to look at while drawing. */
  pin?: { x: number; y: number; width: number; opacity: number; through: boolean }
}
