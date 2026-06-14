// Type definitions for the IFC Viewer SDK (ifc-viewer.es.js).
// Kept in sync by hand with src/sdk/ifc-viewer-sdk.ts.

export type IfcViewerPreset = 'minimal' | 'full' | 'kiosk'
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
  onReady?: (e: ReadyEvent) => void
  onModelLoaded?: (e: ModelLoadedEvent) => void
  onModelError?: (e: ModelErrorEvent) => void
  onProgress?: (e: ModelProgressEvent) => void
}

export interface ReadyEvent { languages: string[] }
export interface ModelLoadedEvent {
  modelId: string
  fileName: string
  elementCount: number
  fromCache: boolean
}
export interface ModelErrorEvent { message: string; url?: string; name?: string }
export interface ModelProgressEvent { percent: number; phase: string }
export interface ValidationCompletedEvent {
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

export interface ModelSummary { id: string; fileName: string; elementCount: number }
export interface ModelStats { id: string; fileName: string; elementCount: number; fileSize: number; categories: Array<{ type: string; label: string; count: number }> }
export interface StatsResult { elementCount: number; models: ModelStats[] }
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

export interface IdsSpecResult {
  name: string
  status: 'pass' | 'fail' | 'na'
  applicableCount: number
  passedCount: number
  failedCount: number
  failures: Array<{ expressId: number; ifcClass: string; name: string; reasons: string[] }>
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
export interface ValidationSummary { qualityScore: number | null; errors: number; warnings: number; info: number }
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

export interface IfcViewerEventMap {
  ready: ReadyEvent
  'model-loaded': ModelLoadedEvent
  'model-error': ModelErrorEvent
  'model-progress': ModelProgressEvent
  'validation-completed': ValidationCompletedEvent
  'element-selected': ElementSelectedEvent
}

export declare const LANGUAGES: ReadonlyArray<{ code: string; label: string }>

export declare class IfcViewer {
  /** Languages the viewer ships with — code + native label. */
  static readonly LANGUAGES: ReadonlyArray<{ code: string; label: string }>
  /** Supported language codes. */
  static readonly SUPPORTED_LANGUAGES: string[]

  /** Create a viewer and resolve once it is ready to accept commands. */
  static create(target: string | HTMLElement, options?: IfcViewerOptions): Promise<IfcViewer>
  readonly version: string
  readonly iframe: HTMLIFrameElement
  constructor(target: string | HTMLElement, options?: IfcViewerOptions)
  /** True once the iframe viewer has signalled readiness. */
  get isReady(): boolean
  /** Resolves when the viewer is ready to accept commands. */
  whenReady(): Promise<void>
  /** Load IFC bytes from the host app. Resolves once the model is rendered. */
  add(name: string, bytes: ArrayBuffer | Uint8Array): Promise<ModelLoadedEvent>
  /** Load a model from a public (CORS-enabled) URL. */
  addFromUrl(url: string, name?: string): Promise<ModelLoadedEvent>
  /** Select + frame an element by its IFC expressID. */
  select(expressId: number, modelId?: string): void
  /** Isolate a category by IFC class (e.g. "IfcWall"); omit to clear. */
  isolate(ifcType?: string): void
  /** Fly to a named camera view. */
  setView(view: CameraView): void
  /** Frame the active model. */
  fit(): void
  /** Reset the camera to its default position. */
  reset(): void
  /** Restore full visibility (clear hidden elements + isolation). */
  showAll(): void
  /** Change the UI language at runtime (no-ops for unsupported codes). */
  setLanguage(lang: string): void
  /** Remove all loaded models from the scene. */
  clear(): void
  /** Supported language codes (reflects the iframe once ready). */
  getLanguages(): string[]
  /** List the models currently loaded in the scene. */
  getModels(): Promise<ModelSummary[]>
  /** Fetch an element's IFC data (attributes + property/quantity sets), or null. */
  getElement(expressId: number, modelId?: string): Promise<IfcElementData | null>
  /** Fetch the current validation summary (Health Score + counts), or null. */
  getValidation(): Promise<ValidationSummary | null>
  /** Capture the current 3D view as a PNG data URL. */
  screenshot(): Promise<string>
  /** Aggregate model stats (element counts per category) for dashboard charts. */
  getStats(): Promise<StatsResult>
  /** Validation issues for a dashboard table. Optionally filter by severity / cap count. */
  getIssues(opts?: { severity?: 'error' | 'warning' | 'info'; limit?: number }): Promise<IssuesResult>
  /** Check the loaded model against a buildingSMART IDS (.ids XML string). */
  checkIds(idsXml: string): Promise<IdsResult>
  /** Unload a specific model by id (see getModels()). */
  removeModel(modelId: string): void
  /** Hide a set of elements (by IFC expressID). Defaults to the active model. */
  hideElements(expressIds: number[], modelId?: string): void
  /** Show a previously hidden set of elements. Defaults to the active model. */
  showElements(expressIds: number[], modelId?: string): void
  /** Place the camera at `position` looking along `direction`. */
  setCamera(position: Vec3, direction: Vec3): void
  /** Subscribe to a viewer event. Returns an unsubscribe function. */
  on<K extends keyof IfcViewerEventMap>(event: K, cb: (payload: IfcViewerEventMap[K]) => void): () => void
  off<K extends keyof IfcViewerEventMap>(event: K, cb: (payload: IfcViewerEventMap[K]) => void): void
  /** Tear down the viewer and remove the iframe. */
  dispose(): void
}

/**
 * `<ifc-viewer>` custom element. Attributes: model, ui, lang, accent, validate,
 * panel, base-url. Events re-dispatched as `ifcviewer:<type>` CustomEvents.
 * The underlying IfcViewer is on `.viewer`.
 */
export declare class IfcViewerElement extends HTMLElement {
  get viewer(): IfcViewer | null
  add(name: string, bytes: ArrayBuffer | Uint8Array): Promise<ModelLoadedEvent>
  addFromUrl(url: string, name?: string): Promise<ModelLoadedEvent>
  select(expressId: number, modelId?: string): void
  isolate(ifcType?: string): void
  getStats(): Promise<StatsResult>
  getIssues(opts?: { severity?: 'error' | 'warning' | 'info'; limit?: number }): Promise<IssuesResult>
  screenshot(): Promise<string>
}

/** Register the `<ifc-viewer>` element (idempotent). Auto-called on import. */
export declare function defineIfcViewerElement(tag?: string): void

export default IfcViewer
