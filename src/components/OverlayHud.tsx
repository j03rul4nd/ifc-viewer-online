// ─── OverlayHud ───────────────────────────────────────────────────────────────
// Floating control bar shown while the 3D issue overlay is on. Bundles the four
// advanced overlay UX features:
//   • severity legend with live counts + click-to-filter chips
//   • step-through-issues navigation (◀ n/total ▶) that flies + selects each one
//   • a settings popover: dim (ghost) intensity slider + x-ray toggle
// State lives in overlayStore; navigation calls the viewer API directly.

import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../lib/viewer'
import { useOverlayStore, GHOST_OPACITY_MIN, GHOST_OPACITY_MAX, type Severity } from '../stores/overlayStore'

interface OverlayHudProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  channel: 'validation' | 'ids'
  /** Issue counts by severity (for IDS, the failure total is passed as `error`). */
  counts: { error: number; warning: number; info: number }
}

const SEV_META: { key: Severity; color: string }[] = [
  { key: 'error',   color: '#E5484D' },
  { key: 'warning', color: '#F5A623' },
  { key: 'info',    color: '#5E9ED6' },
]

const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {dir === 'left' ? <path d="M7.5 2.5L4 6l3.5 3.5" /> : <path d="M4.5 2.5L8 6l-3.5 3.5" />}
  </svg>
)

const Gear = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5L3.4 3.4" strokeLinecap="round" />
  </svg>
)

export default function OverlayHud({ viewerApiRef, channel, counts }: OverlayHudProps) {
  const { t } = useTranslation('viewer')
  const severities    = useOverlayStore((s) => s.severities)
  const toggleSeverity = useOverlayStore((s) => s.toggleSeverity)
  const ghostOpacity  = useOverlayStore((s) => s.ghostOpacity)
  const setGhostOpacity = useOverlayStore((s) => s.setGhostOpacity)
  const xray          = useOverlayStore((s) => s.xray)
  const toggleXray    = useOverlayStore((s) => s.toggleXray)

  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState(-1) // -1 = nothing focused yet
  const [showSettings, setShowSettings] = useState(false)

  // Refresh the navigable count after the overlay (re)paints. Deferred to the next
  // frame so it reads AFTER App's apply effect (which runs in the same commit), so
  // a severity-filter change reflects the new flagged total rather than the old one.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const n = viewerApiRef.current?.getOverlayIssueCount() ?? 0
      setTotal(n)
      setCursor((c) => (n === 0 ? -1 : Math.min(c, n - 1)))
    })
    return () => cancelAnimationFrame(id)
  }, [viewerApiRef, counts.error, counts.warning, counts.info, severities, channel])

  const step = (dir: 1 | -1): void => {
    if (total === 0) return
    const next = cursor < 0 ? (dir === 1 ? 0 : total - 1) : cursor + dir
    const res = viewerApiRef.current?.focusOverlayIssue(next)
    if (res) setCursor(res.index)
  }

  const label = (sev: Severity): string =>
    t(`overlayHud.${sev}`, { defaultValue: sev === 'error' ? 'Errors' : sev === 'warning' ? 'Warnings' : 'Info' })

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[8] select-none" style={{ pointerEvents: 'auto' }}>
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[rgba(12,12,16,0.9)] backdrop-blur-[14px] border border-[var(--border)] shadow-lg">
          {/* Severity legend + filter chips (validation only) */}
          {channel === 'validation' ? (
            SEV_META.map(({ key, color }) => {
              const on = severities[key]
              const n = counts[key]
              return (
                <button
                  key={key}
                  onClick={() => toggleSeverity(key)}
                  title={t('overlayHud.toggleSeverity', { defaultValue: 'Show/hide this severity' })}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                  style={{ opacity: on ? 1 : 0.4 }}
                >
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: color, boxShadow: on ? `0 0 0 2px ${color}33` : 'none' }} />
                  <span className="tabular-nums text-[var(--text)]">{n}</span>
                  <span className="text-[var(--text-dim)] hidden sm:inline">{label(key)}</span>
                </button>
              )
            })
          ) : (
            <span className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#E5484D' }} />
              <span className="tabular-nums text-[var(--text)]">{counts.error}</span>
              <span className="text-[var(--text-dim)] hidden sm:inline">{t('overlayHud.idsFails', { defaultValue: 'IDS fails' })}</span>
            </span>
          )}

          <div className="w-px h-4 bg-[var(--border)] mx-0.5" />

          {/* Step-through navigation */}
          <button
            onClick={() => step(-1)}
            disabled={total === 0}
            title={t('overlayHud.prev', { defaultValue: 'Previous issue' })}
            className="p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[rgba(255,255,255,0.06)] transition-colors disabled:opacity-30"
          >
            <Chevron dir="left" />
          </button>
          <span className="text-[11px] font-mono tabular-nums text-[var(--text-dim)] min-w-[44px] text-center">
            {cursor < 0 ? '–' : cursor + 1} / {total}
          </span>
          <button
            onClick={() => step(1)}
            disabled={total === 0}
            title={t('overlayHud.next', { defaultValue: 'Next issue' })}
            className="p-1 rounded-md text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[rgba(255,255,255,0.06)] transition-colors disabled:opacity-30"
          >
            <Chevron dir="right" />
          </button>

          <div className="w-px h-4 bg-[var(--border)] mx-0.5" />

          {/* Settings toggle */}
          <button
            onClick={() => setShowSettings((v) => !v)}
            title={t('overlayHud.settings', { defaultValue: 'Overlay appearance' })}
            className="p-1 rounded-md transition-colors hover:bg-[rgba(255,255,255,0.06)]"
            style={{ color: showSettings ? 'var(--accent, #5E6AD2)' : 'var(--text-dim)' }}
          >
            <Gear />
          </button>
        </div>

        {/* Appearance popover */}
        {showSettings && (
          <div className="flex flex-col gap-2.5 px-3 py-2.5 rounded-lg bg-[rgba(12,12,16,0.92)] backdrop-blur-[14px] border border-[var(--border)] shadow-lg min-w-[200px]">
            <label className="flex items-center justify-between gap-3 text-[11px] text-[var(--text-dim)]">
              <span>{t('overlayHud.dim', { defaultValue: 'Context dimming' })}</span>
              <input
                type="range"
                min={GHOST_OPACITY_MIN}
                max={GHOST_OPACITY_MAX}
                step={0.01}
                value={ghostOpacity}
                onChange={(e) => setGhostOpacity(parseFloat(e.target.value))}
                className="w-[96px] accent-[var(--accent,#5E6AD2)]"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-[11px] text-[var(--text-dim)] cursor-pointer">
              <span>{t('overlayHud.xray', { defaultValue: 'X-ray (see through walls)' })}</span>
              <input type="checkbox" checked={xray} onChange={toggleXray} className="accent-[var(--accent,#5E6AD2)]" />
            </label>
          </div>
        )}
      </div>
    </div>
  )
}
