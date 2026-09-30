// ─── ifc-viewer-sdk.ts ────────────────────────────────────────────────────────
// Tiny, dependency-free SDK to embed the IFC viewer in a CDE, digital twin, or
// internal project tool. It mounts the viewer in an <iframe> and streams IFC
// bytes from the host app over postMessage — so the model is parsed entirely in
// the visitor's browser and never uploaded to any server.
//
//   import { IfcViewer } from "https://www.ifcvieweronline.eu/sdk/ifc-viewer.es.js"
//   const viewer = new IfcViewer("#viewer")
//   await viewer.add("project.ifc", ifcBytes)   // ifcBytes: ArrayBuffer | Uint8Array
//
// The viewer auto-discovers the app URL relative to this script, so self-hosting
// "just works". Override with the `baseUrl` option if you serve it elsewhere.

export type IfcViewerPreset = 'minimal' | 'full' | 'kiosk' | 'client'
export type CameraView = 'iso' | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'

/**
 * What a view frames when several models or scans are loaded: `auto` (default)
 * = everything visible, narrowed to the active group when the scene spans
 * distant sites; `active` = the active model; `group` = its group; `all` = all.
 */
export type CameraScope = 'auto' | 'active' | 'group' | 'all'

export interface IfcViewerOptions {
  /** App base URL. Defaults to the parent of this script's URL. */
  baseUrl?: string
  /** Chrome preset. Default 'minimal'. */
  ui?: IfcViewerPreset
  /** Run validation on load (drives the Health Score). Default true. */
  validate?: boolean
  /** Open the validation panel automatically. Default false. */
  panel?: boolean
  /**
   * Limit the tool rail to these panels, from the first frame.
   *
   * The same vocabulary as {@link IfcViewer.setPanels} and the `panels=` URL
   * parameter. Prefer this over calling `setPanels` after load: the rail is
   * built before the viewer is ready, so scoping it afterwards shows the full
   * set first and then takes tools away.
   *
   * An empty array means no rail at all. Omitting it means no opinion, and the
   * preset decides.
   */
  panels?: PanelName[]
  /** Force a UI language (e.g. 'en', 'es', 'de'). */
  lang?: string
  /** Accent colour (`#rrggbb`) to theme the viewer to your dashboard. */
  accent?: string
  /** iframe height. Number → px. Default '100%'. */
  height?: number | string
  /** iframe width. Number → px. Default '100%'. */
  width?: number | string
  /** Extra class applied to the created iframe. */
  className?: string
  title?: string
  /** Auto-load this public (CORS-enabled) IFC URL once the viewer is ready. */
  model?: string
  /**
   * Scene background from the first frame: a preset (`'white'`, `'paper'`,
   * `'blueprint'`, `'sky'`, `'studio'`), one colour (`'#f4f4f5'`) or a
   * top,bottom gradient (`'#dbeafe,#ffffff'`). Since v1.11.0.
   */
  background?: BackgroundSpec
  /**
   * Put the model on the map once it loads, from its own georeference. `true`
   * for the map alone, or the layers to add. Map tiles and OpenStreetMap come
   * from third parties — see {@link IfcViewer.setSiteContext} on consent.
   * Since v1.11.0.
   */
  map?: boolean | Array<'terrain' | 'buildings' | 'showcase'>
  /**
   * Open the sun study at this SITE-LOCAL time once the model loads:
   * `'06-21T18:00'` (every year) or `'2026-12-21T09:30'`. Only honoured when
   * the model's location is known. Since v1.11.0.
   */
  solar?: string
  /** With `solar`: light the moon too. Since v1.11.0. */
  moon?: boolean
  /** Point clouds to fetch alongside the model (CORS-enabled URLs). Since v1.11.0. */
  scans?: string[]
  /** Reject add()/addFromUrl() after this many ms. 0 disables. Default 120000. */
  loadTimeout?: number
  /** Convenience callbacks (equivalent to .on(...)). */
  onReady?: (e: ReadyEvent) => void
  onModelLoaded?: (e: ModelLoadedEvent) => void
  onModelError?: (e: ModelErrorEvent) => void
  onProgress?: (e: ModelProgressEvent) => void
}

export interface ReadyEvent {
  /** Language codes the viewer supports (for setLanguage / a language picker). */
  languages: string[]
}
export interface ModelLoadedEvent {
  modelId: string
  fileName: string
  elementCount: number
  fromCache: boolean
}
export interface ModelErrorEvent { message: string; url?: string; name?: string }
export interface ModelProgressEvent { percent: number; phase: string }
export interface ValidationCompletedEvent {
  /** Health Score 0–100, or null if not computed. */
  qualityScore: number | null
  errors: number
  warnings: number
  info: number
}
export interface ElementSelectedEvent {
  expressId: number
  modelId: string | null
  ifcType: string
  name: string
}

/** A loaded model, as returned by getModels(). */
export interface ModelSummary { id: string; fileName: string; elementCount: number }

/** Validation summary returned by getValidation(). */
export interface ValidationSummary {
  qualityScore: number | null
  errors: number
  warnings: number
  info: number
}

/** Per-model stats for dashboard charts (getStats()). */
export interface ModelStats {
  id: string
  fileName: string
  elementCount: number
  fileSize: number
  categories: Array<{ type: string; label: string; count: number }>
}
/** Every tool that can appear on the viewer's panel rail. */
export type PanelName =
  | 'properties' | 'scene' | 'measurement' | 'section' | 'plans'
  | 'map' | 'solar' | 'pointcloud' | 'mesh'

export interface PanelsResult {
  /** The panel currently open, or null when none is. */
  open: PanelName | null
  /**
   * The panels on offer right now — the chrome and the loaded content decide.
   * A tool missing from this list cannot be opened; it is not merely disabled.
   */
  available: { id: PanelName; label: string; open: boolean }[]
}

export interface StatsResult { elementCount: number; models: ModelStats[] }

/** A validation issue for a dashboard table (getIssues()). */
export interface ValidationIssue {
  ruleId: string
  severity: 'error' | 'warning' | 'info'
  expressId: number
  modelId: string | null
  ifcClass: string
  elementName: string
  message: string
  globalId: string | null
  autoFixable: boolean
}
export interface IssuesResult { qualityScore: number | null; total: number; issues: ValidationIssue[] }

/** Result of an IDS (Information Delivery Specification) check. */
export interface IdsSpecResult {
  name: string
  status: 'pass' | 'fail' | 'na'
  applicableCount: number
  passedCount: number
  failedCount: number
  failures: Array<{
    expressId: number
    ifcClass: string
    name: string
    /** IFC GlobalId (22-char GUID) of the failing element, when available (since v1.7.0). */
    globalId?: string | null
    /** Human-readable (English) failure reasons. Stable since v1.5.0. */
    reasons: string[]
    /** Structured machine-readable reasons (additive since v1.5.x). */
    reasonCodes?: Array<{ code: string; params?: Record<string, string | number> }>
  }>
  unsupported: string[]
}
export interface IdsResult {
  title?: string
  score: number
  totalSpecs: number
  passedSpecs: number
  failedSpecs: number
  naSpecs: number
  specs: IdsSpecResult[]
}

// ── EIR / BIM Validation (since v1.7.0) ───────────────────────────────────────
// Editable, data-driven validation profiles (ISO 19650-style). Compiled to IDS
// and run on the same engine, so checkEir returns the same IdsResult shape.

/** Per-rule severity. `ignored` rules are skipped (don't affect the score). */
export type EirSeverity = 'error' | 'warning' | 'info' | 'ignored'
/** Numeric comparison operator for a `numeric` rule. */
export type EirOperator = '>' | '>=' | '<' | '<=' | '='

/** A single EIR validation rule. `entity` is the IFC class it applies to. */
export type EirRule =
  & { id?: string; entity: string; predefinedType?: string; severity: EirSeverity; message?: string }
  & (
    | { type: 'entityExists' }
    | { type: 'requiredProperty'; pset?: string; property: string }
    | { type: 'requiredPropertySet'; pset: string }
    | { type: 'propertyNotEmpty'; pset?: string; property: string }
    | { type: 'propertyEquals'; pset?: string; property: string; value: string }
    | { type: 'numeric'; pset?: string; property: string; operator: EirOperator; value: number }
    | { type: 'allowedValues'; pset?: string; property: string; values: string[] }
    | { type: 'regex'; target?: 'property' | 'attribute'; pset?: string; property: string; pattern: string }
    | { type: 'classification'; system?: string; value?: string }
  )

/** A complete EIR validation profile. */
export interface EirProfile {
  id?: string
  name: string
  version?: number
  description?: string
  rules: EirRule[]
}

/** Structured IFC data returned by getElement() (name, GlobalId, property sets…). */
export interface IfcElementData {
  name: string | null
  globalId: string | null
  objectType: string | null
  tag: string | null
  storey: string | null
  propertySets: Array<{ name: string; properties: Array<{ name: string; value: unknown }> }>
  quantitySets: Array<{ name: string; quantities: Array<{ name: string; value: number | null }> }>
  [k: string]: unknown
}

export interface Vec3 { x: number; y: number; z: number }

/**
 * A point read off a scan while inspect mode is armed.
 *
 * `sourcePosition` is the point in the FILE's own coordinates — the number a
 * survey record already holds — which is why it travels alongside the scene
 * position rather than instead of it.
 */
export interface PointCloudPickedEvent {
  cloudId: string
  /** Scene metres. */
  position: { x: number; y: number; z: number }
  /** The file's own coordinates, in its own units. */
  sourcePosition: { x: number; y: number; z: number }
  /** ASPRS classification code, when the file carried one. */
  classification: number | null
  /** 0-255, when the file carried intensity. */
  intensity: number | null
  /** Distance from the camera, scene metres. */
  distance: number
}

/**
 * A feature of the OpenStreetMap surroundings, clicked in map mode.
 *
 * CONTEXT, NOT MODEL. Nothing here comes from the delivery: it is neighbourhood
 * data fetched to give the model something to stand in, it is not validated,
 * and it does not export. Treat a height from here as what it usually is — an
 * estimate — which is why `heightEstimated` is not optional.
 */
export interface MapFeaturePickedEvent {
  /** OSM element id, e.g. `way/12345`. */
  id: string
  /** `name` as mapped. Absent on most buildings, and never invented. */
  name?: string
  /** What it is, in one phrase: 'School', 'Train station'. */
  label?: string
  /** Which layer: building, water, green, bridge, tree. */
  featureKind: string
  /** Metres. */
  heightM?: number
  /** True when the height was inferred from tags rather than surveyed. */
  heightEstimated: boolean
}

// ── Presentation & analysis (since v1.11.0) ─────────────────────────────────

/** A background preset name. */
export type BackgroundPreset = 'studio' | 'white' | 'paper' | 'blueprint' | 'sky'

/**
 * A scene background: a preset name, `'#rrggbb'`, `'#top,#bottom'` (gradient),
 * or `{ top, bottom? }`.
 */
export type BackgroundSpec = BackgroundPreset | string | { preset: BackgroundPreset } | { top: string; bottom?: string }

/** The background the viewer resolved, as returned by setBackground/getBackground. */
export interface BackgroundState {
  preset: BackgroundPreset | 'custom'
  mode: 'solid' | 'gradient'
  top: string
  bottom: string
}

/** Where the camera is and what it looks at, in scene metres (Y up). */
export interface CameraState {
  position: Vec3
  target: Vec3
  direction: Vec3
  up?: Vec3
  fovDeg: number
}

/** First-person walk mode. */
export interface WalkState {
  active: boolean
  /** Metres per second at a walk. */
  speed: number
}

/** Options for {@link IfcViewer.setSolar}. Omitted fields are left alone. */
export interface SolarOptions {
  /** Start (default) or stop the study. */
  active?: boolean
  /** Site-local date: `'YYYY-MM-DD'`, or `'MM-DD'` for this year. */
  date?: string
  /** Site-local time, `'HH:MM'`. */
  time?: string
  moon?: boolean
  /** Physically-based sky dome. */
  sky?: boolean
  quality?: 'standard' | 'high'
  /**
   * Where the site is, when the IFC does not say. Without it, a model with no
   * georeference is an error — never a silent default city.
   */
  location?: { lat: number; lon: number }
}

export interface SolarState {
  active: boolean
  /** Site-local. */
  date: string
  time: string
  /** IANA zone of the site, e.g. `Europe/Madrid`. */
  timeZone: string
  moon: boolean
  sky: boolean
  quality: 'standard' | 'high'
  /** `source: 'ifc'` is the model's own georeference; `manual` was typed or passed. */
  location: { lat: number; lon: number; source: 'ifc' | 'map' | 'manual' | 'default' } | null
}

/** Options for {@link IfcViewer.setSiteContext}. Omitted fields are left alone. */
export interface SiteContextOptions {
  /** Map mode on (default) or off. */
  enabled?: boolean
  /** 3D terrain relief. */
  terrain?: boolean
  /** OpenStreetMap surroundings: buildings, water, parks, roads… */
  buildings?: boolean
  /** Per-layer switches, e.g. `{ tree: false, water: true }`. */
  layers?: Record<string, boolean>
  /** Facade fidelity of the surroundings. `showcase` adds authored props. */
  detail?: 'simple' | 'detailed' | 'showcase'
  terrainStyle?: 'imagery' | 'shaded' | 'hypsometric' | 'slope' | 'ecosystem'
  /** Terrain vertical exaggeration, 1–3. */
  exaggeration?: number
  /** Decorative cars and trains. */
  vehicles?: boolean
}

export interface SiteContextState {
  enabled: boolean
  status: string
  terrain: boolean
  buildings: boolean
  buildingsStatus: 'idle' | 'loading' | 'ready' | 'empty' | 'error'
  detail: 'simple' | 'detailed' | 'showcase'
  terrainStyle: string
  exaggeration: number
  vehicles: boolean
  placement: { lat: number; lon: number; rotationDeg: number; source: string; confidence: 'high' | 'approximate' } | null
  /** Credits for what is on screen. Show them wherever you show the map. */
  attributions: string[]
}

/** One section plane. `offset` is in IFC metres along `axis` (Z = up). */
export interface SectionPlane {
  id: string
  kind: 'axis' | 'face'
  axis: 'x' | 'y' | 'z' | null
  enabled: boolean
  offset: number
  flipped: boolean
  /** The model's extent along the axis — the offsets that cut something. */
  range: { min: number; max: number }
}

export interface SectionsState {
  planes: SectionPlane[]
  box: { enabled: boolean; ranges: Record<'x' | 'y' | 'z', { min: number; max: number }> } | null
  /** Enabled cuts, the box counting as one. */
  active: number
  /** Storeys, for plan cuts — only on getSections(). */
  levels?: Array<{ name: string; y: number }>
}

/** Options for {@link IfcViewer.addSection}. */
export interface AddSectionOptions {
  /** Cut axis in IFC terms. `z` (default) is a plan cut, `x`/`y` are sections. */
  axis?: 'x' | 'y' | 'z'
  /** Where to cut, IFC metres along the axis. Default: mid-model. */
  offset?: number
  /**
   * A plan cut at a storey — its name (case-insensitive) or index from
   * `getSections().levels`. Cuts 1.2 m above that floor. Overrides axis/offset.
   */
  level?: string | number
  /** Keep the other side. */
  flip?: boolean
}

export type MeasureTool = 'distance' | 'path' | 'area' | 'angle' | 'point'

/**
 * One measurement. `value` is always SI — metres, square metres for an area,
 * degrees for an angle — whatever unit the viewer displays; null for a point.
 */
export interface Measurement {
  id: string
  kind: MeasureTool
  /** Set when someone renamed it. */
  name: string | null
  value: number | null
  /** Areas. */
  perimeter?: number
  /** Areas: false when the traced outline is not flat (value is projected). */
  planar?: boolean
  /** Distances, split into IFC axes; `horizontal` is the plan length. */
  components?: { dx: number; dy: number; dz: number; horizontal: number }
  /** Points: coordinates in the model's own IFC frame (or the scene's). */
  coords?: Vec3
  frame?: 'model' | 'scene'
  /** The picked points, scene metres. */
  points: Vec3[]
}

export interface MeasurementsState {
  /** The armed tool, or 'none'. */
  tool: MeasureTool | 'none'
  /** What the viewer displays. `value` is SI regardless. */
  units: 'm' | 'cm' | 'mm' | 'ft'
  items: Measurement[]
}

// ── Tours & presentation director (since v1.12.0) ────────────────────────────

/** The built-in tour templates. */
export type TourTemplate = 'social' | 'client-walkthrough' | 'technical-review'

/** One stop of a host-authored tour. Positions in scene metres (Y up) — take them from getCamera(). */
export interface TourStepInput {
  position: Vec3
  target: Vec3
  caption?: string
  /** Elements (expressIDs) to highlight at this stop. */
  highlight?: number[]
  /** IFC classes to isolate at this stop, e.g. ['IfcWall', 'IfcSlab']. */
  isolate?: string[]
  modelId?: string
}

export interface TourInput {
  title?: string
  steps: TourStepInput[]
}

/**
 * `true` advances at the default pace (6 s per stop); a number is ms per stop
 * (1 500–120 000). The tour ends after the last stop.
 */
export type TourAutoplay = boolean | number

export interface TourState {
  playing: boolean
  title: string | null
  template: TourTemplate | null
  stepIndex: number | null
  total: number
  /** The stops, in the shape playTour() takes — save them to replay the tour later. */
  steps: Array<Required<Omit<TourStepInput, 'modelId' | 'caption'>> & { caption: string | null; modelId: string | null }>
}

export interface TourStepEvent { index: number; total: number; caption: string | null }

/** A built-in director recipe, as getPresentationRecipes() lists it. */
export interface PresentationRecipe {
  id: string
  name: string
  format: 'wide' | 'linkedin' | 'square' | 'reel' | 'tiktok'
  targetSec: number
  style: 'classic' | 'launch' | 'motion'
  look: string | null
  sections: string[]
}

/** Overrides applied on top of a recipe. */
export interface PresentationOptions {
  /** Output shape: `wide` 16:9, `linkedin` 4:5, `square`, `reel` / `tiktok` 9:16. */
  format?: PresentationRecipe['format']
  /** Target length, 5–180 s; the director fits the shots to it. */
  targetSec?: number
  pace?: 'calm' | 'normal' | 'fast'
  /** Opening title card text. */
  title?: string
  /** Closing call to action. */
  cta?: string
  /** Narrated captions on or off. */
  captions?: boolean
  /** `'none'` for a silent video. */
  music?: 'none'
  watermark?: boolean
}

export interface PresentationState {
  open: boolean
  clips: number
  durationSec: number
  width: number
  height: number
}

export interface PresentationVideo {
  /** The encoded file (MP4, or WebM where the browser cannot encode MP4). Transferred, not copied. */
  bytes: ArrayBuffer
  mimeType: string
  sizeBytes: number
}

export interface PresentationProgressEvent {
  stage: 'generate' | 'export'
  label?: string
  /** 0–1, or null while indeterminate. */
  progress: number | null
}

export interface IfcViewerEventMap {
  ready: ReadyEvent
  'model-loaded': ModelLoadedEvent
  'model-error': ModelErrorEvent
  'model-progress': ModelProgressEvent
  'validation-completed': ValidationCompletedEvent
  'element-selected': ElementSelectedEvent
  'pointcloud-picked': PointCloudPickedEvent
  'map-feature-picked': MapFeaturePickedEvent
  /** Walk mode turned on or off — by the visitor (G / Esc) or by the host. Since v1.11.0. */
  'walk-changed': WalkState
  /** A measurement was added, removed or renamed. Carries the whole list. Since v1.11.0. */
  'measurements-changed': MeasurementsState
  /** A tour began playing — started by the host or by the visitor. Since v1.12.0. */
  'tour-started': { title: string; total: number; template: TourTemplate | null }
  /** The tour moved to another stop. Since v1.12.0. */
  'tour-step': TourStepEvent
  /** The tour stopped; `completed` when it had reached the last stop. Since v1.12.0. */
  'tour-ended': { completed: boolean }
  /** The director is generating or exporting a presentation. Since v1.12.0. */
  'presentation-progress': PresentationProgressEvent
}

/** Languages the viewer ships with — code + native label, for building a picker. */
export const LANGUAGES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'ca', label: 'Català' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'th', label: 'ไทย' },
]

type AnyEvent = { source?: string; type?: string; requestId?: string; [k: string]: unknown }
type Listener<T> = (payload: T) => void

// 1.6.0: IDS checking now covers all six IDS 1.0 facets (validated against the
// official buildingSMART test cases) and `checkIds` failures carry an additive
// `reasonCodes` field alongside the stable EN `reasons` strings.
// 1.7.0: `checkEir(profile)` runs editable EIR / BIM Validation profiles (compiled
// to IDS, same engine + result shape); failures now also carry `globalId`.
// 1.8.0: point clouds. Add a LAS/LAZ/COPC/PLY/XYZ scan from bytes (transferred,
// not copied) or a URL, list/remove/clear/show/frame them, drive the shared
// appearance, and arm click-to-read inspection which reports picks through
// `pointcloud-picked`. Two fields there deserve care rather than convenience:
// `declaredCount` vs `pointCount` (what the file holds vs what is resident,
// which differ once `truncated` is set) and `alignment.confidence` (a scan on
// the `local` or `manual` rung was inferred or placed by hand, and must not be
// presented with the authority of an exact map conversion).
// 1.10.0: one inspector for the whole scene. A click on the OpenStreetMap
// surroundings now reports through `map-feature-picked`, alongside the IFC
// `element-selected` and the scan's `pointcloud-picked` — the three things a
// scene here is made of, on three events with the same shape of answer. The
// map event carries `heightEstimated` as a required field on purpose: most OSM
// heights are inferred from storey counts, and one presented as surveyed is the
// kind of number that ends up in somebody's shadow study.
// 1.10.1: scans and meshes load through the viewer's loading queue. The wire
// is unchanged; what a host notices: a failed or cancelled add answers at once
// (it used to hang until the timeout in some cases), `addPointCloudFromUrl`
// no longer sends the raw last URL segment as the name (a signed URL's query
// broke the format detection), and `addMesh*` wait as long as scans do (15
// min) — an import may queue behind a model that is still converting.
// 1.11.0: presentation and analysis. Everything the viewer grew since 1.8 that a
// blog post or a project page wants to drive: the scene background (and
// `background` from the first frame), accent and client skin at runtime, walk
// mode, the camera as data, the sun study, map mode and its surroundings,
// section planes (including a plan cut at a named storey), measurements with
// SI values, and per-model visibility in federated scenes. Two new events:
// `walk-changed`, `measurements-changed`. New boot options `map`, `solar`,
// `moon`, `scans` mirror the URL deep links, so a static page needs no JS.
// 1.12.0: tours and the presentation director. startTour() runs a built-in
// template (social / client walkthrough / technical review); playTour() plays
// a tour the host authored — camera stops with captions, highlights and
// isolation, optionally self-running — and getTour() hands it back in the
// same shape so it can be saved. createPresentation() turns a director recipe
// into a Clip Studio project; exportPresentation() encodes it in the visitor's
// browser and returns the video bytes. Events tour-started / tour-step /
// tour-ended / presentation-progress.
const SDK_VERSION = '1.12.0'
const DEFAULT_LOAD_TIMEOUT = 120_000
const REQUEST_TIMEOUT = 30_000
const FALLBACK_LANGUAGES = LANGUAGES.map((l) => l.code)

function resolveDefaultBaseUrl(): string {
  // This module lives at <app>/sdk/ifc-viewer.es.js → the app is its parent dir.
  try {
    return new URL('../', import.meta.url).href
  } catch {
    return '/'
  }
}

function safeOrigin(url: string): string {
  try { return new URL(url).origin } catch { return '' }
}

function toArrayBuffer(bytes: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (bytes instanceof ArrayBuffer) return bytes
  if (bytes instanceof Uint8Array) {
    return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.slice().buffer
  }
  throw new TypeError('IfcViewer: expected an ArrayBuffer or Uint8Array')
}

function px(v: number | string | undefined, fallback: string): string {
  if (v == null) return fallback
  return typeof v === 'number' ? `${v}px` : v
}

interface PendingLoad {
  resolve: (e: ModelLoadedEvent) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout> | null
}

/**
 * One loaded scan, as `listPointClouds` reports it.
 *
 * Two fields carry meaning that is easy to get wrong, so they are named apart
 * rather than collapsed:
 *
 * - `pointCount` is what is RESIDENT in the viewer. `declaredCount` is what the
 *   file says it holds. They differ when `truncated` is true, because the parse
 *   stopped at the point budget. Showing pointCount as "the size of the scan"
 *   would understate the survey.
 * - `alignment.confidence` says how much to trust the placement. A scan on the
 *   `local` or `manual` rung was positioned by inference or by hand; presenting
 *   it with the authority of an `exact` map conversion would be a lie your
 *   users could act on.
 */
export interface PointCloudInfo {
  id: string
  fileName: string
  format: 'las' | 'laz' | 'copc' | 'ply' | 'xyz'
  status: 'parsing' | 'ready' | 'error'
  /** Points resident in the viewer right now. */
  pointCount: number
  /** Points the file's header declares, when it declares any. */
  declaredCount: number | null
  /** True when the parse stopped at the budget — the file holds more. */
  truncated: boolean
  visible: boolean
  /** EPSG code the scan declares, or null. */
  crs: string | null
  /**
   * Which axis the SOURCE treats as up, and where that came from.
   *
   * `declared` means the format states it — LAS and its relatives define Z as
   * elevation. `assumed` means it was inferred from the shape of the scan,
   * because PLY, PCD and text say nothing at all; a host showing scans from
   * phones or photogrammetry should expect this and may want to offer the
   * correction itself. `user` means someone already corrected it.
   */
  upAxis: 'y' | 'z'
  upAxisSource: 'declared' | 'assumed' | 'user'
  /** The manual placement on top of the derived alignment. */
  placement: PointCloudPlacement
  alignment: {
    rung: 'map-conversion' | 'shared-crs' | 'geographic' | 'local' | 'manual'
    confidence: 'exact' | 'high' | 'approximate' | 'manual'
  } | null
}

/**
 * A manual correction applied ON TOP of the alignment the viewer derived, never
 * folded into it — so re-running the alignment cannot silently discard the
 * user's work, and the two can always be told apart.
 *
 * `pitchDeg` and `rollDeg` are levelling, clamped to ±45°. They exist because
 * yaw alone cannot fix a scan that arrived lying on its side or captured
 * off-level, which handheld scanning does constantly.
 */
export interface PointCloudPlacement {
  /** Scene metres. */
  x: number
  y: number
  z: number
  /** Degrees about scene +Y. */
  yawDeg: number
  /** Degrees about scene +X and +Z. Levelling only, ±45. */
  pitchDeg: number
  rollDeg: number
  /** Uniform multiplier, 1 = none. */
  scaleMul: number
}

/** Appearance controls shared by every loaded scan. */
export interface PointCloudDisplayOptions {
  pointSize?: number
  attenuate?: boolean
  opacity?: number
  colorMode?: 'rgb' | 'intensity' | 'elevation' | 'classification' | 'flat'
  flatColor?: number
  /** 0.05-1. Fraction of the render budget to use. */
  density?: number
  /** 0-1. Hides points below this confidence, for files that carry one. */
  confidenceThreshold?: number
  round?: boolean
}

/** What an imported model brought with it. Drives the triangle budget too. */
export interface MeshStats {
  meshes: number
  triangles: number
  materials: number
  textures: number
  /** Estimated from image dimensions, not from file size. */
  textureBytes: number
}

/**
 * One imported 3D model, as `listMeshes` reports it.
 *
 * Read `unitSource` and `upAxisSource` before trusting the two values above
 * them. Neither GLB, glTF nor OBJ records a coordinate system, and only glTF
 * records an orientation — so `unitScale` is ALWAYS inferred unless someone set
 * it, and `upAxis` is inferred for OBJ. Presenting either as fact is how a model
 * ends up a thousand times too big with nobody questioning it.
 */
export interface MeshInfo {
  id: string
  fileName: string
  format: 'glb' | 'gltf' | 'obj'
  status: 'loading' | 'ready' | 'error'
  visible: boolean
  stats: MeshStats
  /** Source unit → metre. 1, 0.01, 0.001 or 0.3048. */
  unitScale: number
  unitSource: 'assumed' | 'user'
  upAxis: 'y' | 'z'
  /** 'declared' only for glTF, whose specification mandates Y-up. */
  upAxisSource: 'declared' | 'assumed' | 'user'
  placement: PointCloudPlacement
}

/** One file of an import: the model itself, or something it references. */
export interface MeshFileInput {
  name: string
  bytes: ArrayBuffer
}

export class IfcViewer {
  /** Languages the viewer ships with (code + native label). */
  static readonly LANGUAGES = LANGUAGES
  /** Just the language codes, for convenience. */
  static readonly SUPPORTED_LANGUAGES = FALLBACK_LANGUAGES

  /** Create a viewer and resolve once it is ready to accept commands. */
  static async create(target: string | HTMLElement, options: IfcViewerOptions = {}): Promise<IfcViewer> {
    const v = new IfcViewer(target, options)
    await v.whenReady()
    return v
  }

  readonly version = SDK_VERSION
  readonly iframe: HTMLIFrameElement

  private readonly baseUrl: string
  private readonly appOrigin: string
  private readonly opts: IfcViewerOptions
  private readonly loadTimeout: number

  private _ready = false
  private languages: string[] = []
  private readyResolvers: Array<() => void> = []
  // Correlate each load with the iframe's echoed requestId so app-initiated loads
  // (URL param, in-iframe upload) never resolve a host add() promise.
  private readonly pending = new Map<string, PendingLoad>()
  // Generic query (request/response) correlation, keyed by requestId.
  private readonly requests = new Map<string, { resolve: (v: unknown) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  // Serialize loads so they land in call order and each add() settles before
  // the next is sent. The viewer itself queues concurrent loads (it no longer
  // rejects a second one), so this is about predictable ordering for hosts.
  private loadChain: Promise<unknown> = Promise.resolve()
  private reqCounter = 0
  private listeners = new Map<keyof IfcViewerEventMap, Set<Listener<never>>>()
  private disposed = false

  constructor(target: string | HTMLElement, options: IfcViewerOptions = {}) {
    const mount = typeof target === 'string'
      ? document.querySelector<HTMLElement>(target)
      : target
    if (!mount) throw new Error(`IfcViewer: mount target not found: ${String(target)}`)

    this.opts = options
    this.baseUrl = options.baseUrl ?? resolveDefaultBaseUrl()
    this.loadTimeout = options.loadTimeout ?? DEFAULT_LOAD_TIMEOUT

    const src = this.buildSrc()
    this.appOrigin = safeOrigin(src)

    const iframe = document.createElement('iframe')
    iframe.src = src
    iframe.style.border = '0'
    iframe.style.width = px(options.width, '100%')
    iframe.style.height = px(options.height, '100%')
    iframe.setAttribute('allow', 'fullscreen')
    iframe.setAttribute('loading', 'lazy')
    iframe.title = options.title ?? 'IFC model viewer'
    if (options.className) iframe.className = options.className
    mount.appendChild(iframe)
    this.iframe = iframe

    window.addEventListener('message', this.onMessage)

    if (options.onReady)       this.on('ready', options.onReady)
    if (options.onModelLoaded) this.on('model-loaded', options.onModelLoaded)
    if (options.onModelError)  this.on('model-error', options.onModelError)
    if (options.onProgress)    this.on('model-progress', options.onProgress)

    if (options.model) void this.addFromUrl(options.model)
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** True once the iframe viewer has signalled readiness. */
  get isReady(): boolean { return this._ready }

  /** Resolves when the viewer is ready to accept commands. */
  whenReady(): Promise<void> {
    if (this._ready) return Promise.resolve()
    return new Promise<void>((resolve) => this.readyResolvers.push(resolve))
  }

  /** Load IFC bytes from the host app. Resolves once the model is rendered. */
  add(name: string, bytes: ArrayBuffer | Uint8Array): Promise<ModelLoadedEvent> {
    const buffer = toArrayBuffer(bytes)
    return this.enqueueLoad((requestId) =>
      this.post({ type: 'ifcviewer:load-bytes', requestId, name, bytes: buffer }, [buffer]),
    )
  }

  /** Load a model from a public (CORS-enabled) URL. */
  addFromUrl(url: string, name?: string): Promise<ModelLoadedEvent> {
    return this.enqueueLoad((requestId) =>
      this.post({ type: 'ifcviewer:load', requestId, url, name }),
    )
  }

  /** Select + frame an element by its IFC expressID. */
  select(expressId: number, modelId?: string): void {
    this.send({ type: 'ifcviewer:select', expressId, modelId })
  }

  /** Isolate a category by IFC class (e.g. "IfcWall"); omit to clear. */
  isolate(ifcType?: string): void {
    this.send({ type: 'ifcviewer:isolate', ifcType })
  }

  /** Frame the active model. */
  fit(): void { this.send({ type: 'ifcviewer:fit' }) }

  /** Reset the camera to its default position. */
  reset(): void { this.send({ type: 'ifcviewer:reset' }) }

  /** Fly to a named camera view (iso/top/front/right/left/back/bottom), optionally framing a scope. */
  setView(view: CameraView, scope?: CameraScope): void {
    this.send({ type: 'ifcviewer:view', preset: view, ...(scope ? { scope } : {}) })
  }

  /** Change the UI language at runtime (no-ops for unsupported codes). */
  setLanguage(lang: string): void { this.send({ type: 'ifcviewer:set-language', lang }) }

  /** Remove all loaded models from the scene. */
  clear(): void { this.send({ type: 'ifcviewer:clear' }) }

  /** Restore full visibility (clear hidden elements + category/element isolation). */
  showAll(): void { this.send({ type: 'ifcviewer:show-all' }) }

  /**
   * Language codes the viewer supports. Reflects what the iframe advertised on
   * `ready`; falls back to the bundled list before then. See `IfcViewer.LANGUAGES`
   * for code + native label pairs to build a picker.
   */
  getLanguages(): string[] {
    return this.languages.length ? this.languages.slice() : FALLBACK_LANGUAGES.slice()
  }

  // ── Queries (request → response) ───────────────────────────────────────────

  /** List the models currently loaded in the scene. */
  getModels(): Promise<ModelSummary[]> {
    return this.request<ModelSummary[]>('ifcviewer:get-models')
  }

  /** Fetch an element's IFC data (attributes + property/quantity sets), or null. */
  getElement(expressId: number, modelId?: string): Promise<IfcElementData | null> {
    return this.request<IfcElementData | null>('ifcviewer:get-element', { expressId, modelId })
  }

  /** Fetch the current validation summary (Health Score + counts), or null. */
  getValidation(): Promise<ValidationSummary | null> {
    return this.request<ValidationSummary | null>('ifcviewer:get-validation')
  }

  /** Capture the current 3D view as a PNG data URL. */
  screenshot(): Promise<string> {
    return this.request<string>('ifcviewer:screenshot')
  }

  /** Aggregate model stats (element counts per category) for dashboard charts. */
  getStats(): Promise<StatsResult> {
    return this.request<StatsResult>('ifcviewer:get-stats')
  }

/** Validation issues for a dashboard table. Optionally filter by severity / cap count. */
  getIssues(opts: { severity?: 'error' | 'warning' | 'info'; limit?: number } = {}): Promise<IssuesResult> {
    return this.request<IssuesResult>('ifcviewer:get-issues', opts)
  }

  // ── Point clouds ────────────────────────────────────────────────────────────
  // Requires the host build to enable them (VITE_FEATURE_POINTCLOUD); every call
  // rejects with a clear reason when it does not. Scans are parsed in the
  // visitor's browser exactly like an IFC — nothing is uploaded.

  /**
   * Add a scan from bytes. LAS, LAZ, COPC, PLY and delimited text (.xyz/.pts/
   * .csv). Resolves with the new cloud's id.
   *
   * The buffer is TRANSFERRED, not copied, so it is neutered in the caller
   * afterwards — that is what makes handing over a multi-gigabyte scan free.
   * The generous timeout is deliberate: a large file legitimately parses for
   * minutes, and a wrapper that gives up before the parser has any hope of
   * finishing would report failure on a working load.
   */
  addPointCloud(fileName: string, bytes: ArrayBuffer | Uint8Array): Promise<string> {
    const buffer = toArrayBuffer(bytes)
    return this.request<{ cloudId: string }>(
      'ifcviewer:add-pointcloud', { name: fileName, bytes: buffer }, 15 * 60_000, [buffer],
    ).then((r) => r.cloudId)
  }

  /**
   * Add a scan the viewer fetches itself. The URL must allow CORS. Without a
   * `fileName` the viewer names the scan from the URL's path — a signed URL's
   * query is never part of the name (its extension is what picks the reader).
   */
  addPointCloudFromUrl(url: string, fileName?: string): Promise<string> {
    return this.request<{ cloudId: string }>(
      'ifcviewer:add-pointcloud',
      fileName ? { url, name: fileName } : { url },
      15 * 60_000,
    ).then((r) => r.cloudId)
  }

  /** Every scan currently loaded. See PointCloudInfo on reading the counts. */
  listPointClouds(): Promise<PointCloudInfo[]> {
    return this.request<{ clouds: PointCloudInfo[] }>('ifcviewer:get-pointclouds')
      .then((r) => r.clouds)
  }

  /** Remove one scan and free its GPU buffers. */
  removePointCloud(cloudId: string): Promise<void> {
    return this.request<unknown>('ifcviewer:remove-pointcloud', { cloudId }).then(() => undefined)
  }

  /** Remove every scan. */
  clearPointClouds(): Promise<void> {
    return this.request<unknown>('ifcviewer:clear-pointclouds').then(() => undefined)
  }

  /** Show or hide one scan without unloading it. */
  setPointCloudVisible(cloudId: string, visible: boolean): Promise<void> {
    return this.request<unknown>('ifcviewer:pointcloud-visible', { cloudId, visible })
      .then(() => undefined)
  }

  /** Frame the camera on a scan (or the first one loaded). */
  fitPointCloud(cloudId?: string): Promise<void> {
    return this.request<unknown>('ifcviewer:fit-pointcloud', { cloudId }).then(() => undefined)
  }

  /**
   * Appearance, shared by every scan. Each setting is a shader uniform or a
   * draw-range change, so these are instant even on a 20-million-point cloud.
   */
  setPointCloudDisplay(
    display: PointCloudDisplayOptions, renderBudget?: number,
  ): Promise<void> {
    return this.request<unknown>('ifcviewer:pointcloud-display', { display, renderBudget })
      .then(() => undefined)
  }

  /**
   * Arm (or disarm) click-to-read on the scan. While armed, clicking a point
   * emits `pointcloud-picked` — which carries the point's coordinates IN THE
   * FILE alongside the scene ones, since that is the number a survey record
   * will already hold. Clicks are read in the capture phase, so inspecting a
   * scan never doubles as selecting the IFC element behind it.
   */
  inspectPointCloud(enabled = true): Promise<void> {
    return this.request<unknown>('ifcviewer:inspect-pointcloud', { inspect: enabled })
      .then(() => undefined)
  }

  /**
   * Nudge a scan by hand: position, yaw, levelling, scale. Partial — anything
   * omitted is left alone. Values are clamped by the viewer, so a host cannot
   * put a scan somewhere only a reset escapes from.
   *
   * This sits on top of the derived alignment rather than replacing it, so it
   * survives a re-alignment and is persisted per file.
   */
  setPointCloudPlacement(
    placement: Partial<PointCloudPlacement>, cloudId?: string,
  ): Promise<void> {
    return this.request<unknown>('ifcviewer:pointcloud-placement', { placement, cloudId })
      .then(() => undefined)
  }

  /**
   * Correct which axis the scan's own coordinates treat as up, and re-derive the
   * placement from it.
   *
   * Worth exposing because the formats a phone or a photogrammetry pipeline
   * emits — PLY, PCD, plain text — declare no orientation at all, so the viewer
   * has to infer it from the shape of the data and can be wrong. `upAxisSource`
   * on PointCloudInfo tells you whether it was inferred.
   *
   * This re-runs the whole alignment rather than patching the transform: the up
   * axis feeds the bounding-box comparisons the local rung makes, so the
   * placement can legitimately change once it is right.
   */
  setPointCloudUpAxis(axis: 'y' | 'z', cloudId?: string): Promise<void> {
    return this.request<unknown>('ifcviewer:pointcloud-upaxis', { upAxis: axis, cloudId })
      .then(() => undefined)
  }

  // ── Imported 3D models ──────────────────────────────────────────────────────
  // Requires the host build to enable them (VITE_FEATURE_MESH); every call
  // rejects with a clear reason when it does not. Models are decoded in the
  // visitor's browser — nothing is uploaded.

  /**
   * Import a model from bytes. GLB, glTF and OBJ.
   *
   * Takes a LIST because two of the three formats need one: a `.gltf` points at
   * its `.bin` and its images by relative path, an `.obj` points at its `.mtl`.
   * Send only the entry file and you get grey geometry — which is the failure
   * that makes an import worthless for showing someone what a place looks like.
   * References resolve by basename, so a flat list is fine.
   *
   * Every buffer is TRANSFERRED, not copied, so it is neutered in the caller
   * afterwards. That is what makes handing over a textured model free.
   */
  addMesh(files: MeshFileInput[]): Promise<string> {
    const transfer = files.map((f) => f.bytes)
    // As long as a scan's: the import may queue behind a model still
    // converting (it lands on that model's floor), and a host that gave up
    // first would see a failure for an import that then appears.
    return this.request<{ meshId: string }>(
      'ifcviewer:add-mesh', { files }, 15 * 60_000, transfer,
    ).then((r) => r.meshId)
  }

  /**
   * Import a model the viewer fetches itself. Pass every URL the model needs —
   * the `.gltf` AND its `.bin` and textures; they are downloaded one after
   * another, with progress in the viewer's Loading Center. The entry is the
   * first URL whose path names a .glb / .gltf / .obj. All must allow CORS.
   */
  addMeshFromUrl(urls: string | string[]): Promise<string> {
    return this.request<{ meshId: string }>(
      'ifcviewer:add-mesh', { urls: Array.isArray(urls) ? urls : [urls] }, 15 * 60_000,
    ).then((r) => r.meshId)
  }

  /** Every model currently imported. See MeshInfo on trusting unit and axis. */
  listMeshes(): Promise<MeshInfo[]> {
    return this.request<{ meshes: MeshInfo[] }>('ifcviewer:get-meshes').then((r) => r.meshes)
  }

  /** Remove one import and free its geometry, materials and textures. */
  removeMesh(meshId?: string): Promise<void> {
    return this.request<unknown>('ifcviewer:remove-mesh', { meshId }).then(() => undefined)
  }

  /** Remove every import. */
  clearMeshes(): Promise<void> {
    return this.request<unknown>('ifcviewer:clear-meshes').then(() => undefined)
  }

  /** Show or hide an import without unloading it. */
  setMeshVisible(visible: boolean, meshId?: string): Promise<void> {
    return this.request<unknown>('ifcviewer:mesh-visible', { visible, meshId })
      .then(() => undefined)
  }

  /** Frame the camera on an import (or on all of them). */
  fitMesh(meshId?: string): Promise<void> {
    return this.request<unknown>('ifcviewer:fit-mesh', { meshId }).then(() => undefined)
  }

  /**
   * Place an import by hand: position, yaw, levelling, scale. Partial — anything
   * omitted is left alone, and the viewer clamps what it is given.
   *
   * An import starts centred on the IFC and sitting on its floor, so this is a
   * correction rather than the only thing standing between the model and the
   * world origin.
   */
  setMeshPlacement(
    placement: Partial<PointCloudPlacement>, meshId?: string,
  ): Promise<void> {
    return this.request<unknown>('ifcviewer:mesh-placement', { placement, meshId })
      .then(() => undefined)
  }

  /**
   * Correct which axis the source treats as up.
   *
   * Only meaningful for OBJ: glTF's specification mandates Y-up, so a `.glb` or
   * `.gltf` reports `upAxisSource: 'declared'` and this has nothing to fix.
   */
  setMeshUpAxis(axis: 'y' | 'z', meshId?: string): Promise<void> {
    return this.request<unknown>('ifcviewer:mesh-upaxis', { upAxis: axis, meshId })
      .then(() => undefined)
  }

  /**
   * Correct the source unit — 1 for metres, 0.01 centimetres, 0.001
   * millimetres, 0.3048 feet.
   *
   * None of these formats records a unit, so the viewer infers one from the size
   * of the model: a 12-metre building arriving as 12 000 units is
   * indistinguishable from a 12 km one except by plausibility. When that guess
   * is wrong, this is the fix.
   */
  setMeshUnit(unitScale: number, meshId?: string): Promise<void> {
    return this.request<unknown>('ifcviewer:mesh-unit', { unitScale, meshId })
      .then(() => undefined)
  }

  /** Check the loaded model against a buildingSMART IDS (.ids XML string). */
  checkIds(idsXml: string): Promise<IdsResult> {
    return this.request<IdsResult>('ifcviewer:check-ids', { idsXml }, 120_000)
  }

  /**
   * Check the loaded model against an EIR / BIM Validation profile (ISO 19650-style).
   * Accepts a profile object or its JSON string; the compact shorthand
   * (`{ entity, requiredProperties: [...] }`) is also accepted. Returns the same
   * IdsResult shape as checkIds (the profile compiles to IDS internally). Since v1.7.0.
   */
  checkEir(profile: EirProfile | string): Promise<IdsResult> {
    return this.request<IdsResult>('ifcviewer:check-eir', { profile }, 120_000)
  }

  // ── Mutating commands ──────────────────────────────────────────────────────

  /** Unload a specific model by id (see getModels()). */
  removeModel(modelId: string): void { this.send({ type: 'ifcviewer:remove-model', modelId }) }

  /** Hide a set of elements (by IFC expressID). Defaults to the active model. */
  hideElements(expressIds: number[], modelId?: string): void {
    this.send({ type: 'ifcviewer:hide-elements', expressIds, modelId })
  }

  /** Show a previously hidden set of elements. Defaults to the active model. */
  showElements(expressIds: number[], modelId?: string): void {
    this.send({ type: 'ifcviewer:show-elements', expressIds, modelId })
  }

  /** Place the camera at `position` looking along `direction`. */
  setCamera(position: Vec3, direction: Vec3): void {
    this.send({ type: 'ifcviewer:camera', position, direction })
  }

  // ── Look (since v1.11.0) ────────────────────────────────────────────────
  // Set from outside, these are NOT saved as the visitor's own preference:
  // the iframe shares storage with the app, and a blog's white background
  // should not follow a reader into their own viewer.

  /**
   * Change the scene background. A preset (`'white'`, `'paper'`, `'blueprint'`,
   * `'sky'`, `'studio'`), `'#rrggbb'`, `'#top,#bottom'` or `{ top, bottom? }`.
   * Rejects on anything else rather than painting a guess.
   */
  setBackground(background: BackgroundSpec): Promise<BackgroundState> {
    return this.request<BackgroundState>('ifcviewer:set-background', { background })
  }

  /** The current scene background. */
  getBackground(): Promise<BackgroundState> {
    return this.request<BackgroundState>('ifcviewer:get-background')
  }

  /** Re-theme the viewer's UI accent at runtime (`#rrggbb`). */
  setAccent(color: string): Promise<void> {
    return this.request<unknown>('ifcviewer:set-accent', { accent: color }).then(() => undefined)
  }

  /**
   * Switch the client skin on or off — the stakeholder view: no technical
   * panels, a clean Health Score badge. Same as `ui: 'client'`, at runtime.
   */
  setClientMode(enabled: boolean): Promise<void> {
    return this.request<unknown>('ifcviewer:set-client-mode', { enabled }).then(() => undefined)
  }

  /**
   * `'quality'` turns on the heavier rendering (ambient occlusion, softer
   * shadows) — for a hero shot or a screenshot; `'standard'` for everyday.
   */
  setRenderQuality(quality: 'standard' | 'quality'): Promise<void> {
    return this.request<unknown>('ifcviewer:set-render-quality', { quality }).then(() => undefined)
  }

  // ── Camera & walk (since v1.11.0) ───────────────────────────────────────

  /** Where the camera is and what it looks at — save it, restore it with lookAt. */
  getCamera(): Promise<CameraState | null> {
    return this.request<CameraState | null>('ifcviewer:get-camera')
  }

  /**
   * Fly the camera to `position`, looking at `target` (scene metres, Y up).
   * Pairs with getCamera() for "saved views" in your own UI.
   */
  lookAt(position: Vec3, target: Vec3, animate = true): Promise<void> {
    return this.request<unknown>('ifcviewer:look-at', { position, target, animate }).then(() => undefined)
  }

  /**
   * First-person walk mode: WASD / arrows to move, drag to look, Esc to leave.
   * `speed` is metres per second. Emits `walk-changed`.
   */
  setWalkMode(enabled: boolean, opts: { speed?: number } = {}): Promise<WalkState> {
    return this.request<WalkState>('ifcviewer:set-walk', { enabled, ...opts })
  }

  /** Whether walk mode is on, and at what speed. */
  getWalkState(): Promise<WalkState> {
    return this.request<WalkState>('ifcviewer:get-walk')
  }

  // ── Sun study (since v1.11.0) ───────────────────────────────────────────

  /**
   * Start or change the sun & moon study: real shadows at a site-local date and
   * time. The site comes from the IFC's georeference, then the map placement;
   * pass `location` for a model that has none — without one, this rejects
   * instead of lighting the model as if it stood in some default city.
   *
   *   await viewer.setSolar({ date: '06-21', time: '18:00' })
   */
  setSolar(opts: SolarOptions = {}): Promise<SolarState> {
    return this.request<SolarState>('ifcviewer:set-solar', { solar: opts }, 90_000)
  }

  /** The sun study's state: date, time and zone, and where the site is. */
  getSolar(): Promise<SolarState> {
    return this.request<SolarState>('ifcviewer:get-solar')
  }

  // ── Map mode (since v1.11.0) ────────────────────────────────────────────

  /**
   * Put the model on the map, with terrain and its OpenStreetMap surroundings.
   *
   * CONSENT: map tiles, elevation and OSM data come from third parties, so the
   * visitor's browser talks to them. Calling this is YOUR page declaring that
   * consent for its visitors — the viewer does not show its own consent sheet
   * inside someone else's page. Show `attributions` wherever the map is shown.
   *
   * Resolves once the map (and the surroundings, when asked) are up; the first
   * OpenStreetMap query for a place can take tens of seconds.
   */
  setSiteContext(opts: SiteContextOptions = {}): Promise<SiteContextState> {
    return this.request<SiteContextState>('ifcviewer:set-site', { site: opts }, 200_000)
  }

  /** Map mode's state, placement and the attributions you must display. */
  getSiteContext(): Promise<SiteContextState> {
    return this.request<SiteContextState>('ifcviewer:get-site')
  }

  // ── Sections (since v1.11.0) ────────────────────────────────────────────
  // The same cuts the Section panel makes — a visitor can open it and drag
  // what the host placed.

  /**
   * Add a section plane. `{ level: 'Level 1' }` is a floor plan at that storey;
   * `{ axis: 'x', offset: 4.5 }` a section at 4.5 m. Resolves with the new
   * plane's `id` and every plane now in the scene.
   */
  addSection(opts: AddSectionOptions = {}): Promise<SectionsState & { id: string }> {
    return this.request<SectionsState & { id: string }>('ifcviewer:add-section', { ...opts })
  }

  /** Move, toggle or flip a plane. */
  updateSection(id: string, patch: { offset?: number; enabled?: boolean; flipped?: boolean }): Promise<SectionsState> {
    return this.request<SectionsState>('ifcviewer:update-section', { id, ...patch })
  }

  /** Remove one plane, or every cut (planes and box) when `id` is omitted. */
  removeSection(id?: string): Promise<SectionsState> {
    return this.request<SectionsState>('ifcviewer:remove-section', id ? { id } : {})
  }

  /**
   * A section box around the whole model, or around the selected element;
   * `false` removes it.
   */
  setSectionBox(fit: 'model' | 'selection' | false = 'model'): Promise<SectionsState> {
    return this.request<SectionsState>('ifcviewer:section-box', { fit })
  }

  /** Every plane, the box, and the model's storeys (for level cuts). */
  getSections(): Promise<SectionsState> {
    return this.request<SectionsState>('ifcviewer:get-sections')
  }

  // ── Measurements (since v1.11.0) ────────────────────────────────────────

  /**
   * Arm a measuring tool for the visitor (opens the Measure panel so they see
   * what to click), or `'none'` to stand down. Results arrive on
   * `measurements-changed`.
   */
  setMeasureTool(tool: MeasureTool | 'none'): Promise<void> {
    return this.request<unknown>('ifcviewer:set-measure-tool', { tool }).then(() => undefined)
  }

  /** Every measurement on screen, with SI values. */
  getMeasurements(): Promise<MeasurementsState> {
    return this.request<MeasurementsState>('ifcviewer:get-measurements')
  }

  /** Remove one measurement, or all of them when `id` is omitted. */
  clearMeasurements(id?: string): Promise<MeasurementsState> {
    return this.request<MeasurementsState>('ifcviewer:clear-measurements', id ? { id } : {})
  }

  // ── Federated scenes (since v1.11.0) ───────────────────────────────────

  /** Show or hide one model (see getModels()) without unloading it. */
  setModelVisible(modelId: string, visible: boolean): Promise<void> {
    return this.request<unknown>('ifcviewer:model-visible', { modelId, visible }).then(() => undefined)
  }

  /** Ghost a model (0.05–1) — e.g. the architecture around the MEP. Omit the id for the active model. */
  setModelOpacity(opacity: number, modelId?: string): Promise<void> {
    return this.request<unknown>('ifcviewer:model-opacity', { opacity, modelId }).then(() => undefined)
  }

  /** Show only this model; pass `null` to show them all again. */
  isolateModel(modelId: string | null): Promise<void> {
    return this.request<unknown>('ifcviewer:isolate-model', { modelId }).then(() => undefined)
  }

  // ── Tours (since v1.12.0) ───────────────────────────────────────────────
  // Played by the viewer's own tour bar, so a host-started tour looks exactly
  // like one the visitor started: captions, arrows, share link.

  /**
   * Start a built-in tour. `social` and `client-walkthrough` show the model off
   * (a handful of framed views); `technical-review` walks the validation
   * issues, worst first, and needs validation to have run.
   */
  startTour(template: TourTemplate = 'client-walkthrough', opts: { title?: string; autoplay?: TourAutoplay; includeImprovements?: boolean } = {}): Promise<TourState> {
    return this.request<TourState>('ifcviewer:start-tour', { template, ...opts }, 60_000)
  }

  /**
   * Play a tour you authored: camera stops with a caption, and optionally the
   * elements to highlight or the classes to isolate. Build the stops with
   * getCamera(), or replay one saved from getTour().
   *
   *   await viewer.playTour({ title: 'Walkthrough', steps: [
   *     { position: { x: 30, y: 20, z: 30 }, target: { x: 0, y: 0, z: 0 }, caption: 'The site' },
   *     { position: …, target: …, caption: 'Structure', isolate: ['IfcColumn', 'IfcBeam'] },
   *   ] }, { autoplay: 5000 })
   */
  playTour(tour: TourInput, opts: { startAt?: number; autoplay?: TourAutoplay } = {}): Promise<TourState> {
    return this.request<TourState>('ifcviewer:play-tour', { tour, ...opts })
  }

  /** Jump to a stop (0-based). */
  goToTourStep(index: number): Promise<TourState> {
    return this.request<TourState>('ifcviewer:tour-step', { index })
  }

  /** Next stop. */
  nextTourStep(): Promise<TourState> {
    return this.request<TourState>('ifcviewer:tour-step', { delta: 1 })
  }

  /** Previous stop. */
  prevTourStep(): Promise<TourState> {
    return this.request<TourState>('ifcviewer:tour-step', { delta: -1 })
  }

  /** Turn self-running on (true / ms per stop) or off (false) for the tour playing now. */
  setTourAutoplay(autoplay: TourAutoplay): Promise<TourState> {
    return this.request<TourState>('ifcviewer:set-tour-autoplay', { autoplay })
  }

  /** Stop the tour and give the camera back. */
  stopTour(): Promise<TourState> {
    return this.request<TourState>('ifcviewer:stop-tour')
  }

  /** The tour loaded now, its position, and its stops in playTour() shape. */
  getTour(): Promise<TourState> {
    return this.request<TourState>('ifcviewer:get-tour')
  }

  // ── Presentation director (since v1.12.0) ──────────────────────────────
  // A recipe turns the model into an edited video: shots planned from the
  // IFC itself (storeys, systems, issues), captions, music, transitions.
  // Everything renders and encodes in the visitor's browser.

  /** The built-in recipes — ids for createPresentation(). */
  getPresentationRecipes(): Promise<PresentationRecipe[]> {
    return this.request<PresentationRecipe[]>('ifcviewer:get-recipes')
  }

  /**
   * Generate a presentation from a recipe. Opens the viewer's Clip Studio with
   * the result, where the visitor can still edit it. Resolves once the shots
   * are rendered — that takes a while (tens of seconds to minutes); follow it
   * on `presentation-progress`.
   */
  createPresentation(recipe = 'meeting-demo', options: PresentationOptions = {}): Promise<PresentationState> {
    return this.request<PresentationState>('ifcviewer:create-presentation', { recipe, options }, 15 * 60_000)
  }

  /**
   * Encode the current presentation to a video file and hand its bytes to the
   * host — to upload to your CMS, attach to a report, or play in a <video>:
   *
   *   const { bytes, mimeType } = await viewer.exportPresentation()
   *   video.src = URL.createObjectURL(new Blob([bytes], { type: mimeType }))
   */
  exportPresentation(opts: { resolution?: 720 | 1080 | 1440; music?: boolean } = {}): Promise<PresentationVideo> {
    return this.request<PresentationVideo>('ifcviewer:export-presentation', { ...opts }, 30 * 60_000)
  }

  /** Close Clip Studio (the generated project is kept until the next one). */
  closePresentation(): Promise<void> {
    return this.request<unknown>('ifcviewer:close-presentation').then(() => undefined)
  }

  // ── Panels ──────────────────────────────────────────────────────────────
  // The viewer's tools live on a rail, one open at a time. Until now a host
  // could load a scan but not open the panel that configures it, could not ask
  // which tool the user had open, and could not scope the rail without
  // reloading the iframe with a different `panels=`.

  /**
   * Open a tool panel, or pass `null` to close whatever is open.
   *
   * A panel that is not available — the chrome hides it, or nothing is loaded
   * for it to act on — is a no-op rather than an error. Use {@link getPanels}
   * to ask what is available before offering it in your own UI.
   */
  openPanel(panel: PanelName | null): void {
    this.send({ type: 'ifcviewer:open-panel', panel })
  }

  /** Close whichever panel is open. Same as `openPanel(null)`. */
  closePanel(): void { this.openPanel(null) }

  /** Which panel is open, and which are available right now. */
  getPanels(): Promise<PanelsResult> {
    return this.request<PanelsResult>('ifcviewer:get-panels')
  }

  /**
   * Limit the rail to these panels, at runtime.
   *
   * The same vocabulary as the `panels=` URL parameter, and it outranks it: a
   * host that scopes the rail after load meant to. It narrows what the viewer
   * is offering and never adds — naming a panel the viewer is not rendering
   * does not conjure it. An empty array means no rail at all.
   */
  setPanels(panels: PanelName[]): void {
    this.send({ type: 'ifcviewer:set-panels', panels })
  }

  /** Subscribe to a viewer event. Returns an unsubscribe function. */
  on<K extends keyof IfcViewerEventMap>(event: K, cb: Listener<IfcViewerEventMap[K]>): () => void {
    let set = this.listeners.get(event)
    if (!set) { set = new Set(); this.listeners.set(event, set) }
    set.add(cb as Listener<never>)
    return () => this.off(event, cb)
  }

  off<K extends keyof IfcViewerEventMap>(event: K, cb: Listener<IfcViewerEventMap[K]>): void {
    this.listeners.get(event)?.delete(cb as Listener<never>)
  }

  /** Tear down the viewer and remove the iframe. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    window.removeEventListener('message', this.onMessage)
    this.iframe.remove()
    const err = new Error('IfcViewer disposed')
    for (const p of this.pending.values()) {
      if (p.timer) clearTimeout(p.timer)
      p.reject(err)
    }
    this.pending.clear()
    for (const r of this.requests.values()) {
      clearTimeout(r.timer)
      r.reject(err)
    }
    this.requests.clear()
    this.readyResolvers.splice(0).forEach((r) => r())
    this.listeners.clear()
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private buildSrc(): string {
    const url = new URL(this.baseUrl, typeof window !== 'undefined' ? window.location.href : undefined)
    url.search = ''
    url.hash = ''
    url.searchParams.set('embed', '1')
    const ui = this.opts.ui ?? 'minimal'
    if (ui !== 'minimal') url.searchParams.set('ui', ui)
    if (this.opts.validate === false) url.searchParams.set('validate', '0')
    if (this.opts.panel) url.searchParams.set('panel', '1')
    // Serialised even when empty: `panels=` with nothing after it is a host
    // saying "no rail", which is not the same as saying nothing.
    if (this.opts.panels) url.searchParams.set('panels', this.opts.panels.join(','))
    if (this.opts.lang) url.searchParams.set('lang', this.opts.lang)
    if (this.opts.accent) url.searchParams.set('accent', this.opts.accent.replace(/^#/, ''))
    if (this.opts.background) {
      const bg = this.opts.background
      const spec = typeof bg === 'string' ? bg
        : 'preset' in bg ? bg.preset
        : bg.bottom ? `${bg.top},${bg.bottom}` : bg.top
      url.searchParams.set('bg', spec.replace(/#/g, ''))
    }
    if (this.opts.map) url.searchParams.set('map', this.opts.map === true || this.opts.map.length === 0 ? '1' : this.opts.map.join(','))
    if (this.opts.solar) url.searchParams.set('solar', this.opts.solar)
    if (this.opts.moon) url.searchParams.set('moon', '1')
    if (this.opts.scans?.length) url.searchParams.set('scan', this.opts.scans.join(','))
    return url.toString()
  }

  /** Queue a load so only one runs at a time; resolves with that load's result. */
  private enqueueLoad(send: (requestId: string) => void): Promise<ModelLoadedEvent> {
    if (this.disposed) return Promise.reject(new Error('IfcViewer disposed'))
    const run = (): Promise<ModelLoadedEvent> => this.runLoad(send)
    const result = this.loadChain.then(run, run)
    // Keep the chain alive whatever the individual outcome.
    this.loadChain = result.then(() => undefined, () => undefined)
    return result
  }

  private runLoad(send: (requestId: string) => void): Promise<ModelLoadedEvent> {
    return new Promise<ModelLoadedEvent>((resolve, reject) => {
      if (this.disposed) { reject(new Error('IfcViewer disposed')); return }
      const requestId = this.nextRequestId()
      const timer = this.loadTimeout > 0
        ? setTimeout(() => {
            this.pending.delete(requestId)
            reject(new Error(`IfcViewer: load timed out after ${this.loadTimeout}ms`))
          }, this.loadTimeout)
        : null
      this.pending.set(requestId, { resolve, reject, timer })
      void this.whenReady().then(() => {
        if (this.disposed) return // dispose() already rejected this pending entry
        try { send(requestId) } catch (err) {
          this.settle(requestId, false, err instanceof Error ? err : new Error(String(err)))
        }
      })
    })
  }

  private settle(requestId: string, ok: boolean, payload: ModelLoadedEvent | Error): void {
    const p = this.pending.get(requestId)
    if (!p) return
    if (p.timer) clearTimeout(p.timer)
    this.pending.delete(requestId)
    if (ok) p.resolve(payload as ModelLoadedEvent)
    else p.reject(payload as Error)
  }

  private nextRequestId(): string {
    return `r${Date.now().toString(36)}-${++this.reqCounter}`
  }

  /** Fire-and-forget command, sent once the viewer is ready. */
  private send(message: Record<string, unknown>): void {
    void this.whenReady().then(() => { if (!this.disposed) this.post(message) })
  }

  /** Send a query and resolve with the iframe's `result` payload. */
  private request<T>(
    type: string, params: Record<string, unknown> = {}, timeoutMs = REQUEST_TIMEOUT,
    transfer: Transferable[] = [],
  ): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('IfcViewer disposed'))
    return new Promise<T>((resolve, reject) => {
      const requestId = this.nextRequestId()
      const timer = setTimeout(() => {
        this.requests.delete(requestId)
        reject(new Error(`IfcViewer: "${type}" timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.requests.set(requestId, { resolve: resolve as (v: unknown) => void, reject, timer })
      void this.whenReady().then(() => {
        if (this.disposed) return
        this.post({ type, requestId, ...params }, transfer)
      })
    })
  }

  private post(message: Record<string, unknown>, transfer: Transferable[] = []): void {
    const win = this.iframe.contentWindow
    if (!win) return
    win.postMessage(message, this.appOrigin || '*', transfer)
  }

  private readonly onMessage = (e: MessageEvent): void => {
    if (e.source !== this.iframe.contentWindow) return
    const data = e.data as AnyEvent | null
    if (!data || data.source !== 'ifc-validator' || typeof data.type !== 'string') return

    switch (data.type) {
      case 'ready': {
        this._ready = true
        if (Array.isArray(data.languages)) this.languages = (data.languages as unknown[]).filter((l): l is string => typeof l === 'string')
        this.readyResolvers.splice(0).forEach((r) => r())
        this.emit('ready', { languages: this.getLanguages() })
        break
      }
      case 'model-loaded': {
        const payload = data as unknown as ModelLoadedEvent
        if (data.requestId) this.settle(data.requestId, true, payload)
        this.emit('model-loaded', payload)
        break
      }
      case 'model-error': {
        const payload = data as unknown as ModelErrorEvent
        if (data.requestId) this.settle(data.requestId, false, new Error(payload.message || 'Model failed to load'))
        this.emit('model-error', payload)
        break
      }
      case 'model-progress':
        this.emit('model-progress', data as unknown as ModelProgressEvent)
        break
      case 'validation-completed':
        this.emit('validation-completed', data as unknown as ValidationCompletedEvent)
        break
      case 'element-selected':
        this.emit('element-selected', data as unknown as ElementSelectedEvent)
        break
      case 'pointcloud-picked':
        this.emit('pointcloud-picked', data as unknown as PointCloudPickedEvent)
        break
      case 'map-feature-picked':
        this.emit('map-feature-picked', data as unknown as MapFeaturePickedEvent)
        break
      case 'walk-changed':
        this.emit('walk-changed', { active: !!data.active, speed: Number(data.speed) })
        break
      case 'measurements-changed':
        this.emit('measurements-changed', data as unknown as MeasurementsState)
        break
      case 'tour-started':
        this.emit('tour-started', data as unknown as IfcViewerEventMap['tour-started'])
        break
      case 'tour-step':
        this.emit('tour-step', data as unknown as TourStepEvent)
        break
      case 'tour-ended':
        this.emit('tour-ended', { completed: !!data.completed })
        break
      case 'presentation-progress':
        this.emit('presentation-progress', data as unknown as PresentationProgressEvent)
        break
      case 'result': {
        const rid = data.requestId
        if (!rid) break
        const r = this.requests.get(rid)
        if (!r) break
        clearTimeout(r.timer)
        this.requests.delete(rid)
        if (data.ok) r.resolve((data as { data?: unknown }).data)
        else r.reject(new Error(typeof data.error === 'string' ? data.error : 'request failed'))
        break
      }
    }
  }

  private emit<K extends keyof IfcViewerEventMap>(event: K, payload: IfcViewerEventMap[K]): void {
    this.listeners.get(event)?.forEach((cb) => {
      try { (cb as Listener<IfcViewerEventMap[K]>)(payload) } catch (err) { console.error('[IfcViewer] listener error:', err) }
    })
  }
}

// ─── <ifc-viewer> custom element ──────────────────────────────────────────────
// Zero-JS integration: drop the tag into any HTML/dashboard and set attributes.
//
//   <ifc-viewer model="https://host/a.ifc" ui="minimal" accent="#22c55e"
//   <ifc-viewer model="https://host/a.ifc" panels="scene,map"
//               style="display:block;height:520px"></ifc-viewer>
//   <ifc-viewer model="https://host/a.ifc" background="white"
//               map="terrain,buildings" solar="06-21T18:00"></ifc-viewer>
//
// Events are re-dispatched as DOM CustomEvents named `ifcviewer:<type>` (detail =
// payload). The underlying IfcViewer is available via the element's `.viewer`.

const FORWARDED_EVENTS = [
  'ready', 'model-loaded', 'model-error', 'model-progress', 'validation-completed', 'element-selected',
  'pointcloud-picked', 'map-feature-picked', 'walk-changed', 'measurements-changed',
  'tour-started', 'tour-step', 'tour-ended', 'presentation-progress',
] as const

export class IfcViewerElement extends HTMLElement {
  private _viewer: IfcViewer | null = null

  static get observedAttributes(): string[] { return ['model', 'lang', 'accent', 'background'] }

  /** The underlying IfcViewer instance (null before connected). */
  get viewer(): IfcViewer | null { return this._viewer }

  connectedCallback(): void {
    if (this._viewer) return
    if (!this.style.display) this.style.display = 'block'
    const host = document.createElement('div')
    host.style.cssText = 'width:100%;height:100%'
    this.appendChild(host)

    const attr = (n: string): string | undefined => this.getAttribute(n) ?? undefined
    const boolAttr = (n: string): boolean | undefined => {
      if (!this.hasAttribute(n)) return undefined
      const v = this.getAttribute(n)
      return v !== 'false' && v !== '0' && v !== 'no'
    }

    const v = new IfcViewer(host, {
      ui: attr('ui') as IfcViewerPreset | undefined,
      panels: attr('panels')?.split(',').map((p) => p.trim()).filter(Boolean) as PanelName[] | undefined,
      lang: attr('lang'),
      accent: attr('accent'),
      validate: boolAttr('validate'),
      panel: boolAttr('panel'),
      baseUrl: attr('base-url'),
      model: attr('model'),
      background: attr('background'),
      // `map` alone (or map="1") is the map; a list names the layers.
      map: this.hasAttribute('map')
        ? (() => {
            const v = (this.getAttribute('map') ?? '').trim()
            if (v === '' || v === '1' || v === 'true') return true
            if (v === '0' || v === 'false') return undefined
            return v.split(',').map((t) => t.trim()).filter(Boolean) as Array<'terrain' | 'buildings' | 'showcase'>
          })()
        : undefined,
      solar: attr('solar'),
      moon: boolAttr('moon'),
      scans: attr('scans')?.split(',').map((u) => u.trim()).filter(Boolean),
      height: '100%',
    })
    this._viewer = v
    for (const type of FORWARDED_EVENTS) {
      v.on(type, (detail) => this.dispatchEvent(new CustomEvent(`ifcviewer:${type}`, { detail, bubbles: true, composed: true })))
    }
  }

  disconnectedCallback(): void {
    this._viewer?.dispose()
    this._viewer = null
    this.innerHTML = ''
  }

  attributeChangedCallback(name: string, _old: string | null, val: string | null): void {
    if (!this._viewer || val == null) return
    if (name === 'lang') this._viewer.setLanguage(val)
    else if (name === 'model') void this._viewer.addFromUrl(val)
    else if (name === 'accent') void this._viewer.setAccent(val).catch(() => { /* invalid colour */ })
    else if (name === 'background') void this._viewer.setBackground(val).catch(() => { /* invalid spec */ })
  }

  // ── Convenience proxies to the underlying viewer ──────────────────────────
  add(name: string, bytes: ArrayBuffer | Uint8Array): Promise<ModelLoadedEvent> { return this._viewer!.add(name, bytes) }
  addFromUrl(url: string, name?: string): Promise<ModelLoadedEvent> { return this._viewer!.addFromUrl(url, name) }
  select(expressId: number, modelId?: string): void { this._viewer?.select(expressId, modelId) }
  isolate(ifcType?: string): void { this._viewer?.isolate(ifcType) }
  getStats(): Promise<StatsResult> { return this._viewer!.getStats() }
  getIssues(opts?: { severity?: 'error' | 'warning' | 'info'; limit?: number }): Promise<IssuesResult> { return this._viewer!.getIssues(opts) }
  screenshot(): Promise<string> { return this._viewer!.screenshot() }
  addPointCloud(name: string, bytes: ArrayBuffer | Uint8Array): Promise<string> { return this._viewer!.addPointCloud(name, bytes) }
  addPointCloudFromUrl(url: string, name?: string): Promise<string> { return this._viewer!.addPointCloudFromUrl(url, name) }
  listPointClouds(): Promise<PointCloudInfo[]> { return this._viewer!.listPointClouds() }
  removePointCloud(cloudId: string): Promise<void> { return this._viewer!.removePointCloud(cloudId) }
  clearPointClouds(): Promise<void> { return this._viewer!.clearPointClouds() }
  setPointCloudVisible(cloudId: string, visible: boolean): Promise<void> { return this._viewer!.setPointCloudVisible(cloudId, visible) }
  fitPointCloud(cloudId?: string): Promise<void> { return this._viewer!.fitPointCloud(cloudId) }
  setPointCloudDisplay(display: PointCloudDisplayOptions, renderBudget?: number): Promise<void> { return this._viewer!.setPointCloudDisplay(display, renderBudget) }
  inspectPointCloud(enabled?: boolean): Promise<void> { return this._viewer!.inspectPointCloud(enabled) }
  setBackground(background: BackgroundSpec): Promise<BackgroundState> { return this._viewer!.setBackground(background) }
  setSolar(opts?: SolarOptions): Promise<SolarState> { return this._viewer!.setSolar(opts) }
  setSiteContext(opts?: SiteContextOptions): Promise<SiteContextState> { return this._viewer!.setSiteContext(opts) }
  setWalkMode(enabled: boolean, opts?: { speed?: number }): Promise<WalkState> { return this._viewer!.setWalkMode(enabled, opts) }
  addSection(opts?: AddSectionOptions): Promise<SectionsState & { id: string }> { return this._viewer!.addSection(opts) }
  removeSection(id?: string): Promise<SectionsState> { return this._viewer!.removeSection(id) }
  setMeasureTool(tool: MeasureTool | 'none'): Promise<void> { return this._viewer!.setMeasureTool(tool) }
  getMeasurements(): Promise<MeasurementsState> { return this._viewer!.getMeasurements() }
  setView(view: CameraView, scope?: CameraScope): void { this._viewer?.setView(view, scope) }
  startTour(template?: TourTemplate, opts?: { title?: string; autoplay?: TourAutoplay; includeImprovements?: boolean }): Promise<TourState> { return this._viewer!.startTour(template, opts) }
  playTour(tour: TourInput, opts?: { startAt?: number; autoplay?: TourAutoplay }): Promise<TourState> { return this._viewer!.playTour(tour, opts) }
  stopTour(): Promise<TourState> { return this._viewer!.stopTour() }
  createPresentation(recipe?: string, options?: PresentationOptions): Promise<PresentationState> { return this._viewer!.createPresentation(recipe, options) }
  exportPresentation(opts?: { resolution?: 720 | 1080 | 1440; music?: boolean }): Promise<PresentationVideo> { return this._viewer!.exportPresentation(opts) }
}

/** Register the <ifc-viewer> element (idempotent). Auto-called on import. */
export function defineIfcViewerElement(tag = 'ifc-viewer'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) {
    customElements.define(tag, IfcViewerElement)
  }
}

if (typeof window !== 'undefined') {
  try { defineIfcViewerElement() } catch { /* non-fatal */ }
}

export default IfcViewer
