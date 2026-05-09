// ─── UploadOverlay ────────────────────────────────────────────────────────────
// Full-screen modal for loading IFC files.
//
// State machine (based on `isLoading`, `loadProgress`, `loadError`):
//
//   DROP ZONE  ←──────────────────────────────────────────────────────┐
//      │ user drops / picks file                                       │
//      ▼                                                               │ error
//   PROGRESS (isLoading = true)                                        │
//      │ onModelLoaded fires → isLoading = false, progress = 100      │
//      ▼                                                               │
//   DONE (400 ms auto-close by parent)                                 │
//      │ load error → progress reset to 0, loadError set              │
//      └──────────────────────────────────────────────────────────────┘
//
// Fix vs. previous version:
//   • The "done" gate (loadProgress ≥ 100) was sticky — reopening the modal
//     after a successful load showed "Model ready" instead of the drop zone.
//     Now "done" is derived from a local `wasLoading` flag that resets on
//     component mount (the component is unmounted/remounted by AnimatePresence
//     each time showUpload toggles), so re-opening always starts fresh.
//   • Non-.ifc files now show an inline error message instead of being silently
//     ignored.
//   • A `loadError` prop surfaces server/worker errors directly inside the modal
//     so the user knows what went wrong and can retry.

import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as Icons from './Icons'

// ── Props ─────────────────────────────────────────────────────────────────────

interface UploadOverlayProps {
  onClose:      () => void
  onLoad:       (file: File) => void
  isLoading:    boolean
  loadProgress: number
  /** Error message from the loader (parse / viewer failure). */
  loadError?:   string | null
}

// ── Stage labels ──────────────────────────────────────────────────────────────

const stageLabel = (pct: number): string =>
  pct < 20 ? 'Initialising WebAssembly' :
  pct < 35 ? 'Reading file'             :
  pct < 60 ? 'Parsing geometry'         :
  pct < 90 ? 'Building scene'           : 'Finalising'

// ── Component ─────────────────────────────────────────────────────────────────

export default function UploadOverlay({
  onClose,
  onLoad,
  isLoading,
  loadProgress,
  loadError,
}: UploadOverlayProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver,   setDragOver]   = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  // ── "done" gate: local wasLoading flag ────────────────────────────────────
  // Component remounts each time the overlay opens (AnimatePresence unmounts it
  // when showUpload=false), so wasLoading always starts as false — ensuring the
  // drop zone is shown on re-open, not the stale "Model ready" screen.
  const [wasLoading, setWasLoading] = useState(false)
  useEffect(() => {
    if (isLoading) setWasLoading(true)
  }, [isLoading])

  const done         = wasLoading && !isLoading && loadProgress >= 100
  const showProgress = isLoading || done

  // ── Error display & dismiss ────────────────────────────────────────────────
  // `loadError` comes from the parent (worker/scene errors); `localError` is
  // set locally for client-side issues (wrong file type).
  // A local `errorDismissed` flag lets the user close the banner for EITHER
  // source without requiring a prop callback back to the parent.
  // The flag resets whenever a new loadError prop value arrives so a fresh
  // error from a new load attempt is always shown.
  const [errorDismissed, setErrorDismissed] = useState(false)
  const prevLoadErrorRef = useRef(loadError)
  useEffect(() => {
    if (loadError !== prevLoadErrorRef.current) {
      prevLoadErrorRef.current = loadError
      setErrorDismissed(false)   // new error → show it
    }
  }, [loadError])

  const displayError = errorDismissed ? null : (loadError ?? localError)

  const dismissError = (): void => {
    setLocalError(null)
    setErrorDismissed(true)
  }

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = (file: File): void => {
    if (!file.name.toLowerCase().endsWith('.ifc')) {
      setLocalError(`"${file.name}" is not an IFC file. Please select a .ifc file.`)
      return
    }
    setLocalError(null)
    onLoad(file)
  }

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset so the same file can be re-selected after an error
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-xl flex items-center justify-center p-5"
      onClick={!isLoading ? onClose : undefined}
    >
      {/* Hidden real file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".ifc"
        className="hidden"
        onChange={onFileInputChange}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="w-[560px] bg-[var(--surface)] border border-[var(--border-strong)] rounded-2xl overflow-hidden shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]"
        onClick={e => e.stopPropagation()}
      >
        <AnimatePresence mode="wait">

          {/* ── PROGRESS / DONE ── */}
          {showProgress && (
            <motion.div
              key="progress"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="p-9"
            >
              <div className="text-[15px] font-semibold mb-1">
                {done ? 'Model ready' : 'Loading IFC…'}
              </div>
              <div className="text-[12px] text-[var(--text-dim)] mb-5">
                {done
                  ? 'Opening viewer'
                  : 'Parsing STEP entities via web-ifc WebAssembly'}
              </div>
              <div className="h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden mb-4">
                <motion.div
                  className="h-full rounded-full bg-[var(--accent)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${loadProgress}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
              <div className="font-mono text-[11px] text-[var(--text-faint)]">
                {Math.round(loadProgress)}% · {stageLabel(loadProgress)}
              </div>
            </motion.div>
          )}

          {/* ── DROP ZONE (idle or error) ── */}
          {!showProgress && (
            <motion.div
              key="drop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="p-8"
            >
              <div className="flex justify-between items-start mb-5">
                <div>
                  <div className="text-[17px] font-semibold tracking-tight">Open an IFC file</div>
                  <div className="text-[12.5px] text-[var(--text-dim)] mt-1">
                    Processed locally — nothing is uploaded to any server.
                  </div>
                </div>
                <button onClick={onClose} className="text-[var(--text-dim)] p-1 hover:text-[var(--text)]">
                  <Icons.X size={18} />
                </button>
              </div>

              {/* ── Error banner ── */}
              <AnimatePresence>
                {displayError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
                    exit={{   opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300">
                      <Icons.X size={13} className="mt-0.5 flex-none opacity-80" />
                      <p className="text-[12px] leading-snug flex-1">{displayError}</p>
                      <button
                        onClick={dismissError}
                        className="flex-none opacity-50 hover:opacity-100 transition-opacity"
                        aria-label="Dismiss error"
                      >
                        <Icons.X size={11} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Drop zone ── */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className="relative py-14 px-5 rounded-xl text-center cursor-pointer transition-all overflow-hidden"
                style={{
                  border:     `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-strong)'}`,
                  background: dragOver ? 'rgba(94,106,210,0.05)' : 'var(--surface-2)',
                }}
              >
                {dragOver && <div className="absolute inset-0 shimmer pointer-events-none" />}
                <div
                  className="w-14 h-14 mx-auto mb-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border-strong)] flex items-center justify-center transition-colors"
                  style={{ color: dragOver ? 'var(--accent-2)' : 'var(--text-dim)' }}
                >
                  <Icons.Upload size={22} />
                </div>
                <div className="text-[14px] font-medium mb-1">
                  {dragOver ? 'Drop to open' : 'Drop your .ifc file here'}
                </div>
                <div className="text-[12px] text-[var(--text-dim)]">
                  or <span className="text-[var(--accent-2)] underline">click to browse</span>
                  {' · '}IFC2x3 / IFC4 / IFC4x3
                </div>
              </div>

              <div className="mt-3.5 flex gap-2.5 text-[11.5px] text-[var(--text-faint)] justify-center">
                <span>🔒 Runs in-browser via WebAssembly</span>
                <span>·</span><span>No login</span>
                <span>·</span><span>Free</span>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
