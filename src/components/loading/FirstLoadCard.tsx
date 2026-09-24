// ─── FirstLoadCard ────────────────────────────────────────────────────────────
// What an empty viewer shows while its first model loads: the file, a large
// honest progress bar, the step it is on with its real counters, the whole
// checklist, and elapsed / ETA — so the first thirty seconds with a big IFC
// read as work being done, not as a blank canvas.
//
// Deliberately NOT modal: the wrapper fills its (relative) parent with
// pointer-events off and only the card takes clicks, so the viewer — and the
// toolbar, and a second drop — stays usable underneath. It steps aside the
// moment a model is in the scene, and whenever the Loading Center is open (the
// same information twice on one screen is noise).
//
// For a federated batch it leads with the batch ("Hotel Vela — 2 of 5 models")
// and lists the members compactly; the checklist belongs to one job, so it is
// shown only in single-job mode.
//
// If the only load failed before anything landed, the card stays to say why —
// an empty viewer with a small red chip in the toolbar is easy to miss —
// until the failure has been seen (opening the details counts).

import React, { useMemo } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useSceneStore } from '../../stores/sceneStore'
import { useLoadingStore, selectCenterOpen } from '../../stores/loadingStore'
import { ACTIVE_STATUSES } from '../../lib/loading/types'
import type { LoadJobView } from '../../lib/loading/types'
import { loadingController } from '../../lib/loading/controller'
import { formatBytes } from '../../lib/utils'
import { useLoadingT } from '../../i18n/hooks/namespaces'
import {
  activePhase, batchDisplayName, describePhaseLine, displayPercent, formatCounters, formatElapsed, formatEta,
  groupStats, isLiveJob, jobElapsedMs, jobEtaMs, pickFirstLoadFocus, shownPercent, statusGlyphKind, type FirstLoadFocus,
} from './job-view'
import { ERROR_KEYS, PHASE_ACTIVE_KEYS } from './labels'
import { useNow } from './useNow'
import { ProgressBar } from './ProgressBar'
import { PhaseChecklist } from './PhaseChecklist'
import { DisciplineBadge, barToneFor } from './LoadJobRow'
import { FileIcon, LayersIcon, StatusGlyph, TextButton } from './glyphs'

export function FirstLoadCard() {
  const { t } = useLoadingT()
  const reduce = useReducedMotion()
  const sceneEmpty = useSceneStore((s) => s.models.length === 0)
  const centerOpen = useLoadingStore(selectCenterOpen)
  const hasActive = useLoadingStore((s) => s.jobs.some((j) => j.managed && ACTIVE_STATUSES.has(j.status)))
  const hasUnseenFailure = useLoadingStore(
    (s) => s.summary.unseenFailures > 0 && s.jobs.some((j) => j.managed && j.status === 'failed'),
  )
  const visible = sceneEmpty && !centerOpen && (hasActive || hasUnseenFailure)

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="first-load-card"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          className="absolute inset-0 z-[12] flex items-center justify-center p-4 pointer-events-none"
        >
          <motion.div
            initial={{ y: reduce ? 0 : 6 }}
            animate={{ y: 0 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: 'easeOut' }}
            role="region"
            aria-label={t('center.title')}
            className="pointer-events-auto w-[min(420px,100%)] max-h-full overflow-y-auto overscroll-contain glass-md border border-[var(--border-strong)] rounded-[12px] shadow-2xl p-4 select-none"
          >
            <CardBody includeFailed={!hasActive} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function CardBody({ includeFailed }: { includeFailed: boolean }) {
  const { t } = useLoadingT()
  const jobs = useLoadingStore((s) => s.jobs)
  const batches = useLoadingStore((s) => s.batches)
  const openCenter = useLoadingStore((s) => s.openCenter)
  const focus = useMemo(() => pickFirstLoadFocus(jobs, batches, includeFailed), [jobs, batches, includeFailed])
  const liveCount = useMemo(() => jobs.filter(isLiveJob).length, [jobs])
  if (!focus) return null

  const footer = (
    <>
      <p className="mt-3 text-[10.5px] leading-snug text-[var(--text-faint)]">{t('firstLoad.hint')}</p>
      <div className="mt-2.5 flex items-center gap-1.5">
        <TextButton tone="accent" onClick={() => openCenter(focus.mode === 'job' ? focus.job.id : null)}>
          {t('firstLoad.showDetails', { count: Math.max(1, liveCount) })}
        </TextButton>
        <span className="flex-1" />
        <CardCancel focus={focus} />
      </div>
    </>
  )

  return (
    <>
      {focus.mode === 'batch' ? <BatchView focus={focus} jobs={jobs} /> : <JobView job={focus.job} jobs={jobs} />}
      {footer}
    </>
  )
}

function CardCancel({ focus }: { focus: FirstLoadFocus }) {
  const { t } = useLoadingT()
  if (focus.job.status === 'failed') {
    const c = focus.job.capabilities
    return (
      <>
        {c.retry && <TextButton tone="accent" onClick={() => loadingController.retry(focus.job.id)}>{t('actions.retry')}</TextButton>}
        {c.dismiss && <TextButton onClick={() => loadingController.dismiss(focus.job.id)}>{t('firstLoad.dismiss')}</TextButton>}
      </>
    )
  }
  if (focus.mode === 'batch') {
    const cancellable = focus.members.filter((m) => ACTIVE_STATUSES.has(m.status) && m.capabilities.cancel)
    if (cancellable.length === 0) return null
    return (
      <TextButton tone="danger" onClick={() => { for (const m of cancellable) loadingController.cancel(m.id) }}>
        {t('firstLoad.cancelBatch')}
      </TextButton>
    )
  }
  if (!focus.job.capabilities.cancel) return null
  return <TextButton tone="danger" onClick={() => loadingController.cancel(focus.job.id)}>{t('firstLoad.cancel')}</TextButton>
}

function Timing({ job }: { job: LoadJobView }) {
  const { t } = useLoadingT()
  const now = useNow(1000, job.status === 'running' || job.status === 'waiting')
  const parts: string[] = []
  const elapsed = jobElapsedMs(job, now)
  if (elapsed != null) parts.push(t('firstLoad.elapsed', { time: formatElapsed(elapsed) }))
  const eta = job.status === 'running' ? jobEtaMs(job, now) : null
  if (eta != null) parts.push(t('firstLoad.eta', { time: formatEta(eta) }))
  if (parts.length === 0) return null
  return <p className="text-[11px] tabular-nums text-[var(--text-faint)]">{parts.join(' · ')}</p>
}

function JobView({ job, jobs }: { job: LoadJobView; jobs: readonly LoadJobView[] }) {
  const { t } = useLoadingT()
  const failed = job.status === 'failed'
  const phase = job.status === 'running' ? activePhase(job) : null
  const headline = phase ? t(PHASE_ACTIVE_KEYS[phase.id]) : describePhaseLine(job, jobs, t)
  const counters = phase ? [formatCounters(phase, t), phase.detail].filter(Boolean).join(' · ') : ''
  // null until something measured: the headline and the sweeping bar carry
  // "working" meanwhile, rather than a big "0%" that looks like a reading.
  const pct = shownPercent(job)

  return (
    <>
      <div className="flex items-center gap-2 min-w-0">
        <FileIcon size={15} className="shrink-0 text-[var(--text-faint)]" />
        <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--text)]" title={job.fileName}>{job.displayName}</span>
        {job.discipline && <DisciplineBadge id={job.discipline} />}
        <span className="flex-1" />
        {job.sizeBytes > 0 && (
          <span className="shrink-0 text-[11px] font-mono tabular-nums text-[var(--text-faint)]">{formatBytes(job.sizeBytes)}</span>
        )}
      </div>

      {failed && job.error ? (
        <div className="mt-3 rounded-[8px] border border-[rgba(229,72,77,0.3)] bg-[rgba(229,72,77,0.07)] p-2.5">
          <p className="text-[12px] leading-snug text-[var(--text)]">
            {t(ERROR_KEYS[job.error.code], { status: job.error.httpStatus != null ? String(job.error.httpStatus) : '—' })}
          </p>
          <p className="mt-1 text-[10.5px] text-[var(--danger)]">{describePhaseLine(job, jobs, t)}</p>
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-baseline gap-2.5 min-w-0">
            {pct != null && (
              <span className="shrink-0 text-[26px] leading-none font-semibold tabular-nums text-[var(--text)]" title={t('indicator.estimate')}>
                {pct}<span className="text-[15px] text-[var(--text-dim)]">%</span>
              </span>
            )}
            <span className="min-w-0 truncate text-[12px] text-[var(--text-dim)]" title={headline}>{headline}</span>
          </div>
          <div className="mt-2.5">
            <ProgressBar
              fraction={job.progress.fraction}
              determinate={job.progress.determinate}
              active={job.status === 'running'}
              tone={barToneFor(job)}
              height={6}
              label={job.displayName}
            />
          </div>
          <div className="mt-1.5 flex items-center gap-2 min-w-0">
            {counters && <span className="min-w-0 truncate text-[11px] font-mono tabular-nums text-[var(--text-dim)]">{counters}</span>}
            <span className="flex-1" />
            <Timing job={job} />
          </div>
          {job.stalled && job.status === 'running' && (
            <p className="mt-1.5 text-[10.5px] leading-snug text-[var(--warn)]">{t('row.stalled')}</p>
          )}
        </>
      )}

      <div className="mt-3 pt-3 border-t border-[var(--border)]">
        <PhaseChecklist job={job} size="md" />
      </div>
    </>
  )
}

function BatchView({ focus, jobs }: { focus: FirstLoadFocus; jobs: readonly LoadJobView[] }) {
  const { t } = useLoadingT()
  const members = focus.members
  const { total, loaded, fraction } = groupStats(members)
  const name = focus.batch ? batchDisplayName(focus.batch, members.length, t) : ''
  const anyRunning = members.some((m) => m.status === 'running')

  return (
    <>
      <div className="flex items-center gap-2 min-w-0">
        <LayersIcon size={15} className="shrink-0 text-[var(--text-faint)]" />
        <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--text)]" title={name}>
          {t('firstLoad.batchTitle', { name, loaded, total, count: total })}
        </span>
        <span className="flex-1" />
        <span className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--text)]" title={t('indicator.estimate')}>
          {displayPercent(fraction, total > 0 && loaded === total)}%
        </span>
      </div>
      <div className="mt-2.5">
        <ProgressBar fraction={fraction} determinate={!anyRunning} active={anyRunning} height={6} label={name} />
      </div>
      <ul className="mt-3 flex flex-col gap-2 max-h-[240px] overflow-y-auto overscroll-contain pr-1">
        {members.map((m) => (
          <li key={m.id} className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0 flex w-[14px] justify-center">
                <StatusGlyph kind={statusGlyphKind(m)} fraction={m.progress.fraction} size={13} />
              </span>
              <span className="min-w-0 truncate text-[11.5px] text-[var(--text)]" title={m.fileName}>{m.displayName}</span>
              {m.discipline && <DisciplineBadge id={m.discipline} />}
              <span className="flex-1" />
              {(m.status === 'running' || m.status === 'waiting') && shownPercent(m) != null && (
                <span className="shrink-0 text-[10.5px] font-mono tabular-nums text-[var(--text-dim)]">{shownPercent(m)}%</span>
              )}
            </div>
            <p
              className={`pl-[22px] truncate text-[10.5px] ${m.status === 'failed' ? 'text-[var(--danger)]' : 'text-[var(--text-faint)]'}`}
              title={describePhaseLine(m, jobs, t)}
            >
              {describePhaseLine(m, jobs, t)}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-end">
        <Timing job={focus.job} />
      </div>
    </>
  )
}
