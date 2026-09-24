// ─── LoadingIndicator ─────────────────────────────────────────────────────────
// The one always-visible sign that the loading system is doing something, and
// the handle that opens the Loading Center.
//
//   nothing ever loaded     → not rendered
//   one job                 → "Loading Hotel_Vela.ifc · 72%"
//   several                 → "Loading 3 models · 68%"   (size-weighted)
//                             "Loading 3 files"  when a scan, a mesh or a GIS
//                             fetch is among them: loads, not models
//   nothing measuring       → the same label, a turning ring and NO percent
//                             (a GIS fetch, a header check: "0%" would be made up)
//   only queued / on hold   → "3 queued"
//   background enrichment   → "Finishing up"
//   unseen failures         → "1 failed" (danger), or a red count badge while
//                             other work is still running
//   a burst just ended      → "All models loaded ✓" for 2.5 s — only when a
//                             model of yours (managed IFC, not a scan or a
//                             mesh) landed in it and nothing failed
//   idle with history       → a quiet icon button (every variant), so the
//                             Loading Center — failed rows with Retry, timings,
//                             cache, session metrics — can be reopened at any
//                             time, in client/kiosk presets and on phones too;
//                             it carries a red dot while a failed row remains
//
// Below the xl breakpoint the toolbar chip collapses to ring + "42%": zone A
// shares the bar with every other control and must not push them off-screen.
//
// Re-render cost: it subscribes to a handful of summary NUMBERS through a
// shallow selector, plus three primitives derived from the jobs (the single
// job's display name, whether every active row is a model, how many failed
// rows are models) — never to the jobs array itself — so ten progress
// snapshots a second re-render this chip only when the rounded percent, or
// one of those answers, actually moves.
//
// Screen readers get transitions ("Loading 3 models", "1 model failed to
// load" — "1 load failed" when it was a scan —, "All models loaded") through a
// polite live region — not a stream of percentages, which would make the page
// unusable while a big file converts.
// Failures are announced from the raw failed count, not from "unseen": with
// the Loading Center open every failure is "seen" the instant it lands, and a
// sighted user reading the red row is not the same as being told.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useShallow } from 'zustand/react/shallow'
import { useLoadingStore, selectCenterOpen } from '../../stores/loadingStore'
import { useLoadingT } from '../../i18n/hooks/namespaces'
import {
  activeAreAllModels, burstBaseline, burstLoadedModels, countFailedModels, displayPercent, failureAnnouncement,
  indicatorModel, singleActiveName, type BurstBaseline, type IndicatorModel,
} from './job-view'
import { CheckGlyph, ClockGlyph, ProgressRing, WarnGlyph } from './glyphs'

export type LoadingIndicatorVariant = 'toolbar' | 'floating' | 'mobile'

/** How long the calm "all loaded" state stays before the chip goes away. */
const DONE_MS = 2500

/** Same clearance as the OPFS cache badge in App: above the mobile nav, 16 px on desktop. */
const FLOATING_BOTTOM = 'max(calc(var(--mobile-nav-h) + var(--mobile-nav-margin) + env(safe-area-inset-bottom, 0px) + 8px), 16px)'

export function LoadingIndicator({ variant }: { variant: LoadingIndicatorVariant }) {
  const { t } = useLoadingT()
  const reduce = useReducedMotion()

  const s = useLoadingStore(useShallow((st) => ({
    active: st.summary.active,
    running: st.summary.running,
    waiting: st.summary.waiting,
    queued: st.summary.queued,
    held: st.summary.held,
    finishing: st.summary.finishing,
    failed: st.summary.failed,
    unseenFailures: st.summary.unseenFailures,
    measuring: st.summary.measuring,
    percent: displayPercent(st.summary.fraction, false),
  })))
  // Walk the jobs only when there is exactly one active job to name.
  const singleName = useLoadingStore((st) => (st.summary.active === 1 ? singleActiveName(st.jobs) : null))
  // "models" or "files" for the count, and which new failures were models —
  // each walked only while there is something of that kind to count.
  const activeAllModels = useLoadingStore((st) => st.summary.active === 0 || activeAreAllModels(st.jobs))
  const failedModels = useLoadingStore((st) => (st.summary.failed > 0 ? countFailedModels(st.jobs) : 0))
  const hasHistory = useLoadingStore((st) => st.jobs.length > 0)
  const open = useLoadingStore(selectCenterOpen)
  const toggleCenter = useLoadingStore((st) => st.toggleCenter)

  // ── The "all loaded" moment ────────────────────────────────────────────────
  // Decided from the burst itself: what had landed or failed is noted when the
  // queue turns busy, and the idle edge asks whether one of YOUR models landed
  // since and nothing failed. Totals cannot answer that — "3 loaded" includes
  // the model from an hour ago, so a burst that only cancelled a file, only
  // fetched GIS terrain or only brought in a scan would end on a green check.
  // The jobs are read from the store at the two edges only, never subscribed to.
  const busy = s.active > 0 || s.finishing > 0
  const [showDone, setShowDone] = useState(false)
  const baseline = useRef<BurstBaseline | null>(null)
  useEffect(() => {
    if (busy) {
      if (!baseline.current) baseline.current = burstBaseline(useLoadingStore.getState().jobs)
      setShowDone(false)
      return
    }
    const base = baseline.current
    baseline.current = null
    if (!base || !burstLoadedModels(base, useLoadingStore.getState().jobs)) return
    setShowDone(true)
    const id = window.setTimeout(() => setShowDone(false), DONE_MS)
    return () => window.clearTimeout(id)
  }, [busy])

  const model = useMemo(() => indicatorModel({
    active: s.active, running: s.running, waiting: s.waiting, queued: s.queued, held: s.held,
    finishing: s.finishing, unseenFailures: s.unseenFailures, percent: s.percent, measuring: s.measuring,
    singleName, activeAllModels, showDone,
  }, t), [s, singleName, activeAllModels, showDone, t])

  // ── Announcements (transitions only) ───────────────────────────────────────
  const [announcement, setAnnouncement] = useState('')
  const prevKind = useRef(model.kind)
  const prevFailed = useRef(s.failed)
  const prevFailedModels = useRef(failedModels)
  useEffect(() => {
    const newFailures = s.failed - prevFailed.current
    let next: string | null = null
    if (newFailures > 0) {
      next = failureAnnouncement(newFailures, failedModels - prevFailedModels.current, t)
    } else if (model.kind !== prevKind.current && (model.kind === 'active' || model.kind === 'queued' || model.kind === 'done')) {
      next = model.label
    }
    // The same sentence twice in a row is not a DOM change, so the live
    // region would stay silent: a trailing no-break space makes it one.
    if (next != null) {
      const text = next
      setAnnouncement((prev) => (prev === text ? `${text}\u00A0` : text))
    }
    prevKind.current = model.kind
    prevFailed.current = s.failed
    prevFailedModels.current = failedModels
    // `model.label` is read at the transition on purpose: a label change
    // WITHOUT a kind change (another file's name) is not announced.
    // `failedModels` is a dependency only so its baseline never goes stale.
  }, [model.kind, s.failed, failedModels]) // eslint-disable-line react-hooks/exhaustive-deps

  // Every variant keeps a quiet entry once there is a history: without a
  // toolbar (client / kiosk) or on a phone there is no other way back to a
  // failed row's Retry once its "1 failed" has been seen.
  const visible = model.kind !== 'hidden' || hasHistory
  const fade = { duration: reduce ? 0 : 0.18 }

  return (
    <>
      <span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
      <AnimatePresence initial={false}>
        {visible && (
          <motion.div
            key="loading-indicator"
            initial={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
            transition={fade}
            className={variant === 'floating' ? 'fixed left-4 z-[24]' : 'inline-flex min-w-0 max-w-full'}
            style={variant === 'floating' ? { bottom: FLOATING_BOTTOM } : undefined}
          >
            <IndicatorButton variant={variant} model={model} failedRows={s.failed} open={open} onClick={toggleCenter} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function Glyph({ model, size }: { model: IndicatorModel; size: number }) {
  switch (model.kind) {
    // No percent = nothing measures right now: a turning arc, not an empty ring.
    case 'active':    return model.percent != null
      ? <ProgressRing fraction={model.percent / 100} size={size} />
      : <ProgressRing fraction={0} size={size} spinning />
    case 'queued':    return <ClockGlyph size={size} className="text-[var(--text-faint)] shrink-0" />
    case 'finishing': return <ProgressRing fraction={1} size={size} color="var(--ok)" spinning />
    case 'failed':    return <WarnGlyph size={size} className="shrink-0" />
    case 'done':      return <CheckGlyph size={size} className="shrink-0" />
    default:          return null
  }
}

function FailureBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[14px] h-[14px] px-[3px] rounded-full bg-[var(--danger)] text-white text-[9px] font-semibold tabular-nums shrink-0">
      {count}
    </span>
  )
}

/** The idle entry: an icon, and a red dot while a failed row is still listed. */
function HistoryButton({
  variant, open, failedRows, onClick,
}: { variant: LoadingIndicatorVariant; open: boolean; failedRows: number; onClick: () => void }) {
  const { t } = useLoadingT()
  const label = failedRows > 0 ? `${t('indicator.open')} · ${t('indicator.failed', { count: failedRows })}` : t('indicator.open')
  const shape = {
    toolbar:  'w-[22px] h-[22px] rounded-[6px]',
    mobile:   'w-[26px] h-[26px] rounded-full',
    floating: 'w-[28px] h-[28px] rounded-[8px] bg-[rgba(12,12,16,0.92)] backdrop-blur-[14px] shadow-lg',
  }[variant]
  const rest = variant === 'toolbar'
    ? 'border-transparent hover:border-[var(--border)]'
    : 'border-[var(--border)] hover:border-[var(--border-strong)]'
  return (
    <button
      type="button"
      onClick={onClick}
      data-loading-center-toggle=""
      aria-expanded={open}
      aria-controls={open ? 'loading-center' : undefined}
      title={label}
      aria-label={label}
      className={[
        'relative inline-flex items-center justify-center border select-none transition-colors duration-100',
        'focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent)]',
        shape,
        open
          ? 'border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text)]'
          : `${rest} text-[var(--text-faint)] hover:text-[var(--text-dim)]`,
      ].join(' ')}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
        <path d="M6 1.5v5.5M3.8 4.8 6 7l2.2-2.2" />
        <path d="M1.8 8.2v1.3c0 .6.4 1 1 1h6.4c.6 0 1-.4 1-1V8.2" />
      </svg>
      {failedRows > 0 && (
        <span aria-hidden="true" className="absolute top-[3px] right-[3px] w-[6px] h-[6px] rounded-full bg-[var(--danger)]" />
      )}
    </button>
  )
}

function IndicatorButton({
  variant, model, failedRows, open, onClick,
}: { variant: LoadingIndicatorVariant; model: IndicatorModel; failedRows: number; open: boolean; onClick: () => void }) {
  const { t } = useLoadingT()
  if (model.kind === 'hidden') return <HistoryButton variant={variant} open={open} failedRows={failedRows} onClick={onClick} />

  const failed = model.kind === 'failed'
  const done = model.kind === 'done'
  const badge = model.failures > 0 && !failed ? <FailureBadge count={model.failures} /> : null
  const fullLabel = model.percent != null ? `${model.label} · ${model.percent}%` : model.label
  const common = {
    type: 'button' as const,
    onClick,
    // The Loading Center's outside-press handler leaves this button alone: it
    // toggles the center itself, and closing on its pointerdown would make
    // its click reopen the center.
    'data-loading-center-toggle': '',
    'aria-expanded': open,
    // Points at the center only while it exists (it unmounts when closed).
    'aria-controls': open ? 'loading-center' : undefined,
    'aria-label': fullLabel,
    title: `${fullLabel}${open ? '' : ` — ${t('indicator.open')}`}`,
  }
  const toneText = failed ? 'text-[var(--danger)]' : done ? 'text-[var(--ok)]' : open ? 'text-[var(--text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'

  if (variant === 'mobile') {
    // Phones get the number, not the sentence: the pill shares a 44 px bar
    // with the logo and the status, and the center is one tap away. With
    // nothing measuring, the turning ring alone says "working".
    const short = model.kind === 'active'
      ? (model.percent != null ? `${model.percent}%` : '')
      : model.kind === 'done' || model.kind === 'finishing' ? '' : model.label
    return (
      <button
        {...common}
        className={[
          'inline-flex items-center gap-1.5 h-[26px] px-2 rounded-full border text-[11px] font-medium tabular-nums select-none',
          failed ? 'border-[rgba(229,72,77,0.35)] bg-[rgba(229,72,77,0.1)]' : 'border-[var(--border)] bg-[rgba(255,255,255,0.04)]',
          toneText,
        ].join(' ')}
      >
        <Glyph model={model} size={13} />
        {short && <span className="whitespace-nowrap">{short}</span>}
        {badge}
      </button>
    )
  }

  if (variant === 'floating') {
    return (
      <button
        {...common}
        className={[
          'relative inline-flex items-center gap-2 h-[28px] max-w-[min(320px,calc(100vw-32px))] pl-2 pr-2.5 rounded-[8px] overflow-hidden',
          'bg-[rgba(12,12,16,0.92)] backdrop-blur-[14px] border shadow-lg text-[11px] select-none transition-colors duration-100',
          failed ? 'border-[rgba(229,72,77,0.4)]' : open ? 'border-[var(--border-strong)]' : 'border-[var(--border)] hover:border-[var(--border-strong)]',
          toneText,
        ].join(' ')}
      >
        <Glyph model={model} size={13} />
        <span className="truncate min-w-0">{model.label}</span>
        {model.percent != null && <span className="font-mono tabular-nums text-[var(--text-dim)] shrink-0">{model.percent}%</span>}
        {badge}
        {model.percent != null && (
          <span className="absolute left-0 bottom-0 h-[2px] bg-[var(--accent)] transition-[width] duration-300 ease-out" style={{ width: `${model.percent}%` }} />
        )}
      </button>
    )
  }

  // 'toolbar' — sits in zone A beside the file name, 22 px inside the 44 px bar.
  // Capped at 180 px and shrinkable; below xl an active load is just the ring
  // and "42%" (the name is in the title and the accessible label).
  const compact = model.kind === 'active'
  return (
    <button
      {...common}
      className={[
        'inline-flex items-center gap-1.5 h-[22px] max-w-[180px] min-w-0 shrink pl-1.5 pr-2 rounded-[6px] border text-[11px] select-none transition-colors duration-100',
        'focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent)]',
        failed
          ? 'border-[rgba(229,72,77,0.35)] bg-[rgba(229,72,77,0.08)]'
          : open ? 'border-[var(--border-strong)] bg-[var(--surface-2)]' : 'border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]',
        toneText,
      ].join(' ')}
    >
      <Glyph model={model} size={12} />
      <span className={`truncate min-w-0 ${compact ? 'hidden xl:inline' : ''}`}>{model.label}</span>
      {model.percent != null && (
        <span className="font-mono tabular-nums text-[var(--text-faint)] shrink-0">
          <span className="hidden xl:inline">· </span>{model.percent}%
        </span>
      )}
      {badge}
    </button>
  )
}
