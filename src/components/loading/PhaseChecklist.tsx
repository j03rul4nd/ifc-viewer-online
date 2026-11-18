// ─── Phase checklist ──────────────────────────────────────────────────────────
// The job's real pipeline, step by step, as the adapter declared and reported
// it: ✓ done (with its wall time), → active (with whatever it measured),
// ○ pending, – skipped (and why, when a cache hit is the reason), ⚠ failed.
// Shared by the job details in the Loading Center and the first-load card, so
// the two can never describe the same load differently.

import React from 'react'
import type { LoadJobView, PhaseStatus } from '../../lib/loading/types'
import { formatDuration } from '../../lib/utils'
import { useLoadingT } from '../../i18n/hooks/namespaces'
import { formatCounters, phaseChecklist } from './job-view'
import { phaseKey } from './labels'
import { ArrowGlyph, CheckGlyph, DashGlyph, PendingGlyph, WarnGlyph } from './glyphs'

function Mark({ status }: { status: PhaseStatus }) {
  switch (status) {
    case 'done':    return <CheckGlyph size={12} className="text-[var(--ok)] shrink-0" />
    case 'active':  return <ArrowGlyph size={12} className="text-[var(--accent-2)] shrink-0" />
    case 'skipped': return <DashGlyph size={12} className="text-[var(--text-faint)] shrink-0" />
    case 'failed':  return <WarnGlyph size={12} className="text-[var(--danger)] shrink-0" />
    default:        return <PendingGlyph size={12} className="text-[var(--text-faint)] shrink-0" />
  }
}

const LABEL_TONE: Record<PhaseStatus, string> = {
  done:    'text-[var(--text-dim)]',
  active:  'text-[var(--text)] font-medium',
  pending: 'text-[var(--text-faint)]',
  skipped: 'text-[var(--text-faint)] line-through decoration-[rgba(255,255,255,0.18)]',
  failed:  'text-[var(--danger)]',
}

export function PhaseChecklist({ job, size = 'sm' }: { job: LoadJobView; size?: 'sm' | 'md' }) {
  const { t } = useLoadingT()
  const items = phaseChecklist(job)
  if (items.length === 0) return null
  const text = size === 'md' ? 'text-[11.5px]' : 'text-[11px]'
  return (
    <ol className="flex flex-col gap-[3px]" aria-label={t('details.steps')}>
      {items.map(({ phase, durationMs, skipReason }) => {
        let right = ''
        if (phase.status === 'done' && durationMs != null) right = formatDuration(durationMs)
        else if (phase.status === 'active') {
          const parts: string[] = []
          const counters = formatCounters(phase, t)
          if (counters) parts.push(counters)
          else if (phase.fraction != null) parts.push(`${Math.floor(phase.fraction * 100)}%`)
          if (phase.detail) parts.push(phase.detail)
          right = parts.join(' · ')
        } else if (phase.status === 'skipped') {
          right = skipReason === 'cache' ? t('details.cacheHit') : t('details.skipped')
        }
        return (
          <li key={phase.id} className={`flex items-center gap-2 min-w-0 ${text}`}>
            <Mark status={phase.status} />
            <span className={`truncate ${LABEL_TONE[phase.status]}`}>{t(phaseKey(job.kind, phase.id))}</span>
            {phase.background && (
              <span className="shrink-0 text-[9.5px] uppercase tracking-wider text-[var(--text-faint)]">
                {t('details.afterLoad')}
              </span>
            )}
            <span className="flex-1" />
            {right && (
              <span className="shrink-0 max-w-[55%] truncate font-mono tabular-nums text-[10.5px] text-[var(--text-faint)]" title={right}>
                {right}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
