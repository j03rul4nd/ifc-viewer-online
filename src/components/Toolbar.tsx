import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import * as Icons from './Icons'
import { useEditorStore } from '../stores/editorStore'
import { useValidationStore } from '../stores/validationStore'
import { useModelStore } from '../stores/modelStore'
import { useUIStore } from '../stores/uiStore'
import { useEditorHistory } from '../hooks/useEditorHistory'
import { exportAsIfc, exportAsGlb, downloadBlob } from '../lib/diffStore'
import { runValidation } from '../lib/validator'

interface ToolbarProps {
  fileName: string | null
  elementCount: number
  loadingState: 'idle' | 'loading' | 'loaded' | 'error'
  canIsolate: boolean
  onReset: () => void
  onIsolate: () => void
  onUpload: () => void
}

const Btn = ({
  icon: Icon, children, onClick, disabled, variant = 'ghost', title,
}: {
  icon?: React.ComponentType<{ size?: number }>
  children?: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'ghost' | 'primary' | 'secondary' | 'danger'
  title?: string
}) => {
  const base = 'inline-flex items-center gap-1.5 px-2.5 h-[30px] rounded-[7px] text-[13px] font-medium transition-all duration-100 whitespace-nowrap select-none'
  const variants = {
    ghost:     'text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-40',
    primary:   'bg-[var(--accent)] text-white hover:brightness-110 h-[38px] px-4 rounded-[9px]',
    secondary: 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border-strong)] hover:brightness-110',
    danger:    'text-[var(--danger)] hover:bg-[var(--danger)]18 disabled:opacity-40',
  }
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={`${base} ${variants[variant]}`}>
      {Icon && <Icon size={14} />}
      {children}
    </button>
  )
}

export default function Toolbar({
  fileName, elementCount, loadingState, canIsolate, onReset, onIsolate, onUpload,
}: ToolbarProps) {
  const statusColor = loadingState === 'loaded' ? 'var(--ok)' : loadingState === 'error' ? 'var(--danger)' : 'var(--warn)'
  const statusLabel =
    loadingState === 'loading' ? 'Loading IFC…' :
    loadingState === 'loaded'  ? 'Model loaded' :
    loadingState === 'error'   ? 'Load failed'  : ''

  const { diffs, canUndo, canRedo } = useEditorStore()
  const { undo, redo }              = useEditorHistory()
  const { validationMode, toggleValidationMode, result, isRunning } = useValidationStore()
  const { ifcBuffer } = useModelStore()
  const { treeVisible, setTreeVisible } = useUIStore()

  const [exportOpen, setExportOpen]   = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting]     = useState(false)

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return
    const handler = (e: MouseEvent): void => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [exportOpen])

  const handleExportIfc = async (): Promise<void> => {
    setExporting(true)
    setExportOpen(false)
    try {
      const bytes = await exportAsIfc()
      downloadBlob(new Blob([bytes], { type: 'application/x-step' }), 'model-edited.ifc')
    } catch (err) {
      console.error('[Export] IFC export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  const handleExportGlb = async (): Promise<void> => {
    setExporting(true)
    setExportOpen(false)
    try {
      const blob = await exportAsGlb()
      downloadBlob(blob, 'model.glb')
    } catch (err) {
      console.error('[Export] GLB export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  const issueCount = result?.stats.total ?? 0
  const errorCount = result?.stats.errors ?? 0
  const hasIssues  = issueCount > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="absolute top-3 left-3 right-3 z-10 flex items-center gap-2.5 pointer-events-none"
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 bg-[rgba(16,16,20,0.72)] backdrop-blur-md border border-[var(--border)] rounded-[10px] px-2.5 py-1.5 pointer-events-auto">
        <Icons.Logo size={22} />
        <div className="flex flex-col leading-none gap-0.5">
          <div className="text-[13px] font-semibold tracking-tight">IFC Validator</div>
          <div className="text-[10.5px] text-[var(--text-faint)] font-mono">
            {fileName ?? 'No file loaded'}
          </div>
        </div>
      </div>

      {/* Main actions */}
      <div className="flex items-center gap-0.5 bg-[rgba(16,16,20,0.72)] backdrop-blur-md border border-[var(--border)] rounded-[10px] p-1 pointer-events-auto">
        <Btn icon={Icons.Upload} onClick={onUpload}>Open</Btn>
        <div className="w-px h-[18px] bg-[var(--border)]" />
        <Btn icon={Icons.Reset} onClick={onReset} title="Reset camera">Reset</Btn>
        <Btn icon={Icons.Isolate} onClick={onIsolate} disabled={!canIsolate} title="Isolate category">Isolate</Btn>
        <div className="w-px h-[18px] bg-[var(--border)]" />
        {/* Tree toggle */}
        <Btn
          onClick={() => setTreeVisible(!treeVisible)}
          title="Toggle spatial tree"
          variant={treeVisible ? 'secondary' : 'ghost'}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="opacity-80">
            <rect x="1" y="1" width="4" height="12" rx="1" opacity="0.5" />
            <rect x="7" y="1" width="6" height="3" rx="1" />
            <rect x="7" y="5.5" width="6" height="3" rx="1" />
            <rect x="7" y="10" width="6" height="3" rx="1" />
          </svg>
          Tree
        </Btn>
      </div>

      {/* Validation */}
      <div className="flex items-center gap-0.5 bg-[rgba(16,16,20,0.72)] backdrop-blur-md border border-[var(--border)] rounded-[10px] p-1 pointer-events-auto">
        <Btn
          onClick={() => ifcBuffer && void runValidation()}
          disabled={!ifcBuffer || isRunning}
          title="Run validation"
          variant="ghost"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M2 2h10v2H2zM2 6h7v2H2zM2 10h4v2H2z" opacity="0.6"/>
            <path d="M10 8l3 2-3 2V8z" />
          </svg>
          {isRunning ? 'Validating…' : 'Validate'}
        </Btn>
        <Btn
          onClick={toggleValidationMode}
          disabled={!hasIssues}
          title="Toggle validation overlay in 3D view"
          variant={validationMode ? 'secondary' : 'ghost'}
        >
          <span
            className="text-[11px] font-mono"
            style={{ color: validationMode ? (errorCount > 0 ? 'var(--danger)' : '#F5A623') : undefined }}
          >
            {hasIssues ? `${issueCount}` : '●'}
          </span>
          Overlay
        </Btn>
      </div>

      {/* Undo/Redo */}
      {(canUndo || canRedo) && (
        <div className="flex items-center gap-0.5 bg-[rgba(16,16,20,0.72)] backdrop-blur-md border border-[var(--border)] rounded-[10px] p-1 pointer-events-auto">
          <Btn onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M4 3L1 6l3 3V7c2.5 0 4.5 1 5.5 3-.5-3-2.5-5-5.5-5V3z" />
            </svg>
            Undo
          </Btn>
          <Btn onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" style={{ transform: 'scaleX(-1)' }}>
              <path d="M4 3L1 6l3 3V7c2.5 0 4.5 1 5.5 3-.5-3-2.5-5-5.5-5V3z" />
            </svg>
            Redo
          </Btn>
        </div>
      )}

      <div className="flex-1" />

      {/* Pending changes + Export */}
      {ifcBuffer && (
        <div ref={exportRef} className="relative pointer-events-auto">
          <button
            onClick={() => setExportOpen((v) => !v)}
            disabled={exporting}
            className="flex items-center gap-1.5 h-[30px] px-2.5 bg-[rgba(16,16,20,0.72)] backdrop-blur-md border rounded-[10px] text-[13px] font-medium transition-colors hover:text-[var(--text)]"
            style={{
              borderColor: diffs.length > 0 ? 'var(--accent)' : 'var(--border)',
              color:       diffs.length > 0 ? 'var(--accent)' : 'var(--text-dim)',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
              <path d="M6.5 1v7.5M3.5 6l3 3.5 3-3.5M1 10v2h11v-2" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
            </svg>
            Export
            {diffs.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 text-[9px] font-mono rounded-full bg-[var(--accent)] text-white leading-none">
                {diffs.length}
              </span>
            )}
          </button>

          {exportOpen && (
            <div className="absolute right-0 top-full mt-1.5 bg-[var(--surface)] border border-[var(--border-strong)] rounded-[10px] shadow-2xl z-50 py-1.5 min-w-[160px]">
              <div className="px-3 py-1 text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">
                Export as…
              </div>
              <button
                onClick={() => void handleExportIfc()}
                className="w-full text-left px-3 py-2 text-[12px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] flex items-center gap-2"
              >
                <span className="font-mono text-[var(--accent)] text-[10px]">IFC</span>
                {diffs.length > 0 ? `IFC with ${diffs.length} edits` : 'Original IFC'}
              </button>
              <button
                onClick={() => void handleExportGlb()}
                className="w-full text-left px-3 py-2 text-[12px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] flex items-center gap-2"
              >
                <span className="font-mono text-[var(--ok)] text-[10px]">GLB</span>
                3D model (GLB)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Status chip */}
      {loadingState !== 'idle' && (
        <div className="flex items-center gap-2 h-[38px] px-3 bg-[rgba(16,16,20,0.72)] backdrop-blur-md border border-[var(--border)] rounded-[10px] text-[12px] text-[var(--text-dim)] pointer-events-auto">
          <span className="font-mono" style={{ color: statusColor }}>●</span>
          {statusLabel}
          {loadingState === 'loaded' && (
            <>
              <span className="text-[var(--text-faint)]">·</span>
              <span className="font-mono">{elementCount}</span> elements
            </>
          )}
        </div>
      )}
    </motion.div>
  )
}
