import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
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
import KeyboardHelpModal from './components/KeyboardHelpModal'
import SceneContextMenu, { type SceneContextMenuPayload } from './components/SceneContextMenu'
import SharedReportView, { decodeReportHash } from './components/SharedReportView'
import type { SharedReportPayload } from './components/SharedReportView'
import DemoGallery from './components/DemoGallery'
import Blog from './components/Blog'
import { DEFAULT_DEMO_MODEL, DEMO_FILENAMES, type DemoModel } from './demo-models/models'
import { fetchDemoModel } from './demo-models/fetchDemoModel'
import { lighten } from './lib/utils'
import { modelRegistry } from './lib/model-registry'
import { useIfcLoader } from './lib/loader'
import { publishAggregateResult } from './lib/validator'
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
import { useSeo } from './seo'
import {
  trackFileOpened,
  trackValidationCompleted,
  trackLandingCtaClicked,
  trackValidationPanelOpened,
  trackRouteChanged,
  trackViewerFirstInteraction,
  trackFeatureUsed,
  trackFileOpenFailed,
} from './lib/analytics'

// ── ModelTree imperative handle ───────────────────────────────────────────────
export interface ModelTreeHandle {
  revealElement: (expressId: number) => void
}

export default function App() {
  const { t: tToasts } = useTranslation('toasts')
  const { t: tCommon } = useTranslation('common')
  const { t: tViewer } = useTranslation('viewer')
  useSeo()
  const [route, setRoute] = useState<Route>(() => {
    if (typeof window !== 'undefined') {
      if (decodeReportHash(window.location.hash)) return 'report'
      const base = import.meta.env.BASE_URL ?? '/'
      const rel = window.location.pathname.replace(base.replace(/\/$/, ''), '') || '/'
      if (rel.startsWith('/blog')) return 'blog'
    }
    return 'landing'
  })

  // Blog sub-route: null = list, string = post slug
  const [blogSlug, setBlogSlug] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const base = import.meta.env.BASE_URL ?? '/'
    const rel = window.location.pathname.replace(base.replace(/\/$/, ''), '') || '/'
    const m = rel.match(/^\/blog\/([^/]+)\/?$/)
    return m ? m[1] : null
  })
  const [accent] = useState('#5E6AD2')

  // ── URL helpers for blog navigation ──────────────────────────────────────
  const blogBase = (): string => {
    const base = import.meta.env.BASE_URL ?? '/'
    return base.endsWith('/') ? `${base}blog/` : `${base}/blog/`
  }

  const handleNavigateToBlog = useCallback((): void => {
    history.pushState(null, '', blogBase())
    setRoute('blog')
    setBlogSlug(null)
  }, [])

  const handleNavigateToBlogPost = useCallback((slug: string): void => {
    history.pushState(null, '', `${blogBase()}${slug}/`)
    setBlogSlug(slug)
  }, [])

  const handleNavigateFromBlogToList = useCallback((): void => {
    history.pushState(null, '', blogBase())
    setBlogSlug(null)
  }, [])

  // ── Browser back/forward support ──────────────────────────────────────────
  useEffect(() => {
    const onPopState = (): void => {
      const base = import.meta.env.BASE_URL ?? '/'
      const rel = window.location.pathname.replace(base.replace(/\/$/, ''), '') || '/'
      if (window.location.hash && decodeReportHash(window.location.hash)) {
        setRoute('report')
      } else if (rel.startsWith('/blog')) {
        setRoute('blog')
        const m = rel.match(/^\/blog\/([^/]+)\/?$/)
        setBlogSlug(m ? m[1] : null)
      } else {
        setRoute('landing')
        setBlogSlug(null)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent)
    document.documentElement.style.setProperty('--accent-2', lighten(accent, 22))
  }, [accent])

  const viewerApiRef = useRef<ViewerAPI | null>(null)
  const viewerRef    = useRef<ViewerHandle>(null)
  const modelTreeRef = useRef<ModelTreeHandle>(null)

  const prevRouteRef               = useRef<Route>(route)
  const hasTrackedFirstInteraction = useRef(false)

  // Demo gallery overlay + a flag so analytics tags demo loads as `source: 'demo'`.
  const [showDemoGallery, setShowDemoGallery] = useState(false)
  const demoLoadRef = useRef(false)

  // ── Shared-report route — decode on mount if URL hash contains #report=... ──
  const [sharedReport, setSharedReport] = useState<SharedReportPayload | null>(() => {
    if (typeof window === 'undefined') return null
    return decodeReportHash(window.location.hash)
  })

  // Model & loading state
  const [modelInfo,    setModelInfo]    = useState<ModelInfo | null>(null)
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [loadError,    setLoadError]    = useState<string | null>(null)

  // Viewer interaction state
  const [viewerStyle] = useState<ViewerStyle>('shaded')
  const [selected,   setSelected]   = useState<SelectedInfo | null>(null)
  const [hidden,     setHidden]     = useState<Set<string>>(new Set())
  const [isolated,   setIsolated]   = useState<string | null>(null)
  // Single-element isolation (localId). Overrides category filters in the viewer.
  const [isolatedElement, setIsolatedElement] = useState<number | null>(null)
  const [showUpload, setShowUpload]           = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showHelp,   setShowHelp]             = useState(false)
  const [ctxMenu,    setCtxMenu]              = useState<SceneContextMenuPayload | null>(null)

  // Stores
  const { validationMode, result } = useValidationStore()
  const {
    treeVisible, treeWidth, hiddenElements, clearHiddenElements, setElementsVisible,
    mobileSidebarOpen, setMobileSidebarOpen,
    cameraControlsVisible, toggleCameraControls,
    scenePanelOpen, toggleScenePanel, setScenePanelOpen,
    setClipPanelOpen, setClipPlaneCount, setPlansPanelOpen,
    activePlanViewId, setActivePlanViewId,
    setMeasurementPanelOpen, setActiveMeasurementTool,
    gpuBackend, setGpuBackend,
    setValidationPanelOpen,
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

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  // Ctrl+Shift+V — validate | ? — shortcut help
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (route !== 'viewer') return
      // Don't fire shortcuts when typing in an input / textarea / contenteditable
      const target = e.target as HTMLElement
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.shiftKey && e.key === 'V') {
        e.preventDefault()
        if (!validation.isRunning && validation.canRun) {
          void validation.runAll(undefined, true)
        }
      }

      if (e.key === '?' && !inInput && !mod) {
        e.preventDefault()
        setShowHelp((v) => !v)
      }

      // ── Element control shortcuts (no modifier, not while typing) ──────────
      // Use viewerApiRef / store setters directly (both declared above) so this
      // effect needn't depend on handlers defined later in the component.
      if (!inInput && !mod) {
        const key = e.key.toLowerCase()

        // F — frame/zoom to the selected element
        if (key === 'f' && selected) {
          e.preventDefault()
          viewerApiRef.current?.focusElement(parseInt(selected.id, 10), selected.modelId)
        }

        // H — hide selected element · Shift+H — restore full visibility
        if (key === 'h') {
          if (e.shiftKey) {
            if (hiddenElements.size > 0 || isolatedElement != null || isolated != null) {
              e.preventDefault()
              clearHiddenElements()
              setIsolatedElement(null)
              setIsolated(null)
            }
          } else if (selected) {
            e.preventDefault()
            setElementsVisible([parseInt(selected.id, 10)], false)
          }
        }

        // I — isolate selected element (toggle): show only it, hide everything else
        if (key === 'i' && selected) {
          e.preventDefault()
          const id = parseInt(selected.id, 10)
          setIsolatedElement((cur) => (cur === id ? null : id))
          setIsolated(null)
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, validation.isRunning, validation.canRun, selected, hiddenElements, isolatedElement, isolated, clearHiddenElements, setElementsVisible])

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
      setValidationPanelOpen(true)
      trackValidationPanelOpened({ trigger: 'auto' })

      // Track when a second (or later) model is loaded into the scene
      if (useSceneStore.getState().models.length > 0) {
        trackFeatureUsed({ feature: 'multi_model' })
      }

      // Use the stable sceneModelId from the viewer so ScenePanel and multi-model code align
      addSceneModel(modelId, info)

      // Analytics: a demo load sets demoLoadRef; otherwise treat known demo
      // filenames as demo too (covers cached repeat loads), else it's an upload.
      const isDemo = demoLoadRef.current || DEMO_FILENAMES.has(info.fileName)
      demoLoadRef.current = false
      trackFileOpened({
        file_size_mb:  Math.round((info.fileSize / 1_048_576) * 10) / 10,
        element_count: info.elementCount,
        source:        isDemo ? 'demo' : 'upload',
        from_cache:    fromCache,
      })

      console.info(
        `[IFC] Loaded "${info.fileName}" (${info.elementCount} elements, id: ${modelId})` +
        (fromCache ? ' — from cache ⚡' : ' — parsed fresh'),
      )
      toast(
        fromCache
          ? tToasts('model.loadedFromCache', { fileName: info.fileName, count: info.elementCount })
          : tToasts('model.loaded', { fileName: info.fileName, count: info.elementCount }),
        'success',
      )
      void validation.run(undefined, modelId)
    },
    onError: (msg) => {
      console.error('[IFC] Load error:', msg)
      setLoadingState('error')
      setLoadError(msg)
      trackFileOpenFailed({ error_msg: msg.slice(0, 200) })
    },
  })

  // ── Sync validation overlay with viewer ───────────────────────────────────

  useEffect(() => {
    const issues = result?.issues ?? []
    viewerApiRef.current?.setValidationHighlights(issues, validationMode)
  }, [validationMode, result])

  // ── Analytics: track each completed validation run ────────────────────────
  const prevResultRef = useRef<typeof result>(null)
  useEffect(() => {
    if (!result || result === prevResultRef.current) return
    prevResultRef.current = result
    const topRule = Object.entries(result.stats.byRule ?? {})
      .sort(([, a], [, b]) => b - a)[0]?.[0] ?? null
    trackValidationCompleted({
      error_count:   result.stats.errors,
      warning_count: result.stats.warnings,
      info_count:    result.stats.info,
      quality_score: result.qualityScore ?? 0,
      duration_ms:   result.durationMs,
      top_rule:      topRule,
    })
  }, [result])

  // ── Analytics: SPA route transitions (virtual pageviews) ─────────────────
  useEffect(() => {
    const from = prevRouteRef.current
    prevRouteRef.current = route
    if (route === from) return
    // Only track transitions TO viewer/report — initial landing is captured by PostHog's pageview
    if (route === 'viewer' || route === 'report') {
      trackRouteChanged({ to: route, from })
    }
  }, [route])

  // ── Analytics: first element selected in 3D (session-once) ───────────────
  useEffect(() => {
    if (selected && !hasTrackedFirstInteraction.current) {
      hasTrackedFirstInteraction.current = true
      trackViewerFirstInteraction()
    }
  }, [selected])

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

  // ── Track desktop breakpoint so tree Panel is never rendered on mobile ──
  // react-resizable-panels allocates the Panel's flex share even when its
  // inner content is hidden, so we must not mount the Panel at all on mobile.
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = (e: MediaQueryListEvent): void => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    setIsDesktop(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // ── Detect WebGPU availability ────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      try {
        if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
          const adapter = await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter()
          setGpuBackend(adapter ? 'webgpu' : 'webgl')
        } else {
          setGpuBackend('webgl')
        }
      } catch {
        setGpuBackend('webgl')
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // "Open an IFC file" CTA — go to viewer and immediately show the upload overlay
  // so the user can pick their own file instead of the demo being auto-loaded.
  const handleOpenUpload = (): void => {
    trackLandingCtaClicked({ variant: 'open_file' })
    setRoute('viewer')
    setShowUpload(true)
  }

  // Quick "Load demo model" path — loads the default curated model (bundled,
  // offline-safe, with a raw-host fallback) without opening the gallery.
  const handleLaunch = (): void => {
    trackLandingCtaClicked({ variant: 'load_demo' })
    setRoute('viewer')
    void (async () => {
      try {
        const file = await fetchDemoModel(DEFAULT_DEMO_MODEL)
        demoLoadRef.current = true
        handleFileLoad(file)
      } catch (err: unknown) {
        console.warn('[App] Demo file unavailable:', err)
        toast(tToasts('model.demoUnavailable'), 'warning')
        setShowUpload(true)
      }
    })()
  }

  // Opens the demo gallery from anywhere (toolbar, upload overlay, …). Closes the
  // upload overlay first so the gallery isn't hidden behind it.
  const openDemoGallery = useCallback((): void => {
    setShowUpload(false)
    setShowDemoGallery(true)
  }, [])

  // Landing CTA opener — same as above plus the landing analytics event.
  const handleOpenDemoGallery = (): void => {
    trackLandingCtaClicked({ variant: 'load_demo' })
    openDemoGallery()
  }

  // The gallery already downloaded the chosen model into a File — switch to the
  // viewer and run the normal load pipeline (which handles OPFS caching/parse).
  const handleDemoModelReady = (_model: DemoModel, file: File): void => {
    setShowDemoGallery(false)
    demoLoadRef.current = true
    setRoute('viewer')
    handleFileLoad(file)
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
      setIsolatedElement(null)
      setIsolated(selected.type)
      viewerRef.current?.frameCategory(selected.type)
    }
  }

  // Isolate a specific category by type (used by the 3D context menu).
  const handleIsolateCategory = useCallback((type: string): void => {
    if (isolated === type) {
      setIsolated(null)
    } else {
      setIsolatedElement(null)
      setIsolated(type)
      viewerRef.current?.frameCategory(type)
    }
  }, [isolated])

  // Category isolation from the tree / category panel — clears any element isolation.
  const handleSetIsolatedCategory = useCallback((type: string | null): void => {
    if (type) setIsolatedElement(null)
    setIsolated(type)
  }, [])

  // Hide a single element in the 3D scene (context menu + keyboard).
  const handleHideElement = useCallback((expressId: number): void => {
    setElementsVisible([expressId], false)
  }, [setElementsVisible])

  // Isolate a single element (toggle): show only it. Used by context menu + keyboard.
  const handleIsolateElement = useCallback((expressId: number): void => {
    setIsolatedElement((cur) => (cur === expressId ? null : expressId))
    setIsolated(null)
  }, [])

  // Restore full visibility: clear hidden elements + element/category isolation.
  const handleRestoreVisibility = useCallback((): void => {
    clearHiddenElements()
    setIsolatedElement(null)
    setIsolated(null)
  }, [clearHiddenElements])

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
      // Recompose the displayed validation result so the removed model's issues
      // drop out (and the panel clears if no validated models remain).
      publishAggregateResult()
      // Clear selection if the removed model owned the currently selected element
      setSelected((prev) => (prev?.modelId === id ? null : prev))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[App] Failed to remove model:', msg)
      toast(tToasts('model.removeFailed', { message: msg }), 'error')
    }
  }, [removeSceneModel, activePlanViewId, setActivePlanViewId])

  // ── Navigate back to landing — reset all model/editor/validation state ────
  const handleNavigateToLanding = useCallback((): void => {
    const base = import.meta.env.BASE_URL ?? '/'
    if (window.location.pathname !== base && window.location.pathname !== base.replace(/\/$/, '')) {
      history.pushState(null, '', base)
    }
    setRoute('landing')
    setBlogSlug(null)
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
        {/* ── Shared report view (URL hash route) ── */}
        {route === 'report' && sharedReport && (
          <motion.div
            key="report"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 overflow-y-auto"
          >
            <SharedReportView
              payload={sharedReport}
              onOpenViewer={() => {
                // Strip the report hash and navigate to landing
                history.replaceState(null, '', window.location.pathname + window.location.search)
                setSharedReport(null)
                setRoute('landing')
              }}
            />
          </motion.div>
        )}

        {route === 'landing' && (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.35 }}
            className="absolute inset-0"
          >
            <Landing
              onLaunch={handleLaunch}
              onOpenUpload={handleOpenUpload}
              onOpenDemoGallery={handleOpenDemoGallery}
              onNavigateToBlog={handleNavigateToBlog}
            />
          </motion.div>
        )}

        {route === 'blog' && (
          <motion.div
            key="blog"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 overflow-y-auto"
          >
            <Blog
              slug={blogSlug}
              onNavigateToPost={handleNavigateToBlogPost}
              onNavigateToBlog={handleNavigateFromBlogToList}
              onNavigateToLanding={handleNavigateToLanding}
            />
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
                    onOpenDemoGallery={openDemoGallery}
                    onOpenExportModal={() => setShowExportModal(true)}
                    onOpenHelp={() => setShowHelp(true)}
                  />
                )
              })()}
            </div>

            <PanelGroup
              orientation="horizontal"
              className="flex flex-1 overflow-hidden"
              style={{ height: '100%' }}
            >

              {/* Tree panel: only mounted on desktop — react-resizable-panels
                  allocates the Panel's flex share even when content is hidden,
                  so mounting it on mobile would shrink the canvas by 22%. */}
              {treeVisible && sceneModels.length > 0 && isDesktop && (
                <>
                  <Panel
                    id="tree"
                    defaultSize="22%"
                    minSize="13%"
                    maxSize="45%"
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="flex flex-col h-full bg-[var(--surface)] overflow-hidden border-r border-[var(--border)]">
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
                    className="w-[3px] bg-[var(--border)] hover:bg-[var(--accent)] active:bg-[var(--accent)] transition-colors duration-100 cursor-col-resize flex-none"
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
                    onContextMenu={setCtxMenu}
                    hiddenCategories={hidden}
                    isolatedCategory={isolated}
                    hiddenElementIds={hiddenElements}
                    isolatedElementId={isolatedElement}
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
                        qualityScore={result?.qualityScore}
                        gpuBackend={gpuBackend}
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
                      onValidate={(id) => { void validation.run(undefined, id, true) }}
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
                    onSetIsolated={handleSetIsolatedCategory}
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
                    className="absolute top-3 left-3 z-[9] h-[30px] min-w-[30px] px-3 bg-[rgba(16,16,20,0.82)] backdrop-blur-[14px] border border-[var(--border)] rounded-lg text-[var(--text-dim)] text-[12px] font-medium flex items-center gap-1.5 hover:text-[var(--text)] transition-colors"
                  >
                    <Icons.Chevron size={12} className="rotate-180" />
                    <span className="hidden xs:inline">{tCommon('actions.home')}</span>
                  </button>

                  {/* ── Mobile FAB cluster (only on < md) ── */}
                  {sceneModels.length > 0 && (
                    <div
                      className="md:hidden absolute right-4 z-[10] flex flex-col items-center gap-2.5"
                      style={{ bottom: `max(16px, env(safe-area-inset-bottom))` }}
                    >
                      {/* Properties panel toggle */}
                      <button
                        onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
                        className="w-12 h-12 rounded-full bg-[var(--accent)] shadow-[0_4px_20px_rgba(94,106,210,0.35)] flex items-center justify-center text-white active:scale-95 transition-transform"
                        aria-label={tViewer('cache.togglePanel')}
                      >
                        {mobileSidebarOpen ? (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                            <path d="M3 3l10 10M13 3L3 13" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                            <path d="M2 5h12M2 8h9M2 11h6" />
                          </svg>
                        )}
                        {/* Badge: element selected but panel is closed */}
                        {selected && !mobileSidebarOpen && (
                          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-[var(--accent)]">
                            <span className="absolute inset-0.5 rounded-full bg-[var(--accent)] animate-ping opacity-75" />
                            <span className="absolute inset-0.5 rounded-full bg-[var(--accent)]" />
                          </span>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                <ValidationPanel onJumpToElement={handleJumpToElement} viewer={viewerRef.current} />
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

      {/* ── Keyboard help modal ── */}
      <KeyboardHelpModal open={showHelp} onClose={() => setShowHelp(false)} />

      {/* ── Demo model gallery ── */}
      <DemoGallery
        open={showDemoGallery}
        onClose={() => setShowDemoGallery(false)}
        onModelReady={handleDemoModelReady}
      />

      {/* ── 3D scene context menu (right-click on an element) ── */}
      <SceneContextMenu
        payload={ctxMenu}
        onClose={() => setCtxMenu(null)}
        onFrame={handleFrameElement}
        onHide={handleHideElement}
        onIsolateElement={handleIsolateElement}
        onIsolateCategory={handleIsolateCategory}
        onReveal={handleRevealInTree}
        hiddenCount={hiddenElements.size}
        isolationActive={isolatedElement != null}
        onShowAllHidden={handleRestoreVisibility}
      />

      {/* ── Upload modal ── */}
      <AnimatePresence>
        {showUpload && (
          <UploadOverlay
            onClose={() => setShowUpload(false)}
            onLoad={handleFileLoad}
            onOpenDemoGallery={openDemoGallery}
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
          title={tViewer('cache.tooltip', { count: cacheEntries.length })}
          onClick={() => { void Promise.all(cacheEntries.map((e) => deleteFromCache(e.key))) }}
          className="fixed left-4 z-50 px-2.5 py-1 bg-[rgba(16,16,20,0.82)] backdrop-blur border border-[var(--border)] rounded-lg text-[var(--text-dim)] text-[11px] cursor-pointer hover:text-[var(--text)] transition-colors select-none"
          style={{ bottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          {isFromCache ? tViewer('cache.fromCache') : tViewer('cache.cached', { count: cacheEntries.length })}
        </div>
      )}

      {/* ── Global toast notifications ── */}
      <ToastContainer />
    </>
  )
}