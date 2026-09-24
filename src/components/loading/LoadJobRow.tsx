// ─── LoadJobRow ───────────────────────────────────────────────────────────────
// One job in the Loading Center: what it is, what it is doing with its real
// numbers, and what you can do about it.
//
// Memoised on purpose. The store keeps unchanged job objects identical between
// snapshots, and the parent passes the phase line as a string, so a progress
// burst on job A re-renders row A and nothing else. The live clock is a leaf
// (RowTiming) with its own ticker, so the second hand does not re-render the
// row either.
//
// Actions follow the job's `capabilities` exactly — the manager decides what is
// possible; the row never offers "hold" on a job it would refuse to hold. The
// primary action for the state (Cancel / Retry / Dismiss) is always visible —
// and a cancelled job the manager can retry leads with Retry, so a misclick on
// the one-click Cancel ten minutes into a conversion is one click to undo;
// the rest appear on hover or keyboard focus on pointer devices, and always on
// touch and when the row is expanded, so a calm list stays calm without hiding
// anything from a keyboard or a finger.

import React, { useEffect, useState } from 'react'
import type { DisciplineId, LoadJobView } from '../../lib/loading/types'
import { ACTIVE_STATUSES } from '../../lib/loading/types'
import type { LoadingDetail } from '../../stores/loadingStore'
import { loadingController } from '../../lib/loading/controller'
import { useLoadingT } from '../../i18n/hooks/namespaces'
import {
  formatElapsed, formatEta, formatRate, isLiveJob, isTicking, jobElapsedMs, jobEtaMs, shownPercent, statusGlyphKind,
} from './job-view'
import { DISCIPLINE_KEYS, DISCIPLINE_SHORT_KEYS } from './labels'
import { useNow } from './useNow'
import { ProgressBar, type BarTone } from './ProgressBar'
import {
  ChevronIcon, CrossGlyph, DownIcon, FocusIcon, IconButton, PauseGlyph, PlayIcon, ReloadIcon, RetryIcon,
  StatusGlyph, TrashIcon, UpIcon,
} from './glyphs'
import { LoadJobDetails } from './LoadJobDetails'

export function DisciplineBadge({ id }: { id: DisciplineId }) {
  const { t } = useLoadingT()
  return (
    <span
      title={t(DISCIPLINE_KEYS[id])}
      className="shrink-0 inline-flex items-center h-[15px] px-[5px] rounded-[4px] border border-[var(--border-strong)] text-[9px] font-semibold tracking-[0.06em] text-[var(--text-dim)]"
    >
      {t(DISCIPLINE_SHORT_KEYS[id])}
    </span>
  )
}

/** Elapsed · ETA · speed. Ticks only while the job itself is moving. */
export function RowTiming({ job, className = 'mt-1' }: { job: LoadJobView; className?: string }) {
  const { t } = useLoadingT()
  const now = useNow(1000, isTicking(job))
  const parts: string[] = []
  const elapsed = jobElapsedMs(job, now)
  if (elapsed != null) parts.push(formatElapsed(elapsed))
  if (job.status === 'running') {
    const eta = jobEtaMs(job, now)
    if (eta != null) parts.push(t('row.eta', { time: formatEta(eta) }))
    const bps = job.metrics.throughputBps
    if (bps != null && bps > 0) {
      parts.push(t(job.metrics.throughputEstimated ? 'row.speedEstimated' : 'row.speed', { speed: formatRate(bps) }))
    }
  }
  if (parts.length === 0) return null
  return <p className={`${className} truncate text-[10px] tabular-nums text-[var(--text-faint)]`}>{parts.join(' · ')}</p>
}

export function barToneFor(job: LoadJobView): BarTone {
  switch (job.status) {
    case 'running':   return job.stalled ? 'warn' : 'accent'
    case 'unloading': return 'accent'
    case 'failed':    return 'danger'
    case 'loaded':    return 'ok'
    default:          return 'muted'
  }
}

/** Queued/held jobs only show a bar when a previous attempt got somewhere. */
export function showsProgress(job: LoadJobView): boolean {
  switch (job.status) {
    case 'running': case 'waiting': case 'unloading': case 'failed': return true
    case 'queued': case 'held': return job.progress.fraction > 0
    default: return false
  }
}

function showsPercent(job: LoadJobView): boolean {
  return job.status === 'running' || job.status === 'waiting'
    || ((job.status === 'queued' || job.status === 'held') && job.progress.fraction > 0)
}

// ── Actions ───────────────────────────────────────────────────────────────────

function RowActions({ job, reveal, touch }: { job: LoadJobView; reveal: boolean; touch: boolean }) {
  const { t } = useLoadingT()
  const c = job.capabilities
  const id = job.id
  const active = ACTIVE_STATUSES.has(job.status)
  const loaded = job.status === 'loaded'
  const settled = job.status === 'cancelled' || job.status === 'removed'

  // Two-tap remove: the first tap arms (the button turns red and says so), the
  // second removes. Disarms by itself, so a stray tap cannot linger as a trap.
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(false), 3000)
    return () => window.clearTimeout(timer)
  }, [armed])

  const movable = c.reprioritize && (job.status === 'queued' || job.status === 'held' || job.status === 'waiting')

  let primary: React.ReactNode = null
  let primaryIsDismiss = false
  if (active && c.cancel) {
    primary = (
      <IconButton label={t('actions.cancel')} tone="danger" touch={touch} onClick={() => loadingController.cancel(id)}>
        <CrossGlyph size={13} />
      </IconButton>
    )
  } else if ((job.status === 'failed' || job.status === 'cancelled') && c.retry) {
    primary = (
      <IconButton label={t('actions.retry')} touch={touch} onClick={() => loadingController.retry(id)}>
        <RetryIcon size={13} />
      </IconButton>
    )
  } else if (settled && c.dismiss) {
    primaryIsDismiss = true
    primary = (
      <IconButton label={t('actions.dismiss')} touch={touch} onClick={() => loadingController.dismiss(id)}>
        <CrossGlyph size={13} />
      </IconButton>
    )
  }

  const secondary: React.ReactNode[] = []
  if (c.hold) {
    secondary.push(
      <IconButton key="hold" label={t('actions.hold')} touch={touch} onClick={() => loadingController.hold(id)}>
        <PauseGlyph size={13} />
      </IconButton>,
    )
  }
  if (c.resume) {
    secondary.push(
      <IconButton key="resume" label={t('actions.resume')} touch={touch} onClick={() => loadingController.resume(id)}>
        <PlayIcon size={13} />
      </IconButton>,
    )
  }
  if (movable) {
    secondary.push(
      <IconButton key="up" label={t('actions.moveUp')} touch={touch} onClick={() => loadingController.move(id, 'up')}>
        <UpIcon size={13} />
      </IconButton>,
      <IconButton key="down" label={t('actions.moveDown')} touch={touch} onClick={() => loadingController.move(id, 'down')}>
        <DownIcon size={13} />
      </IconButton>,
    )
  }
  if (loaded && job.resultId) {
    secondary.push(
      <IconButton key="focus" label={t('actions.focus')} touch={touch} onClick={() => loadingController.focus(id)}>
        <FocusIcon size={13} />
      </IconButton>,
    )
  }
  if (c.reload) {
    secondary.push(
      <IconButton key="reload" label={t('actions.reload')} touch={touch} onClick={() => loadingController.reload(id)}>
        <ReloadIcon size={13} />
      </IconButton>,
    )
  }
  if (c.remove && loaded) {
    secondary.push(
      <IconButton
        key="remove"
        label={armed ? t('actions.removeConfirm') : t('actions.remove')}
        tone={armed ? 'armed' : 'danger'}
        pressed={armed}
        touch={touch}
        onClick={() => {
          if (!armed) { setArmed(true); return }
          setArmed(false)
          loadingController.remove(id)
        }}
      >
        <TrashIcon size={13} />
      </IconButton>,
    )
  }
  if (c.dismiss && !primaryIsDismiss && !active) {
    secondary.push(
      <IconButton key="dismiss" label={t('actions.dismiss')} touch={touch} onClick={() => loadingController.dismiss(id)}>
        <CrossGlyph size={12} />
      </IconButton>,
    )
  }

  if (!primary && secondary.length === 0) return null
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {secondary.length > 0 && (
        <div
          className={[
            'flex items-center gap-0.5 transition-opacity duration-150',
            // An armed remove must stay visible even if the pointer leaves.
            reveal || armed ? '' : '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 focus-within:opacity-100',
          ].join(' ')}
        >
          {secondary}
        </div>
      )}
      {primary}
    </div>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────

export interface LoadJobRowProps {
  job: LoadJobView
  /** describePhaseLine(), computed by the parent that holds the whole list. */
  line: string
  expanded: boolean
  detail: LoadingDetail
  /** Rendered in the "Finished" section: quieter text. */
  quiet?: boolean
  /** Touch layout (mobile sheet): bigger targets, actions always visible. */
  touch?: boolean
  onToggle: (jobId: string | null) => void
}

export const LoadJobRow = React.memo(function LoadJobRow({
  job, line, expanded, detail, quiet = false, touch = false, onToggle,
}: LoadJobRowProps) {
  const { t } = useLoadingT()
  const failed = job.status === 'failed'
  const pct = showsPercent(job) ? shownPercent(job) : null
  const toggle = (): void => onToggle(expanded ? null : job.id)
  const live = isLiveJob(job)

  return (
    <div
      className={[
        'group/row relative px-3 py-2 transition-colors duration-100',
        expanded ? 'bg-[rgba(255,255,255,0.03)]' : 'hover:bg-[rgba(255,255,255,0.02)]',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="shrink-0 flex items-center justify-center w-[14px]">
          <StatusGlyph kind={statusGlyphKind(job)} fraction={job.progress.fraction} />
        </span>
        {/* The name is a big click target for the same toggle as the chevron,
            and out of the tab order so the keyboard gets one stop, not two. */}
        <button
          type="button"
          tabIndex={-1}
          onClick={toggle}
          title={job.fileName}
          className={[
            'min-w-0 truncate text-left text-[12px] leading-[18px] rounded-[3px]',
            'focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent)]',
            quiet ? 'text-[var(--text-dim)]' : 'text-[var(--text)]',
          ].join(' ')}
        >
          {job.displayName}
        </button>
        {job.discipline && <DisciplineBadge id={job.discipline} />}
        <span className="flex-1" />
        <RowActions job={job} reveal={touch || expanded} touch={touch} />
        {pct != null && (
          <span
            className="shrink-0 w-[32px] text-right text-[11px] font-mono tabular-nums text-[var(--text-dim)]"
            title={t('indicator.estimate')}
          >
            {pct}%
          </span>
        )}
        <IconButton
          label={expanded ? t('actions.collapse') : t('actions.expand')}
          touch={touch}
          expanded={expanded}
          onClick={toggle}
        >
          <ChevronIcon size={12} className={`transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} />
        </IconButton>
      </div>

      <div className="pl-[22px] mt-0.5 min-w-0">
        <p
          className={`truncate text-[10.5px] leading-[15px] ${failed ? 'text-[var(--danger)]' : quiet ? 'text-[var(--text-faint)]' : 'text-[var(--text-dim)]'}`}
          title={line}
        >
          {line}
        </p>
        {showsProgress(job) && (
          <div className="mt-1.5">
            <ProgressBar
              fraction={job.progress.fraction}
              determinate={job.progress.determinate}
              active={job.status === 'running' || job.status === 'unloading'}
              tone={barToneFor(job)}
              height={failed ? 2 : 3}
              label={job.displayName}
            />
          </div>
        )}
        {live && !failed && <RowTiming job={job} />}
        {job.stalled && job.status === 'running' && (
          <p className="mt-1 text-[10px] text-[var(--warn)]">{t('row.stalledShort')}</p>
        )}
      </div>

      {expanded && <LoadJobDetails job={job} detail={detail} />}
    </div>
  )
})
