// ─── LoadingCenter ────────────────────────────────────────────────────────────
// The job manager: every load of the session, grouped by batch, with its real
// progress, what it waits for, and the actions the manager allows on it.
//
// WHY IT IS NOT A <Modal>, and why the desktop card is not role="dialog":
// panel-registry yields Escape to anything that looks like a dialog
// (docs/MODAL_DESIGN.md §2), and a modal traps focus and blocks the scene. The
// center is neither — it is a toolbar popover you glance at while a federation
// loads, and it must not close the floating panel you were working in, or stop
// you orbiting the model. So it is a labelled region (card at z-60) with two
// listeners that exist only while it is open:
//   • a CAPTURE-phase Escape listener: it closes the center and stops the key
//     there, so the panel behind keeps its Escape for the next press. A real
//     modal on top still wins — the listener steps aside;
//   • a document pointerdown listener that closes it on a press outside the
//     card and lets that press through. There is deliberately no full-screen
//     click-catcher: one would swallow the first orbit, zoom or button press
//     after every open — the exact thing this popover promises not to do.
//
// On phones it is the shared MobileSheet (half / full detents) instead: the
// sheet is the app's one bottom-surface pattern and owns drag and safe areas.
//
// Nothing below the shell exists while it is closed — no subscriptions, no
// clocks, no renderer poll.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'framer-motion'
import { useShallow } from 'zustand/react/shallow'
import { useLoadingStore, selectCenterOpen, type LoadingDetail } from '../../stores/loadingStore'
import type { LoadJobView } from '../../lib/loading/types'
import { loadingController } from '../../lib/loading/controller'
import { anyModalOpen } from '../../lib/ui/modal-stack'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useLoadingT } from '../../i18n/hooks/namespaces'
import { MobileSheet } from '../mobile/MobileSheet'
import {
  batchDisplayName, describePhaseLine, displayPercent, headerCounts, orderJobsForDisplay, summaryText,
  type JobGroup, type LoadingT,
} from './job-view'
import { LoadJobRow } from './LoadJobRow'
import { ProgressBar } from './ProgressBar'
import { AdvancedSections } from './AdvancedSections'
import { useConfirmFocus } from './useConfirmFocus'
import { CrossGlyph, IconButton, LayersIcon, TextButton } from './glyphs'

export type LoadingCenterAnchor = 'toolbar' | 'floating'

const SHEET_DETENTS = [0.55, 0.92]

/** Above the floating indicator (which sits at the OPFS-badge clearance, 28 px tall). */
const FLOATING_CARD_BOTTOM = 'calc(max(calc(var(--mobile-nav-h) + var(--mobile-nav-margin) + env(safe-area-inset-bottom, 0px) + 8px), 16px) + 36px)'

function isDialogOnTop(): boolean {
  if (anyModalOpen()) return true
  if (typeof document === 'undefined') return false
  return document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]') !== null
}

export function LoadingCenter({ anchor = 'toolbar' }: { anchor?: LoadingCenterAnchor }) {
  const open = useLoadingStore(selectCenterOpen)
  const closeCenter = useLoadingStore((s) => s.closeCenter)
  const isMobile = useIsMobile()
  const { t } = useLoadingT()

  if (isMobile) {
    // MobileSheet renders nothing while closed (after its exit spring), so the
    // body below is unmounted then too.
    return (
      <MobileSheet open={open} onClose={closeCenter} label={t('center.title')} snapPoints={SHEET_DETENTS}>
        <div className="flex flex-col h-full min-h-0">
          <CenterBody touch onClose={closeCenter} />
        </div>
      </MobileSheet>
    )
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && <DesktopPopover key="loading-center" anchor={anchor} onClose={closeCenter} />}
    </AnimatePresence>,
    document.body,
  )
}

// ── Desktop popover ───────────────────────────────────────────────────────────

function DesktopPopover({ anchor, onClose }: { anchor: LoadingCenterAnchor; onClose: () => void }) {
  const { t } = useLoadingT()
  const reduce = useReducedMotion()
  const cardRef = useRef<HTMLDivElement>(null)
  // During the 150 ms exit the popover is still mounted; it must already
  // behave as closed — no swallowed clicks, no swallowed Escape.
  const present = useIsPresent()
  // Closed by a press elsewhere: that press chose where focus goes, so the
  // close must not pull it back to the indicator.
  const closedByPointer = useRef(false)

  // Capture-phase Escape: runs before panel-registry's bubble listener on
  // window, and stopPropagation keeps the key from reaching it at all.
  useEffect(() => {
    if (!present) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented || isDialogOnTop()) return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, present])

  // Outside press: observed on the document (capture, so a canvas handler
  // that stops propagation cannot hide it), never prevented or stopped — the
  // viewer, a panel or a toolbar button still gets the same press. The
  // indicator is left alone: it toggles the center on its own click.
  useEffect(() => {
    if (!present) return
    const onDown = (e: Event): void => {
      const target = e.target
      if (!(target instanceof Node)) return
      if (cardRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('[data-loading-center-toggle]')) return
      closedByPointer.current = true
      onClose()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [onClose, present])

  // Keyboard users land in the card; focus goes back where it came from on
  // close (usually the indicator), unless the user has moved it elsewhere.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const card = cardRef.current
    card?.focus({ preventScroll: true })
    return () => {
      if (closedByPointer.current) return
      const active = document.activeElement
      const focusWasInside = !active || active === document.body || (card != null && card.contains(active))
      if (focusWasInside && previous && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])

  const position: React.CSSProperties = anchor === 'toolbar'
    ? { top: 50, left: 12 }
    : { bottom: FLOATING_CARD_BOTTOM, left: 16 }
  const dy = anchor === 'toolbar' ? -4 : 4

  return (
    <motion.div
      ref={cardRef}
      id="loading-center"
      role="region"
      aria-label={t('center.title')}
      tabIndex={-1}
      initial={{ opacity: 0, y: reduce ? 0 : dy }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduce ? 0 : dy }}
      transition={{ duration: reduce ? 0 : 0.15, ease: 'easeOut' }}
      className={`fixed z-[60] flex flex-col overflow-hidden glass-md border border-[var(--border-strong)] rounded-[10px] shadow-2xl outline-none select-none ${present ? '' : 'pointer-events-none'}`}
      style={{ ...position, width: 'min(392px, calc(100vw - 24px))', maxHeight: 'min(72vh, 640px)' }}
    >
      <CenterBody onClose={onClose} />
    </motion.div>
  )
}

// ── Body (shared by popover and sheet) ────────────────────────────────────────

function DetailToggle({ value, onChange, touch }: { value: LoadingDetail; onChange: (d: LoadingDetail) => void; touch: boolean }) {
  const { t } = useLoadingT()
  const options: Array<[LoadingDetail, string]> = [['basic', t('center.basic')], ['advanced', t('center.advanced')]]
  return (
    <div role="group" aria-label={t('center.detailLabel')} className="inline-flex items-center p-[2px] rounded-[6px] bg-[var(--surface-2)] border border-[var(--border)]">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={[
            'rounded-[4px] px-2 font-medium transition-colors duration-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent)]',
            touch ? 'h-[28px] text-[11.5px]' : 'h-[20px] text-[10.5px]',
            value === id ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-faint)] hover:text-[var(--text-dim)]',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function BatchHeader({ group, t }: { group: JobGroup; t: LoadingT }) {
  if (!group.batch) return null
  const name = batchDisplayName(group.batch, group.jobs.length, t)
  const { stats } = group
  const settled = stats.active === 0
  return (
    <div className="px-3 pt-2.5 pb-1">
      <div className="flex items-center gap-2 min-w-0">
        <LayersIcon size={12} className="shrink-0 text-[var(--text-faint)]" />
        <span className="min-w-0 truncate text-[11.5px] font-semibold text-[var(--text)]" title={name}>{name}</span>
        <span className="shrink-0 text-[10.5px] font-mono tabular-nums text-[var(--text-faint)]">
          {t('batch.members', { loaded: stats.loaded, total: stats.total })}
        </span>
        {stats.failed > 0 && (
          <span className="shrink-0 text-[10.5px] text-[var(--danger)]">{t('batch.failed', { count: stats.failed })}</span>
        )}
        <span className="flex-1" />
        {!settled && (
          <span className="shrink-0 text-[11px] font-mono tabular-nums text-[var(--text-dim)]" title={t('indicator.estimate')}>
            {displayPercent(stats.fraction, stats.loaded === stats.total && stats.total > 0)}%
          </span>
        )}
      </div>
      {!settled && (
        <div className="mt-1.5 pl-5">
          <ProgressBar fraction={stats.fraction} determinate active={false} height={2} label={name} />
        </div>
      )}
    </div>
  )
}

function Group({
  group, jobs, expandedJobId, detail, quiet, touch, onToggle, t,
}: {
  group: JobGroup
  jobs: readonly LoadJobView[]
  expandedJobId: string | null
  detail: LoadingDetail
  quiet: boolean
  touch: boolean
  onToggle: (id: string | null) => void
  t: LoadingT
}) {
  const rows = group.jobs.map((job) => (
    <LoadJobRow
      key={job.id}
      job={job}
      line={describePhaseLine(job, jobs, t)}
      expanded={expandedJobId === job.id}
      detail={detail}
      quiet={quiet}
      touch={touch}
      onToggle={onToggle}
    />
  ))
  if (!group.batch) return <>{rows}</>
  return (
    <div className="pb-1">
      <BatchHeader group={group} t={t} />
      {/* A hairline down the left binds members to their batch without a box. */}
      <div className="ml-[18px] border-l border-[var(--border)]">{rows}</div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider font-semibold text-[var(--text-faint)]">{children}</p>
  )
}

function CenterBody({ onClose, touch = false }: { onClose: () => void; touch?: boolean }) {
  const { t } = useLoadingT()
  const { jobs, batches, summary, detail, expandedJobId } = useLoadingStore(useShallow((s) => ({
    jobs: s.jobs, batches: s.batches, summary: s.summary, detail: s.detail, expandedJobId: s.expandedJobId,
  })))
  const setDetail = useLoadingStore((s) => s.setDetail)
  const setExpanded = useLoadingStore((s) => s.setExpanded)

  const sections = useMemo(() => orderJobsForDisplay(jobs, batches), [jobs, batches])
  const counts = useMemo(() => headerCounts(jobs), [jobs])
  const summaryLine = summaryText(summary, t)
  // Only rows `clearFinished` is certain to drop (loaded / cancelled / removed);
  // failures stay until retried or dismissed one by one.
  const hasFinished = sections.finished.length > 0

  // ── Cancel all (inline confirm, no modal) ──────────────────────────────────
  const [confirmCancel, setConfirmCancel] = useState(false)
  useEffect(() => { if (summary.active === 0) setConfirmCancel(false) }, [summary.active])
  const footerRef = useRef<HTMLDivElement>(null)
  const cancelAllRef = useRef<HTMLButtonElement>(null)
  const cancelNoRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  // "No" gets focus (the safe answer); No puts it back on "Cancel all". Yes
  // and a confirm that closes by itself leave no trigger behind — "Cancel all"
  // goes once nothing is active — so focus lands on the center itself (the
  // desktop card is focusable) or, in the sheet, on its close button.
  const returnFocus = useConfirmFocus(confirmCancel, {
    answer: cancelNoRef,
    scope: footerRef,
    fallback: () => footerRef.current?.closest<HTMLElement>('#loading-center') ?? closeRef.current,
  })

  const onToggle = useCallback((id: string | null) => setExpanded(id), [setExpanded])
  const empty = jobs.length === 0
  const liveHasBatches = sections.live.some((g) => g.batch)

  return (
    <>
      {/* Header — fixed */}
      <div className={`shrink-0 flex items-center gap-2 px-3 border-b border-[var(--border)] ${touch ? 'pb-2.5' : 'h-[40px]'}`}>
        <span className={`${touch ? 'text-[13px]' : 'text-[12px]'} font-semibold text-[var(--text)] whitespace-nowrap`}>{t('center.title')}</span>
        {counts.total > 0 && (
          <span
            className="text-[11px] font-mono tabular-nums text-[var(--text-faint)] whitespace-nowrap"
            aria-label={t('center.counterLabel', counts)}
          >
            {t('center.counter', counts)}
          </span>
        )}
        <span className="flex-1" />
        <DetailToggle value={detail} onChange={setDetail} touch={touch} />
        <IconButton label={t('center.close')} touch={touch} onClick={onClose} buttonRef={closeRef}>
          <CrossGlyph size={touch ? 15 : 13} />
        </IconButton>
      </div>

      {/* Body — scrolls */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {empty && (
          <div className="px-4 py-6 text-center">
            <p className="text-[12px] text-[var(--text-dim)]">{t('center.empty')}</p>
            <p className="mt-1 text-[10.5px] leading-snug text-[var(--text-faint)]">{t('center.emptyHint')}</p>
          </div>
        )}

        {sections.live.length > 0 && (
          <div className="py-1">
            {sections.live.map((g) => (
              <React.Fragment key={g.key}>
                {!g.batch && liveHasBatches && <SectionLabel>{t('center.loose')}</SectionLabel>}
                <Group
                  group={g} jobs={jobs} expandedJobId={expandedJobId} detail={detail}
                  quiet={false} touch={touch} onToggle={onToggle} t={t}
                />
              </React.Fragment>
            ))}
          </div>
        )}

        {sections.finished.length > 0 && (
          <div className={`pb-1 ${sections.live.length > 0 ? 'border-t border-[var(--border)]' : ''}`}>
            <SectionLabel>{t('center.finished')}</SectionLabel>
            {sections.finished.map((g) => (
              <Group
                key={g.key}
                group={g} jobs={jobs} expandedJobId={expandedJobId} detail={detail}
                quiet touch={touch} onToggle={onToggle} t={t}
              />
            ))}
          </div>
        )}

        {detail === 'advanced' && <AdvancedSections />}
      </div>

      {/* Footer — pinned */}
      {!empty && (
        <div ref={footerRef} className="shrink-0 flex items-center gap-1.5 px-3 py-2 border-t border-[var(--border)] min-h-[38px]">
          {confirmCancel ? (
            <>
              {/* role="alert": the question is announced as it appears, while
                  focus moves to "No". */}
              <span role="alert" className="flex-1 min-w-0 truncate text-[10.5px] text-[var(--text-dim)]">
                {t('center.cancelAllConfirm', { count: summary.active })}
              </span>
              <TextButton tone="danger" onClick={() => { setConfirmCancel(false); loadingController.cancelAll() }}>
                {t('center.yes')}
              </TextButton>
              <TextButton
                buttonRef={cancelNoRef}
                onClick={() => { returnFocus(() => cancelAllRef.current); setConfirmCancel(false) }}
              >
                {t('center.no')}
              </TextButton>
            </>
          ) : (
            <>
              <span className="flex-1 min-w-0 truncate text-[10.5px] tabular-nums text-[var(--text-faint)]" title={summaryLine}>
                {summaryLine}
              </span>
              {summary.active > 0 && (
                <TextButton tone="danger" buttonRef={cancelAllRef} onClick={() => setConfirmCancel(true)}>
                  {t('center.cancelAll')}
                </TextButton>
              )}
              {hasFinished && (
                <TextButton onClick={() => loadingController.clearFinished()}>{t('center.clearFinished')}</TextButton>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}
