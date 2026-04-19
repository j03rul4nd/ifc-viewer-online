import * as OBC from '@thatopen/components'
import * as FRAGS from '@thatopen/fragments'
import * as THREE from 'three'
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

function canonicalType(raw: string): string {
  return raw.replace('STANDARDCASE', '').replace('ELEMENTEDCASE', '')
}

function prettyType(raw: string): string {
  const noPrefix = raw.startsWith('IFC') ? raw.slice(3) : raw
  return noPrefix.charAt(0) + noPrefix.slice(1).toLowerCase()
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
  resetCamera(): void
  frameCategory(id: string): void
  focusElement(expressId: number): void
  selectElement(expressId: number): void
  applyFilters(hidden: Set<string>, isolated: string | null): void
  applyStyle(style: ViewerStyle): void
  setValidationHighlights(issues: ValidationIssue[], enabled: boolean): void
  setSelectCallback(cb: (info: SelectedInfo | null) => void): void
  getGpuEstimateBytes(): number
  dispose(): void
}

// ─── Highlight material presets ──────────────────────────────────────────────

const HOVER_MAT: FRAGS.MaterialDefinition = {
  color: new THREE.Color(0x5E6AD2),
  renderedFaces: FRAGS.RenderedFaces.TWO,
  opacity: 0.7,
  transparent: false,
  preserveOriginalMaterial: true,
}

const SELECT_MAT: FRAGS.MaterialDefinition = {
  color: new THREE.Color(0x5E6AD2),
  renderedFaces: FRAGS.RenderedFaces.TWO,
  opacity: 1,
  transparent: false,
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

  // Tracks which localIds have validation highlights (to clear on toggle)
  const validationHighlightedIds = new Set<number>()

  const canvas = wr.domElement
  const mouse  = new THREE.Vector2()
  let raycasting = false

  const onPointerMove = (e: PointerEvent): void => {
    if (raycasting || !currentModel) return
    const rect = canvas.getBoundingClientRect()
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    raycasting = true
    fragmentsManager
      .raycast({ camera: world.camera.three, mouse, dom: canvas })
      .then(async (result) => {
        const hitId = result?.localId ?? null

        if (hoveredLocalId !== null && hoveredLocalId !== selectedLocalId) {
          await currentModel?.resetHighlight([hoveredLocalId])
        }

        hoveredLocalId = hitId

        if (hoveredLocalId !== null && hoveredLocalId !== selectedLocalId) {
          await currentModel?.highlight([hoveredLocalId], HOVER_MAT)
          canvas.style.cursor = 'pointer'
        } else {
          canvas.style.cursor = 'default'
        }
      })
      .catch(() => { /* ignore mid-frame errors */ })
      .finally(() => { raycasting = false })
  }

  const onClick = async (): Promise<void> => {
    if (!currentModel) return

    if (selectedLocalId !== null) {
      await currentModel.resetHighlight([selectedLocalId])
    }

    if (hoveredLocalId !== null) {
      selectedLocalId = hoveredLocalId
      await currentModel.highlight([selectedLocalId], SELECT_MAT)

      const rawType = expressIDToType.get(selectedLocalId) ?? 'IFCELEMENT'
      const canon   = canonicalType(rawType)
      const name    = `${IFC_DISPLAY_NAMES[canon] ?? prettyType(canon)} #${selectedLocalId}`
      selectCallback?.({ id: String(selectedLocalId), name, type: rawType, storey: '' })
    } else {
      selectedLocalId = null
      selectCallback?.(null)
    }
  }

  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('click', () => { void onClick() })

  async function setupLoadedModel(
    model: FRAGS.FragmentsModel,
    fileName: string,
    onProgress?: (pct: number) => void,
  ): Promise<{ modelInfo: ModelInfo; modelObject: unknown; getElementInfo: (id: string) => SelectedInfo | null }> {

    const categoryNames = await model.getCategories()
    const regexes       = categoryNames.map((c) => new RegExp(`^${c}$`, 'i'))
    const byCategory    = await model.getItemsOfCategories(regexes)
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
    if (!box.isEmpty()) void world.camera.controls.fitToBox(box, true)

    onProgress?.(100)

    const categories: Category[] = Array.from(categoryAccum.entries())
      .map(([id, count]) => ({
        id,
        label: IFC_DISPLAY_NAMES[id] ?? prettyType(id),
        count,
        color: IFC_PALETTE[id]?.color ?? 0x888888,
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
    world.scene.three.remove(currentModel.object)
    await currentModel.dispose()
    currentModel = null
    expressIDToType.clear()
    hoveredLocalId  = null
    selectedLocalId = null
  }

  return {

    async loadIfc(file, onProgress) {
      await initPromise
      await teardownCurrentModel()

      onProgress?.(15)
      const buffer = new Uint8Array(await file.arrayBuffer())
      onProgress?.(25)

      const model = await ifcLoader.load(buffer, true, file.name)
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
      const model   = await fragmentsManager.core.load(buffer, {
        modelId,
        onProgress: (event) => {
          const stagePercent: Record<string, number> = {
            decompressing: 20, parsing: 45, generating: 65, done: 75,
          }
          onProgress?.(stagePercent[event.stage] ?? 50)
        },
      })

      currentModel = model
      world.scene.three.add(model.object)
      return setupLoadedModel(model, fileName, onProgress)
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

    selectElement(expressId) {
      if (!currentModel) return
      void (async () => {
        if (selectedLocalId !== null) await currentModel?.resetHighlight([selectedLocalId])
        selectedLocalId = expressId
        await currentModel?.highlight([expressId], SELECT_MAT)
        const rawType = expressIDToType.get(expressId) ?? 'IFCELEMENT'
        const canon   = canonicalType(rawType)
        const name    = `${IFC_DISPLAY_NAMES[canon] ?? prettyType(canon)} #${expressId}`
        selectCallback?.({ id: String(expressId), name, type: rawType, storey: '' })
      })()
    },

    setValidationHighlights(issues, enabled) {
      if (!currentModel) return

      // Clear previous validation highlights
      if (validationHighlightedIds.size > 0) {
        const toReset = [...validationHighlightedIds]
        validationHighlightedIds.clear()
        void currentModel.resetHighlight(toReset)
      }

      if (!enabled) return

      // Group issues by severity and apply materials
      const errIds:  number[] = []
      const warnIds: number[] = []
      const infoIds: number[] = []

      for (const issue of issues) {
        if (expressIDToType.has(issue.expressId)) {
          if (issue.severity === 'error')   errIds.push(issue.expressId)
          else if (issue.severity === 'warning') warnIds.push(issue.expressId)
          else infoIds.push(issue.expressId)
          validationHighlightedIds.add(issue.expressId)
        }
      }

      if (errIds.length)  void currentModel.highlight(errIds,  VALIDATION_ERROR_MAT)
      if (warnIds.length) void currentModel.highlight(warnIds, VALIDATION_WARN_MAT)
      if (infoIds.length) void currentModel.highlight(infoIds, VALIDATION_INFO_MAT)
    },

    applyFilters(hidden, isolated) {
      if (!currentModel) return
      const toHide: number[] = []
      const toShow: number[] = []
      for (const [localId, rawType] of expressIDToType.entries()) {
        const canon = canonicalType(rawType)
        const show  = !hidden.has(canon) && !(isolated && isolated !== canon)
        if (show) toShow.push(localId)
        else      toHide.push(localId)
      }
      if (toHide.length) void currentModel.setVisible(toHide, false)
      if (toShow.length) void currentModel.setVisible(toShow, true)
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
      components.dispose()
    },
  }
}
