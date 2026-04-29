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
  opacity: 0.82,
  transparent: true,
  preserveOriginalMaterial: false,
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

  // Trigger tile streaming whenever the camera moves or comes to rest
  const triggerUpdate = (): void => { void fragmentsManager.core.update() }
  world.camera.controls.addEventListener('control', triggerUpdate)
  world.camera.controls.addEventListener('rest',    triggerUpdate)

  // ─── INIT: diagnose worker + ifcLoader setup ────────────────────────────
  const initPromise = (async () => {
    console.log('[Viewer] initPromise: starting worker + ifcLoader setup...')
    try {
      const workerURL = await OBC.FragmentsManager.getWorker()
      console.log('[Viewer] initPromise: worker URL resolved →', workerURL)
      fragmentsManager.init(workerURL)
      console.log('[Viewer] initPromise: fragmentsManager initialized ✓')
      await ifcLoader.setup()
      console.log('[Viewer] initPromise: ifcLoader.setup() complete ✓')
    } catch (err) {
      console.error('[Viewer] initPromise: FAILED →', err)
      throw err
    }
  })()

  let currentModel: FRAGS.FragmentsModel | null = null
  console.log('[Viewer] createViewer() — Three.js scene ready, awaiting model load')

  const expressIDToType = new Map<number, string>()

  let selectCallback: ((info: SelectedInfo | null) => void) | null = null
  let hoveredLocalId:  number | null = null
  let selectedLocalId: number | null = null

  const validationHighlightedIds = new Set<number>()

  let selectionBox: THREE.Box3Helper | null = null

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

  const onClick = async (e: MouseEvent): Promise<void> => {
    if (!currentModel) return

    // Raycast at the exact click position — don't rely on hoveredLocalId from pointermove
    const rect = canvas.getBoundingClientRect()
    const clickMouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  *  2 - 1,
      -((e.clientY - rect.top)  / rect.height) *  2 + 1,
    )
    const result = await fragmentsManager.raycast({ camera: world.camera.three, mouse: clickMouse, dom: canvas })
    const hitId  = result?.localId ?? null

    if (selectedLocalId !== null) {
      await currentModel.resetHighlight([selectedLocalId])
    }

    if (hitId !== null) {
      selectedLocalId = hitId
      hoveredLocalId  = hitId
      await currentModel.highlight([selectedLocalId], SELECT_MAT)
      addSelectionBox([selectedLocalId])

      const rawType = expressIDToType.get(selectedLocalId) ?? 'IFCELEMENT'
      const canon   = canonicalType(rawType)
      const name    = `${IFC_DISPLAY_NAMES[canon] ?? prettyType(canon)} #${selectedLocalId}`
      selectCallback?.({ id: String(selectedLocalId), name, type: rawType, storey: '' })
    } else {
      selectedLocalId = null
      hoveredLocalId  = null
      removeSelectionBox()
      selectCallback?.(null)
    }
  }

  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('click', (e) => { void onClick(e) })

  async function setupLoadedModel(
    model: FRAGS.FragmentsModel,
    fileName: string,
    onProgress?: (pct: number) => void,
  ): Promise<{ modelInfo: ModelInfo; modelObject: unknown; getElementInfo: (id: string) => SelectedInfo | null }> {

    // ─── SCENE: verify model.object is in the scene ───────────────────────
    console.log('[Viewer] setupLoadedModel() — model received:', model)
    console.log('[Viewer] model.object:', model.object)
    console.log('[Viewer] model.object in scene:', world.scene.three.children.includes(model.object))
    console.log('[Viewer] scene children count:', world.scene.three.children.length)

    // ─── BOUNDING BOX: check if geometry has real extents ─────────────────
    const boxEarly = model.box
    console.log('[Viewer] model.box (pre-category pass):', boxEarly)
    console.log('[Viewer] model.box isEmpty:', boxEarly.isEmpty())
    if (!boxEarly.isEmpty()) {
      const size = new THREE.Vector3()
      boxEarly.getSize(size)
      console.log('[Viewer] model.box size:', size)
      console.log('[Viewer] model.box center:', boxEarly.getCenter(new THREE.Vector3()))
    }

    const categoryNames = await model.getCategories()
    console.log('[Viewer] getCategories() →', categoryNames)

    const regexes    = categoryNames.map((c) => new RegExp(`^${c}$`, 'i'))
    const byCategory = await model.getItemsOfCategories(regexes)
    console.log('[Viewer] getItemsOfCategories() raw keys:', Object.keys(byCategory))

    const categoryAccum = new Map<string, number>()

    for (const [rawKey, ids] of Object.entries(byCategory)) {
      const upperType = rawKey.replace(/[\^$]/g, '').toUpperCase()
      const canon     = canonicalType(upperType)
      categoryAccum.set(canon, (categoryAccum.get(canon) ?? 0) + ids.length)
      for (const id of ids) expressIDToType.set(id, upperType)
    }

    console.log('[Viewer] expressIDToType total entries:', expressIDToType.size)
    console.log('[Viewer] category summary:', Object.fromEntries(categoryAccum))

    onProgress?.(80)

    // ─── COLOR PASS: log first few to verify palette hits ─────────────────
    let colorHits = 0, colorMisses = 0
    for (const [localId, rawType] of expressIDToType.entries()) {
      const pal = IFC_PALETTE[rawType] ?? IFC_PALETTE[canonicalType(rawType)]
      if (!pal) { colorMisses++; continue }
      colorHits++
      const col = new THREE.Color(pal.color)
      await model.setColor([localId], col)
      if (pal.opacity !== undefined) await model.setOpacity([localId], pal.opacity)
    }
    console.log(`[Viewer] color pass — hits: ${colorHits}, misses (no palette): ${colorMisses}`)

    onProgress?.(90)

    // ─── CAMERA FIT: confirm box is valid and fitToBox is called ──────────
    const box = model.box
    console.log('[Viewer] model.box (post-color pass):', box)
    console.log('[Viewer] model.box isEmpty:', box.isEmpty())
    if (!box.isEmpty()) {
      const size = new THREE.Vector3()
      box.getSize(size)
      console.log('[Viewer] fitting camera to box — size:', size, '| center:', box.getCenter(new THREE.Vector3()))
      void world.camera.controls.fitToBox(box, true)
    } else {
      console.warn('[Viewer] ⚠️ model.box is EMPTY — camera will NOT be fitted. Geometry may not have loaded correctly.')
    }

    // Kick off the first tile-streaming pass now that camera is positioned
    void fragmentsManager.core.update()

    onProgress?.(100)

    // Build element-ids-per-canonical-category map
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

    console.log('[Viewer] setupLoadedModel() complete — elementCount:', modelInfo.elementCount, '| categories:', categories.map(c => c.label))

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
    console.log('[Viewer] teardownCurrentModel() — disposing previous model')
    validationHighlightedIds.clear()
    removeSelectionBox()
    world.scene.three.remove(currentModel.object)
    await currentModel.dispose()
    currentModel = null
    expressIDToType.clear()
    hoveredLocalId  = null
    selectedLocalId = null
    console.log('[Viewer] teardownCurrentModel() — done')
  }

  return {

    async loadIfc(file, onProgress) {
      console.log('[Viewer] loadIfc() called — file:', file.name, '| size:', file.size, 'bytes')
      await initPromise
      console.log('[Viewer] loadIfc() — initPromise resolved, starting teardown...')
      await teardownCurrentModel()

      onProgress?.(15)
      const buffer = new Uint8Array(await file.arrayBuffer())
      console.log('[Viewer] loadIfc() — arrayBuffer read, byte length:', buffer.byteLength)
      onProgress?.(25)

      let model: FRAGS.FragmentsModel
      try {
        console.log('[Viewer] loadIfc() — calling ifcLoader.load()...')
        model = await ifcLoader.load(buffer, true, file.name)
        model.useCamera(world.camera.three)
        console.log('[Viewer] loadIfc() — ifcLoader.load() returned model:', model)
      } catch (err) {
        console.error('[Viewer] loadIfc() — ifcLoader.load() THREW:', err)
        throw err
      }

      currentModel = model

      // ─── Check model.object before adding to scene ────────────────────
      console.log('[Viewer] loadIfc() — model.object type:', model.object?.type)
      console.log('[Viewer] loadIfc() — model.object children count:', model.object?.children?.length)
      world.scene.three.add(model.object)
      console.log('[Viewer] loadIfc() — model.object added to scene ✓')
      console.log('[Viewer] loadIfc() — scene children now:', world.scene.three.children.length)
      onProgress?.(60)

      setTimeout(() => {
        console.log('[Viewer] 1 model.object children after 2s:', model.object.children.length)
        console.log('[Viewer] 1 model tiles count:', (model as any).tiles?.size ?? 'N/A')
        console.log('[Viewer] 1 fragmentsManager models count:', fragmentsManager.list)
        console.log('[Viewer] 1 world has model:', (world as any).meshes?.size ?? 'check manually')
        // Ver si el modelo está registrado en el world
        console.log('[Viewer] 1 renderer info:', wr.info.render)
      }, 2000)

      return setupLoadedModel(model, file.name, onProgress)
    },

    async loadFragments(buffer, fileName, onProgress) {
      console.log('[Viewer] loadFragments() called — fileName:', fileName, '| buffer length:', buffer.byteLength)
      await initPromise
      await teardownCurrentModel()

      onProgress?.(5)
      const modelId = `${fileName}-${Date.now()}`
      console.log('[Viewer] loadFragments() — modelId:', modelId)

      let model: FRAGS.FragmentsModel
      try {
        model = await fragmentsManager.core.load(buffer, {
          modelId,
          camera: world.camera.three,
          onProgress: (event) => {
            console.log('[Viewer] loadFragments() — progress stage:', event.stage)
            const stagePercent: Record<string, number> = {
              decompressing: 20, parsing: 45, generating: 65, done: 75,
            }
            onProgress?.(stagePercent[event.stage] ?? 50)
          },
        })
        console.log('[Viewer] loadFragments() — fragmentsManager.core.load() returned:', model)
      } catch (err) {
        console.error('[Viewer] loadFragments() — THREW:', err)
        throw err
      }

      currentModel = model
      world.scene.three.add(model.object)
      console.log('[Viewer] loadFragments() — model.object added to scene ✓')

      setTimeout(() => {
        console.log('[Viewer] 2 model.object children after 2s:', model.object.children.length)
        console.log('[Viewer] 2 model tiles count:', (model as any).tiles?.size ?? 'N/A')
        console.log('[Viewer] 2 fragmentsManager models count:', fragmentsManager.list)
        console.log('[Viewer] 2 world has model:', (world as any).meshes?.size ?? 'check manually')
        // Ver si el modelo está registrado en el world
        console.log('[Viewer] 2 renderer info:', wr.info.render)
      }, 2000)
      
      return setupLoadedModel(model, fileName, onProgress)
    },

    resetCamera() {
      console.log('[Viewer] resetCamera()')
      void world.camera.controls.setLookAt(30, 24, 36, 0, 2, 0, true)
    },

    frameCategory(id) {
      if (!currentModel) return
      const ids = [...expressIDToType.entries()]
        .filter(([, raw]) => canonicalType(raw) === id)
        .map(([localId]) => localId)
      console.log('[Viewer] frameCategory()', id, '— matching localIds:', ids.length)
      if (ids.length === 0) return
      currentModel.getMergedBox(ids).then((box) => {
        console.log('[Viewer] frameCategory() — merged box isEmpty:', box.isEmpty())
        if (!box.isEmpty()) void world.camera.controls.fitToBox(box, true)
      }).catch(() => { /* ignore */ })
    },

    focusElement(expressId) {
      if (!currentModel) return
      currentModel.getMergedBox([expressId]).then((box) => {
        console.log('[Viewer] focusElement()', expressId, '— box isEmpty:', box.isEmpty())
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
      console.log('[Viewer] selectElement()', expressId)
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
          if (issue.severity === 'error')   errIds.push(issue.expressId)
          else if (issue.severity === 'warning') warnIds.push(issue.expressId)
          else infoIds.push(issue.expressId)
          validationHighlightedIds.add(issue.expressId)
        }
      }

      console.log('[Viewer] setValidationHighlights() — errors:', errIds.length, '| warnings:', warnIds.length, '| info:', infoIds.length)
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
      console.log('[Viewer] applyFilters() — hiding:', toHide.length, '| showing:', toShow.length)
      if (toHide.length) void currentModel.setVisible(toHide, false)
      if (toShow.length) void currentModel.setVisible(toShow, true)
      // Force tile re-render so visibility changes appear immediately
      void fragmentsManager.core.update()
    },

    applyStyle(style) {
      console.log('[Viewer] applyStyle()', style)
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
      console.log('[Viewer] dispose()')
      canvas.removeEventListener('pointermove', onPointerMove)
      components.dispose()
    },
  }
}