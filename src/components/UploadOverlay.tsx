// ─── src/components/UploadOverlay.tsx ────────────────────────────────────────
// Pure presentation — zero business logic.
// All state and behaviour lives in useIfcUploadFlow.
//
// Sub-views:
//   IdleView       — drop zone (idle + dragging)
//   ActiveView     — progress bar (validating / queued / parsing / building-scene)
//   SuccessView    — model ready + "Open viewer" CTA
//   ErrorView      — typed error + optional retry
//   CancelledView  — cancelled + retry

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as Icons from './Icons'
import { useIfcUploadFlow }       from '../hooks/useIfcUploadFlow'
import type { UploadOverlayProps, UploadState } from '../types/upload.types'
import { STAGE_THRESHOLDS, progressToStage }    from '../lib/upload.constants'
import { formatFileSize, formatDuration }        from '../lib/upload.utils'

// ─────────────────────────────────────────────────────────────────────────────
// Sub-views
// ─────────────────────────────────────────────────────────────────────────────

// ── Idle ──────────────────────────────────────────────────────────────────────

function IdleView({
  isDragging,
  onClose,
  openFilePicker,
  dragHandlers,
}: {
  isDragging:     boolean
  onClose:        () => void
  openFilePicker: () => void
  dragHandlers:   ReturnType<typeof useIfcUploadFlow>['dragHandlers']
}) {
  return (
    <motion.div
      key="idle"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      className="p-8"
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight">Open an IFC file</h2>
          <p className="text-[12.5px] text-[var(--text-dim)] mt-1">
            Processed locally — nothing leaves your browser.
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-[var(--text-dim)] hover:text-[var(--text)] p-1 transition-colors"
          aria-label="Close"
        >
          <Icons.X size={18} />
        </button>
      </div>

      {/* Drop zone */}
      <div
        {...dragHandlers}
        onClick={openFilePicker}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && openFilePicker()}
        aria-label="Drop IFC file or click to browse"
        className="relative py-14 px-5 rounded-xl text-center cursor-pointer transition-all overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        style={{
          border:     `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border-strong)'}`,
          background: isDragging ? 'rgba(94,106,210,0.06)' : 'var(--surface-2)',
        }}
      >
        {isDragging && (
          <div className="absolute inset-0 shimmer pointer-events-none" />
        )}
        <div
          className="w-14 h-14 mx-auto mb-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border-strong)] flex items-center justify-center transition-colors"
          style={{ color: isDragging ? 'var(--accent-2)' : 'var(--text-dim)' }}
        >
          <Icons.Upload size={22} />
        </div>
        <p className="text-[14px] font-medium mb-1">
          {isDragging ? 'Release to open' : 'Drop your .ifc file here'}
        </p>
        <p className="text-[12px] text-[var(--text-dim)]">
          or{' '}
          <span className="text-[var(--accent-2)] underline underline-offset-2">
            click to browse
          </span>
          {' · '}IFC2x3 / IFC4 / IFC4x3
        </p>
      </div>

      {/* Footer */}
      <div className="mt-4 flex gap-2.5 text-[11px] text-[var(--text-faint)] justify-center flex-wrap">
        <span>🔒 WebAssembly — runs in-browser</span>
        <span>·</span>
        <span>No login required</span>
        <span>·</span>
        <span>Up to 2 GB</span>
      </div>
    </motion.div>
  )
}

// ── Active (validating / queued / parsing / building-scene) ───────────────────

function ActiveView({
  state,
  onCancel,
  canCancel,
}: {
  state:     Extract<UploadState, { id: 'validating' | 'queued' | 'parsing' | 'building-scene' }>
  onCancel:  () => void
  canCancel: boolean
}) {
  const progress   = 'progress' in state ? state.progress : 0
  const stage      = progressToStage(progress)
  const stageInfo  = STAGE_THRESHOLDS[stage]
  const isPre      = state.id === 'validating' || state.id === 'queued'

  const heading =
    state.id === 'validating'     ? 'Validating file…'      :
    state.id === 'queued'         ? 'Preparing loader…'     :
    state.id === 'building-scene' ? 'Building 3D scene…'    :
    'Loading IFC model…'

  return (
    <motion.div
      key="active"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      className="p-9"
    >
      {/* File chip */}
      {'file' in state && state.file && (
        <div className="flex items-center gap-2 mb-5 px-3.5 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
          <Icons.FileIfc size={13} className="text-[var(--text-dim)] flex-none" />
          <span className="text-[12px] text-[var(--text-dim)] truncate flex-1 font-mono">
            {state.file.name}
          </span>
          <span className="text-[11px] text-[var(--text-faint)] flex-none">
            {formatFileSize(state.file.size)}
          </span>
        </div>
      )}

      <p className="text-[15px] font-semibold mb-1">{heading}</p>
      <p className="text-[12px] text-[var(--text-dim)] mb-5">
        {isPre ? 'Checking IFC schema and file integrity' : stageInfo.label}
      </p>

      {/* Progress bar */}
      <div
        className="h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden mb-3"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <motion.div
          className="h-full rounded-full bg-[var(--accent)]"
          initial={{ width: 0 }}
          animate={{ width: isPre ? '8%' : `${progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-[var(--text-faint)]">
          {isPre ? 'Initialising…' : `${Math.round(progress)}% · ${stageInfo.label}`}
        </span>
        {canCancel && (
          <button
            onClick={onCancel}
            className="text-[11.5px] text-[var(--text-dim)] hover:text-red-400 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ── Success ───────────────────────────────────────────────────────────────────

function SuccessView({
  state,
  onClose,
}: {
  state:   Extract<UploadState, { id: 'success' }>
  onClose: () => void
}) {
  return (
    <motion.div
      key="success"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className="p-9 text-center"
    >
      <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
        <Icons.Check size={22} className="text-emerald-400" />
      </div>
      <h2 className="text-[16px] font-semibold mb-1">Model ready</h2>
      <p className="text-[12.5px] text-[var(--text-dim)] mb-1 font-mono truncate max-w-[320px] mx-auto">
        {state.file.name}
      </p>
      <p className="text-[12px] text-[var(--text-faint)] mb-6">
        {formatFileSize(state.file.size)} · loaded in {formatDuration(state.durationMs)}
      </p>
      <button
        onClick={onClose}
        className="px-5 py-2.5 rounded-lg bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
      >
        Open viewer →
      </button>
    </motion.div>
  )
}

// ── Error ─────────────────────────────────────────────────────────────────────

function ErrorView({
  state,
  onRetry,
  onClose,
}: {
  state:   Extract<UploadState, { id: 'error' }>
  onRetry: () => void
  onClose: () => void
}) {
  const { error } = state
  return (
    <motion.div
      key="error"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      className="p-9"
    >
      <div className="flex justify-between items-start mb-5">
        <div className="w-11 h-11 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center flex-none">
          <Icons.ErrorIcon size={20} className="text-red-400" />
        </div>
        <button
          onClick={onClose}
          className="text-[var(--text-dim)] hover:text-[var(--text)] p-1 transition-colors"
          aria-label="Close"
        >
          <Icons.X size={18} />
        </button>
      </div>

      <h2 className="text-[15px] font-semibold mb-1.5">Failed to load model</h2>
      <p className="text-[13px] text-[var(--text-dim)] mb-2">{error.message}</p>

      {error.technical && (
        <details className="mb-5">
          <summary className="text-[11px] text-[var(--text-faint)] cursor-pointer hover:text-[var(--text-dim)] select-none">
            Technical details
          </summary>
          <pre className="mt-2 p-2.5 rounded-lg bg-[var(--surface-2)] text-[10.5px] text-[var(--text-faint)] font-mono overflow-auto max-h-24 whitespace-pre-wrap">
            {error.technical}
          </pre>
        </details>
      )}

      <div className="flex gap-2.5 mt-5">
        {error.retryable && (
          <button
            onClick={onRetry}
            className="flex-1 py-2 rounded-lg bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
        )}
        <button
          onClick={onClose}
          className="flex-1 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[13px] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
        >
          Close
        </button>
      </div>
    </motion.div>
  )
}

// ── Cancelled ─────────────────────────────────────────────────────────────────

function CancelledView({ onRetry, onClose }: { onRetry: () => void; onClose: () => void }) {
  return (
    <motion.div
      key="cancelled"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      className="p-9 text-center"
    >
      <p className="text-[14px] text-[var(--text-dim)] mb-5">Load cancelled.</p>
      <div className="flex gap-2.5 justify-center">
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
        >
          Load another file
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[13px] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
        >
          Close
        </button>
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function UploadOverlay(props: UploadOverlayProps) {
  const {
    state,
    fileInputRef,
    canClose,
    canCancel,
    isActive,
    dragHandlers,
    handleClose,
    handleCancel,
    handleRetry,
    onFileInputChange,
    openFilePicker,
  } = useIfcUploadFlow(props)

  const isDragging = state.id === 'dragging'

  const isActiveState =
    state.id === 'validating'     ||
    state.id === 'queued'         ||
    state.id === 'parsing'        ||
    state.id === 'building-scene'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-xl flex items-center justify-center p-5"
      onClick={canClose ? handleClose : undefined}
      aria-modal="true"
      role="dialog"
      aria-label="Open IFC file"
    >
      {/* Native file input — hidden */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".ifc"
        className="hidden"
        onChange={onFileInputChange}
      />

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="w-[560px] max-w-full bg-[var(--surface)] border border-[var(--border-strong)] rounded-2xl overflow-hidden shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Top loading indicator while active */}
        {isActive && (
          <div className="h-0.5 bg-[var(--surface-2)] overflow-hidden">
            <motion.div
              className="h-full bg-[var(--accent)]"
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
              style={{ width: '40%' }}
            />
          </div>
        )}

        <AnimatePresence mode="wait">

          {/* IDLE / DRAGGING */}
          {(state.id === 'idle' || state.id === 'dragging') && (
            <IdleView
              key="idle"
              isDragging={isDragging}
              onClose={handleClose}
              openFilePicker={openFilePicker}
              dragHandlers={dragHandlers}
            />
          )}

          {/* ACTIVE */}
          {isActiveState && (
            <ActiveView
              key="active"
              state={state as Extract<UploadState, { id: 'validating' | 'queued' | 'parsing' | 'building-scene' }>}
              onCancel={handleCancel}
              canCancel={canCancel}
            />
          )}

          {/* SUCCESS */}
          {state.id === 'success' && (
            <SuccessView key="success" state={state} onClose={handleClose} />
          )}

          {/* ERROR */}
          {state.id === 'error' && (
            <ErrorView key="error" state={state} onRetry={handleRetry} onClose={handleClose} />
          )}

          {/* CANCELLED */}
          {state.id === 'cancelled' && (
            <CancelledView key="cancelled" onRetry={handleRetry} onClose={handleClose} />
          )}

        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}