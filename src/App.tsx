import React, { useState, useRef, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Viewer from './components/Viewer'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import UploadOverlay from './components/UploadOverlay'
import Landing from './components/Landing'
import ModelTree from './components/ModelTree'
import ValidationPanel from './components/ValidationPanel'
import ToastContainer from './components/ToastContainer'
import { lighten } from './lib/utils'
import { useIfcLoader } from './lib/loader'
import { runValidation } from './lib/validator'
import { useEditorHistory } from './hooks/useEditorHistory'
import { useValidationStore } from './stores/validationStore'
import { useUIStore } from './stores/uiStore'
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
  const [modelInfo,     setModelInfo]     = useState<ModelInfo | null>(null)
  const [loadingState,  setLoadingState]  = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  /** Last error message from the loader — displayed inside the upload modal. */
  const [loadError,     setLoadError]     = useState<string | null>(null)

  // Viewer interaction state
  const [viewerStyle] = useState<ViewerStyle>('shaded')
  const [selected,  setSelected]  = useState<SelectedInfo | null>(null)
  const [hidden,    setHidden]    = useState<Set<string>>(new Set())
  const [isolated,  setIsolated]  = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  // Stores
  const { validationMode, result } = useValidationStore()
  const { treeVisible, treeWidth, hiddenElements, clearHiddenElements } = useUIStore()

  // Undo/redo keyboard shortcuts
  useEditorHistory()

  // ── Loading pipeline ──────────────────────────────────────────────────────

  const {
    loadFile,
    resetProgress,
    progress,
    cacheEntries,
    deleteFromCache,
    isFromCache,
    opfsAvailable,
  } = useIfcLoader({
    viewerApiRef,
    onModelLoaded: (info, fromCache) => {
      setModelInfo(info)
      setLoadingState('loaded')
      setLoadError(null)
      console.info(
        `[IFC] Loaded "${info.fileName}" (${info.elementCount} elements)` +
        (fromCache ? ' — from cache ⚡' : ' — parsed fresh'),
      )
      toast(
        `"${info.fileName}" loaded — ${info.elementCount.toLocaleString()} elements` +
        (fromCache ? ' (from cache ⚡)' : ''),
        'success',
      )
      // Auto-close modal after a short "Model ready" display
      setTimeout(() => setShowUpload(false), 400)
      // Kick off validation asynchronously — errors are non-blocking.
      // validator.ts already shows a toast for validation errors, so we only
      // log here to avoid showing a duplicate notification.
      runValidation().catch((err: unknown) => {
        console.error('[App] Validation failed:', err)
      })
    },
    onError: (msg) => {
      console.error('[IFC] Load error:', msg)
      setLoadingState('error')
      setLoadError(msg)
      // toast() is already called inside loader.ts for every error path,
      // so we don't duplicate here.
    },
  })

  // ── Sync validation overlay with viewer ───────────────────────────────────

  useEffect(() => {
    const issues = result?.issues ?? []
    viewerApiRef.current?.setValidationHighlights(issues, validationMode)
  }, [validationMode, result])

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleFileLoad = (file: File): void => {
    setLoadingState('loading')
    setLoadError(null)
    setModelInfo(null)
    setSelected(null)
    setHidden(new Set())
    setIsolated(null)
    clearHiddenElements()
    setRoute('viewer')
    void loadFile(file)
  }

  /** Open the upload modal — always reset progress so we never show a stale
   *  "Model ready" screen from a previous successful load. */
  const openUploadModal = useCallback((): void => {
    if (loadingState === 'loading') return   // guard: don't interrupt active load
    resetProgress()
    setLoadError(null)
    setShowUpload(true)
  }, [loadingState, resetProgress])

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

  const handleJumpToElement = useCallback((expressId: number) => {
    viewerApiRef.current?.focusElement(expressId)
    viewerApiRef.current?.selectElement(expressId)
  }, [])

  const handleSelectTreeElement = useCallback((expressId: number) => {
    viewerApiRef.current?.selectElement(expressId)
  }, [])

  const handleFocusElements = useCallback((ids: number[]) => {
    viewerApiRef.current?.frameElements(ids)
  }, [])

  const handleFrameElement = useCallback((expressId: number) => {
    viewerApiRef.current?.focusElement(expressId)
    viewerApiRef.current?.selectElement(expressId)
  }, [])

  const handleRevealInTree = useCallback((expressId: number) => {
    if (!useUIStore.getState().treeVisible) {
      useUIStore.getState().setTreeVisible(true)
    }
    setTimeout(() => {
      modelTreeRef.current?.revealElement(expressId)
    }, 80)
  }, [])

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
              <Toolbar
                fileName={modelInfo?.fileName ?? null}
                elementCount={modelInfo?.elementCount ?? 0}
                loadingState={loadingState}
                canIsolate={!!selected}
                onReset={() => viewerRef.current?.resetCamera()}
                onIsolate={handleIsolate}
                onUpload={openUploadModal}
              />
            </div>

            <div className="flex flex-1 overflow-hidden">

              {treeVisible && modelInfo && (
                <div
                  className="flex-none bg-[var(--surface)] flex flex-col overflow-hidden border-r border-[var(--border)]"
                  style={{ width: treeWidth, maxWidth: '38vw', minWidth: 180 }}
                >
                  <ModelTree
                    ref={modelTreeRef}
                    onSelectElement={handleSelectTreeElement}
                    onFocusElements={handleFocusElements}
                    onFilterBySubtree={() => {
                      useValidationStore.getState().setFilters({ ruleIds: [], search: '' })
                    }}
                  />
                </div>
              )}

              <div className="flex-1 flex flex-col overflow-hidden relative">

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

                  <Sidebar
                    categories={modelInfo?.categories ?? []}
                    elementCount={modelInfo?.elementCount ?? 0}
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
                  />

                  <button
                    onClick={() => setRoute('landing')}
                    className="absolute top-3 right-[364px] z-[9] h-[30px] px-3 bg-[rgba(16,16,20,0.82)] backdrop-blur-[14px] border border-[var(--border)] rounded-lg text-[var(--text-dim)] text-[12px] font-medium flex items-center gap-1.5 hover:text-[var(--text)] transition-colors"
                  >
                    <Icons.Chevron size={12} className="rotate-180" />
                    Home
                  </button>
                </div>

                <ValidationPanel onJumpToElement={handleJumpToElement} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Upload modal ── */}
      <AnimatePresence>
        {showUpload && (
          <UploadOverlay
            onClose={() => { if (loadingState !== 'loading') setShowUpload(false) }}
            onLoad={handleFileLoad}
            isLoading={loadingState === 'loading'}
            loadProgress={progress.percent}
            loadError={loadError}
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
