import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '../stores/uiStore'
import type { ViewerAPI } from '../lib/viewer'
import type { MeasurementTool } from '../stores/uiStore'

interface MeasurementPanelProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
}

const TOOLS: { id: MeasurementTool; label: string; icon: React.ReactNode; hint: string }[] = [
  {
    id: 'none',
    label: 'Select',
    hint: 'Click elements to select them',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <path d="M2 2l10 4-5 1.5L5.5 12 2 2z" opacity="0.85"/>
      </svg>
    ),
  },
  {
    id: 'length',
    label: 'Length',
    hint: 'Click two points to measure distance',
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
    label: 'Area',
    hint: 'Click vertices to define a polygon',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" opacity="0.85">
        <path d="M7 2L12 5v4L7 12 2 9V5z"/>
      </svg>
    ),
  },
]

export default function MeasurementPanel({ viewerApiRef }: MeasurementPanelProps) {
  const {
    activeMeasurementTool, setActiveMeasurementTool,
    measurementCount, setMeasurementCount,
    measurementPanelOpen,
  } = useUIStore()

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll measurement count from viewer every 500 ms when panel is open
  useEffect(() => {
    if (!measurementPanelOpen) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      // Deactivate measurement tool when panel closes
      try {
        viewerApiRef.current?.setMeasurementTool('none')
      } catch { }
      setActiveMeasurementTool('none')
      return
    }
    pollRef.current = setInterval(() => {
      const viewer = viewerApiRef.current
      if (!viewer) return
      try {
        const counts = viewer.getMeasurementCount()
        setMeasurementCount(counts.length + counts.area)
      } catch { }
    }, 500)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [measurementPanelOpen, viewerApiRef, setMeasurementCount, setActiveMeasurementTool])

  // Unmount cleanup
  useEffect(() => {
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      try { viewerApiRef.current?.setMeasurementTool('none') } catch { }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleToolChange = (tool: MeasurementTool): void => {
    setActiveMeasurementTool(tool)
    viewerApiRef.current?.setMeasurementTool(tool)
  }

  const handleClear = (): void => {
    viewerApiRef.current?.clearMeasurements()
    setMeasurementCount(0)
  }

  const handleDeleteLast = (): void => {
    viewerApiRef.current?.deleteLastMeasurement()
    // count will sync on next poll
  }

  // ESC cancels active measurement tool
  useEffect(() => {
    if (!measurementPanelOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && activeMeasurementTool !== 'none') {
        handleToolChange('none')
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (activeMeasurementTool !== 'none') {
          e.preventDefault()
          handleDeleteLast()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [measurementPanelOpen, activeMeasurementTool])

  return (
    <AnimatePresence>
      {measurementPanelOpen && (
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 12 }}
          transition={{ duration: 0.2 }}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-20 pointer-events-auto select-none"
          style={{ width: 'min(160px, calc(100vw - 24px))' }}
        >
          <div className="glass-md border border-[var(--border-strong)] rounded-[12px] overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="px-3 pt-2.5 pb-1.5 border-b border-[var(--border)]">
              <div className="text-[10px] font-mono text-[var(--text-faint)] tracking-[0.1em] uppercase mb-0.5">
                Measure
              </div>
              {measurementCount > 0 && (
                <div className="text-[11px] text-[var(--text-dim)]">
                  {measurementCount} measurement{measurementCount !== 1 ? 's' : ''}
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

            {/* Actions */}
            {measurementCount > 0 && (
              <div className="border-t border-[var(--border)] p-1.5 flex flex-col gap-0.5">
                <button
                  onClick={handleDeleteLast}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[7px] text-[11px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors text-left"
                  title="Delete last measurement (Delete)"
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" opacity="0.7">
                    <path d="M5 2h4l1 2H4L5 2zM2 5h10l-1 7H3L2 5zm4 2v4m2-4v4" stroke="currentColor" strokeWidth="1" fill="none"/>
                  </svg>
                  Delete last
                </button>
                <button
                  onClick={handleClear}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[7px] text-[11px] text-[var(--danger)] hover:bg-[rgba(229,72,77,0.1)] transition-colors text-left"
                  title="Clear all measurements"
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M2 2l10 10M12 2L2 12"/>
                  </svg>
                  Clear all
                </button>
              </div>
            )}

            {/* Hint */}
            {activeMeasurementTool !== 'none' && (
              <div className="border-t border-[var(--border)] px-3 py-2 text-[10.5px] text-[var(--text-faint)] leading-snug">
                {TOOLS.find(t => t.id === activeMeasurementTool)?.hint}
                <div className="mt-0.5 opacity-70">Esc to cancel</div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
