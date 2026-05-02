import * as THREE from 'three'
import * as OBC from '@thatopen/components'
import * as FRAGS from '@thatopen/fragments'
import type { Category, ModelInfo, SelectedInfo, ViewerStyle, ValidationIssue } from '../types'

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
  name: string
  properties: Array<{
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
    onProgress?: (pct: number) => void,
  ): Promise<{
    modelInfo: ModelInfo
    modelObject: unknown
    getElementInfo: (id: string) => SelectedInfo | null
  }>
  /**
   * Fetches real IFC data for a given expressId from the loaded model.
   * Returns null if no model is loaded or the element is not found.
   */
  getItemData(expressId: number): Promise<IFCItemData | null>
  resetCamera(): void
  frameCategory(id: string): void
  focusElement(expressId: number): void
  selectElement(expressId: number): void
  applyFilters(hidden: Set<string>, isolated: string | null, hiddenElements?: Set<number>): void
  applyStyle(style: ViewerStyle): void
  frameElements(ids: number[]): void
  setValidationHighlights(issues: ValidationIssue[], enabled: boolean): void
  setSelectCallback(cb: (info: SelectedInfo | null) => void): void
  getGpuEstimateBytes(): number
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

    const psetNameAttr = p['Name']
    const psetName = attrStr(psetNameAttr)
    if (!psetName) continue

    const hasProperties = p['HasProperties']
    if (!Array.isArray(hasProperties)) continue

    const properties: IFCPropertySet['properties'] = []

    for (const prop of hasProperties) {
      if (!prop || typeof prop !== 'object') continue
      const pr = prop as Record<string, unknown>

      const nameAttr    = pr['Name']
      const nominalAttr = pr['NominalValue']

      const propName = attrStr(nameAttr)
      if (!propName) continue

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
        if ('type' in n && typeof n.type === 'string') {
          propType = n.type
        }
      }

      properties.push({ name: propName, value: propValue, type: propType })
    }

    result.push({ name: psetName, properties })
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
  const world      = worlds.create<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>()

  world.scene    = new OBC.SimpleScene(components)
  world.renderer = new OBC.SimpleRenderer(components, container)
  world.camera   = new OBC.SimpleCamera(components)

  const wr = (world.renderer as OBC.SimpleRenderer).three
  wr.shadowMap.enabled   = true
  wr.shadowMap.type      = THREE.PCFSoftShadowMap
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

  const fragmentsManager = components.get(OBC.FragmentsManager)
  const ifcLoader        = components.get(OBC.IfcLoader)

  const triggerUpdate = (): void => { void fragmentsManager.core.update() }
  world.camera.controls.addEventListener('control', triggerUpdate)
  world.camera.controls.addEventListener('rest',    triggerUpdate)

  const initPromise = (async () => {
    const workerURL = await OBC.FragmentsManager.getWorker()
    fragmentsManager.init(workerURL)
    await ifcLoader.setup()
  })()

  let currentModel: FRAGS.FragmentsModel | null = null

  const expressIDToType = new Map<number, string>()

  let selectCallback: ((info: SelectedInfo | null) => void) | null = null
  let hoveredLocalId:  number | null = null
  let selectedLocalId: number | null = null

  const validationHighlightedIds = new Set<number>()

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

  function addSelectionBox(ids: number[]): void {
    if (!currentModel || ids.length === 0) return
    currentModel.getMergedBox(ids).then((box) => {
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
    }).catch(() => { /* ignore */ })
  }

  // ─── Raycast ─────────────────────────────────────────────────────────────
  async function getBestHit(): Promise<number | null> {
    if (!currentModel) return null

    const result = await currentModel.raycast({
      camera: world.camera.three,
      mouse,
      dom: canvas,
    }) as { localId?: number; distance?: number } | null

    if (!result || result.localId === undefined) return null

    const rawType = expressIDToType.get(result.localId) ?? ''
    const canon   = canonicalType(rawType)

    if (SPATIAL_CONTAINER_TYPES.has(canon)) {
      const spatialIds: number[] = []
      for (const [id, raw] of expressIDToType.entries()) {
        if (SPATIAL_CONTAINER_TYPES.has(canonicalType(raw))) {
          spatialIds.push(id)
        }
      }

      await currentModel.setVisible(spatialIds, false)
      void fragmentsManager.core.update()

      let secondHit: number | null = null
      try {
        const result2 = await currentModel.raycast({
          camera: world.camera.three,
          mouse,
          dom: canvas,
        }) as { localId?: number } | null
        secondHit = result2?.localId ?? null
      } catch { /* ignore */ }

      await currentModel.setVisible(spatialIds, true)
      void fragmentsManager.core.update()

      return secondHit
    }

    return result.localId
  }

  let lastRaycastTime = 0
  const RAYCAST_THROTTLE_MS = 32

  const commitSelection = async (): Promise<void> => {
    if (!currentModel) return

    const hitId = await getBestHit()

    try {
      if (selectedLocalId !== null) await currentModel.resetHighlight([selectedLocalId])
    } catch { /* ignore */ }

    if (hitId !== null) {
      selectedLocalId = hitId
      try {
        await currentModel.highlight([selectedLocalId], SELECT_MAT)
      } catch (err) {
        console.warn('[Viewer] commitSelection highlight error:', err)
      }
      addSelectionBox([selectedLocalId])

      const rawType = expressIDToType.get(selectedLocalId) ?? 'IFCELEMENT'
      const canon   = canonicalType(rawType)
      const name    = `${IFC_DISPLAY_NAMES[canon] ?? prettyType(canon)} #${selectedLocalId}`
      selectCallback?.({ id: String(selectedLocalId), name, type: rawType, storey: '' })
    } else {
      selectedLocalId = null
      removeSelectionBox()
      selectCallback?.(null)
    }
  }

  const onPointerMove = async (e: PointerEvent): Promise<void> => {
    mouse.set(e.clientX, e.clientY)

    if (!currentModel) return

    const now = performance.now()
    if (now - lastRaycastTime < RAYCAST_THROTTLE_MS) return
    lastRaycastTime = now

    try {
      const hitId = await getBestHit()

      if (hoveredLocalId !== null && hoveredLocalId !== selectedLocalId) {
        await currentModel.resetHighlight([hoveredLocalId])
      }

      hoveredLocalId = hitId

      if (hoveredLocalId !== null && hoveredLocalId !== selectedLocalId) {
        await currentModel.highlight([hoveredLocalId], HOVER_MAT)
        canvas.style.cursor = 'pointer'
      } else {
        canvas.style.cursor = 'default'
      }
    } catch { /* ignore mid-frame errors */ }
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
    if (dt > 300 || dist > 5) return
    mouse.set(e.clientX, e.clientY)
    void commitSelection()
  }

  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup',   onPointerUp)

  // ─── Setup post-carga ─────────────────────────────────────────────────────

  async function setupLoadedModel(
    model: FRAGS.FragmentsModel,
    fileName: string,
    onProgress?: (pct: number) => void,
  ): Promise<{ modelInfo: ModelInfo; modelObject: unknown; getElementInfo: (id: string) => SelectedInfo | null }> {

    const categoryNames = await model.getCategories()
    const regexes    = categoryNames.map((c) => new RegExp(`^${c}$`, 'i'))
    const byCategory = await model.getItemsOfCategories(regexes)

    const categoryAccum = new Map<string, number>()

    for (const [rawKey, ids] of Object.entries(byCategory)) {
      const upperType = rawKey.replace(/[\^$]/g, '').toUpperCase()
      const canon     = canonicalType(upperType)
      categoryAccum.set(canon, (categoryAccum.get(canon) ?? 0) + ids.length)
      for (const id of ids) expressIDToType.set(id, upperType)
    }

    onProgress?.(80)

    for (const [localId, rawType] of expressIDToType.entries()) {
      const pal = IFC_PALETTE[rawType] ?? IFC_PALETTE[canonicalType(rawType)]
      if (!pal) continue
      const col = new THREE.Color(pal.color)
      await model.setColor([localId], col)
      if (pal.opacity !== undefined) await model.setOpacity([localId], pal.opacity)
    }

    onProgress?.(90)

    const box = model.box
    if (!box.isEmpty()) {
      void world.camera.controls.fitToBox(box, true)
    }

    void fragmentsManager.core.update()

    onProgress?.(100)

    const categoryElements = new Map<string, number[]>()
    for (const [localId, rawType] of expressIDToType.entries()) {
      const canon = canonicalType(rawType)
      const arr   = categoryElements.get(canon) ?? []
      arr.push(localId)
      categoryElements.set(canon, arr)
    }

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
      elementCount: expressIDToType.size,
      categories,
    }

    const getElementInfo = (id: string): SelectedInfo | null => {
      const localId = parseInt(id, 10)
      const rawType = expressIDToType.get(localId) ?? 'IFCELEMENT'
      const canon   = canonicalType(rawType)
      const name    = `${IFC_DISPLAY_NAMES[canon] ?? prettyType(canon)} #${localId}`
      return { id, name, type: rawType, storey: '' }
    }

    return { modelInfo, modelObject: model, getElementInfo }
  }

  async function teardownCurrentModel(): Promise<void> {
    if (!currentModel) return
    validationHighlightedIds.clear()
    removeSelectionBox()
    world.scene.three.remove(currentModel.object)
    await currentModel.dispose()
    currentModel = null
    expressIDToType.clear()
    hoveredLocalId  = null
    selectedLocalId = null
  }

  // ─── API pública ──────────────────────────────────────────────────────────

  return {

    async loadIfc(file, onProgress) {
      await initPromise
      await teardownCurrentModel()

      onProgress?.(15)
      const buffer = new Uint8Array(await file.arrayBuffer())
      onProgress?.(25)

      let model: FRAGS.FragmentsModel
      try {
        model = await ifcLoader.load(buffer, true, file.name)
        model.useCamera(world.camera.three)
      } catch (err) {
        console.error('[Viewer] loadIfc error:', err)
        throw err
      }

      currentModel = model
      world.scene.three.add(model.object)
      onProgress?.(60)

      return setupLoadedModel(model, file.name, onProgress)
    },

    async loadFragments(buffer, fileName, onProgress) {
      await initPromise
      await teardownCurrentModel()

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

      currentModel = model
      world.scene.three.add(model.object)

      return setupLoadedModel(model, fileName, onProgress)
    },

    // ─── NEW: getItemData ────────────────────────────────────────────────────
    // Fetches real IFC attributes + Psets + spatial containment for an element.
    async getItemData(expressId: number): Promise<IFCItemData | null> {
      if (!currentModel) return null

      try {
        const [data] = await currentModel.getItemsData([expressId], {
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

    frameCategory(id) {
      if (!currentModel) return
      const ids = [...expressIDToType.entries()]
        .filter(([, raw]) => canonicalType(raw) === id)
        .map(([localId]) => localId)
      if (ids.length === 0) return
      currentModel.getMergedBox(ids).then((box) => {
        if (!box.isEmpty()) void world.camera.controls.fitToBox(box, true)
      }).catch(() => { /* ignore */ })
    },

    focusElement(expressId) {
      if (!currentModel) return
      currentModel.getMergedBox([expressId]).then((box) => {
        if (!box.isEmpty()) void world.camera.controls.fitToBox(box, true)
      }).catch(() => { /* ignore */ })
    },

    frameElements(ids) {
      if (!currentModel || ids.length === 0) return
      currentModel.getMergedBox(ids).then((box) => {
        if (!box.isEmpty()) void world.camera.controls.fitToBox(box, true)
      }).catch(() => { /* ignore */ })
    },

    selectElement(expressId) {
      if (!currentModel) return
      void (async () => {
        if (selectedLocalId !== null) await currentModel?.resetHighlight([selectedLocalId])
        selectedLocalId = expressId
        await currentModel?.highlight([expressId], SELECT_MAT)
        addSelectionBox([expressId])
        const rawType = expressIDToType.get(expressId) ?? 'IFCELEMENT'
        const canon   = canonicalType(rawType)
        const name    = `${IFC_DISPLAY_NAMES[canon] ?? prettyType(canon)} #${expressId}`
        selectCallback?.({ id: String(expressId), name, type: rawType, storey: '' })
      })()
    },

    setValidationHighlights(issues, enabled) {
      if (!currentModel) return

      if (validationHighlightedIds.size > 0) {
        const toReset = [...validationHighlightedIds]
        validationHighlightedIds.clear()
        void currentModel.resetHighlight(toReset)
      }

      if (!enabled) return

      const errIds:  number[] = []
      const warnIds: number[] = []
      const infoIds: number[] = []

      for (const issue of issues) {
        if (expressIDToType.has(issue.expressId)) {
          if (issue.severity === 'error')        errIds.push(issue.expressId)
          else if (issue.severity === 'warning') warnIds.push(issue.expressId)
          else                                   infoIds.push(issue.expressId)
          validationHighlightedIds.add(issue.expressId)
        }
      }

      if (errIds.length)  void currentModel.highlight(errIds,  VALIDATION_ERROR_MAT)
      if (warnIds.length) void currentModel.highlight(warnIds, VALIDATION_WARN_MAT)
      if (infoIds.length) void currentModel.highlight(infoIds, VALIDATION_INFO_MAT)
    },

    applyFilters(hidden, isolated, hiddenElements) {
      if (!currentModel) return
      const toHide: number[] = []
      const toShow: number[] = []
      for (const [localId, rawType] of expressIDToType.entries()) {
        const canon   = canonicalType(rawType)
        const catShow = isolated ? (canon === isolated) : !hidden.has(canon)
        const show    = catShow && !(hiddenElements?.has(localId))
        if (show) toShow.push(localId)
        else      toHide.push(localId)
      }
      if (toHide.length) void currentModel.setVisible(toHide, false)
      if (toShow.length) void currentModel.setVisible(toShow, true)
      void fragmentsManager.core.update()
    },

    applyStyle(style) {
      if (!currentModel) return
      if (style === 'xray') {
        void currentModel.resetColor(undefined)
        void currentModel.setOpacity(undefined, 0.2)
      } else if (style === 'blueprint') {
        void currentModel.resetOpacity(undefined)
        void currentModel.setColor(undefined, new THREE.Color(0xE6E9F2))
      } else {
        void currentModel.resetOpacity(undefined)
        void currentModel.resetColor(undefined)
      }
    },

    setSelectCallback(cb) { selectCallback = cb },

    getGpuEstimateBytes() {
      const info      = wr.info
      const geomBytes = info.memory.geometries * 1024 * 128
      const texBytes  = info.memory.textures   * 1024 * 256
      return geomBytes + texBytes
    },

    dispose() {
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup',   onPointerUp)
      components.dispose()
    },
  }
}