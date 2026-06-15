import React, { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../stores/uiStore'
import { createLogger } from '../lib/logger'
import type { ViewerAPI } from '../lib/viewer'
import { trackFeatureUsed } from '../lib/analytics'

const log = createLogger('SectionPanel')

interface SectionPanelProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
}

interface PlaneEntry {
  id:      string
  enabled: boolean
  title:   string
}

export default function SectionPanel({ viewerApiRef }: SectionPanelProps) {
  const { t } = useTranslation('viewer')
  const {
    clipPanelOpen, clipPlaneCount, setClipPlaneCount,
  } = useUIStore()

  const [planes,   setPlanes]   = useState<PlaneEntry[]>([])
  const [adding,   setAdding]   = useState(false)
  const [opError,  setOpError]  = useState<string | null>(null)
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const addingRef  = useRef(adding)
  useEffect(() => { addingRef.current = adding }, [adding])

  const cancelAddMode = useCallback(() => {
    try { viewerApiRef.current?.stopAddClipPlane() } catch { }
    try { viewerApiRef.current?.setClipCreationCallback(null) } catch { }
    setAdding(false)
  }, [viewerApiRef])

  const syncPlanes = useCallback(() => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    try {
      const next = viewer.getClipPlanes()
      setPlanes(next)
      setClipPlaneCount(next.length)
    } catch { }
  }, [viewerApiRef, setClipPlaneCount])

  // Poll plane list every 400 ms while panel is open
  useEffect(() => {
    if (!clipPanelOpen) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      if (addingRef.current) cancelAddMode()
      return
    }
    syncPlanes()
    pollRef.current = setInterval(syncPlanes, 400)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [clipPanelOpen, syncPlanes, cancelAddMode])

  // Unmount cleanup — prevent stale adding mode and dangling callbacks
  useEffect(() => {
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      try { viewerApiRef.current?.stopAddClipPlane() } catch { }
      try { viewerApiRef.current?.setClipCreationCallback(null) } catch { }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ESC cancels add mode
  useEffect(() => {
    if (!clipPanelOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && addingRef.current) cancelAddMode()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clipPanelOpen, cancelAddMode])

  const hasTrackedSection = useRef(false)
  const handleStartAdd = (): void => {
    setOpError(null)
    if (!hasTrackedSection.current) {
      hasTrackedSection.current = true
      trackFeatureUsed({ feature: 'section_plane' })
    }
    try {
      // Register callback first so it's in place before the plane is created
      viewerApiRef.current?.setClipCreationCallback(() => setAdding(false))
      viewerApiRef.current?.startAddClipPlane()
      setAdding(true)
    } catch (err) {
      setOpError(t('section.errStart'))
      log.warn('startAddClipPlane:', err)
      try { viewerApiRef.current?.setClipCreationCallback(null) } catch { }
    }
  }

  const handleStopAdd = (): void => {
    cancelAddMode()
  }

  const handleDelete = (id: string): void => {
    if (!id) return
    setOpError(null)
    try {
      void viewerApiRef.current?.deleteClipPlane(id)
      setTimeout(syncPlanes, 50)
    } catch (err) {
      setOpError(t('section.errDelete'))
      log.warn('deleteClipPlane:', err)
    }
  }

  const handleClear = (): void => {
    setOpError(null)
    try {
      viewerApiRef.current?.clearClipPlanes()
      setTimeout(syncPlanes, 50)
    } catch (err) {
      setOpError(t('section.errClear'))
      log.warn('clearClipPlanes:', err)
    }
  }

  const handleToggle = (id: string, enabled: boolean): void => {
    if (!id) return
    try {
      viewerApiRef.current?.toggleClipPlane(id, enabled)
      setPlanes((prev) => prev.map((p) => p.id === id ? { ...p, enabled } : p))
    } catch (err) {
      log.warn('toggleClipPlane:', err)
      syncPlanes()
    }
  }

  return (
    <AnimatePresence>
      {clipPanelOpen && (
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 12 }}
          transition={{ duration: 0.2 }}
          className="absolute right-3 z-20 pointer-events-auto select-none"
          style={{ width: 'min(188px, calc(100vw - 24px))', top: '50%', transform: 'translateY(-30%)' }}
        >
          <div className="glass-md border border-[var(--border-strong)] rounded-[12px] overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="px-3 pt-2.5 pb-1.5 border-b border-[var(--border)]">
              <div className="text-[10px] font-mono text-[var(--text-faint)] tracking-[0.1em] uppercase mb-0.5">
                {t('section.title')}
              </div>
              {clipPlaneCount > 0 && (
                <div className="text-[11px] text-[var(--text-dim)]">
                  {t('section.planes', { count: clipPlaneCount })}
                </div>
              )}
              {opError && (
                <div className="text-[10px] text-[var(--danger)] mt-0.5 leading-snug">{opError}</div>
              )}
            </div>

            {/* Add button */}
            <div className="p-1.5">
              {adding ? (
                <button
                  onClick={handleStopAdd}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-[8px] text-[12px] font-medium bg-[var(--accent)] text-white transition-all"
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M2 2l10 10M12 2L2 12"/>
                  </svg>
                  {t('section.clickToPlace')}
                </button>
              ) : (
                <button
                  onClick={handleStartAdd}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-[8px] text-[12px] font-medium text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-all"
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="7" y1="1" x2="7" y2="13"/>
                    <line x1="1" y1="7" x2="13" y2="7"/>
                  </svg>
                  {t('section.addPlane')}
                </button>
              )}
            </div>

            {/* Plane list */}
            {planes.length > 0 && (
              <div className="border-t border-[var(--border)] p-1.5 flex flex-col gap-0.5 max-h-[200px] overflow-y-auto">
                {planes.map((plane, i) => (
                  <div key={plane.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-[7px] hover:bg-[var(--surface-2)] group">
                    {/* Enable toggle */}
                    <button
                      onClick={() => handleToggle(plane.id, !plane.enabled)}
                      title={plane.enabled ? t('section.disablePlane') : t('section.enablePlane')}
                      className={`flex-none w-4 h-4 flex items-center justify-center rounded transition-colors ${
                        plane.enabled ? 'text-[var(--accent)]' : 'text-[var(--text-faint)]'
                      }`}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                        <circle cx="5" cy="5" r="4"/>
                      </svg>
                    </button>
                    <span className="flex-1 text-[11px] text-[var(--text-dim)] truncate">
                      {plane.title || t('section.planeName', { number: i + 1 })}
                    </span>
                    <button
                      onClick={() => handleDelete(plane.id)}
                      title={t('section.deletePlane')}
                      className="flex-none opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--danger)] transition-all"
                    >
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                        <path d="M1 1l8 8M9 1L1 9"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Actions footer */}
            {planes.length > 0 && (
              <div className="border-t border-[var(--border)] p-1.5">
                <button
                  onClick={handleClear}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[7px] text-[11px] text-[var(--danger)] hover:bg-[rgba(229,72,77,0.1)] transition-colors text-left"
                >
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M2 2l10 10M12 2L2 12"/>
                  </svg>
                  {t('section.clearAll')}
                </button>
              </div>
            )}

            {/* Hint */}
            {adding && (
              <div className="border-t border-[var(--border)] px-3 py-2 text-[10.5px] text-[var(--text-faint)] leading-snug">
                {t('section.clickHint')}
                <div className="mt-0.5 opacity-70">{t('section.escToCancel')}</div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
