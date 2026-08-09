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

export interface IfcViewerOptions {
  /** App base URL. Defaults to the parent of this script's URL. */
  baseUrl?: string
  /** Chrome preset. Default 'minimal'. */
  ui?: IfcViewerPreset
  /** Run validation on load (drives the Health Score). Default true. */
  validate?: boolean
  /** Open the validation panel automatically. Default false. */
  panel?: boolean
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

export interface IfcViewerEventMap {
  ready: ReadyEvent
  'model-loaded': ModelLoadedEvent
  'model-error': ModelErrorEvent
  'model-progress': ModelProgressEvent
  'validation-completed': ValidationCompletedEvent
  'element-selected': ElementSelectedEvent
  'pointcloud-picked': PointCloudPickedEvent
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
const SDK_VERSION = '1.9.0'
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
  // Serialize loads so the app's single-load guard is never hit and order is stable.
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

  /** Fly to a named camera view (iso/top/front/right/left/back/bottom). */
  setView(view: CameraView): void { this.send({ type: 'ifcviewer:view', preset: view }) }

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

  /** Add a scan the viewer fetches itself. The URL must allow CORS. */
  addPointCloudFromUrl(url: string, fileName?: string): Promise<string> {
    return this.request<{ cloudId: string }>(
      'ifcviewer:add-pointcloud',
      { url, name: fileName ?? url.split('/').pop() ?? 'scan.las' },
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
    if (this.opts.lang) url.searchParams.set('lang', this.opts.lang)
    if (this.opts.accent) url.searchParams.set('accent', this.opts.accent.replace(/^#/, ''))
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
//               style="display:block;height:520px"></ifc-viewer>
//
// Events are re-dispatched as DOM CustomEvents named `ifcviewer:<type>` (detail =
// payload). The underlying IfcViewer is available via the element's `.viewer`.

const FORWARDED_EVENTS = ['ready', 'model-loaded', 'model-error', 'model-progress', 'validation-completed', 'element-selected'] as const

export class IfcViewerElement extends HTMLElement {
  private _viewer: IfcViewer | null = null

  static get observedAttributes(): string[] { return ['model', 'lang', 'accent'] }

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
      lang: attr('lang'),
      accent: attr('accent'),
      validate: boolAttr('validate'),
      panel: boolAttr('panel'),
      baseUrl: attr('base-url'),
      model: attr('model'),
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
