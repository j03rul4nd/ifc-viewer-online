import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ViewportPanel } from './ViewportPanel'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../stores/uiStore'
import type { ViewerAPI } from '../lib/viewer'
import type { MeasurementTool } from '../stores/uiStore'
import { trackFeatureUsed } from '../lib/analytics'

interface MeasurementPanelProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
}

type MeasurementEntry = { id: string; type: 'length' | 'area'; value: number }

// ── Format helpers ────────────────────────────────────────────────────────────

function formatLength(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`
  if (m >= 1)    return `${m.toFixed(2)} m`
  return `${(m * 100).toFixed(1)} cm`
}

function formatArea(m2: number): string {
  if (m2 >= 10000) return `${(m2 / 10000).toFixed(2)} ha`
  return `${m2.toFixed(2)} m²`
}

function formatValue(entry: MeasurementEntry): string {
  return entry.type === 'length' ? formatLength(entry.value) : formatArea(entry.value)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MeasurementPanel({ viewerApiRef }: MeasurementPanelProps) {
  const { t } = useTranslation('measurement')
  const {
    activeMeasurementTool, setActiveMeasurementTool,
    setMeasurementCount,
    measurementPanelOpen,
  } = useUIStore()

  const TOOLS: { id: MeasurementTool; label: string; icon: React.ReactNode; hint: string }[] = [
    {
      id: 'none',
      label: t('tools.select'),
      hint: t('tools.selectHint'),
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M2 2l10 4-5 1.5L5.5 12 2 2z" opacity="0.85"/>
        </svg>
      ),
    },
    {
      id: 'length',
      label: t('tools.length'),
      hint: t('tools.lengthHint'),
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="2" y1="7" x2="12" y2="7"/>
          <line x1="2" y1="5" x2="2" y2="9"/>
          <line x1="12" y1="5" x2="12" y2="9"/>
        </svg>
      ),
    },
    {
      id: 'area',
      label: t('tools.area'),
      hint: t('tools.areaHint'),
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" opacity="0.85">
          <path d="M7 2L12 5v4L7 12 2 9V5z"/>
        </svg>
      ),
    },
  ]

  const [measurements, setMeasurements] = useState<MeasurementEntry[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Tool change (stable reference needed for ESC handler dep array) ────────
  const hasTrackedMeasurement = useRef(false)
  const handleToolChange = useCallback((tool: MeasurementTool): void => {
    if (tool !== 'none' && !hasTrackedMeasurement.current) {
      hasTrackedMeasurement.current = true
      trackFeatureUsed({ feature: 'measurement' })
    }
    setActiveMeasurementTool(tool)
    viewerApiRef.current?.setMeasurementTool(tool)
  }, [setActiveMeasurementTool, viewerApiRef])

  // ── Poll measurements from viewer every 500 ms when panel is open ─────────
  useEffect(() => {
    if (!measurementPanelOpen) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      // Deactivate measurement tool + clear display when panel closes
      try { viewerApiRef.current?.setMeasurementTool('none') } catch { }
      setActiveMeasurementTool('none')
      setMeasurements([])
      setMeasurementCount(0)
      return
    }

    const poll = () => {
      const viewer = viewerApiRef.current
      if (!viewer) return
      try {
        const entries = viewer.getMeasurements()
        setMeasurements(entries)
        setMeasurementCount(entries.length)
      } catch {
        // fallback: at least update the count via the simpler API
        try {
          const counts = viewer.getMeasurementCount()
          setMeasurementCount(counts.length + counts.area)
        } catch { /* ok */ }
      }
    }

    poll() // immediate first read
    pollRef.current = setInterval(poll, 500)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [measurementPanelOpen, viewerApiRef, setMeasurementCount, setActiveMeasurementTool])

  // ── Unmount cleanup ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      try { viewerApiRef.current?.setMeasurementTool('none') } catch { }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    if (!measurementPanelOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && activeMeasurementTool !== 'none') {
        handleToolChange('none')
        return
      }
      // Enter — close the in-progress area polygon (no-op for length / select)
      if (e.key === 'Enter' && activeMeasurementTool === 'area') {
        e.preventDefault()
        viewerApiRef.current?.finishCurrentMeasurement()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeMeasurementTool !== 'none') {
        e.preventDefault()
        handleDeleteLast()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // handleDeleteLast is defined below but stable (no deps) — safe to omit from
  // the array. handleToolChange is now stable via useCallback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurementPanelOpen, activeMeasurementTool, handleToolChange, viewerApiRef])

  const handleClear = (): void => {
    viewerApiRef.current?.clearMeasurements()
    setMeasurements([])
    setMeasurementCount(0)
  }

  const handleDeleteLast = (): void => {
    viewerApiRef.current?.deleteLastMeasurement()
    // Measurement list will sync on the next poll tick (≤500 ms)
  }

  const count = measurements.length

  return (
    <ViewportPanel
      open={measurementPanelOpen}
      label={t('panel.title')}
      mobile="dock"
      widthPx={180}
      anchor="center"
    >
            {/* Header */}
            <div className="px-3 pt-2.5 pb-1.5 border-b border-[var(--border)]">
              <div className="text-[10px] font-mono text-[var(--text-faint)] tracking-[0.1em] uppercase mb-0.5">
                {t('panel.title')}
              </div>
              {count > 0 && (
                <div className="text-[11px] text-[var(--text-dim)]">
                  {t('panel.measurements', { count })}
                </div>
              )}
            </div>

            {/* Tool selector */}
            <div className="p-1.5 flex flex-col gap-0.5">
              {TOOLS.map((tool) => {
                const active = activeMeasurementTool === tool.id
                return (
                  <button
                    key={tool.id}
                    onClick={() => handleToolChange(tool.id)}
                    title={tool.hint}
                    className={[
                      'w-full flex items-center gap-2 px-2.5 py-2 rounded-[8px] text-[12px] font-medium transition-all text-left',
                      active
                        ? 'bg-[var(--accent)] text-white'
                        : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
                    ].join(' ')}
                  >
                    <span className={active ? 'text-white' : 'text-[var(--text-faint)]'}>
                      {tool.icon}
                    </span>
                    {tool.label}
                  </button>
                )
              })}
            </div>

            {/* Measurement values list */}
            {measurements.length > 0 && (
              <div className="border-t border-[var(--border)] max-h-[160px] overflow-y-auto">
                {measurements.map((m, idx) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)] last:border-0"
                  >
                    {/* Type icon */}
                    <span className="shrink-0 text-[var(--text-faint)]">
                      {m.type === 'length' ? (
                        <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <line x1="2" y1="7" x2="12" y2="7"/>
                          <line x1="2" y1="5" x2="2" y2="9"/>
                          <line x1="12" y1="5" x2="12" y2="9"/>
                        </svg>
                      ) : (
                        <svg width="11" height="11" viewBox="0 0 14 14" fill="currentColor" opacity="0.7">
                          <path d="M7 2L12 5v4L7 12 2 9V5z"/>
                        </svg>
                      )}
                    </span>
                    {/* Index */}
                    <span className="text-[10px] font-mono text-[var(--text-faint)] shrink-0 w-3 text-right">
                      {idx + 1}
                    </span>
                    {/* Value */}
                    <span className="text-[11px] font-mono text-[var(--text)] flex-1 text-right tabular-nums">
                      {formatValue(m)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* "Finish area" button — shown while area tool is active, completes the polygon */}
            {activeMeasurementTool === 'area' && (
              <div className="border-t border-[var(--border)] p-1.5">
                <button
                  onClick={() => viewerApiRef.current?.finishCurrentMeasurement()}
                  className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-[7px] text-[11px] font-semibold transition-colors"
                  style={{ background: 'var(--accent)18', color: 'var(--accent)', border: '1px solid var(--accent)33' }}
                  title={t('actions.finishAreaHint')}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="2,5 4,7.5 8,2.5" />
                  </svg>
                  {t('actions.finishArea')}
                  <span className="opacity-50 text-[9px] font-mono ml-auto">↵</span>
                </button>
              </div>
            )}

            {/* Actions */}
            {count > 0 && (
              <div className="border-t border-[var(--border)] p-1.5 flex flex-col gap-0.5">
                <button
                  onClick={handleDeleteLast}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[7px] text-[11px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors text-left"
                  title={t('actions.deleteLastHint')}
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" opacity="0.7">
                    <path d="M5 2h4l1 2H4L5 2zM2 5h10l-1 7H3L2 5zm4 2v4m2-4v4" stroke="currentColor" strokeWidth="1" fill="none"/>
                  </svg>
                  {t('actions.deleteLast')}
                </button>
                <button
                  onClick={handleClear}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[7px] text-[11px] text-[var(--danger)] hover:bg-[rgba(229,72,77,0.1)] transition-colors text-left"
                  title={t('actions.clearAllHint')}
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M2 2l10 10M12 2L2 12"/>
                  </svg>
                  {t('actions.clearAll')}
                </button>
              </div>
            )}

            {/* Active tool hint */}
            {activeMeasurementTool !== 'none' && (
              <div className="border-t border-[var(--border)] px-3 py-2 text-[10.5px] text-[var(--text-faint)] leading-snug">
                {TOOLS.find(tool => tool.id === activeMeasurementTool)?.hint}
                <div className="mt-0.5 opacity-70">{t('actions.escToCancel')}</div>
              </div>
            )}
    </ViewportPanel>
  )
}
