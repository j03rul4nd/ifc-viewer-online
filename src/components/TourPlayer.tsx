// ─── TourPlayer (Tour Mode — D-24) ─────────────────────────────────────────────
// Presentation bar for the guided validation walkthrough. Deliberately
// "show-only": no technical panels, no editing — the presenter steps through
// issues while the camera flies to each one (native camera-controls easing)
// and non-technical viewers read the D-22 remediation text.
//
// Environment-aware by design: mounts INSIDE the viewer container (absolute,
// not fixed) so it never overlaps the tree/sidebar chrome, collapses the
// docked validation panel while presenting (and restores it on exit), and the
// mobile bottom nav yields while a tour is playing (gated in App.tsx).
// Lazy-loaded; works in normal mode and embed kiosk alike.

import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import * as Icons from './Icons'
import { CaptureToolbar } from './CaptureToolbar'
import { usePresentationStore } from '../stores/presentationStore'
import { useValidationStore } from '../stores/validationStore'
import { useCaptureStore } from '../stores/captureStore'
import { useUIStore } from '../stores/uiStore'
import { toast } from '../stores/toastStore'
import { appBus } from '../lib/event-bus'
import { buildTourShareUrl } from '../lib/share/tourShareLink'
import { replayController } from '../lib/capture/replay-controller'
import { PRESENTATION_TEMPLATES } from '../lib/templates/presentationTemplates'
import { computeTrimToLastSeconds } from '../lib/capture/replay-buffer-core'
import { exportGif, readClipDuration } from '../lib/capture/gif-export'
import { createTimeline } from '../lib/capture/timeline'
import { downloadBlob } from '../lib/diffStore'
import { createLogger } from '../lib/logger'
import { getRuleLabel, type ValidationIssue, type TourStep } from '../types'
import { getRuleRemediation, AUTHORING_TOOLS, type AuthoringTool } from '../i18n/rule-remediation'
import type { ViewerAPI } from '../lib/viewer'

const log = createLogger('TourPlayer')

const TOOL_LABELS: Record<AuthoringTool, string> = {
  revit: 'Revit', archicad: 'ArchiCAD', tekla: 'Tekla', allplan: 'Allplan',
}
const LS_TOOL = 'ifc-tour-tool:v1'

function readTool(): AuthoringTool {
  try {
    const raw = localStorage.getItem(LS_TOOL)
    return (AUTHORING_TOOLS as readonly string[]).includes(raw ?? '') ? raw as AuthoringTool : 'revit'
  } catch {
    return 'revit'
  }
}

/** Minimal synthetic issues so a tour step can reuse the validation overlay
 *  channel without depending on the live validation result being present. */
function stepHighlightIssues(step: TourStep): ValidationIssue[] {
  return (step.highlightedExpressIds ?? []).map((expressId) => ({
    id: `tour-${step.id}-${expressId}`,
    ruleId: step.issueRuleId ?? 'TOUR_STEP',
    severity: step.issueSeverity ?? 'info',
    expressId,
    globalId: null,
    ifcClass: '',
    elementName: '',
    message: step.caption ?? '',
    path: [],
    autoFixable: false,
    modelId: step.modelId,
  }))
}

const SEVERITY_COLOR = { error: 'var(--danger)', warning: '#F5A623', info: '#3B82F6' } as const

/** Accent for manual (camera-only) stops; severity colour for issue steps. */
function stepColor(step: TourStep): string {
  return step.issueSeverity ? SEVERITY_COLOR[step.issueSeverity] : 'var(--accent)'
}

/** Above this many steps the dot rail becomes a slim progress bar. */
const MAX_DOTS = 14

interface TourPlayerProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  /**
   * True when the main toolbar chrome is hidden (embed kiosk) — this bar then
   * owns the replay buffer instead of the Toolbar's CaptureToolbar instance.
   */
  ownsCaptureReplay?: boolean
  /**
   * Public URLs of the loaded models (?model= deep link). Empty for models
   * loaded from disk — the share link is then honestly unavailable (D-26).
   */
  shareModelUrls?: string[]
}

export default function TourPlayer({ viewerApiRef, ownsCaptureReplay = false, shareModelUrls = [] }: TourPlayerProps) {
  const { t, i18n } = useTranslation('tour')

  const tour = usePresentationStore((s) => s.tour)
  const stepIndex = usePresentationStore((s) => s.stepIndex)
  const isolateActive = usePresentationStore((s) => s.isolateActive)
  const setStepIndex = usePresentationStore((s) => s.setStepIndex)
  const setIsolateActive = usePresentationStore((s) => s.setIsolateActive)
  const exitPlayback = usePresentationStore((s) => s.exitPlayback)
  const templateId = usePresentationStore((s) => s.templateId)
  const clientMode = useUIStore((s) => s.clientMode)
  const watermark = useCaptureStore((s) => s.watermark)
  const aspectPreset = useCaptureStore((s) => s.aspectPreset)
  const exporting = useCaptureStore((s) => s.exporting)
  const exportProgress = useCaptureStore((s) => s.exportProgress)

  const [tool, setTool] = useState<AuthoringTool>(readTool)
  const selectTool = useCallback((v: AuthoringTool) => {
    setTool(v)
    try { localStorage.setItem(LS_TOOL, v) } catch { /* quota */ }
  }, [])

  // "How to fix" starts open on desktop (audience reads along) and collapsed
  // on mobile/tablet, where the model needs the room to breathe.
  const [fixOpen, setFixOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768)

  const total = tour?.steps.length ?? 0
  const step = tour?.steps[stepIndex] ?? null

  // ── Give the stage to the tour: collapse the docked validation panel while
  //    presenting; put it back exactly as it was on exit. ────────────────────
  useEffect(() => {
    const ui = useUIStore.getState()
    const wasOpen = ui.validationPanelOpen
    ui.setValidationPanelOpen(false)
    return () => { useUIStore.getState().setValidationPanelOpen(wasOpen) }
  }, [])

  // ── Lifecycle events (D-13) ────────────────────────────────────────────────
  useEffect(() => {
    if (!tour) return
    appBus.emit('tour:started', { tourId: tour.id, createdFrom: tour.createdFrom, steps: tour.steps.length })
  // Intentionally once per mounted playback session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!tour) return
    appBus.emit('tour:step-changed', { tourId: tour.id, index: stepIndex, total })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex])

  // ── Apply the step to the viewer: camera + highlight overlay ──────────────
  useEffect(() => {
    const viewer = viewerApiRef.current
    if (!viewer || !step) return
    viewer.setCameraLookAt(step.camera.position, step.camera.target)
    const issues = stepHighlightIssues(step)
    if (issues.length > 0) viewer.setValidationHighlights(issues, true)
    else viewer.setValidationHighlights([], false)
  }, [viewerApiRef, step])

  // ── Isolate toggle (re-applied per step while active) ──────────────────────
  useEffect(() => {
    const viewer = viewerApiRef.current
    if (!viewer) return
    const targets = (step?.highlightedExpressIds ?? []).map((expressId) => ({ expressId, modelId: step?.modelId }))
    if (isolateActive && targets.length > 0) viewer.isolateElements(targets, true)
    else viewer.isolateElements([], false)
  }, [viewerApiRef, step, isolateActive])

  // ── Restore viewer state when leaving the tour ─────────────────────────────
  useEffect(() => {
    const viewer = viewerApiRef.current
    return () => {
      if (!viewer) return
      viewer.isolateElements([], false)
      // Hand the shared overlay channel back to the validation panel's state.
      const { validationMode, result } = useValidationStore.getState()
      if (validationMode && result) viewer.setValidationHighlights(result.issues, true)
      else viewer.setValidationHighlights([], false)
    }
  }, [viewerApiRef])

  const finish = useCallback(() => {
    if (tour) appBus.emit('tour:completed', { tourId: tour.id })
    exitPlayback()
  }, [tour, exitPlayback])

  const next = useCallback(() => {
    if (stepIndex >= total - 1) finish()
    else setStepIndex(stepIndex + 1)
  }, [stepIndex, total, finish, setStepIndex])

  const prev = useCallback(() => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1)
  }, [stepIndex, setStepIndex])

  // ── Share link (D-26 — extends the D-21 mechanism, #tour= hash fragment) ────
  const handleCopyLink = useCallback(async () => {
    if (!tour) return
    const r = buildTourShareUrl(tour, { modelUrls: shareModelUrls, clientMode, templateId })
    if (!r.ok) {
      // Honest limit: a disk-loaded model cannot travel in a link (D-26).
      toast(r.reason === 'no-model-url' ? t('share.noModelUrl') : t('share.tooLong'), 'warning', { duration: 6000 })
      return
    }
    try {
      await navigator.clipboard.writeText(r.url)
      toast(t('share.copied'), 'success')
    } catch (e) {
      log.warn('clipboard write failed:', e)
      toast(t('share.copyFailed'), 'error')
    }
  }, [tour, shareModelUrls, clientMode, templateId, t])

  // ── One-click social export: replay capture + GIF with the template's
  //    defaults (aspect/watermark/duration) — zero reconfiguration (D-26) ─────
  const handleSocialExport = useCallback(async () => {
    if (exporting) return
    const capture = replayController.capture
    if (!capture) { toast(t('share.noBuffer'), 'warning'); return }
    const tpl = templateId && templateId in PRESENTATION_TEMPLATES
      ? PRESENTATION_TEMPLATES[templateId as keyof typeof PRESENTATION_TEMPLATES]
      : undefined
    const seconds = tpl?.gifSeconds ?? 8
    const store = useCaptureStore.getState()
    store.startExport()
    try {
      const blob = await capture(seconds)
      const duration = (await readClipDuration(blob)) || seconds
      const result = await exportGif(blob, {
        fps: 10,
        targetHeight: 480,
        // One-click export: the template's framing, no text and no transitions.
        timeline: createTimeline(computeTrimToLastSeconds(duration, seconds)),
        watermark,
        aspect: aspectPreset,
        fit: store.fit,
        padStyle: store.padStyle,
        onProgress: store.setExportProgress,
      })
      if (result.ok) {
        const stamp = new Date().toISOString().slice(0, 10)
        await downloadBlob(result.value, `ifc-tour-${stamp}.gif`)
        appBus.emit('capture:exported', { format: 'gif', target: 'download' })
        toast(t('share.exported'), 'success')
      } else {
        toast(result.error.message, 'error')
      }
    } catch (e) {
      log.error('social export failed:', e)
      toast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      store.finishExport()
    }
  }, [exporting, templateId, watermark, aspectPreset, t])

  // ── Keyboard: ← → navigate, Esc exits ─────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.key === 'ArrowRight') { e.preventDefault(); next() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
      else if (e.key === 'Escape') { e.preventDefault(); exitPlayback() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, exitPlayback])

  if (!tour || !step) return null

  const remediation = step.issueRuleId ? getRuleRemediation(step.issueRuleId, i18n.language) : undefined
  const title = step.caption
    || (step.issueRuleId ? getRuleLabel(step.issueRuleId, i18n.language) : t('recorder.stop', { n: stepIndex + 1 }))
  const fixText = remediation ? (remediation.tools[tool] ?? remediation.summary) : null
  const canIsolate = (step.highlightedExpressIds?.length ?? 0) > 0
  const accent = stepColor(step)

  const navBtn = 'w-9 h-9 md:w-8 md:h-8 flex items-center justify-center rounded-lg text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150'

  return (
    <motion.div
      initial={{ opacity: 0, y: 28, x: '-50%' }}
      animate={{ opacity: 1, y: 0, x: '-50%' }}
      exit={{ opacity: 0, y: 28, x: '-50%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="absolute bottom-2 md:bottom-3 left-1/2 z-[30] w-[calc(100%-12px)] md:w-[calc(100%-32px)] max-w-[720px] pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="pointer-events-auto bg-[rgba(12,12,16,0.92)] backdrop-blur-[18px] border border-[var(--border-strong)] rounded-2xl shadow-[0_12px_48px_rgba(0,0,0,0.55)] overflow-hidden">

        {/* ── Step content — crossfades between steps ── */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="px-4 pt-3 pb-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
              <span className="text-[13px] font-semibold text-[var(--text)] truncate">{title}</span>
              {typeof step.issueCount === 'number' && step.issueCount > 0 && (
                <span className="text-[11px] text-[var(--text-faint)] whitespace-nowrap shrink-0">
                  · {t('player.affected', { count: step.issueCount })}
                </span>
              )}
              <div className="flex-1" />
              {fixText && (
                <button
                  onClick={() => setFixOpen((v) => !v)}
                  className="flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
                  aria-expanded={fixOpen}
                >
                  {t('player.howToFix')}
                  <motion.svg
                    animate={{ rotate: fixOpen ? 180 : 0 }} transition={{ duration: 0.18 }}
                    width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </motion.svg>
                </button>
              )}
            </div>

            {/* Collapsible remediation — the model gets room to breathe when closed */}
            <AnimatePresence initial={false}>
              {fixText && fixOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div className="pt-1.5">
                    <div className="flex items-center gap-1 flex-wrap">
                      {AUTHORING_TOOLS.map((tl) => (
                        <button
                          key={tl}
                          onClick={() => selectTool(tl)}
                          className={`px-2 py-1 md:py-0.5 rounded-md text-[10px] font-medium transition-all duration-150 ${
                            tl === tool
                              ? 'bg-[var(--accent)] text-white shadow-sm'
                              : 'text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
                          }`}
                        >
                          {TOOL_LABELS[tl]}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-dim)] max-h-[64px] md:max-h-[84px] overflow-y-auto pr-1">
                      {fixText}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>

        {/* ── Step rail: severity-coloured dots (clickable) or slim progress ── */}
        <div className="px-4 pb-1.5">
          {total <= MAX_DOTS ? (
            <div className="flex items-center justify-center gap-[7px]" role="tablist" aria-label={t('player.stepOf', { current: stepIndex + 1, total })}>
              {tour.steps.map((s, i) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={i === stepIndex}
                  onClick={() => setStepIndex(i)}
                  title={s.caption || (s.issueRuleId ? getRuleLabel(s.issueRuleId, i18n.language) : t('player.goToStep', { n: i + 1 }))}
                  className="rounded-full transition-all duration-250 ease-out hover:scale-125"
                  style={{
                    width: i === stepIndex ? 20 : 6,
                    height: 6,
                    background: i === stepIndex ? stepColor(s) : 'var(--border-strong)',
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="h-[3px] rounded-full bg-[var(--surface-2)] overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-300 ease-out"
                style={{ width: `${((stepIndex + 1) / total) * 100}%`, background: accent }}
              />
            </div>
          )}
        </div>

        {/* ── Controls row ── */}
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-t border-[var(--border)]">
          <button onClick={exitPlayback} title={`${t('player.exit')} (Esc)`} className={navBtn}>
            <Icons.X size={14} />
          </button>

          {/* Keyboard hint — desktop only, invisible to a projected audience */}
          <div className="hidden lg:flex items-center gap-1 ml-1 text-[var(--text-faint)] select-none" aria-hidden>
            {['←', '→'].map((k) => (
              <kbd key={k} className="px-1 py-0.5 rounded border border-[var(--border)] text-[9px] font-mono leading-none">{k}</kbd>
            ))}
          </div>

          <div className="flex-1" />

          <button onClick={prev} disabled={stepIndex === 0} title={t('player.prev')} className={navBtn}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <span className="px-2 min-w-[86px] text-center text-[12px] font-medium text-[var(--text-dim)] tabular-nums whitespace-nowrap">
            {t('player.stepOf', { current: stepIndex + 1, total })}
          </span>
          <button
            onClick={next}
            title={stepIndex >= total - 1 ? t('player.finish') : t('player.next')}
            className={`${navBtn} !text-white rounded-lg`}
            style={{ background: stepIndex >= total - 1 ? 'var(--ok, #22c55e)' : 'var(--accent)' }}
          >
            {stepIndex >= total - 1
              ? <Icons.Check size={14} />
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>}
          </button>

          <div className="flex-1" />

          {/* Share link — honest limit surfaced via toast for disk-loaded models */}
          <button onClick={() => void handleCopyLink()} title={t('share.copy')} className={navBtn}>
            <Icons.Link size={14} />
          </button>

          {/* One-click social GIF — only for the social template (D-26) */}
          {templateId === 'social' && (
            <button
              onClick={() => void handleSocialExport()}
              disabled={exporting}
              title={t('share.linkedin')}
              className={`${navBtn} ${exporting ? '!w-auto px-1.5' : ''}`}
            >
              {exporting
                ? <span className="text-[10px] font-mono tabular-nums">{exportProgress}%</span>
                : <Icons.Share size={14} />}
            </button>
          )}

          <button
            onClick={() => setIsolateActive(!isolateActive)}
            disabled={!canIsolate}
            title={t('player.isolate')}
            className={`${navBtn} ${isolateActive && canIsolate ? '!text-[var(--accent)] bg-[var(--surface-2)]' : ''}`}
          >
            <Icons.Isolate size={14} />
          </button>

          {/* Capture Toolkit at hand during the tour (screenshot always;
              replay here only in kiosk — else the Toolbar instance owns it) */}
          <CaptureToolbar viewerApiRef={viewerApiRef} replay={ownsCaptureReplay} />
        </div>
      </div>
    </motion.div>
  )
}
