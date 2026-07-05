// ─── mobileUi ────────────────────────────────────────────────────────────────
// Touch-first presentation primitives shared by the mobile panel variants.
// Built for very narrow widths (down to 320px — Instagram/WhatsApp/LinkedIn
// in-app browsers): no horizontal scroll, ≥44px tap targets, generous spacing,
// brand tokens only. Visually cohesive with the desktop panels (same accent,
// surfaces, mono numerics) but restructured for thumbs, not a mouse.

import React from 'react'
import { haptic } from '../../lib/haptics'

const TAP = { WebkitTapHighlightColor: 'transparent' } as const

// ── Color tinting ─────────────────────────────────────────────────────────────
// CRITICAL: the previous code concatenated an alpha-hex suffix onto colors that
// are often CSS custom properties, e.g. `var(--accent)1f` or `${color}14` where
// color === 'var(--danger)'. That produces invalid CSS the browser silently
// drops — so score hero tiles, stat pills and every "active" tint rendered
// FULLY TRANSPARENT. `tint()` uses color-mix (Baseline 2023) which composes
// correctly with both var() tokens AND hex literals. On engines without it
// (Safari < 16.2) we fall back to no tint (flat surface) rather than broken CSS.
const COLOR_MIX_OK =
  typeof window === 'undefined' ||
  !window.CSS?.supports ||
  window.CSS.supports('color', 'color-mix(in srgb, red, transparent)')

export function tint(color: string, pct: number): string {
  return COLOR_MIX_OK ? `color-mix(in srgb, ${color} ${pct}%, transparent)` : 'transparent'
}

// ── Sticky header bar inside a sheet ──────────────────────────────────────────

export function SheetHeaderBar({
  icon, title, badge, onOverflow, onClose,
}: {
  icon?: React.ReactNode
  title: string
  badge?: React.ReactNode
  onOverflow?: () => void
  onClose: () => void
}) {
  return (
    <div className="shrink-0 flex items-center gap-2 px-4 pb-3 pt-0.5 border-b border-[rgba(255,255,255,0.06)]">
      {icon && <span className="shrink-0 text-[var(--accent)] flex items-center">{icon}</span>}
      <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-dim)] shrink-0">
        {title}
      </span>
      {badge}
      <div className="flex-1" />
      {onOverflow && (
        <button
          onClick={() => { haptic('tick'); onOverflow() }}
          aria-label="More actions"
          className="w-11 h-11 -mr-1.5 flex items-center justify-center rounded-full text-[var(--text-dim)] active:bg-[var(--surface-2)] active:scale-95 transition-transform"
          style={TAP}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
            <circle cx="9" cy="3.5" r="1.6" /><circle cx="9" cy="9" r="1.6" /><circle cx="9" cy="14.5" r="1.6" />
          </svg>
        </button>
      )}
      <button
        onClick={onClose}
        aria-label="Close"
        className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-[var(--text-dim)] active:bg-[var(--surface-2)] active:scale-95 transition-transform"
        style={TAP}
      >
        <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <path d="M2 2l8 8M10 2l-8 8" />
        </svg>
      </button>
    </div>
  )
}

// ── Score hero ────────────────────────────────────────────────────────────────

export function ScoreHero({
  score, color, grade, subtitle, stats,
}: {
  score: number | string | null
  color: string
  grade?: string
  subtitle?: React.ReactNode
  stats?: React.ReactNode
}) {
  return (
    <div className="px-4 pt-3.5 pb-3">
      <div className="flex items-center gap-3.5">
        <div
          className="shrink-0 rounded-2xl flex flex-col items-center justify-center"
          style={{
            width: 76, height: 76,
            background: tint(color, 8),
            border: `1px solid ${tint(color, 20)}`,
          }}
        >
          <span className="font-mono font-bold leading-none tabular-nums" style={{ color, fontSize: 30 }}>
            {score ?? '—'}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          {grade && (
            <div className="text-[15px] font-semibold leading-tight truncate" style={{ color }}>
              {grade}
            </div>
          )}
          {subtitle && (
            <div className="text-[11.5px] text-[var(--text-dim)] leading-snug mt-0.5">{subtitle}</div>
          )}
        </div>
      </div>
      {stats && <div className="flex items-center gap-2 mt-3 flex-wrap">{stats}</div>}
    </div>
  )
}

export function StatPill({ value, label, color }: { value: React.ReactNode; label: string; color: string }) {
  return (
    <div
      className="flex items-center gap-1.5 h-8 px-3 rounded-full"
      style={{ background: tint(color, 8), border: `1px solid ${tint(color, 16)}` }}
    >
      <span className="font-mono font-bold text-[13px] tabular-nums leading-none" style={{ color }}>{value}</span>
      <span className="text-[11px] font-medium" style={{ color }}>{label}</span>
    </div>
  )
}

// ── Primary CTA ───────────────────────────────────────────────────────────────

export function PrimaryCTA({
  onClick, disabled, busy, children,
}: {
  onClick: () => void
  disabled?: boolean
  busy?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 text-[14px] font-semibold text-white transition-all active:scale-[0.985] disabled:opacity-40 disabled:active:scale-100"
      style={{
        background: 'linear-gradient(180deg, var(--accent-2), var(--accent))',
        boxShadow: '0 6px 20px rgba(94,106,210,0.32), inset 0 1px 0 rgba(255,255,255,0.15)',
        ...TAP,
      }}
    >
      {busy && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin">
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 7.07 2.93" />
        </svg>
      )}
      {children}
    </button>
  )
}

export function SecondaryButton({
  onClick, disabled, active, children,
}: {
  onClick: () => void
  disabled?: boolean
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-12 px-3.5 rounded-xl flex items-center justify-center gap-1.5 text-[12.5px] font-medium transition-all active:scale-[0.97] disabled:opacity-35"
      style={{
        background: active ? tint('var(--accent)', 12) : 'var(--surface-2)',
        color: active ? 'var(--accent-2)' : 'var(--text-dim)',
        border: `1px solid ${active ? tint('var(--accent)', 34) : 'var(--border)'}`,
        ...TAP,
      }}
    >
      {children}
    </button>
  )
}

// ── Filter chip ───────────────────────────────────────────────────────────────

export function Chip({
  active, color = 'var(--accent)', onClick, children,
}: {
  active?: boolean
  color?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={() => { haptic('tick'); onClick() }}
      className="shrink-0 min-h-[38px] h-[38px] px-3.5 rounded-full text-[12.5px] font-medium whitespace-nowrap transition-all active:scale-95 flex items-center scroll-snap-align-start"
      style={{
        background: active ? tint(color, 14) : 'var(--surface-2)',
        color: active ? color : 'var(--text-dim)',
        border: `1px solid ${active ? tint(color, 40) : 'var(--border)'}`,
        scrollSnapAlign: 'start',
        ...TAP,
      }}
    >
      {children}
    </button>
  )
}

// ── Segmented control (animated sliding indicator) ─────────────────────────────

export function Segmented<T extends string>({
  options, value, onChange,
}: {
  options: Array<{ value: T; label: React.ReactNode }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="relative flex items-center gap-1 p-1 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)]">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => { if (!on) { haptic('tick'); onChange(o.value) } }}
            className="relative flex-1 h-10 rounded-xl text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors active:scale-[0.97]"
            style={{ color: on ? '#fff' : 'var(--text-dim)', ...TAP }}
          >
            {on && (
              <span
                className="absolute inset-0 rounded-xl"
                style={{ background: 'var(--accent)', boxShadow: '0 2px 8px rgba(94,106,210,0.3)' }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Info strip ────────────────────────────────────────────────────────────────

export function Strip({
  tone = 'info', children, onDismiss, action,
}: {
  tone?: 'info' | 'warn' | 'ok' | 'danger'
  children: React.ReactNode
  onDismiss?: () => void
  action?: { label: string; onClick: () => void }
}) {
  const color =
    tone === 'warn' ? 'var(--warn)' : tone === 'ok' ? 'var(--ok)' : tone === 'danger' ? 'var(--danger)' : 'var(--accent)'
  return (
    <div
      className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[11.5px] leading-snug"
      style={{ background: tint(color, 7), border: `1px solid ${tint(color, 18)}`, color: 'var(--text-dim)' }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="min-w-0 flex-1">{children}</span>
      {action && (
        <button onClick={action.onClick} className="shrink-0 text-[11.5px] font-semibold min-h-[32px] px-1 flex items-center" style={{ color }}>
          {action.label}
        </button>
      )}
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0 w-8 h-8 -my-2 flex items-center justify-center text-[var(--text-faint)]" style={TAP}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M1 1l8 8M9 1L1 9" /></svg>
        </button>
      )}
    </div>
  )
}

// ── Search input ──────────────────────────────────────────────────────────────

export function MobileSearch({
  value, onChange, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <svg
        width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="var(--text-faint)" strokeWidth="1.4"
        className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
      >
        <circle cx="6.5" cy="6.5" r="4.5" /><path d="M10 10l3.5 3.5" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-11 pl-10 pr-9 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[13px] text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none focus:border-[var(--accent)] transition-colors"
        style={TAP}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="Clear"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full text-[var(--text-faint)] active:bg-[var(--border)]"
          style={TAP}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M1 1l8 8M9 1L1 9" /></svg>
        </button>
      )}
    </div>
  )
}

// ── Sticky thumb-zone footer ───────────────────────────────────────────────────
// Actionable controls belong in the natural bottom arc of the thumb; glanceable
// content stays up top. Sits at the sheet's bottom edge with a blurred backdrop
// so list content scrolls behind it, and clears the home-indicator safe area.

export function SheetFooterBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="shrink-0 px-4 pt-3 flex flex-col gap-2 border-t border-[rgba(255,255,255,0.07)]"
      style={{
        background: 'rgba(10,10,16,0.72)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
      }}
    >
      {children}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function MobileEmpty({
  icon, text, action,
}: {
  icon?: React.ReactNode
  text: string
  action?: { label: string; onClick: () => void; disabled?: boolean }
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-center px-8 py-14">
      {icon && <span className="text-[var(--text-faint)] opacity-60">{icon}</span>}
      <p className="text-[13px] text-[var(--text-dim)] m-0 max-w-[300px] leading-relaxed">{text}</p>
      {action && (
        <button
          onClick={action.onClick}
          disabled={action.disabled}
          className="h-11 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40 active:scale-[0.97] transition-transform"
          style={{ background: 'linear-gradient(180deg, var(--accent-2), var(--accent))', ...TAP }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
