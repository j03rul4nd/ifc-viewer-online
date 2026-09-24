// ─── LoadJobDetails ───────────────────────────────────────────────────────────
// The expanded view of one job: why it failed and what to do, the step
// checklist, and the numbers. Basic shows what a coordinator acts on (size,
// status, time, speed); Advanced adds what someone diagnosing a slow or failed
// load needs (entities, memory estimate vs retained, worker, attempts,
// priority, cache, fingerprint, per-phase timings) — the same data, never a
// different story.
//
// The technical error message is Advanced-only and folded: it is English, may
// contain the file name, and is for a bug report, not for the user's decision.

import React from 'react'
import type { LoadJobView, Priority } from '../../lib/loading/types'
import { PRIORITY, PRIORITY_NAMES } from '../../lib/loading/types'
import type { LoadingDetail } from '../../stores/loadingStore'
import { loadingController } from '../../lib/loading/controller'
import { formatBytes, formatDuration } from '../../lib/utils'
import { useLoadingT } from '../../i18n/hooks/namespaces'
import {
  formatElapsed, formatEta, formatRate, isLiveJob, isTicking, jobElapsedMs, jobEtaMs, shortFingerprint,
} from './job-view'
import { ERROR_KEYS, PHASE_KEYS, PRIORITY_KEYS, STATUS_KEYS } from './labels'
import { useNow } from './useNow'
import { PhaseChecklist } from './PhaseChecklist'
import { TextButton } from './glyphs'

const DASH = '—'

function formatInt(n: number): string {
  return Math.round(n).toLocaleString()
}

function priorityName(p: Priority): (typeof PRIORITY_NAMES)[number] {
  return PRIORITY_NAMES.find((n) => PRIORITY[n] === p) ?? 'normal'
}

function ErrorBlock({ job, advanced }: { job: LoadJobView; advanced: boolean }) {
  const { t } = useLoadingT()
  const error = job.error
  if (!error) return null
  const phase = error.phase ?? job.phase
  const c = job.capabilities
  return (
    <div className="rounded-[6px] border border-[rgba(229,72,77,0.3)] bg-[rgba(229,72,77,0.07)] p-2">
      <p className="text-[11.5px] leading-snug text-[var(--text)]">
        {t(ERROR_KEYS[error.code], { status: error.httpStatus != null ? String(error.httpStatus) : DASH })}
      </p>
      <p className="mt-1 text-[10.5px] text-[var(--text-dim)]">
        {phase ? `${t('details.failedDuring')} · ${t(PHASE_KEYS[phase])} · ` : ''}
        {t('details.attempt', { attempt: error.attempt })}
      </p>
      {(c.retry || c.remove || c.dismiss) && (
        <div className="mt-2 flex items-center gap-1.5">
          {c.retry && (
            <TextButton tone="accent" onClick={() => loadingController.retry(job.id)}>{t('details.retry')}</TextButton>
          )}
          {(c.remove || c.dismiss) && (
            <TextButton
              onClick={() => (c.remove ? loadingController.remove(job.id) : loadingController.dismiss(job.id))}
            >
              {t('details.remove')}
            </TextButton>
          )}
        </div>
      )}
      {advanced && (
        <details className="mt-2 group/tech">
          <summary className="cursor-pointer select-none text-[10.5px] text-[var(--text-faint)] hover:text-[var(--text-dim)]">
            {t('details.technical')}
          </summary>
          <pre className="mt-1 max-h-[140px] overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-snug text-[var(--text-dim)] select-text">
            {`${error.code}${error.httpStatus != null ? ` ${error.httpStatus}` : ''} @ ${phase ?? '?'}\n${error.message}`}
          </pre>
        </details>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <dt className="truncate text-[10.5px] text-[var(--text-faint)]">{label}</dt>
      <dd className="truncate text-right text-[10.5px] font-mono tabular-nums text-[var(--text-dim)]">{value}</dd>
    </div>
  )
}

function MetricsGrid({ job, advanced }: { job: LoadJobView; advanced: boolean }) {
  const { t } = useLoadingT()
  const now = useNow(1000, isTicking(job))
  const m = job.metrics
  const items: Array<[string, React.ReactNode]> = []

  items.push([t('metrics.fileSize'), job.sizeBytes > 0 ? formatBytes(job.sizeBytes) : DASH])
  items.push([t('metrics.status'), t(STATUS_KEYS[job.status])])
  const elapsed = jobElapsedMs(job, now)
  items.push([t('metrics.elapsed'), elapsed != null ? formatElapsed(elapsed) : DASH])
  if (isLiveJob(job) && job.status !== 'failed') {
    const eta = jobEtaMs(job, now)
    items.push([t('metrics.eta'), eta != null ? formatEta(eta) : t('metrics.etaUnknown')])
  }
  if (m.throughputBps != null && m.throughputBps > 0) {
    items.push([t('metrics.speed'), `${m.throughputEstimated ? '≈ ' : ''}${formatRate(m.throughputBps)}/s`])
  }

  if (advanced) {
    if (m.entitiesProcessed != null) items.push([t('metrics.entities'), formatInt(m.entitiesProcessed)])
    if (m.objects != null) items.push([t('metrics.objects'), formatInt(m.objects)])
    if (m.categories != null) items.push([t('metrics.categories'), formatInt(m.categories)])
    if (m.classesDone != null || m.classesTotal != null) {
      items.push([t('metrics.classes'), `${m.classesDone ?? 0}${m.classesTotal != null ? ` / ${m.classesTotal}` : ''}`])
    }
    if (m.fragmentsBytes != null && m.fragmentsBytes > 0) items.push([t('metrics.fragments'), formatBytes(m.fragmentsBytes)])
    if (m.estimatedPeakBytes > 0) {
      items.push([t('metrics.peakMemory'), `${formatBytes(m.estimatedPeakBytes)} ${t('metrics.estimated')}`])
    }
    if (m.retainedBytes != null && m.retainedBytes > 0) items.push([t('metrics.retained'), formatBytes(m.retainedBytes)])
    if (m.workerId != null) items.push([t('metrics.worker'), `#${m.workerId}`])
    items.push([t('metrics.attempts'), String(job.attempts)])
    // The raw reason: Advanced is the diagnostic view, and the row above
    // already carries the sentence.
    if (job.waitReason) items.push([t('metrics.waitReason'), job.waitReason])
    if (m.fromCache != null) items.push([t('metrics.cache'), m.fromCache ? t('metrics.hit') : t('metrics.miss')])
    const fp = shortFingerprint(job.fingerprint)
    if (fp) items.push([t('metrics.fingerprint'), <span key="fp" title={job.fingerprint ?? undefined}>{fp}</span>])
  }

  const durations = advanced
    ? job.phases.filter((p) => m.phaseDurations[p.id] != null).map((p) => [p.id, m.phaseDurations[p.id] as number] as const)
    : []

  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
        {items.map(([label, value]) => <Metric key={label} label={label} value={value} />)}
      </dl>

      {advanced && (
        <label className="flex items-center justify-between gap-2 text-[10.5px]">
          <span className="text-[var(--text-faint)]">{t('metrics.priority')}</span>
          <span className="flex items-center gap-1.5 min-w-0">
            {job.effectivePriority !== job.priority && (
              <span className="truncate text-[var(--text-faint)]">
                {t('metrics.effective', { priority: t(PRIORITY_KEYS[priorityName(job.effectivePriority)]) })}
              </span>
            )}
            <select
              value={job.priority}
              disabled={!job.capabilities.reprioritize}
              onChange={(e) => loadingController.setPriority(job.id, Number(e.target.value) as Priority)}
              className="h-[20px] rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] px-1 text-[10.5px] text-[var(--text)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
            >
              {PRIORITY_NAMES.map((n) => (
                <option key={n} value={PRIORITY[n]}>{t(PRIORITY_KEYS[n])}</option>
              ))}
            </select>
          </span>
        </label>
      )}

      {durations.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wider font-medium text-[var(--text-faint)]">{t('metrics.phaseDurations')}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            {durations.map(([id, ms]) => <Metric key={id} label={t(PHASE_KEYS[id])} value={formatDuration(ms)} />)}
          </dl>
        </div>
      )}
    </div>
  )
}

export function LoadJobDetails({ job, detail }: { job: LoadJobView; detail: LoadingDetail }) {
  const { t } = useLoadingT()
  const advanced = detail === 'advanced'
  return (
    <div className="mt-2 ml-[22px] flex flex-col gap-2.5 rounded-[8px] border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-2.5">
      {job.status === 'failed' && <ErrorBlock job={job} advanced={advanced} />}
      {job.stalled && job.status === 'running' && (
        <p className="text-[10.5px] leading-snug text-[var(--warn)]">{t('row.stalled')}</p>
      )}
      {job.duplicateOf && <p className="text-[10.5px] leading-snug text-[var(--text-dim)]">{t('row.duplicate')}</p>}
      <PhaseChecklist job={job} />
      <div className="border-t border-[var(--border)] pt-2">
        <MetricsGrid job={job} advanced={advanced} />
      </div>
    </div>
  )
}
