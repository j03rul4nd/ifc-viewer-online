// ─── EmbedViewer.tsx ──────────────────────────────────────────────────────────
// Self-contained, embeddable IFC 3D viewer for blog posts and landing pages.
//
// Features
//  · Lazy loading via IntersectionObserver (200 px look-ahead)
//  · Viewer WebGL context created only when visible — avoids context limit
//  · Static preview image + progress bar while loading
//  · Category toggles (show/hide walls, doors, windows…)
//  · Click-to-inspect: name, IFC class, storey in floating panel
//  · Fullscreen mode (Web Fullscreen API)
//  · Reset camera button
//  · Comparison variant: two viewers side-by-side
//
// Usage
//  <EmbedViewer modelId="duplex-architecture" title="Duplex Apartment" />
//  <EmbedViewer modelUrl="https://..." fileName="building.ifc" height={560} variant="hero" />
//  <ComparisonViewer
//    left={{ modelId: 'model-a', label: 'Architecture' }}
//    right={{ modelId: 'model-b', label: 'Structure' }}
//  />

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createViewer, type ViewerAPI } from '../../lib/viewer'
import { loadIfcForEmbed } from '../../lib/embed-loader'
import { DEMO_MODELS } from '../../demo-models/models'
import EmbedModal from '../EmbedModal'
import type { Category, SelectedInfo } from '../../types'

// ── Constants ──────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL as string

const CAT_ICONS: Record<string, string> = {
  IFCWALL:               '🧱',
  IFCWALLSTANDARDCASE:   '🧱',
  IFCSLAB:               '⬛',
  IFCSLABSTANDARDCASE:   '⬛',
  IFCDOOR:               '🚪',
  IFCWINDOW:             '🪟',
  IFCROOF:               '🏠',
  IFCROOFING:            '🏠',
  IFCCOLUMN:             '🏛',
  IFCCOLUMNSTANDARDCASE: '🏛',
  IFCBEAM:               '—',
  IFCBEAMSTANDARDCASE:   '—',
  IFCSTAIR:              '🪜',
  IFCSTAIRFLIGHT:        '🪜',
  IFCSPACE:              '◻',
  IFCFURNISHINGELEMENT:  '🪑',
  IFCFLOWSEGMENT:        '⚙',
  IFCPIPESEGMENT:        '⚙',
  IFCDUCTSEGMENT:        '⚙',
  IFCRAILING:            '|',
}

// Deduplicate categories by display label, preferring the one with more elements.
function dedupeByLabel(cats: Category[]): Category[] {
  const map = new Map<string, Category>()
  for (const cat of cats) {
    const existing = map.get(cat.label)
    if (!existing || cat.count > existing.count) map.set(cat.label, cat)
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type EmbedVariant = 'inline' | 'hero'

export interface EmbedViewerProps {
  /** ID from DEMO_MODELS, e.g. 'duplex-architecture'. Overridden by modelUrl. */
  modelId?: string
  /** Direct URL to a public IFC file. */
  modelUrl?: string
  /** Filename hint — required when using modelUrl. Falls back to id.ifc. */
  fileName?: string
  title?: string
  description?: string
  /** Show element info panel on click. Default true. */
  showProperties?: boolean
  /** Enable the fullscreen button. Default true. */
  allowFullscreen?: boolean
  /** Height in pixels. Default 440 for inline, 580 for hero. */
  height?: number
  /** Override the preview placeholder image URL. */
  previewImage?: string
  variant?: EmbedVariant
}

// ── Phase state ────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'loading' | 'ready' | 'error'

// ── OrbitHint ──────────────────────────────────────────────────────────────────

function OrbitHint() {
  const [show, setShow] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 3200)
    return () => clearTimeout(t)
  }, [])
  return (
    <div
      className="absolute bottom-12 left-1/2 -translate-x-1/2 pointer-events-none"
      style={{ opacity: show ? 0.75 : 0, transition: 'opacity 0.8s ease' }}
      aria-hidden="true"
    >
      <div className="px-3 py-1.5 rounded-full bg-[rgba(0,0,0,0.65)] backdrop-blur-sm border border-[rgba(255,255,255,0.12)]">
        <span className="text-[10.5px] font-mono text-white tracking-wide">
          Drag to orbit · Scroll to zoom · Click to inspect
        </span>
      </div>
    </div>
  )
}

// ── EmbedViewer ────────────────────────────────────────────────────────────────

export default function EmbedViewer({
  modelId,
  modelUrl,
  fileName,
  title,
  description,
  showProperties = true,
  allowFullscreen = true,
  height,
  previewImage,
  variant = 'inline',
}: EmbedViewerProps) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mountRef      = useRef<HTMLDivElement>(null)
  const apiRef        = useRef<ViewerAPI | null>(null)
  const abortRef      = useRef<AbortController | null>(null)
  const loadStarted   = useRef(false)

  const [phase,        setPhase]        = useState<Phase>('idle')
  const [pct,          setPct]          = useState(0)
  const [phaseLabel,   setPhaseLabel]   = useState('')
  const [categories,   setCategories]   = useState<Category[]>([])
  const [hiddenIds,    setHiddenIds]    = useState<Set<string>>(new Set())
  const [selected,     setSelected]     = useState<SelectedInfo | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [errorMsg,     setErrorMsg]     = useState('')
  const [showEmbed,    setShowEmbed]    = useState(false)

  // ── Resolve model info from registry or props ─────────────────────────────
  const demo          = modelId ? DEMO_MODELS.find(m => m.id === modelId) : undefined
  const resolvedUrl   = modelUrl ?? demo?.ifcUrl ?? null
  const resolvedName  = fileName ?? demo?.fileName ?? (modelId ? `${modelId}.ifc` : 'model.ifc')
  const fallbackImg   = previewImage ?? demo?.thumbnail ?? `${BASE}Renderizado_3D_detallado_de_edificio_modular.png`
  const defaultHeight = variant === 'hero' ? 580 : 440
  const viewerHeight  = height ?? defaultHeight

  // ── Viewer init — lazy, only when visible ─────────────────────────────────
  const initViewer = useCallback((): ViewerAPI | null => {
    if (apiRef.current) return apiRef.current
    const mount = mountRef.current
    if (!mount) return null
    const api = createViewer(mount)
    api.setSelectCallback((info) => setSelected(info))
    apiRef.current = api
    return api
  }, [])

  // ── Model loading ──────────────────────────────────────────────────────────
  const startLoad = useCallback(async () => {
    if (!resolvedUrl || loadStarted.current) return
    loadStarted.current = true

    const api = initViewer()
    if (!api) return

    setPhase('loading')
    setPct(0)
    setErrorMsg('')

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const result = await loadIfcForEmbed(
        resolvedUrl,
        resolvedName,
        api,
        abort.signal,
        (loadPhase, progress) => {
          setPct(progress)
          setPhaseLabel(
            loadPhase === 'downloading' ? 'Downloading model…' :
            loadPhase === 'parsing'     ? 'Parsing IFC…'       :
                                         'Building scene…',
          )
        },
      )

      setCategories(dedupeByLabel(result.categories))
      setPhase('ready')
    } catch (err) {
      if (abort.signal.aborted) return
      loadStarted.current = false
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load model')
      setPhase('error')
    }
  }, [resolvedUrl, resolvedName, initViewer])

  // ── IntersectionObserver: fire startLoad when viewer enters viewport ───────
  useEffect(() => {
    const el = containerRef.current
    if (!el || !resolvedUrl) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect()
          void startLoad()
        }
      },
      { rootMargin: '200px 0px', threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [startLoad, resolvedUrl])

  // ── Apply category visibility changes to viewer ───────────────────────────
  useEffect(() => {
    apiRef.current?.applyFilters(hiddenIds, null)
  }, [hiddenIds])

  // ── Fullscreen API ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void containerRef.current?.requestFullscreen()
    } else {
      void document.exitFullscreen()
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      apiRef.current?.dispose()
      apiRef.current = null
    }
  }, [])

  // ── Category toggle ────────────────────────────────────────────────────────
  const toggleCat = (id: string) => {
    setHiddenIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const containerH = isFullscreen ? '100dvh' : viewerHeight

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden bg-[#0d0d10] select-none ${
        isFullscreen
          ? 'fixed inset-0 z-[200] rounded-none border-0'
          : 'rounded-2xl border border-[rgba(94,106,210,0.28)]'
      }`}
      style={{ height: containerH }}
      aria-label={title ? `Interactive IFC model: ${title}` : 'Interactive IFC model'}
    >
      {/* ── Preview image — always in DOM, hidden when ready ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ opacity: phase === 'ready' ? 0 : 1, transition: 'opacity 0.6s ease' }}
        aria-hidden="true"
      >
        <img
          src={fallbackImg}
          alt=""
          loading="lazy"
          className={`w-full h-full object-cover ${phase === 'loading' ? 'opacity-35' : 'opacity-60'}`}
          style={{ transition: 'opacity 0.4s ease' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(10,10,15,0.35) 0%, rgba(10,10,15,0.7) 100%)' }}
        />
      </div>

      {/* ── Three.js mount point ── */}
      <div
        ref={mountRef}
        className="absolute inset-0"
        style={{
          touchAction: 'none',
          opacity: phase === 'ready' ? 1 : 0,
          transition: 'opacity 0.5s ease',
          pointerEvents: phase === 'ready' ? 'auto' : 'none',
        }}
      />

      {/* ════════════ STATE OVERLAYS ════════════ */}

      {/* Idle — waiting for scroll */}
      {phase === 'idle' && (
        <IdleState title={title} description={description} />
      )}

      {/* Loading — progress bar */}
      {phase === 'loading' && (
        <LoadingState pct={pct} label={phaseLabel} title={title} description={description} />
      )}

      {/* Error */}
      {phase === 'error' && (
        <ErrorState
          message={errorMsg}
          onRetry={() => { loadStarted.current = false; void startLoad() }}
        />
      )}

      {/* ════════════ READY CONTROLS ════════════ */}

      {phase === 'ready' && (
        <>
          {/* Top bar: title chip + camera/fullscreen buttons */}
          <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 pointer-events-none">
            {title && (
              <div className="px-2.5 py-1 rounded-lg bg-[rgba(0,0,0,0.6)] backdrop-blur-md border border-[rgba(255,255,255,0.08)] max-w-[55%] truncate pointer-events-none">
                <span className="text-[11.5px] font-semibold text-white">{title}</span>
              </div>
            )}

            <div className="flex items-center gap-1.5 ml-auto pointer-events-auto shrink-0">
              {/* INTERACTIVE badge */}
              <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-[rgba(16,185,129,0.12)] border border-[rgba(52,211,153,0.25)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] animate-pulse" />
                <span className="text-[9px] font-mono text-[#34d399] tracking-wide">INTERACTIVE</span>
              </div>

              {/* Reset camera */}
              <IconBtn title="Reset camera" onClick={() => apiRef.current?.resetCamera()}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
              </IconBtn>

              {/* Embed — get iframe/link for this model */}
              {resolvedUrl && (
                <IconBtn title="Embed this model" onClick={() => setShowEmbed(true)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 6l-6 6 6 6M16 6l6 6-6 6"/>
                  </svg>
                </IconBtn>
              )}

              {/* Fullscreen */}
              {allowFullscreen && (
                <IconBtn
                  title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 0 2-2h3M3 16h3a2 2 0 0 0 2 2v3"/>
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                    </svg>
                  )}
                </IconBtn>
              )}
            </div>
          </div>

          {/* Element inspector panel — top right, below controls */}
          {showProperties && selected && (
            <InspectorPanel selected={selected} onClose={() => setSelected(null)} />
          )}

          {/* Category toggles — bottom bar */}
          {categories.length > 0 && (
            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-1.5">
              {categories.slice(0, 9).map(cat => {
                const hidden = hiddenIds.has(cat.id)
                const icon = CAT_ICONS[cat.id] ?? ''
                return (
                  <button
                    key={cat.id}
                    onClick={() => toggleCat(cat.id)}
                    className={`h-[22px] px-2 rounded-full text-[10px] font-mono backdrop-blur-sm border transition-all ${
                      hidden
                        ? 'bg-[rgba(0,0,0,0.35)] border-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.28)] line-through'
                        : 'bg-[rgba(0,0,0,0.55)] border-[rgba(255,255,255,0.18)] text-[rgba(255,255,255,0.78)] hover:border-[rgba(255,255,255,0.35)]'
                    }`}
                    title={hidden ? `Show ${cat.label}` : `Hide ${cat.label}`}
                  >
                    {icon && <span className="mr-0.5">{icon}</span>}
                    {cat.label}
                    <span className="ml-1 text-[rgba(255,255,255,0.35)]">{cat.count}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* One-time "how to interact" hint */}
          <OrbitHint />
        </>
      )}

      {/* Embed snippet generator (reuses the app modal) */}
      {showEmbed && resolvedUrl && (
        <EmbedModal
          defaultModelUrl={resolvedUrl}
          onClose={() => setShowEmbed(false)}
        />
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function IconBtn({
  children, title, onClick,
}: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className="w-8 h-8 flex items-center justify-center rounded-lg bg-[rgba(0,0,0,0.58)] backdrop-blur-md border border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.7)] hover:text-white hover:border-[rgba(255,255,255,0.25)] transition-all active:scale-95"
    >
      {children}
    </button>
  )
}

function IdleState({ title, description }: { title?: string; description?: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
      {(title || description) && (
        <div className="text-center mb-1">
          {title && (
            <h3 className="text-white font-semibold text-[16px] sm:text-[18px] mb-1.5 tracking-tight">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-[rgba(255,255,255,0.55)] text-[13px] leading-relaxed max-w-sm">
              {description}
            </p>
          )}
        </div>
      )}

      {/* 3D box icon */}
      <div className="w-12 h-12 rounded-xl bg-[rgba(94,106,210,0.15)] border border-[rgba(94,106,210,0.35)] flex items-center justify-center">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(129,140,248,0.85)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      </div>

      <p className="text-[11px] text-[rgba(255,255,255,0.35)] font-mono">
        Interactive IFC model · Scroll to load
      </p>
    </div>
  )
}

function LoadingState({
  pct, label, title, description,
}: { pct: number; label: string; title?: string; description?: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-6">
      {(title || description) && (
        <div className="text-center">
          {title && (
            <h3 className="text-white font-semibold text-[16px] mb-1 tracking-tight">{title}</h3>
          )}
          {description && (
            <p className="text-[rgba(255,255,255,0.5)] text-[12.5px] max-w-sm">{description}</p>
          )}
        </div>
      )}

      {/* Progress */}
      <div className="w-full max-w-[260px] flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-mono text-[rgba(255,255,255,0.6)]">{label}</span>
          <span className="text-[10.5px] font-mono text-[rgba(255,255,255,0.4)]">{Math.round(pct)}%</span>
        </div>
        <div className="h-[3px] rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] transition-all duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[10px] text-[rgba(255,255,255,0.3)] font-mono text-center">
          Parsed locally — nothing sent to any server
        </p>
      </div>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
      <div className="w-10 h-10 rounded-full bg-[rgba(239,68,68,0.12)] border border-[rgba(239,68,68,0.3)] flex items-center justify-center" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <circle cx="12" cy="16" r="0.5" fill="#f87171"/>
        </svg>
      </div>
      <p className="text-[13px] text-[rgba(255,255,255,0.65)] text-center max-w-xs leading-relaxed">
        {message}
      </p>
      <button
        onClick={onRetry}
        className="text-[12px] text-[var(--accent-2)] underline underline-offset-2 hover:no-underline transition-all"
      >
        Try again
      </button>
    </div>
  )
}

function InspectorPanel({ selected, onClose }: { selected: SelectedInfo; onClose: () => void }) {
  const prettyType = selected.type.startsWith('IFC')
    ? selected.type.slice(3).charAt(0) + selected.type.slice(4).toLowerCase()
    : selected.type

  return (
    <div
      className="absolute top-14 right-3 w-[200px] rounded-xl bg-[rgba(0,0,0,0.78)] backdrop-blur-md border border-[rgba(255,255,255,0.1)] p-3"
      role="status"
      aria-live="polite"
    >
      <button
        onClick={onClose}
        aria-label="Close inspector"
        className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded text-[rgba(255,255,255,0.35)] hover:text-[rgba(255,255,255,0.7)] text-[11px] transition-colors"
      >
        ✕
      </button>

      <p className="text-[9.5px] font-mono uppercase tracking-widest text-[rgba(255,255,255,0.35)] mb-1">
        Selected element
      </p>
      <p className="text-[13px] font-semibold text-white leading-snug break-words pr-5 mb-1.5">
        {selected.name || '(unnamed)'}
      </p>
      <span className="inline-block px-1.5 py-0.5 rounded-md bg-[rgba(94,106,210,0.2)] border border-[rgba(94,106,210,0.3)] text-[10.5px] font-mono text-[rgba(129,140,248,0.9)]">
        {prettyType}
      </span>
      {selected.storey && (
        <p className="mt-1.5 text-[10.5px] text-[rgba(255,255,255,0.38)]">
          {selected.storey}
        </p>
      )}
    </div>
  )
}

// ── ComparisonViewer ──────────────────────────────────────────────────────────

export interface ComparisonViewerProps {
  left:   EmbedViewerProps & { label: string }
  right:  EmbedViewerProps & { label: string }
  /** Height of each viewer. Default 400. */
  height?: number
}

export function ComparisonViewer({ left, right, height = 400 }: ComparisonViewerProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-7 sm:my-10">
      <LabelledViewer label={left.label} accent="rgba(94,106,210,0.8)">
        <EmbedViewer {...left} height={height} allowFullscreen={false} title={undefined} />
      </LabelledViewer>
      <LabelledViewer label={right.label} accent="rgba(52,211,153,0.8)">
        <EmbedViewer {...right} height={height} allowFullscreen={false} title={undefined} />
      </LabelledViewer>
    </div>
  )
}

function LabelledViewer({
  children, label, accent,
}: { children: React.ReactNode; label: string; accent: string }) {
  return (
    <div className="relative">
      <div
        className="absolute top-3 left-3 z-10 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wide text-white border pointer-events-none"
        style={{
          background: 'rgba(0,0,0,0.7)',
          borderColor: accent.replace('0.8', '0.35'),
          color: accent,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}
