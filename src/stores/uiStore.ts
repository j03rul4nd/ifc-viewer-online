import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { clamp } from '../lib/utils'
import { appBus } from '../lib/event-bus'
import type { PanelId } from '../lib/ui/panel-rail'

// ── Types ──────────────────────────────────────────────────────────────────────

/** Which 3D transform gizmo is active for the model pivot. */
export type TransformMode = 'none' | 'translate' | 'rotate' | 'scale'

/** Render quality preset. 'quality' enables SSAO + edge detection via PostproductionRenderer. */
export type RenderQuality = 'standard' | 'quality'

/** Which GPU backend the viewer is running on. 'detecting' while the async check is in flight. */
export type GpuBackend = 'webgpu' | 'webgl' | 'detecting'

/** Active measurement tool in the 3D viewport. */
export type MeasurementTool = 'none' | 'length' | 'area'

// ── Docked columns ────────────────────────────────────────────────────────────
// The tree, the selection sidebar and the validation panel are LAYOUT REGIONS,
// not floating cards: several are open at once by design, and they never
// overlap. So the rule they share is not the floating panels' "one at a time" —
// it is about how you collapse one and how you get it back.
//
//   A column collapses IN PLACE. It leaves a strip on its own edge that still
//   says what it is, and that strip is the same control that brings it back.
//
// This is the validation panel's behaviour, generalised, because it was already
// the only one that got it right. The other two each did something different:
// the tree could only be toggled from a menu two clicks away, and the sidebar
// left a ghost chevron in a corner it had not been in — with its open state in
// component-local `useState`, so it forgot itself on remount and nothing else
// could drive it. Three surfaces, three answers to "how do I get that back".
//
// Persisted, because a collapsed column is a working preference, not a mode.

const LS_COLUMNS = 'ifc-ui-columns:v1'

interface ColumnState { tree: boolean; sidebar: boolean; validation: boolean }

const COLUMN_DEFAULTS: ColumnState = { tree: true, sidebar: true, validation: false }

function loadColumns(): ColumnState {
  if (typeof localStorage === 'undefined') return COLUMN_DEFAULTS
  try {
    const raw = localStorage.getItem(LS_COLUMNS)
    if (!raw) return COLUMN_DEFAULTS
    const saved = JSON.parse(raw) as Partial<ColumnState>
    return {
      tree:       typeof saved.tree === 'boolean' ? saved.tree : COLUMN_DEFAULTS.tree,
      sidebar:    typeof saved.sidebar === 'boolean' ? saved.sidebar : COLUMN_DEFAULTS.sidebar,
      validation: typeof saved.validation === 'boolean' ? saved.validation : COLUMN_DEFAULTS.validation,
    }
  } catch {
    // A corrupt or unreadable entry must not stop the app from laying out.
    return COLUMN_DEFAULTS
  }
}

/** Persist the three column flags, taking the ones not being changed from state. */
function rememberColumns(
  current: { treeVisible: boolean; sidebarExpanded: boolean; validationPanelOpen: boolean },
  patch: Partial<ColumnState>,
): void {
  saveColumns({
    tree:       patch.tree ?? current.treeVisible,
    sidebar:    patch.sidebar ?? current.sidebarExpanded,
    validation: patch.validation ?? current.validationPanelOpen,
  })
}

function saveColumns(state: ColumnState): void {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(LS_COLUMNS, JSON.stringify(state)) } catch { /* private mode */ }
}

interface UIStore {
  validationPanelOpen:     boolean
  validationPanelFloating: boolean
  treeWidth:               number
  treeVisible:             boolean
  /** Pending tab to activate in the sidebar — consumed by Sidebar on mount or change. null = no pending request. */
  pendingSidebarTab:       'props' | 'cats' | 'qty' | null
  /** Whether the sidebar is open as a mobile drawer (< md breakpoint). */
  mobileSidebarOpen:       boolean
  /**
   * Desktop selection/legend column, expanded or collapsed to its edge strip.
   *
   * In the store rather than inside Sidebar, so it survives a remount and the
   * toolbar, keyboard and SDK can drive it — the same as the other two columns.
   */
  sidebarExpanded:         boolean
  /** Per-element visibility overrides. Keys are `"${modelId}:${expressId}"` so that
   *  elements from different models with the same expressId stay independent. */
  hiddenElements:          Set<string>
  /** Whether the camera preset overlay is visible in the 3D viewport. */
  cameraControlsVisible:   boolean
  /**
   * A host allowlist for the panel rail, set at runtime through the SDK.
   *
   * null means "no runtime opinion" — the URL's `panels=` stands. An empty
   * array is an opinion: no rail. Kept out of the persisted column state,
   * because it belongs to the embedding page rather than to the user.
   */
  runtimePanels:           PanelId[] | null
  setRuntimePanels:        (panels: PanelId[] | null) => void
  /** Active transform mode for the model pivot panel. */
  transformMode:           TransformMode
  /** Whether the scene panel (model list + transform) is open. */
  scenePanelOpen:          boolean
  /** Render quality preset. 'quality' enables SSAO + edge detection postproduction. */
  renderQuality:           RenderQuality
  /** Active measurement tool. 'none' means interaction mode (select/hover). */
  activeMeasurementTool:   MeasurementTool
  /** Number of measurements placed in the scene (kept in sync by the viewer). */
  measurementCount:        number
  /** Whether the measurement panel is visible. */
  measurementPanelOpen:    boolean
  /** Whether the section/clip-plane panel is visible. */
  clipPanelOpen:           boolean
  /** Number of active clipping planes (polled from viewer). */
  clipPlaneCount:          number
  /** Whether the floor-plan panel is visible. */
  plansPanelOpen:          boolean
  /** ID of the currently open storey view, or null in 3D mode. */
  activePlanViewId:        string | null
  /** Which GPU backend the viewer is running on. */
  gpuBackend:              GpuBackend
  /**
   * Client presentation skin (D-25): show-only UI layer for non-technical
   * audiences. A pure UI-layer flag — the loaded model, camera and all other
   * state persist across toggles (no remount of the viewer). Initialised from
   * `?ui=client` at boot; toggleable in-app without reloading.
   */
  clientMode:              boolean
  /** Presenter's hidden "advanced" toggle inside client mode — temporarily
   *  allows measurement/section tools without leaving the skin. */
  clientAdvancedTools:     boolean

  toggleValidationPanel:    () => void
  setValidationPanelOpen:   (open: boolean) => void
  setValidationPanelFloating: (floating: boolean) => void
  setTreeWidth:             (width: number) => void
  setTreeVisible:           (visible: boolean) => void
  setSidebarExpanded:       (expanded: boolean) => void
  openSidebarLegend:        () => void
  setPendingSidebarTab:     (tab: 'props' | 'cats' | 'qty') => void
  clearPendingSidebarTab:   () => void
  setMobileSidebarOpen:     (open: boolean) => void
  toggleMobileSidebar:      () => void
  setElementsVisible:          (ids: number[], visible: boolean, modelId: string) => void
  clearHiddenElements:         () => void
  /** Remove all hidden-element entries for a specific model (call when a model is removed). */
  clearHiddenElementsForModel: (modelId: string) => void
  setCameraControlsVisible: (visible: boolean) => void
  toggleCameraControls:     () => void
  setTransformMode:         (mode: TransformMode) => void
  setScenePanelOpen:        (open: boolean) => void
  toggleScenePanel:         () => void
  setRenderQuality:         (q: RenderQuality) => void
  setActiveMeasurementTool: (tool: MeasurementTool) => void
  setMeasurementCount:      (n: number) => void
  setMeasurementPanelOpen:  (open: boolean) => void
  toggleMeasurementPanel:   () => void
  setClipPanelOpen:         (open: boolean) => void
  toggleClipPanel:          () => void
  setClipPlaneCount:        (n: number) => void
  setPlansPanelOpen:        (open: boolean) => void
  togglePlansPanel:         () => void
  setActivePlanViewId:      (id: string | null) => void
  setGpuBackend:            (backend: GpuBackend) => void
  setClientMode:            (on: boolean) => void
  setClientAdvancedTools:   (on: boolean) => void
}

const TREE_WIDTH_MIN = 220
const TREE_WIDTH_MAX = 600

// ── Store ──────────────────────────────────────────────────────────────────────

export const useUIStore = create<UIStore>()(
  devtools(
    (set) => ({
      validationPanelOpen:     loadColumns().validation,
      validationPanelFloating: false,
      treeWidth:               300,
      treeVisible:             loadColumns().tree,
      mobileSidebarOpen:       false,
      sidebarExpanded:         loadColumns().sidebar,
      hiddenElements:          new Set<string>(),
      // Closed at rest. Jumping to a view is a one-shot command, not something
      // you read while you work, so the expanded grid is a popover you dismiss
      // rather than a panel that sits in the corner the panels open into.
      // Open by default, it was 245x171 of the viewport being covered by every
      // panel — visible but unusable. See docs/RIGHT_EDGE.md.
      cameraControlsVisible:   false,
      runtimePanels:           null,
      transformMode:           'none' as TransformMode,
      scenePanelOpen:          false,
      renderQuality:           'standard' as RenderQuality,
      activeMeasurementTool:   'none' as MeasurementTool,
      measurementCount:        0,
      measurementPanelOpen:    false,
      clipPanelOpen:           false,
      clipPlaneCount:          0,
      plansPanelOpen:          false,
      activePlanViewId:        null,
      gpuBackend:              'detecting' as GpuBackend,
      pendingSidebarTab:       null,
      clientMode:              false,
      clientAdvancedTools:     false,

      // Every column setter goes through `rememberColumns`, so "collapsed"
      // survives a reload for all three or for none. One of them quietly not
      // persisting is how three surfaces end up feeling like three products.
      toggleValidationPanel: () =>
        set((s) => {
          const next = !s.validationPanelOpen
          rememberColumns(s, { validation: next })
          return { validationPanelOpen: next }
        }, false, 'toggleValidationPanel'),

      setValidationPanelOpen: (open) =>
        set((s) => {
          rememberColumns(s, { validation: open })
          return { validationPanelOpen: open }
        }, false, 'setValidationPanelOpen'),

      setValidationPanelFloating: (floating) =>
        set({ validationPanelFloating: floating }, false, 'setValidationPanelFloating'),

      setTreeWidth: (width) =>
        set({ treeWidth: clamp(width, TREE_WIDTH_MIN, TREE_WIDTH_MAX) }, false, 'setTreeWidth'),

      setTreeVisible: (visible) =>
        set((s) => {
          rememberColumns(s, { tree: visible })
          return { treeVisible: visible }
        }, false, 'setTreeVisible'),

      setRuntimePanels: (panels) =>
        set({ runtimePanels: panels }, false, 'setRuntimePanels'),

      setSidebarExpanded: (expanded) =>
        set((s) => {
          rememberColumns(s, { sidebar: expanded })
          return { sidebarExpanded: expanded }
        }, false, 'setSidebarExpanded'),

      openSidebarLegend: () =>
        set({ treeVisible: true, pendingSidebarTab: 'cats' }, false, 'openSidebarLegend'),

      setPendingSidebarTab: (tab) =>
        set({ pendingSidebarTab: tab }, false, 'setPendingSidebarTab'),

      clearPendingSidebarTab: () =>
        set({ pendingSidebarTab: null }, false, 'clearPendingSidebarTab'),

      setMobileSidebarOpen: (open) =>
        set({ mobileSidebarOpen: open }, false, 'setMobileSidebarOpen'),

      toggleMobileSidebar: () =>
        set((s) => ({ mobileSidebarOpen: !s.mobileSidebarOpen }), false, 'toggleMobileSidebar'),

      setElementsVisible: (ids, visible, modelId) =>
        set(
          (s) => {
            const next = new Set(s.hiddenElements)
            for (const id of ids) {
              const key = `${modelId}:${id}`
              visible ? next.delete(key) : next.add(key)
            }
            return { hiddenElements: next }
          },
          false,
          'setElementsVisible',
        ),

      clearHiddenElements: () =>
        set({ hiddenElements: new Set<string>() }, false, 'clearHiddenElements'),

      clearHiddenElementsForModel: (modelId) =>
        set(
          (s) => {
            const prefix = `${modelId}:`
            const next = new Set([...s.hiddenElements].filter((k) => !k.startsWith(prefix)))
            // Bail out early (no re-render) when nothing changed
            return next.size === s.hiddenElements.size ? s : { hiddenElements: next }
          },
          false,
          `clearHiddenElementsForModel:${modelId}`,
        ),

      setCameraControlsVisible: (visible) =>
        set({ cameraControlsVisible: visible }, false, 'setCameraControlsVisible'),

      toggleCameraControls: () =>
        set((s) => ({ cameraControlsVisible: !s.cameraControlsVisible }), false, 'toggleCameraControls'),

      setTransformMode: (mode) =>
        set({ transformMode: mode }, false, 'setTransformMode'),

      setScenePanelOpen: (open) =>
        set({ scenePanelOpen: open }, false, 'setScenePanelOpen'),

      toggleScenePanel: () =>
        set((s) => ({ scenePanelOpen: !s.scenePanelOpen }), false, 'toggleScenePanel'),

      setRenderQuality: (q) =>
        set({ renderQuality: q }, false, 'setRenderQuality'),

      setActiveMeasurementTool: (tool) =>
        set({ activeMeasurementTool: tool }, false, 'setActiveMeasurementTool'),

      setMeasurementCount: (n) =>
        set({ measurementCount: n }, false, 'setMeasurementCount'),

      setMeasurementPanelOpen: (open) =>
        set({ measurementPanelOpen: open }, false, 'setMeasurementPanelOpen'),

      toggleMeasurementPanel: () =>
        set((s) => ({ measurementPanelOpen: !s.measurementPanelOpen }), false, 'toggleMeasurementPanel'),

      setClipPanelOpen: (open) =>
        set({ clipPanelOpen: open }, false, 'setClipPanelOpen'),

      toggleClipPanel: () =>
        set((s) => ({ clipPanelOpen: !s.clipPanelOpen }), false, 'toggleClipPanel'),

      setClipPlaneCount: (n) =>
        set({ clipPlaneCount: n }, false, 'setClipPlaneCount'),

      setPlansPanelOpen: (open) =>
        set({ plansPanelOpen: open }, false, 'setPlansPanelOpen'),

      togglePlansPanel: () =>
        set((s) => ({ plansPanelOpen: !s.plansPanelOpen }), false, 'togglePlansPanel'),

      setActivePlanViewId: (id) =>
        set({ activePlanViewId: id }, false, 'setActivePlanViewId'),

      setGpuBackend: (backend) =>
        set({ gpuBackend: backend }, false, 'setGpuBackend'),

      setClientMode: (on) => {
        set(
          (s) => {
            if (s.clientMode === on) return s
            return {
              ...s,
              clientMode: on,
              clientAdvancedTools: false,
              // Entering the client skin closes every technical floating panel
              // so the audience never sees a half-open coordinator tool.
              ...(on
                ? {
                    scenePanelOpen: false,
                    measurementPanelOpen: false,
                    clipPanelOpen: false,
                    plansPanelOpen: false,
                    transformMode: 'none' as TransformMode,
                    activeMeasurementTool: 'none' as MeasurementTool,
                    mobileSidebarOpen: false,
                  }
                : {}),
            }
          },
          false,
          'setClientMode',
        )
        appBus.emit('ui:client-mode-toggled', { enabled: on })
      },

      setClientAdvancedTools: (on) =>
        set({ clientAdvancedTools: on }, false, 'setClientAdvancedTools'),
    }),
    { name: 'UIStore', enabled: import.meta.env.DEV },
  ),
)

// ── Selectors ─────────────────────────────────────────────────────────────────

export const selectTreeVisible          = (s: UIStore) => s.treeVisible
export const selectTreeWidth            = (s: UIStore) => s.treeWidth
export const selectMobileSidebarOpen    = (s: UIStore) => s.mobileSidebarOpen
export const selectHiddenElements        = (s: UIStore) => s.hiddenElements
export const selectCameraControlsVisible = (s: UIStore) => s.cameraControlsVisible
export const selectTransformMode         = (s: UIStore) => s.transformMode
export const selectScenePanelOpen        = (s: UIStore) => s.scenePanelOpen
export const selectRenderQuality         = (s: UIStore) => s.renderQuality
export const selectGpuBackend            = (s: UIStore) => s.gpuBackend
export const selectActiveMeasurementTool = (s: UIStore) => s.activeMeasurementTool
export const selectMeasurementCount      = (s: UIStore) => s.measurementCount
export const selectMeasurementPanelOpen  = (s: UIStore) => s.measurementPanelOpen
export const selectClipPanelOpen         = (s: UIStore) => s.clipPanelOpen
export const selectClipPlaneCount        = (s: UIStore) => s.clipPlaneCount
export const selectPlansPanelOpen        = (s: UIStore) => s.plansPanelOpen
export const selectActivePlanViewId      = (s: UIStore) => s.activePlanViewId
export const selectClientMode            = (s: UIStore) => s.clientMode
export const selectClientAdvancedTools   = (s: UIStore) => s.clientAdvancedTools
