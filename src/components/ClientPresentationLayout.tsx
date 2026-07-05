// ─── ClientPresentationLayout (D-25) ───────────────────────────────────────────
// The `ui=client` presentation skin: a show-only overlay for non-technical
// audiences (client, stakeholder, investor). It does NOT reimplement anything —
// App.tsx hides the technical chrome via the same EmbedChrome gates the embed
// presets already use, and this layout composes what remains:
//   · ClientHealthBadge (trust seal, top-left)
//   · "View walkthrough" CTA (bottom-center — Tour Mode integration)
//   · simplified capture pill (screenshot / replay — bottom-left)
//   · a deliberately discreet presenter gear (top-right) for advanced tools
// Postprocessing (SSAO/edges) turns on while the skin is active and the
// previous quality is restored on exit. Everything is a UI layer over the
// already-loaded state — no remount, camera and model persist. Lazy-loaded.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import * as Icons from './Icons'
import ClientHealthBadge from './ClientHealthBadge'
import { CaptureToolbar } from './CaptureToolbar'
import { useUIStore } from '../stores/uiStore'
import { usePresentationStore } from '../stores/presentationStore'
import { useValidationStore } from '../stores/validationStore'
import { useSceneStore } from '../stores/sceneStore'
import { toastFromError } from '../stores/toastStore'
import { startAutoTour } from '../lib/tour/startAutoTour'
import { createLogger } from '../lib/logger'
import type { ValidationIssue } from '../types'
import type { ViewerAPI } from '../lib/viewer'

const log = createLogger('ClientMode')

interface ClientPresentationLayoutProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  /**
   * Whether the presenter gear offers "exit presentation mode". False when the
   * skin came from a `?ui=client` URL/embed — a link receiver should not be
   * able to escape into technical chrome the link author never exposed.
   */
  canExit?: boolean
}

export default function ClientPresentationLayout({ viewerApiRef, canExit = true }: ClientPresentationLayoutProps) {
  const { t } = useTranslation('client')
  const { t: tTour } = useTranslation('tour')

  const setClientMode = useUIStore((s) => s.setClientMode)
  const clientAdvancedTools = useUIStore((s) => s.clientAdvancedTools)
  const setClientAdvancedTools = useUIStore((s) => s.setClientAdvancedTools)
  const toggleMeasurementPanel = useUIStore((s) => s.toggleMeasurementPanel)
  const toggleClipPanel = useUIStore((s) => s.toggleClipPanel)
  const measurementPanelOpen = useUIStore((s) => s.measurementPanelOpen)
  const clipPanelOpen = useUIStore((s) => s.clipPanelOpen)

  const tour = usePresentationStore((s) => s.tour)
  const tourMode = usePresentationStore((s) => s.mode)
  const play = usePresentationStore((s) => s.play)

  const hasModel = useSceneStore((s) => s.models.length > 0)
  const cachedResults = useValidationStore((s) => s.cachedResultsByModel)
  const result = useValidationStore((s) => s.result)
  const issues = useMemo<ValidationIssue[]>(() => {
    const all = Object.values(cachedResults).flatMap((r) => r.issues)
    return all.length > 0 ? all : (result?.issues ?? [])
  }, [cachedResults, result])

  const [gearOpen, setGearOpen] = useState(false)
  const [generating, setGenerating] = useState(false)

  // ── Quality-first rendering while the skin is active (restored on exit) ─────
  useEffect(() => {
    const viewer = viewerApiRef.current
    const previous = useUIStore.getState().renderQuality
    useUIStore.getState().setRenderQuality('quality')
    viewer?.setRenderQuality('quality')
    return () => {
      useUIStore.getState().setRenderQuality(previous)
      viewerApiRef.current?.setRenderQuality(previous)
    }
  }, [viewerApiRef])

  // ── Walkthrough CTA: play the existing tour, or generate one on the spot ────
  const handleWalkthrough = useCallback(async () => {
    if (tour && tour.steps.length > 0) { play(0); return }
    const viewer = viewerApiRef.current
    if (!viewer || issues.length === 0 || generating) return
    setGenerating(true)
    try {
      await startAutoTour(viewer, issues, tTour('autoTitle'))
    } catch (e) {
      log.error('walkthrough generation failed:', e)
      toastFromError(e, 'error')
    } finally {
      setGenerating(false)
    }
  }, [tour, play, viewerApiRef, issues, generating, tTour])

  const playing = tourMode === 'playing'
  const canWalkthrough = (tour && tour.steps.length > 0) || issues.length > 0

  return (
    <>
      {/* Trust seal — the centrepiece */}
      <ClientHealthBadge />

      {/* ── Presenter gear — deliberately discreet (top-right corner) ── */}
      <div className="absolute top-3 right-3 z-[26] pointer-events-auto">
        <button
          onClick={() => setGearOpen((v) => !v)}
          title={t('gear.title')}
          aria-expanded={gearOpen}
          className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all duration-200 ${
            gearOpen
              ? 'opacity-100 bg-[rgba(12,12,16,0.9)] border-[var(--border-strong)] text-[var(--text)]'
              : 'opacity-25 hover:opacity-90 bg-[rgba(12,12,16,0.6)] border-transparent hover:border-[var(--border)] text-[var(--text-dim)]'
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h.01a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.01a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>

        <AnimatePresence>
          {gearOpen && (
            <>
              <div className="fixed inset-0 z-[-1]" onClick={() => setGearOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="absolute right-0 top-full mt-1.5 min-w-[210px] py-1.5 rounded-xl bg-[rgba(12,12,16,0.95)] backdrop-blur-[18px] border border-[var(--border-strong)] shadow-2xl"
              >
                <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                  {t('gear.advanced')}
                </div>
                <GearItem
                  label={t('gear.measure')}
                  active={clientAdvancedTools && measurementPanelOpen}
                  onClick={() => {
                    setClientAdvancedTools(true)
                    toggleMeasurementPanel()
                  }}
                />
                <GearItem
                  label={t('gear.section')}
                  active={clientAdvancedTools && clipPanelOpen}
                  onClick={() => {
                    setClientAdvancedTools(true)
                    toggleClipPanel()
                  }}
                />
                {canExit && (
                  <>
                    <div className="my-1 h-px bg-[var(--border)]" />
                    <GearItem
                      label={t('gear.exit')}
                      onClick={() => setClientMode(false)}
                    />
                  </>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom overlays — yield entirely while the tour bar plays ── */}
      {!playing && (
        <>
          {/* Walkthrough CTA — the primary action, front and centre */}
          {hasModel && canWalkthrough && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28, delay: 0.2 }}
              className="absolute bottom-16 sm:bottom-4 left-1/2 -translate-x-1/2 z-[24] pointer-events-auto"
            >
              <button
                onClick={() => void handleWalkthrough()}
                disabled={generating}
                className="flex items-center gap-2 h-[40px] px-5 rounded-full bg-[var(--accent)] text-white text-[13px] font-semibold shadow-[0_8px_28px_rgba(0,0,0,0.45)] hover:brightness-110 active:scale-[0.98] disabled:opacity-60 transition-all whitespace-nowrap"
              >
                {generating ? (
                  <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 3a9 9 0 1 1-9 9" /></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>
                )}
                {tour && tour.steps.length > 0 ? t('cta.tour') : t('cta.generateTour')}
              </button>
            </motion.div>
          )}

          {/* Simplified capture pill (owns the replay buffer here — the main
              toolbar is hidden in client mode; the TourPlayer instance takes
              over while playing, which is why this whole block yields then) */}
          {hasModel && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28, delay: 0.28 }}
              className="absolute bottom-16 sm:bottom-4 left-3 z-[24] pointer-events-auto"
            >
              <div className="flex items-center px-1.5 py-1 rounded-xl bg-[rgba(12,12,16,0.88)] backdrop-blur-[18px] border border-[var(--border)] shadow-lg">
                <CaptureToolbar viewerApiRef={viewerApiRef} replay={true} />
              </div>
            </motion.div>
          )}
        </>
      )}
    </>
  )
}

function GearItem({ label, onClick, active = false }: { label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
        active ? 'text-[var(--accent)] font-medium' : 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
      }`}
    >
      {label}
      {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />}
    </button>
  )
}
