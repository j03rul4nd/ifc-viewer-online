import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ViewportPanel } from './ViewportPanel'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../stores/uiStore'
import { useEditorStore } from '../stores/editorStore'
import { toast } from '../stores/toastStore'
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

/** Measurements as a tab-separated table — pastes straight into a spreadsheet. */
function measurementsTsv(list: readonly MeasurementEntry[], labels: { type: string; value: string; unit: string; length: string; area: string }): string {
  const rows = list.map((m, i) => [i + 1, m.type === 'length' ? labels.length : labels.area, m.value.toFixed(3), m.type === 'length' ? 'm' : 'm²'].join('\t'))
  return [['#', labels.type, labels.value, labels.unit].join('\t'), ...rows].join('\n')
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MeasurementPanel({ viewerApiRef }: MeasurementPanelProps) {
  const { t } = useTranslation('measurement')
  const {
    activeMeasurementTool, setActiveMeasurementTool,
    setMeasurementCount,
    measurementPanelOpen,
    setMeasurementPanelOpen,
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
  const totalLength = measurements.filter((m) => m.type === 'length').reduce((s, m) => s + m.value, 0)
  const totalArea = measurements.filter((m) => m.type === 'area').reduce((s, m) => s + m.value, 0)

  const handleCopy = async (): Promise<void> => {
    const tsv = measurementsTsv(measurements, {
      type: t('table.type'), value: t('table.value'), unit: t('table.unit'), length: t('tools.length'), area: t('tools.area'),
    })
    try { await navigator.clipboard.writeText(tsv); toast(t('actions.copied'), 'success') } catch { toast(t('actions.copyFailed'), 'error') }
  }

  // ── Size of the selected element(s): the box they occupy, in metres ───────
  const selection = useEditorStore((s) => s.selection)
  const [selSize, setSelSize] = useState<{ w: number; d: number; h: number } | null>(null)
  useEffect(() => {
    if (!measurementPanelOpen || selection.length === 0) { setSelSize(null); return }
    let live = true
    const first = selection[0]
    const ids = selection.filter((s) => s.modelId === first.modelId).map((s) => s.expressId)
    void viewerApiRef.current?.getElementsBox(ids, first.modelId ?? undefined).then((b) => {
      if (!live) return
      setSelSize(b ? { w: b.max.x - b.min.x, d: b.max.z - b.min.z, h: b.max.y - b.min.y } : null)
    })
    return () => { live = false }
  }, [measurementPanelOpen, selection, viewerApiRef])

  return (
    <ViewportPanel
      id="measurement"
      onClose={() => setMeasurementPanelOpen(false)}
      open={measurementPanelOpen}
      label={t('panel.title')}
      mobile="dock"
      widthPx={208}
      anchor="center"
    >
            {/* Header */}
            <div className="shrink-0 px-3 pt-2.5 pb-1.5 border-b border-[var(--border)]">
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
              <div className="border-t border-[var(--border)] min-h-0 shrink overflow-y-auto">
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

            {/* Totals + copy */}
            {count > 0 && (
              <div className="border-t border-[var(--border)] px-3 py-1.5 flex flex-col gap-0.5 text-[11px]">
                {totalLength > 0 && measurements.filter((m) => m.type === 'length').length > 1 && (
                  <div className="flex justify-between text-[var(--text-dim)]"><span>{t('totals.length')}</span><span className="font-mono tabular-nums text-[var(--text)]">{formatLength(totalLength)}</span></div>
                )}
                {totalArea > 0 && measurements.filter((m) => m.type === 'area').length > 1 && (
                  <div className="flex justify-between text-[var(--text-dim)]"><span>{t('totals.area')}</span><span className="font-mono tabular-nums text-[var(--text)]">{formatArea(totalArea)}</span></div>
                )}
                <button onClick={() => void handleCopy()} className="mt-0.5 self-start text-[11px] text-[var(--accent-2,var(--accent))] hover:underline" title={t('actions.copyHint')}>
                  {t('actions.copy')}
                </button>
              </div>
            )}

            {/* Selected element size */}
            {selSize && (
              <div className="border-t border-[var(--border)] px-3 py-2">
                <div className="text-[9.5px] font-mono uppercase tracking-[0.1em] text-[var(--text-faint)] mb-1">{t('selection.title', { count: selection.length })}</div>
                <div className="grid grid-cols-3 gap-1 text-center">
                  {([['w', t('selection.width')], ['d', t('selection.depth')], ['h', t('selection.height')]] as const).map(([k, label]) => (
                    <div key={k} className="rounded-md bg-[var(--surface-2)] px-1 py-1">
                      <div className="text-[9.5px] text-[var(--text-faint)]">{label}</div>
                      <div className="text-[11px] font-mono tabular-nums text-[var(--text)]">{formatLength(selSize[k])}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-1 text-[9.5px] leading-snug text-[var(--text-faint)]">{t('selection.note')}</div>
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
