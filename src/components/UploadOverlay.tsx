import React, { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as Icons from './Icons'

interface UploadOverlayProps {
  onClose: () => void
  onLoad: (file: File) => void
  isLoading: boolean
  loadProgress: number
}

const stageLabel = (pct: number) =>
  pct < 20 ? 'Initialising WebAssembly' :
  pct < 35 ? 'Reading file' :
  pct < 60 ? 'Parsing geometry' :
  pct < 90 ? 'Building scene' : 'Finalising'

export default function UploadOverlay({ onClose, onLoad, isLoading, loadProgress }: UploadOverlayProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.ifc')) return
    onLoad(file)
  }

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset so the same file can be re-selected
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const done = loadProgress >= 100

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
          {!isLoading && !done ? (
            <motion.div key="drop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-8">
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

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className="relative py-14 px-5 rounded-xl text-center cursor-pointer transition-all overflow-hidden"
                style={{
                  border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-strong)'}`,
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
          ) : (
            <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-9">
              <div className="text-[15px] font-semibold mb-1">
                {done ? 'Model ready' : 'Loading IFC…'}
              </div>
              <div className="text-[12px] text-[var(--text-dim)] mb-5">
                {done ? 'Opening viewer' : 'Parsing STEP entities via web-ifc WebAssembly'}
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
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
