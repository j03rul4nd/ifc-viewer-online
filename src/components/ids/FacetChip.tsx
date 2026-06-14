// ─── FacetChip ────────────────────────────────────────────────────────────────
// Tiny rounded chip for an IDS facet kind (entity/attribute/property/
// classification/material/partOf). Used in spec rows and as filter toggles.

import React from 'react'
import { useTranslation } from 'react-i18next'

export const FACET_KINDS = ['entity', 'attribute', 'property', 'classification', 'material', 'partOf'] as const

export function FacetChip({ kind, active, onClick }: {
  kind: string
  /** When used as a filter toggle. */
  active?: boolean
  onClick?: () => void
}) {
  const { t } = useTranslation('ids')
  const label = t(`facets.${kind}`, { defaultValue: kind })
  const cls = `inline-flex items-center h-[16px] px-1.5 rounded-full text-[9px] font-medium leading-none transition-colors ${
    onClick ? 'cursor-pointer' : ''
  } ${
    active
      ? 'bg-[rgba(94,106,210,0.18)] text-[var(--accent)] border border-[rgba(94,106,210,0.4)]'
      : 'bg-[var(--surface-2)] text-[var(--text-faint)] border border-[var(--border)]'
  }`
  return onClick
    ? <button onClick={onClick} className={cls}>{label}</button>
    : <span className={cls}>{label}</span>
}
