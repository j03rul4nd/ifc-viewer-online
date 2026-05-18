import React, { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '../stores/uiStore'
import type { ViewerAPI } from '../lib/viewer'

interface FloorPlanPanelProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
}

interface ViewEntry {
  id:   string
  name: string
}

export default function FloorPlanPanel({ viewerApiRef }: FloorPlanPanelProps) {
  const {
    plansPanelOpen, activePlanViewId, setActivePlanViewId,
  } = useUIStore()

  const [views,    setViews]    = useState<ViewEntry[]>([])
  const [loading,  setLoading]  = useState(false)
  const [generated, setGenerated] = useState(false)

  const handleGenerate = useCallback(async () => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    setLoading(true)
    try {
      const result = await viewer.createStoreyViews()
      setViews(result)
      setGenerated(true)
    } catch (err) {
      console.warn('[FloorPlanPanel] createStoreyViews failed:', err)
    } finally {
      setLoading(false)
    }
  }, [viewerApiRef])

  const handleOpenView = useCallback((id: string) => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    if (activePlanViewId === id) {
      // Toggle off — return to 3D
      viewer.closeStoreyView()
      setActivePlanViewId(null)
    } else {
      viewer.openStoreyView(id)
      setActivePlanViewId(id)
    }
  }, [viewerApiRef, activePlanViewId, setActivePlanViewId])

  const handleReturnTo3D = useCallback(() => {
    viewerApiRef.current?.closeStoreyView()
    setActivePlanViewId(null)
  }, [viewerApiRef, setActivePlanViewId])

  // Reset generated state when panel is reopened
  const handlePanelVisible = !plansPanelOpen ? null : (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.2 }}
      className="absolute right-3 z-20 pointer-events-auto select-none"
      style={{ width: 200, top: '50%', transform: 'translateY(-70%)' }}
    >
      <div className="glass-md border border-[var(--border-strong)] rounded-[12px] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-3 pt-2.5 pb-1.5 border-b border-[var(--border)]">
          <div className="text-[10px] font-mono text-[var(--text-faint)] tracking-[0.1em] uppercase mb-0.5">
            Floor Plans
          </div>
          {activePlanViewId && (
            <div className="text-[11px] text-[var(--accent)]">
              2D view active
            </div>
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
                  Detecting storeys…
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                    <rect x="1" y="1" width="12" height="12" rx="1"/>
                    <line x1="1" y1="5" x2="13" y2="5"/>
                    <line x1="1" y1="9" x2="13" y2="9"/>
                  </svg>
                  Detect storeys
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
                    <span className="ml-auto text-[10px] opacity-70">2D</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Empty state */}
        {generated && views.length === 0 && (
          <div className="px-3 py-4 text-center">
            <p className="text-[11px] text-[var(--text-faint)]">No storeys found in this model.</p>
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
              Return to 3D view
            </button>
          </div>
        )}

        {/* Regen button after generating */}
        {generated && (
          <div className={activePlanViewId ? '' : 'border-t border-[var(--border)] p-1.5'}>
            {!activePlanViewId && (
              <button
                onClick={() => void handleGenerate()}
                disabled={loading}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[7px] text-[11px] text-[var(--text-faint)] hover:text-[var(--text-dim)] transition-colors text-left"
              >
                <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M13 7A6 6 0 1 1 7 1"/>
                  <path d="M13 1v6h-6"/>
                </svg>
                Refresh
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )

  return (
    <AnimatePresence>
      {plansPanelOpen && handlePanelVisible}
    </AnimatePresence>
  )
}
