// ─── Resident-point budget meter ──────────────────────────────────────────────
// How much of the point cap the loaded scans take (pc-runner's ledger): why
// the next scan waits or comes out truncated, shown before it happens rather
// than after. Two parts — points uploaded, and points promised to scans still
// parsing — because a plain-text scan is promised everything left until it
// knows its count, and one lump of "used" read as a full budget for a file
// using a fraction of it.

import React, { useId, useState } from 'react'
import type { TFunction } from 'i18next'

/** From here the text says so too, not only the colour. */
export const NEARLY_FULL = 0.9

export interface PointBudgetMeterProps {
  resident: number
  reserved: number
  max: number
  t: TFunction<'pointcloud'>
  format: (n: number) => string
}

export default function PointBudgetMeter({ resident, reserved, max, t, format }: PointBudgetMeterProps) {
  const [open, setOpen] = useState(false)
  const hintId = useId()
  const ratio = max > 0 ? Math.min(1, resident / max) : 0
  const reservedRatio = max > 0 ? Math.min(1 - ratio, reserved / max) : 0
  const nearlyFull = ratio >= NEARLY_FULL
  // Full, not nearly: the next whole-file scan is refused outright.
  const full = max > 0 && resident >= max
  const values = { used: format(resident), max: format(max) }
  const text = t(full ? 'status.budgetFull' : nearlyFull ? 'status.budgetNearlyFull' : 'status.budget', values)
  const reservedText = reserved > 0 ? t('status.budgetReserved', { reserved: format(reserved) }) : null

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-1 text-[10px] font-mono text-[var(--text-faint)]">
        <span className={nearlyFull ? 'text-amber-400' : undefined}>{text}</span>
        <button
          type="button"
          aria-label={t('status.budgetAbout')}
          aria-expanded={open}
          aria-controls={hintId}
          title={t('status.budgetAbout')}
          onClick={() => setOpen((v) => !v)}
          className="ml-auto w-6 h-6 -my-1 grid place-items-center rounded font-sans text-[10px] hover:bg-[var(--surface-hover,rgba(255,255,255,0.06))] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent)]"
        >
          <span aria-hidden="true">?</span>
        </button>
      </div>
      {reservedText && <div className="text-[10px] font-mono text-[var(--text-faint)] opacity-80">{reservedText}</div>}
      <div
        className="mt-0.5 h-1 rounded-full bg-[var(--border)] overflow-hidden flex"
        role="meter"
        aria-label={t('status.budgetLabel')}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(resident, max)}
        aria-valuetext={reservedText ? `${text}, ${reservedText}` : text}
      >
        <div
          className={`h-full ${nearlyFull ? 'bg-amber-400' : 'bg-[var(--accent)]'}`}
          style={{ width: `${ratio * 100}%` }}
        />
        {reservedRatio > 0 && (
          <div
            data-part="reserved"
            className={`h-full opacity-40 ${nearlyFull ? 'bg-amber-400' : 'bg-[var(--accent)]'}`}
            style={{ width: `${reservedRatio * 100}%` }}
          />
        )}
      </div>
      <p id={hintId} hidden={!open} className="mt-1 text-[10px] leading-snug text-[var(--text-faint)]">
        {t('status.budgetHint')}
      </p>
    </div>
  )
}
