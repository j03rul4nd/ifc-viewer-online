// ─── Map panel layout primitives ──────────────────────────────────────────────
// The panel grew section by section and each one invented its own padding and
// its own idea of a control, which is how it ended up as 1500px of scroll with
// no visible hierarchy. These primitives are the whole layout system: one
// spacing scale, one row shape, one way to say "this is a group", and controls
// that are physically incapable of clipping their own text.
//
// Moved out of GeoPanel.tsx when the panel was split into sections; every
// section imports from here and nowhere else for its chrome.

import React from 'react'
import { motion } from 'framer-motion'
import { ErrorBoundary } from '../ErrorBoundary'
import type { GeorefExtraction } from '../../lib/geo/geo-types'

/** Horizontal padding shared by every section — the panel's optical margin. */
export const SECTION_X = 'px-3.5'

/** A tab body: consistent padding and vertical rhythm, nothing else. */
export function Group({ children }: { children: React.ReactNode }) {
  return <div className={`${SECTION_X} py-3 flex flex-col gap-2.5`}>{children}</div>
}

/** Small uppercase label that starts a group of related controls. */
export function Caption({ children, trailing }: { children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-0.5">
      <span className="text-[9.5px] font-mono text-[var(--text-faint)] tracking-[0.1em] uppercase">
        {children}
      </span>
      {trailing && <span className="ml-auto flex items-center gap-1">{trailing}</span>}
    </div>
  )
}

/** Muted explanatory line under a control. */
export function Hint({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return (
    <p className={`text-[10px] leading-snug ${active ? 'text-[var(--text-dim)]' : 'text-[var(--text-faint)]'}`}>
      {children}
    </p>
  )
}

export type NoticeTone = 'muted' | 'info' | 'warn' | 'danger'

/**
 * Inline message with a tone, and optionally ONE action.
 *
 * The action lives inside the notice on purpose: "the view is slow" next to a
 * "Lower quality" button is one decision; the same sentence with the button in
 * another tab is a puzzle.
 */
export function Notice({ tone = 'muted', children, action }: {
  tone?: NoticeTone
  children: React.ReactNode
  action?: { label: string; onClick: () => void }
}) {
  const style =
    tone === 'danger' ? 'border-[rgba(229,72,77,0.4)] bg-[rgba(229,72,77,0.08)] text-[var(--text-dim)]'
    : tone === 'warn' ? 'border-[rgba(245,166,35,0.4)] bg-[rgba(245,166,35,0.08)] text-[var(--text-dim)]'
    : tone === 'info' ? 'border-[rgba(94,106,210,0.35)] bg-[rgba(94,106,210,0.08)] text-[var(--text-dim)]'
    : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-faint)]'
  return (
    <div className={`text-[10px] leading-snug px-2 py-1.5 rounded-[7px] border ${style} flex items-start gap-2`} role={tone === 'danger' ? 'alert' : undefined}>
      <span className="min-w-0 flex-1">{children}</span>
      {action && (
        <button
          onClick={action.onClick}
          className="shrink-0 -my-0.5 px-1.5 py-0.5 rounded-[5px] text-[10px] font-medium text-[var(--accent-2)] hover:bg-[rgba(94,106,210,0.14)] transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

/** Labelled form field — label and control always travel together. */
export function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-0.5 ${className}`}>
      <span className="text-[10px] text-[var(--text-faint)]">{label}</span>
      {children}
    </label>
  )
}

/** A sub-flow that takes over the body, with an unmistakable way back. */
export function Sheet({ title, backLabel, onBack, children }: {
  title: string
  backLabel: string
  onBack: () => void
  children: React.ReactNode
}) {
  return (
    <div className={`${SECTION_X} py-3 flex flex-col gap-2.5`}>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onBack}
          className="-ml-1 p-1 rounded-[6px] text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
          aria-label={backLabel}
          title={backLabel}
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8.5 2.5L4 7l4.5 4.5" />
          </svg>
        </button>
        <span className="text-[11.5px] font-semibold">{title}</span>
      </div>
      {children}
    </div>
  )
}

/**
 * One setting per row: name on the left, state on the right, always in the same
 * place. A real switch rather than a checkbox — at this size a checkbox reads as
 * a bullet, and "is it on?" has to be answerable from across the panel.
 */
export function SwitchRow({ label, checked, onChange, disabled = false, busy = false, note, tone = 'muted', trailing, compact = false, icon }: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  busy?: boolean
  note?: string
  tone?: 'muted' | 'danger'
  trailing?: React.ReactNode
  compact?: boolean
  icon?: React.ReactNode
}) {
  return (
    <label
      className={[
        'flex items-center gap-2 rounded-[7px] -mx-1 px-1 transition-colors',
        compact ? 'py-1' : 'py-1.5',
        disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--surface-2)]',
      ].join(' ')}
    >
      {icon && <span className="shrink-0 text-[var(--text-faint)]" aria-hidden>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${compact ? 'text-[10.5px]' : 'text-[11.5px]'} text-[var(--text-dim)]`}>
          {label}
        </span>
        {note && (
          <span className={`block text-[9.5px] leading-snug ${tone === 'danger' ? 'text-[var(--danger)]' : 'text-[var(--text-faint)]'}`}>
            {note}
          </span>
        )}
      </span>
      {trailing}
      {busy && <Spinner />}
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <span
        aria-hidden
        className={[
          'relative shrink-0 w-[26px] h-[15px] rounded-full transition-colors',
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)] peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-[var(--bg)]',
        ].join(' ')}
      >
        <span
          className="absolute top-[2px] left-[2px] w-[11px] h-[11px] rounded-full bg-white transition-transform duration-150"
          style={{ transform: checked ? 'translateX(11px)' : 'translateX(0)' }}
        />
      </span>
    </label>
  )
}

export function Spinner({ size = 9 }: { size?: number }) {
  return (
    <span
      className="rounded-full border-[1.5px] border-[var(--accent)] border-t-transparent animate-spin shrink-0"
      style={{ width: size, height: size }}
      aria-hidden
    />
  )
}

/**
 * Wrapping choice group. `flex-wrap` + a min-width per option is what fixes the
 * clipping: a long label ("Personalizada", "Hypsometric") pushes its option onto
 * the next row instead of being cut off, in EVERY locale — which a fixed
 * `grid-cols-4` can never guarantee, since translations vary in length.
 */
export function Choices<T extends string>({ options, onSelect, minWidth = 90, label }: {
  options: ReadonlyArray<{ id: T; label: string; active?: boolean; disabled?: boolean }>
  onSelect: (id: T) => void
  minWidth?: number
  /** Accessible name of the group. */
  label?: string
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onSelect(o.id)}
          title={o.label}
          aria-pressed={o.active ?? false}
          disabled={o.disabled}
          style={{ minWidth }}
          className={[
            'flex-1 px-2 h-[28px] rounded-[7px] text-[10.5px] font-medium leading-tight truncate',
            'border transition-colors active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none',
            o.active
              ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
              : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * A compact two- or three-way switch for choices that are ONE setting with
 * few values (Basic / Advanced). Reads as a single control, where `Choices`
 * reads as a set of options.
 */
export function Segmented<T extends string>({ options, value, onChange, label, size = 'sm' }: {
  options: ReadonlyArray<{ id: T; label: string }>
  value: T
  onChange: (id: T) => void
  label: string
  size?: 'xs' | 'sm'
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="relative flex items-center p-[2px] rounded-[7px] bg-[var(--surface-2)] border border-[var(--border)]"
    >
      {options.map((o) => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={[
              'relative z-[1] px-2 rounded-[5px] font-medium transition-colors whitespace-nowrap',
              size === 'xs' ? 'h-[18px] text-[9.5px]' : 'h-[22px] text-[10.5px]',
              active ? 'text-[var(--text)]' : 'text-[var(--text-faint)] hover:text-[var(--text-dim)]',
            ].join(' ')}
          >
            {active && (
              <motion.span
                layoutId={`seg-${label}`}
                className="absolute inset-0 -z-[1] rounded-[5px] bg-[var(--border-strong)]"
                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
              />
            )}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Secondary controls behind one obvious affordance — a row, not a `▸` glyph. */
export function Expander({ open, onToggle, label, children }: {
  open: boolean
  onToggle: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center gap-1.5 -mx-1 px-1 py-1 rounded-[7px] text-[10.5px] text-[var(--text-faint)] hover:text-[var(--text-dim)] hover:bg-[var(--surface-2)] transition-colors"
      >
        <svg
          width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          className="transition-transform duration-150 shrink-0"
          style={{ transform: open ? 'rotate(90deg)' : 'none' }}
          aria-hidden
        >
          <path d="M4 2.5L8 6l-4 3.5" />
        </svg>
        {label}
      </button>
      {open && (
        <div className="mt-1.5 flex flex-col gap-1.5 pl-2 border-l border-[var(--border)]">
          {children}
        </div>
      )}
    </div>
  )
}

/** A self-contained expander for a long explanation that most people skip. */
export function MoreInfo({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Expander open={open} onToggle={() => setOpen((v) => !v)} label={label}>
      <Hint>{children}</Hint>
    </Expander>
  )
}

interface LookSliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}

/** Compact labelled slider. */
export function LookSlider({ label, value, min, max, step, format, onChange }: LookSliderProps) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[10px] text-[var(--text-faint)] w-[54px] shrink-0">{label}</span>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-[var(--accent)]"
        aria-label={label}
      />
      <span className="text-[10px] font-mono w-[34px] text-right tabular-nums text-[var(--text-dim)]">
        {format(value)}
      </span>
    </label>
  )
}

/** Determinate (0..1) or indeterminate progress, one pixel of chrome. */
export function ProgressBar({ value }: { value: number | null }) {
  return (
    <div className="relative h-[3px] rounded-full bg-[var(--surface-2)] overflow-hidden" role="progressbar"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={value === null ? undefined : Math.round(value * 100)}>
      {value === null ? (
        <motion.span
          className="absolute inset-y-0 w-1/3 rounded-full bg-[var(--accent)]"
          initial={{ left: '-33%' }}
          animate={{ left: '100%' }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        />
      ) : (
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)] transition-[width] duration-200"
          style={{ width: `${Math.max(4, Math.min(100, value * 100))}%` }}
        />
      )}
    </div>
  )
}

/** Three dots, filled up to `level` — the cost of a preset at a glance. */
export function CostDots({ level, label }: { level: 1 | 2 | 3; label: string }) {
  return (
    <span className="inline-flex items-center gap-[3px]" title={label} aria-label={label}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[5px] h-[5px] rounded-full"
          style={{
            background: i <= level
              ? level === 3 ? 'var(--warn)' : level === 2 ? 'var(--accent-2)' : 'var(--ok)'
              : 'var(--border-strong)',
          }}
        />
      ))}
    </span>
  )
}

/** Label / value line for the performance readout. */
export function StatRow({ label, value, tone = 'normal' }: { label: string; value: React.ReactNode; tone?: 'normal' | 'warn' | 'danger' }) {
  const color = tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : 'var(--text-dim)'
  return (
    <div className="flex items-baseline gap-2 text-[10.5px]">
      <span className="text-[var(--text-faint)]">{label}</span>
      <span className="ml-auto font-mono tabular-nums text-right" style={{ color }}>{value}</span>
    </div>
  )
}

export function StatusDot({ status }: { status: GeorefExtraction['status'] }) {
  const color =
    status === 'found' ? 'var(--ok)'
    : status === 'partial' ? 'var(--warn)'
    : status === 'invalid' ? 'var(--danger)'
    : 'var(--text-faint)'
  return <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
}

/** Map state as a colour + word, next to the title where it is read first. */
export function ModeChip({ mode, label }: { mode: string; label: string }) {
  const tone =
    mode === 'on' ? { fg: 'var(--ok)', bg: 'rgba(48,163,108,0.12)' }
    : mode === 'starting' ? { fg: 'var(--accent-2)', bg: 'rgba(94,106,210,0.14)' }
    : mode === 'error' ? { fg: 'var(--danger)', bg: 'rgba(229,72,77,0.12)' }
    : { fg: 'var(--text-faint)', bg: 'var(--surface-2)' }
  return (
    <span
      className="px-1.5 py-[1px] rounded-[5px] text-[9px] font-medium uppercase tracking-[0.08em]"
      style={{ color: tone.fg, background: tone.bg }}
    >
      {label}
    </span>
  )
}

export function NudgeBtn({ label, ariaLabel, onClick }: { label: string; ariaLabel?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      className="w-6 h-6 rounded-[5px] text-[11px] text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] active:scale-95 transition-all"
    >
      {label}
    </button>
  )
}

/** Primary / secondary / ghost button at panel scale. */
export function Button({ variant = 'secondary', size = 'md', className = '', children, ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'accent-outline' | 'ghost'
    size?: 'md' | 'lg'
  },
) {
  const v =
    variant === 'primary' ? 'bg-[var(--accent)] text-white font-semibold hover:brightness-110'
    : variant === 'accent-outline' ? 'border border-[var(--accent)] text-[var(--accent-2)] font-medium hover:bg-[rgba(94,106,210,0.12)]'
    : variant === 'ghost' ? 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
    : 'border border-[var(--border-strong)] text-[var(--text-dim)] font-medium hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
  const s = size === 'lg' ? 'h-[34px] rounded-[9px] text-[12.5px]' : 'h-[30px] rounded-[8px] text-[11.5px]'
  return (
    <button
      {...rest}
      className={`${s} ${v} px-3 inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.99] transition-all ${className}`}
    >
      {children}
    </button>
  )
}

/**
 * A section that cannot take the panel down with it.
 *
 * The map panel is also where the attribution the licences require is kept
 * alive and where the user turns the map OFF. A render error in, say, the
 * performance table must not cost either — so each section fails alone, with a
 * retry, and the rest of the panel keeps working.
 */
export function SectionBoundary({ children, message, retryLabel }: {
  children: React.ReactNode
  message: string
  retryLabel: string
}) {
  return (
    <ErrorBoundary
      fallback={(_error, reset) => (
        <Group>
          <Notice tone="danger" action={{ label: retryLabel, onClick: reset }}>{message}</Notice>
        </Group>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}
