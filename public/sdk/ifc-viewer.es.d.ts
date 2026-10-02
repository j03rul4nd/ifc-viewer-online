// Type definitions for the IFC Viewer SDK (ifc-viewer.es.js).
// GENERATED from src/sdk/ifc-viewer-sdk.ts by `npm run build:sdk` — do not edit.
export type IfcViewerPreset = 'minimal' | 'full' | 'kiosk' | 'client' | 'article';
export type CameraView = 'iso' | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';
/**
 * What a view frames when several models or scans are loaded: `auto` (default)
 * = everything visible, narrowed to the active group when the scene spans
 * distant sites; `active` = the active model; `group` = its group; `all` = all.
 */
export type CameraScope = 'auto' | 'active' | 'group' | 'all';
/** Options of {@link IfcViewer.frame}. */
export interface FrameOptions {
    /** Preset the angles default to. Default `'iso'`. */
    view?: CameraView;
    scope?: CameraScope;
    /** Share of the frame the model fills, 0.2–0.98. Default 0.85. */
    fill?: number;
    /** Degrees from +x towards +z (scene axes). */
    azimuth?: number;
    /** Degrees above the horizon. */
    elevation?: number;
    /** Fly (default) or jump. */
    animate?: boolean;
}
export interface IfcViewerOptions {
    /** App base URL. Defaults to the parent of this script's URL. */
    baseUrl?: string;
    /** Chrome preset. Default 'minimal'. */
    ui?: IfcViewerPreset;
    /** Run validation on load (drives the Health Score). Default true. */
    validate?: boolean;
    /** Open the validation panel automatically. Default false. */
    panel?: boolean;
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
    panels?: PanelName[];
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
    /**
     * Scene background from the first frame: a preset (`'white'`, `'paper'`,
     * `'blueprint'`, `'sky'`, `'studio'`), one colour (`'#f4f4f5'`) or a
     * top,bottom gradient (`'#dbeafe,#ffffff'`). Since v1.11.0.
     */
    background?: BackgroundSpec;
    /**
     * Put the model on the map once it loads, from its own georeference. `true`
     * for the map alone, or the layers to add. Map tiles and OpenStreetMap come
     * from third parties — see {@link IfcViewer.setSiteContext} on consent.
     * Since v1.11.0.
     */
    map?: boolean | Array<'terrain' | 'buildings' | 'showcase'>;
    /**
     * Open the sun study at this SITE-LOCAL time once the model loads:
     * `'06-21T18:00'` (every year) or `'2026-12-21T09:30'`. Only honoured when
     * the model's location is known. Since v1.11.0.
     */
    solar?: string;
    /** With `solar`: light the moon too. Since v1.11.0. */
    moon?: boolean;
    /** Point clouds to fetch alongside the model (CORS-enabled URLs). Since v1.11.0. */
    scans?: string[];
    /**
     * Once every model has loaded, frame them from this view with a tight fit —
     * the model fills `fill` of the frame. `ui: 'article'` implies `'iso'`.
     * See {@link IfcViewer.frame}. Since v1.14.0.
     */
    view?: CameraView;
    /** With `view`: share of the frame the model fills, 0.2–0.98. Default 0.85. Since v1.14.0. */
    fill?: number;
    /**
     * `'ctrl'`: the mouse wheel scrolls your page and zooms only with Ctrl/⌘
     * held, like an embedded map — for a viewer in the middle of an article.
     * `ui: 'article'` implies it. Since v1.14.0.
     */
    wheel?: 'always' | 'ctrl';
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
/** Every tool that can appear on the viewer's panel rail. */
export type PanelName = 'properties' | 'scene' | 'measurement' | 'section' | 'plans' | 'map' | 'solar' | 'pointcloud' | 'mesh';
export interface PanelsResult {
    /** The panel currently open, or null when none is. */
    open: PanelName | null;
    /**
     * The panels on offer right now — the chrome and the loaded content decide.
     * A tool missing from this list cannot be opened; it is not merely disabled.
     */
    available: {
        id: PanelName;
        label: string;
        open: boolean;
    }[];
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
    id: string;
    /** `name` as mapped. Absent on most buildings, and never invented. */
    name?: string;
    /** What it is, in one phrase: 'School', 'Train station'. */
    label?: string;
    /** Which layer: building, water, green, bridge, tree. */
    featureKind: string;
    /** Metres. */
    heightM?: number;
    /** True when the height was inferred from tags rather than surveyed. */
    heightEstimated: boolean;
}
/** A background preset name. */
export type BackgroundPreset = 'studio' | 'white' | 'paper' | 'blueprint' | 'sky';
/**
 * A scene background: a preset name, `'#rrggbb'`, `'#top,#bottom'` (gradient),
 * or `{ top, bottom? }`.
 */
export type BackgroundSpec = BackgroundPreset | string | {
    preset: BackgroundPreset;
} | {
    top: string;
    bottom?: string;
};
/** The background the viewer resolved, as returned by setBackground/getBackground. */
export interface BackgroundState {
    preset: BackgroundPreset | 'custom';
    mode: 'solid' | 'gradient';
    top: string;
    bottom: string;
}
/** Where the camera is and what it looks at, in scene metres (Y up). */
export interface CameraState {
    position: Vec3;
    target: Vec3;
    direction: Vec3;
    up?: Vec3;
    fovDeg: number;
}
/** First-person walk mode. */
export interface WalkState {
    active: boolean;
    /** Metres per second at a walk. */
    speed: number;
}
/** Options for {@link IfcViewer.setSolar}. Omitted fields are left alone. */
export interface SolarOptions {
    /** Start (default) or stop the study. */
    active?: boolean;
    /** Site-local date: `'YYYY-MM-DD'`, or `'MM-DD'` for this year. */
    date?: string;
    /** Site-local time, `'HH:MM'`. */
    time?: string;
    moon?: boolean;
    /** Physically-based sky dome. */
    sky?: boolean;
    quality?: 'standard' | 'high';
    /**
     * Where the site is, when the IFC does not say. Without it, a model with no
     * georeference is an error — never a silent default city.
     */
    location?: {
        lat: number;
        lon: number;
    };
}
export interface SolarState {
    active: boolean;
    /** Site-local. */
    date: string;
    time: string;
    /** IANA zone of the site, e.g. `Europe/Madrid`. */
    timeZone: string;
    moon: boolean;
    sky: boolean;
    quality: 'standard' | 'high';
    /** `source: 'ifc'` is the model's own georeference; `manual` was typed or passed. */
    location: {
        lat: number;
        lon: number;
        source: 'ifc' | 'map' | 'manual' | 'default';
    } | null;
}
/** Options for {@link IfcViewer.setSiteContext}. Omitted fields are left alone. */
export interface SiteContextOptions {
    /** Map mode on (default) or off. */
    enabled?: boolean;
    /** 3D terrain relief. */
    terrain?: boolean;
    /** OpenStreetMap surroundings: buildings, water, parks, roads… */
    buildings?: boolean;
    /** Per-layer switches, e.g. `{ tree: false, water: true }`. */
    layers?: Record<string, boolean>;
    /** Facade fidelity of the surroundings. `showcase` adds authored props. */
    detail?: 'simple' | 'detailed' | 'showcase';
    terrainStyle?: 'imagery' | 'shaded' | 'hypsometric' | 'slope' | 'ecosystem';
    /** Terrain vertical exaggeration, 1–3. */
    exaggeration?: number;
    /** Decorative cars and trains. */
    vehicles?: boolean;
}
export interface SiteContextState {
    enabled: boolean;
    status: string;
    terrain: boolean;
    buildings: boolean;
    buildingsStatus: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
    detail: 'simple' | 'detailed' | 'showcase';
    terrainStyle: string;
    exaggeration: number;
    vehicles: boolean;
    placement: {
        lat: number;
        lon: number;
        rotationDeg: number;
        source: string;
        confidence: 'high' | 'approximate';
    } | null;
    /** Credits for what is on screen. Show them wherever you show the map. */
    attributions: string[];
}
/** One section plane. `offset` is in IFC metres along `axis` (Z = up). */
export interface SectionPlane {
    id: string;
    kind: 'axis' | 'face';
    axis: 'x' | 'y' | 'z' | null;
    enabled: boolean;
    offset: number;
    flipped: boolean;
    /** The model's extent along the axis — the offsets that cut something. */
    range: {
        min: number;
        max: number;
    };
}
export interface SectionsState {
    planes: SectionPlane[];
    box: {
        enabled: boolean;
        ranges: Record<'x' | 'y' | 'z', {
            min: number;
            max: number;
        }>;
    } | null;
    /** Enabled cuts, the box counting as one. */
    active: number;
    /** Storeys, for plan cuts — only on getSections(). */
    levels?: Array<{
        name: string;
        y: number;
    }>;
}
/** Options for {@link IfcViewer.addSection}. */
export interface AddSectionOptions {
    /** Cut axis in IFC terms. `z` (default) is a plan cut, `x`/`y` are sections. */
    axis?: 'x' | 'y' | 'z';
    /** Where to cut, IFC metres along the axis. Default: mid-model. */
    offset?: number;
    /**
     * A plan cut at a storey — its name (case-insensitive) or index from
     * `getSections().levels`. Cuts 1.2 m above that floor. Overrides axis/offset.
     */
    level?: string | number;
    /** Keep the other side. */
    flip?: boolean;
}
export type MeasureTool = 'distance' | 'path' | 'area' | 'angle' | 'point';
/**
 * One measurement. `value` is always SI — metres, square metres for an area,
 * degrees for an angle — whatever unit the viewer displays; null for a point.
 */
export interface Measurement {
    id: string;
    kind: MeasureTool;
    /** Set when someone renamed it. */
    name: string | null;
    value: number | null;
    /** Areas. */
    perimeter?: number;
    /** Areas: false when the traced outline is not flat (value is projected). */
    planar?: boolean;
    /** Distances, split into IFC axes; `horizontal` is the plan length. */
    components?: {
        dx: number;
        dy: number;
        dz: number;
        horizontal: number;
    };
    /** Points: coordinates in the model's own IFC frame (or the scene's). */
    coords?: Vec3;
    frame?: 'model' | 'scene';
    /** The picked points, scene metres. */
    points: Vec3[];
}
export interface MeasurementsState {
    /** The armed tool, or 'none'. */
    tool: MeasureTool | 'none';
    /** What the viewer displays. `value` is SI regardless. */
    units: 'm' | 'cm' | 'mm' | 'ft';
    items: Measurement[];
}
/** The built-in tour templates. */
export type TourTemplate = 'social' | 'client-walkthrough' | 'technical-review';
/** One stop of a host-authored tour. Positions in scene metres (Y up) — take them from getCamera(). */
export interface TourStepInput {
    position: Vec3;
    target: Vec3;
    caption?: string;
    /** Elements (expressIDs) to highlight at this stop. */
    highlight?: number[];
    /** IFC classes to isolate at this stop, e.g. ['IfcWall', 'IfcSlab']. */
    isolate?: string[];
    modelId?: string;
}
export interface TourInput {
    title?: string;
    steps: TourStepInput[];
}
/**
 * `true` advances at the default pace (6 s per stop); a number is ms per stop
 * (1 500–120 000). The tour ends after the last stop.
 */
export type TourAutoplay = boolean | number;
export interface TourState {
    playing: boolean;
    title: string | null;
    template: TourTemplate | null;
    stepIndex: number | null;
    total: number;
    /** The stops, in the shape playTour() takes — save them to replay the tour later. */
    steps: Array<Required<Omit<TourStepInput, 'modelId' | 'caption'>> & {
        caption: string | null;
        modelId: string | null;
    }>;
}
export interface TourStepEvent {
    index: number;
    total: number;
    caption: string | null;
}
/** A built-in director recipe, as getPresentationRecipes() lists it. */
export interface PresentationRecipe {
    id: string;
    name: string;
    format: 'wide' | 'linkedin' | 'square' | 'reel' | 'tiktok';
    targetSec: number;
    style: 'classic' | 'launch' | 'motion';
    look: string | null;
    sections: string[];
}
/** Overrides applied on top of a recipe. */
export interface PresentationOptions {
    /** Output shape: `wide` 16:9, `linkedin` 4:5, `square`, `reel` / `tiktok` 9:16. */
    format?: PresentationRecipe['format'];
    /** Target length, 5–180 s; the director fits the shots to it. */
    targetSec?: number;
    pace?: 'calm' | 'normal' | 'fast';
    /** Opening title card text. */
    title?: string;
    /** Closing call to action. */
    cta?: string;
    /** Narrated captions on or off. */
    captions?: boolean;
    /** `'none'` for a silent video. */
    music?: 'none';
    watermark?: boolean;
}
export interface PresentationState {
    open: boolean;
    clips: number;
    durationSec: number;
    width: number;
    height: number;
}
export interface PresentationVideo {
    /** The encoded file (MP4, or WebM where the browser cannot encode MP4). Transferred, not copied. */
    bytes: ArrayBuffer;
    mimeType: string;
    sizeBytes: number;
}
export interface PresentationProgressEvent {
    stage: 'generate' | 'export';
    label?: string;
    /** 0–1, or null while indeterminate. */
    progress: number | null;
}
/** Quick-start cover recipes: they pick template, format and look, and capture the views they need. */
export type CoverRecipe = 'pinterest' | 'carousel' | 'post' | 'client' | 'board' | 'sheet' | 'story' | 'coordination';
/** The texts a cover template can show. Omitted fields keep what the studio has. */
export interface CoverText {
    title?: string;
    subtitle?: string;
    client?: string;
    location?: string;
    date?: string;
    studio?: string;
    tagline?: string;
    concept?: string;
    /** Shown as text and, when the template has one, as a QR code. */
    website?: string;
}
export interface CoverOptions {
    /** Run a recipe first (it captures the views it needs). */
    recipe?: CoverRecipe;
    /** A template id from getCoverOptions(), e.g. 'editorial', 'magazine', 'datasheet'. */
    template?: string;
    /** A format id, e.g. 'pinterest', 'instagram', 'linkedin', 'story', 'slide', 'a4', 'board'. */
    format?: string;
    /** A palette id, or 'image' / 'image-dark' to take the colours from the render. */
    palette?: string;
    text?: CoverText;
}
export interface CoverState {
    template: string;
    format: string;
    palette: string;
    mode: 'single' | 'deck' | string;
    /** Views captured from the model. */
    shots: number;
    /** Pages the export will produce (1 for a single cover). */
    slides: number;
    text: Required<CoverText>;
}
export interface CoverCatalog {
    recipes: CoverRecipe[];
    templates: string[];
    formats: Array<{
        id: string;
        width: number;
        height: number;
        ratio: string;
    }>;
    palettes: string[];
}
export interface CoverFile {
    /** The file, transferred (not copied). */
    bytes: ArrayBuffer;
    mimeType: string;
    sizeBytes: number;
    /** Pages in the document the export came from. */
    slides: number;
}
/** A group of models (and point clouds) in the scene. */
export interface SceneGroup {
    id: string;
    name: string;
    /** True for a group someone created — only those can be renamed, deleted or filled. */
    user: boolean;
    /** How it was formed: 'user', or the evidence the viewer grouped by (project, site, location, single). */
    basis: string;
    modelIds: string[];
    cloudIds: string[];
}
export interface SceneGroupsState {
    groups: SceneGroup[];
    /** Point clouds in no group. */
    looseCloudIds: string[];
}
export interface IfcViewerEventMap {
    ready: ReadyEvent;
    'model-loaded': ModelLoadedEvent;
    'model-error': ModelErrorEvent;
    'model-progress': ModelProgressEvent;
    'validation-completed': ValidationCompletedEvent;
    'element-selected': ElementSelectedEvent;
    'pointcloud-picked': PointCloudPickedEvent;
    'map-feature-picked': MapFeaturePickedEvent;
    /** Walk mode turned on or off — by the visitor (G / Esc) or by the host. Since v1.11.0. */
    'walk-changed': WalkState;
    /** A measurement was added, removed or renamed. Carries the whole list. Since v1.11.0. */
    'measurements-changed': MeasurementsState;
    /** A tour began playing — started by the host or by the visitor. Since v1.12.0. */
    'tour-started': {
        title: string;
        total: number;
        template: TourTemplate | null;
    };
    /** The tour moved to another stop. Since v1.12.0. */
    'tour-step': TourStepEvent;
    /** The tour stopped; `completed` when it had reached the last stop. Since v1.12.0. */
    'tour-ended': {
        completed: boolean;
    };
    /** The director is generating or exporting a presentation. Since v1.12.0. */
    'presentation-progress': PresentationProgressEvent;
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
/** What an imported model brought with it. Drives the triangle budget too. */
export interface MeshStats {
    meshes: number;
    triangles: number;
    materials: number;
    textures: number;
    /** Estimated from image dimensions, not from file size. */
    textureBytes: number;
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
    id: string;
    fileName: string;
    format: 'glb' | 'gltf' | 'obj';
    status: 'loading' | 'ready' | 'error';
    visible: boolean;
    stats: MeshStats;
    /** Source unit → metre. 1, 0.01, 0.001 or 0.3048. */
    unitScale: number;
    unitSource: 'assumed' | 'user';
    upAxis: 'y' | 'z';
    /** 'declared' only for glTF, whose specification mandates Y-up. */
    upAxisSource: 'declared' | 'assumed' | 'user';
    placement: PointCloudPlacement;
}
/** One file of an import: the model itself, or something it references. */
export interface MeshFileInput {
    name: string;
    bytes: ArrayBuffer;
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
    readonly version = "1.14.0";
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
    /** Fly to a named camera view (iso/top/front/right/left/back/bottom), optionally framing a scope. */
    setView(view: CameraView, scope?: CameraScope): void;
    /**
     * Frame the scene for presentation (v1.14): the model FILLS the frame.
     *
     * `fill` is the share of the frame the model takes on its tighter axis
     * (0.2–0.98, default 0.85), fitted to the box's corners rather than its
     * bounding sphere. `azimuth` / `elevation` (degrees) look from any angle;
     * they default to the `view` preset's own. Resolves once the camera is set.
     *
     * ```js
     * await viewer.frame({ view: 'iso', fill: 0.9 })
     * await viewer.frame({ azimuth: 200, elevation: 35, animate: false })
     * ```
     */
    frame(options?: FrameOptions): Promise<{
        scope: CameraScope;
    }>;
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
    /**
     * Add a scan the viewer fetches itself. The URL must allow CORS. Without a
     * `fileName` the viewer names the scan from the URL's path — a signed URL's
     * query is never part of the name (its extension is what picks the reader).
     */
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
    addMesh(files: MeshFileInput[]): Promise<string>;
    /**
     * Import a model the viewer fetches itself. Pass every URL the model needs —
     * the `.gltf` AND its `.bin` and textures; they are downloaded one after
     * another, with progress in the viewer's Loading Center. The entry is the
     * first URL whose path names a .glb / .gltf / .obj. All must allow CORS.
     */
    addMeshFromUrl(urls: string | string[]): Promise<string>;
    /** Every model currently imported. See MeshInfo on trusting unit and axis. */
    listMeshes(): Promise<MeshInfo[]>;
    /** Remove one import and free its geometry, materials and textures. */
    removeMesh(meshId?: string): Promise<void>;
    /** Remove every import. */
    clearMeshes(): Promise<void>;
    /** Show or hide an import without unloading it. */
    setMeshVisible(visible: boolean, meshId?: string): Promise<void>;
    /** Frame the camera on an import (or on all of them). */
    fitMesh(meshId?: string): Promise<void>;
    /**
     * Place an import by hand: position, yaw, levelling, scale. Partial — anything
     * omitted is left alone, and the viewer clamps what it is given.
     *
     * An import starts centred on the IFC and sitting on its floor, so this is a
     * correction rather than the only thing standing between the model and the
     * world origin.
     */
    setMeshPlacement(placement: Partial<PointCloudPlacement>, meshId?: string): Promise<void>;
    /**
     * Correct which axis the source treats as up.
     *
     * Only meaningful for OBJ: glTF's specification mandates Y-up, so a `.glb` or
     * `.gltf` reports `upAxisSource: 'declared'` and this has nothing to fix.
     */
    setMeshUpAxis(axis: 'y' | 'z', meshId?: string): Promise<void>;
    /**
     * Correct the source unit — 1 for metres, 0.01 centimetres, 0.001
     * millimetres, 0.3048 feet.
     *
     * None of these formats records a unit, so the viewer infers one from the size
     * of the model: a 12-metre building arriving as 12 000 units is
     * indistinguishable from a 12 km one except by plausibility. When that guess
     * is wrong, this is the fix.
     */
    setMeshUnit(unitScale: number, meshId?: string): Promise<void>;
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
    /**
     * Change the scene background. A preset (`'white'`, `'paper'`, `'blueprint'`,
     * `'sky'`, `'studio'`), `'#rrggbb'`, `'#top,#bottom'` or `{ top, bottom? }`.
     * Rejects on anything else rather than painting a guess.
     */
    setBackground(background: BackgroundSpec): Promise<BackgroundState>;
    /** The current scene background. */
    getBackground(): Promise<BackgroundState>;
    /** Re-theme the viewer's UI accent at runtime (`#rrggbb`). */
    setAccent(color: string): Promise<void>;
    /**
     * Switch the client skin on or off — the stakeholder view: no technical
     * panels, a clean Health Score badge. Same as `ui: 'client'`, at runtime.
     */
    setClientMode(enabled: boolean): Promise<void>;
    /**
     * `'quality'` turns on the heavier rendering (ambient occlusion, softer
     * shadows) — for a hero shot or a screenshot; `'standard'` for everyday.
     */
    setRenderQuality(quality: 'standard' | 'quality'): Promise<void>;
    /** Where the camera is and what it looks at — save it, restore it with lookAt. */
    getCamera(): Promise<CameraState | null>;
    /**
     * Fly the camera to `position`, looking at `target` (scene metres, Y up).
     * Pairs with getCamera() for "saved views" in your own UI.
     */
    lookAt(position: Vec3, target: Vec3, animate?: boolean): Promise<void>;
    /**
     * First-person walk mode: WASD / arrows to move, drag to look, Esc to leave.
     * `speed` is metres per second. Emits `walk-changed`.
     */
    setWalkMode(enabled: boolean, opts?: {
        speed?: number;
    }): Promise<WalkState>;
    /** Whether walk mode is on, and at what speed. */
    getWalkState(): Promise<WalkState>;
    /**
     * Start or change the sun & moon study: real shadows at a site-local date and
     * time. The site comes from the IFC's georeference, then the map placement;
     * pass `location` for a model that has none — without one, this rejects
     * instead of lighting the model as if it stood in some default city.
     *
     *   await viewer.setSolar({ date: '06-21', time: '18:00' })
     */
    setSolar(opts?: SolarOptions): Promise<SolarState>;
    /** The sun study's state: date, time and zone, and where the site is. */
    getSolar(): Promise<SolarState>;
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
    setSiteContext(opts?: SiteContextOptions): Promise<SiteContextState>;
    /** Map mode's state, placement and the attributions you must display. */
    getSiteContext(): Promise<SiteContextState>;
    /**
     * Add a section plane. `{ level: 'Level 1' }` is a floor plan at that storey;
     * `{ axis: 'x', offset: 4.5 }` a section at 4.5 m. Resolves with the new
     * plane's `id` and every plane now in the scene.
     */
    addSection(opts?: AddSectionOptions): Promise<SectionsState & {
        id: string;
    }>;
    /** Move, toggle or flip a plane. */
    updateSection(id: string, patch: {
        offset?: number;
        enabled?: boolean;
        flipped?: boolean;
    }): Promise<SectionsState>;
    /** Remove one plane, or every cut (planes and box) when `id` is omitted. */
    removeSection(id?: string): Promise<SectionsState>;
    /**
     * A section box around the whole model, or around the selected element;
     * `false` removes it.
     */
    setSectionBox(fit?: 'model' | 'selection' | false): Promise<SectionsState>;
    /** Every plane, the box, and the model's storeys (for level cuts). */
    getSections(): Promise<SectionsState>;
    /**
     * Arm a measuring tool for the visitor (opens the Measure panel so they see
     * what to click), or `'none'` to stand down. Results arrive on
     * `measurements-changed`.
     */
    setMeasureTool(tool: MeasureTool | 'none'): Promise<void>;
    /** Every measurement on screen, with SI values. */
    getMeasurements(): Promise<MeasurementsState>;
    /** Remove one measurement, or all of them when `id` is omitted. */
    clearMeasurements(id?: string): Promise<MeasurementsState>;
    /** Show or hide one model (see getModels()) without unloading it. */
    setModelVisible(modelId: string, visible: boolean): Promise<void>;
    /** Ghost a model (0.05–1) — e.g. the architecture around the MEP. Omit the id for the active model. */
    setModelOpacity(opacity: number, modelId?: string): Promise<void>;
    /** Show only this model; pass `null` to show them all again. */
    isolateModel(modelId: string | null): Promise<void>;
    /**
     * Start a built-in tour. `social` and `client-walkthrough` show the model off
     * (a handful of framed views); `technical-review` walks the validation
     * issues, worst first, and needs validation to have run.
     */
    startTour(template?: TourTemplate, opts?: {
        title?: string;
        autoplay?: TourAutoplay;
        includeImprovements?: boolean;
    }): Promise<TourState>;
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
    playTour(tour: TourInput, opts?: {
        startAt?: number;
        autoplay?: TourAutoplay;
    }): Promise<TourState>;
    /** Jump to a stop (0-based). */
    goToTourStep(index: number): Promise<TourState>;
    /** Next stop. */
    nextTourStep(): Promise<TourState>;
    /** Previous stop. */
    prevTourStep(): Promise<TourState>;
    /** Turn self-running on (true / ms per stop) or off (false) for the tour playing now. */
    setTourAutoplay(autoplay: TourAutoplay): Promise<TourState>;
    /** Stop the tour and give the camera back. */
    stopTour(): Promise<TourState>;
    /** The tour loaded now, its position, and its stops in playTour() shape. */
    getTour(): Promise<TourState>;
    /** The built-in recipes — ids for createPresentation(). */
    getPresentationRecipes(): Promise<PresentationRecipe[]>;
    /**
     * Generate a presentation from a recipe. Opens the viewer's Clip Studio with
     * the result, where the visitor can still edit it. Resolves once the shots
     * are rendered — that takes a while (tens of seconds to minutes); follow it
     * on `presentation-progress`.
     */
    createPresentation(recipe?: string, options?: PresentationOptions): Promise<PresentationState>;
    /**
     * Encode the current presentation to a video file and hand its bytes to the
     * host — to upload to your CMS, attach to a report, or play in a <video>:
     *
     *   const { bytes, mimeType } = await viewer.exportPresentation()
     *   video.src = URL.createObjectURL(new Blob([bytes], { type: mimeType }))
     */
    exportPresentation(opts?: {
        resolution?: 720 | 1080 | 1440;
        music?: boolean;
    }): Promise<PresentationVideo>;
    /** Close Clip Studio (the generated project is kept until the next one). */
    closePresentation(): Promise<void>;
    /** The recipes, templates, formats and palettes Cover Studio offers. */
    getCoverOptions(): Promise<CoverCatalog>;
    /**
     * Make a cover. Opens Cover Studio (the visitor can keep editing), runs the
     * recipe if one is given — it captures the views it needs — then applies the
     * template, format, palette and texts. Resolves when it is ready to export.
     *
     *   await viewer.createCover({ recipe: 'pinterest', text: { title: 'Casa Poblenou', location: 'Barcelona' } })
     */
    createCover(opts?: CoverOptions): Promise<CoverState>;
    /**
     * Compare two deliveries by URL and open the comparison workspace on the
     * result. Head files that are also loaded in the scene can be framed in 3D.
     *
     *   await viewer.compare({ base: lastWeekUrl, head: thisWeekUrl })
     */
    compare(opts: {
        base: string | string[];
        head: string | string[];
        baseLabel?: string;
        headLabel?: string;
    }): Promise<{
        changes: number;
    }>;
    /** The cover as it stands, or null when Cover Studio is closed. */
    getCover(): Promise<CoverState | null>;
    /**
     * Export the cover. `png` / `jpeg` give one page (`slide`, default the first);
     * `pdf` and `pptx` the whole document; `zip` every page as PNG.
     */
    exportCover(opts?: {
        type?: 'png' | 'jpeg' | 'pdf' | 'pptx' | 'zip';
        slide?: number;
    }): Promise<CoverFile>;
    /** Close Cover Studio. */
    closeCover(): Promise<void>;
    /** Every group in the scene, inferred and user-made. */
    getGroups(): Promise<SceneGroupsState>;
    /** Create a group, optionally filling it with models. Resolves with its id. */
    createGroup(name: string, modelIds?: string[]): Promise<string>;
    /** Rename a user group. */
    renameGroup(groupId: string, name: string): Promise<void>;
    /** Delete a user group; its files go back to automatic grouping. */
    deleteGroup(groupId: string): Promise<void>;
    /**
     * Move a model or point cloud into a user group. `null` hands it back to
     * automatic grouping; `'loose'` keeps it in no group.
     */
    assignToGroup(itemId: string, groupId: string | null | 'loose'): Promise<void>;
    /** Show or hide every model of a group. */
    setGroupVisible(groupId: string, visible: boolean): Promise<void>;
    /** Show only this group's models; `null` shows every model again. */
    isolateGroup(groupId: string | null): Promise<void>;
    /** Fit the camera to a group — hidden members included, which is how you find where it went. */
    frameGroup(groupId: string): Promise<void>;
    /**
     * Open a tool panel, or pass `null` to close whatever is open.
     *
     * A panel that is not available — the chrome hides it, or nothing is loaded
     * for it to act on — is a no-op rather than an error. Use {@link getPanels}
     * to ask what is available before offering it in your own UI.
     */
    openPanel(panel: PanelName | null): void;
    /** Close whichever panel is open. Same as `openPanel(null)`. */
    closePanel(): void;
    /** Which panel is open, and which are available right now. */
    getPanels(): Promise<PanelsResult>;
    /**
     * Limit the rail to these panels, at runtime.
     *
     * The same vocabulary as the `panels=` URL parameter, and it outranks it: a
     * host that scopes the rail after load meant to. It narrows what the viewer
     * is offering and never adds — naming a panel the viewer is not rendering
     * does not conjure it. An empty array means no rail at all.
     */
    setPanels(panels: PanelName[]): void;
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
    setBackground(background: BackgroundSpec): Promise<BackgroundState>;
    setSolar(opts?: SolarOptions): Promise<SolarState>;
    setSiteContext(opts?: SiteContextOptions): Promise<SiteContextState>;
    setWalkMode(enabled: boolean, opts?: {
        speed?: number;
    }): Promise<WalkState>;
    addSection(opts?: AddSectionOptions): Promise<SectionsState & {
        id: string;
    }>;
    removeSection(id?: string): Promise<SectionsState>;
    setMeasureTool(tool: MeasureTool | 'none'): Promise<void>;
    getMeasurements(): Promise<MeasurementsState>;
    setView(view: CameraView, scope?: CameraScope): void;
    startTour(template?: TourTemplate, opts?: {
        title?: string;
        autoplay?: TourAutoplay;
        includeImprovements?: boolean;
    }): Promise<TourState>;
    playTour(tour: TourInput, opts?: {
        startAt?: number;
        autoplay?: TourAutoplay;
    }): Promise<TourState>;
    stopTour(): Promise<TourState>;
    createPresentation(recipe?: string, options?: PresentationOptions): Promise<PresentationState>;
    exportPresentation(opts?: {
        resolution?: 720 | 1080 | 1440;
        music?: boolean;
    }): Promise<PresentationVideo>;
    createCover(opts?: CoverOptions): Promise<CoverState>;
    exportCover(opts?: {
        type?: 'png' | 'jpeg' | 'pdf' | 'pptx' | 'zip';
        slide?: number;
    }): Promise<CoverFile>;
    getGroups(): Promise<SceneGroupsState>;
    isolateGroup(groupId: string | null): Promise<void>;
    frameGroup(groupId: string): Promise<void>;
}
/** Register the <ifc-viewer> element (idempotent). Auto-called on import. */
export declare function defineIfcViewerElement(tag?: string): void;
export default IfcViewer;
