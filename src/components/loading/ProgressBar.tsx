// ─── Loading progress bar ─────────────────────────────────────────────────────
// Two separate signals in one bar, and the reason it is not a stock <progress>:
//
//   • the FILL is the job's aggregated fraction — done phases count fully and
//     the active phase counts only what it measured, so it never jumps ahead;
//   • when the active phase measures nothing (serialize, setup, a cache read),
//     a soft segment sweeps across the UNFINISHED part. That is activity, not a
//     number: the fill stays where the evidence puts it, and the sweep says the
//     worker is alive. Faking a creeping fill here is exactly the dishonesty
//     docs/MODEL_LOADING.md §3 rules out.
//
// With reduced motion the sweep is not drawn; the elapsed clock beside the bar
// already carries "still working".

import React from 'react'
import { useReducedMotion } from 'framer-motion'

export type BarTone = 'accent' | 'ok' | 'danger' | 'warn' | 'muted'

const FILL: Record<BarTone, string> = {
  accent: 'var(--accent)',
  ok:     'var(--ok)',
  danger: 'var(--danger)',
  warn:   'var(--warn)',
  muted:  'var(--text-faint)',
}

export function ProgressBar({
  fraction, determinate, active, tone = 'accent', height = 3, label,
}: {
  fraction: number
  /** The active phase reports real progress. */
  determinate: boolean
  /** Work is happening right now (running / unloading) — enables the sweep. */
  active: boolean
  tone?: BarTone
  height?: number
  /** Accessible name; the bar is announced as a progressbar with this label. */
  label?: string
}) {
  const reduce = useReducedMotion()
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0))
  const pct = f * 100
  const sweep = active && !determinate && !reduce && f < 1
  // Nothing measured yet (an indeterminate phase, no earlier phase done): an
  // ARIA progressbar without a value is "busy, amount unknown" — "0 percent"
  // would announce a measurement nobody took.
  const measured = determinate || f > 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={measured ? Math.round(pct) : undefined}
      aria-busy={active && !determinate ? true : undefined}
      className="relative w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.07)]"
      style={{ height }}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%`, background: FILL[tone] }}
      />
      {sweep && (
        <div className="absolute inset-y-0 right-0 overflow-hidden" style={{ left: `${pct}%` }}>
          <div
            className="absolute inset-y-0 left-0 w-[35%] animate-toolbar-sweep"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(94,106,210,0.55), transparent)' }}
          />
        </div>
      )}
    </div>
  )
}
