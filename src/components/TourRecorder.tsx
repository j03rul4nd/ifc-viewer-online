// ─── TourRecorder (Tour Mode — D-24) ───────────────────────────────────────────
// Builds a tour: auto-generation from validation issues (one grouped step per
// rule, worst first) and manual stop recording (current camera via the shared
// getCameraViewpoint primitive — same one BCF viewpoint capture uses).
//
// Environment-aware: mounts INSIDE the viewer container using the same
// floating-panel convention as ScenePanel (absolute top-right, glass surface),
// so it never covers the sidebar/tree chrome. On mobile it becomes a bottom
// sheet raised above the pill nav, dropping drag in favour of ↑/↓ buttons
// (touch drag on a scrollable list isn't worth a dependency — see D-24).
// Each stop row offers a fly-to preview so the presenter can check what the
// audience will see before playing. Lazy-loaded.

import React, { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import * as Icons from './Icons'
import { ViewportPanel } from './ViewportPanel'
import TemplateSelector from './TemplateSelector'
import { usePresentationStore } from '../stores/presentationStore'
import { useSceneStore } from '../stores/sceneStore'
import { useIsMobile } from '../hooks/useIsMobile'
import { getRuleLabel, type TourStep } from '../types'
import type { ViewerAPI } from '../lib/viewer'

const SEVERITY_COLOR = { error: 'var(--danger)', warning: '#F5A623', info: '#3B82F6' } as const

interface TourRecorderProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
}

export default function TourRecorder({ viewerApiRef }: TourRecorderProps) {
  const { t, i18n } = useTranslation('tour')
  const isMobile = useIsMobile()

  const tour = usePresentationStore((s) => s.tour)
  const addStep = usePresentationStore((s) => s.addStep)
  const removeStep = usePresentationStore((s) => s.removeStep)
  const moveStep = usePresentationStore((s) => s.moveStep)
  const updateCaption = usePresentationStore((s) => s.updateCaption)
  const play = usePresentationStore((s) => s.play)
  const setRecording = usePresentationStore((s) => s.setRecording)

  const activeModelId = useSceneStore((s) => s.activeModelId)

  const [justAdded, setJustAdded] = useState<string | null>(null)
  const dragId = useRef<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const steps = tour?.steps ?? []

  // ── Manual stop: current camera via the shared BCF/tour primitive ──────────
  const handleAddStop = useCallback(() => {
    const viewer = viewerApiRef.current
    const cam = viewer?.getCameraViewpoint()
    if (!cam) return
    const step: TourStep = {
      id: crypto.randomUUID(),
      camera: { position: cam.position, target: cam.target },
      modelId: activeModelId ?? undefined,
    }
    addStep(step)
    // Brief pulse on the new row so the presenter sees where it landed.
    setJustAdded(step.id)
    window.setTimeout(() => setJustAdded((v) => (v === step.id ? null : v)), 900)
  }, [viewerApiRef, addStep, activeModelId])

  // ── Fly-to preview: check what the audience will see, without playing ──────
  const handlePreview = useCallback((step: TourStep) => {
    viewerApiRef.current?.setCameraLookAt(step.camera.position, step.camera.target)
  }, [viewerApiRef])

  const stepTitle = useCallback((step: TourStep, index: number): string => {
    if (step.caption) return step.caption
    if (step.issueRuleId) return getRuleLabel(step.issueRuleId, i18n.language)
    return t('recorder.stop', { n: index + 1 })
  }, [i18n.language, t])

  const iconBtn = 'w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] active:scale-90 disabled:opacity-25 disabled:cursor-not-allowed transition-all duration-150'

  return (
    // A ViewportPanel like every other tool, rather than a panel that placed
    // itself. It used to hard-code `bottom-[76px]` for the mobile nav — a copy
    // of a number that has its own token — and `max-h-[55%]` of a container it
    // was not measured against, which is why it sat tight under the nav with the
    // cache badge across its primary button. Being in the system also brings
    // one-at-a-time, Escape, and the sheet with detents on mobile, none of which
    // it had. See docs/MOBILE_TOOLS.md.
    <ViewportPanel
      id="tour"
      open
      onClose={() => setRecording(false)}
      label={t('recorder.title')}
      mobile="sheet"
      widthPx={302}
      anchor="top"
    >
      <div className="flex flex-col min-h-0 max-h-full overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center gap-2 px-3 h-9 border-b border-[var(--border)] shrink-0">
          <span className="text-[12px] font-semibold text-[var(--text)]">{t('recorder.title')}</span>
          {steps.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-[var(--surface-2)] text-[9px] font-mono text-[var(--text-dim)] leading-none tabular-nums">
              {steps.length}
            </span>
          )}
          <div className="flex-1" />
          <button onClick={() => setRecording(false)} title={t('recorder.close')} className={iconBtn}>
            <Icons.X size={13} />
          </button>
        </div>

        {/* ── Goal-driven templates (D-26): what is this presentation for? ── */}
        <TemplateSelector viewerApiRef={viewerApiRef} />

        {/* ── Stops list ── */}
        <div className="flex-1 overflow-y-auto px-1.5 py-1.5 min-h-[56px]" onDragLeave={() => setDragOverIndex(null)}>
          {steps.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-4 text-center">
              <Icons.Replay size={20} className="text-[var(--text-faint)] opacity-50" />
              <p className="text-[11px] text-[var(--text-faint)] leading-relaxed">{t('recorder.empty')}</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {steps.map((step, i) => (
                <motion.div
                  key={step.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -12, transition: { duration: 0.12 } }}
                  transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                  draggable={!isMobile}
                  onDragStart={() => { dragId.current = step.id }}
                  onDragEnd={() => { dragId.current = null; setDragOverIndex(null) }}
                  onDragOver={(e) => { e.preventDefault(); if (dragId.current && dragId.current !== step.id) setDragOverIndex(i) }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragId.current && dragId.current !== step.id) moveStep(dragId.current, i)
                    dragId.current = null
                    setDragOverIndex(null)
                  }}
                  className={`group relative flex items-center gap-1 px-1.5 py-1 rounded-lg transition-colors duration-150 hover:bg-[var(--surface-2)] ${justAdded === step.id ? 'bg-[var(--surface-2)] ring-1 ring-[var(--accent)]' : ''}`}
                >
                  {/* Drop indicator line */}
                  {dragOverIndex === i && (
                    <span className="absolute -top-[2px] left-1 right-1 h-[2px] rounded-full bg-[var(--accent)]" />
                  )}

                  {!isMobile && (
                    <span className="cursor-grab active:cursor-grabbing text-[var(--text-faint)] opacity-0 group-hover:opacity-60 transition-opacity select-none text-[10px] leading-none" aria-hidden>
                      ⠿
                    </span>
                  )}
                  <span
                    className="w-[18px] h-[18px] flex items-center justify-center rounded-full text-[9px] font-mono tabular-nums shrink-0"
                    style={{
                      background: step.issueSeverity ? `color-mix(in srgb, ${SEVERITY_COLOR[step.issueSeverity]} 18%, transparent)` : 'var(--surface-2)',
                      color: step.issueSeverity ? SEVERITY_COLOR[step.issueSeverity] : 'var(--text-dim)',
                    }}
                  >
                    {i + 1}
                  </span>
                  <input
                    value={step.caption ?? ''}
                    placeholder={stepTitle(step, i)}
                    onChange={(e) => updateCaption(step.id, e.target.value)}
                    className="flex-1 min-w-0 bg-transparent text-[11px] text-[var(--text)] placeholder-[var(--text-dim)] outline-none border-b border-transparent focus:border-[var(--border-strong)] transition-colors"
                  />

                  {/* Row actions — appear on hover (always visible on touch) */}
                  <div className={`flex items-center shrink-0 ${isMobile ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity'}`}>
                    <button onClick={() => handlePreview(step)} title={t('recorder.preview')} className={iconBtn}>
                      <Icons.Eye size={12} />
                    </button>
                    <button onClick={() => moveStep(step.id, i - 1)} disabled={i === 0} title={t('recorder.moveUp')} className={iconBtn}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15l6-6 6 6" /></svg>
                    </button>
                    <button onClick={() => moveStep(step.id, i + 1)} disabled={i === steps.length - 1} title={t('recorder.moveDown')} className={iconBtn}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                    <button onClick={() => removeStep(step.id)} title={t('recorder.delete')} className={`${iconBtn} hover:!text-[var(--danger)]`}>
                      <Icons.X size={11} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* ── Footer actions ── */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-t border-[var(--border)] shrink-0">
          <button
            onClick={handleAddStop}
            className="flex-1 h-[32px] rounded-lg bg-[var(--surface-2)] border border-[var(--border-strong)] text-[12px] font-medium text-[var(--text)] hover:brightness-110 active:scale-[0.99] transition-all whitespace-nowrap"
          >
            + {t('recorder.addStop')}
          </button>
          <button
            onClick={() => play(0)}
            disabled={steps.length === 0}
            className="flex-1 h-[32px] flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] text-[12px] font-medium text-white hover:brightness-110 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition-all whitespace-nowrap"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>
            {t('recorder.play')}
          </button>
        </div>
      </div>
    </ViewportPanel>
  )
}
