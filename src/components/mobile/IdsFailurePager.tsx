// ─── IdsFailurePager ─────────────────────────────────────────────────────────
// The "issue reel": a full-bleed, swipe-to-advance review of IDS failures — the
// TikTok/Instagram-feed interaction applied to BIM triage. The 3D scene is the
// hero content (orbit it freely up top); a caption card at the bottom shows the
// current failure and swiping it vertically pages to the next/previous element,
// flying the camera and firing a haptic tick on each advance.
//
// This replaces the old dead-end where tapping a failure closed the whole sheet
// and ended the session. Here a coordinator reviews N failures one-handed in one
// continuous loop, on site, without ever losing context.

import React, { useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, type PanInfo } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import * as Icons from '../Icons'
import { localizeReasons, localizeRemediation } from '../ids/reasons'
import { haptic } from '../../lib/haptics'
import type { ViewerAPI } from '../../lib/viewer'
import type { IdsReason } from '../../lib/ids/ids-types'

export interface PagerFailure {
  expressId: number
  name: string
  ifcClass: string
  globalId?: string | null
  specName: string
  reasons: IdsReason[]
}

interface Props {
  open: boolean
  failures: PagerFailure[]
  index: number
  onIndexChange: (i: number) => void
  modelId: string | null
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  onClose: () => void
}

export default function IdsFailurePager({
  open, failures, index, onIndexChange, modelId, viewerApiRef, onClose,
}: Props) {
  const { t } = useTranslation('ids')
  const cur = failures[index] ?? null
  const total = failures.length
  const direction = useRef(1)

  const focusCurrent = useCallback(() => {
    if (!cur || cur.expressId < 0) return
    viewerApiRef.current?.selectElement(cur.expressId, modelId ?? undefined)
    viewerApiRef.current?.focusElement(cur.expressId, modelId ?? undefined)
  }, [cur, modelId, viewerApiRef])

  // Fly + select whenever the active failure changes while open.
  useEffect(() => { if (open) focusCurrent() }, [open, index, focusCurrent])

  // Safety net: if the pager is open but the index no longer resolves to a failure
  // (list shrank underneath it), close rather than strand the user on a blank scene.
  useEffect(() => { if (open && !cur) onClose() }, [open, cur, onClose])

  const go = useCallback((delta: number) => {
    const next = index + delta
    if (next < 0 || next >= total) { haptic('warning'); return }
    direction.current = delta
    haptic('tick')
    onIndexChange(next)
  }, [index, total, onIndexChange])

  // Keyboard arrows (bluetooth keyboards / desktop testing).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); go(1) }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, go, onClose])

  const onCardDragEnd = useCallback((_: unknown, info: PanInfo): void => {
    const commit = Math.abs(info.offset.y) > 70 || Math.abs(info.velocity.y) > 550
    if (!commit) return
    // Drag up → next (feed advances upward, TikTok convention); drag down → prev.
    go(info.offset.y < 0 ? 1 : -1)
  }, [go])

  // Deterministic unmount: a plain conditional (no AnimatePresence exit) so
  // "back to list" reliably tears the overlay down. Enter animation only.
  if (typeof document === 'undefined' || !open || !cur) return null

  const reason = localizeReasons(t, cur.reasons)
  const fix = localizeRemediation(t, cur.reasons)

  return createPortal(
    (
        <motion.div
          key="ids-pager"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          // Container lets touches through to the canvas EXCEPT on the interactive
          // chrome — so the model stays orbitable while reviewing.
          className="fixed inset-0 z-[60]"
          style={{ pointerEvents: 'none' }}
        >
          {/* Top bar: counter + close. */}
          <div
            className="absolute left-0 right-0 top-0 flex items-center gap-3 px-4"
            style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', pointerEvents: 'auto' }}
          >
            <div
              className="flex items-center gap-2 h-9 px-3.5 rounded-full text-[12px] font-semibold text-white"
              style={{ background: 'rgba(10,10,16,0.72)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '0.5px solid rgba(255,255,255,0.1)' }}
            >
              <Icons.Shield size={13} className="text-[var(--accent-2)]" />
              <span className="tabular-nums">{t('pager.counter', { current: index + 1, total })}</span>
            </div>
            <div className="flex-1" />
            <button
              onClick={onClose}
              aria-label={t('pager.backToList')}
              className="w-10 h-10 flex items-center justify-center rounded-full text-white active:scale-90 transition-transform"
              style={{ background: 'rgba(10,10,16,0.72)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '0.5px solid rgba(255,255,255,0.1)', WebkitTapHighlightColor: 'transparent' }}
            >
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
            </button>
          </div>

          {/* Side rail: up / next / down affordances (thumb-reachable, right edge). */}
          <div
            className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2.5"
            style={{ pointerEvents: 'auto' }}
          >
            <RailBtn disabled={index <= 0} label={t('pager.prev')} onClick={() => go(-1)}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11l5-5 5 5" /></svg>
            </RailBtn>
            <RailBtn disabled={index >= total - 1} label={t('pager.next')} onClick={() => go(1)}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7l5 5 5-5" /></svg>
            </RailBtn>
          </div>

          {/* Caption card: the swipeable "reel item". */}
          <motion.div
            className="absolute left-2.5 right-2.5"
            style={{
              bottom: `calc(var(--mobile-nav-h) + var(--mobile-nav-margin) + env(safe-area-inset-bottom, 0px) + 12px)`,
              pointerEvents: 'auto',
            }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.35}
            onDragEnd={onCardDragEnd}
          >
              {/* Keyed card: re-mounts per issue and slides in from the swipe
                  direction. No inner AnimatePresence (keeps the outer overlay's
                  mount/unmount reliable). */}
              <motion.div
                key={index}
                initial={{ y: direction.current > 0 ? 56 : -56, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', damping: 32, stiffness: 380, mass: 0.8 }}
                className="rounded-[24px] overflow-hidden p-4"
                style={{
                  background: 'rgba(12,12,18,0.86)',
                  backdropFilter: 'blur(28px) saturate(1.6)',
                  WebkitBackdropFilter: 'blur(28px) saturate(1.6)',
                  border: '0.5px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--danger)' }} />
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)] truncate">
                    {cur.specName}
                  </span>
                </div>
                <div className="text-[17px] font-semibold text-white leading-tight break-words">
                  {cur.name || `#${cur.expressId}`}
                </div>
                <div className="text-[11px] font-mono text-[var(--text-faint)] mt-0.5">
                  {cur.ifcClass}{cur.expressId >= 0 ? ` · #${cur.expressId}` : ''}
                </div>
                {reason && (
                  <div className="text-[13px] leading-snug mt-2.5" style={{ color: 'var(--danger)' }}>{reason}</div>
                )}
                {fix && (
                  <div className="text-[12px] leading-snug mt-1.5 text-[var(--text-dim)]">
                    <span className="text-[var(--text-faint)]">{t('howToFix')}: </span>{fix}
                  </div>
                )}
                <div className="text-[10.5px] text-[var(--text-faint)] mt-3 flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M7 2v6M4.5 5.5L7 8l2.5-2.5" /><path d="M2.5 10.5h9" /></svg>
                  {t('pager.swipeHint')}
                </div>
              </motion.div>
          </motion.div>
        </motion.div>
    ),
    document.body,
  )
}

function RailBtn({
  children, onClick, disabled, label,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="w-11 h-11 flex items-center justify-center rounded-full text-white active:scale-90 transition-transform disabled:opacity-30"
      style={{
        background: 'rgba(10,10,16,0.72)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '0.5px solid rgba(255,255,255,0.1)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {children}
    </button>
  )
}
