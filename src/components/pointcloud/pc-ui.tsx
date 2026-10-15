// ─── pc-ui ────────────────────────────────────────────────────────────────────
// Presentational primitives shared by the point cloud panel and its parts
// (scan list, topic bar, scope bar). Moved out of PointCloudPanel.tsx verbatim;
// RowIcon gained a 44 px phone hit area, and PlacementField is new.

import React, { useEffect, useState } from 'react'

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-[0.06em]">{children}</div>
}

export function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  )
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <div className="text-[11.5px] leading-snug text-[var(--text-dim)] opacity-90">{children}</div>
}

export function Badge({ tint, children }: { tint: string; children: React.ReactNode }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded-[6px] text-[10.5px] font-medium border whitespace-nowrap"
      style={{ color: tint, borderColor: `${tint}55`, background: `${tint}18` }}
    >
      {children}
    </span>
  )
}

/** Compact fact chip on a sample-scan card — every value read from the file. */
export function DemoChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-1.5 py-[1px] rounded-[5px] text-[10.5px] font-mono text-[var(--text-faint)] border border-[var(--border)]">
      {children}
    </span>
  )
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        'px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors',
        active
          ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
          : 'border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

/** Label + value row for the inspect read-out. */
export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[var(--text-faint)] shrink-0">{label}</span>
      <span className="text-[var(--text)] text-right break-all">{value}</span>
    </div>
  )
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <div className="text-[10.5px] text-[var(--text-faint)] truncate">{label}</div>
      <div className="text-[13px] font-mono tabular-nums text-[var(--text)]">{value}</div>
    </div>
  )
}

export function Note({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' }) {
  const color = tone === 'warn' ? '#F5A623' : 'var(--text-dim)'
  return (
    <div className="text-[11.5px] leading-snug" style={{ color }}>{children}</div>
  )
}

export function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="w-8 h-8 max-md:w-10 max-md:h-10 shrink-0 flex items-center justify-center rounded-[8px] max-md:rounded-[10px] text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
    >
      {children}
    </button>
  )
}

export function PrimaryButton(
  { onClick, children, disabled, testId }: { onClick: () => void; children: React.ReactNode; disabled?: boolean; testId?: string },
) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className="w-full px-3 py-2.5 rounded-[10px] text-[13px] font-semibold bg-[var(--accent)] text-white hover:brightness-110 disabled:opacity-50 transition"
    >
      {children}
    </button>
  )
}

export function SmallButton(
  { onClick, children, disabled, active, testId, title }: {
    onClick: () => void; children: React.ReactNode; disabled?: boolean; active?: boolean; testId?: string; title?: string
  },
) {
  return (
    <button
      type="button"
      data-testid={testId}
      title={title}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={[
        'flex-1 px-3 py-2 max-md:min-h-[44px] max-md:text-[13px] rounded-[9px] text-[12px] font-medium border disabled:opacity-40 transition-colors whitespace-nowrap',
        active
          ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
          : 'border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="flex items-center justify-between gap-3 py-1 max-md:min-h-[44px] text-left"
    >
      <span className="text-[12.5px] max-md:text-[13.5px] text-[var(--text-dim)]">{label}</span>
      <span className={`relative w-8 h-[18px] max-md:scale-125 max-md:mr-1 rounded-full transition-colors shrink-0 ${checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'}`}>
        <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-[left] ${checked ? 'left-[16px]' : 'left-[2px]'}`} />
      </span>
    </button>
  )
}

export function Segmented({ label, value, options, onChange, stretch }: {
  label: string
  value: string
  options: { value: string; label: string; disabled?: boolean; title?: string; testId?: string }[]
  onChange: (value: string) => void
  stretch?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label}
      className={`flex rounded-[9px] border border-[var(--border-strong)] p-0.5 gap-0.5 ${stretch ? 'w-full' : ''}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          data-testid={o.testId}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={[
            'px-2.5 py-1 max-md:py-2 max-md:text-[12.5px] rounded-[7px] text-[11.5px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap',
            stretch ? 'flex-1' : '',
            value === o.value ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Disclosure({ title, subtitle, badge, open: controlledOpen, onToggle, card, testId, children }: {
  title: string
  testId?: string
  subtitle?: string
  badge?: React.ReactNode
  open?: boolean
  onToggle?: (open: boolean) => void
  card?: boolean
  children: React.ReactNode
}) {
  const [localOpen, setLocalOpen] = useState(false)
  const open = controlledOpen ?? localOpen
  const toggle = (): void => {
    if (onToggle) onToggle(!open)
    else setLocalOpen(!open)
  }
  return (
    <div data-testid={testId} data-open={open ? 'true' : 'false'}
      className={card ? 'rounded-[12px] border border-[var(--border)] p-3' : 'border-t border-[var(--border)] pt-3'}>
      <button type="button" aria-expanded={open} onClick={toggle} className="w-full flex items-center gap-2 text-left">
        <span className="flex-1 min-w-0">
          <span className="block text-[12.5px] font-semibold text-[var(--text)]">{title}</span>
          {subtitle && <span className="block text-[11.5px] text-[var(--text-faint)] mt-0.5">{subtitle}</span>}
        </span>
        {badge}
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
          className={`text-[var(--text-faint)] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M3 5l4 4 4-4" />
        </svg>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  )
}

export interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  digits?: number
  hideLabel?: boolean
  onChange: (v: number) => void
}

export function Slider({ label, value, min, max, step, unit, digits = 1, hideLabel, onChange }: SliderProps) {
  const readout = (
    <span className="text-[11.5px] font-mono tabular-nums text-[var(--text-faint)] whitespace-nowrap">
      {value.toFixed(digits)}{unit ? ` ${unit}` : ''}
    </span>
  )
  const input = (
    <input
      type="range"
      min={min} max={max} step={step} value={value}
      aria-label={hideLabel ? label : undefined}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="pc-range w-full"
    />
  )
  // Without a label the readout sits beside the track instead of on a line of its own.
  if (hideLabel) return <div className="flex items-center gap-3">{input}{readout}</div>
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-[var(--text-dim)]">{label}</span>
        {readout}
      </div>
      {input}
    </label>
  )
}

export function RowIcon({ label, onClick, children, danger, pressed, testId }: {
  label: string; onClick: () => void; children: React.ReactNode; danger?: boolean; pressed?: boolean; testId?: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={`w-7 h-7 max-md:w-11 max-md:h-11 shrink-0 flex items-center justify-center rounded-[7px] text-[var(--text-faint)] hover:bg-[var(--surface)] transition-colors ${
        danger ? 'hover:text-[#E5484D]' : 'hover:text-[var(--text)]'
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  )
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)} M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} k`
  return String(n)
}

export function formatUnit(unitScale: number): string {
  if (Math.abs(unitScale - 1) < 1e-9) return 'm'
  if (Math.abs(unitScale - 0.001) < 1e-9) return 'mm'
  if (Math.abs(unitScale - 0.01) < 1e-9) return 'cm'
  if (Math.abs(unitScale - 0.3048) < 1e-6) return 'ft'
  return `${unitScale} m`
}

/** The 'Scene-wide' tag: these controls ignore the selection. */
export function ScopeTag({ label, hint }: { label: string; hint: string }) {
  return (
    <span title={hint} className="inline-flex items-center gap-1 text-[10.5px] font-medium text-[var(--text-faint)]">
      <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
        <circle cx="7" cy="7" r="5.5" /><path d="M1.5 7h11M7 1.5c2 2 2 9 0 11M7 1.5c-2 2-2 9 0 11" />
      </svg>
      {label}
    </span>
  )
}

export interface PlacementFieldProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  digits?: number
  /** `gesture` is set for slider drags and arrow bursts (one undo step each). */
  onChange: (v: number, gesture?: string) => void
  testId: string
  cloudId: string
  field: string
  exactLabel: string
  hint: string
}

/**
 * A coarse slider plus an exact-value box. The slider's bounds widen to include
 * the current value, so a typed 250 m is not clamped back. The box keeps its
 * own draft and commits on Enter or blur (a new undo step each time); arrow
 * keys nudge by one step (Shift ×10, Alt ×0.1) under one coalesced step; Esc
 * reverts the draft and stops there.
 */
export function PlacementField({
  label, value, min, max, step, unit, digits = 2, onChange, testId, cloudId, field, exactLabel, hint,
}: PlacementFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  useEffect(() => { setDraft(null) }, [cloudId])
  const lo = Math.min(min, value)
  const hi = Math.max(max, value)
  const commit = (): void => {
    if (draft === null) return
    const v = parseFloat(draft.replace(',', '.'))
    setDraft(null)
    if (Number.isFinite(v) && v !== value) onChange(v)
  }
  return (
    <div className="flex flex-col gap-1" data-testid={testId} title={hint}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-[var(--text-dim)]">{label}</span>
        <span className="flex items-center gap-1">
          <input
            type="text"
            inputMode="decimal"
            aria-label={exactLabel}
            value={draft ?? value.toFixed(digits)}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); return }
              if (e.key === 'Escape') {
                if (draft !== null) { e.preventDefault(); e.stopPropagation(); setDraft(null) }
                return
              }
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault()
                const k = e.shiftKey ? 10 : e.altKey ? 0.1 : 1
                const next = Math.round((value + (e.key === 'ArrowUp' ? 1 : -1) * step * k) * 1e9) / 1e9
                setDraft(null)
                onChange(next, `arrow:${cloudId}:${field}`)
              }
            }}
            className="w-[84px] px-1.5 py-0.5 max-md:py-2 rounded-[6px] text-right text-[11.5px] font-mono tabular-nums bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] select-text"
          />
          {unit && <span className="text-[11px] font-mono text-[var(--text-faint)] w-3">{unit}</span>}
        </span>
      </div>
      <input
        type="range"
        min={lo} max={hi} step={step} value={value}
        aria-label={label}
        onChange={(e) => onChange(parseFloat(e.target.value), `slider:${cloudId}:${field}`)}
        className="pc-range w-full"
      />
    </div>
  )
}
