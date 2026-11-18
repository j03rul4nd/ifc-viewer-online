// ─── measure-types ────────────────────────────────────────────────────────────
// The vocabulary shared by the measurement engine (three.js, lib/measure) and
// the panel that drives it (React). Plain data only: nothing here imports three,
// so the panel can format and list measurements without touching the scene.
//
// AXES. Everything a person reads is in IFC axes — X east, Y north, Z up — and
// everything the scene stores is in three's axes, where Y is up. The two meet in
// exactly one function (`toIfcAxes` in measure-math). Mixing them silently is how
// a "height" ends up reported as a depth.

export interface Vec3 { x: number; y: number; z: number }

/** The tools a person can pick. `none` is ordinary navigation and selection. */
export type MeasureToolId = 'distance' | 'path' | 'area' | 'angle' | 'point'
export type MeasureTool = 'none' | MeasureToolId

/**
 * Distance between two picked points, or from a picked point to the PLANE of a
 * picked face. The second is the one a clearance check actually needs: two
 * walls are never measured at exactly opposite points by hand.
 */
export type DistanceMode = 'point' | 'perpendicular'

/** An area traced vertex by vertex, or the area of one face in a single click. */
export type AreaMode = 'polygon' | 'face'

export type LengthUnit = 'm' | 'cm' | 'mm' | 'ft'

/**
 * What the cursor locked onto. Shown to the person, because a measurement they
 * cannot see the anchor of is a measurement they cannot trust.
 */
export type SnapKind = 'vertex' | 'midpoint' | 'edge' | 'face' | 'cloud' | 'surface'

export interface SnapSettings {
  vertex: boolean
  midpoint: boolean
  edge: boolean
}

export interface MeasureSettings {
  units: LengthUnit
  /** Decimals for metric units; fraction of an inch for feet (see formatLength). */
  precision: 0 | 1 | 2 | 3
  snaps: SnapSettings
  /** Draw the X/Y/Z legs of every distance, not just the selected one. */
  showComponents: boolean
  /** BCP-47 tag used for the decimal separator. */
  locale: string
}

export const DEFAULT_MEASURE_SETTINGS: MeasureSettings = {
  units: 'm',
  precision: 2,
  snaps: { vertex: true, midpoint: true, edge: true },
  showComponents: false,
  locale: 'en',
}

export type IfcAxis = 'x' | 'y' | 'z'

/** Distance split into IFC axes. `horizontal` is the plan length (XY). */
export interface DistanceComponents {
  dx: number
  dy: number
  dz: number
  horizontal: number
}

interface ItemBase {
  id: string
  /** 1-based number within its kind, fixed at creation — "Distance 3" stays 3. */
  seq: number
  /** Set when the person renamed it; otherwise the panel names it by kind + seq. */
  name: string | null
  visible: boolean
  /** Scene-space points (three axes). */
  points: Vec3[]
}

export interface DistanceItem extends ItemBase {
  kind: 'distance'
  value: number
  components: DistanceComponents
  /** Measured to the plane of a face rather than point to point. */
  perpendicular: boolean
}

export interface PathItem extends ItemBase {
  kind: 'path'
  value: number
  segments: number[]
}

export interface AreaItem extends ItemBase {
  kind: 'area'
  value: number
  perimeter: number
  source: AreaMode
  /** False when the traced vertices do not lie on one plane (value is projected). */
  planar: boolean
}

export interface AngleItem extends ItemBase {
  kind: 'angle'
  /** Degrees, 0–180. */
  value: number
}

export interface PointItem extends ItemBase {
  kind: 'point'
  /** Coordinates in the picked model's own IFC frame (or the scene's, if none). */
  coords: Vec3
  /** Which frame `coords` is in — decides the caption the panel shows. */
  frame: 'model' | 'scene'
}

export type MeasureItem = DistanceItem | PathItem | AreaItem | AngleItem | PointItem
export type MeasureKind = MeasureItem['kind']

/** What the draft needs from the person next — the panel turns it into a sentence. */
export type MeasureStep =
  | 'idle'
  | 'first-point'
  | 'second-point'
  | 'next-point'
  | 'pick-face'
  | 'angle-vertex'
  | 'angle-end'
  | 'pick-plane-face'
  | 'perpendicular-target'

export interface MeasureSnapshot {
  tool: MeasureTool
  distanceMode: DistanceMode
  areaMode: AreaMode
  step: MeasureStep
  /** Points placed in the measurement being drawn. */
  draftPoints: number
  /** Enough points to finish a path/area right now. */
  canFinish: boolean
  items: readonly MeasureItem[]
  selectedId: string | null
  settings: MeasureSettings
}

/** The cursor's lock, at pointer-move rate. Kept apart from the snapshot. */
export interface MeasureHover {
  /** Client (viewport) pixels of the SNAPPED point, not of the cursor. */
  clientX: number
  clientY: number
  kind: SnapKind
  /** Axis the draft is locked to (Shift), if any. */
  axis: IfcAxis | null
  /** Live value of the measurement being drawn, when there is one. */
  live: { kind: 'length' | 'area' | 'angle'; value: number } | null
  /** The cursor is over the first vertex of an area: a click closes it. */
  closing: boolean
}
