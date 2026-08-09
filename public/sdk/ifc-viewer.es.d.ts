// Type definitions for the IFC Viewer SDK (ifc-viewer.es.js).
// GENERATED from src/sdk/ifc-viewer-sdk.ts by `npm run build:sdk` — do not edit.
export type IfcViewerPreset = 'minimal' | 'full' | 'kiosk' | 'client';
export type CameraView = 'iso' | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';
export interface IfcViewerOptions {
    /** App base URL. Defaults to the parent of this script's URL. */
    baseUrl?: string;
    /** Chrome preset. Default 'minimal'. */
    ui?: IfcViewerPreset;
    /** Run validation on load (drives the Health Score). Default true. */
    validate?: boolean;
    /** Open the validation panel automatically. Default false. */
    panel?: boolean;
    /** Force a UI language (e.g. 'en', 'es', 'de'). */
    lang?: string;
    /** Accent colour (`#rrggbb`) to theme the viewer to your dashboard. */
    accent?: string;
    /** iframe height. Number → px. Default '100%'. */
    height?: number | string;
    /** iframe width. Number → px. Default '100%'. */
    width?: number | string;
    /** Extra class applied to the created iframe. */
    className?: string;
    title?: string;
    /** Auto-load this public (CORS-enabled) IFC URL once the viewer is ready. */
    model?: string;
    /** Reject add()/addFromUrl() after this many ms. 0 disables. Default 120000. */
    loadTimeout?: number;
    /** Convenience callbacks (equivalent to .on(...)). */
    onReady?: (e: ReadyEvent) => void;
    onModelLoaded?: (e: ModelLoadedEvent) => void;
    onModelError?: (e: ModelErrorEvent) => void;
    onProgress?: (e: ModelProgressEvent) => void;
}
export interface ReadyEvent {
    /** Language codes the viewer supports (for setLanguage / a language picker). */
    languages: string[];
}
export interface ModelLoadedEvent {
    modelId: string;
    fileName: string;
    elementCount: number;
    fromCache: boolean;
}
export interface ModelErrorEvent {
    message: string;
    url?: string;
    name?: string;
}
export interface ModelProgressEvent {
    percent: number;
    phase: string;
}
export interface ValidationCompletedEvent {
    /** Health Score 0–100, or null if not computed. */
    qualityScore: number | null;
    errors: number;
    warnings: number;
    info: number;
}
export interface ElementSelectedEvent {
    expressId: number;
    modelId: string | null;
    ifcType: string;
    name: string;
}
/** A loaded model, as returned by getModels(). */
export interface ModelSummary {
    id: string;
    fileName: string;
    elementCount: number;
}
/** Validation summary returned by getValidation(). */
export interface ValidationSummary {
    qualityScore: number | null;
    errors: number;
    warnings: number;
    info: number;
}
/** Per-model stats for dashboard charts (getStats()). */
export interface ModelStats {
    id: string;
    fileName: string;
    elementCount: number;
    fileSize: number;
    categories: Array<{
        type: string;
        label: string;
        count: number;
    }>;
}
export interface StatsResult {
    elementCount: number;
    models: ModelStats[];
}
/** A validation issue for a dashboard table (getIssues()). */
export interface ValidationIssue {
    ruleId: string;
    severity: 'error' | 'warning' | 'info';
    expressId: number;
    modelId: string | null;
    ifcClass: string;
    elementName: string;
    message: string;
    globalId: string | null;
    autoFixable: boolean;
}
export interface IssuesResult {
    qualityScore: number | null;
    total: number;
    issues: ValidationIssue[];
}
/** Result of an IDS (Information Delivery Specification) check. */
export interface IdsSpecResult {
    name: string;
    status: 'pass' | 'fail' | 'na';
    applicableCount: number;
    passedCount: number;
    failedCount: number;
    failures: Array<{
        expressId: number;
        ifcClass: string;
        name: string;
        /** IFC GlobalId (22-char GUID) of the failing element, when available (since v1.7.0). */
        globalId?: string | null;
        /** Human-readable (English) failure reasons. Stable since v1.5.0. */
        reasons: string[];
        /** Structured machine-readable reasons (additive since v1.5.x). */
        reasonCodes?: Array<{
            code: string;
            params?: Record<string, string | number>;
        }>;
    }>;
    unsupported: string[];
}
export interface IdsResult {
    title?: string;
    score: number;
    totalSpecs: number;
    passedSpecs: number;
    failedSpecs: number;
    naSpecs: number;
    specs: IdsSpecResult[];
}
/** Per-rule severity. `ignored` rules are skipped (don't affect the score). */
export type EirSeverity = 'error' | 'warning' | 'info' | 'ignored';
/** Numeric comparison operator for a `numeric` rule. */
export type EirOperator = '>' | '>=' | '<' | '<=' | '=';
/** A single EIR validation rule. `entity` is the IFC class it applies to. */
export type EirRule = {
    id?: string;
    entity: string;
    predefinedType?: string;
    severity: EirSeverity;
    message?: string;
} & ({
    type: 'entityExists';
} | {
    type: 'requiredProperty';
    pset?: string;
    property: string;
} | {
    type: 'requiredPropertySet';
    pset: string;
} | {
    type: 'propertyNotEmpty';
    pset?: string;
    property: string;
} | {
    type: 'propertyEquals';
    pset?: string;
    property: string;
    value: string;
} | {
    type: 'numeric';
    pset?: string;
    property: string;
    operator: EirOperator;
    value: number;
} | {
    type: 'allowedValues';
    pset?: string;
    property: string;
    values: string[];
} | {
    type: 'regex';
    target?: 'property' | 'attribute';
    pset?: string;
    property: string;
    pattern: string;
} | {
    type: 'classification';
    system?: string;
    value?: string;
});
/** A complete EIR validation profile. */
export interface EirProfile {
    id?: string;
    name: string;
    version?: number;
    description?: string;
    rules: EirRule[];
}
/** Structured IFC data returned by getElement() (name, GlobalId, property sets…). */
export interface IfcElementData {
    name: string | null;
    globalId: string | null;
    objectType: string | null;
    tag: string | null;
    storey: string | null;
    propertySets: Array<{
        name: string;
        properties: Array<{
            name: string;
            value: unknown;
        }>;
    }>;
    quantitySets: Array<{
        name: string;
        quantities: Array<{
            name: string;
            value: number | null;
        }>;
    }>;
    [k: string]: unknown;
}
export interface Vec3 {
    x: number;
    y: number;
    z: number;
}
/**
 * A point read off a scan while inspect mode is armed.
 *
 * `sourcePosition` is the point in the FILE's own coordinates — the number a
 * survey record already holds — which is why it travels alongside the scene
 * position rather than instead of it.
 */
export interface PointCloudPickedEvent {
    cloudId: string;
    /** Scene metres. */
    position: {
        x: number;
        y: number;
        z: number;
    };
    /** The file's own coordinates, in its own units. */
    sourcePosition: {
        x: number;
        y: number;
        z: number;
    };
    /** ASPRS classification code, when the file carried one. */
    classification: number | null;
    /** 0-255, when the file carried intensity. */
    intensity: number | null;
    /** Distance from the camera, scene metres. */
    distance: number;
}
export interface IfcViewerEventMap {
    ready: ReadyEvent;
    'model-loaded': ModelLoadedEvent;
    'model-error': ModelErrorEvent;
    'model-progress': ModelProgressEvent;
    'validation-completed': ValidationCompletedEvent;
    'element-selected': ElementSelectedEvent;
    'pointcloud-picked': PointCloudPickedEvent;
}
/** Languages the viewer ships with — code + native label, for building a picker. */
export declare const LANGUAGES: ReadonlyArray<{
    code: string;
    label: string;
}>;
type Listener<T> = (payload: T) => void;
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
    id: string;
    fileName: string;
    format: 'las' | 'laz' | 'copc' | 'ply' | 'xyz';
    status: 'parsing' | 'ready' | 'error';
    /** Points resident in the viewer right now. */
    pointCount: number;
    /** Points the file's header declares, when it declares any. */
    declaredCount: number | null;
    /** True when the parse stopped at the budget — the file holds more. */
    truncated: boolean;
    visible: boolean;
    /** EPSG code the scan declares, or null. */
    crs: string | null;
    /**
     * Which axis the SOURCE treats as up, and where that came from.
     *
     * `declared` means the format states it — LAS and its relatives define Z as
     * elevation. `assumed` means it was inferred from the shape of the scan,
     * because PLY, PCD and text say nothing at all; a host showing scans from
     * phones or photogrammetry should expect this and may want to offer the
     * correction itself. `user` means someone already corrected it.
     */
    upAxis: 'y' | 'z';
    upAxisSource: 'declared' | 'assumed' | 'user';
    /** The manual placement on top of the derived alignment. */
    placement: PointCloudPlacement;
    alignment: {
        rung: 'map-conversion' | 'shared-crs' | 'geographic' | 'local' | 'manual';
        confidence: 'exact' | 'high' | 'approximate' | 'manual';
    } | null;
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
    x: number;
    y: number;
    z: number;
    /** Degrees about scene +Y. */
    yawDeg: number;
    /** Degrees about scene +X and +Z. Levelling only, ±45. */
    pitchDeg: number;
    rollDeg: number;
    /** Uniform multiplier, 1 = none. */
    scaleMul: number;
}
/** Appearance controls shared by every loaded scan. */
export interface PointCloudDisplayOptions {
    pointSize?: number;
    attenuate?: boolean;
    opacity?: number;
    colorMode?: 'rgb' | 'intensity' | 'elevation' | 'classification' | 'flat';
    flatColor?: number;
    /** 0.05-1. Fraction of the render budget to use. */
    density?: number;
    /** 0-1. Hides points below this confidence, for files that carry one. */
    confidenceThreshold?: number;
    round?: boolean;
}
export declare class IfcViewer {
    /** Languages the viewer ships with (code + native label). */
    static readonly LANGUAGES: readonly {
        code: string;
        label: string;
    }[];
    /** Just the language codes, for convenience. */
    static readonly SUPPORTED_LANGUAGES: string[];
    /** Create a viewer and resolve once it is ready to accept commands. */
    static create(target: string | HTMLElement, options?: IfcViewerOptions): Promise<IfcViewer>;
    readonly version = "1.9.0";
    readonly iframe: HTMLIFrameElement;
    private readonly baseUrl;
    private readonly appOrigin;
    private readonly opts;
    private readonly loadTimeout;
    private _ready;
    private languages;
    private readyResolvers;
    private readonly pending;
    private readonly requests;
    private loadChain;
    private reqCounter;
    private listeners;
    private disposed;
    constructor(target: string | HTMLElement, options?: IfcViewerOptions);
    /** True once the iframe viewer has signalled readiness. */
    get isReady(): boolean;
    /** Resolves when the viewer is ready to accept commands. */
    whenReady(): Promise<void>;
    /** Load IFC bytes from the host app. Resolves once the model is rendered. */
    add(name: string, bytes: ArrayBuffer | Uint8Array): Promise<ModelLoadedEvent>;
    /** Load a model from a public (CORS-enabled) URL. */
    addFromUrl(url: string, name?: string): Promise<ModelLoadedEvent>;
    /** Select + frame an element by its IFC expressID. */
    select(expressId: number, modelId?: string): void;
    /** Isolate a category by IFC class (e.g. "IfcWall"); omit to clear. */
    isolate(ifcType?: string): void;
    /** Frame the active model. */
    fit(): void;
    /** Reset the camera to its default position. */
    reset(): void;
    /** Fly to a named camera view (iso/top/front/right/left/back/bottom). */
    setView(view: CameraView): void;
    /** Change the UI language at runtime (no-ops for unsupported codes). */
    setLanguage(lang: string): void;
    /** Remove all loaded models from the scene. */
    clear(): void;
    /** Restore full visibility (clear hidden elements + category/element isolation). */
    showAll(): void;
    /**
     * Language codes the viewer supports. Reflects what the iframe advertised on
     * `ready`; falls back to the bundled list before then. See `IfcViewer.LANGUAGES`
     * for code + native label pairs to build a picker.
     */
    getLanguages(): string[];
    /** List the models currently loaded in the scene. */
    getModels(): Promise<ModelSummary[]>;
    /** Fetch an element's IFC data (attributes + property/quantity sets), or null. */
    getElement(expressId: number, modelId?: string): Promise<IfcElementData | null>;
    /** Fetch the current validation summary (Health Score + counts), or null. */
    getValidation(): Promise<ValidationSummary | null>;
    /** Capture the current 3D view as a PNG data URL. */
    screenshot(): Promise<string>;
    /** Aggregate model stats (element counts per category) for dashboard charts. */
    getStats(): Promise<StatsResult>;
    /** Validation issues for a dashboard table. Optionally filter by severity / cap count. */
    getIssues(opts?: {
        severity?: 'error' | 'warning' | 'info';
        limit?: number;
    }): Promise<IssuesResult>;
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
    addPointCloud(fileName: string, bytes: ArrayBuffer | Uint8Array): Promise<string>;
    /** Add a scan the viewer fetches itself. The URL must allow CORS. */
    addPointCloudFromUrl(url: string, fileName?: string): Promise<string>;
    /** Every scan currently loaded. See PointCloudInfo on reading the counts. */
    listPointClouds(): Promise<PointCloudInfo[]>;
    /** Remove one scan and free its GPU buffers. */
    removePointCloud(cloudId: string): Promise<void>;
    /** Remove every scan. */
    clearPointClouds(): Promise<void>;
    /** Show or hide one scan without unloading it. */
    setPointCloudVisible(cloudId: string, visible: boolean): Promise<void>;
    /** Frame the camera on a scan (or the first one loaded). */
    fitPointCloud(cloudId?: string): Promise<void>;
    /**
     * Appearance, shared by every scan. Each setting is a shader uniform or a
     * draw-range change, so these are instant even on a 20-million-point cloud.
     */
    setPointCloudDisplay(display: PointCloudDisplayOptions, renderBudget?: number): Promise<void>;
    /**
     * Arm (or disarm) click-to-read on the scan. While armed, clicking a point
     * emits `pointcloud-picked` — which carries the point's coordinates IN THE
     * FILE alongside the scene ones, since that is the number a survey record
     * will already hold. Clicks are read in the capture phase, so inspecting a
     * scan never doubles as selecting the IFC element behind it.
     */
    inspectPointCloud(enabled?: boolean): Promise<void>;
    /**
     * Nudge a scan by hand: position, yaw, levelling, scale. Partial — anything
     * omitted is left alone. Values are clamped by the viewer, so a host cannot
     * put a scan somewhere only a reset escapes from.
     *
     * This sits on top of the derived alignment rather than replacing it, so it
     * survives a re-alignment and is persisted per file.
     */
    setPointCloudPlacement(placement: Partial<PointCloudPlacement>, cloudId?: string): Promise<void>;
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
    setPointCloudUpAxis(axis: 'y' | 'z', cloudId?: string): Promise<void>;
    /** Check the loaded model against a buildingSMART IDS (.ids XML string). */
    checkIds(idsXml: string): Promise<IdsResult>;
    /**
     * Check the loaded model against an EIR / BIM Validation profile (ISO 19650-style).
     * Accepts a profile object or its JSON string; the compact shorthand
     * (`{ entity, requiredProperties: [...] }`) is also accepted. Returns the same
     * IdsResult shape as checkIds (the profile compiles to IDS internally). Since v1.7.0.
     */
    checkEir(profile: EirProfile | string): Promise<IdsResult>;
    /** Unload a specific model by id (see getModels()). */
    removeModel(modelId: string): void;
    /** Hide a set of elements (by IFC expressID). Defaults to the active model. */
    hideElements(expressIds: number[], modelId?: string): void;
    /** Show a previously hidden set of elements. Defaults to the active model. */
    showElements(expressIds: number[], modelId?: string): void;
    /** Place the camera at `position` looking along `direction`. */
    setCamera(position: Vec3, direction: Vec3): void;
    /** Subscribe to a viewer event. Returns an unsubscribe function. */
    on<K extends keyof IfcViewerEventMap>(event: K, cb: Listener<IfcViewerEventMap[K]>): () => void;
    off<K extends keyof IfcViewerEventMap>(event: K, cb: Listener<IfcViewerEventMap[K]>): void;
    /** Tear down the viewer and remove the iframe. */
    dispose(): void;
    private buildSrc;
    /** Queue a load so only one runs at a time; resolves with that load's result. */
    private enqueueLoad;
    private runLoad;
    private settle;
    private nextRequestId;
    /** Fire-and-forget command, sent once the viewer is ready. */
    private send;
    /** Send a query and resolve with the iframe's `result` payload. */
    private request;
    private post;
    private readonly onMessage;
    private emit;
}
export declare class IfcViewerElement extends HTMLElement {
    private _viewer;
    static get observedAttributes(): string[];
    /** The underlying IfcViewer instance (null before connected). */
    get viewer(): IfcViewer | null;
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(name: string, _old: string | null, val: string | null): void;
    add(name: string, bytes: ArrayBuffer | Uint8Array): Promise<ModelLoadedEvent>;
    addFromUrl(url: string, name?: string): Promise<ModelLoadedEvent>;
    select(expressId: number, modelId?: string): void;
    isolate(ifcType?: string): void;
    getStats(): Promise<StatsResult>;
    getIssues(opts?: {
        severity?: 'error' | 'warning' | 'info';
        limit?: number;
    }): Promise<IssuesResult>;
    screenshot(): Promise<string>;
    addPointCloud(name: string, bytes: ArrayBuffer | Uint8Array): Promise<string>;
    addPointCloudFromUrl(url: string, name?: string): Promise<string>;
    listPointClouds(): Promise<PointCloudInfo[]>;
    removePointCloud(cloudId: string): Promise<void>;
    clearPointClouds(): Promise<void>;
    setPointCloudVisible(cloudId: string, visible: boolean): Promise<void>;
    fitPointCloud(cloudId?: string): Promise<void>;
    setPointCloudDisplay(display: PointCloudDisplayOptions, renderBudget?: number): Promise<void>;
    inspectPointCloud(enabled?: boolean): Promise<void>;
}
/** Register the <ifc-viewer> element (idempotent). Auto-called on import. */
export declare function defineIfcViewerElement(tag?: string): void;
export default IfcViewer;
