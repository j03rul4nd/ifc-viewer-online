import * as THREE from 'three'
import * as OBC from '@thatopen/components'
import * as OBCF from '@thatopen/components-front'
import * as FRAGS from '@thatopen/fragments'
import { safeVoid } from './errors'
import { appBus } from './event-bus'
import { cameraRangeForBounds, widenCameraRange } from './camera-range'
import { bindNavigation } from './camera-nav'
import { aimPoint } from './aim-point'
import { bindWalkNavigation, type WalkNavigation, type WalkState } from './camera-walk'
import { createFrameCoalescer } from './frame-coalescer'
import { createScenePicker } from './measure/picker'
import { createMeasureSystem, type MeasureSystem } from './measure/measure-system'
import { createSectionSystem, type SectionSystem } from './measure/section-system'
import { toIfcAxes } from './measure/measure-math'
import { calibrateLevels, mergeLevels, type Level, type RawStorey } from './measure/section-math'
import { createOverlayController, type SeverityFilter, type OverlayMaterials } from './overlay-controller'
import { resolveBackground, DEFAULT_BACKGROUND, type BackgroundSettings } from './scene/background'
import { clearInspectorTarget } from './inspector'
import type { Category, ModelInfo, SelectedInfo, ViewerStyle, ValidationIssue, CameraPreset, ModelTransform, CameraViewpoint, Vec3Like } from '../types'
import { createLogger } from './logger'
import { mintModelId } from './loading/model-id'
import {
  isAbortError, isFragmentsLoadAborted, loadCancelledError, pickActiveAfterDiscard,
  pollModelIdle, stageFraction, throwIfLoadAborted, type ModelIdleResult,
} from './loading/viewer-abort'
import type { RenderStats } from './loading/controller'

const log = createLogger('Viewer')

/** Scene dressing for one Cover Studio capture (see lib/cover/looks.ts). */
export interface PresentationLook {
  base: 'original' | 'clay' | 'ghost'
  baseColor: string
  baseOpacity: number
  /** IFC types (e.g. 'IFCWALL') kept solid and painted focusColor. */
  focusTypes: string[]
  focusColor: string | null
  /** Hide the ground grid (drawings: line work, sections, plans). */
  hideGrid?: boolean
}

/** Plane cut for a Cover Studio capture. */
export interface PresentationSection {
  normal: Vec3Like
  point: Vec3Like
  /** Fill for cut solids, '#rrggbb'. */
  poche: string
}

/** One storey of an exploded axonometric: element ids per model. */
export type ExplodeLayer = Array<{ modelId: string; ids: number[] }>

// ─── Palette & label tables ──────────────────────────────────────────────────

export const IFC_PALETTE: Record<string, { color: number; opacity?: number }> = {
  IFCWALL:               { color: 0xCDD0DC },
  IFCWALLSTANDARDCASE:   { color: 0xCDD0DC },
  IFCSLAB:               { color: 0xA2A6B8 },
  IFCSLABSTANDARDCASE:   { color: 0xA2A6B8 },
  IFCBEAM:               { color: 0xC6B48A },
  IFCBEAMSTANDARDCASE:   { color: 0xC6B48A },
  IFCCOLUMN:             { color: 0xC6B48A },
  IFCCOLUMNSTANDARDCASE: { color: 0xC6B48A },
  IFCDOOR:               { color: 0x8B93E8 },
  IFCWINDOW:             { color: 0x6FB8D9, opacity: 0.45 },
  IFCROOF:               { color: 0x8A5A44 },
  IFCROOFING:            { color: 0x8A5A44 },
  IFCSTAIR:              { color: 0x9B8CC4 },
  IFCSTAIRFLIGHT:        { color: 0x9B8CC4 },
  IFCRAILING:            { color: 0xD4A373 },
  IFCSPACE:              { color: 0x30A46C, opacity: 0.12 },
  IFCFURNISHINGELEMENT:  { color: 0x6B8E7F },
  IFCFLOWSEGMENT:        { color: 0xF5A623 },
  IFCPIPESEGMENT:        { color: 0xF5A623 },
  IFCDUCTSEGMENT:        { color: 0xF5A623 },
  IFCMEMBER:             { color: 0xC6B48A },
  IFCPLATE:              { color: 0xA2A6B8 },
  IFCCOVERING:           { color: 0xCDD0DC },
  IFCFOOTING:            { color: 0x888888 },
  IFCPILE:               { color: 0x888888 },
}

/**
 * Categories hidden the first time a model is shown, as canonical IFC types.
 *
 * SPACES ARE VOLUME, NOT FABRIC. An `IfcSpace` is the air in a room: a solid
 * box filling the storey from floor to ceiling, one per room, and on a hotel
 * that is hundreds of them stacked behind the facade. Drawn at 12 % green they
 * are individually invisible and collectively a wash of colour over everything
 * behind them — which is what made the Hotel Vela's curtain wall read as
 * saturated teal when the glass material is `#6693aa`, a muted blue-grey, and
 * arrives from the IFC exactly as the model authored it. Nothing was wrong with
 * the glass. It was being seen through the building's own air.
 *
 * Hiding them by default is what every BIM viewer does, and for this reason.
 * They stay one click away in the category list, which is where somebody who
 * actually wants to look at room volumes will go for them.
 */

/** What the host tells map mode about models it should place geographically. */
export type SatelliteResolver = () => Array<{
  modelId: string
  placement: import('./geo/geo-types').GeoPlacement
  bounds: { center: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } }
}> | null

export const DEFAULT_HIDDEN_TYPES: readonly string[] = ['IFCSPACE']

export const IFC_DISPLAY_NAMES: Record<string, string> = {
  IFCWALL:               'Walls',
  IFCWALLSTANDARDCASE:   'Walls',
  IFCSLAB:               'Slabs',
  IFCSLABSTANDARDCASE:   'Slabs',
  IFCBEAM:               'Beams',
  IFCBEAMSTANDARDCASE:   'Beams',
  IFCCOLUMN:             'Columns',
  IFCCOLUMNSTANDARDCASE: 'Columns',
  IFCDOOR:               'Doors',
  IFCWINDOW:             'Windows',
  IFCROOF:               'Roofs',
  IFCROOFING:            'Roofs',
  IFCSTAIR:              'Stairs',
  IFCSTAIRFLIGHT:        'Stairs',
  IFCRAILING:            'Railings',
  IFCSPACE:              'Spaces',
  IFCFURNISHINGELEMENT:  'Furniture',
  IFCFLOWSEGMENT:        'MEP',
  IFCPIPESEGMENT:        'Pipes',
  IFCDUCTSEGMENT:        'Ducts',
  IFCMEMBER:             'Members',
  IFCPLATE:              'Plates',
  IFCCOVERING:           'Coverings',
}

// ─── Tipos IFC contenedores espaciales — se omiten en el raycast ─────────────
const SPATIAL_CONTAINER_TYPES = new Set([
  'IFCSPACE',
  'IFCBUILDING',
  'IFCBUILDINGSTOREY',
  'IFCSITE',
  'IFCZONE',
])

function canonicalType(raw: string): string {
  return raw.replace('STANDARDCASE', '').replace('ELEMENTEDCASE', '')
}

/** Which palette bucket an IFC class is painted with (art-directed looks). */
function paletteBucket(cls: string): 'structure' | 'envelope' | 'glazing' | 'mep' | 'interiors' | 'other' {
  if (/^IFC(WINDOW|CURTAINWALL|PLATE)$/.test(cls)) return 'glazing'
  if (/^IFC(BEAM|COLUMN|SLAB|FOOTING|MEMBER|PILE|REINFORCING|TENDON|STAIRFLIGHT|RAMPFLIGHT)/.test(cls)) return 'structure'
  if (/^IFC(WALL|ROOF|COVERING|DOOR|SHADINGDEVICE)/.test(cls)) return 'envelope'
  if (/^IFC(PIPE|DUCT|CABLE|FLOW|ENERGY|DISTRIBUTION|AIRTERMINAL|SANITARY|LIGHTFIXTURE|LAMP|VALVE|PUMP|FAN|BOILER|CHILLER|OUTLET|ELECTRIC|FIRESUPPRESSION|UNITARY|SWITCHING|JUNCTION)/.test(cls)) return 'mep'
  if (/^IFC(FURNISHING|FURNITURE|SYSTEMFURNITURE|STAIR|RAILING|RAMP)/.test(cls)) return 'interiors'
  return 'other'
}

function prettyType(raw: string): string {
  const noPrefix = raw.startsWith('IFC') ? raw.slice(3) : raw
  return noPrefix.charAt(0) + noPrefix.slice(1).toLowerCase()
}

// ─── IFC Item Data types ─────────────────────────────────────────────────────

/** A single IFC attribute value from getItemsData() */
export interface IFCAttribute {
  type?: string
  value: string | number | boolean | null
}

/** A Property Set (Pset) with its contained properties */
export interface IFCPropertySet {
  /** express ID of the IfcPropertySet entity */
  expressId: number
  name: string
  properties: Array<{
    /** express ID of the IfcPropertySingleValue entity */
    expressId: number
    name: string
    value: string | number | boolean | null
    type?: string
  }>
}

/** An Element Quantity Set (IfcElementQuantity) */
export interface IFCQuantitySet {
  expressId: number
  name: string
  quantities: Array<{
    expressId: number
    name: string
    value: number | null
    quantityType: 'Length' | 'Area' | 'Volume' | 'Count' | 'Weight' | 'Time' | 'Unknown'
  }>
}

/** A material associated to an element */
export interface IFCMaterial {
  name: string
  layerThickness?: number
}

/** Structured data returned by getItemData() */
export interface IFCItemData {
  /** IFC Name attribute */
  name: string | null
  /** IFC LongName attribute */
  longName: string | null
  /** IFC Description attribute */
  description: string | null
  /** IFC GlobalId attribute */
  globalId: string | null
  /** IFC ObjectType attribute */
  objectType: string | null
  /** IFC Tag attribute */
  tag: string | null
  /** Storey name from ContainedInStructure relation */
  storey: string | null
  /** IfcPropertySet entries from IsDefinedBy (excludes quantities) */
  propertySets: IFCPropertySet[]
  /** IfcElementQuantity entries from IsDefinedBy */
  quantitySets: IFCQuantitySet[]
  /** Property sets from the element's type (via IsTypedBy / DefinesByType) */
  typeProperties: IFCPropertySet[]
  /** Name of the IFC type entity (e.g. "IfcWallType") */
  typeName: string | null
  /** Materials from HasAssociations */
  materials: IFCMaterial[]
  /** Raw data for debugging / future use */
  raw: Record<string, unknown>
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Appearance/filter knobs for the overlay, forwarded to the OverlayController. */
/** A node of Fragments' spatial structure. */
interface SpatialItem { category: string | null; localId: number | null; children?: SpatialItem[] }

const SPATIAL_CONTAINERS = new Set(['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSPACE', 'IFCZONE', 'IFCFACILITY', 'IFCFACILITYPART'])

/**
 * Visit every item in a spatial structure with its IFC class. Fragments
 * returns two shapes — items carrying their own category, and category
 * GROUP nodes (no id) whose children are the items — so an item's class is
 * its own category or its group's. Return false to skip an item's subtree.
 */
function walkSpatial(node: SpatialItem, visit: (id: number, cls: string, node: SpatialItem) => boolean, groupCls: string | null = null): void {
  const cls = (node.category ?? groupCls ?? '').toUpperCase()
  if (node.localId !== null && node.localId !== undefined) {
    if (!visit(node.localId, cls, node)) return
    for (const c of node.children ?? []) walkSpatial(c, visit, null)
    return
  }
  // A group node: its children inherit its category.
  for (const c of node.children ?? []) walkSpatial(c, visit, node.category ?? groupCls)
}

function itemName(d: unknown): string {
  const r = d as Record<string, { value?: unknown } | undefined> | undefined
  // Name is the short label ("Level 01"); LongName is often a sentence.
  const pick = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '')
  return pick(r?.Name?.value) || pick(r?.LongName?.value)
}

/** A lighting setup for art-directed renders (see `setLighting`). */
export interface SceneLighting {
  sky: string
  ground: string
  ambient: number
  key: string
  keyIntensity: number
  /** Where the sun comes from: degrees around Y, degrees above the horizon. */
  azimuth: number
  elevation: number
  fill: string
  fillIntensity: number
}

export interface OverlayApplyOptions {
  /** Which severities to paint in colour; the rest fall back to the ghost. */
  severities?: SeverityFilter
  /** Opacity of the dimmed (ghosted) context (0.02–0.4). */
  ghostOpacity?: number
  /** Render flagged elements through occluding geometry (no depth test). */
  xray?: boolean
}

/**
 * Where a `loadFragments` call is, as reported by the code doing it:
 *   decompressing / parsing / generating — fragments' own worker stages
 *     (`generating` carries a real 0..1 fraction; the other two report 1 when
 *     they finish, never a partial value);
 *   setup — categories, type map and palette on the main thread (no fraction);
 *   done  — the model is registered, painted and (optionally) framed.
 * fragments also emits a `done` of its own when its worker finishes; it is NOT
 * forwarded, because at that point the model is not usable yet — `done` here
 * means the whole call succeeded, and it is always the last stage reported.
 */
export type LoadFragmentsStage = 'decompressing' | 'parsing' | 'generating' | 'setup' | 'done'

export interface LoadFragmentsOptions {
  /**
   * Scene id to register the model under. The loading manager mints it before
   * the job starts (see loading/model-id.ts) so it can cancel and correlate the
   * load; omitted, the viewer mints one the same way.
   */
  modelId?: string
  /**
   * Cancels the load. Before fragments has the model it is aborted inside the
   * worker (`core.abort`); after, the viewer undoes everything it registered.
   * Either way the call rejects with DOMException('Load cancelled', 'AbortError')
   * and the scene is left as it was before the call.
   */
  signal?: AbortSignal
  /** Real stages with their fraction (null = no measurable progress). */
  onStage?: (stage: LoadFragmentsStage, fraction: number | null) => void
  /**
   * Frame the camera on the new model (default true — the historic behaviour).
   * false leaves the camera alone and only retunes near/far/fog to every loaded
   * model, so a model that lands off-screen is not clipped or fogged out.
   */
  frame?: boolean
}

export interface ViewerAPI {
  loadIfc(
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<{
    modelInfo: ModelInfo
    modelObject: unknown
    getElementInfo: (id: string) => SelectedInfo | null
  }>
  /**
   * Add a fragments model to the scene (never replaces the loaded ones).
   *
   * `buffer` decides who pays for the copy into the fragments worker:
   *   ArrayBuffer — TRANSFERRED (zero-copy). The caller's buffer is detached
   *     (byteLength 0) the moment the load starts; write it to a cache first.
   *   Uint8Array  — structured-cloned (copied); the caller keeps its bytes.
   *     The historic behaviour, and what the blog embed relies on.
   *
   * `onProgress` keeps its historic fixed milestones (5…100) for old callers;
   * `options.onStage` reports the real stages. Rejects with an AbortError when
   * `options.signal` cancels it; on any rejection nothing of the model is left
   * in the scene or the viewer's maps, and the previously active model is
   * active again.
   */
  loadFragments(
    buffer: Uint8Array | ArrayBuffer,
    fileName: string,
    fileSize?: number,
    onProgress?: (pct: number) => void,
    options?: LoadFragmentsOptions,
  ): Promise<{
    modelInfo: ModelInfo
    modelObject: unknown
    getElementInfo: (id: string) => SelectedInfo | null
    /**
     * Scene id of this model — `options.modelId` when given, else minted here.
     * Same id used in sceneStore, modelRegistry, validationStore.
     */
    modelId: string
  }>
  /** True while `modelId` is loaded in the viewer (registered and not removed). */
  hasModel(modelId: string): boolean
  /**
   * Resolve once a loaded model has finished streaming its current view to the
   * GPU (fragments `isBusy` false on two consecutive polls, 100 ms apart).
   * 'missing' when the model is not loaded or is removed meanwhile, 'timeout'
   * after `timeoutMs` of wall time, 'aborted' when `signal` fires. Never
   * rejects. Polls on timers, so it also ends in a hidden pane or background
   * tab, where requestAnimationFrame never fires: if streaming stalls there,
   * the answer is 'timeout', never a hang.
   */
  waitForModelIdle(modelId: string, timeoutMs: number, signal?: AbortSignal): Promise<ModelIdleResult>
  /**
   * three.js renderer counters for the Loading Center's Advanced view, or null
   * when the renderer cannot be read. `calls`/`triangles` are for the LAST
   * render call (three resets them per call): with quality mode
   * (postproduction) on, that is only the last pass of the frame.
   * `geometries`/`textures`/`programs` are live GPU allocations.
   */
  getRenderStats(): RenderStats | null
  /**
   * Fetches real IFC data for a given expressId.
   * Pass modelId to target a specific loaded model; omit to query the current model.
   * Returns null if no suitable model is loaded or the element is not found.
   */
  getItemData(expressId: number, modelId?: string): Promise<IFCItemData | null>
  resetCamera(): void
  /** Frame camera on elements of a category. Targets the active model unless modelId is given. */
  frameCategory(id: string, modelId?: string): void
  /** Frame + zoom camera to a single element. Searches all models if modelId is omitted. */
  focusElement(expressId: number, modelId?: string): void
  /**
   * Programmatically select an element.
   * Pass modelId to target an element in a specific model (important with multiple models loaded).
   */
  selectElement(expressId: number, modelId?: string): void
  /**
   * Apply category/element visibility.
   * `isolatedElement` (a localId) takes precedence over category/hidden-element rules
   * within its owning model. Other models show normally when `isolatedModelId` is given.
   */
  applyFilters(
    hidden: Set<string>,
    isolated: string | null,
    hiddenElements?: Set<string>,
    isolatedElement?: number | null,
    isolatedModelId?: string | null,
  ): void
  applyStyle(style: ViewerStyle): void
  /**
   * Dress the scene for a presentation capture (Cover Studio looks): repaint
   * non-focus elements as a clay model or ghost them, and paint the focus IFC
   * types in one colour. null restores the category palette. Resolves once
   * the fragments have been updated, so a takeSnapshot() right after sees it.
   */
  setPresentationLook(look: PresentationLook | null): Promise<void>
  /**
   * Cut the scene with one plane for a capture, and paint the cut solids in
   * `poche` (the architectural section fill). Keeps the side the normal points
   * TOWARD: normal (0,-1,0) through y=h keeps everything below h — a plan cut.
   * null removes the cut and restores the materials.
   */
  setPresentationSection(section: PresentationSection | null): Promise<void>
  /**
   * Exploded axonometric: render each layer (a storey: element ids per model)
   * alone, lifted by index × gap, over a transparent background, from the
   * current camera. Returns one PNG data URL per layer, in input order; the
   * caller stacks them bottom-up. Visibility and positions are restored.
   */
  captureExplodedLayers(layers: ExplodeLayer[], gap: number, scale?: number): Promise<string[]>
  /** Frame camera on a set of elements. Targets the active model unless modelId is given. */
  frameElements(ids: number[], modelId?: string): void
  setValidationHighlights(issues: ValidationIssue[], enabled: boolean, options?: OverlayApplyOptions): void
  /**
   * Highlight IDS check failures in red. Shares the overlay channel with
   * validation highlights (the two modes are mutually exclusive — enabling one
   * must disable the other at the store level; see IDS_IMPLEMENTATION_PLAN §3.6).
   */
  setIdsHighlights(
    failures: Array<{ expressId: number; modelId?: string | null }>,
    enabled: boolean,
    options?: OverlayApplyOptions,
  ): void
  /**
   * Advanced overlay UX (consumed by the OverlayHud):
   *  - Fly to + select the Nth flagged element (errors first, then warnings, info),
   *    wrapping around. Returns the resolved {index,total}, or null if there are none.
   */
  focusOverlayIssue(index: number): { index: number; total: number } | null
  /** How many elements the overlay currently has flagged (for the HUD counter). */
  getOverlayIssueCount(): number
  /**
   * Show only the given elements across all visible models (transient view
   * filter; any applyFilters/restore call supersedes it). enabled=false
   * re-shows everything.
   */
  isolateElements(targets: Array<{ expressId: number; modelId?: string | null }>, enabled: boolean): void
  setSelectCallback(cb: (info: SelectedInfo | null) => void): void
  /**
   * Register a callback fired on right-click over a model element. The payload
   * carries the screen coordinates and the (now selected) element's info, or
   * null when the right-click missed all geometry. Pass null to unregister.
   */
  setContextMenuCallback(cb: ((payload: { x: number; y: number; info: SelectedInfo } | null) => void) | null): void
  getGpuEstimateBytes(): number
  /**
   * Fly to a named camera preset (iso, top, front, right, left, back, bottom).
   * `animate: false` jumps instead: captures can't wait for a flight, which only
   * advances on rendered frames.
   */
  setCameraPreset(preset: CameraPreset, opts?: { animate?: boolean }): void
  /**
   * First-person walk mode: WASD to move, left-drag to look, Q/E for height.
   *
   * Orbiting is how you look AT a building; this is how you get INSIDE one.
   * Returns the resulting state, which is `false` when the mode could not be
   * armed (camera-controls missing its ACTION table on an odd build).
   */
  setWalkMode(on: boolean): boolean
  /** Toggle walk mode; returns the state it ended in. */
  toggleWalkMode(): boolean
  isWalkMode(): boolean
  /** Walking speed in metres per second (Shift sprints, Alt creeps). */
  setWalkSpeed(metresPerSecond: number): void
  getWalkSpeed(): number
  /** Current walk state, for a HUD mounting mid-walk. */
  getWalkState(): WalkState
  /** Subscribe to walk state (active / speed / pointer lock). Returns unsubscribe. */
  onWalkStateChange(cb: (state: WalkState) => void): () => void
  /**
   * Analog movement for the on-screen stick, each axis in [-1, 1]. Added to
   * the keyboard, so there is only ever one movement path.
   */
  setWalkMoveInput(forward: number, right: number, up?: number): void
  /** Turn the view by an explicit amount in radians (touch look). */
  walkLook(yawDelta: number, pitchDelta: number): void
  /** Capture the cursor while walking, so a 180° turn is not a drag limit. */
  setWalkPointerLock(on: boolean): void
  /**
   * Apply a positional/rotational/scale offset to a model's pivot group.
   * Pass modelId to target a specific model; defaults to the active model.
   * Rotation values are Euler angles in degrees (X, Y, Z order).
   * Scale can be a uniform number or per-axis object.
   */
  setModelTransform(transform: ModelTransform, modelId?: string): void
  /**
   * Host hook: which loaded models carry their own georeferencing.
   *
   * Map mode uses it to send every non-anchor model to its own coordinates.
   * It lives as a callback rather than a store read because resolving a
   * placement needs the georef store, and this module deliberately imports no
   * stores — that separation is why the viewer can be driven from an embed, a
   * test or the SDK without dragging app state in.
   */
  setSatelliteResolver(fn: SatelliteResolver | null): void
  /** Reset a model's transform back to identity. Defaults to the active model. */
  resetModelTransform(modelId?: string): void
  /**
   * Return the world-space bounding box of a model after its pivot transform.
   * Returns null when the model has no geometry or is not loaded.
   */
  getModelBounds(modelId?: string): { center: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } | null
  /**
   * The model's plan outline in world space, as four ORIENTED corners.
   *
   * `getModelBounds` re-boxes the transformed corners into a world-axis-aligned
   * Box3, which is the right answer for framing a camera and the wrong one for
   * asking "what ground does this cover": a building at 45 degrees to the world
   * axes reports a box twice its own area, and anything keyed off that box
   * reaches into the plot next door. This keeps the rotation.
   */
  getModelFootprint(modelId?: string): Array<{ x: number; z: number }> | null
  /**
   * The fragments model behind a loaded model, for callers that need to read
   * geometry back rather than just draw it.
   *
   * The scene object is not enough for that: fragments frees the CPU copy of
   * every vertex array after upload, so anything serialising the model — the GLB
   * export above all — has to ask the library for the data instead.
   */
  getFragmentsModel(modelId?: string): unknown | null
  /**
   * Translation between a model's own IFC coordinates and the geometry drawn on
   * screen, in SCENE axes, or null when it is not known.
   *
   * ADD this to a position expressed in the model's IFC coordinates to get where
   * that position belongs in the scene. Anything registered against the real
   * file — a surveyed point cloud above all — has to go through here, because a
   * loader is entitled to move geometry for precision and the datum must not be
   * lost when it does.
   */
  getModelCoordination(modelId?: string): { x: number; y: number; z: number } | null
  /** Read back a model's transform values (in degrees for rotation). Defaults to active model. */
  getModelTransform(modelId?: string): Required<ModelTransform>
  /** Fit the camera to the combined bounding box of ALL loaded models. */
  frameAllModels(): void
  /**
   * Hide all models except the specified one.
   * Call showAllModels() to restore visibility.
   */
  isolateModel(modelId: string): void
  /** Restore all models to visible. */
  showAllModels(): void
  /**
   * Make a different loaded model the active target for hover/select/frame operations.
   * No-ops silently if the modelId is not currently loaded in the viewer.
   */
  setActiveModel(modelId: string): void
  /** IDs of all models currently loaded in the viewer, in load order. */
  getLoadedModelIds(): string[]
  /**
   * Show or hide a model's geometry in the scene without unloading it.
   * No-ops silently if the modelId is not currently loaded.
   */
  setModelVisible(modelId: string, visible: boolean): void
  /**
   * Set a uniform presentation opacity on one model or every loaded model.
   * Values are clamped to 0.02–1. Used by scan/BIM comparison modes; geometry
   * and model placements are not changed. Passing 1 restores source opacity.
   */
  setModelOpacity(opacity: number, modelId?: string): void
  /**
   * Fully unload a model from the scene and release its GPU/memory resources.
   * After this call the modelId is no longer valid in the viewer.
   */
  removeModel(modelId: string): Promise<void>
  /**
   * Fit the camera to the active model's bounding box (after pivot transform).
   * No-ops silently if no model is active or the model has no geometry.
   */
  frameActiveModel(): void
  /**
   * Return the Three.js pivot Object3D for the specified model.
   * Used by the GLB exporter to get the correct mesh hierarchy.
   * Returns null if the modelId is not currently loaded.
   */
  getModelObject(modelId: string): import('three').Object3D | null
  /**
   * Move the camera to a specific BCF viewpoint.
   * position: camera eye; direction: normalized look-at vector.
   */
  setCameraViewpoint(
    position:  { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
  ): void
  /**
   * Read the current camera state (position/target/direction + frustum).
   * Shared capture primitive for BCF viewpoints and Tour Mode (D-24).
   */
  getCameraViewpoint(): CameraViewpoint | null
  /**
   * Fly the camera to an explicit position + orbit target with the native
   * camera-controls smooth transition. Unlike setCameraViewpoint (BCF pos+dir,
   * target implied at distance 1), this preserves the stored orbit distance —
   * used by Tour Mode playback.
   */
  setCameraLookAt(position: Vec3Like, target: Vec3Like, animate?: boolean): void
  /**
   * World-space merged AABB of a set of elements (serialisable, no THREE
   * objects). Reuses the same getMergedBox path as frameElements. Null when
   * the model/elements are unknown or the box is empty.
   */
  getElementsBox(ids: number[], modelId?: string): Promise<{ min: Vec3Like; max: Vec3Like } | null>
  /**
   * The model's storeys, straight from its spatial structure (no validation
   * run needed): each with its name and every element contained under it.
   */
  getStoreys(modelId?: string): Promise<Array<{ expressId: number; name: string; elementIds: number[] }>>
  /**
   * Art direction: repaint every loaded model from a palette — structure,
   * envelope, glazing, MEP, interiors, other — as flat matte colours (glass
   * translucent). Null puts the models' own materials back.
   */
  applyModelPalette(palette: Record<'structure' | 'envelope' | 'glazing' | 'mep' | 'interiors' | 'other', string> | null, glazingOpacity?: number): Promise<void>
  /**
   * Art direction: the scene's light — sky/ground ambient, a key "sun" (colour,
   * strength, azimuth and elevation in degrees) and a fill from the opposite
   * side. Null puts the viewer's own lighting back.
   */
  setLighting(light: SceneLighting | null): void
  /** Show or hide the ground grid (art-directed looks hide it); returns what it was. */
  setGridVisible(visible: boolean): boolean
  /** Express ids for IFC GlobalIds in one model (null where the model has no such element). */
  getIdsByGuids(guids: string[], modelId?: string): Promise<(number | null)[]>
  /** Names of the model's IfcProject and IfcBuilding (null when absent or empty). */
  getProjectNames(modelId?: string): Promise<{ project: string | null; building: string | null }>
  /**
   * Swap the scene backdrop (solid colour or vertical gradient) and the derived
   * fog / grid colours. Purely visual: no geometry, camera or material state is
   * touched, and the change lands in screenshots and replay clips because it is
   * part of the rendered frame.
   */
  setBackground(settings: BackgroundSettings): void
  /**
   * Capture a PNG snapshot of the current renderer canvas. Returns a data URL.
   * `scale` > 1 renders the frame at that multiple of the on-screen resolution
   * (print boards), capped at the GPU's render-buffer limit; the on-screen view
   * is unchanged.
   *
   * Measurements come WITH their numbers (the labels are HTML, so they are
   * painted onto the frame here); section handles never appear. Pass
   * `annotations: false` for a clean presentation image with no measurements.
   */
  takeSnapshot(scale?: number, options?: { annotations?: boolean }): string
  /**
   * A 2D canvas that repeats every rendered frame WITH the measurement labels
   * painted on it — the surface a video recording should capture. The labels
   * are HTML, so a captureStream of the WebGL canvas records the lines of a
   * measurement and never its numbers. The canvas is only kept up to date
   * while held: call `release()` when the recording stops.
   */
  acquireRecordingCanvas(): { canvas: HTMLCanvasElement; release(): void }
  /**
   * Stable reference to the WebGL canvas (Capture Toolkit replay buffer).
   * Read-only access — callers must never mutate or re-parent the element.
   */
  getCanvas(): HTMLCanvasElement | null
  /**
   * Shot rendering (Clip Studio): draw camera moves frame by frame at an
   * OUTPUT resolution — 1080×1920 for a Reel — instead of recording the screen.
   *
   *   begin(w, h)  resizes only the drawing buffer (the canvas keeps its CSS
   *                size, so nothing reflows), matches the camera's aspect to
   *                the output, and pauses the renderer's own loop
   *   frame(pose)  places the camera, waits for Fragments to stream in what
   *                that pose can see, renders, and returns the canvas — read it
   *                (drawImage / new VideoFrame) before the next await
   *   end()        restores size, camera, projection and the render loop
   *
   * Always pair begin/end (try/finally): between them the on-screen view is
   * frozen at the output aspect.
   */
  beginShotRender(width: number, height: number): Promise<void>
  renderShotFrame(pose: { position: Vec3Like; target: Vec3Like; fovDeg: number }): Promise<HTMLCanvasElement>
  endShotRender(): Promise<void>
  /**
   * Lazily load and return the GIS map subsystem (separate chunk, created once
   * per viewer, disposed with it). Nothing GIS-related loads until first call.
   */
  getGeo(): Promise<import('./geo/geo-system').GeoSystemAPI>
  /**
   * Re-place non-anchor models on the map, if map mode is already up.
   *
   * Deliberately NOT `getGeo().then(...)`: that would CREATE the geo system, so
   * loading a second model would drag the whole map chunk in for a user who
   * never opened the map. This is inert unless the map is already running.
   */
  refreshMapSatellites(): void
  /**
   * Lazily load and return the Sun & Moon study subsystem (separate chunk,
   * created once per viewer, disposed with it).
   */
  getSolar(): Promise<import('./solar/solar-system').SolarSystemAPI>
  /**
   * Lazily load and return the point cloud subsystem (separate chunk, created
   * once per viewer, disposed with it). Point clouds render in THIS scene with
   * THIS camera; the IFC model is never moved to accommodate them.
   */
  getPointClouds(): Promise<import('./pointcloud/point-cloud-system').PointCloudSystemAPI>
  /**
   * Lazy mesh importer. Owns every GPU resource a GLB/OBJ import touches; the
   * IFC model is never moved to accommodate one.
   */
  getMeshes(): Promise<import('./mesh/mesh-system').MeshSystemAPI>
  /**
   * Lazy 3D video surfaces. Video elements, decoders and GPU textures are
   * created only after the user opens a clip and disposed with the viewer.
   */
  getVideos(): Promise<import('./video/video-system').VideoSystemAPI>
  /**
   * Switch between standard WebGL rendering and quality mode (SSAO + edge detection).
   * Falls back silently to standard if postproduction failed to initialise on this GPU.
   */
  setRenderQuality(quality: 'standard' | 'quality'): void
  /**
   * The measurement engine (lib/measure): the active tool, the measurement being
   * drawn, every finished measurement and the overlay they draw. While a tool is
   * active, click-select, hover highlight and the context menu stand down.
   */
  getMeasure(): MeasureSystem
  /** Remove all placed measurements from the scene. */
  clearMeasurements(): void

  // ─── Sections ────────────────────────────────────────────────────────────────
  /**
   * Section planes (plan, elevation, face-aligned) and the section box, with
   * their in-scene handles. Every cut is a global renderer plane, and picking —
   * selection as well as measurement — only ever hits what the cut left.
   */
  getSections(): SectionSystem
  /**
   * Storey levels of every visible model, bottom to top, in scene metres (the
   * height a plan cut is measured from). Calibrated against the geometry, so
   * millimetre and offset models come out right; merged across federated
   * models. Empty when no model has IfcBuildingStorey entities.
   */
  getStoreyLevels(): Promise<Array<{ name: string; y: number }>>
  /** Remove all section planes and the box, and close any open storey view. */
  cleanupSectionAndPlans(): void

  // ─── Floor plan / storey views ───────────────────────────────────────────────
  /**
   * Detect IfcBuildingStorey entities and create a section view for each one.
   * Returns an array of { id, name } descriptors for the UI.
   * Must be called after at least one model is loaded.
   */
  createStoreyViews(): Promise<{ id: string; name: string }[]>
  /**
   * Open a storey section view by ID — switches the camera to 2D plan mode.
   * Close with closeStoreyView().
   */
  openStoreyView(id: string): void
  /** Exit the active section view and return the camera to 3D orbit mode. */
  closeStoreyView(): void
  /**
   * Return all views currently in the Views component (storeys + any manually added).
   * id is the key used by openStoreyView / closeStoreyView.
   */
  getViews(): { id: string; name: string }[]

  dispose(): void
}

// ─── Highlight material presets ──────────────────────────────────────────────

const HOVER_MAT: FRAGS.MaterialDefinition = {
  color: new THREE.Color(0x5E6AD2),
  renderedFaces: FRAGS.RenderedFaces.TWO,
  opacity: 0.45,
  transparent: true,
  preserveOriginalMaterial: true,
}

const SELECT_MAT: FRAGS.MaterialDefinition = {
  color: new THREE.Color(0x6C7CEC),
  renderedFaces: FRAGS.RenderedFaces.TWO,
  opacity: 0.75,
  transparent: true,
  preserveOriginalMaterial: true,
}

const VALIDATION_ERROR_MAT: FRAGS.MaterialDefinition = {
  color: new THREE.Color(0xE5484D),
  renderedFaces: FRAGS.RenderedFaces.TWO,
  opacity: 0.85,
  transparent: true,
  preserveOriginalMaterial: true,
}

const VALIDATION_WARN_MAT: FRAGS.MaterialDefinition = {
  color: new THREE.Color(0xF5A623),
  renderedFaces: FRAGS.RenderedFaces.TWO,
  opacity: 0.85,
  transparent: true,
  preserveOriginalMaterial: true,
}

const VALIDATION_INFO_MAT: FRAGS.MaterialDefinition = {
  color: new THREE.Color(0x5E9ED6),
  renderedFaces: FRAGS.RenderedFaces.TWO,
  opacity: 0.7,
  transparent: true,
  preserveOriginalMaterial: true,
}

// IDS failure overlay — danger hue at higher opacity than the validation tri-color.
// IDS and validation highlights are mutually exclusive (shared overlay channel),
// so the two never appear together.
const IDS_FAIL_MAT: FRAGS.MaterialDefinition = {
  color: new THREE.Color(0xE5484D),
  renderedFaces: FRAGS.RenderedFaces.TWO,
  opacity: 0.9,
  transparent: true,
  preserveOriginalMaterial: true,
}

// Isolate-issues mode: while an overlay is on, every element that ISN'T flagged is
// repainted with this faint neutral so the coloured problems read clearly in
// context (and stay visible through ghosted geometry, since it's transparent and
// writes no depth). Flat (preserveOriginalMaterial:false) so the model reads as a
// uniform ghost; resetHighlight() reverts cleanly to the per-category palette.
const OVERLAY_GHOST_MAT: FRAGS.MaterialDefinition = {
  color: new THREE.Color(0x9AA0AE),
  renderedFaces: FRAGS.RenderedFaces.TWO,
  opacity: 0.1,
  transparent: true,
  preserveOriginalMaterial: false,
}

// ─── Helper: extract string value from IFC attribute ─────────────────────────

function attrStr(attr: unknown): string | null {
  if (!attr || typeof attr !== 'object') return null
  const a = attr as Record<string, unknown>
  if ('value' in a && (typeof a.value === 'string' || a.value === null)) {
    return (a.value as string | null)
  }
  return null
}

// ─── Helper: format raw IsDefinedBy into IFCPropertySet[] ────────────────────

function formatPsets(isDefinedBy: unknown): IFCPropertySet[] {
  if (!Array.isArray(isDefinedBy)) return []

  const result: IFCPropertySet[] = []

  for (const pset of isDefinedBy) {
    if (!pset || typeof pset !== 'object') continue
    const p = pset as Record<string, unknown>

    const psetName = attrStr(p['Name'])
    if (!psetName) continue

    const psetExpressId = typeof p['expressID'] === 'number' ? p['expressID'] : 0

    const hasProperties = p['HasProperties']
    if (!Array.isArray(hasProperties)) continue

    const properties: IFCPropertySet['properties'] = []

    for (const prop of hasProperties) {
      if (!prop || typeof prop !== 'object') continue
      const pr = prop as Record<string, unknown>

      const propName = attrStr(pr['Name'])
      if (!propName) continue

      const propExpressId = typeof pr['expressID'] === 'number' ? pr['expressID'] : 0
      const nominalAttr   = pr['NominalValue']

      let propValue: string | number | boolean | null = null
      let propType: string | undefined

      if (nominalAttr && typeof nominalAttr === 'object') {
        const n = nominalAttr as Record<string, unknown>
        if ('value' in n) {
          const v = n.value
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
            propValue = v
          }
        }
        if ('type' in n && typeof n.type === 'string') propType = n.type
      }

      properties.push({ expressId: propExpressId, name: propName, value: propValue, type: propType })
    }

    result.push({ expressId: psetExpressId, name: psetName, properties })
  }

  return result
}

// ─── Helper: extract storey name from ContainedInStructure ───────────────────

function extractStorey(containedInStructure: unknown): string | null {
  if (!Array.isArray(containedInStructure) || containedInStructure.length === 0) return null

  // ContainedInStructure → array of IfcRelContainedInSpatialStructure
  // Each has a RelatingStructure → IfcBuildingStorey with Name
  for (const rel of containedInStructure) {
    if (!rel || typeof rel !== 'object') continue
    const r = rel as Record<string, unknown>

    // The relation object itself might be the storey when attributes:true
    // Its Name would be the storey name if it's an IfcBuildingStorey
    const nameAttr = r['Name']
    const name = attrStr(nameAttr)
    if (name) return name
  }

  return null
}

// ─── Helper: parse IfcElementQuantity from IsDefinedBy ───────────────────────

function formatQuantities(isDefinedBy: unknown): IFCQuantitySet[] {
  if (!Array.isArray(isDefinedBy)) return []
  const result: IFCQuantitySet[] = []

  for (const entry of isDefinedBy) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    if (!Array.isArray(e['Quantities'])) continue  // only IfcElementQuantity

    const name = attrStr(e['Name'])
    if (!name) continue
    const expressId = typeof e['expressID'] === 'number' ? e['expressID'] : 0

    const quantities: IFCQuantitySet['quantities'] = []
    for (const q of e['Quantities'] as unknown[]) {
      if (!q || typeof q !== 'object') continue
      const qo = q as Record<string, unknown>
      const qName = attrStr(qo['Name'])
      if (!qName) continue
      const qId = typeof qo['expressID'] === 'number' ? qo['expressID'] : 0

      let value: number | null = null
      let quantityType: IFCQuantitySet['quantities'][number]['quantityType'] = 'Unknown'

      const tryNum = (key: string): number | null => {
        const attr = qo[key]
        if (!attr || typeof attr !== 'object') return null
        const a = attr as Record<string, unknown>
        return typeof a.value === 'number' ? a.value : null
      }

      if ((value = tryNum('LengthValue')) !== null)       quantityType = 'Length'
      else if ((value = tryNum('AreaValue')) !== null)    quantityType = 'Area'
      else if ((value = tryNum('VolumeValue')) !== null)  quantityType = 'Volume'
      else if ((value = tryNum('CountValue')) !== null)   quantityType = 'Count'
      else if ((value = tryNum('WeightValue')) !== null)  quantityType = 'Weight'
      else if ((value = tryNum('TimeValue')) !== null)    quantityType = 'Time'

      quantities.push({ expressId: qId, name: qName, value, quantityType })
    }

    result.push({ expressId, name, quantities })
  }

  return result
}

// ─── Helper: parse materials from HasAssociations ────────────────────────────

function parseAssociations(hasAssociations: unknown): IFCMaterial[] {
  if (!Array.isArray(hasAssociations)) return []
  const result: IFCMaterial[] = []

  const addMaterial = (obj: unknown, layerThickness?: number): void => {
    if (!obj || typeof obj !== 'object') return
    const o = obj as Record<string, unknown>
    const name = attrStr(o['Name'])
    if (name) result.push({ name, ...(layerThickness !== undefined ? { layerThickness } : {}) })
  }

  for (const entry of hasAssociations) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>

    // IfcMaterial directly
    if (attrStr(e['Name'])) { addMaterial(e); continue }

    // IfcMaterialLayerSetUsage → ForLayerSet → MaterialLayers[]
    const forLayerSet = e['ForLayerSet']
    if (forLayerSet && typeof forLayerSet === 'object') {
      const ls = forLayerSet as Record<string, unknown>
      if (Array.isArray(ls['MaterialLayers'])) {
        for (const layer of ls['MaterialLayers'] as unknown[]) {
          if (!layer || typeof layer !== 'object') continue
          const l = layer as Record<string, unknown>
          const thickness = l['LayerThickness']
          const t = thickness && typeof thickness === 'object'
            ? (thickness as Record<string, unknown>).value
            : undefined
          addMaterial(l['Material'], typeof t === 'number' ? t : undefined)
        }
      }
    }

    // IfcMaterialList → Materials[]
    if (Array.isArray(e['Materials'])) {
      for (const m of e['Materials'] as unknown[]) addMaterial(m)
    }

    // IfcMaterialConstituentSet → MaterialConstituents[]
    if (Array.isArray(e['MaterialConstituents'])) {
      for (const mc of e['MaterialConstituents'] as unknown[]) {
        if (!mc || typeof mc !== 'object') continue
        addMaterial((mc as Record<string, unknown>)['Material'])
      }
    }
  }

  return result
}

// ─── Helper: parse type-object property sets from IsTypedBy ──────────────────

function parseTypeProps(isTypedBy: unknown): { typeName: string | null; psets: IFCPropertySet[] } {
  if (!Array.isArray(isTypedBy) || isTypedBy.length === 0) return { typeName: null, psets: [] }

  const typeObj = isTypedBy[0]  // take the first (should only be one)
  if (!typeObj || typeof typeObj !== 'object') return { typeName: null, psets: [] }

  const t = typeObj as Record<string, unknown>
  const typeName = attrStr(t['Name'])

  // Type objects use HasPropertySets (not IsDefinedBy)
  const hasPsets = t['HasPropertySets']
  const psets = Array.isArray(hasPsets) ? formatPsets(hasPsets) : []

  return { typeName, psets }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Paint the category palette onto a model. Batched by palette entry (≤25 calls
 * instead of one per element). Shared by the load path and by
 * setPresentationLook(null), which has to put exactly this back.
 */
async function paintPalette(model: FRAGS.FragmentsModel, typeMap: Map<number, string>): Promise<void> {
  const colorBatches:   Map<number, number[]> = new Map()
  const opacityBatches: Map<number, number[]> = new Map()
  for (const [localId, rawType] of typeMap.entries()) {
    const pal = IFC_PALETTE[rawType] ?? IFC_PALETTE[canonicalType(rawType)]
    if (!pal) continue
    const cb = colorBatches.get(pal.color) ?? []; cb.push(localId); colorBatches.set(pal.color, cb)
    if (pal.opacity !== undefined) {
      const ob = opacityBatches.get(pal.opacity) ?? []; ob.push(localId); opacityBatches.set(pal.opacity, ob)
    }
  }
  for (const [hex, ids] of colorBatches)       await model.setColor(ids, new THREE.Color(hex))
  for (const [opacity, ids] of opacityBatches) await model.setOpacity(ids, opacity)
}

export function createViewer(container: HTMLElement): ViewerAPI {

  const components = new OBC.Components()
  const worlds     = components.get(OBC.Worlds)
  const world      = worlds.create<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBCF.PostproductionRenderer>()

  world.scene    = new OBC.SimpleScene(components)
  world.renderer = new OBCF.PostproductionRenderer(components, container)
  world.renderer.showLogo = false
  world.camera   = new OBC.OrthoPerspectiveCamera(components)

  const wr = world.renderer.three
  wr.shadowMap.enabled   = true
  wr.shadowMap.type      = THREE.PCFShadowMap   // PCFSoftShadowMap deprecated in Three.js r175+
  wr.outputColorSpace    = THREE.SRGBColorSpace
  wr.toneMapping         = THREE.ACESFilmicToneMapping
  wr.toneMappingExposure = 1.05

  components.init()

  world.scene.three.background = new THREE.Color(0x0A0A0C)
  world.scene.three.fog        = new THREE.Fog(0x0A0A0C, 80, 200)

  const hemi = new THREE.HemisphereLight(0xB8C4E0, 0x1A1A22, 0.6)
  world.scene.three.add(hemi)
  const dir = new THREE.DirectionalLight(0xFFF5E8, 1.1)
  dir.position.set(40, 60, 30)
  dir.castShadow = true
  dir.shadow.mapSize.set(2048, 2048)
  const dsc = dir.shadow.camera
  dsc.left = -50; dsc.right = 50; dsc.top = 50; dsc.bottom = -50; dsc.far = 200
  dir.shadow.bias   = -0.0008
  dir.shadow.radius = 4
  world.scene.three.add(dir)
  const fill = new THREE.DirectionalLight(0x6B7AC8, 0.3)
  fill.position.set(-40, 20, -30)
  world.scene.three.add(fill)
  // What setLighting(null) restores.
  const defaultLighting = {
    sky: hemi.color.clone(), ground: hemi.groundColor.clone(), ambient: hemi.intensity,
    key: dir.color.clone(), keyIntensity: dir.intensity, keyPos: dir.position.clone(),
    fill: fill.color.clone(), fillIntensity: fill.intensity, fillPos: fill.position.clone(),
  }

  const grids = components.get(OBC.Grids)
  const grid  = grids.create(world)

  // ─── Scene backdrop ────────────────────────────────────────────────────────
  // Presentation feature: users shooting client-facing stills and clips want a
  // white or brand-coloured backdrop, not the default near-black studio. Solid
  // fills go straight on scene.background; gradients are baked into a 1-px-wide
  // CanvasTexture (three draws a non-env-mapped background texture as a
  // screen-space quad, so the sweep is camera-independent and free).
  let bgTexture: THREE.CanvasTexture | null = null

  function makeGradientTexture(top: string, bottom: string): THREE.CanvasTexture | null {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
    gradient.addColorStop(0, top)
    gradient.addColorStop(1, bottom)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }

  function applyBackground(settings: BackgroundSettings): void {
    const bg = resolveBackground(settings)
    const previous = bgTexture
    bgTexture = null

    if (bg.mode === 'gradient') {
      const texture = makeGradientTexture(bg.top, bg.bottom)
      if (texture) {
        bgTexture = texture
        world.scene.three.background = texture
      } else {
        // Canvas 2D unavailable (headless / blocked) — the top stop is a fine
        // stand-in; never leave the scene without a background.
        world.scene.three.background = new THREE.Color(bg.top)
      }
    } else {
      world.scene.three.background = new THREE.Color(bg.top)
    }
    previous?.dispose()

    // Distant geometry must fade into the horizon, not into the old studio black.
    const fog = world.scene.three.fog
    if (fog instanceof THREE.Fog) fog.color.set(bg.fog)

    // Light backdrops need dark grid ink or the floor plane disappears.
    try { grid.config.color = new THREE.Color(bg.grid) } catch { /* grid config not ready */ }
  }

  applyBackground(DEFAULT_BACKGROUND)

  // GIS map mode (lazy chunk) — set by getGeo(); guards below stay inert otherwise.
  let sceneTuneLocked      = false
  let geoPointerSuppressed = false
  let satelliteResolver: SatelliteResolver | null = null
  let geoSystemInstance: import('./geo/geo-system').GeoSystemAPI | null = null
  let geoLoadPromise: Promise<import('./geo/geo-system').GeoSystemAPI> | null = null

  // Sun & Moon study (lazy chunk) — set by getSolar().
  let solarSystemInstance: import('./solar/solar-system').SolarSystemAPI | null = null
  let solarLoadPromise: Promise<import('./solar/solar-system').SolarSystemAPI> | null = null

  // Point clouds (lazy chunk) — set by getPointClouds().
  let meshInstance: import('./mesh/mesh-system').MeshSystemAPI | null = null
  let meshLoadPromise: Promise<import('./mesh/mesh-system').MeshSystemAPI> | null = null
  let videoInstance: import('./video/video-system').VideoSystemAPI | null = null
  let videoLoadPromise: Promise<import('./video/video-system').VideoSystemAPI> | null = null
  let pointCloudInstance: import('./pointcloud/point-cloud-system').PointCloudSystemAPI | null = null
  let pointCloudLoadPromise: Promise<import('./pointcloud/point-cloud-system').PointCloudSystemAPI> | null = null

  void world.camera.controls.setLookAt(30, 24, 36, 0, 2, 0, false)

  // ─── Adaptive scale tuning ─────────────────────────────────────────────────
  // IFC models range from a single chair (~1 m) to a campus (hundreds of m).
  // A fixed near/far + fog hides small elements when zoomed in (near-plane
  // clipping) and fogs out whole buildings when zoomed out. Re-tune both to the
  // actual scene scale so geometry of every size renders crisply.
  function tuneSceneToBounds(box: THREE.Box3): void {
    // Map mode owns near/far/fog while active (INV-3) — a model load mid-map
    // must not clobber the 60 km horizon. Re-tuning resumes after exit.
    if (sceneTuneLocked) return
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3()).length()
    if (!Number.isFinite(size) || size <= 0) return

    const near = Math.max(0.01, Math.min(0.5, size / 1000))
    const far  = Math.max(1000, size * 50)
    for (const cam of [world.camera.threePersp, world.camera.threeOrtho]) {
      cam.near = near
      cam.far  = far
      cam.updateProjectionMatrix()
    }

    // ── The camera must be ALLOWED to stand where a fit needs it
    // camera-controls clamps the distance `fitToBox` computes into
    // [minDistance, maxDistance] — silently, so a box outside that range does
    // not fail, it frames wrong. OBC's defaults (1 m … 300 m) fit a building
    // and nothing either side of it: the Red Rocks scan is 703 × 884 m, and
    // "fit to scan" parked the camera at 300 m, inside the cloud, with no way
    // to back out. See camera-range.ts for the arithmetic and its tests.
    const range = cameraRangeForBounds(size, world.camera.threePersp.fov)
    if (range) Object.assign(world.camera.controls, widenCameraRange(world.camera.controls, range))

    // Keep all real geometry unfogged; only fade the distant background for depth.
    const fog = world.scene.three.fog
    if (fog instanceof THREE.Fog) {
      fog.near = size * 2
      fog.far  = size * 6
    }

    // A walking pace is right for a building and absurd for a site: 3.4 m/s
    // across 700 m of scan is three minutes of holding a key. Scale the default
    // to what was loaded — and only the default, because a speed the user chose
    // with the wheel is an answer, not a guess to be overwritten by the next
    // file they open.
    walkNav?.suggestSpeed(Math.max(3.4, Math.min(25, size / 35)))

    // Widen the directional shadow frustum so shadows cover the whole model.
    const half = Math.max(50, size * 0.6)
    dsc.left = -half; dsc.right = half; dsc.top = half; dsc.bottom = -half
    dsc.far  = Math.max(200, size * 4)
    dsc.updateProjectionMatrix()
  }

  const fragmentsManager = components.get(OBC.FragmentsManager)

  /** Everything beginShotRender changed, so endShotRender can put it back. */
  let shotSession: {
    width: number
    height: number
    pixelRatio: number
    size: THREE.Vector2
    aspect: number
    fov: number
    position: THREE.Vector3
    target: THREE.Vector3
    wasOrtho: boolean
    rendererEnabled: boolean
  } | null = null
  const ifcLoader        = components.get(OBC.IfcLoader)

  // Raw wheel and pointer events can arrive faster than the display refresh.
  // Updating the fragments core for every one of them competes with the camera
  // itself; one update per animation frame is both fresher and cheaper.
  const fragmentUpdates = createFrameCoalescer(() => { void fragmentsManager.core.update() })
  const onCameraControl = (): void => {
    pointCloudInstance?.setInteractionActive(true)
    fragmentUpdates.request()
    // The measurement HUD sits on a projected point: keep it on it. (The system
    // is created further down; a control event can never precede that, but a
    // TDZ read would throw, so it is guarded rather than assumed.)
    try { measureSystem.cameraChanged() } catch { /* not created yet */ }
  }
  const onCameraRest = (): void => {
    pointCloudInstance?.setInteractionActive(false)
    fragmentUpdates.request()
    try { measureSystem.cameraChanged() } catch { /* not created yet */ }
  }
  world.camera.controls.addEventListener('control', onCameraControl)
  world.camera.controls.addEventListener('rest', onCameraRest)

  // ─── Navigation feel ───────────────────────────────────────────────────────
  //
  // THE SCENE HAD NO PAN. camera-controls maps right-drag to TRUCK by default,
  // and this viewer takes right-click for the element context menu — so the
  // truck never got a chance. Left-drag orbits and the wheel dollies, which
  // leaves the orbit target as the only thing that decides where you can look,
  // and the only way to change it was to focus another element. With several
  // models loaded that reads as "I cannot get away from this one", because you
  // could not.
  //
  // So: middle-drag pans (the CAD convention), Shift+left-drag pans too (for
  // anyone without a middle button), and double-clicking geometry re-centres
  // the orbit on the point you clicked without moving the camera.
  let unbindNavigation: (() => void) | null = null
  try {
    const ctrls = world.camera.controls
    // camera-controls narrows each button to the actions it accepts, and ACTION
    // reached through the constructor is only `number` — same values, less type.
    type ButtonAction = typeof ctrls.mouseButtons.left
    const ACTION = (ctrls.constructor as unknown as { ACTION?: Record<string, ButtonAction> }).ACTION

    if (ACTION?.TRUCK !== undefined) {
      unbindNavigation = bindNavigation(ctrls, window, {
        truckAction: ACTION.TRUCK,
        wheelTarget: wr.domElement,
      })
    }
  } catch (err) {
    console.debug('[Viewer] camera-controls tuning skipped:', err instanceof Error ? err.message : err)
  }

  // ─── Walk mode ─────────────────────────────────────────────────────────────
  // Bound once and left inert; toggling it must not re-wire listeners.
  let walkNav: WalkNavigation | null = null
  const walkStateSubscribers = new Set<(state: WalkState) => void>()

  /**
   * Standing inside a building asks different things of the lens than orbiting
   * one does.
   *
   * NEAR PLANE: tuneSceneToBounds scales it to the model — up to 0.5 m on a
   * site-sized file. That is invisible from outside and it eats the wall you
   * are standing next to from inside, which reads as the geometry being broken.
   * FIELD OF VIEW: the orbit default is a portrait lens. In a 1.2 m corridor it
   * shows the two walls and nothing else; every walkthrough tool widens to
   * roughly 70-75° because peripheral vision is how you judge a space.
   *
   * Both are restored on the way out, and the restore reads the values back
   * rather than assuming — a model loaded mid-walk re-tunes them underneath us.
   */
  let walkTuningApplied = false
  let restoredOptics: { fov: number; near: number } | null = null

  function applyWalkOptics(on: boolean): void {
    const cam = world.camera.threePersp
    if (on) {
      if (!restoredOptics) restoredOptics = { fov: cam.fov, near: cam.near }
      cam.fov  = 72
      cam.near = Math.min(cam.near, 0.05)
      cam.updateProjectionMatrix()
    } else if (restoredOptics) {
      cam.fov  = restoredOptics.fov
      cam.near = restoredOptics.near
      cam.updateProjectionMatrix()
      restoredOptics = null
    }
    walkTuningApplied = on
  }
  try {
    const ctrls = world.camera.controls
    type ButtonAction = typeof ctrls.mouseButtons.left
    const ACTION = (ctrls.constructor as unknown as { ACTION?: Record<string, ButtonAction> }).ACTION
    if (ACTION?.NONE !== undefined) {
      walkNav = bindWalkNavigation(ctrls, window, {
        noneAction: ACTION.NONE,
        pointerTarget: wr.domElement,
        // Fragments stream geometry on camera movement, and walking never fires
        // camera-controls' own 'control' event because every step is a
        // transition-less setLookAt. Without this the corridor ahead of you
        // simply does not load in.
        onMove: () => { fragmentUpdates.request() },
        // A plan or elevation is orthographic: there is no depth to walk into,
        // so the keys pan the drawing instead of pushing the frustum around.
        isOrthographic: () => (world.camera.three as THREE.OrthographicCamera).isOrthographicCamera === true,
        onStateChange: (state) => {
          if (state.active !== walkTuningApplied) applyWalkOptics(state.active)
          for (const cb of walkStateSubscribers) {
            try { cb(state) } catch (err) { console.debug('[Viewer] walk subscriber:', err) }
          }
        },
      })
    }
    // WASD moves the camera whether or not walk mode is on. Without this the
    // first thing anyone does in a 3D scene — press W — did nothing, and the
    // mode that would have made it work was behind a button they had no reason
    // to press.
    walkNav?.setAmbientMovement(true)
  } catch (err) {
    console.debug('[Viewer] walk mode unavailable:', err instanceof Error ? err.message : err)
  }

  // ─── Postproduction — start disabled; enable on demand ───────────────────────
  let postproductionReady = false
  try {
    const pp = world.renderer.postproduction
    pp.enabled = false
    // Tune AO defaults for architectural geometry
    pp.defaultAoParameters.radius           = 0.3
    pp.defaultAoParameters.samples          = 16
    pp.defaultAoParameters.distanceFallOff  = 0.1
    pp.defaultAoParameters.screenSpaceRadius = false
    postproductionReady = true
  } catch (err) {
    // Expected on some GPUs / headless environments — postproduction is
    // optional.  Use info level so it doesn't alarm in normal dev sessions.
    console.info('[Viewer] PostproductionRenderer unavailable, using standard renderer:', (err as Error)?.message ?? err)
  }

  // Measurement and section tools (lib/measure) are created once the scene
  // state they read is declared — see "Measurement & sections" below.

  // ─── Floor plan / section views (OBC.Views) ───────────────────────────────────
  const views = components.get(OBC.Views)
  views.world = world

  const initPromise = (async () => {
    const workerURL = await OBC.FragmentsManager.getWorker()
    fragmentsManager.init(workerURL)
    await ifcLoader.setup()
  })()

  // ─── Per-model pivot groups ───────────────────────────────────────────────────
  // Each loaded model gets its own THREE.Group pivot so transforms are independent.
  const modelPivots:     Map<string, THREE.Group>             = new Map()
  const pivotTransforms: Map<string, Required<ModelTransform>> = new Map()
  let   currentPivot:   THREE.Group | null = null

  let currentModel:   FRAGS.FragmentsModel | null = null
  let currentModelId: string | null = null

  // Per-model maps — survive a model swap so past data stays addressable
  const modelObjects:    Map<string, FRAGS.FragmentsModel> = new Map()
  /**
   * Translation the loader applied between a model's own IFC coordinates and the
   * geometry we draw, in SCENE axes. See getModelCoordination.
   */
  const modelCoordination: Map<string, { x: number; y: number; z: number }> = new Map()
  const typeMapByModel:  Map<string, Map<number, string>>  = new Map()
  // Models explicitly hidden at the model level (via setModelVisible / isolateModel).
  // applyFilters skips these so element-level calls never re-show a model-hidden model.
  const modelHidden: Set<string> = new Set()
  // Cover Studio section capture: materials patched for poché, and the
  // renderer's planes before the cut (restored by setPresentationSection(null)).
  const pochePatched = new Map<THREE.MeshLambertMaterial, {
    side: THREE.Side
    onBeforeCompile: THREE.MeshLambertMaterial['onBeforeCompile']
    cacheKey: THREE.MeshLambertMaterial['customProgramCacheKey']
  }>()
  let sectionPrevPlanes: THREE.Plane[] | null = null
  // Grid visibility before a presentation look/section hid it (null = untouched).
  let presentationGridPrev: boolean | null = null
  const hidePresentationGrid = (hide: boolean) => {
    if (hide) {
      if (presentationGridPrev === null) presentationGridPrev = grid.visible
      grid.visible = false
    } else if (presentationGridPrev !== null) {
      grid.visible = presentationGridPrev
      presentationGridPrev = null
    }
  }

  /**
   * Run `fn` with the drawing buffer at `scale` × its normal pixel ratio — the
   * CSS size (and so the camera aspect and framing) is untouched, only the
   * pixel count grows. Postproduction targets are resized to match, and both
   * are put back before returning, so the live view never sees the change.
   */
  function withRenderScale<T>(scale: number, fn: () => T): T {
    if (!(scale > 1)) return fn()
    const renderer = world.renderer!
    const three = renderer.three
    const base = three.getPixelRatio()
    const gl = three.getContext()
    const limit = Math.min(8192, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number)
    const css = new THREE.Vector2()
    three.getSize(css)
    const longest = Math.max(css.x, css.y, 1)
    const ratio = Math.min(base * scale, limit / longest)
    const pp = postproductionReady ? renderer.postproduction : null
    three.setPixelRatio(ratio)
    try { pp?.setSize(three.domElement.width, three.domElement.height) } catch { /* not initialised */ }
    try {
      return fn()
    } finally {
      three.setPixelRatio(base)
      try { pp?.setSize(three.domElement.width, three.domElement.height) } catch { /* not initialised */ }
    }
  }

  // Backward-compat reference: always points to the current model's type map
  let expressIDToType: Map<number, string> = new Map()

  let selectCallback: ((info: SelectedInfo | null) => void) | null = null
  let contextMenuCallback: ((payload: { x: number; y: number; info: SelectedInfo } | null) => void) | null = null
  let hoveredLocalId:  number | null = null
  let hoveredModelId:  string | null = null
  let selectedLocalId: number | null = null
  let selectedModelId: string | null = null

  // The overlay layer (validation issues / IDS failures + isolate-ghosting) is
  // owned by a dedicated, unit-tested controller (overlay-controller.ts). It is
  // robust on its own (per-model error isolation, idempotent re-paints), so the
  // viewer just feeds it intent and asks it what colour an element should restore
  // to under a transient hover/selection highlight.
  const overlay = createOverlayController<FRAGS.MaterialDefinition>({
    getTarget: (modelId) => modelObjects.get(modelId),
    typeMaps: typeMapByModel,
    materials: {
      error:   VALIDATION_ERROR_MAT,
      warning: VALIDATION_WARN_MAT,
      info:    VALIDATION_INFO_MAT,
      idsFail: IDS_FAIL_MAT,
      ghost:   OVERLAY_GHOST_MAT,
    },
  })

  /** Reset an element's highlight, then restore the overlay colour it should keep
   *  (issue / IDS-fail / ghost) so hover & selection never erase the overlay. */
  async function resetHighlightPreservingOverlay(
    model: FRAGS.FragmentsModel, modelId: string, localId: number,
  ): Promise<void> {
    await model.resetHighlight([localId])
    const mat = overlay.materialFor(modelId, localId)
    if (mat) {
      try { await model.highlight([localId], mat) } catch (e) {
        console.debug('[Viewer] restore overlay highlight failed:', e instanceof Error ? e.message : e)
      }
    }
  }

  /** Re-apply the selection highlight that an overlay reset may have cleared. */
  function reassertSelection(): void {
    if (selectedLocalId === null || selectedModelId === null) return
    const selModel = modelObjects.get(selectedModelId)
    if (selModel) void selModel.highlight([selectedLocalId], SELECT_MAT)
  }

  // Tracks the overlay on/off edge so we only frame the camera on a fresh enable
  // (not on every re-validation / re-paint while it's already on).
  let overlayActive = false

  /** UX: when the overlay turns on, fly the camera to the flagged elements across
   *  the WHOLE scene (federation-aware) so the user sees their problems at once. */
  function frameOverlayFlags(): void {
    const targets = overlay.flaggedTargets()
    if (targets.length === 0) return
    void (async () => {
      const union = new THREE.Box3()
      let found = false
      for (const { modelId, localIds } of targets) {
        const model = modelObjects.get(modelId)
        if (!model || localIds.length === 0) continue
        try {
          const box = await model.getMergedBox(localIds)
          if (!box.isEmpty()) { union.union(box); found = true }
        } catch (e) {
          console.debug('[Viewer] frameOverlayFlags box failed:', e instanceof Error ? e.message : e)
        }
      }
      if (found && !union.isEmpty()) {
        union.expandByScalar(2) // a little breathing room around the issues
        try { void world.camera.controls.fitToBox(union, true) } catch (e) {
          console.debug('[Viewer] frameOverlayFlags fit failed:', e instanceof Error ? e.message : e)
        }
      }
    })()
  }

  /** Drive the overlay controller for a channel and frame on the off→on edge. */
  function applyOverlay(apply: () => void, enabled: boolean): void {
    if (enabled) {
      const wasActive = overlayActive
      apply()
      reassertSelection()
      overlayActive = true
      if (!wasActive) frameOverlayFlags()
    } else {
      overlay.clear()
      reassertSelection()
      overlayActive = false
    }
  }

  // ─── Overlay appearance (ghost opacity / x-ray) ──────────────────────────────
  // Built by cloning the base material constants so colours/opacities live in one
  // place. Only re-pushed to the controller when the look actually changes (so a
  // plain re-validation doesn't needlessly repaint).
  let currentGhostOpacity = OVERLAY_GHOST_MAT.opacity
  let currentXray = false

  function buildOverlayMaterials(ghostOpacity: number, xray: boolean): OverlayMaterials<FRAGS.MaterialDefinition> {
    // x-ray = flagged elements ignore depth so they show through walls.
    const seeThrough = (m: FRAGS.MaterialDefinition): FRAGS.MaterialDefinition => ({ ...m, depthTest: !xray })
    return {
      error:   seeThrough(VALIDATION_ERROR_MAT),
      warning: seeThrough(VALIDATION_WARN_MAT),
      info:    seeThrough(VALIDATION_INFO_MAT),
      idsFail: seeThrough(IDS_FAIL_MAT),
      ghost:   { ...OVERLAY_GHOST_MAT, opacity: ghostOpacity },
    }
  }

  /** Push appearance options to the controller only when they actually changed. */
  function syncOverlayAppearance(options?: { ghostOpacity?: number; xray?: boolean }): void {
    const ghostOpacity = options?.ghostOpacity ?? currentGhostOpacity
    const xray = options?.xray ?? currentXray
    if (ghostOpacity === currentGhostOpacity && xray === currentXray) return
    currentGhostOpacity = ghostOpacity
    currentXray = xray
    overlay.setMaterials(buildOverlayMaterials(ghostOpacity, xray))
  }

  /** Core element selection (highlight + selection box + callback), shared by the
   *  public selectElement API and overlay-issue navigation. */
  function runSelectElement(expressId: number, modelId?: string): void {
    const targetModel = (modelId && modelObjects.get(modelId)) ?? currentModel
    const targetId    = (modelId && modelObjects.has(modelId)) ? modelId : currentModelId
    if (!targetModel) return
    void (async () => {
      if (selectedLocalId !== null && selectedModelId !== null) {
        const oldModel = modelObjects.get(selectedModelId)
        try { if (oldModel) await resetHighlightPreservingOverlay(oldModel, selectedModelId, selectedLocalId) } catch (e) {
          console.debug('[Viewer] selectElement resetHighlight failed:', e instanceof Error ? e.message : e)
        }
      }
      selectedLocalId = expressId
      selectedModelId = targetId ?? null
      try { await targetModel.highlight([expressId], SELECT_MAT) } catch (e) {
        console.debug('[Viewer] selectElement highlight failed:', e instanceof Error ? e.message : e)
      }
      addSelectionBox([expressId], targetModel)
      const typeMap = (targetId ? typeMapByModel.get(targetId) : undefined) ?? expressIDToType
      const rawType = typeMap.get(expressId) ?? 'IFCELEMENT'
      const canon   = canonicalType(rawType)
      const name    = `${IFC_DISPLAY_NAMES[canon] ?? prettyType(canon)} #${expressId}`
      // An IFC element is now the most recent answer to "what is this?", so the
      // inspector must stop showing a scanned point or an OSM building.
      clearInspectorTarget()
      selectCallback?.({ id: String(expressId), name, type: rawType, storey: '', modelId: targetId ?? undefined })
    })()
  }

  let selectionBox: THREE.Box3Helper | null = null

  const canvas = wr.domElement

  // ─── Mouse position — actualizado en cada pointermove ────────────────────
  const mouse = new THREE.Vector2()

  /**
   * Where the user is actually pointing.
   *
   * Normally that is the cursor. Under Pointer Lock there IS no cursor:
   * clientX/clientY freeze at wherever it was captured, so hovering and
   * clicking kept picking whatever happened to be under the mouse at the moment
   * you started walking — an element on the other side of the room, forever.
   * While the pointer is locked the aim is the centre of the canvas, which is
   * what the crosshair in the HUD draws and what a first-person view means by
   * "the thing in front of you".
   */
  function aimAt(e: { clientX: number; clientY: number }): void {
    const locked = typeof document !== 'undefined' && document.pointerLockElement === canvas
    const p = aimPoint(locked, canvas.getBoundingClientRect(), e.clientX, e.clientY)
    mouse.set(p.x, p.y)
  }

  function removeSelectionBox(): void {
    if (selectionBox) {
      world.scene.three.remove(selectionBox)
      selectionBox.geometry.dispose()
      selectionBox = null
    }
  }

  function addSelectionBox(ids: number[], model: FRAGS.FragmentsModel | null): void {
    if (!model || ids.length === 0) return
    safeVoid(
      model.getMergedBox(ids).then((box) => {
        removeSelectionBox()
        if (box.isEmpty()) return
        box.expandByScalar(0.05)
        const helper = new THREE.Box3Helper(box, new THREE.Color(0x6C7CEC))
        const mat = helper.material as THREE.LineBasicMaterial
        mat.depthTest    = false
        mat.transparent  = true
        mat.opacity      = 0.9
        world.scene.three.add(helper)
        selectionBox = helper
      }),
      'addSelectionBox',
    )
  }

  /**
   * Re-draw the selection outline where the selected element NOW is.
   *
   * The outline is a Box3Helper built from the element's world box at the moment
   * of selection, and it is parented to the scene rather than to the model — so
   * offsetting a model in the scene panel leaves the outline behind, hanging in
   * space over the position the element used to occupy. Selecting an element and
   * then placing its model is the ordinary order of work, which makes the stale
   * outline the common case rather than the odd one.
   */
  function refreshSelectionBox(): void {
    if (selectedLocalId === null || selectedModelId === null) return
    const model = modelObjects.get(selectedModelId)
    if (model) addSelectionBox([selectedLocalId], model)
  }

  // ─── Raycast ─────────────────────────────────────────────────────────────
  async function getBestHit(): Promise<{ localId: number; modelId: string } | null> {
    if (modelObjects.size === 0) return null

    let bestHit: { localId: number; modelId: string; distance: number } | null = null

    for (const [modelId, model] of modelObjects) {
      const typeMap = typeMapByModel.get(modelId) ?? new Map<number, string>()

      const result = await model.raycast({
        camera: world.camera.three,
        mouse,
        dom: canvas,
      }) as { localId?: number; distance?: number } | null

      if (!result || result.localId === undefined) continue

      const rawType = typeMap.get(result.localId) ?? ''
      const canon   = canonicalType(rawType)

      let finalLocalId: number | null = result.localId

      if (SPATIAL_CONTAINER_TYPES.has(canon)) {
        const spatialIds: number[] = []
        for (const [id, raw] of typeMap.entries()) {
          if (SPATIAL_CONTAINER_TYPES.has(canonicalType(raw))) spatialIds.push(id)
        }

        await model.setVisible(spatialIds, false)
        void fragmentsManager.core.update()

        try {
          const result2 = await model.raycast({
            camera: world.camera.three,
            mouse,
            dom: canvas,
          }) as { localId?: number } | null
          finalLocalId = result2?.localId ?? null
        } catch (err) {
          console.debug('[Viewer] secondary raycast failed:', err instanceof Error ? err.message : err)
        }

        await model.setVisible(spatialIds, true)
        void fragmentsManager.core.update()

        if (finalLocalId === null) continue
      }

      const distance = result.distance ?? Infinity
      if (!bestHit || distance < bestHit.distance) {
        bestHit = { localId: finalLocalId, modelId, distance }
      }
    }

    return bestHit ? { localId: bestHit.localId, modelId: bestHit.modelId } : null
  }

  let lastRaycastTime = 0
  const RAYCAST_THROTTLE_MS = 32

  /**
   * The nearest world-space point under `mouse`, across every loaded model.
   *
   * Derived from the raycast DISTANCE rather than asking the hit for a point:
   * distance is what every fragments raycast reports, and camera position plus
   * ray direction times distance is the same point without depending on a field
   * that may not be there.
   */
  /**
   * The world-space point under the cursor, across every loaded model.
   *
   * `raycast` already hands back the hit point, so take it. Rebuilding it from
   * the distance and a fresh ray is not just redundant, it is wrong: `mouse`
   * holds raw client coordinates, and the canvas does not start at the top-left
   * of the viewport — it sits under the toolbar. Everywhere else that offset is
   * handled by passing `dom: canvas` and letting fragments do the arithmetic.
   */
  const pickWorldPoint = async (): Promise<THREE.Vector3 | null> => {
    let best: { point: THREE.Vector3; distance: number } | null = null
    for (const model of modelObjects.values()) {
      try {
        const hit = await model.raycast({
          camera: world.camera.three, mouse, dom: canvas,
        }) as { point?: THREE.Vector3; distance?: number } | null
        if (!hit?.point || hit.distance === undefined) continue
        if (!best || hit.distance < best.distance) {
          best = { point: hit.point, distance: hit.distance }
        }
      } catch { /* a model that cannot be picked simply does not win */ }
    }
    return best ? best.point : null
  }

  const commitSelection = async (): Promise<SelectedInfo | null> => {
    if (modelObjects.size === 0) return null

    const hit = await getBestHit()

    // Reset old selection highlight on whichever model it was on
    if (selectedLocalId !== null && selectedModelId !== null) {
      const oldModel = modelObjects.get(selectedModelId)
      try { if (oldModel) await resetHighlightPreservingOverlay(oldModel, selectedModelId, selectedLocalId) } catch (e) {
        console.debug('[Viewer] resetHighlight on deselect failed:', e instanceof Error ? e.message : e)
      }
    }

    if (hit !== null) {
      // Auto-activate the clicked model so the sidebar/validator target it
      if (hit.modelId !== currentModelId) {
        const clickedModel = modelObjects.get(hit.modelId)
        if (clickedModel) {
          currentModel   = clickedModel
          currentModelId = hit.modelId
          expressIDToType = typeMapByModel.get(hit.modelId) ?? new Map()
          currentPivot   = modelPivots.get(hit.modelId) ?? null
        }
      }

      selectedLocalId = hit.localId
      selectedModelId = hit.modelId

      const hitModel = modelObjects.get(hit.modelId)
      try {
        if (hitModel) await hitModel.highlight([hit.localId], SELECT_MAT)
      } catch (err) {
        console.warn('[Viewer] commitSelection highlight error:', err)
      }
      addSelectionBox([hit.localId], hitModel ?? null)

      const typeMap = typeMapByModel.get(hit.modelId) ?? expressIDToType
      const rawType = typeMap.get(hit.localId) ?? 'IFCELEMENT'
      const canon   = canonicalType(rawType)
      const name    = `${IFC_DISPLAY_NAMES[canon] ?? prettyType(canon)} #${hit.localId}`
      const info: SelectedInfo = { id: String(hit.localId), name, type: rawType, storey: '', modelId: hit.modelId }
      selectCallback?.(info)
      return info
    } else {
      selectedLocalId = null
      selectedModelId = null
      removeSelectionBox()
      selectCallback?.(null)
      return null
    }
  }

  const onPointerMove = async (e: PointerEvent): Promise<void> => {
    aimAt(e)
    if (geoPointerSuppressed) return // map placement editor owns the pointer

    // Section handles first (they only answer while the section panel is
    // open), then the measurement tool. Both draw their own pointer feedback,
    // so element hover highlighting stands down while either has the cursor.
    sectionSystem.pointerMove(e)
    if (measureSystem.isActive()) { measureSystem.pointerMove(e); return }
    if (sectionSystem.isPlacing() || sectionSystem.isOverHandle()) return
    if (modelObjects.size === 0) return

    const now = performance.now()
    if (now - lastRaycastTime < RAYCAST_THROTTLE_MS) return
    lastRaycastTime = now

    try {
      const hit = await getBestHit()

      // Reset old hover on whichever model it was on (unless it's the selected element)
      if (hoveredLocalId !== null && hoveredModelId !== null) {
        const isSameAsSelect = hoveredLocalId === selectedLocalId && hoveredModelId === selectedModelId
        if (!isSameAsSelect) {
          const prevModel = modelObjects.get(hoveredModelId)
          if (prevModel) await resetHighlightPreservingOverlay(prevModel, hoveredModelId, hoveredLocalId)
        }
      }

      if (hit !== null) {
        hoveredLocalId = hit.localId
        hoveredModelId = hit.modelId

        const isSameAsSelect = hit.localId === selectedLocalId && hit.modelId === selectedModelId
        if (!isSameAsSelect) {
          const hitModel = modelObjects.get(hit.modelId)
          if (hitModel) await hitModel.highlight([hit.localId], HOVER_MAT)
          canvas.style.cursor = 'pointer'
        } else {
          canvas.style.cursor = 'default'
        }
      } else {
        hoveredLocalId = null
        hoveredModelId = null
        canvas.style.cursor = 'default'
      }
    } catch (e) {
      // Hover errors are non-fatal — pointer moves 60fps, a single frame failure is ignorable
      console.debug('[Viewer] hover frame error:', e instanceof Error ? e.message : e)
    }
  }

  let pdTime = 0
  let pdX    = 0
  let pdY    = 0

  const onPointerDown = (e: PointerEvent): void => {
    pdTime = Date.now()
    pdX    = e.clientX
    pdY    = e.clientY
  }

  const onPointerUp = (e: PointerEvent): void => {
    if (geoPointerSuppressed) return   // map placement editor owns the pointer
    const dt   = Date.now() - pdTime
    const dist = Math.hypot(e.clientX - pdX, e.clientY - pdY)
    if (dt > 300 || dist > 5) return   // ignore drags / long-press

    // ── Measurement tools / face section placement ────────────────────────────
    if (measureSystem.isActive()) {
      measureSystem.click(e)
      return
    }
    if (sectionSystem.click(e)) return

    aimAt(e)

    // ── Element selection ─────────────────────────────────────────────────────
    void commitSelection()
  }

  // Double-click: while measuring it finishes a path or an area.
  const onDoubleClick = (e: MouseEvent): void => {
    if (measureSystem.doubleClick(e)) return
    if (sectionSystem.isPlacing()) return
    // ── Walking: double-click is "go there" ───────────────────────────────────
    // Re-centring an orbit means nothing while you are standing in a room, and
    // crossing a building on foot is a minute of holding W. Aim at the floor of
    // the room you want and arrive standing in it — the interaction every tour
    // tool converged on, for the same reason.
    if (walkNav?.isActive()) {
      if (modelObjects.size === 0) return
      aimAt(e)
      void (async () => {
        const point = await pickWorldPoint()
        if (point) walkNav?.walkTo(point)
      })()
      return
    }

    // Re-centre the orbit on whatever was double-clicked, WITHOUT moving the
    // camera. Orbiting only ever revolves around the target, so being unable to
    // move it is being unable to look at anything else — and until now the only
    // thing that moved it was framing an element, which also flies you there.
    // This changes what you turn around and leaves you where you are.
    if (modelObjects.size === 0) return
    aimAt(e)
    void (async () => {
      const point = await pickWorldPoint()
      if (!point) return
      try { world.camera.controls.setOrbitPoint(point.x, point.y, point.z) } catch (err) {
        console.debug('[Viewer] setOrbitPoint failed:', err instanceof Error ? err.message : err)
      }
    })()
  }

  // Right-click: select the element under the cursor and surface a context menu.
  // While measuring it is the CAD "done" gesture instead: it finishes a path or
  // an area when there is enough to finish, and otherwise drops the
  // measurement being drawn. Never the browser's own menu over the canvas.
  const onContextMenu = (e: MouseEvent): void => {
    if (measureSystem.isActive()) {
      e.preventDefault()
      if (measureSystem.getSnapshot().canFinish) measureSystem.finishDraft()
      else measureSystem.cancelDraft()
      return
    }
    if (sectionSystem.isPlacing()) {
      e.preventDefault()
      sectionSystem.cancelFacePlacement()
      return
    }
    if (modelObjects.size === 0) return
    e.preventDefault()
    aimAt(e)
    void (async () => {
      try {
        const info = await commitSelection()
        if (info) contextMenuCallback?.({ x: e.clientX, y: e.clientY, info })
        else      contextMenuCallback?.(null)
      } catch (err) {
        console.debug('[Viewer] context menu select error:', err instanceof Error ? err.message : err)
        contextMenuCallback?.(null)
      }
    })()
  }

  // ─── Measurement & sections (lib/measure) ─────────────────────────────────
  //
  // One picker for both: it tests every hit against the section planes (the
  // GPU picker the old tools used ignores them, so a click on the inside of a
  // cut measured the wall that had been cut away), and it snaps in screen
  // pixels rather than @thatopen's fixed metre.
  const snapResolver = ((): OBC.SnapResolver | null => {
    try { return components.get(OBC.SnapResolvers).get() } catch { return null }
  })()
  const aimClient = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const locked = typeof document !== 'undefined' && document.pointerLockElement === canvas
    return aimPoint(locked, canvas.getBoundingClientRect(), e.clientX, e.clientY)
  }
  const picker = createScenePicker({
    canvas,
    getCamera: () => world.camera.three,
    getModels: function* () {
      for (const [id, model] of modelObjects) {
        if (modelHidden.has(id)) continue
        yield [id, model] as [string, FRAGS.FragmentsModel]
      }
    },
    getExtraTargets: () => {
      const roots = new Set<THREE.Object3D>()
      for (const m of modelObjects.values()) roots.add(m.object)
      return [...world.meshes].filter((o) => !roots.has(o)) as THREE.Object3D[]
    },
    getClippingPlanes: () => wr.clippingPlanes,
    getSnapResolver: () => snapResolver,
  })

  const measureSystem: MeasureSystem = createMeasureSystem({
    scene: world.scene.three,
    canvas,
    getCamera: () => world.camera.three,
    picker,
    toModelCoordinates: (point, modelId) => {
      // The picked model's own IFC frame: undo its placement in the scene, then
      // the loader's coordination. That is the number on the drawings.
      const pivot = modelId ? modelPivots.get(modelId) : undefined
      if (!modelId || !pivot) return { coords: toIfcAxes(point), frame: 'scene' }
      pivot.updateMatrixWorld(true)
      const local = point.clone().applyMatrix4(pivot.matrixWorld.clone().invert())
      const c = modelCoordination.get(modelId)
      if (c) local.sub(new THREE.Vector3(c.x, c.y, c.z))
      return { coords: toIfcAxes(local), frame: 'model' }
    },
    frameBox: (box) => {
      try { void world.camera.controls.fitToBox(box, true) } catch (err) {
        console.debug('[Viewer] measurement focus failed:', err instanceof Error ? err.message : err)
      }
    },
    aim: aimClient,
  })

  // ── Poché: flat-filled cut solids ─────────────────────────────────────────
  // A cut closed solid exposes its inside, i.e. its back faces. Rendering those
  // double-sided and flat is the classic section fill without stencil caps.
  // Shared by the section tool and Cover Studio, which must not stack patches:
  // the presentation cut wins while it is up, and the section tool's fill comes
  // back when it is lifted.
  let sectionPoche: string | null = null
  let presentationPoche: string | null = null
  let appliedPoche: string | null = null

  function patchPocheMaterial(mat: unknown, color: string, skipTransparent: boolean): void {
    if (!(mat instanceof THREE.MeshLambertMaterial) || pochePatched.has(mat)) return
    // Glass seen through glass would show its own back faces filled.
    if (skipTransparent && (mat.transparent || mat.opacity < 1)) return
    const c = new THREE.Color(color)
    const fill = `vec4(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)}, 1.0)`
    pochePatched.set(mat, { side: mat.side, onBeforeCompile: mat.onBeforeCompile, cacheKey: mat.customProgramCacheKey })
    mat.side = THREE.DoubleSide
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>\n  if (!gl_FrontFacing) gl_FragColor = ${fill};`,
      )
    }
    const key = `poche-${color}`
    mat.customProgramCacheKey = () => key
    mat.needsUpdate = true
  }

  function clearPoche(): void {
    for (const [mat, orig] of pochePatched) {
      mat.side = orig.side
      mat.onBeforeCompile = orig.onBeforeCompile
      mat.customProgramCacheKey = orig.cacheKey
      mat.needsUpdate = true
    }
    pochePatched.clear()
    appliedPoche = null
  }

  function applyPoche(color: string, skipTransparent: boolean): void {
    for (const model of modelObjects.values()) {
      model.object.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const mat of mats) patchPocheMaterial(mat, color, skipTransparent)
      })
    }
    appliedPoche = color
  }

  function syncPoche(): void {
    const want = presentationPoche ?? sectionPoche
    if (want === appliedPoche) return
    clearPoche()
    if (want) applyPoche(want, presentationPoche === null)
  }

  // Materials created after the cut (streamed tiles, highlight materials) are
  // filled too, or the poché would come and go as the camera moved.
  try {
    fragmentsManager.core.models.materials.list.onItemSet.add(({ value }) => {
      if (appliedPoche) patchPocheMaterial(value, appliedPoche, presentationPoche === null)
    })
  } catch (err) {
    console.debug('[Viewer] poché material hook unavailable:', err instanceof Error ? err.message : err)
  }

  const sectionSystem: SectionSystem = createSectionSystem({
    scene: world.scene.three,
    canvas,
    container,
    getCamera: () => world.camera.three,
    picker,
    setPlane: (active, plane) => { world.renderer!.setPlane(active, plane) },
    getSceneBounds: () => {
      const box = combinedModelsBox()
      return box.isEmpty() ? null : box
    },
    getSelectionBounds: async () => {
      if (selectedLocalId === null || !selectedModelId) return null
      const model = modelObjects.get(selectedModelId)
      if (!model) return null
      try { return await model.getMergedBox([selectedLocalId]) } catch { return null }
    },
    setControlsEnabled: (enabled) => { world.camera.controls.enabled = enabled },
    planesChanged: (final) => {
      // Fragments cull streamed tiles against the planes too, so moving a cut
      // must re-run the view or what it uncovers would stay missing.
      if (final) void fragmentsManager.core.update(true)
      else fragmentUpdates.request()
    },
    setPoche: (color) => { sectionPoche = color; syncPoche() },
    lookAt: (position, target) => {
      // A NaN handed to camera-controls poisons it for the session: nothing
      // it is asked afterwards (framing included) brings the camera back.
      const finite = [position.x, position.y, position.z, target.x, target.y, target.z].every(Number.isFinite)
      if (!finite) return
      try {
        void world.camera.controls.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z, true)
      } catch (err) {
        console.debug('[Viewer] section lookAt failed:', err instanceof Error ? err.message : err)
      }
    },
    aim: aimClient,
    isPointerBusy: () => measureSystem.isActive(),
  })

  // Dev handle, like __ifcLoad / __basemapTiles: lets a session inspect the
  // measurement and section state (and drive the picker) without pixels.
  if (import.meta.env.DEV) {
    ;(globalThis as Record<string, unknown>).__measure = {
      measure: measureSystem, sections: sectionSystem, picker,
      camera: () => world.camera.three,
      frame: () => { const b = combinedModelsBox(); if (!b.isEmpty()) void world.camera.controls.fitToBox(b, false) },
      controls: () => world.camera.controls,
      recordingCanvas: () => recording?.canvas ?? null,
    }
  }

  // ── Recording surface ─────────────────────────────────────────────────────
  // Copied right after each render (onAfterUpdate runs in the same task, while
  // the WebGL buffer still holds the frame), then the labels are painted over.
  // At most ~30 copies a second: the replay buffer samples at 24 fps, and a
  // blit per 60 Hz frame would be half wasted.
  let recording: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; holders: number; last: number } | null = null
  const RECORD_MIN_INTERVAL_MS = 1000 / 30
  const paintRecordingFrame = (): void => {
    const rec = recording
    if (!rec) return
    const now = performance.now()
    if (now - rec.last < RECORD_MIN_INTERVAL_MS) return
    const src = wr.domElement
    if (src.width === 0 || src.height === 0) return
    rec.last = now
    if (rec.canvas.width !== src.width || rec.canvas.height !== src.height) {
      rec.canvas.width = src.width
      rec.canvas.height = src.height
    }
    try {
      rec.ctx.drawImage(src, 0, 0)
      measureSystem.paintLabels(rec.ctx, src.width, src.height, src.width / Math.max(1, src.clientWidth || src.width))
    } catch (err) {
      console.debug('[Viewer] recording frame failed:', err instanceof Error ? err.message : err)
    }
  }
  function acquireRecordingCanvas(): { canvas: HTMLCanvasElement; release(): void } {
    if (!recording) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, wr.domElement.width)
      canvas.height = Math.max(1, wr.domElement.height)
      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) {
        // No 2D context (exotic / headless): recording the WebGL canvas is the
        // honest fallback — lines without labels beats no recording.
        return { canvas: wr.domElement, release: () => undefined }
      }
      recording = { canvas, ctx, holders: 0, last: 0 }
      world.renderer!.onAfterUpdate.add(paintRecordingFrame)
    }
    const rec = recording
    rec.holders += 1
    let released = false
    return {
      canvas: rec.canvas,
      release: () => {
        if (released || recording !== rec) return
        released = true
        rec.holders -= 1
        if (rec.holders > 0) return
        try { world.renderer!.onAfterUpdate.remove(paintRecordingFrame) } catch { /* disposed */ }
        recording = null
      },
    }
  }

  // ── Shot frames (Clip Studio, director) ───────────────────────────────────
  // renderShotFrame hands back a canvas the caller draws into its encoder in
  // the same task. The labels are HTML, so the WebGL canvas alone gave clips
  // the lines of every measurement and none of its numbers: they are painted
  // onto a copy here, and the copy is what the encoder gets.
  let shotLabels: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null
  let shotHandlesRestore: (() => void) | null = null
  function withShotLabels(frame: HTMLCanvasElement, s: number): HTMLCanvasElement {
    if (!shotLabels) {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return frame
      shotLabels = { canvas, ctx }
    }
    const { canvas, ctx } = shotLabels
    if (canvas.width !== frame.width || canvas.height !== frame.height) {
      canvas.width = frame.width
      canvas.height = frame.height
    }
    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(frame, 0, 0)
      return measureSystem.paintLabels(ctx, canvas.width, canvas.height, s) ? canvas : frame
    } catch {
      return frame
    }
  }

  // Storey levels are read once per set of visible models (and after a move).
  let storeyLevelsCache: { key: string; levels: Level[] } | null = null

  const onPointerLeave = (): void => { measureSystem.pointerLeave() }

  canvas.addEventListener('pointermove',  onPointerMove)
  canvas.addEventListener('pointerdown',  onPointerDown)
  canvas.addEventListener('pointerup',    onPointerUp)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('dblclick',     onDoubleClick)
  canvas.addEventListener('contextmenu',  onContextMenu)

  // ─── Setup post-carga ─────────────────────────────────────────────────────

  /**
   * Hand the renderer's clipping planes to a model's own raycasting and culling.
   *
   * Fragments only honour the planes it is given, and nothing gave it any — so
   * with a section in place, clicking the exposed inside of a cut SELECTED THE
   * WALL THAT HAD BEEN CUT AWAY in front of it, and streamed tiles behind the
   * cut kept being fetched. The getter is live: planes added, moved or removed
   * later are read on the next raycast and the next view update.
   */
  function bindClippingPlanes(model: FRAGS.FragmentsModel): void {
    try { model.getClippingPlanesEvent = () => wr.clippingPlanes } catch { /* older build */ }
  }

  /**
   * World-space union of every loaded model's box, pivot transforms applied.
   * Empty when nothing has geometry. Shared by frameAllModels and by unframed
   * loads, which must retune the scene to ALL models without moving the camera.
   */
  function combinedModelsBox(): THREE.Box3 {
    const combined = new THREE.Box3()
    for (const [mid, model] of modelObjects) {
      const box   = model.box
      const pivot = modelPivots.get(mid)
      if (box.isEmpty()) continue
      if (pivot) {
        pivot.updateMatrixWorld(true)
        const m = pivot.matrixWorld
        // Transform all 8 corners: a rotated/scaled pivot turns the box into an
        // oriented box, and the AABB of just min+max would be wrong. (Same pattern
        // as getModelBounds.)
        const corners: THREE.Vector3[] = [
          new THREE.Vector3(box.min.x, box.min.y, box.min.z),
          new THREE.Vector3(box.max.x, box.min.y, box.min.z),
          new THREE.Vector3(box.min.x, box.max.y, box.min.z),
          new THREE.Vector3(box.max.x, box.max.y, box.min.z),
          new THREE.Vector3(box.min.x, box.min.y, box.max.z),
          new THREE.Vector3(box.max.x, box.min.y, box.max.z),
          new THREE.Vector3(box.min.x, box.max.y, box.max.z),
          new THREE.Vector3(box.max.x, box.max.y, box.max.z),
        ]
        for (const v of corners) combined.expandByPoint(v.applyMatrix4(m))
      } else {
        combined.expandByPoint(box.min)
        combined.expandByPoint(box.max)
      }
    }
    return combined
  }

  interface SetupOptions {
    signal?: AbortSignal
    /** Default true: tune the scene to this model and fit the camera to it. */
    frame?: boolean
    onStage?: LoadFragmentsOptions['onStage']
  }

  async function setupLoadedModel(
    model: FRAGS.FragmentsModel,
    modelId: string,
    fileName: string,
    fileSize: number,
    onProgress?: (pct: number) => void,
    opts: SetupOptions = {},
  ): Promise<{ modelInfo: ModelInfo; modelObject: unknown; getElementInfo: (id: string) => SelectedInfo | null }> {

    // Every await below yields to the rest of the app, which may cancel this
    // load or remove the model outright (removeModel on an id it already
    // knows). Carrying on would paint a disposed model and re-register the type
    // map of a model nobody holds any more — so each await is a checkpoint, and
    // the caller's compensation cleans up whatever was registered so far.
    const checkpoint = (): void => {
      throwIfLoadAborted(opts.signal)
      if (modelObjects.get(modelId) !== model) {
        throw new Error(`[Viewer] model "${modelId}" was removed while it was being set up`)
      }
    }

    opts.onStage?.('setup', null)

    const categoryNames = await model.getCategories()
    checkpoint()
    const regexes    = categoryNames.map((c) => new RegExp(`^${c}$`, 'i'))
    const byCategory = await model.getItemsOfCategories(regexes)
    checkpoint()

    // Build a fresh per-model type map (never mutates a map from another model)
    const modelTypeMap = new Map<number, string>()

    const categoryAccum    = new Map<string, number>()
    const categoryElements = new Map<string, number[]>()

    for (const [rawKey, ids] of Object.entries(byCategory)) {
      const upperType = rawKey.replace(/[\^$]/g, '').toUpperCase()
      const canon     = canonicalType(upperType)
      categoryAccum.set(canon, (categoryAccum.get(canon) ?? 0) + ids.length)
      const arr = categoryElements.get(canon) ?? []
      for (const id of ids) {
        modelTypeMap.set(id, upperType)
        arr.push(id)
      }
      categoryElements.set(canon, arr)
    }

    // Register per-model map and update the current alias — but only while this
    // model is still the active one. The alias must describe `currentModel`:
    // if another load or setActiveModel took the focus during the awaits above,
    // pointing the alias here would pair that model with this one's types.
    typeMapByModel.set(modelId, modelTypeMap)
    if (currentModelId === modelId) expressIDToType = modelTypeMap

    onProgress?.(80)

    // From here on read the LOCAL map, never the alias: every await lets a
    // concurrent load reassign `expressIDToType`, and this model would then be
    // painted, counted and labelled with another model's types.
    // Batched by palette entry (≤25 calls instead of one per element); shared
    // with setPresentationLook(null), which has to put exactly this back.
    await paintPalette(model, modelTypeMap)
    checkpoint()

    onProgress?.(90)

    if (opts.frame !== false) {
      const box = model.box
      if (!box.isEmpty()) {
        tuneSceneToBounds(box)
        void world.camera.controls.fitToBox(box, true)
      }
    } else {
      // Unframed (a federated member landing behind the one being looked at):
      // leave the camera where the user put it, but size near/far/fog to the
      // whole scene — tuned to the previous models alone, a model that lands
      // beyond them would be clipped by `far` or buried in fog.
      const all = combinedModelsBox()
      if (!all.isEmpty()) tuneSceneToBounds(all)
    }

    void fragmentsManager.core.update()

    onProgress?.(100)

    const categories: Category[] = Array.from(categoryAccum.entries())
      .map(([id, count]) => ({
        id,
        label:      IFC_DISPLAY_NAMES[id] ?? prettyType(id),
        count,
        color:      IFC_PALETTE[id]?.color ?? 0x888888,
        elementIds: categoryElements.get(id) ?? [],
      }))
      .sort((a, b) => b.count - a.count)

    const modelInfo: ModelInfo = {
      fileName,
      fileSize,
      elementCount: modelTypeMap.size,
      categories,
    }

    // Closes over THIS model's map: the alias would answer for whichever model
    // is active when a caller asks, which is not necessarily this one.
    const getElementInfo = (id: string): SelectedInfo | null => {
      const localId = parseInt(id, 10)
      const rawType = modelTypeMap.get(localId) ?? 'IFCELEMENT'
      const canon   = canonicalType(rawType)
      const name    = `${IFC_DISPLAY_NAMES[canon] ?? prettyType(canon)} #${localId}`
      return { id, name, type: rawType, storey: '', modelId }
    }

    return { modelInfo, modelObject: model, getElementInfo }
  }

  /**
   * Undo a loadFragments call that got its model from fragments but did not
   * finish — cancelled during setup, or setup threw. Leaves the viewer as the
   * call found it: no pivot in the scene, no entry in any per-model map, the
   * fragments model disposed on both threads, and the focus back on the model
   * that had it. Before this, a throwing setup left the model drawn in the
   * scene and registered in every map, with no id handed to anyone who could
   * remove it.
   *
   * Never throws: it runs on the way out of a failure the caller is about to
   * rethrow, and must not replace that error with its own.
   */
  async function discardUncommittedLoad(
    modelId: string,
    model: FRAGS.FragmentsModel,
    previousActiveId: string | null,
    anchorsScene: boolean,
  ): Promise<void> {
    // The maps are keyed by id; only clear them if the id is still ours
    // (removeModel may have run during setup, and a later load could in
    // principle have reused the id since).
    const ownsId = !modelObjects.has(modelId) || modelObjects.get(modelId) === model
    if (ownsId) {
      const pivot = modelPivots.get(modelId)
      if (pivot) world.scene.three.remove(pivot)
      modelPivots.delete(modelId)
      pivotTransforms.delete(modelId)
      modelObjects.delete(modelId)
      modelCoordination.delete(modelId)
      typeMapByModel.delete(modelId)
      modelHidden.delete(modelId)
      if (hoveredModelId  === modelId) { hoveredLocalId  = null; hoveredModelId  = null }
      if (selectedModelId === modelId) {
        selectedLocalId = null
        selectedModelId = null
        try { removeSelectionBox() } catch { /* a helper box is not worth masking the load error */ }
      }
      overlay.forget(modelId)
    }

    // Hand the focus back — only if this model still has it. Something that
    // moved it meanwhile (setActiveModel, removeModel's own promotion) wins.
    if (currentModel === model) {
      const nextId = pickActiveAfterDiscard(previousActiveId, modelObjects.keys())
      currentModel    = nextId ? (modelObjects.get(nextId) ?? null) : null
      currentModelId  = nextId
      currentPivot    = nextId ? (modelPivots.get(nextId) ?? null) : null
      expressIDToType = nextId ? (typeMapByModel.get(nextId) ?? new Map()) : new Map()
    }

    try {
      await model.dispose()
    } catch (err) {
      log.warn(`discarding "${modelId}": dispose failed`, err)
    }

    // fragments takes the scene's coordinate base from the first model it
    // loads, and keeps it. If that was this model and nothing else is loaded,
    // the next model would be offset against a datum no longer in the scene —
    // so the base goes too, and the next model anchors the scene as it should.
    try {
      if (anchorsScene && fragmentsManager.core.models.list.size === 0) {
        fragmentsManager.core.baseCoordinates = null
      }
    } catch { /* fragments internals changed — keep the base */ }

    void fragmentsManager.core.update()
  }

  async function teardownCurrentModel(): Promise<void> {
    if (modelObjects.size === 0 && !currentModel) return
    overlay.forgetAll() // geometry is about to be disposed — just drop tracking
    overlayActive = false
    removeSelectionBox()

    // Remove all per-model pivot groups from scene
    for (const pivot of modelPivots.values()) {
      world.scene.three.remove(pivot)
    }
    modelPivots.clear()
    pivotTransforms.clear()

    // Dispose all loaded models
    for (const model of modelObjects.values()) {
      await model.dispose()
    }
    modelObjects.clear()
    typeMapByModel.clear()
    modelHidden.clear()

    currentModel   = null
    currentModelId = null
    currentPivot   = null
    expressIDToType = new Map()
    hoveredLocalId  = null
    hoveredModelId  = null
    selectedLocalId = null
    selectedModelId = null
  }

  // ─── API pública ──────────────────────────────────────────────────────────

  return {

    async loadIfc(file, onProgress) {
      await initPromise
      await teardownCurrentModel()

      onProgress?.(15)
      const buffer = new Uint8Array(await file.arrayBuffer())
      onProgress?.(25)

      const assignedId = mintModelId(file.name)

      let model: FRAGS.FragmentsModel
      try {
        model = await ifcLoader.load(buffer, true, file.name)
        model.useCamera(world.camera.three)
      } catch (err) {
        console.error('[Viewer] loadIfc error:', err)
        throw err
      }

      const pivot = new THREE.Group()
      pivot.name = `ifc-model-pivot-${assignedId}`
      world.scene.three.add(pivot)
      pivot.add(model.object)
      modelPivots.set(assignedId, pivot)
      pivotTransforms.set(assignedId, { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 })

      currentModel   = model
      currentModelId = assignedId
      currentPivot   = pivot
      modelObjects.set(assignedId, model)
      bindClippingPlanes(model)

      // Record whatever the loader did to this model's datum, rather than
      // assuming it did nothing. The converter no longer translates models to
      // the origin, so this is normally zero — but `loadIfc` still asks for
      // coordination, and a library default can change under us again. Reading
      // it once and handing it to whoever needs it is what stops that from
      // silently misplacing every coordinate-registered thing in the scene.
      try {
        const t = new THREE.Vector3().setFromMatrixPosition(await model.getCoordinationMatrix())
        if (Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.z)) {
          modelCoordination.set(assignedId, { x: t.x, y: t.y, z: t.z })
        }
      } catch {
        // Older fragments build without the accessor. Absent beats invented:
        // callers read null as "unknown" and leave positions alone.
      }
      onProgress?.(60)

      return setupLoadedModel(model, assignedId, file.name, file.size, onProgress)
    },

    async loadFragments(buffer, fileName, fileSize, onProgress, options) {
      const signal = options?.signal
      throwIfLoadAborted(signal)
      await initPromise
      // The first load waits here for the fragments worker (fetched when the
      // viewer starts); a cancel that landed meanwhile must not start a parse.
      throwIfLoadAborted(signal)
      // Do NOT teardown here — multiple models can coexist in the scene.
      // Use removeModel(modelId) for explicit unloading.

      onProgress?.(5)
      // The loading manager mints the id before the job starts, so it can abort
      // and correlate the load; direct callers (the blog embed, the legacy
      // loader) still get one minted here, in the same shape.
      const modelId = options?.modelId ?? mintModelId(fileName)
      if (modelObjects.has(modelId) || fragmentsManager.core.models.list.has(modelId)) {
        // fragments keys its model list by id and would silently replace the
        // loaded model's entry: two models drawn, one of them unreachable.
        throw new Error(`[Viewer] loadFragments: model id "${modelId}" is already loaded`)
      }

      // A progress listener is the caller's code; it must never fail the load
      // (or, called from inside fragments' message handler, break fragments).
      const stage = (s: LoadFragmentsStage, fraction: number | null): void => {
        if (!options?.onStage) return
        try { options.onStage(s, fraction) } catch (err) { log.warn('loadFragments onStage listener threw', err) }
      }

      // What a cancelled or failed load has to put back.
      const previousActiveId = currentModelId
      const anchorsScene     = fragmentsManager.core.baseCoordinates === null

      // fragments' own cancel: the worker checks between its stages and rejects
      // the pending load. It cannot interrupt a stage (inflate is one
      // synchronous call) and is a no-op once the worker has finished — the
      // checks after the await cover that window.
      const onAbort = (): void => {
        try { fragmentsManager.core.abort(modelId) } catch { /* nothing in flight */ }
      }
      signal?.addEventListener('abort', onAbort, { once: true })

      let model: FRAGS.FragmentsModel | null = null
      try {
        try {
          model = await fragmentsManager.core.load(buffer, {
            modelId,
            camera: world.camera.three,
            onProgress: (event) => {
              const stagePercent: Record<string, number> = {
                decompressing: 20, parsing: 45, generating: 65, done: 75,
              }
              onProgress?.(stagePercent[event.stage] ?? 50)
              // fragments' own 'done' is its worker finishing, not this call
              // (see LoadFragmentsStage) — ours is reported after setup.
              if (event.stage !== 'done') stage(event.stage, stageFraction(event.progress))
            },
          })
        } catch (err) {
          // fragments already disposed its partial model on both threads.
          if (signal?.aborted || err instanceof FRAGS.LoadAbortedError || isFragmentsLoadAborted(err)) {
            throw loadCancelledError()
          }
          log.error('loadFragments error:', err)
          throw err
        }
        throwIfLoadAborted(signal)

        const pivot = new THREE.Group()
        pivot.name = `ifc-model-pivot-${modelId}`
        world.scene.three.add(pivot)
        pivot.add(model.object)
        modelPivots.set(modelId, pivot)
        pivotTransforms.set(modelId, { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 })

        currentModel   = model
        currentModelId = modelId
        currentPivot   = pivot
        modelObjects.set(modelId, model)
        bindClippingPlanes(model)

        // Record whatever the loader did to this model's datum, rather than
        // assuming it did nothing. The converter no longer translates models to
        // the origin, so this is normally zero — but `loadIfc` still asks for
        // coordination, and a library default can change under us again. Reading
        // it once and handing it to whoever needs it is what stops that from
        // silently misplacing every coordinate-registered thing in the scene.
        try {
          const t = new THREE.Vector3().setFromMatrixPosition(await model.getCoordinationMatrix())
          if (Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.z)) {
            modelCoordination.set(modelId, { x: t.x, y: t.y, z: t.z })
          }
        } catch {
          // Older fragments build without the accessor. Absent beats invented:
          // callers read null as "unknown" and leave positions alone.
        }
        throwIfLoadAborted(signal)

        const result = await setupLoadedModel(model, modelId, fileName, fileSize ?? 0, onProgress, {
          signal,
          frame: options?.frame,
          onStage: stage,
        })
        stage('done', 1)
        return { ...result, modelId }
      } catch (err) {
        // A cancel can surface as any error from the call it interrupted; the
        // signal is the truth. Either way nothing of this model may stay behind.
        const cancelled = signal?.aborted === true || isAbortError(err)
        if (model) {
          if (!cancelled) log.error(`loadFragments: setup of "${modelId}" failed — model discarded:`, err)
          await discardUncommittedLoad(modelId, model, previousActiveId, anchorsScene)
        }
        if (cancelled) throw isAbortError(err) ? err : loadCancelledError()
        throw err
      } finally {
        signal?.removeEventListener('abort', onAbort)
      }
    },

    hasModel(modelId: string): boolean {
      return modelObjects.has(modelId)
    },

    waitForModelIdle(modelId: string, timeoutMs: number, signal?: AbortSignal) {
      return pollModelIdle(() => {
        const model = modelObjects.get(modelId)
        return model ? model.isBusy : null
      }, { timeoutMs, signal })
    },

    getRenderStats(): RenderStats | null {
      try {
        const info = wr.info
        return {
          calls:      info.render.calls,
          triangles:  info.render.triangles,
          geometries: info.memory.geometries,
          textures:   info.memory.textures,
          programs:   info.programs?.length ?? 0,
        }
      } catch {
        return null
      }
    },

    // ─── getItemData ─────────────────────────────────────────────────────────
    // Fetches real IFC attributes + Psets + spatial containment for an element.
    // Pass modelId to target a specific loaded model; omit to use the current model.
    async getItemData(expressId: number, modelId?: string): Promise<IFCItemData | null> {
      // Resolve the correct model: prefer the explicitly requested one
      const targetModel = (modelId && modelObjects.get(modelId)) ?? currentModel
      if (!targetModel) return null

      try {
        const [data] = await targetModel.getItemsData([expressId], {
          attributesDefault: false,
          attributes: ['Name', 'LongName', 'Description', 'GlobalId', 'ObjectType', 'Tag'],
          relations: {
            // Property sets + quantity sets (IfcPropertySet + IfcElementQuantity)
            IsDefinedBy: {
              attributes: true,
              relations: true,
            },
            // Spatial containment — to extract storey name
            ContainedInStructure: {
              attributes: true,
              relations: false,
            },
            // Suppress inverse relations we don't need
            DefinesOccurrence: {
              attributes: false,
              relations: false,
            },
            // IFC4: type object and its property sets
            IsTypedBy: {
              attributes: true,
              relations: true,
            },
            // Materials via IfcRelAssociatesMaterial
            HasAssociations: {
              attributes: true,
              relations: true,
            },
          },
        })

        if (!data) return null

        const raw = data as Record<string, unknown>
        const { typeName, psets: typeProperties } = parseTypeProps(raw['IsTypedBy'])

        return {
          name:           attrStr(raw['Name']),
          longName:       attrStr(raw['LongName']),
          description:    attrStr(raw['Description']),
          globalId:       attrStr(raw['GlobalId']),
          objectType:     attrStr(raw['ObjectType']),
          tag:            attrStr(raw['Tag']),
          storey:         extractStorey(raw['ContainedInStructure']),
          propertySets:   formatPsets(raw['IsDefinedBy']),
          quantitySets:   formatQuantities(raw['IsDefinedBy']),
          materials:      parseAssociations(raw['HasAssociations']),
          typeProperties,
          typeName,
          raw,
        }
      } catch (err) {
        console.warn('[Viewer] getItemData error:', err)
        return null
      }
    },

    resetCamera() {
      walkNav?.stop()
      void world.camera.controls.setLookAt(30, 24, 36, 0, 2, 0, true)
    },

    setWalkMode(on: boolean): boolean {
      if (!walkNav) return false
      if (on) walkNav.start(); else walkNav.stop()
      return walkNav.isActive()
    },

    toggleWalkMode(): boolean {
      return walkNav ? walkNav.toggle() : false
    },

    isWalkMode(): boolean {
      return walkNav?.isActive() ?? false
    },

    setWalkSpeed(metresPerSecond: number) {
      walkNav?.setSpeed(metresPerSecond)
    },

    getWalkSpeed(): number {
      return walkNav?.getSpeed() ?? 0
    },

    getWalkState(): WalkState {
      return walkNav?.getState() ?? { active: false, speed: 0, pointerLocked: false }
    },

    onWalkStateChange(cb: (state: WalkState) => void): () => void {
      walkStateSubscribers.add(cb)
      return () => { walkStateSubscribers.delete(cb) }
    },

    setWalkMoveInput(forward: number, right: number, up = 0) {
      walkNav?.setMoveInput(forward, right, up)
    },

    walkLook(yawDelta: number, pitchDelta: number) {
      walkNav?.look(yawDelta, pitchDelta)
    },

    setWalkPointerLock(on: boolean) {
      walkNav?.setPointerLockEnabled(on)
    },

    frameCategory(id, modelId) {
      if (modelId) {
        // Specific model requested — single-model path (unchanged)
        const typeMap = typeMapByModel.get(modelId) ?? expressIDToType
        const model   = modelObjects.get(modelId) ?? currentModel
        if (!model) return
        const ids = [...typeMap.entries()].filter(([, raw]) => canonicalType(raw) === id).map(([lid]) => lid)
        if (ids.length === 0) return
        safeVoid(model.getMergedBox(ids).then(box => { if (!box.isEmpty()) void world.camera.controls.fitToBox(box, true) }), 'frameCategory')
        return
      }
      // No modelId — collect boxes from every loaded model that has this type and union them
      const boxPromises: Promise<THREE.Box3>[] = []
      for (const [mid, model] of modelObjects) {
        const typeMap = typeMapByModel.get(mid) ?? expressIDToType
        const ids = [...typeMap.entries()].filter(([, raw]) => canonicalType(raw) === id).map(([lid]) => lid)
        if (ids.length > 0) boxPromises.push(model.getMergedBox(ids))
      }
      if (boxPromises.length === 0) return
      safeVoid(
        Promise.all(boxPromises).then(boxes => {
          const merged = new THREE.Box3()
          for (const b of boxes) if (!b.isEmpty()) merged.union(b)
          if (!merged.isEmpty()) void world.camera.controls.fitToBox(merged, true)
        }),
        'frameCategory',
      )
    },

    focusElement(expressId, modelId) {
      // If no modelId given, search all loaded models for the element
      const targetId = modelId ?? [...typeMapByModel.entries()].find(([, m]) => m.has(expressId))?.[0] ?? currentModelId
      const model = (targetId ? modelObjects.get(targetId) : null) ?? currentModel
      if (!model) return
      safeVoid(
        model.getMergedBox([expressId]).then((box) => {
          if (!box.isEmpty()) void world.camera.controls.fitToBox(box, true)
        }),
        'focusElement',
      )
    },

    frameElements(ids, modelId) {
      const model = (modelId ? modelObjects.get(modelId) : null) ?? currentModel
      if (!model || ids.length === 0) return
      safeVoid(
        model.getMergedBox(ids).then((box) => {
          if (!box.isEmpty()) void world.camera.controls.fitToBox(box, true)
        }),
        'frameElements',
      )
    },

    selectElement(expressId, modelId) {
      runSelectElement(expressId, modelId)
    },

    setValidationHighlights(issues, enabled, options) {
      if (modelObjects.size === 0) return
      if (enabled) syncOverlayAppearance(options)
      // The controller owns the overlay layer; applyOverlay re-asserts the selection
      // on top and frames the camera on the issues when the overlay first turns on.
      applyOverlay(() => overlay.applyValidation(issues, currentModelId, options?.severities), enabled)
    },

    setIdsHighlights(failures, enabled, options) {
      if (modelObjects.size === 0) return
      if (enabled) syncOverlayAppearance(options)
      // Validation/IDS share the overlay channel — the controller swaps cleanly.
      applyOverlay(() => overlay.applyIds(failures, currentModelId), enabled)
    },

    getOverlayIssueCount() {
      return overlay.flaggedList().length
    },

    focusOverlayIssue(index) {
      const list = overlay.flaggedList()
      if (list.length === 0) return null
      const i = ((index % list.length) + list.length) % list.length // wrap both ways
      const { modelId, localId } = list[i]
      runSelectElement(localId, modelId)
      // Frame the single element so the user lands right on it.
      const model = modelObjects.get(modelId)
      if (model) {
        safeVoid(
          model.getMergedBox([localId]).then((box) => {
            if (!box.isEmpty()) { box.expandByScalar(1.5); void world.camera.controls.fitToBox(box, true) }
          }),
          'focusOverlayIssue',
        )
      }
      return { index: i, total: list.length }
    },

    isolateElements(targets, enabled) {
      if (modelObjects.size === 0) return
      if (!enabled) {
        // Re-show everything (model-level hidden state is respected by the guard below).
        for (const [modelId, model] of modelObjects) {
          if (modelHidden.has(modelId) || !model.object.visible) continue
          const typeMap = typeMapByModel.get(modelId)
          const allIds = typeMap ? [...typeMap.keys()] : []
          if (allIds.length) void model.setVisible(allIds, true)
        }
        void fragmentsManager.core.update()
        return
      }

      const wantedByModel = new Map<string, Set<number>>()
      for (const t of targets) {
        if (t.expressId < 0) continue
        const mid = t.modelId ?? currentModelId ?? ''
        if (!mid || !modelObjects.has(mid)) continue
        if (!wantedByModel.has(mid)) wantedByModel.set(mid, new Set())
        wantedByModel.get(mid)!.add(t.expressId)
      }

      for (const [modelId, model] of modelObjects) {
        if (modelHidden.has(modelId) || !model.object.visible) continue
        const typeMap = typeMapByModel.get(modelId) ?? new Map<number, string>()
        const wanted = wantedByModel.get(modelId)
        const toShow: number[] = []
        const toHide: number[] = []
        for (const localId of typeMap.keys()) {
          if (wanted?.has(localId)) toShow.push(localId)
          else toHide.push(localId)
        }
        if (toHide.length) void model.setVisible(toHide, false)
        if (toShow.length) void model.setVisible(toShow, true)
      }
      void fragmentsManager.core.update()
    },

    applyFilters(hidden, isolated, hiddenElements, isolatedElement, isolatedModelId) {
      if (modelObjects.size === 0) return
      for (const [modelId, model] of modelObjects) {
        // Skip models hidden at the model level — element-level calls must not
        // re-show a model that the user explicitly hid via ScenePanel.
        if (modelHidden.has(modelId) || !model.object.visible) continue
        const typeMap = typeMapByModel.get(modelId) ?? new Map<number, string>()
        const toHide: number[] = []
        const toShow: number[] = []
        for (const [localId, rawType] of typeMap.entries()) {
          let show: boolean
          if (isolatedElement != null) {
            if (isolatedModelId != null && modelId !== isolatedModelId) {
              // Isolation is scoped: other models render normally under category filters
              const canon = canonicalType(rawType)
              show = isolated ? (canon === isolated) : !hidden.has(canon)
            } else {
              show = localId === isolatedElement
            }
          } else {
            const canon   = canonicalType(rawType)
            const catShow = isolated ? (canon === isolated) : !hidden.has(canon)
            show          = catShow && !(hiddenElements?.has(`${modelId}:${localId}`))
          }
          if (show) toShow.push(localId)
          else      toHide.push(localId)
        }
        if (toHide.length) void model.setVisible(toHide, false)
        if (toShow.length) void model.setVisible(toShow, true)
      }
      void fragmentsManager.core.update()
    },

    applyStyle(style) {
      if (modelObjects.size === 0) return
      // Apply style to every loaded model
      for (const model of modelObjects.values()) {
        if (style === 'xray') {
          void model.resetColor(undefined)
          void model.setOpacity(undefined, 0.2)
        } else if (style === 'blueprint') {
          void model.resetOpacity(undefined)
          void model.setColor(undefined, new THREE.Color(0xE6E9F2))
        } else {
          void model.resetOpacity(undefined)
          void model.resetColor(undefined)
        }
      }
    },

    async setPresentationLook(look) {
      if (!sectionPrevPlanes) hidePresentationGrid(!!look?.hideGrid)
      if (modelObjects.size === 0) return
      for (const [modelId, model] of modelObjects) {
        const typeMap = typeMapByModel.get(modelId) ?? new Map<number, string>()
        await model.resetOpacity(undefined)
        await model.resetColor(undefined)
        if (!look) { await paintPalette(model, typeMap); continue }

        const focus = new Set(look.focusTypes.map((t) => t.toUpperCase()))
        const focusIds: number[] = []
        const restIds: number[] = []
        for (const [localId, rawType] of typeMap) {
          const t = rawType.toUpperCase()
          if (focus.has(t) || focus.has(canonicalType(rawType))) focusIds.push(localId)
          else restIds.push(localId)
        }
        if (look.base === 'original') {
          await paintPalette(model, new Map(restIds.map((id) => [id, typeMap.get(id)!])))
        } else if (restIds.length) {
          await model.setColor(restIds, new THREE.Color(look.baseColor))
        }
        if (restIds.length && look.baseOpacity < 0.999) await model.setOpacity(restIds, look.baseOpacity)
        if (focusIds.length) {
          if (look.focusColor) await model.setColor(focusIds, new THREE.Color(look.focusColor))
          else await paintPalette(model, new Map(focusIds.map((id) => [id, typeMap.get(id)!])))
        }
      }
      await fragmentsManager.core.update(true)
    },

    async setPresentationSection(section) {
      const wr3 = world.renderer!.three
      wr3.clippingPlanes = sectionPrevPlanes ?? wr3.clippingPlanes
      sectionPrevPlanes = null
      if (!section) {
        // Hand the fill back to the section tool, if it has one up.
        presentationPoche = null
        syncPoche()
        hidePresentationGrid(false)
        void fragmentsManager.core.update(true)
        return
      }
      // A cut is a drawing: the ground grid only adds noise to it.
      hidePresentationGrid(true)

      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        new THREE.Vector3(section.normal.x, section.normal.y, section.normal.z).normalize(),
        new THREE.Vector3(section.point.x, section.point.y, section.point.z),
      )
      sectionPrevPlanes = wr3.clippingPlanes
      wr3.clippingPlanes = [...wr3.clippingPlanes, plane]

      // Poché for the cut (see patchPocheMaterial). Takes over from any section
      // tool fill while the capture is set up.
      presentationPoche = section.poche
      syncPoche()
      await fragmentsManager.core.update(true)
    },

    async captureExplodedLayers(layers, gap, scale = 1) {
      const scene3 = world.scene.three
      const wr3 = world.renderer!.three
      const prevBg = scene3.background
      const prevFog = scene3.fog
      const prevClear = wr3.getClearAlpha()
      const prevGrid = grid.visible
      // Hide everything that isn't a model or a light (grid, OSM context,
      // markers) so each layer is the storey alone on transparency.
      const pivots = new Set<THREE.Object3D>(modelPivots.values())
      for (const m of modelObjects.values()) pivots.add(m.object)
      const hidden: THREE.Object3D[] = []
      for (const child of scene3.children) {
        if (pivots.has(child) || (child as THREE.Light).isLight || !child.visible) continue
        child.visible = false
        hidden.push(child)
      }
      scene3.background = null
      scene3.fog = null
      grid.visible = false
      wr3.setClearAlpha(0)

      const origY = new Map<string, number>()
      for (const [mid, m] of modelObjects) origY.set(mid, m.object.position.y)
      const allIds = (mid: string) => [...(typeMapByModel.get(mid)?.keys() ?? [])]
      const out: string[] = []
      try {
        for (let i = 0; i < layers.length; i++) {
          const wanted = new Map(layers[i].map((l) => [l.modelId, l.ids]))
          for (const [mid, m] of modelObjects) {
            if (modelHidden.has(mid)) continue
            const all = allIds(mid)
            if (all.length) await m.setVisible(all, false)
            const ids = wanted.get(mid)
            if (ids?.length) await m.setVisible(ids, true)
            m.object.position.y = (origY.get(mid) ?? 0) + i * gap
            m.object.updateMatrixWorld(true)
          }
          await fragmentsManager.core.update(true)
          await new Promise((r) => setTimeout(r, 250))
          try { world.camera.controls.update(0) } catch { /* no controls */ }
          out.push(withRenderScale(scale, () => {
            wr3.render(scene3, world.camera.three)
            return wr3.domElement.toDataURL('image/png')
          }))
        }
      } finally {
        for (const [mid, m] of modelObjects) {
          m.object.position.y = origY.get(mid) ?? 0
          m.object.updateMatrixWorld(true)
          if (modelHidden.has(mid)) continue
          const all = allIds(mid)
          if (all.length) await m.setVisible(all, true)
        }
        for (const o of hidden) o.visible = true
        scene3.background = prevBg
        scene3.fog = prevFog
        grid.visible = prevGrid
        wr3.setClearAlpha(prevClear)
        await fragmentsManager.core.update(true)
      }
      return out
    },


    setSelectCallback(cb) { selectCallback = cb },

    setContextMenuCallback(cb) { contextMenuCallback = cb },

    getGpuEstimateBytes() {
      const info      = wr.info
      // Point cloud buffers are the largest single allocation the app can make
      // and their size is known exactly — count them for real and take their
      // geometries out of the 128 KB-per-geometry guess so they aren't double-counted.
      const pc         = pointCloudInstance?.getStats() ?? { gpuBytes: 0, chunkCount: 0 }
      const geometries = Math.max(0, info.memory.geometries - pc.chunkCount)
      const geomBytes  = geometries * 1024 * 128
      const texBytes   = info.memory.textures * 1024 * 256
      return geomBytes + texBytes + pc.gpuBytes
    },

    // ─── Camera presets ───────────────────────────────────────────────────────

    setCameraPreset(preset: CameraPreset, opts?: { animate?: boolean }) {
      const box = currentModel?.box ?? new THREE.Box3(
        new THREE.Vector3(-10, -10, -10),
        new THREE.Vector3(10,  10,  10),
      )
      const center = new THREE.Vector3()
      const size   = new THREE.Vector3()
      box.getCenter(center)
      box.getSize(size)

      // Apply pivot offset so camera targets the transformed model
      if (currentPivot) {
        center.add(new THREE.Vector3(
          currentPivot.position.x,
          currentPivot.position.y,
          currentPivot.position.z,
        ))
      }

      const d = Math.max(size.x, size.y, size.z, 4) * 1.6

      const OFFSETS: Record<CameraPreset, [number, number, number]> = {
        iso:    [d,  d * 0.75, d],
        top:    [0,  d * 2.2,  0.001],
        bottom: [0, -d * 2.2,  0.001],
        front:  [0,  0,         d * 2],
        back:   [0,  0,        -d * 2],
        left:   [-d * 2, 0,    0],
        right:  [d * 2,  0,    0],
      }
      const [ox, oy, oz] = OFFSETS[preset]

      const animate = opts?.animate !== false
      void world.camera.controls.setLookAt(
        center.x + ox, center.y + oy, center.z + oz,
        center.x,       center.y,      center.z,
        animate,
      )
      if (!animate) {
        try { world.camera.controls.update(0) } catch { /* no controls yet */ }
        void fragmentsManager.core.update(true)
      }
    },

    // ─── Model transform ──────────────────────────────────────────────────────

    setModelTransform(transform: ModelTransform, modelId?: string) {
      const tid   = modelId ?? currentModelId
      const pivot = (tid ? modelPivots.get(tid) : null) ?? currentPivot
      if (!pivot || !tid) return
      const DEG    = Math.PI / 180
      const stored = pivotTransforms.get(tid) ?? { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 }

      if (transform.position) {
        const p = transform.position
        pivot.position.set(p.x, p.y, p.z)
        stored.position = { ...p }
      }
      if (transform.rotation) {
        const r = transform.rotation
        pivot.rotation.set(r.x * DEG, r.y * DEG, r.z * DEG)
        stored.rotation = { ...r }
      }
      if (transform.scale !== undefined) {
        const s = transform.scale
        if (typeof s === 'number') pivot.scale.setScalar(s)
        else pivot.scale.set(s.x, s.y, s.z)
        stored.scale = s
      }

      pivotTransforms.set(tid, stored)
      void fragmentsManager.core.update()
      refreshSelectionBox()
      // Snap geometry is cached in WORLD space: a moved model would snap to
      // where it used to be.
      try { snapResolver?.clear() } catch { /* ok */ }
      storeyLevelsCache = null
    },

    setSatelliteResolver(fn) { satelliteResolver = fn },

    resetModelTransform(modelId?: string) {
      const tid   = modelId ?? currentModelId
      const pivot = (tid ? modelPivots.get(tid) : null) ?? currentPivot
      if (!pivot || !tid) return
      pivot.position.set(0, 0, 0)
      pivot.rotation.set(0, 0, 0)
      pivot.scale.set(1, 1, 1)
      pivotTransforms.set(tid, { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 })
      void fragmentsManager.core.update()
      refreshSelectionBox()
      try { snapResolver?.clear() } catch { /* ok */ }
      storeyLevelsCache = null
    },

    getModelBounds(modelId?: string) {
      const tid   = modelId ?? currentModelId
      const model = (tid ? modelObjects.get(tid) : null) ?? currentModel
      const pivot = (tid ? modelPivots.get(tid) : null) ?? currentPivot
      if (!model || !pivot) return null
      const box = model.box
      if (box.isEmpty()) return null

      pivot.updateMatrixWorld(true)
      const m  = pivot.matrixWorld
      const wx = new THREE.Box3()
      const corners: THREE.Vector3[] = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z),
      ]
      for (const v of corners) wx.expandByPoint(v.applyMatrix4(m))

      const center = new THREE.Vector3()
      const size   = new THREE.Vector3()
      wx.getCenter(center)
      wx.getSize(size)
      return {
        center: { x: center.x, y: center.y, z: center.z },
        size:   { x: size.x,   y: size.y,   z: size.z   },
      }
    },

    getModelCoordination(modelId?: string) {
      const tid = modelId ?? currentModelId
      return (tid ? modelCoordination.get(tid) : null) ?? null
    },

    getFragmentsModel(modelId?: string) {
      const tid = modelId ?? currentModelId
      return (tid ? modelObjects.get(tid) : null) ?? currentModel ?? null
    },

    getModelFootprint(modelId?: string) {
      const tid   = modelId ?? currentModelId
      const model = (tid ? modelObjects.get(tid) : null) ?? currentModel
      const pivot = (tid ? modelPivots.get(tid) : null) ?? currentPivot
      if (!model || !pivot) return null
      const box = model.box
      if (box.isEmpty()) return null

      pivot.updateMatrixWorld(true)
      const m = pivot.matrixWorld
      // The four plan corners of the LOCAL box, transformed individually and
      // NOT re-boxed. Taken at the box's floor: a transform with any tilt in it
      // would otherwise report the roof's outline, and the footprint question
      // is always about where the model meets the ground.
      const corners = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      ]
      return corners.map((v) => {
        v.applyMatrix4(m)
        return { x: v.x, z: v.z }
      })
    },

    getModelTransform(modelId?: string) {
      const tid    = modelId ?? currentModelId
      const stored = tid ? (pivotTransforms.get(tid) ?? null) : null
      return {
        position: stored ? { ...stored.position } : { x: 0, y: 0, z: 0 },
        rotation: stored ? { ...(stored.rotation as { x: number; y: number; z: number }) } : { x: 0, y: 0, z: 0 },
        scale:    stored ? stored.scale : 1,
      }
    },

    frameAllModels() {
      if (modelObjects.size === 0) return
      const combined = combinedModelsBox()
      if (!combined.isEmpty()) {
        tuneSceneToBounds(combined)
        void world.camera.controls.fitToBox(combined, true)
      }
    },

    isolateModel(modelId: string) {
      for (const [mid, model] of modelObjects) {
        const visible = mid === modelId
        const allIds  = [...(typeMapByModel.get(mid) ?? new Map()).keys()]
        if (!visible) {
          modelHidden.add(mid)
          model.object.visible = false
          if (allIds.length) void model.setVisible(allIds, false)
        } else {
          modelHidden.delete(mid)
          model.object.visible = true
          if (allIds.length) void model.setVisible(allIds, true)
        }
      }
      void fragmentsManager.core.update()
    },

    showAllModels() {
      for (const [mid, model] of modelObjects) {
        modelHidden.delete(mid)
        model.object.visible = true
        const allIds = [...(typeMapByModel.get(mid) ?? new Map()).keys()]
        if (allIds.length) void model.setVisible(allIds, true)
      }
      void fragmentsManager.core.update()
    },

    setActiveModel(modelId: string) {
      const model = modelObjects.get(modelId)
      if (!model) {
        console.warn(`[Viewer] setActiveModel: "${modelId}" is not loaded`)
        return
      }
      currentModel   = model
      currentModelId = modelId
      expressIDToType = typeMapByModel.get(modelId) ?? new Map()
      currentPivot   = modelPivots.get(modelId) ?? null
    },

    getLoadedModelIds(): string[] {
      return [...modelObjects.keys()]
    },

    setModelVisible(modelId: string, visible: boolean) {
      const model = modelObjects.get(modelId)
      if (!model) {
        console.warn(`[Viewer] setModelVisible: "${modelId}" is not loaded`)
        return
      }

      const typeMap = typeMapByModel.get(modelId) ?? new Map<number, string>()
      const allIds  = [...typeMap.keys()]

      if (!visible) {
        modelHidden.add(modelId)
        model.object.visible = false
        // Also hide via Fragments API so transparent meshes (IfcSpace, etc.) that
        // live in a separate render pass are also properly hidden.
        if (allIds.length) void model.setVisible(allIds, false)
      } else {
        modelHidden.delete(modelId)
        model.object.visible = true
        // Show all elements first; the caller (App.tsx) immediately re-calls
        // applyFilters to restore the correct per-element/category visibility.
        if (allIds.length) void model.setVisible(allIds, true)
      }
      void fragmentsManager.core.update()
    },

    setModelOpacity(opacity: number, modelId?: string) {
      const clamped = Math.max(0.02, Math.min(1, opacity))
      const targets = modelId
        ? [[modelId, modelObjects.get(modelId)] as const]
        : [...modelObjects.entries()]

      for (const [id, model] of targets) {
        if (!model) {
          console.warn(`[Viewer] setModelOpacity: "${id}" is not loaded`)
          continue
        }
        if (clamped >= 0.999) void model.resetOpacity(undefined)
        else void model.setOpacity(undefined, clamped)
      }
      void fragmentsManager.core.update()
    },

    async removeModel(modelId: string) {
      const model = modelObjects.get(modelId)
      if (!model) {
        console.warn(`[Viewer] removeModel: "${modelId}" is not loaded`)
        return
      }

      // Remove and dispose the per-model pivot group
      const pivot = modelPivots.get(modelId)
      if (pivot) {
        world.scene.three.remove(pivot)
        modelPivots.delete(modelId)
      }
      pivotTransforms.delete(modelId)

      // A dispose that throws (worker already gone, a tile half-deleted) must
      // not strand the model in the maps: it is out of the scene already, and
      // the callers go on to drop it from every store. Leaving it here made
      // the id look loaded forever, and every loop over the loaded models
      // (raycast, filters, framing) kept visiting a disposed one.
      try {
        await model.dispose()
      } catch (err) {
        log.error(`removeModel: dispose of "${modelId}" failed — dropping it anyway:`, err)
      }
      modelObjects.delete(modelId)
      modelCoordination.delete(modelId)
      typeMapByModel.delete(modelId)
      modelHidden.delete(modelId)

      // Clear hover/select state that referenced this model
      if (hoveredModelId  === modelId) { hoveredLocalId  = null; hoveredModelId  = null }
      if (selectedModelId === modelId) { selectedLocalId = null; selectedModelId = null; removeSelectionBox() }

      // If the removed model was active, promote another
      if (currentModelId === modelId) {
        const nextId = modelObjects.keys().next().value ?? null
        currentModel    = nextId ? (modelObjects.get(nextId) ?? null) : null
        currentModelId  = nextId
        expressIDToType = nextId ? (typeMapByModel.get(nextId) ?? new Map()) : new Map()
        currentPivot    = nextId ? (modelPivots.get(nextId) ?? null) : null
      }

      overlay.forget(modelId)
      void fragmentsManager.core.update()
    },

    frameActiveModel() {
      if (!currentModel) return
      const box = currentModel.box
      if (box.isEmpty()) return
      // If the model has a pivot transform, compute the world-space box
      if (currentPivot) {
        currentPivot.updateMatrixWorld(true)
        const m  = currentPivot.matrixWorld
        const wx = new THREE.Box3()
        const corners: THREE.Vector3[] = [
          new THREE.Vector3(box.min.x, box.min.y, box.min.z),
          new THREE.Vector3(box.max.x, box.min.y, box.min.z),
          new THREE.Vector3(box.min.x, box.max.y, box.min.z),
          new THREE.Vector3(box.max.x, box.max.y, box.min.z),
          new THREE.Vector3(box.min.x, box.min.y, box.max.z),
          new THREE.Vector3(box.max.x, box.min.y, box.max.z),
          new THREE.Vector3(box.min.x, box.max.y, box.max.z),
          new THREE.Vector3(box.max.x, box.max.y, box.max.z),
        ]
        for (const v of corners) wx.expandByPoint(v.applyMatrix4(m))
        void world.camera.controls.fitToBox(wx, true)
      } else {
        void world.camera.controls.fitToBox(box, true)
      }
    },

    getModelObject(modelId: string): THREE.Object3D | null {
      return modelPivots.get(modelId) ?? null
    },

    setCameraViewpoint(
      position:  { x: number; y: number; z: number },
      direction: { x: number; y: number; z: number },
    ) {
      const { x: px, y: py, z: pz } = position
      const { x: dx, y: dy, z: dz } = direction
      void world.camera.controls.setLookAt(px, py, pz, px + dx, py + dy, pz + dz, true)
    },

    getCameraViewpoint(): CameraViewpoint | null {
      try {
        const controls = world.camera.controls
        const pos = controls.getPosition(new THREE.Vector3())
        const tgt = controls.getTarget(new THREE.Vector3())
        const dir = tgt.clone().sub(pos)
        if (dir.lengthSq() === 0) dir.set(0, 0, -1)
        dir.normalize()
        const cam = world.camera.three as THREE.PerspectiveCamera | THREE.OrthographicCamera
        const isPersp = (cam as THREE.PerspectiveCamera).isPerspectiveCamera === true
        const fovDeg  = isPersp ? (cam as THREE.PerspectiveCamera).fov : 45
        const aspect  = isPersp
          ? (cam as THREE.PerspectiveCamera).aspect
          : container.clientWidth / Math.max(1, container.clientHeight)
        // The top of the screen as drawn. Taken from the camera, not derived
        // from `dir`: looking straight down, only the camera knows which way
        // the plan is turned.
        cam.updateMatrixWorld()
        const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).normalize()
        return {
          position:  { x: pos.x, y: pos.y, z: pos.z },
          target:    { x: tgt.x, y: tgt.y, z: tgt.z },
          direction: { x: dir.x, y: dir.y, z: dir.z },
          up:        { x: up.x, y: up.y, z: up.z },
          fovDeg,
          aspect,
        }
      } catch {
        return null
      }
    },

    setCameraLookAt(position: Vec3Like, target: Vec3Like, animate = true) {
      void world.camera.controls.setLookAt(
        position.x, position.y, position.z,
        target.x, target.y, target.z,
        animate,
      )
      if (!animate) {
        // Land the jump now and re-cull fragments for the new view; otherwise
        // the camera only moves on the next frame and a snapshot taken before it
        // renders with tiles streamed for the old viewpoint (half a building).
        try { world.camera.controls.update(0) } catch { /* no controls yet */ }
        void fragmentsManager.core.update(true)
      }
    },

    async getElementsBox(ids: number[], modelId?: string) {
      const model = (modelId ? modelObjects.get(modelId) : null) ?? currentModel
      if (!model || ids.length === 0) return null
      try {
        const box = await model.getMergedBox(ids)
        if (box.isEmpty()) return null
        return {
          min: { x: box.min.x, y: box.min.y, z: box.min.z },
          max: { x: box.max.x, y: box.max.y, z: box.max.z },
        }
      } catch {
        return null
      }
    },

    async applyModelPalette(palette, glazingOpacity = 0.5) {
      for (const [modelId, model] of modelObjects) {
        const typeMap = typeMapByModel.get(modelId)
        if (!typeMap) continue
        try {
          await model.resetHighlight()
          if (!palette) continue
          const buckets = new Map<keyof typeof palette, number[]>()
          for (const [id, raw] of typeMap) {
            const key = paletteBucket(canonicalType(raw))
            const list = buckets.get(key)
            if (list) list.push(id)
            else buckets.set(key, [id])
          }
          for (const [key, ids] of buckets) {
            const glass = key === 'glazing'
            await model.highlight(ids, {
              color: new THREE.Color(palette[key]),
              renderedFaces: FRAGS.RenderedFaces.TWO,
              opacity: glass ? glazingOpacity : 1,
              transparent: glass && glazingOpacity < 1,
              preserveOriginalMaterial: false,
            })
          }
        } catch (e) {
          console.warn('[Viewer] applyModelPalette:', e)
        }
      }
      try { await fragmentsManager.core.update(true) } catch { /* next frame */ }
    },

    setLighting(light) {
      if (!light) {
        hemi.color.copy(defaultLighting.sky)
        hemi.groundColor.copy(defaultLighting.ground)
        hemi.intensity = defaultLighting.ambient
        dir.color.copy(defaultLighting.key)
        dir.intensity = defaultLighting.keyIntensity
        dir.position.copy(defaultLighting.keyPos)
        fill.color.copy(defaultLighting.fill)
        fill.intensity = defaultLighting.fillIntensity
        fill.position.copy(defaultLighting.fillPos)
        return
      }
      const az = (light.azimuth * Math.PI) / 180
      const el = (Math.max(2, Math.min(88, light.elevation)) * Math.PI) / 180
      const r = defaultLighting.keyPos.length()
      hemi.color.set(light.sky)
      hemi.groundColor.set(light.ground)
      hemi.intensity = light.ambient
      dir.color.set(light.key)
      dir.intensity = light.keyIntensity
      dir.position.set(Math.sin(az) * Math.cos(el) * r, Math.sin(el) * r, Math.cos(az) * Math.cos(el) * r)
      // The fill comes from the other side, lower, so the shadow side never goes flat black.
      fill.color.set(light.fill)
      fill.intensity = light.fillIntensity
      fill.position.set(-Math.sin(az) * r * 0.8, r * 0.3, -Math.cos(az) * r * 0.8)
    },

    setGridVisible(visible: boolean) {
      const was = grid.visible
      grid.visible = visible
      return was
    },

    async getIdsByGuids(guids: string[], modelId?: string) {
      const model = (modelId ? modelObjects.get(modelId) : null) ?? currentModel
      if (!model || guids.length === 0) return guids.map(() => null)
      try {
        return await model.getLocalIdsByGuids(guids)
      } catch {
        return guids.map(() => null)
      }
    },

    async getProjectNames(modelId?: string) {
      const none = { project: null, building: null }
      const model = (modelId ? modelObjects.get(modelId) : null) ?? currentModel
      if (!model) return none
      try {
        const root = await model.getSpatialStructure() as SpatialItem
        const found: Record<string, number> = {}
        walkSpatial(root, (id, cls) => {
          if ((cls === 'IFCPROJECT' || cls === 'IFCBUILDING') && !(cls in found)) found[cls] = id
          return cls !== 'IFCBUILDINGSTOREY'
        })
        const wanted = [found.IFCPROJECT, found.IFCBUILDING].filter((id): id is number => id !== undefined)
        if (wanted.length === 0) return none
        const data = await model.getItemsData(wanted, { attributesDefault: false, attributes: ['Name', 'LongName'] })
        const nameOf = (id: number | undefined) => (id === undefined ? null : itemName(data[wanted.indexOf(id)]) || null)
        return { project: nameOf(found.IFCPROJECT), building: nameOf(found.IFCBUILDING) }
      } catch {
        return none
      }
    },

    async getStoreys(modelId?: string) {
      const model = (modelId ? modelObjects.get(modelId) : null) ?? currentModel
      if (!model) return []
      try {
        const root = await model.getSpatialStructure() as SpatialItem
        const storeys: Array<{ expressId: number; elementIds: number[] }> = []
        walkSpatial(root, (id, cls, node) => {
          if (cls !== 'IFCBUILDINGSTOREY') return true
          const ids = new Set<number>()
          // Everything below the storey that is not itself a spatial container.
          walkSpatial(node, (cid, ccls) => {
            if (cid !== id && !SPATIAL_CONTAINERS.has(ccls)) ids.add(cid)
            return true
          }, cls)
          storeys.push({ expressId: id, elementIds: [...ids] })
          return false
        })
        if (storeys.length === 0) return []
        const data = await model.getItemsData(storeys.map((s) => s.expressId), { attributesDefault: false, attributes: ['Name', 'LongName'] })
        return storeys.map((s, i) => ({ ...s, name: itemName(data[i]) || `#${s.expressId}` }))
      } catch (e) {
        console.warn('[Viewer] getStoreys failed:', e)
        return []
      }
    },

    setBackground(settings) {
      applyBackground(settings)
    },

    takeSnapshot(scale = 1, options: { annotations?: boolean } = {}): string {
      const annotations = options.annotations !== false
      // The WebGL drawing buffer is cleared after compositing
      // (preserveDrawingBuffer is off), so reading pixels outside the render
      // loop yields a black PNG. Force a synchronous render into the buffer
      // and read it back in the same task.
      // Apply any pending camera-controls state (an instant setLookAt only lands
      // on the next update) so the frame shows the camera that was asked for.
      try { world.camera.controls.update(0) } catch { /* no controls yet */ }
      // Hidden for this one render only; the next frame shows them again.
      const restoreHandles = sectionSystem.hideForCapture()
      const restoreMeasures = annotations ? null : measureSystem.hideForCapture()
      try {
        return withRenderScale(scale, () => {
          try {
            const pp = postproductionReady ? world.renderer?.postproduction : null
            if (pp?.enabled && pp.composer) {
              pp.composer.render()
            } else {
              wr.render(world.scene.three, world.camera.three)
            }
          } catch {
            try { wr.render(world.scene.three, world.camera.three) } catch { /* read whatever the buffer holds */ }
          }
          try {
            const frame = wr.domElement
            if (annotations) {
              // Copy the frame in the same task (the buffer is not preserved),
              // then paint the measurement labels over it.
              const out = document.createElement('canvas')
              out.width = frame.width
              out.height = frame.height
              const ctx = out.getContext('2d')
              if (ctx) {
                ctx.drawImage(frame, 0, 0)
                const s = frame.width / Math.max(1, frame.clientWidth || frame.width)
                if (measureSystem.paintLabels(ctx, out.width, out.height, s)) return out.toDataURL('image/png')
              }
            }
            return frame.toDataURL('image/png')
          } catch {
            return ''
          }
        })
      } finally {
        restoreHandles()
        restoreMeasures?.()
      }
    },

    acquireRecordingCanvas,

    getCanvas(): HTMLCanvasElement | null {
      try {
        return wr.domElement
      } catch {
        return null
      }
    },

    // ─── Shot rendering (Clip Studio) ─────────────────────────────────────────

    async beginShotRender(width: number, height: number): Promise<void> {
      if (shotSession) return
      const controls = world.camera.controls
      const pos = new THREE.Vector3()
      const tgt = new THREE.Vector3()
      controls.getPosition(pos)
      controls.getTarget(tgt)
      const size = wr.getSize(new THREE.Vector2())
      const wasOrtho = world.camera.projection.current !== 'Perspective'
      // Shots are perspective moves; an ortho view would ignore the fov.
      if (wasOrtho) await world.camera.projection.set('Perspective')
      const cam = world.camera.threePersp
      shotSession = {
        width: Math.max(2, Math.round(width)),
        height: Math.max(2, Math.round(height)),
        pixelRatio: wr.getPixelRatio(),
        size,
        aspect: cam.aspect,
        fov: cam.fov,
        position: pos,
        target: tgt,
        wasOrtho,
        rendererEnabled: world.renderer!.enabled,
      }
      // Stop the renderer's own loop from painting between our frames.
      world.renderer!.enabled = false
      // Section handles are interface, not content: never in a clip.
      shotHandlesRestore = sectionSystem.hideForCapture()
      wr.setPixelRatio(1)
      // updateStyle=false: only the drawing buffer changes size, not the CSS box,
      // so the layout and the renderer's ResizeObserver never notice.
      wr.setSize(shotSession.width, shotSession.height, false)
      cam.aspect = shotSession.width / shotSession.height
      cam.updateProjectionMatrix()
    },

    async renderShotFrame(pose): Promise<HTMLCanvasElement> {
      const s = shotSession
      if (!s) throw new Error('renderShotFrame called outside beginShotRender/endShotRender')
      const cam = world.camera.threePersp
      // A window resize during a long render would reset the buffer — re-assert it.
      const now = wr.getSize(new THREE.Vector2())
      if (now.x !== s.width || now.y !== s.height) wr.setSize(s.width, s.height, false)
      if (cam.fov !== pose.fovDeg || cam.aspect !== s.width / s.height) {
        cam.fov = pose.fovDeg
        cam.aspect = s.width / s.height
        cam.updateProjectionMatrix()
      }
      const controls = world.camera.controls
      await controls.setLookAt(
        pose.position.x, pose.position.y, pose.position.z,
        pose.target.x, pose.target.y, pose.target.z,
        false,
      )
      controls.update(0)
      cam.updateMatrixWorld()
      // Fragments decides what to stream (and at what detail) from the camera.
      // Waiting for it is what makes an instant camera jump render complete
      // geometry instead of whatever the previous pose had loaded.
      try { await fragmentsManager.core.update(true) } catch { /* render what is loaded */ }
      wr.render(world.scene.three, cam)
      // Labels at the size they have on screen, relative to the frame height.
      return withShotLabels(wr.domElement, s.height / Math.max(1, s.size.y))
    },

    async endShotRender(): Promise<void> {
      const s = shotSession
      if (!s) return
      shotSession = null
      shotHandlesRestore?.()
      shotHandlesRestore = null
      const cam = world.camera.threePersp
      wr.setPixelRatio(s.pixelRatio)
      wr.setSize(s.size.x, s.size.y, false)
      cam.fov = s.fov
      cam.aspect = s.aspect
      cam.updateProjectionMatrix()
      await world.camera.controls.setLookAt(
        s.position.x, s.position.y, s.position.z,
        s.target.x, s.target.y, s.target.z,
        false,
      )
      if (s.wasOrtho) await world.camera.projection.set('Orthographic')
      world.renderer!.enabled = s.rendererEnabled
      // Let the renderer re-derive everything from its container (CSS size,
      // postproduction targets) now that the buffer is back.
      try { world.renderer!.resize(undefined) } catch { /* next resize event fixes it */ }
      void fragmentsManager.core.update(true)
    },

    // ─── Postproduction ───────────────────────────────────────────────────────

    setRenderQuality(quality: 'standard' | 'quality') {
      if (!postproductionReady) return
      try {
        const renderer = world.renderer
        if (!renderer) return
        const pp = renderer.postproduction
        pp.enabled = (quality === 'quality')
      } catch (err) {
        console.warn('[Viewer] setRenderQuality failed:', err)
      }
    },

    // ─── Measurements ─────────────────────────────────────────────────────────

    getMeasure() {
      return measureSystem
    },

    clearMeasurements() {
      measureSystem.setTool('none')
      measureSystem.clear()
    },

    // ─── Sections ─────────────────────────────────────────────────────────────

    getSections() {
      return sectionSystem
    },

    async getStoreyLevels() {
      const key = [...modelObjects.keys()].filter((id) => !modelHidden.has(id)).join('|')
      if (storeyLevelsCache?.key === key) return storeyLevelsCache.levels
      const all: Level[] = []
      for (const [modelId, model] of modelObjects) {
        if (modelHidden.has(modelId)) continue
        try {
          const ids = Object.values(await model.getItemsOfCategories([/BUILDINGSTOREY/])).flat()
          if (ids.length === 0) continue
          const data = await model.getItemsData(ids, {
            attributesDefault: true,
            relationsDefault: { attributes: false, relations: false },
          }) as Array<Record<string, { value?: unknown } | undefined>>
          const raw: RawStorey[] = []
          for (let i = 0; i < ids.length; i++) {
            const d = data[i] ?? {}
            const name = String(d.Name?.value ?? d.LongName?.value ?? `#${ids[i]}`)
            const e = Number(d.Elevation?.value)
            let contentMinY: number | null = null
            try {
              const children = await model.getItemsChildren([ids[i]])
              if (children.length) {
                const b = await model.getMergedBox(children)
                if (!b.isEmpty()) contentMinY = b.min.y
              }
            } catch { /* no spatial children: elevation alone */ }
            raw.push({ name, elevation: Number.isFinite(e) ? e : null, contentMinY })
          }
          // World box (model.box already carries the pivot): only the unit guess
          // for storeys with no contents reads it.
          const box = model.box
          all.push(...calibrateLevels(raw, box.min.y, box.max.y))
        } catch (err) {
          console.debug('[Viewer] storey levels unavailable:', err instanceof Error ? err.message : err)
        }
      }
      const levels = mergeLevels(all)
      storeyLevelsCache = { key, levels }
      return levels
    },

    cleanupSectionAndPlans() {
      // Every plane and the box go, and any face placement in progress.
      try { sectionSystem.cancelFacePlacement() } catch { /* ok */ }
      try { sectionSystem.clear() } catch { /* ok */ }
      // Close any open storey view
      try { views.close() } catch { /* ok */ }
      // Restore perspective orbit camera mode
      try {
        const cam = world.camera
        if (cam && 'set' in cam && typeof (cam as OBC.OrthoPerspectiveCamera).set === 'function') {
          ;(cam as OBC.OrthoPerspectiveCamera).set('Orbit')
        }
      } catch { /* ok */ }
    },

    // ─── Floor plan / storey views ─────────────────────────────────────────────

    async createStoreyViews() {
      try {
        // Dispose existing storey views to prevent duplicates on re-generate
        const existing = [...views.list.keys()]
        for (const id of existing) {
          try { views.list.get(id)?.dispose() } catch { /* ok */ }
        }
        const created = await views.createFromIfcStoreys()
        return created
          .filter((v) => v && typeof v.id === 'string')
          .map((v) => ({
            id:   v.id,
            // createFromIfcStoreys uses storey name as ID; sanitise for display
            name: v.id.trim() || `Storey ${v.id}`,
          }))
      } catch (err) {
        console.warn('[Viewer] createStoreyViews failed:', err)
        return []
      }
    },

    openStoreyView(id: string) {
      // A plan view is an orthographic camera looking straight down. Walking
      // inside one is a mode with no view of its own — you keep the floor plan
      // and lose the walls — so the storey wins and the walk ends.
      walkNav?.stop()
      if (!id || typeof id !== 'string') return
      try {
        // Close any already-open view
        try { views.close() } catch { /* ok */ }
        if (!views.list.has(id)) {
          console.warn('[Viewer] openStoreyView: unknown view id', id)
          return
        }
        views.open(id)
      } catch (err) {
        console.warn('[Viewer] openStoreyView failed:', err)
      }
    },

    closeStoreyView() {
      try { views.close() } catch (err) { console.debug('[Viewer] closeStoreyView:', err) }
      // Restore perspective orbit mode on OrthoPerspectiveCamera
      try {
        const cam = world.camera
        if (cam && 'set' in cam && typeof (cam as OBC.OrthoPerspectiveCamera).set === 'function') {
          ;(cam as OBC.OrthoPerspectiveCamera).set('Orbit')
        }
      } catch { /* ok */ }
    },

    getViews() {
      const result: { id: string; name: string }[] = []
      try {
        for (const [id] of views.list) {
          if (id && typeof id === 'string') {
            result.push({ id, name: id.trim() || id })
          }
        }
      } catch { /* ok */ }
      return result
    },

    refreshMapSatellites() { geoSystemInstance?.refreshSatellites() },

    getGeo() {
      // Dynamic import keeps three-tiles/geo code in its own chunk; nothing
      // GIS-related loads until the user opens map mode.
      const self = this
      geoLoadPromise ??= import('./geo/geo-system').then((m) => {
        geoSystemInstance = m.createGeoSystem({
          scene: world.scene.three,
          perspCamera: world.camera.threePersp,
          orthoCamera: world.camera.threeOrtho,
          getActiveCamera: () => world.camera.three,
          renderer: world.renderer!.three,
          controls: world.camera.controls,
          onProjectionChanged: (cb) => {
            world.camera.projection.onChanged.add(cb)
            return () => { world.camera.projection.onChanged.remove(cb) }
          },
          getGridVisible: () => grid.visible,
          setGridVisible: (v) => { grid.visible = v },
          setSceneTuneLock: (locked) => { sceneTuneLocked = locked },
          setPointerSuppressed: (s) => { geoPointerSuppressed = s },
          keyLight: dir,
          // Read through the lazy instance rather than importing the solar
          // module: map mode must not drag the sun-study chunk in with it.
          isSolarActive: () => solarSystemInstance?.isActive() ?? false,
          getActiveModelBounds: () => self.getModelBounds(),
          getActiveModelFootprint: () => self.getModelFootprint(),
          // EVERY model, not just the active one. A federated delivery is one
          // building in three files, and the active one is whichever finished
          // loading last — routinely the MEP set, whose plan is a plant room.
          // Map mode decides what mapped context to stand down from these, and
          // one discipline's footprint is not the building's.
          getModelFootprints: () => self.getLoadedModelIds()
            .map((id) => self.getModelFootprint(id))
            .filter((f): f is Array<{ x: number; z: number }> => f !== null && f.length >= 3),
          // Where the model's own y = 0 ended up: its pivot, plus whatever the
          // loader's coordination moved it by. Normally both are zero, and it
          // is the moment they are NOT that this has to be read rather than
          // assumed — a placement drag moves the pivot, and the map plane has
          // to follow the model rather than stay behind on the old ground.
          getModelOriginY: () => {
            const t = self.getModelTransform()
            const c = self.getModelCoordination()
            return t.position.y + (c?.y ?? 0)
          },
          getSatelliteModels: () => satelliteResolver?.() ?? null,
          // Applied as a DELTA on the pivot rather than an absolute position,
          // which makes it idempotent: getModelBounds reports WORLD bounds, so
          // once a model has been sent to its coordinates the next offset comes
          // out at zero. Re-running on every map move therefore converges
          // instead of walking the model across the city.
          setModelOffset: (modelId, offset) => {
            const pivot = modelPivots.get(modelId)
            if (!pivot) return
            self.setModelTransform({ position: {
              x: pivot.position.x + offset.x,
              y: pivot.position.y + offset.y,
              z: pivot.position.z + offset.z,
            } }, modelId)
          },
        })
        return geoSystemInstance
      })
      return geoLoadPromise
    },

    getSolar() {
      const self = this
      solarLoadPromise ??= import('./solar/solar-system').then((m) => {
        solarSystemInstance = m.createSolarSystem({
          scene: world.scene.three,
          keyLight: dir,
          hemiLight: hemi,
          fillLight: fill,
          getActiveModelBounds: () => self.getModelBounds(),
          getLoadedModelIds: () => self.getLoadedModelIds(),
          getModelObject: (id) => self.getModelObject(id),
          onModelLoaded: (cb) => appBus.on('model:loaded', ({ modelId }) => cb(modelId)),
        })
        return solarSystemInstance
      })
      return solarLoadPromise
    },

    getMeshes() {
      // Dynamic import keeps GLTFLoader, OBJLoader and MTLLoader in their own
      // chunk: a user who never imports a model never downloads them.
      const self = this
      meshLoadPromise ??= import('./mesh/mesh-system').then((m) => {
        meshInstance = m.createMeshSystem({
          scene: world.scene.three,
          getActiveCamera: () => world.camera.three,
          renderer: world.renderer!.three,
          frameBox: (min, max) => {
            try {
              // Same reasoning as the point cloud fit: retune to the WHOLE scene
              // before framing, or an import that is far larger or far smaller
              // than the model clamps against limits tuned for the model alone.
              const box = new THREE.Box3(min, max)
              const scene = box.clone()
              const model = self.getModelBounds()
              if (model) {
                const half = new THREE.Vector3(model.size.x / 2, model.size.y / 2, model.size.z / 2)
                const centre = new THREE.Vector3(model.center.x, model.center.y, model.center.z)
                scene.expandByPoint(centre.clone().sub(half))
                scene.expandByPoint(centre.clone().add(half))
              }
              tuneSceneToBounds(scene)
              void world.camera.controls.fitToBox(box, true)
            } catch (e) {
              console.debug('[Viewer] mesh fit failed:', e instanceof Error ? e.message : e)
            }
          },
          // An imported mesh is ordinary geometry, so registering it makes it
          // both measurable and selectable by the same raycaster everything else
          // uses. Unlike a point cloud root this really is mesh-shaped, so no
          // custom raycast is needed — three handles it.
          registerRaycastTarget: (object) => {
            world.meshes.add(object as unknown as THREE.Mesh)
          },
          unregisterRaycastTarget: (object) => {
            world.meshes.delete(object as unknown as THREE.Mesh)
          },
        })
        return meshInstance
      })
      return meshLoadPromise
    },

    getVideos() {
      const self = this
      videoLoadPromise ??= import('./video/video-system').then((module) => {
        videoInstance = module.createVideoSystem({
          scene: world.scene.three,
          getActiveCamera: () => world.camera.three,
          getActiveModelBounds: () => self.getModelBounds(),
          frameBox: (min, max) => {
            try {
              const box = new THREE.Box3(min, max)
              const scene = box.clone()
              const model = self.getModelBounds()
              if (model) {
                const half = new THREE.Vector3(model.size.x / 2, model.size.y / 2, model.size.z / 2)
                const centre = new THREE.Vector3(model.center.x, model.center.y, model.center.z)
                scene.expandByPoint(centre.clone().sub(half))
                scene.expandByPoint(centre.clone().add(half))
              }
              tuneSceneToBounds(scene)
              void world.camera.controls.fitToBox(box, true)
            } catch (error) {
              console.debug('[Viewer] video fit failed:', error instanceof Error ? error.message : error)
            }
          },
        })
        return videoInstance
      })
      return videoLoadPromise
    },

    getPointClouds() {
      // Dynamic import keeps the point cloud engine, its shader and its readers
      // in their own chunk: a user who never opens a scan never downloads them.
      const self = this
      pointCloudLoadPromise ??= import('./pointcloud/point-cloud-system').then((m) => {
        pointCloudInstance = m.createPointCloudSystem({
          scene: world.scene.three,
          getActiveCamera: () => world.camera.three,
          renderer: world.renderer!.three,
          getActiveModelBounds: () => self.getModelBounds(),
          frameBox: (min, max) => {
            try {
              const box = new THREE.Box3(min, max)
              // Retune to the WHOLE scene, then frame just the box. A scan is
              // the one thing that arrives after the camera was tuned, and it
              // can be two orders of magnitude bigger than the IFC model it
              // sits next to — without this the fit clamps against limits set
              // for the model (see tuneSceneToBounds).
              //
              // The union matters: tuning to the scan alone would pull the fog
              // in around a 1 m tabletop capture and swallow the building.
              const scene = box.clone()
              const model = self.getModelBounds()
              if (model) {
                const half = new THREE.Vector3(model.size.x / 2, model.size.y / 2, model.size.z / 2)
                const centre = new THREE.Vector3(model.center.x, model.center.y, model.center.z)
                scene.expandByPoint(centre.clone().sub(half))
                scene.expandByPoint(centre.clone().add(half))
              }
              tuneSceneToBounds(scene)
              void world.camera.controls.fitToBox(box, true)
            } catch (e) {
              console.debug('[Viewer] point cloud fit failed:', e instanceof Error ? e.message : e)
            }
          },
          // `world.meshes` is what OBC's Casters hand to three, so putting a
          // cloud root in it is what lets the measurement tools reach a scan —
          // castRay runs this alongside its IFC fast-pick and keeps whichever is
          // nearer, which is the whole as-built-vs-as-designed measurement.
          //
          // The Set is typed Set<THREE.Mesh> and a cloud root is a Group. The
          // cast is safe and deliberate: three's raycasting is polymorphic and
          // only ever calls `.raycast()`, which the root provides. Nothing here
          // reads Mesh-specific members.
          registerRaycastTarget: (object) => {
            world.meshes.add(object as unknown as THREE.Mesh)
          },
          unregisterRaycastTarget: (object) => {
            world.meshes.delete(object as unknown as THREE.Mesh)
          },
        })
        return pointCloudInstance
      })
      return pointCloudLoadPromise
    },

    dispose() {
      try { videoInstance?.dispose() } catch { /* ok */ }
      videoInstance = null
      videoLoadPromise = null
      try { meshInstance?.dispose() } catch { /* ok */ }
      meshInstance = null
      meshLoadPromise = null
      try { pointCloudInstance?.dispose() } catch { /* ok */ }
      pointCloudInstance = null
      pointCloudLoadPromise = null
      try { solarSystemInstance?.dispose() } catch { /* ok */ }
      solarSystemInstance = null
      solarLoadPromise    = null
      try { geoSystemInstance?.dispose() } catch { /* ok */ }
      geoSystemInstance = null
      geoLoadPromise    = null
      canvas.removeEventListener('pointermove',  onPointerMove)
      canvas.removeEventListener('pointerdown',  onPointerDown)
      canvas.removeEventListener('pointerup',    onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('dblclick',     onDoubleClick)
      canvas.removeEventListener('contextmenu',  onContextMenu)
      // Window-level, so nothing else here would have caught it: without this
      // every reload leaves another set of key listeners holding dead controls.
      unbindNavigation?.()
      walkNav?.dispose()
      world.camera.controls.removeEventListener('control', onCameraControl)
      world.camera.controls.removeEventListener('rest', onCameraRest)
      fragmentUpdates.dispose()
      if (recording) {
        try { world.renderer!.onAfterUpdate.remove(paintRecordingFrame) } catch { /* ok */ }
        recording = null
      }
      try { measureSystem.dispose() } catch { /* ok */ }
      try { sectionSystem.dispose() } catch { /* ok */ }
      clearPoche()
      bgTexture?.dispose()
      bgTexture = null
      components.dispose()
    },
  }
}
