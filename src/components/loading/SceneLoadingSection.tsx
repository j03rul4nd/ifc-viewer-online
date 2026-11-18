// ─── SceneLoadingSection ──────────────────────────────────────────────────────
// The top of the Scene panel while models are on their way: each pending job
// with a mini bar and the one action that matters (Cancel, or Retry once it
// failed), grouped by batch. Loaded models are not repeated here — they are
// already the list below — so the section shrinks as the federation lands and
// disappears when nothing is pending. "Details" opens the Loading Center.
//
// Renders null when there is nothing to show, and only then subscribes to the
// jobs list: a scene panel open during a quiet session costs one counter.

import React, { useMemo } from 'react'
import { useLoadingStore } from '../../stores/loadingStore'
import { ACTIVE_STATUSES } from '../../lib/loading/types'
import { loadingController } from '../../lib/loading/controller'
import { useLoadingT } from '../../i18n/hooks/namespaces'
import {
  batchDisplayName, countScenePending, describePhaseLine, displayPercent, sceneSectionGroups, shownPercent,
  statusGlyphKind, type JobGroup,
} from './job-view'
import { ProgressBar } from './ProgressBar'
import { barToneFor, DisciplineBadge } from './LoadJobRow'
import { CrossGlyph, IconButton, LayersIcon, RetryIcon, StatusGlyph } from './glyphs'
import type { LoadJobView } from '../../lib/loading/types'

export function SceneLoadingSection({ className = '' }: { className?: string }) {
  const count = useLoadingStore((s) => countScenePending(s.jobs))
  if (count === 0) return null
  return <SectionBody count={count} className={className} />
}

function SectionBody({ count, className }: { count: number; className: string }) {
  const { t } = useLoadingT()
  const jobs = useLoadingStore((s) => s.jobs)
  const batches = useLoadingStore((s) => s.batches)
  const openCenter = useLoadingStore((s) => s.openCenter)
  const groups = useMemo(() => sceneSectionGroups(jobs, batches), [jobs, batches])

  return (
    <section aria-label={t('scene.title', { count })} className={`pb-2 mb-2 border-b border-[var(--border)] ${className}`}>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider font-medium">{t('scene.title', { count })}</p>
        <button
          type="button"
          onClick={() => openCenter(null)}
          className="text-[10.5px] font-medium text-[var(--accent-2)] hover:text-[var(--text)] rounded-[3px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent)]"
        >
          {t('scene.details')}
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {groups.map((g) => <SceneGroup key={g.key} group={g} jobs={jobs} />)}
      </div>
    </section>
  )
}

function SceneGroup({ group, jobs }: { group: JobGroup; jobs: readonly LoadJobView[] }) {
  const { t } = useLoadingT()
  const rows = group.jobs.map((job) => <SceneRow key={job.id} job={job} jobs={jobs} />)
  if (!group.batch) return <>{rows}</>
  const name = batchDisplayName(group.batch, group.stats.total, t)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 min-w-0">
        <LayersIcon size={11} className="shrink-0 text-[var(--text-faint)]" />
        <span className="min-w-0 truncate text-[11px] font-medium text-[var(--text)]" title={name}>{name}</span>
        <span className="flex-1" />
        <span className="shrink-0 text-[10px] font-mono tabular-nums text-[var(--text-faint)]">
          {t('batch.members', { loaded: group.stats.loaded, total: group.stats.total })}
        </span>
        <span className="shrink-0 w-[30px] text-right text-[10px] font-mono tabular-nums text-[var(--text-dim)]">
          {displayPercent(group.stats.fraction, false)}%
        </span>
      </div>
      <div className="ml-[5px] pl-2.5 border-l border-[var(--border)] flex flex-col gap-1.5">{rows}</div>
    </div>
  )
}

function SceneRow({ job, jobs }: { job: LoadJobView; jobs: readonly LoadJobView[] }) {
  const { t } = useLoadingT()
  const failed = job.status === 'failed'
  const line = describePhaseLine(job, jobs, t)
  const c = job.capabilities
  const pct = !failed && job.status !== 'queued' && job.status !== 'held' ? shownPercent(job) : null
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="shrink-0 flex w-[12px] justify-center">
          <StatusGlyph kind={statusGlyphKind(job)} fraction={job.progress.fraction} size={12} />
        </span>
        <span className="min-w-0 truncate text-[11.5px] text-[var(--text)]" title={job.fileName}>{job.displayName}</span>
        {job.discipline && <DisciplineBadge id={job.discipline} />}
        <span className="flex-1" />
        {pct != null && (
          <span className="shrink-0 text-[10.5px] font-mono tabular-nums text-[var(--text-dim)]">{pct}%</span>
        )}
        {failed && c.retry && (
          <IconButton label={t('actions.retry')} onClick={() => loadingController.retry(job.id)}>
            <RetryIcon size={12} />
          </IconButton>
        )}
        {ACTIVE_STATUSES.has(job.status) && c.cancel && (
          <IconButton label={t('actions.cancel')} tone="danger" onClick={() => loadingController.cancel(job.id)}>
            <CrossGlyph size={12} />
          </IconButton>
        )}
      </div>
      <div className="pl-[18px] min-w-0">
        {!failed && (
          <div className="mt-0.5">
            <ProgressBar
              fraction={job.progress.fraction}
              determinate={job.progress.determinate}
              active={job.status === 'running'}
              tone={barToneFor(job)}
              height={2}
              label={job.displayName}
            />
          </div>
        )}
        <p className={`mt-0.5 truncate text-[10px] ${failed ? 'text-[var(--danger)]' : 'text-[var(--text-faint)]'}`} title={line}>
          {line}
        </p>
      </div>
    </div>
  )
}
