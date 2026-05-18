import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { clamp } from '../lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

/** Which 3D transform gizmo is active for the model pivot. */
export type TransformMode = 'none' | 'translate' | 'rotate' | 'scale'

/** Render quality preset. 'quality' enables SSAO + edge detection via PostproductionRenderer. */
export type RenderQuality = 'standard' | 'quality'

/** Active measurement tool in the 3D viewport. */
export type MeasurementTool = 'none' | 'length' | 'area'

interface UIStore {
  validationPanelOpen:     boolean
  validationPanelFloating: boolean
  treeWidth:               number
  treeVisible:             boolean
  /** Whether the sidebar is open as a mobile drawer (< md breakpoint). */
  mobileSidebarOpen:       boolean
  /** Per-element visibility overrides keyed by expressId. */
  hiddenElements:          Set<number>
  /** Whether the camera preset overlay is visible in the 3D viewport. */
  cameraControlsVisible:   boolean
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

  toggleValidationPanel:    () => void
  setValidationPanelOpen:   (open: boolean) => void
  setValidationPanelFloating: (floating: boolean) => void
  setTreeWidth:             (width: number) => void
  setTreeVisible:           (visible: boolean) => void
  setMobileSidebarOpen:     (open: boolean) => void
  toggleMobileSidebar:      () => void
  setElementsVisible:       (ids: number[], visible: boolean) => void
  clearHiddenElements:      () => void
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
}

const TREE_WIDTH_MIN = 220
const TREE_WIDTH_MAX = 600

// ── Store ──────────────────────────────────────────────────────────────────────

export const useUIStore = create<UIStore>()(
  devtools(
    (set) => ({
      validationPanelOpen:     false,
      validationPanelFloating: false,
      treeWidth:               300,
      treeVisible:             true,
      mobileSidebarOpen:       false,
      hiddenElements:          new Set<number>(),
      cameraControlsVisible:   true,
      transformMode:           'none' as TransformMode,
      scenePanelOpen:          false,
      renderQuality:           'standard' as RenderQuality,
      activeMeasurementTool:   'none' as MeasurementTool,
      measurementCount:        0,
      measurementPanelOpen:    false,

      toggleValidationPanel: () =>
        set((s) => ({ validationPanelOpen: !s.validationPanelOpen }), false, 'toggleValidationPanel'),

      setValidationPanelOpen: (open) =>
        set({ validationPanelOpen: open }, false, 'setValidationPanelOpen'),

      setValidationPanelFloating: (floating) =>
        set({ validationPanelFloating: floating }, false, 'setValidationPanelFloating'),

      setTreeWidth: (width) =>
        set({ treeWidth: clamp(width, TREE_WIDTH_MIN, TREE_WIDTH_MAX) }, false, 'setTreeWidth'),

      setTreeVisible: (visible) =>
        set({ treeVisible: visible }, false, 'setTreeVisible'),

      setMobileSidebarOpen: (open) =>
        set({ mobileSidebarOpen: open }, false, 'setMobileSidebarOpen'),

      toggleMobileSidebar: () =>
        set((s) => ({ mobileSidebarOpen: !s.mobileSidebarOpen }), false, 'toggleMobileSidebar'),

      setElementsVisible: (ids, visible) =>
        set(
          (s) => {
            const next = new Set(s.hiddenElements)
            for (const id of ids) visible ? next.delete(id) : next.add(id)
            return { hiddenElements: next }
          },
          false,
          'setElementsVisible',
        ),

      clearHiddenElements: () =>
        set({ hiddenElements: new Set<number>() }, false, 'clearHiddenElements'),

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
    }),
    { name: 'UIStore', enabled: import.meta.env.DEV },
  ),
)

// ── Selectors ─────────────────────────────────────────────────────────────────

export const selectTreeVisible          = (s: UIStore) => s.treeVisible
export const selectTreeWidth            = (s: UIStore) => s.treeWidth
export const selectMobileSidebarOpen    = (s: UIStore) => s.mobileSidebarOpen
export const selectHiddenElements       = (s: UIStore) => s.hiddenElements
export const selectCameraControlsVisible = (s: UIStore) => s.cameraControlsVisible
export const selectTransformMode         = (s: UIStore) => s.transformMode
export const selectScenePanelOpen        = (s: UIStore) => s.scenePanelOpen
export const selectRenderQuality         = (s: UIStore) => s.renderQuality
export const selectActiveMeasurementTool = (s: UIStore) => s.activeMeasurementTool
export const selectMeasurementCount      = (s: UIStore) => s.measurementCount
export const selectMeasurementPanelOpen  = (s: UIStore) => s.measurementPanelOpen
