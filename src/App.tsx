import React, { useState, useRef, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import Viewer from './components/Viewer'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import UploadOverlay from './components/UploadOverlay'
import Landing from './components/Landing'
import ModelTree from './components/ModelTree'
import ValidationPanel from './components/ValidationPanel'
import ToastContainer from './components/ToastContainer'
import CameraControls from './components/CameraControls'
import ModelInfoPanel from './components/ModelInfoPanel'
import ScenePanel from './components/ScenePanel'
import MeasurementPanel from './components/MeasurementPanel'
import SectionPanel from './components/SectionPanel'
import FloorPlanPanel from './components/FloorPlanPanel'
import ExportModal from './components/ExportModal'
import { lighten } from './lib/utils'
import { modelRegistry } from './lib/model-registry'
import { useIfcLoader } from './lib/loader'
import { useEditorHistory } from './hooks/useEditorHistory'
import { useValidationRunner } from './hooks/useValidationRunner'
import { useElementFocus } from './hooks/useElementFocus'
import { usePersistedPreferences } from './hooks/usePersistedPreferences'
import { useValidationStore } from './stores/validationStore'
import { useUIStore } from './stores/uiStore'
import { useModelStore } from './stores/modelStore'
import { useEditorStore } from './stores/editorStore'
import { useSceneStore } from './stores/sceneStore'
import { useTakeoffStore } from './stores/takeoffStore'
import { toast } from './stores/toastStore'
import type { ViewerAPI } from './lib/viewer'
import type { Route, ViewerStyle, SelectedInfo, ViewerHandle, ModelInfo } from './types'
import * as Icons from './components/Icons'

// ── ModelTree imperative handle ───────────────────────────────────────────────
export interface ModelTreeHandle {
  revealElement: (expressId: number) => void
}

export default function App() {
  const [route, setRoute] = useState<Route>('landing')
  const [accent] = useState('#5E6AD2')

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent)
    document.documentElement.style.setProperty('--accent-2', lighten(accent, 22))
  }, [accent])

  const viewerApiRef = useRef<ViewerAPI | null>(null)
  const viewerRef    = useRef<ViewerHandle>(null)
  const modelTreeRef = useRef<ModelTreeHandle>(null)

  // Model & loading state
  const [modelInfo,    setModelInfo]    = useState<ModelInfo | null>(null)
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [loadError,    setLoadError]    = useState<string | null>(null)

  // Viewer interaction state
  const [viewerStyle] = useState<ViewerStyle>('shaded')
  const [selected,   setSelected]   = useState<SelectedInfo | null>(null)
  const [hidden,     setHidden]     = useState<Set<string>>(new Set())
  const [isolated,   setIsolated]   = useState<string | null>(null)
  const [showUpload, setShowUpload]       = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)

  // Stores
  const { validationMode, result } = useValidationStore()
  const {
    treeVisible, treeWidth, hiddenElements, clearHiddenElements,
    mobileSidebarOpen, setMobileSidebarOpen,
    cameraControlsVisible, toggleCameraControls,
    scenePanelOpen, toggleScenePanel, setScenePanelOpen,
    setClipPanelOpen, setClipPlaneCount, setPlansPanelOpen,
    activePlanViewId, setActivePlanViewId,
    setMeasurementPanelOpen, setActiveMeasurementTool,
  } = useUIStore()

  const {
    models: sceneModels,
    activeModelId,
    addModel:           addSceneModel,
    setModelVisible:    setSceneModelVisible,
    setModelTransform:  setSceneModelTransform,
    setActiveModel:     setSceneActiveModel,
    removeModel:        removeSceneModel,
    clearScene,
  } = useSceneStore()

  // Undo/redo keyboard shortcuts
  useEditorHistory()

  // Persist tree preferences across sessions
  usePersistedPreferences()

  // Validation lifecycle
  const validation = useValidationRunner()

  // Element focus/select/reveal handlers
  const elementFocus = useElementFocus(viewerApiRef, modelTreeRef)

  // ── Loading pipeline ──────────────────────────────────────────────────────

  const {
    loadFile,
    progress,
    memoryStats,
    cacheEntries,
    deleteFromCache,
    isFromCache,
    opfsAvailable,
  } = useIfcLoader({
    viewerApiRef,
    onModelLoaded: (info, fromCache, modelId) => {
      setModelInfo(info)
      setLoadingState('loaded')
      setLoadError(null)

      // Use the stable sceneModelId from the viewer so ScenePanel and multi-model code align
      addSceneModel(modelId, info)

      console.info(
        `[IFC] Loaded "${info.fileName}" (${info.elementCount} elements, id: ${modelId})` +
        (fromCache ? ' — from cache ⚡' : ' — parsed fresh'),
      )
      toast(
        `"${info.fileName}" loaded — ${info.elementCount.toLocaleString()} elements` +
        (fromCache ? ' (from cache ⚡)' : ''),
        'success',
      )
      void validation.run(undefined, modelId)
    },
    onError: (msg) => {
      console.error('[IFC] Load error:', msg)
      setLoadingState('error')
      setLoadError(msg)
    },
  })

  // ── Sync validation overlay with viewer ───────────────────────────────────

  useEffect(() => {
    const issues = result?.issues ?? []
    viewerApiRef.current?.setValidationHighlights(issues, validationMode)
  }, [validationMode, result])

  // ── Sync active model in sceneStore when the user clicks an element ───────
  // commitSelection in the viewer auto-activates the hit model, but doesn't
  // update the sceneStore. We derive it from the selected element's modelId.
  useEffect(() => {
    if (selected?.modelId && selected.modelId !== activeModelId) {
      setSceneActiveModel(selected.modelId)
    }
  }, [selected, activeModelId, setSceneActiveModel])

  // ── Auto-open mobile sidebar when an element is selected ──────────────────
  // On desktop (md+) the sidebar is always visible, so no action needed there.
  useEffect(() => {
    if (selected && window.innerWidth < 768) {
      setMobileSidebarOpen(true)
    }
  }, [selected, setMobileSidebarOpen])

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleFileLoad = (file: File): void => {
    setLoadingState('loading')
    setLoadError(null)
    setRoute('viewer')
    // Only reset viewer interaction state for the very first model load.
    // Loading additional models must not disturb existing selections/visibility.
    if (sceneModels.length === 0) {
      setModelInfo(null)
      setSelected(null)
      setHidden(new Set())
      setIsolated(null)
      clearHiddenElements()
    }
    void loadFile(file)
  }

  const openUploadModal = useCallback((): void => {
    if (loadingState === 'loading') return
    setShowUpload(true)
  }, [loadingState])

  const handleLaunch = (): void => {
    setRoute('viewer')
    void (async () => {
      try {
        const res  = await fetch(`${import.meta.env.BASE_URL}Ifc2x3_Duplex_Architecture.ifc`)
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
        const buf  = await res.arrayBuffer()
        const file = new File([buf], 'Ifc2x3_Duplex_Architecture.ifc', { type: '' })
        handleFileLoad(file)
      } catch (err: unknown) {
        console.warn('[App] Demo file unavailable:', err)
        toast('Demo file could not be loaded. Please open your own IFC file.', 'warning')
        setShowUpload(true)
      }
    })()
  }

  const handleToggleHidden = (id: string): void => {
    setHidden((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const handleIsolate = (): void => {
    if (!selected) return
    if (isolated === selected.type) {
      setIsolated(null)
    } else {
      setIsolated(selected.type)
      viewerRef.current?.frameCategory(selected.type)
    }
  }

  const handleJumpToElement      = elementFocus.jumpToElement
  const handleSelectTreeElement  = useCallback(
    (expressId: number, modelId?: string) => elementFocus.selectElement(expressId, modelId),
    [elementFocus],
  )
  const handleFocusElements      = elementFocus.focusElements
  const handleFrameElement       = elementFocus.frameElement
  const handleRevealInTree       = elementFocus.revealInTree

  // ── Activate a specific model in both store and viewer ───────────────────
  const handleSetActiveModel = useCallback((id: string): void => {
    setSceneActiveModel(id)
    viewerApiRef.current?.setActiveModel(id)
  }, [setSceneActiveModel])

  // ── Remove a model from the scene, viewer, and all stores ────────────────
  const handleRemoveModel = useCallback(async (id: string): Promise<void> => {
    try {
      // If a 2D plan view is active, close it before removing the model
      if (activePlanViewId) {
        try { viewerApiRef.current?.closeStoreyView() } catch { }
        setActivePlanViewId(null)
      }
      await viewerApiRef.current?.removeModel(id)
      removeSceneModel(id)
      useModelStore.getState().removeModelEntry(id)
      useValidationStore.getState().clearValidationForModel(id)
      useTakeoffStore.getState().clearModelResult(id)
      modelRegistry.unregister(id)
      // Clear selection if the removed model owned the currently selected element
      setSelected((prev) => (prev?.modelId === id ? null : prev))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[App] Failed to remove model:', msg)
      toast(`Could not remove model: ${msg}`, 'error')
    }
  }, [removeSceneModel, activePlanViewId, setActivePlanViewId])

  // ── Navigate back to landing — reset all model/editor/validation state ────
  const handleNavigateToLanding = useCallback((): void => {
    setRoute('landing')
    setModelInfo(null)
    setLoadingState('idle')
    setLoadError(null)
    setSelected(null)
    setHidden(new Set())
    setIsolated(null)
    useModelStore.getState().clearModel()
    useEditorStore.getState().clearHistory()
    useValidationStore.getState().reset()
    useTakeoffStore.getState().reset()
    modelRegistry.clear()
    clearScene()
    // Clean up Sprint 7+8 panel state and viewer tools
    setMeasurementPanelOpen(false)
    setActiveMeasurementTool('none')
    setClipPanelOpen(false)
    setClipPlaneCount(0)
    setPlansPanelOpen(false)
    setActivePlanViewId(null)
    try { viewerApiRef.current?.clearMeasurements() } catch { }
    try { viewerApiRef.current?.cleanupSectionAndPlans() } catch { }
  }, [clearScene, setMeasurementPanelOpen, setActiveMeasurementTool, setClipPanelOpen, setClipPlaneCount, setPlansPanelOpen, setActivePlanViewId])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <AnimatePresence>
        {route === 'landing' && (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.35 }}
            className="absolute inset-0"
          >
            <Landing onLaunch={handleLaunch} />
          </motion.div>
        )}

        {route === 'viewer' && (
          <motion.div
            key="viewer"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-[var(--bg)] flex flex-col"
          >
            <div className="flex-none z-20">
              {/* Show the active model's name; fall back to last-loaded when only one model exists */}
              {(() => {
                const activeEntry = sceneModels.find((m) => m.id === activeModelId)
                const displayName  = activeEntry?.fileName  ?? modelInfo?.fileName   ?? null
                const displayCount = activeEntry?.elementCount ?? modelInfo?.elementCount ?? 0
                return (
                  <Toolbar
                    fileName={displayName}
                    elementCount={displayCount}
                    loadingState={loadingState}
                    canIsolate={!!selected}
                    viewerApiRef={viewerApiRef}
                    onReset={() => viewerRef.current?.resetCamera()}
                    onIsolate={handleIsolate}
                    onUpload={openUploadModal}
                    onOpenExportModal={() => setShowExportModal(true)}
                  />
                )
              })()}
            </div>

            <PanelGroup
              orientation="horizontal"
              className="flex flex-1 overflow-hidden"
              style={{ height: '100%' }}
            >

              {treeVisible && sceneModels.length > 0 && (
                <>
                  <Panel
                    id="tree"
                    defaultSize="22%"
                    minSize="13%"
                    maxSize="45%"
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="hidden md:flex flex-col h-full bg-[var(--surface)] overflow-hidden border-r border-[var(--border)]">
                      <ModelTree
                        ref={modelTreeRef}
                        onSelectElement={handleSelectTreeElement}
                        onFocusElements={handleFocusElements}
                        onFilterBySubtree={() => {
                          useValidationStore.getState().setFilters({ ruleIds: [], search: '' })
                        }}
                      />
                    </div>
                  </Panel>
                  <PanelResizeHandle
                    id="tree-resize"
                    className="hidden md:block w-[3px] bg-[var(--border)] hover:bg-[var(--accent)] active:bg-[var(--accent)] transition-colors duration-100 cursor-col-resize flex-none"
                  />
                </>
              )}

              <Panel
                id="main"
                style={{ overflow: 'hidden' }}
              >
              <div className="flex flex-col overflow-hidden relative h-full">

                <div className="flex-1 relative">
                  <Viewer
                    ref={viewerRef}
                    viewerApiRef={viewerApiRef}
                    onSelect={setSelected}
                    hiddenCategories={hidden}
                    isolatedCategory={isolated}
                    hiddenElementIds={hiddenElements}
                    selectedId={selected?.id ?? null}
                    viewerStyle={viewerStyle}
                  />

                  {mobileSidebarOpen && (
                    <div
                      className="md:hidden drawer-backdrop"
                      onClick={() => setMobileSidebarOpen(false)}
                    />
                  )}

                  {/* Camera preset overlay */}
                  {sceneModels.length > 0 && (
                    <CameraControls
                      viewerApiRef={viewerApiRef}
                      visible={cameraControlsVisible}
                      onToggle={toggleCameraControls}
                    />
                  )}

                  {/* Model info / weight panel — always shows the active model's data */}
                  {sceneModels.length > 0 && (() => {
                    const displayInfo =
                      sceneModels.find((m) => m.id === activeModelId) ?? modelInfo
                    return displayInfo ? (
                      <ModelInfoPanel
                        modelInfo={displayInfo}
                        memoryStats={memoryStats}
                        isFromCache={isFromCache}
                      />
                    ) : null
                  })()}

                  {/* Measurement panel */}
                  {sceneModels.length > 0 && (
                    <MeasurementPanel viewerApiRef={viewerApiRef} />
                  )}

                  {/* Section (clip plane) panel */}
                  {sceneModels.length > 0 && (
                    <SectionPanel viewerApiRef={viewerApiRef} />
                  )}

                  {/* Floor plan panel */}
                  {sceneModels.length > 0 && (
                    <FloorPlanPanel viewerApiRef={viewerApiRef} />
                  )}

                  {/* Scene panel (model list + transform) */}
                  {scenePanelOpen && (
                    <ScenePanel
                      models={sceneModels}
                      activeModelId={activeModelId}
                      transformMode="none"
                      viewerApiRef={viewerApiRef}
                      onSetActive={handleSetActiveModel}
                      onSetVisible={(id, v) => {
                        setSceneModelVisible(id, v)
                        viewerApiRef.current?.setModelVisible(id, v)
                      }}
                      onSetTransform={setSceneModelTransform}
                      onTransformMode={() => {}}
                      onRemove={(id) => { void handleRemoveModel(id) }}
                      onValidate={(id) => { void validation.run(undefined, id) }}
                      onFrame={(id) => { handleSetActiveModel(id); viewerApiRef.current?.frameActiveModel() }}
                      onIsolate={(id) => { handleSetActiveModel(id) }}
                      onShowAll={() => { /* visibility already restored by ScenePanel */ }}
                      onClose={() => setScenePanelOpen(false)}
                    />
                  )}

                  <Sidebar
                    categories={
                      // Use the active model's categories; fall back to last-loaded modelInfo
                      sceneModels.find((m) => m.id === activeModelId)?.categories ??
                      modelInfo?.categories ?? []
                    }
                    elementCount={
                      sceneModels.find((m) => m.id === activeModelId)?.elementCount ??
                      modelInfo?.elementCount ?? 0
                    }
                    selected={selected}
                    hidden={hidden}
                    onToggleHidden={handleToggleHidden}
                    isolated={isolated}
                    onSetIsolated={setIsolated}
                    onFrame={(id) => viewerRef.current?.frameCategory(id)}
                    onSelectElement={(id) => viewerApiRef.current?.selectElement(id)}
                    onFrameElement={handleFrameElement}
                    onRevealInTree={handleRevealInTree}
                    viewerApiRef={viewerApiRef}
                    mobileOpen={mobileSidebarOpen}
                    onMobileClose={() => setMobileSidebarOpen(false)}
                  />

                  <button
                    onClick={handleNavigateToLanding}
                    className="absolute top-3 left-3 md:left-auto md:right-[364px] z-[9] h-[30px] min-w-[30px] px-3 bg-[rgba(16,16,20,0.82)] backdrop-blur-[14px] border border-[var(--border)] rounded-lg text-[var(--text-dim)] text-[12px] font-medium flex items-center gap-1.5 hover:text-[var(--text)] transition-colors"
                  >
                    <Icons.Chevron size={12} className="rotate-180" />
                    <span className="hidden xs:inline">Home</span>
                  </button>

                  {/* Mobile FAB: toggle sidebar (only on < md) */}
                  {sceneModels.length > 0 && (
                    <button
                      onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
                      className="md:hidden absolute right-4 z-[10] w-12 h-12 rounded-full bg-[var(--accent)] shadow-[0_4px_20px_rgba(94,106,210,0.4)] flex items-center justify-center text-white"
                      style={{ bottom: `max(16px, env(safe-area-inset-bottom))` }}
                      aria-label="Toggle properties panel"
                    >
                      {mobileSidebarOpen ? (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <path d="M3 3l10 10M13 3L3 13" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                          <circle cx="8" cy="8" r="2" fill="currentColor" />
                          <path d="M2 8h2M12 8h2M8 2v2M8 12v2" strokeWidth="1.4" />
                        </svg>
                      )}
                      {/* Pulsing badge: element selected but panel is closed */}
                      {selected && !mobileSidebarOpen && (
                        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-[var(--accent)]">
                          <span className="absolute inset-0.5 rounded-full bg-[var(--accent)] animate-ping opacity-75" />
                          <span className="absolute inset-0.5 rounded-full bg-[var(--accent)]" />
                        </span>
                      )}
                    </button>
                  )}
                </div>

                <ValidationPanel onJumpToElement={handleJumpToElement} />
              </div>
              </Panel>
            </PanelGroup>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Export modal ── */}
      {showExportModal && (
        <ExportModal
          viewerApiRef={viewerApiRef}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* ── Upload modal ── */}
      <AnimatePresence>
        {showUpload && (
          <UploadOverlay
            onClose={() => setShowUpload(false)}
            onLoad={handleFileLoad}
            isLoading={loadingState === 'loading'}
            loadProgress={progress.percent}
            loadError={loadError}
            loadDone={loadingState === 'loaded'}
          />
        )}
      </AnimatePresence>

      {/* ── OPFS cache badge ── */}
      {opfsAvailable && cacheEntries.length > 0 && (
        <div
          title={`${cacheEntries.length} model(s) cached in OPFS. Click to clear all.`}
          onClick={() => { void Promise.all(cacheEntries.map((e) => deleteFromCache(e.key))) }}
          className="fixed bottom-4 left-4 z-50 px-2.5 py-1 bg-[rgba(16,16,20,0.82)] backdrop-blur border border-[var(--border)] rounded-lg text-[var(--text-dim)] text-[11px] cursor-pointer hover:text-[var(--text)] transition-colors select-none"
        >
          {isFromCache ? '⚡ from cache' : `${cacheEntries.length} cached`}
        </div>
      )}

      {/* ── Global toast notifications ── */}
      <ToastContainer />
    </>
  )
}