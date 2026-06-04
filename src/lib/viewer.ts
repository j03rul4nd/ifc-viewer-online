import * as THREE from 'three'
import * as OBC from '@thatopen/components'
import * as OBCF from '@thatopen/components-front'
import * as FRAGS from '@thatopen/fragments'
import { safeVoid } from './errors'
import type { Category, ModelInfo, SelectedInfo, ViewerStyle, ValidationIssue, CameraPreset, ModelTransform } from '../types'

// ─── Palette & label tables ──────────────────────────────────────────────────

const IFC_PALETTE: Record<string, { color: number; opacity?: number }> = {
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

const IFC_DISPLAY_NAMES: Record<string, string> = {
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
  /** All property sets from IsDefinedBy relation */
  propertySets: IFCPropertySet[]
  /** Raw data for debugging / future use */
  raw: Record<string, unknown>
}

// ─── Public API ──────────────────────────────────────────────────────────────

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
  setValidationHighlights(issues: ValidationIssue[], enabled: boolean): void
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
  /** Capture a PNG snapshot of the current renderer canvas. Returns a data URL. */
  takeSnapshot(): string
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
  opacity: 0.65,
  transparent: true,
  preserveOriginalMaterial: true,
}

const VALIDATION_WARN_MAT: FRAGS.MaterialDefinition = {
  color: new THREE.Color(0xF5A623),
  renderedFaces: FRAGS.RenderedFaces.TWO,
  opacity: 0.65,
  transparent: true,
  preserveOriginalMaterial: true,
}

const VALIDATION_INFO_MAT: FRAGS.MaterialDefinition = {
  color: new THREE.Color(0x5E9ED6),
  renderedFaces: FRAGS.RenderedFaces.TWO,
  opacity: 0.5,
  transparent: true,
  preserveOriginalMaterial: true,
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

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createViewer(container: HTMLElement): ViewerAPI {

  const components = new OBC.Components()
  const worlds     = components.get(OBC.Worlds)
  const world      = worlds.create<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBCF.PostproductionRenderer>()

  world.scene    = new OBC.SimpleScene(components)
  world.renderer = new OBCF.PostproductionRenderer(components, container)
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

  world.scene.three.add(new THREE.HemisphereLight(0xB8C4E0, 0x1A1A22, 0.6))
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
  grids.create(world)

  void world.camera.controls.setLookAt(30, 24, 36, 0, 2, 0, false)

  // ─── Adaptive scale tuning ─────────────────────────────────────────────────
  // IFC models range from a single chair (~1 m) to a campus (hundreds of m).
  // A fixed near/far + fog hides small elements when zoomed in (near-plane
  // clipping) and fogs out whole buildings when zoomed out. Re-tune both to the
  // actual scene scale so geometry of every size renders crisply.
  function tuneSceneToBounds(box: THREE.Box3): void {
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

    // Keep all real geometry unfogged; only fade the distant background for depth.
    const fog = world.scene.three.fog
    if (fog instanceof THREE.Fog) {
      fog.near = size * 2
      fog.far  = size * 6
    }

    // Widen the directional shadow frustum so shadows cover the whole model.
    const half = Math.max(50, size * 0.6)
    dsc.left = -half; dsc.right = half; dsc.top = half; dsc.bottom = -half
    dsc.far  = Math.max(200, size * 4)
    dsc.updateProjectionMatrix()
  }

  const fragmentsManager = components.get(OBC.FragmentsManager)
  const ifcLoader        = components.get(OBC.IfcLoader)

  const triggerUpdate = (): void => { void fragmentsManager.core.update() }
  world.camera.controls.addEventListener('control', triggerUpdate)
  world.camera.controls.addEventListener('rest',    triggerUpdate)

  // ─── Navigation feel ───────────────────────────────────────────────────────
  // Zoom toward the cursor (instead of the screen centre) so users can dive into
  // a specific area naturally — the single biggest win for intuitive orbiting.
  try {
    const ctrls = world.camera.controls
    ctrls.dollyToCursor = true
    ctrls.dollySpeed    = 0.8   // slightly gentler than the default 1.0
    ctrls.truckSpeed    = 1.5   // a touch faster panning for large models
  } catch (err) {
    console.debug('[Viewer] camera-controls tuning skipped:', err instanceof Error ? err.message : err)
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
  const typeMapByModel:  Map<string, Map<number, string>>  = new Map()

  // Backward-compat reference: always points to the current model's type map
  let expressIDToType: Map<number, string> = new Map()

  let selectCallback: ((info: SelectedInfo | null) => void) | null = null
  let contextMenuCallback: ((payload: { x: number; y: number; info: SelectedInfo } | null) => void) | null = null
  let hoveredLocalId:  number | null = null
  let hoveredModelId:  string | null = null
  let selectedLocalId: number | null = null
  let selectedModelId: string | null = null

  // Per-model validation highlights: modelId → (expressId → material applied).
  // Storing the material (not just the id) lets us re-apply the validation
  // overlay after a hover/selection reset clears it.
  const validationHighlightedByModel = new Map<string, Map<number, FRAGS.MaterialDefinition>>()

  /** The validation material applied to an element, or null if none. */
  function validationMatFor(modelId: string, localId: number): FRAGS.MaterialDefinition | null {
    return validationHighlightedByModel.get(modelId)?.get(localId) ?? null
  }

  /** Reset an element's highlight, then restore its validation overlay if it had one. */
  async function resetHighlightPreservingValidation(
    model: FRAGS.FragmentsModel, modelId: string, localId: number,
  ): Promise<void> {
    await model.resetHighlight([localId])
    const mat = validationMatFor(modelId, localId)
    if (mat) {
      try { await model.highlight([localId], mat) } catch (e) {
        console.debug('[Viewer] restore validation highlight failed:', e instanceof Error ? e.message : e)
      }
    }
  }

  let selectionBox: THREE.Box3Helper | null = null

  const canvas = wr.domElement

  // ─── Mouse position — actualizado en cada pointermove ────────────────────
  const mouse = new THREE.Vector2()

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

  const commitSelection = async (): Promise<SelectedInfo | null> => {
    if (modelObjects.size === 0) return null

    const hit = await getBestHit()

    // Reset old selection highlight on whichever model it was on
    if (selectedLocalId !== null && selectedModelId !== null) {
      const oldModel = modelObjects.get(selectedModelId)
      try { if (oldModel) await resetHighlightPreservingValidation(oldModel, selectedModelId, selectedLocalId) } catch (e) {
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
    mouse.set(e.clientX, e.clientY)

    // Measurement tools handle their own pointer feedback — skip hover highlight
    if (activeMeasurementTool !== 'none') return
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
          if (prevModel) await resetHighlightPreservingValidation(prevModel, hoveredModelId, hoveredLocalId)
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

    mouse.set(e.clientX, e.clientY)

    // ── Clipper ───────────────────────────────────────────────────────────────
    if (clipper.enabled) {
      void clipper.create(world)
      return
    }

    // ── Element selection ─────────────────────────────────────────────────────
    void commitSelection()
  }

  // Double-click: finish in-progress area polygon (needs ≥ 3 points already placed)
  const onDoubleClick = (): void => {
    if (activeMeasurementTool === 'area') {
      try { areaMeasurement.endCreation?.() } catch { /* ok */ }
    }
  }

  // Right-click: select the element under the cursor and surface a context menu.
  // Suppressed while a measurement tool or the clipper is active so their own
  // interactions aren't hijacked.
  const onContextMenu = (e: MouseEvent): void => {
    if (modelObjects.size === 0) return
    if (activeMeasurementTool !== 'none' || clipper.enabled) return
    e.preventDefault()
    mouse.set(e.clientX, e.clientY)
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
    validationHighlightedByModel.clear()
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
            // Property sets
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
          },
        })

        if (!data) return null

        const raw = data as Record<string, unknown>

        return {
          name:         attrStr(raw['Name']),
          longName:     attrStr(raw['LongName']),
          description:  attrStr(raw['Description']),
          globalId:     attrStr(raw['GlobalId']),
          objectType:   attrStr(raw['ObjectType']),
          tag:          attrStr(raw['Tag']),
          storey:       extractStorey(raw['ContainedInStructure']),
          propertySets: formatPsets(raw['IsDefinedBy']),
          raw,
        }
      } catch (err) {
        console.warn('[Viewer] getItemData error:', err)
        return null
      }
    },

    resetCamera() {
      void world.camera.controls.setLookAt(30, 24, 36, 0, 2, 0, true)
    },

    frameCategory(id, modelId) {
      const targetId = modelId ?? currentModelId
      const typeMap  = (targetId ? typeMapByModel.get(targetId) : null) ?? expressIDToType
      const model    = (targetId ? modelObjects.get(targetId) : null) ?? currentModel
      if (!model) return
      const ids = [...typeMap.entries()]
        .filter(([, raw]) => canonicalType(raw) === id)
        .map(([localId]) => localId)
      if (ids.length === 0) return
      safeVoid(
        model.getMergedBox(ids).then((box) => {
          if (!box.isEmpty()) void world.camera.controls.fitToBox(box, true)
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
      const targetModel = (modelId && modelObjects.get(modelId)) ?? currentModel
      const targetId    = (modelId && modelObjects.has(modelId)) ? modelId : currentModelId
      if (!targetModel) return

      void (async () => {
        // Reset old selection on its model (restoring any validation overlay)
        if (selectedLocalId !== null && selectedModelId !== null) {
          const oldModel = modelObjects.get(selectedModelId)
          try { if (oldModel) await resetHighlightPreservingValidation(oldModel, selectedModelId, selectedLocalId) } catch (e) {
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
        selectCallback?.({ id: String(expressId), name, type: rawType, storey: '', modelId: targetId ?? undefined })
      })()
    },

    setValidationHighlights(issues, enabled) {
      if (modelObjects.size === 0) return

      // Clear per-model tracked highlights precisely (no over-resetting other models)
      for (const [mid, ids] of validationHighlightedByModel) {
        const model = modelObjects.get(mid)
        if (model && ids.size > 0) void model.resetHighlight([...ids.keys()])
      }
      validationHighlightedByModel.clear()

      if (!enabled) return

      // Collapse each element to its highest severity (error > warning > info) so
      // an element with mixed issues gets a single, deterministic overlay colour.
      const rank: Record<string, number> = { error: 3, warning: 2, info: 1 }
      const sevByModel = new Map<string, Map<number, 'error' | 'warning' | 'info'>>()

      for (const issue of issues) {
        const mid = issue.modelId ?? currentModelId ?? ''
        if (!mid || !modelObjects.has(mid)) continue
        const typeMap = typeMapByModel.get(mid) ?? expressIDToType
        if (!typeMap.has(issue.expressId)) continue

        const sev: 'error' | 'warning' | 'info' =
          issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warning' : 'info'

        if (!sevByModel.has(mid)) sevByModel.set(mid, new Map())
        const m = sevByModel.get(mid)!
        const prev = m.get(issue.expressId)
        if (!prev || rank[sev] > rank[prev]) m.set(issue.expressId, sev)
      }

      const matFor = (sev: 'error' | 'warning' | 'info'): FRAGS.MaterialDefinition =>
        sev === 'error' ? VALIDATION_ERROR_MAT : sev === 'warning' ? VALIDATION_WARN_MAT : VALIDATION_INFO_MAT

      for (const [mid, sevMap] of sevByModel) {
        const model = modelObjects.get(mid)
        if (!model) continue

        const errIds: number[] = [], warnIds: number[] = [], infoIds: number[] = []
        const tracked = new Map<number, FRAGS.MaterialDefinition>()
        for (const [eid, sev] of sevMap) {
          tracked.set(eid, matFor(sev))
          if (sev === 'error')        errIds.push(eid)
          else if (sev === 'warning') warnIds.push(eid)
          else                        infoIds.push(eid)
        }
        validationHighlightedByModel.set(mid, tracked)

        if (errIds.length)  void model.highlight(errIds,  VALIDATION_ERROR_MAT)
        if (warnIds.length) void model.highlight(warnIds, VALIDATION_WARN_MAT)
        if (infoIds.length) void model.highlight(infoIds, VALIDATION_INFO_MAT)
      }

      // Keep the currently selected element's selection overlay on top.
      if (selectedLocalId !== null && selectedModelId !== null) {
        const selModel = modelObjects.get(selectedModelId)
        if (selModel && validationMatFor(selectedModelId, selectedLocalId)) {
          void selModel.highlight([selectedLocalId], SELECT_MAT)
        }
      }
    },

    applyFilters(hidden, isolated, hiddenElements, isolatedElement, isolatedModelId) {
      if (modelObjects.size === 0) return
      for (const [modelId, model] of modelObjects) {
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
      const geomBytes = info.memory.geometries * 1024 * 128
      const texBytes  = info.memory.textures   * 1024 * 256
      return geomBytes + texBytes
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
        model.object.visible = mid === modelId
      }
      void fragmentsManager.core.update()
    },

    showAllModels() {
      for (const model of modelObjects.values()) {
        model.object.visible = true
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
      model.object.visible = visible
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
      typeMapByModel.delete(modelId)

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

      validationHighlightedByModel.delete(modelId)
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

    takeSnapshot(): string {
      try {
        void fragmentsManager.core.update()
        return wr.domElement.toDataURL('image/png')
      } catch {
        return ''
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

    dispose() {
      canvas.removeEventListener('pointermove',  onPointerMove)
      canvas.removeEventListener('pointerdown',  onPointerDown)
      canvas.removeEventListener('pointerup',    onPointerUp)
      canvas.removeEventListener('dblclick',     onDoubleClick)
      canvas.removeEventListener('contextmenu',  onContextMenu)
      try { lengthMeasurement.dispose() } catch { /* ok */ }
      try { areaMeasurement.dispose() } catch { /* ok */ }
      try { clipper.dispose() } catch { /* ok */ }
      components.dispose()
    },
  }
}