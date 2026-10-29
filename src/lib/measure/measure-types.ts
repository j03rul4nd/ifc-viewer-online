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
export type MeasureToolId = 'distance' | 'path' | 'area' | 'angle' | 'point' | 'dimension'

/** How a dimension reads its points — see dimension-math. */
export type { DimensionMode, DimensionTerminator } from './dimension-math'
import type { DimensionMode, DimensionTerminator } from './dimension-math'
export type MeasureTool = 'none' | MeasureToolId

/**
 * Distance between two picked points, or from a picked point to the PLANE of a
 * picked face. The second is the one a clearance check actually needs: two
 * walls are never measured at exactly opposite points by hand.
 */
export type DistanceMode = 'point' | 'perpendicular' | 'elements' | 'headroom' | 'route'

/** How a route travels outdoors (indoors it is always on foot). */
export type RouteMode = 'foot' | 'bike' | 'car'

/** One stage of a route: a walk on a storey, stairs, a lift, the streets, the door between. */
export interface RouteLeg {
  kind: 'walk' | 'stairs' | 'lift' | 'street' | 'door'
  storey?: string
  from?: string
  to?: string
  mode?: RouteMode
  metres: number
  seconds: number
  /** Streets taken, in order (outdoor legs). */
  streets?: Array<{ name: string | null; metres: number }>
  /** Metres where the model had no floor or no door and the route had to guess. */
  guessedMetres?: number
}

export interface RoutePlan {
  points: Vec3[]
  metres: number
  seconds: number
  legs: RouteLeg[]
}

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
  /** How dimension lines end: architectural tick, arrow or dot (dimension style). */
  dimTerminator: DimensionTerminator
}

export const DEFAULT_MEASURE_SETTINGS: MeasureSettings = {
  units: 'm',
  precision: 2,
  snaps: { vertex: true, midpoint: true, edge: true },
  showComponents: false,
  locale: 'en',
  dimTerminator: 'tick',
}

export type IfcAxis = 'x' | 'y' | 'z'

/** Distance split into IFC axes. `horizontal` is the plan length (XY). */
export interface DistanceComponents {
  dx: number
  dy: number
  dz: number
  horizontal: number
}

/** What a requirement compares against (see checks.ts). */
export type CheckTarget = 'value' | 'slope' | 'height' | 'volume'

/** "≥ 1,20 m", "≤ 8 %", "89,5–90,5°". SI: metres, m², m³, degrees or percent. */
export interface Requirement {
  op: 'min' | 'max' | 'range'
  min: number | null
  max: number | null
  target: CheckTarget
}

/** What a hit on the map was (mirrors geo-types.MapMeasureHit; no geo import here). */
export type MapRef =
  | { kind: 'building'; id: string | null; name?: string; label?: string; heightM?: number; heightBasis?: 'height' | 'levels' | 'guess' }
  | { kind: 'terrain' }

/**
 * What one end of a measurement stands on — so a list over three federated
 * models and a city says "Structure → OSM: Torre Mapfre", not just a number.
 */
export interface Anchor {
  /** File name of the IFC model under the point. */
  model?: string
  /** The OSM building or the relief under the point. */
  map?: MapRef
}

/** WGS84 position of a point on a georeferenced scene, and its elevation when known. */
export interface GeoPoint { lat: number; lon: number; elevationM: number | null }

interface ItemBase {
  id: string
  /** 1-based number within its kind, fixed at creation — "Distance 3" stays 3. */
  seq: number
  /** Set when the person renamed it; otherwise the panel names it by kind + seq. */
  name: string | null
  visible: boolean
  /** Scene-space points (three axes). */
  points: Vec3[]
  /** A rule the value must meet; the panel shows pass/fail and exports it. */
  requirement?: Requirement | null
  /** Areas only: height of the prism (slab, excavation, room) → volume. Metres. */
  extrusion?: number | null
  /** Free text the person attaches (where, why, to whom). */
  note?: string | null
  /** What each point stands on, parallel to `points` (absent when unknown). */
  anchors?: (Anchor | null)[]
}

export interface DistanceItem extends ItemBase {
  kind: 'distance'
  value: number
  components: DistanceComponents
  /** Measured to the plane of a face rather than point to point. */
  perpendicular: boolean
  /**
   * How the two points were found, when not clicked: `elements` = the closest
   * points between two elements' geometry (the clear gap); `headroom` = a
   * vertical ray from a floor (or ceiling) to the next surface.
   */
  source?: 'elements' | 'headroom'
  /** Elements only: they touch or cross — a clash, distance 0. */
  clash?: boolean
  /** Elements only: the search hit its budget; the value is an upper bound. */
  approximate?: boolean
}

export interface PathItem extends ItemBase {
  kind: 'path'
  value: number
  segments: number[]
  /** A route found by the tool (Distance → Route), not traced by hand. */
  route?: {
    mode: RouteMode
    seconds: number
    metres: number
    legs: RouteLeg[]
    /** What was asked, so the route can be recomputed in another mode. */
    request: { from: Vec3; to: Vec3; fromAnchor: Anchor | null; toAnchor: Anchor | null }
  }
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
  /** On a georeferenced scene: latitude, longitude and elevation above sea level. */
  geo?: GeoPoint | null
}

/**
 * A drawing dimension (cota): aligned, chained, from a baseline, a level mark
 * or a radius. `value` is the headline (total, last level, radius); `parts`
 * the bays / running distances / levels / [radius, diameter].
 */
export interface DimensionItem extends ItemBase {
  kind: 'dimension'
  mode: DimensionMode
  value: number
  parts: number[]
  /** Radius: the arc's centre. */
  center?: Vec3 | null
  /** Toward the viewer when it was drawn: which side the dimension line sits on. */
  facing?: Vec3 | null
}

export type MeasureItem = DistanceItem | PathItem | AreaItem | AngleItem | PointItem | DimensionItem
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
  | 'element-a'
  | 'element-b'
  | 'headroom-point'
  | 'route-start'
  | 'route-end'

export interface MeasureSnapshot {
  tool: MeasureTool
  distanceMode: DistanceMode
  areaMode: AreaMode
  dimensionMode: DimensionMode
  step: MeasureStep
  /** Points placed in the measurement being drawn. */
  draftPoints: number
  /** Enough points to finish a path/area right now. */
  canFinish: boolean
  items: readonly MeasureItem[]
  selectedId: string | null
  settings: MeasureSettings
  /** Why the last click made nothing, for the panel to say — cleared on the next one. */
  notice: MeasureNotice | null
  /** An asynchronous measurement (element gap, clear height, route) is being computed. */
  busy: boolean
  /** Travel mode for the next route. */
  routeMode: RouteMode
}

export type MeasureNotice = 'no-surface' | 'no-element' | 'same-element' | 'no-geometry'
  | 'route-no-map' | 'route-no-network' | 'route-no-path' | 'route-no-indoor' | 'route-too-far' | 'route-unavailable'

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
