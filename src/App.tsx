import React, { useState, useRef, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Viewer from './components/Viewer'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import UploadOverlay from './components/UploadOverlay'
import Landing from './components/Landing'
import ModelTree from './components/ModelTree'
import ValidationPanel from './components/ValidationPanel'
import { lighten } from './lib/utils'
import { useIfcLoader } from './lib/loader'
import { runValidation } from './lib/validator'
import { useEditorHistory } from './hooks/useEditorHistory'
import { useValidationStore } from './stores/validationStore'
import { useUIStore } from './stores/uiStore'
import type { ViewerAPI } from './lib/viewer'
import type { Route, ViewerStyle, SelectedInfo, ViewerHandle, ModelInfo } from './types'
import * as Icons from './components/Icons'

export default function App() {
  const [route, setRoute] = useState<Route>('landing')
  const [accent] = useState('#5E6AD2')

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent)
    document.documentElement.style.setProperty('--accent-2', lighten(accent, 22))
  }, [accent])

  const viewerApiRef = useRef<ViewerAPI | null>(null)
  const viewerRef    = useRef<ViewerHandle>(null)

  // Model & loading state
  const [modelInfo, setModelInfo]       = useState<ModelInfo | null>(null)
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')

  // Viewer interaction state
  const [viewerStyle] = useState<ViewerStyle>('shaded')
  const [selected, setSelected]     = useState<SelectedInfo | null>(null)
  const [hidden, setHidden]         = useState<Set<string>>(new Set())
  const [isolated, setIsolated]     = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  // Stores
  const { validationMode, result } = useValidationStore()
  const { treeVisible, treeWidth, hiddenElements, clearHiddenElements } = useUIStore()

  // Undo/redo keyboard shortcuts
  useEditorHistory()

  // ── Loading pipeline ──────────────────────────────────────────────────

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
      console.info(
        `[IFC] Loaded "${info.fileName}" (${info.elementCount} elements)` +
        (fromCache ? ' — from cache ⚡' : ' — parsed fresh'),
      )
      setTimeout(() => setShowUpload(false), 400)
      // Auto-build spatial tree (arrives as first worker message, fast)
      runValidation().catch((err: unknown) => {
        console.error('[App] Validation failed:', err)
      })
    },
    onError: (msg) => {
      console.error('[IFC] Load error:', msg)
      setLoadingState('error')
    },
  })

  // ── Sync validation overlay with viewer ───────────────────────────────

  useEffect(() => {
    const issues = result?.issues ?? []
    viewerApiRef.current?.setValidationHighlights(issues, validationMode)
  }, [validationMode, result])

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleFileLoad = (file: File): void => {
    setLoadingState('loading')
    setModelInfo(null)
    setSelected(null)
    setHidden(new Set())
    setIsolated(null)
    clearHiddenElements()
    setRoute('viewer')
    void loadFile(file)
  }

  const handleLaunch = (): void => {
    setRoute('viewer')
    void (async () => {
      try {
        const res  = await fetch('/Ifc2x3_Duplex_Architecture.ifc')
        const buf  = await res.arrayBuffer()
        const file = new File([buf], 'Ifc2x3_Duplex_Architecture.ifc', { type: '' })
        handleFileLoad(file)
      } catch {
        // Fetch failed — fall back to upload dialog
        setShowUpload(true)
      }
    })()
  }

  const handleToggleHidden = (id: string): void => {
    setHidden((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const handleIsolate = (): void => {
    if (selected) { setIsolated(selected.type); viewerRef.current?.frameCategory(selected.type) }
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
            {/* ── Top toolbar (absolute overlay) ── */}
            <Toolbar
              fileName={modelInfo?.fileName ?? null}
              elementCount={modelInfo?.elementCount ?? 0}
              loadingState={loadingState}
              canIsolate={!!selected}
              onReset={() => viewerRef.current?.resetCamera()}
              onIsolate={handleIsolate}
              onUpload={() => setShowUpload(true)}
            />

            {/* ── Main content area (below toolbar overlap zone) ── */}
            <div className="flex flex-1 overflow-hidden">

              {/* LEFT: Spatial tree panel */}
              {treeVisible && modelInfo && (
                <div
                  className="flex-none border-r border-[var(--border)] bg-[var(--surface)] flex flex-col overflow-hidden"
                  style={{ width: treeWidth, maxWidth: '38vw', minWidth: 180 }}
                >
                  <ModelTree
                    onSelectElement={handleSelectTreeElement}
                    onFocusElements={handleFocusElements}
                    onFilterBySubtree={(ids) => {
                      useValidationStore.getState().setFilters({
                        ruleIds: [],
                        search: '',
                      })
                    }}
                  />
                </div>
              )}

              {/* CENTER + BOTTOM: Viewer + Validation panel */}
              <div className="flex-1 flex flex-col overflow-hidden relative">

                {/* 3D viewer — fills remaining space */}
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

                  {/* Sidebar (floating panel on right) */}
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
                  />

                  {/* Back to landing */}
                  <button
                    onClick={() => setRoute('landing')}
                    className="absolute top-[68px] right-[364px] z-[9] h-[30px] px-3 bg-[rgba(16,16,20,0.82)] backdrop-blur-[14px] border border-[var(--border)] rounded-lg text-[var(--text-dim)] text-[12px] font-medium flex items-center gap-1.5 hover:text-[var(--text)] transition-colors"
                  >
                    <Icons.Chevron size={12} className="rotate-180" />
                    Home
                  </button>
                </div>

                {/* BOTTOM: Validation panel */}
                <ValidationPanel onJumpToElement={handleJumpToElement} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload modal */}
      <AnimatePresence>
        {showUpload && (
          <UploadOverlay
            onClose={() => { if (loadingState !== 'loading') setShowUpload(false) }}
            onLoad={handleFileLoad}
            isLoading={loadingState === 'loading'}
            loadProgress={progress.percent}
          />
        )}
      </AnimatePresence>

      {/* Cache status badge */}
      {opfsAvailable && cacheEntries.length > 0 && (
        <div
          title={`${cacheEntries.length} model(s) cached in OPFS. Click to clear all.`}
          onClick={() => { void Promise.all(cacheEntries.map((e) => deleteFromCache(e.key))) }}
          className="fixed bottom-4 left-4 z-50 px-2.5 py-1 bg-[rgba(16,16,20,0.82)] backdrop-blur border border-[var(--border)] rounded-lg text-[var(--text-dim)] text-[11px] cursor-pointer hover:text-[var(--text)] transition-colors select-none"
        >
          {isFromCache ? '⚡ from cache' : `${cacheEntries.length} cached`}
        </div>
      )}
    </>
  )
}
