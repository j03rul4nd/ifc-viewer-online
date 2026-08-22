import React, { useState, useCallback, useEffect, useRef } from 'react'
import { ViewportPanel } from './ViewportPanel'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../stores/uiStore'
import { useSceneStore } from '../stores/sceneStore'
import { createLogger } from '../lib/logger'
import type { ViewerAPI } from '../lib/viewer'
import { trackFeatureUsed } from '../lib/analytics'

const log = createLogger('FloorPlanPanel')

interface FloorPlanPanelProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
}

interface ViewEntry {
  id:   string
  name: string
}

export default function FloorPlanPanel({ viewerApiRef }: FloorPlanPanelProps) {
  const { t } = useTranslation('viewer')
  const {
    plansPanelOpen, activePlanViewId, setActivePlanViewId,
    setPlansPanelOpen,
  } = useUIStore()

  const sceneModelCount = useSceneStore((s) => s.models.length)

  const [views,     setViews]     = useState<ViewEntry[]>([])
  const [loading,   setLoading]   = useState(false)
  const [generated, setGenerated] = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  const activePlanViewIdRef = useRef(activePlanViewId)
  useEffect(() => { activePlanViewIdRef.current = activePlanViewId }, [activePlanViewId])

  // Reset generated state when the scene model count changes (model removed/added)
  useEffect(() => {
    setGenerated(false)
    setViews([])
    setError(null)
    // If a 2D plan view is active when models change, close it
    if (activePlanViewIdRef.current) {
      try { viewerApiRef.current?.closeStoreyView() } catch { }
      setActivePlanViewId(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneModelCount])

  // Unmount cleanup: close any active plan view
  useEffect(() => {
    return () => {
      if (activePlanViewIdRef.current) {
        try { viewerApiRef.current?.closeStoreyView() } catch { }
        setActivePlanViewId(null)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleGenerate = useCallback(async () => {
    const viewer = viewerApiRef.current
    if (!viewer || loading) return
    setLoading(true)
    setError(null)
    trackFeatureUsed({ feature: 'floor_plan' })
    try {
      const result = await viewer.createStoreyViews()
      if (!Array.isArray(result)) {
        setError(t('floorPlan.errUnexpected'))
        setViews([])
      } else {
        setViews(result.filter((v) => v && typeof v.id === 'string'))
        setGenerated(true)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(t('floorPlan.errDetect', { msg }))
      log.warn('createStoreyViews:', err)
    } finally {
      setLoading(false)
    }
  }, [viewerApiRef, loading])

  const handleOpenView = useCallback((id: string) => {
    const viewer = viewerApiRef.current
    if (!viewer || !id) return
    setError(null)
    try {
      if (activePlanViewId === id) {
        viewer.closeStoreyView()
        setActivePlanViewId(null)
      } else {
        viewer.openStoreyView(id)
        setActivePlanViewId(id)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(t('floorPlan.errOpen', { msg }))
      log.warn('openStoreyView:', err)
    }
  }, [viewerApiRef, activePlanViewId, setActivePlanViewId])

  const handleReturnTo3D = useCallback(() => {
    setError(null)
    try {
      viewerApiRef.current?.closeStoreyView()
    } catch (err) {
      log.warn('closeStoreyView:', err)
    }
    setActivePlanViewId(null)
  }, [viewerApiRef, setActivePlanViewId])

  return (
    <ViewportPanel
      id="plans"
      onClose={() => setPlansPanelOpen(false)}
      open={plansPanelOpen}
      label={t('floorPlan.title')}
      mobile="dock"
      widthPx={200}
      anchor="center"
      centerShift="translateY(-70%)"
    >
            {/* Header */}
            <div className="px-3 pt-2.5 pb-1.5 border-b border-[var(--border)]">
              <div className="text-[10px] font-mono text-[var(--text-faint)] tracking-[0.1em] uppercase mb-0.5">
                {t('floorPlan.title')}
              </div>
              {activePlanViewId && (
                <div className="text-[11px] text-[var(--accent)]">
                  {t('floorPlan.active2D')}
                </div>
              )}
              {error && (
                <div className="text-[10px] text-[var(--danger)] mt-0.5 leading-snug">{error}</div>
              )}
            </div>

            {/* Generate button */}
            {!generated && (
              <div className="p-2">
                <button
                  onClick={() => void handleGenerate()}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-[8px] text-[12px] font-medium bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)] border border-[var(--border)] transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin opacity-70">
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                        <path d="M12 2a10 10 0 0 1 7.07 2.93"/>
                      </svg>
                      {t('floorPlan.detecting')}
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                        <rect x="1" y="1" width="12" height="12" rx="1"/>
                        <line x1="1" y1="5" x2="13" y2="5"/>
                        <line x1="1" y1="9" x2="13" y2="9"/>
                      </svg>
                      {t('floorPlan.detectStoreys')}
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Storey list */}
            {generated && views.length > 0 && (
              <div className="p-1.5 flex flex-col gap-0.5 max-h-[240px] overflow-y-auto">
                {views.map((v) => {
                  const isActive = activePlanViewId === v.id
                  return (
                    <button
                      key={v.id}
                      onClick={() => handleOpenView(v.id)}
                      className={[
                        'w-full flex items-center gap-2 px-2.5 py-2 rounded-[8px] text-[12px] font-medium transition-all text-left',
                        isActive
                          ? 'bg-[var(--accent)] text-white'
                          : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
                      ].join(' ')}
                    >
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                        <rect x="1" y="4" width="12" height="6" rx="0.8"/>
                        <line x1="4" y1="1" x2="4" y2="4"/>
                        <line x1="10" y1="1" x2="10" y2="4"/>
                      </svg>
                      <span className="truncate">{v.name}</span>
                      {isActive && (
                        <span className="ml-auto text-[10px] opacity-70">{t('floorPlan.view2D')}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Empty state */}
            {generated && views.length === 0 && !error && (
              <div className="px-3 py-4 text-center">
                <p className="text-[11px] text-[var(--text-faint)]">{t('floorPlan.noStoreys')}</p>
              </div>
            )}

            {/* Return to 3D */}
            {activePlanViewId && (
              <div className="border-t border-[var(--border)] p-1.5">
                <button
                  onClick={handleReturnTo3D}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[7px] text-[11px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors text-left"
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                    <path d="M7 1L13 4v6L7 13 1 10V4z"/>
                  </svg>
                  {t('floorPlan.returnTo3D')}
                </button>
              </div>
            )}

            {/* Regen button after generating */}
            {generated && !activePlanViewId && (
              <div className="border-t border-[var(--border)] p-1.5">
                <button
                  onClick={() => void handleGenerate()}
                  disabled={loading}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[7px] text-[11px] text-[var(--text-faint)] hover:text-[var(--text-dim)] transition-colors text-left disabled:opacity-50"
                >
                  <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M13 7A6 6 0 1 1 7 1"/>
                    <path d="M13 1v6h-6"/>
                  </svg>
                  {t('floorPlan.refresh')}
                </button>
              </div>
            )}
    </ViewportPanel>
  )
}
