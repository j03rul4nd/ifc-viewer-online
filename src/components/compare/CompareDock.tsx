// The comparison workspace minimised: a floating bar over the 3D view that steps
// through the filtered change list, so "Locate" actually shows the element
// instead of hiding it behind a full-screen dialog. Sits above the mobile
// bottom nav and respects the safe area.
import React, { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../../lib/viewer'
import { useCompareStore } from '../../stores/compareStore'
import { locateInScene } from '../../lib/compare/overlay'
import { STATUS_COLOR } from './ui'

export default function CompareDock({ viewerApiRef, onClose }: {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  onClose: () => void
}) {
  const { t } = useTranslation('compare')
  const { diff, base, head, navList, cursor, highlight, setHighlight, setCursor, setDocked } = useCompareStore()
  const byId = useMemo(() => new Map((diff?.elements ?? []).map((e) => [e.globalId, e])), [diff])
  const current = cursor >= 0 ? byId.get(navList[cursor]) : undefined

  const go = useCallback((i: number): void => {
    if (!navList.length) return
    const next = (i + navList.length) % navList.length
    setCursor(next)
    const e = byId.get(navList[next])
    const at = e && locateInScene(e, head.modelIds, base.modelIds)
    if (!at) return
    viewerApiRef.current?.selectElement(at.expressId, at.modelId)
    viewerApiRef.current?.focusElement(at.expressId, at.modelId)
  }, [navList, byId, head.modelIds, base.modelIds, setCursor, viewerApiRef])

  // Arrow keys step while docked (not while typing somewhere else).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent): void => {
      const el = ev.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (ev.key === ']' || (ev.altKey && ev.key === 'ArrowRight')) { ev.preventDefault(); go(cursor + 1) }
      else if (ev.key === '[' || (ev.altKey && ev.key === 'ArrowLeft')) { ev.preventDefault(); go(cursor - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, cursor])

  const c = diff?.counts
  const iconBtn = 'h-10 w-10 sm:h-8 sm:w-8 shrink-0 inline-flex items-center justify-center rounded-full text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-white/10 disabled:opacity-30 transition-colors'

  return (
    <div
      role="region" aria-label={t('title')}
      className="fixed z-[60] left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[min(560px,calc(100vw-24px))]
        bottom-[calc(env(safe-area-inset-bottom)+76px)] sm:bottom-5
        flex flex-col gap-1.5 p-2 rounded-2xl border border-[var(--border-strong)]
        bg-[rgba(14,14,18,0.94)] backdrop-blur-md shadow-[0_16px_40px_rgba(0,0,0,0.55)] animate-[fadeIn_140ms_ease]"
    >
      <div className="flex items-center gap-1">
        <button type="button" className={iconBtn} onClick={() => go(cursor - 1)} disabled={!navList.length} aria-label={t('dock.prev')} title={`${t('dock.prev')} ([)`}>‹</button>
        <button type="button" onClick={() => setDocked(false)} className="flex-1 min-w-0 flex items-center gap-2 px-1 text-left" title={t('dock.expand')}>
          {current
            ? <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATUS_COLOR[current.status] }} />
            : <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-[var(--text-faint)]" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] text-[var(--text)]">
              {current ? (current.name || current.globalId) : t('dock.start', { count: navList.length })}
            </span>
            <span className="block truncate text-[10.5px] text-[var(--text-faint)]">
              {current
                ? `${t(`status.${current.status}`)} · ${current.ifcClass}${current.storey ? ` · ${current.storey}` : ''}`
                : c ? `+${c.added}  −${c.removed}  Δ${c.modified}` : ''}
            </span>
          </span>
          {navList.length > 0 && (
            <span className="text-[10.5px] tabular-nums text-[var(--text-faint)] shrink-0">
              {cursor >= 0 ? cursor + 1 : '–'} / {navList.length}
            </span>
          )}
        </button>
        <button type="button" className={iconBtn} onClick={() => go(cursor + 1)} disabled={!navList.length} aria-label={t('dock.next')} title={`${t('dock.next')} (])`}>›</button>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button" onClick={() => setHighlight(!highlight)} aria-pressed={highlight}
          className={`h-9 sm:h-7 px-3 rounded-full text-[11.5px] border transition-colors ${highlight ? 'border-[var(--accent)] text-[var(--text)] bg-[var(--accent)]/15' : 'border-[var(--border)] text-[var(--text-dim)]'}`}
        >
          {highlight ? t('changes.hide3d') : t('changes.show3d')}
        </button>
        <span className="flex-1" />
        <button type="button" onClick={() => setDocked(false)} className="h-9 sm:h-7 px-3 rounded-full text-[11.5px] bg-[var(--accent)] text-white hover:brightness-110">
          {t('dock.expand')}
        </button>
        <button type="button" onClick={onClose} className={iconBtn} aria-label={t('dock.close')} title={t('dock.close')}>✕</button>
      </div>
    </div>
  )
}
