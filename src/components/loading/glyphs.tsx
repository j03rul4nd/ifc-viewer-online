// ─── Loading glyphs and small controls ────────────────────────────────────────
// Hand-rolled 16-unit SVGs in the same stroke language as Icons.tsx (1.5 px,
// round caps, currentColor), sized for 11–12 px text. A status is told by
// SHAPE first and colour second — clock, pause, hourglass, ring, check,
// warning, cross — so the list reads the same to someone who cannot tell the
// accent from the ok green.

import React from 'react'
import { useReducedMotion } from 'framer-motion'
import type { GlyphKind } from './job-view'

interface SvgProps { size?: number; className?: string }

function Svg({ size = 14, className, children }: SvgProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}
    >
      {children}
    </svg>
  )
}

const RING_R = 6
const RING_C = 2 * Math.PI * RING_R

/** Determinate ring: the arc IS the job's reported fraction, nothing added. */
export function ProgressRing({
  fraction, size = 14, color = 'var(--accent)', spinning = false,
}: { fraction: number; size?: number; color?: string; spinning?: boolean }) {
  const reduce = useReducedMotion()
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0))
  // An indeterminate ring (finishing / removing) shows a quarter arc that
  // turns; with reduced motion it simply holds still.
  const arc = spinning ? RING_C * 0.25 : RING_C * f
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true"
      className={spinning && !reduce ? 'animate-spin' : undefined}
      style={spinning && !reduce ? { animationDuration: '1.4s' } : undefined}
    >
      <circle cx="8" cy="8" r={RING_R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
      {arc > 0 && (
        <circle
          cx="8" cy="8" r={RING_R} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"
          strokeDasharray={`${arc} ${RING_C}`} transform="rotate(-90 8 8)"
          style={{ transition: 'stroke-dasharray 300ms ease-out' }}
        />
      )}
    </svg>
  )
}

export const ClockGlyph = (p: SvgProps) => <Svg {...p}><circle cx="8" cy="8" r="5.75" /><path d="M8 5v3.2l2.1 1.4" /></Svg>
export const PauseGlyph = (p: SvgProps) => <Svg {...p}><path d="M6 4.5v7M10 4.5v7" /></Svg>
export const HourglassGlyph = (p: SvgProps) => (
  <Svg {...p}><path d="M5 2.5h6M5 13.5h6M5.5 2.5v1.3c0 1.4 2.5 2.7 2.5 4.2s-2.5 2.8-2.5 4.2v1.3M10.5 2.5v1.3c0 1.4-2.5 2.7-2.5 4.2s2.5 2.8 2.5 4.2v1.3" /></Svg>
)
export const CheckCircleGlyph = (p: SvgProps) => <Svg {...p}><circle cx="8" cy="8" r="5.75" /><path d="M5.6 8.2l1.7 1.7 3.2-3.6" /></Svg>
export const CheckGlyph = (p: SvgProps) => <Svg {...p}><path d="M3.5 8.5l3 3 6-7" /></Svg>
export const WarnGlyph = (p: SvgProps) => <Svg {...p}><path d="M8 2.5l6 10.5H2L8 2.5z" /><path d="M8 7v2.6M8 11.4h.01" /></Svg>
export const CrossGlyph = (p: SvgProps) => <Svg {...p}><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></Svg>
export const MinusCircleGlyph = (p: SvgProps) => <Svg {...p}><circle cx="8" cy="8" r="5.75" /><path d="M5.5 8h5" /></Svg>
export const PendingGlyph = (p: SvgProps) => <Svg {...p}><circle cx="8" cy="8" r="3" /></Svg>
export const ArrowGlyph = (p: SvgProps) => <Svg {...p}><path d="M3.5 8h9M9 4.5L12.5 8 9 11.5" /></Svg>
export const DashGlyph = (p: SvgProps) => <Svg {...p}><path d="M5 8h6" /></Svg>

// ── Action icons ──────────────────────────────────────────────────────────────
export const RetryIcon = (p: SvgProps) => <Svg {...p}><path d="M13 8a5 5 0 11-1.46-3.54" /><path d="M13 2.8v2.9h-2.9" /></Svg>
export const PlayIcon = (p: SvgProps) => <Svg {...p}><path d="M5.5 4v8l6.5-4-6.5-4z" /></Svg>
export const UpIcon = (p: SvgProps) => <Svg {...p}><path d="M8 12.5v-9M4.5 7L8 3.5 11.5 7" /></Svg>
export const DownIcon = (p: SvgProps) => <Svg {...p}><path d="M8 3.5v9M4.5 9L8 12.5 11.5 9" /></Svg>
export const FocusIcon = (p: SvgProps) => <Svg {...p}><path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3" /><circle cx="8" cy="8" r="1.6" /></Svg>
export const ReloadIcon = (p: SvgProps) => (
  <Svg {...p}><path d="M2.8 7.2A5.3 5.3 0 0112.4 5M13.2 8.8A5.3 5.3 0 013.6 11" /><path d="M12.8 2.4V5.2H10M3.2 13.6V10.8H6" /></Svg>
)
export const TrashIcon = (p: SvgProps) => <Svg {...p}><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" /></Svg>
export const ChevronIcon = (p: SvgProps) => <Svg {...p}><path d="M6 4l4 4-4 4" /></Svg>
export const LayersIcon = (p: SvgProps) => <Svg {...p}><path d="M8 2.5L2.5 5.5 8 8.5l5.5-3L8 2.5z" /><path d="M2.5 8.5L8 11.5l5.5-3M2.5 11L8 14l5.5-3" /></Svg>
export const FileIcon = (p: SvgProps) => <Svg {...p}><path d="M9.5 2H4.5a1 1 0 00-1 1v10a1 1 0 001 1h7a1 1 0 001-1V5L9.5 2z" /><path d="M9.5 2v3h3" /></Svg>

// ── Status glyph ──────────────────────────────────────────────────────────────

export function StatusGlyph({ kind, fraction, size = 14 }: { kind: GlyphKind; fraction: number; size?: number }) {
  switch (kind) {
    case 'running':   return <ProgressRing fraction={fraction} size={size} />
    case 'working':   return <ProgressRing fraction={fraction} size={size} spinning />
    case 'stalled':   return <ProgressRing fraction={fraction} size={size} color="var(--warn)" />
    case 'finishing': return <ProgressRing fraction={1} size={size} color="var(--ok)" spinning />
    case 'unloading': return <ProgressRing fraction={0} size={size} color="var(--text-dim)" spinning />
    case 'waiting':   return <HourglassGlyph size={size} className="text-[var(--text-dim)] shrink-0" />
    case 'queued':    return <ClockGlyph size={size} className="text-[var(--text-faint)] shrink-0" />
    case 'held':      return <PauseGlyph size={size} className="text-[var(--text-dim)] shrink-0" />
    case 'loaded':    return <CheckCircleGlyph size={size} className="text-[var(--ok)] shrink-0" />
    case 'failed':    return <WarnGlyph size={size} className="text-[var(--danger)] shrink-0" />
    case 'cancelled': return <CrossGlyph size={size} className="text-[var(--text-faint)] shrink-0" />
    case 'removed':   return <MinusCircleGlyph size={size} className="text-[var(--text-faint)] shrink-0" />
  }
}

// ── Icon button ───────────────────────────────────────────────────────────────

/**
 * 22 px square (28 on touch, where a fingertip needs the room). Always carries
 * an accessible name: these buttons are glyph-only, and "button" is not a
 * name a screen reader user can act on.
 */
export function IconButton({
  label, onClick, children, tone = 'default', touch = false, pressed, expanded, disabled, className = '', buttonRef,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  tone?: 'default' | 'danger' | 'armed'
  touch?: boolean
  /** Toggle state (armed remove). */
  pressed?: boolean
  /** Disclosure state (details chevron). */
  expanded?: boolean
  disabled?: boolean
  className?: string
  /** A stable focus target (the center's close button, after an inline confirm). */
  buttonRef?: React.Ref<HTMLButtonElement>
}) {
  const tones = {
    default: 'text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]',
    danger:  'text-[var(--text-faint)] hover:text-[var(--danger)] hover:bg-[rgba(229,72,77,0.1)]',
    armed:   'text-white bg-[var(--danger)] hover:brightness-110',
  }
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center shrink-0 rounded-[5px] transition-colors duration-100',
        'focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent)]',
        'disabled:opacity-35 disabled:cursor-not-allowed',
        touch ? 'w-[32px] h-[32px]' : 'w-[22px] h-[22px]',
        tones[tone], className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

/** Quiet text button for footers and inline confirms. */
export function TextButton({
  onClick, children, tone = 'default', disabled, buttonRef,
}: {
  onClick: () => void
  children: React.ReactNode
  tone?: 'default' | 'danger' | 'accent'
  disabled?: boolean
  /** For inline confirms, which move focus between the trigger and the answer. */
  buttonRef?: React.Ref<HTMLButtonElement>
}) {
  const tones = {
    default: 'text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]',
    danger:  'text-[var(--danger)] hover:bg-[rgba(229,72,77,0.1)]',
    accent:  'text-[var(--accent-2)] hover:bg-[rgba(94,106,210,0.12)]',
  }
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex items-center gap-1 h-[22px] px-2 rounded-[5px] text-[10.5px] font-medium whitespace-nowrap transition-colors duration-100',
        'focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent)] disabled:opacity-35 disabled:cursor-not-allowed',
        tones[tone],
      ].join(' ')}
    >
      {children}
    </button>
  )
}
