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
  const [modelInfo,    setModelInfo]    = useState<ModelInfo | null>(null)
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [loadError,    setLoadError]    = useState<string | null>(null)

  // Viewer interaction state
  const [viewerStyle] = useState<ViewerStyle>('shaded')
  const [selected,   setSelected]   = useState<SelectedInfo | null>(null)
  const [hidden,     setHidden]     = useState<Set<string>>(new Set())
  const [isolated,   setIsolated]   = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  // Stores
  const { validationMode, result } = useValidationStore()
  const {
    treeVisible, treeWidth, hiddenElements, clearHiddenElements,
    mobileSidebarOpen, setMobileSidebarOpen,
  } = useUIStore()

  // Undo/redo keyboard shortcuts
  useEditorHistory()

  // ── Loading pipeline ──────────────────────────────────────────────────────

  const {
    loadFile,
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
      // No auto-close here — UploadOverlay closes itself via SuccessView
      // when the user clicks "Open viewer →", triggered by loadDone prop.
      runValidation().catch((err: unknown) => {
        console.error('[App] Validation failed:', err)
      })
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
    setModelInfo(null)
    setSelected(null)
    setHidden(new Set())
    setIsolated(null)
    clearHiddenElements()
    setRoute('viewer')
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
                  className="hidden md:flex flex-none bg-[var(--surface)] flex-col overflow-hidden border-r border-[var(--border)]"
                  style={{ width: treeWidth, maxWidth: '38vw', minWidth: 220 }}
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

                  {mobileSidebarOpen && (
                    <div
                      className="md:hidden drawer-backdrop"
                      onClick={() => setMobileSidebarOpen(false)}
                    />
                  )}

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
                    mobileOpen={mobileSidebarOpen}
                    onMobileClose={() => setMobileSidebarOpen(false)}
                  />

                  <button
                    onClick={() => setRoute('landing')}
                    className="absolute top-3 left-3 md:left-auto md:right-[364px] z-[9] h-[30px] min-w-[30px] px-3 bg-[rgba(16,16,20,0.82)] backdrop-blur-[14px] border border-[var(--border)] rounded-lg text-[var(--text-dim)] text-[12px] font-medium flex items-center gap-1.5 hover:text-[var(--text)] transition-colors"
                  >
                    <Icons.Chevron size={12} className="rotate-180" />
                    <span className="hidden xs:inline">Home</span>
                  </button>

                  {/* Mobile FAB: toggle sidebar (only on < md) */}
                  {modelInfo && (
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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