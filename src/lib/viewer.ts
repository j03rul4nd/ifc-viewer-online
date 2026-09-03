import * as THREE from 'three'
import * as OBC from '@thatopen/components'
import * as OBCF from '@thatopen/components-front'
import * as FRAGS from '@thatopen/fragments'
import { safeVoid } from './errors'
import { appBus } from './event-bus'
import { cameraRangeForBounds, widenCameraRange } from './camera-range'
import { bindNavigation } from './camera-nav'
import { bindWalkNavigation, type WalkNavigation, type WalkState } from './camera-walk'
import { createFrameCoalescer } from './frame-coalescer'
import { createOverlayController, type SeverityFilter, type OverlayMaterials } from './overlay-controller'
import { resolveBackground, DEFAULT_BACKGROUND, type BackgroundSettings } from './scene/background'
import { clearInspectorTarget } from './inspector'
import type { Category, ModelInfo, SelectedInfo, ViewerStyle, ValidationIssue, CameraPreset, ModelTransform, CameraViewpoint, Vec3Like } from '../types'

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
export interface OverlayApplyOptions {
  /** Which severities to paint in colour; the rest fall back to the ghost. */
  severities?: SeverityFilter
  /** Opacity of the dimmed (ghosted) context (0.02–0.4). */
  ghostOpacity?: number
  /** Render flagged elements through occluding geometry (no depth test). */
  xray?: boolean
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
  loadFragments(
    buffer: Uint8Array,
    fileName: string,
    fileSize?: number,
    onProgress?: (pct: number) => void,
  ): Promise<{
    modelInfo: ModelInfo
    modelObject: unknown
    getElementInfo: (id: string) => SelectedInfo | null
    /** Stable ID assigned to this model load. Same ID used in sceneStore, modelRegistry, validationStore. */
    modelId: string
  }>
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
  /** Fly to a named camera preset (iso, top, front, right, left, back, bottom). */
  setCameraPreset(preset: CameraPreset): void
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
  setCameraLookAt(position: Vec3Like, target: Vec3Like): void
  /**
   * World-space merged AABB of a set of elements (serialisable, no THREE
   * objects). Reuses the same getMergedBox path as frameElements. Null when
   * the model/elements are unknown or the box is empty.
   */
  getElementsBox(ids: number[], modelId?: string): Promise<{ min: Vec3Like; max: Vec3Like } | null>
  /**
   * Swap the scene backdrop (solid colour or vertical gradient) and the derived
   * fog / grid colours. Purely visual: no geometry, camera or material state is
   * touched, and the change lands in screenshots and replay clips because it is
   * part of the rendered frame.
   */
  setBackground(settings: BackgroundSettings): void
  /** Capture a PNG snapshot of the current renderer canvas. Returns a data URL. */
  takeSnapshot(): string
  /**
   * Stable reference to the WebGL canvas (Capture Toolkit replay buffer).
   * Read-only access — callers must never mutate or re-parent the element.
   */
  getCanvas(): HTMLCanvasElement | null
  /**
   * Lazily load and return the GIS map subsystem (separate chunk, created once
   * per viewer, disposed with it). Nothing GIS-related loads until first call.
   */
  getGeo(): Promise<import('./geo/geo-system').GeoSystemAPI>
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
   * Activate a measurement tool ('length' or 'area') or return to normal interaction ('none').
   * While a tool is active pointer click-select and hover-highlight are suppressed.
   */
  setMeasurementTool(tool: 'none' | 'length' | 'area'): void
  /** Remove all placed measurements from the scene. */
  clearMeasurements(): void
  /** Delete the most recently placed measurement. */
  deleteLastMeasurement(): void
  /** Return the number of placed measurements of each type. */
  getMeasurementCount(): { length: number; area: number }
  /** Return all placed measurements with their computed values. */
  getMeasurements(): Array<{ id: string; type: 'length' | 'area'; value: number }>
  /**
   * Finish the area polygon currently being drawn (calls endCreation on the
   * area measurement tool). No-op if < 3 points have been placed.
   */
  finishCurrentMeasurement(): void

  // ─── Clipping planes ─────────────────────────────────────────────────────────
  /**
   * Put the Clipper into creation mode — the next click on the model surface
   * creates a clipping plane aligned to the face normal at that point.
   */
  startAddClipPlane(): void
  /** Cancel clip-plane creation mode without placing a plane. */
  stopAddClipPlane(): void
  /** Delete the clip plane with the given ID, or the one under the cursor if omitted. */
  deleteClipPlane(id?: string): Promise<void>
  /** Remove every clipping plane from the scene. */
  clearClipPlanes(): void
  /** Toggle a single clip plane's enabled state. */
  toggleClipPlane(id: string, enabled: boolean): void
  /** Snapshot of all active clip planes. */
  getClipPlanes(): { id: string; enabled: boolean; title: string }[]
  /**
   * Register a one-shot callback that fires when the next clip plane is placed
   * and auto-deactivates creation mode. Pass null to cancel without placing.
   */
  setClipCreationCallback(cb: (() => void) | null): void
  /** Remove all clipping planes and close any open storey view. */
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
  const ifcLoader        = components.get(OBC.IfcLoader)

  // Raw wheel and pointer events can arrive faster than the display refresh.
  // Updating the fragments core for every one of them competes with the camera
  // itself; one update per animation frame is both fresher and cheaper.
  const fragmentUpdates = createFrameCoalescer(() => { void fragmentsManager.core.update() })
  const onCameraControl = (): void => {
    pointCloudInstance?.setInteractionActive(true)
    fragmentUpdates.request()
  }
  const onCameraRest = (): void => {
    pointCloudInstance?.setInteractionActive(false)
    fragmentUpdates.request()
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

  // ─── Measurement tools ────────────────────────────────────────────────────────
  const lengthMeasurement = components.get(OBCF.LengthMeasurement)
  lengthMeasurement.world   = world
  lengthMeasurement.enabled = false

  const areaMeasurement = components.get(OBCF.AreaMeasurement)
  areaMeasurement.world   = world
  areaMeasurement.enabled = false

  let activeMeasurementTool: 'none' | 'length' | 'area' = 'none'

  // ─── Clipping planes (OBC.Clipper) ────────────────────────────────────────────
  const clipper = components.get(OBC.Clipper)
  clipper.enabled = false
  clipper.orthogonalY = true

  // One-shot callback invoked when a clip plane is placed (auto-deactivates creation mode)
  let clipCreationCallback: (() => void) | null = null
  // Handler ref so we can remove it cleanly
  let onAfterCreateHandler: ((plane: OBC.SimplePlane) => void) | null = null

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
    if (locked) {
      const r = canvas.getBoundingClientRect()
      mouse.set(r.left + r.width / 2, r.top + r.height / 2)
    } else {
      aimAt(e)
    }
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

    // Measurement tools handle their own pointer feedback — skip hover highlight
    if (activeMeasurementTool !== 'none') return
    if (geoPointerSuppressed) return // map placement editor owns the pointer
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

    // ── Measurement tools ────────────────────────────────────────────────────
    // ThatOpen's Measurement base class only registers pointermove + keydown(Esc)
    // via setEvents(). It does NOT add a click/pointerdown listener.
    // We must call create() ourselves on each quick click.
    if (activeMeasurementTool === 'length') {
      void lengthMeasurement.create()
      return
    }
    if (activeMeasurementTool === 'area') {
      void areaMeasurement.create()
      return
    }

    aimAt(e)

    // ── Clipper ───────────────────────────────────────────────────────────────
    if (clipper.enabled) {
      void clipper.create(world)
      return
    }

    // ── Element selection ─────────────────────────────────────────────────────
    void commitSelection()
  }

  // Double-click: finish in-progress area polygon (needs ≥ 3 points already placed)
  const onDoubleClick = (e: MouseEvent): void => {
    if (activeMeasurementTool === 'area') {
      try { areaMeasurement.endCreation?.() } catch { /* ok */ }
      return
    }
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
  // Suppressed while a measurement tool or the clipper is active so their own
  // interactions aren't hijacked.
  const onContextMenu = (e: MouseEvent): void => {
    if (modelObjects.size === 0) return
    if (activeMeasurementTool !== 'none' || clipper.enabled) return
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

  canvas.addEventListener('pointermove',  onPointerMove)
  canvas.addEventListener('pointerdown',  onPointerDown)
  canvas.addEventListener('pointerup',    onPointerUp)
  canvas.addEventListener('dblclick',     onDoubleClick)
  canvas.addEventListener('contextmenu',  onContextMenu)

  // ─── Setup post-carga ─────────────────────────────────────────────────────

  async function setupLoadedModel(
    model: FRAGS.FragmentsModel,
    modelId: string,
    fileName: string,
    fileSize: number,
    onProgress?: (pct: number) => void,
  ): Promise<{ modelInfo: ModelInfo; modelObject: unknown; getElementInfo: (id: string) => SelectedInfo | null }> {

    const categoryNames = await model.getCategories()
    const regexes    = categoryNames.map((c) => new RegExp(`^${c}$`, 'i'))
    const byCategory = await model.getItemsOfCategories(regexes)

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

    // Register per-model map and update the current alias
    typeMapByModel.set(modelId, modelTypeMap)
    expressIDToType = modelTypeMap

    onProgress?.(80)

    // Batch setColor/setOpacity by palette entry (≤25 calls instead of one per element)
    const colorBatches:   Map<number, number[]> = new Map()
    const opacityBatches: Map<number, number[]> = new Map()

    for (const [localId, rawType] of expressIDToType.entries()) {
      const pal = IFC_PALETTE[rawType] ?? IFC_PALETTE[canonicalType(rawType)]
      if (!pal) continue
      const cb = colorBatches.get(pal.color) ?? []; cb.push(localId); colorBatches.set(pal.color, cb)
      if (pal.opacity !== undefined) {
        const opKey = pal.opacity
        const ob = opacityBatches.get(opKey) ?? []; ob.push(localId); opacityBatches.set(opKey, ob)
      }
    }

    for (const [hex, ids] of colorBatches)       await model.setColor(ids, new THREE.Color(hex))
    for (const [opacity, ids] of opacityBatches) await model.setOpacity(ids, opacity)

    onProgress?.(90)

    const box = model.box
    if (!box.isEmpty()) {
      tuneSceneToBounds(box)
      void world.camera.controls.fitToBox(box, true)
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
      elementCount: expressIDToType.size,
      categories,
    }

    const getElementInfo = (id: string): SelectedInfo | null => {
      const localId = parseInt(id, 10)
      const rawType = expressIDToType.get(localId) ?? 'IFCELEMENT'
      const canon   = canonicalType(rawType)
      const name    = `${IFC_DISPLAY_NAMES[canon] ?? prettyType(canon)} #${localId}`
      return { id, name, type: rawType, storey: '', modelId }
    }

    return { modelInfo, modelObject: model, getElementInfo }
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

      const assignedId = `${file.name}-${Date.now()}`

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

    async loadFragments(buffer, fileName, fileSize, onProgress) {
      await initPromise
      // Do NOT teardown here — multiple models can coexist in the scene.
      // Use removeModel(modelId) for explicit unloading.

      onProgress?.(5)
      const modelId = `${fileName}-${Date.now()}`

      let model: FRAGS.FragmentsModel
      try {
        model = await fragmentsManager.core.load(buffer, {
          modelId,
          camera: world.camera.three,
          onProgress: (event) => {
            const stagePercent: Record<string, number> = {
              decompressing: 20, parsing: 45, generating: 65, done: 75,
            }
            onProgress?.(stagePercent[event.stage] ?? 50)
          },
        })
      } catch (err) {
        console.error('[Viewer] loadFragments error:', err)
        throw err
      }

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

      const result = await setupLoadedModel(model, modelId, fileName, fileSize ?? 0, onProgress)
      return { ...result, modelId }
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

    setCameraPreset(preset: CameraPreset) {
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

      void world.camera.controls.setLookAt(
        center.x + ox, center.y + oy, center.z + oz,
        center.x,       center.y,      center.z,
        true,
      )
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
    },

    resetModelTransform(modelId?: string) {
      const tid   = modelId ?? currentModelId
      const pivot = (tid ? modelPivots.get(tid) : null) ?? currentPivot
      if (!pivot || !tid) return
      pivot.position.set(0, 0, 0)
      pivot.rotation.set(0, 0, 0)
      pivot.scale.set(1, 1, 1)
      pivotTransforms.set(tid, { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 })
      void fragmentsManager.core.update()
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

      await model.dispose()
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
        return {
          position:  { x: pos.x, y: pos.y, z: pos.z },
          target:    { x: tgt.x, y: tgt.y, z: tgt.z },
          direction: { x: dir.x, y: dir.y, z: dir.z },
          fovDeg,
          aspect,
        }
      } catch {
        return null
      }
    },

    setCameraLookAt(position: Vec3Like, target: Vec3Like) {
      void world.camera.controls.setLookAt(
        position.x, position.y, position.z,
        target.x, target.y, target.z,
        true,
      )
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

    setBackground(settings) {
      applyBackground(settings)
    },

    takeSnapshot(): string {
      // The WebGL drawing buffer is cleared after compositing
      // (preserveDrawingBuffer is off), so reading pixels outside the render
      // loop yields a black PNG. Force a synchronous render into the buffer
      // and read it back in the same task.
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
        return wr.domElement.toDataURL('image/png')
      } catch {
        return ''
      }
    },

    getCanvas(): HTMLCanvasElement | null {
      try {
        return wr.domElement
      } catch {
        return null
      }
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

    setMeasurementTool(tool: 'none' | 'length' | 'area') {
      // Deactivate all tools first
      try { lengthMeasurement.endCreation() } catch { /* in-progress creation — ok */ }
      try { areaMeasurement.endCreation?.() } catch { /* ok */ }

      lengthMeasurement.enabled = false
      areaMeasurement.enabled   = false
      activeMeasurementTool     = tool

      if (tool === 'length') {
        lengthMeasurement.enabled = true
        canvas.style.cursor = 'crosshair'
      } else if (tool === 'area') {
        areaMeasurement.enabled = true
        canvas.style.cursor = 'crosshair'
      } else {
        canvas.style.cursor = 'default'
      }
    },

    clearMeasurements() {
      // DataSet<T> extends Set<T> — iterate and remove each item so the
      // Measurement class receives onBeforeDelete events to clean up 3D objects.
      try {
        for (const item of [...lengthMeasurement.list]) {
          try { lengthMeasurement.list.delete(item) } catch { /* ok */ }
        }
      } catch { /* ok */ }
      try {
        for (const item of [...areaMeasurement.list]) {
          try { areaMeasurement.list.delete(item) } catch { /* ok */ }
        }
      } catch { /* ok */ }
    },

    deleteLastMeasurement() {
      try {
        if (activeMeasurementTool === 'length') {
          const items = [...lengthMeasurement.list]
          const last = items[items.length - 1]
          if (last) lengthMeasurement.list.delete(last)
        } else if (activeMeasurementTool === 'area') {
          const items = [...areaMeasurement.list]
          const last = items[items.length - 1]
          if (last) areaMeasurement.list.delete(last)
        }
      } catch (err) {
        console.debug('[Viewer] deleteLastMeasurement:', err)
      }
    },

    getMeasurementCount(): { length: number; area: number } {
      return {
        length: lengthMeasurement.list.size,
        area:   areaMeasurement.list.size,
      }
    },

    getMeasurements(): Array<{ id: string; type: 'length' | 'area'; value: number }> {
      const out: Array<{ id: string; type: 'length' | 'area'; value: number }> = []
      try {
        let i = 0
        for (const item of lengthMeasurement.list) {
          try { out.push({ id: `length-${i++}`, type: 'length', value: item.value ?? 0 }) } catch { /* skip */ }
        }
        i = 0
        for (const item of areaMeasurement.list) {
          try { out.push({ id: `area-${i++}`, type: 'area', value: item.value ?? 0 }) } catch { /* skip */ }
        }
      } catch { /* ok */ }
      return out
    },

    finishCurrentMeasurement(): void {
      try { areaMeasurement.endCreation?.() } catch { /* ok */ }
    },

    // ─── Clipping planes ───────────────────────────────────────────────────────

    startAddClipPlane() {
      // Remove any stale one-shot listener before registering a fresh one
      if (onAfterCreateHandler) {
        try { clipper.onAfterCreate.remove(onAfterCreateHandler) } catch { /* ok */ }
        onAfterCreateHandler = null
      }
      clipper.enabled = true
      canvas.style.cursor = 'crosshair'
      // Auto-deactivate and fire UI callback after the first plane is placed
      onAfterCreateHandler = (_plane: OBC.SimplePlane) => {
        try { clipper.enabled = false } catch { /* ok */ }
        canvas.style.cursor = 'default'
        if (onAfterCreateHandler) {
          try { clipper.onAfterCreate.remove(onAfterCreateHandler) } catch { /* ok */ }
          onAfterCreateHandler = null
        }
        if (clipCreationCallback) {
          const cb = clipCreationCallback
          clipCreationCallback = null
          try { cb() } catch (e) { console.debug('[Viewer] clipCreationCallback threw:', e) }
        }
      }
      clipper.onAfterCreate.add(onAfterCreateHandler)
    },

    stopAddClipPlane() {
      clipper.enabled = false
      canvas.style.cursor = 'default'
      if (onAfterCreateHandler) {
        try { clipper.onAfterCreate.remove(onAfterCreateHandler) } catch { /* ok */ }
        onAfterCreateHandler = null
      }
      clipCreationCallback = null
    },

    setClipCreationCallback(cb: (() => void) | null) {
      clipCreationCallback = cb
    },

    async deleteClipPlane(id?: string) {
      try {
        if (id !== undefined && id !== '') {
          const plane = clipper.list.get(id)
          if (plane) {
            // dispose() removes from scene; list.delete() removes from registry
            try { plane.dispose() } catch (e) { console.debug('[Viewer] plane.dispose:', e) }
            try { clipper.list.delete(id) } catch (e) { console.debug('[Viewer] list.delete:', e) }
          }
        } else {
          // No id — delete the one under cursor (raycasting)
          await clipper.delete(world)
        }
      } catch (err) {
        console.debug('[Viewer] deleteClipPlane:', err)
      }
    },

    clearClipPlanes() {
      try {
        clipper.deleteAll()
      } catch (err) {
        // deleteAll may throw on empty list in some OBC versions
        console.debug('[Viewer] clearClipPlanes:', err)
      }
    },

    toggleClipPlane(id: string, enabled: boolean) {
      try {
        const plane = clipper.list.get(id)
        if (plane) plane.enabled = enabled
      } catch (err) {
        console.debug('[Viewer] toggleClipPlane:', err)
      }
    },

    getClipPlanes() {
      const result: { id: string; enabled: boolean; title: string }[] = []
      try {
        let index = 0
        for (const [id, plane] of clipper.list) {
          index++
          const enabled = typeof plane?.enabled === 'boolean' ? plane.enabled : true
          const title   = (typeof plane?.title === 'string' && plane.title.trim())
            ? plane.title.trim()
            : `Plane ${index}`
          result.push({ id, enabled, title })
        }
      } catch (err) {
        console.debug('[Viewer] getClipPlanes:', err)
      }
      return result
    },

    cleanupSectionAndPlans() {
      // Remove all clip planes
      try { clipper.deleteAll() } catch { /* ok */ }
      // Stop any in-progress clip creation
      try {
        clipper.enabled = false
        canvas.style.cursor = 'default'
        if (onAfterCreateHandler) {
          try { clipper.onAfterCreate.remove(onAfterCreateHandler) } catch { /* ok */ }
          onAfterCreateHandler = null
        }
        clipCreationCallback = null
      } catch { /* ok */ }
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
      canvas.removeEventListener('dblclick',     onDoubleClick)
      canvas.removeEventListener('contextmenu',  onContextMenu)
      // Window-level, so nothing else here would have caught it: without this
      // every reload leaves another set of key listeners holding dead controls.
      unbindNavigation?.()
      walkNav?.dispose()
      world.camera.controls.removeEventListener('control', onCameraControl)
      world.camera.controls.removeEventListener('rest', onCameraRest)
      fragmentUpdates.dispose()
      try { lengthMeasurement.dispose() } catch { /* ok */ }
      try { areaMeasurement.dispose() } catch { /* ok */ }
      try { clipper.dispose() } catch { /* ok */ }
      bgTexture?.dispose()
      bgTexture = null
      components.dispose()
    },
  }
}
