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
export interface IfcViewerEventMap {
    ready: ReadyEvent;
    'model-loaded': ModelLoadedEvent;
    'model-error': ModelErrorEvent;
    'model-progress': ModelProgressEvent;
    'validation-completed': ValidationCompletedEvent;
    'element-selected': ElementSelectedEvent;
}
/** Languages the viewer ships with — code + native label, for building a picker. */
export declare const LANGUAGES: ReadonlyArray<{
    code: string;
    label: string;
}>;
type Listener<T> = (payload: T) => void;
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
    readonly version = "1.7.0";
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
}
/** Register the <ifc-viewer> element (idempotent). Auto-called on import. */
export declare function defineIfcViewerElement(tag?: string): void;
export default IfcViewer;
