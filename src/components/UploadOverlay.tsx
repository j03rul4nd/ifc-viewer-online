// ─── src/components/UploadOverlay.tsx ────────────────────────────────────────
// Pure presentation — zero business logic.
// All state and behaviour lives in useIfcUploadFlow.
//
// Sub-views:
//   IdleView       — drop zone (idle + dragging)
//   PreparingView  — checking the files (integrity, schema, duplicates)
//   ReviewView     — one row per file, batch name + group, Load all / selected
//   DuplicateView  — a single file that is already loaded (or loading)
//   ErrorView      — nothing in the selection can load
//   SubmittedView  — the hand-over; only visible while the dialog fades out
//
// The dialog never shows load progress. A submitted file is a background job,
// followed in the Loading Center (opened on submit) while the viewer stays
// usable — so there is no "loading…" screen here to wait on, and no Cancel
// that cannot cancel.
//
// Still a hand-rolled shell (scripts/modal-migration.test.ts lists it): drops
// land anywhere on the backdrop, not just on the drop zone, which the shared
// Modal does not offer.

import React, { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import * as Icons from './Icons'
import { useIfcUploadFlow }       from '../hooks/useIfcUploadFlow'
import type {
  SubmitScope,
  UploadEntry,
  UploadEntryStatus,
  UploadErrorCode,
  UploadOverlayProps,
  UploadState,
} from '../types/upload.types'
import type { DisciplineId } from '../lib/loading/types'
import { loadingController, type DuplicateMatch } from '../lib/loading/controller'
import { inferDiscipline } from '../lib/loading/discipline'
import {
  entryStatuses,
  formatFileSize,
  isLargeFile,
  isSelectable,
  suggestedBatchName,
  summarizeSelection,
} from '../lib/upload.utils'

type Flow = ReturnType<typeof useIfcUploadFlow>
type SelectionView = Extract<UploadState, { id: 'preparing' | 'review' | 'duplicate' }>

// Literal key tables: typed i18next checks every key, which a template string
// (`upload.errors.${code}`) would slip past.
const ERROR_KEYS = {
  INVALID_EXTENSION:       'upload.errors.INVALID_EXTENSION',
  INVALID_MIME:            'upload.errors.INVALID_MIME',
  FILE_TOO_LARGE:          'upload.errors.FILE_TOO_LARGE',
  FILE_EMPTY:              'upload.errors.FILE_EMPTY',
  UNSUPPORTED_IFC_VERSION: 'upload.errors.UNSUPPORTED_IFC_VERSION',
  CORRUPTED_FILE:          'upload.errors.CORRUPTED_FILE',
  READ_FAILED:             'upload.errors.READ_FAILED',
  UNKNOWN:                 'upload.errors.UNKNOWN',
} as const satisfies Record<UploadErrorCode, string>

const DISCIPLINE_KEYS = {
  architecture: 'upload.review.discipline.architecture',
  structure:    'upload.review.discipline.structure',
  mep:          'upload.review.discipline.mep',
  hvac:         'upload.review.discipline.hvac',
  plumbing:     'upload.review.discipline.plumbing',
  electrical:   'upload.review.discipline.electrical',
  fire:         'upload.review.discipline.fire',
  landscape:    'upload.review.discipline.landscape',
  site:         'upload.review.discipline.site',
  civil:        'upload.review.discipline.civil',
  interior:     'upload.review.discipline.interior',
  furniture:    'upload.review.discipline.furniture',
  coordination: 'upload.review.discipline.coordination',
} as const satisfies Record<DisciplineId, string>

const VIEW_MOTION = {
  initial:    { opacity: 0, y: 6 },
  animate:    { opacity: 1, y: 0 },
  exit:       { opacity: 0, y: -6 },
  transition: { duration: 0.18 },
} as const

const BTN_PRIMARY =
  'px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed'
const BTN_SECONDARY =
  'px-4 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[13px] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
const BTN_GHOST =
  'px-3 py-2 rounded-lg text-[13px] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors'
const LINK =
  'text-[var(--accent-2)] underline-offset-2 hover:underline cursor-pointer'

function CloseButton({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('common')
  return (
    <button
      onClick={onClose}
      className="text-[var(--text-dim)] hover:text-[var(--text)] p-1 transition-colors flex-none"
      aria-label={t('upload.idle.closeAriaLabel')}
    >
      <Icons.X size={18} />
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-views
// ─────────────────────────────────────────────────────────────────────────────

// ── Idle ──────────────────────────────────────────────────────────────────────

function IdleView({
  isDragging,
  onClose,
  openFilePicker,
  onOpenDemoGallery,
}: {
  isDragging:     boolean
  onClose:        () => void
  openFilePicker: () => void
  onOpenDemoGallery?: () => void
}) {
  const { t } = useTranslation('common')
  const { t: tLanding } = useTranslation('landing')
  return (
    <motion.div key="idle" {...VIEW_MOTION} className="p-5 sm:p-8 min-h-0 overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-4 sm:mb-6">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight">{t('upload.idle.title')}</h2>
          <p className="text-[12.5px] text-[var(--text-dim)] mt-1">
            {t('upload.idle.subtitle')}
          </p>
        </div>
        <CloseButton onClose={onClose} />
      </div>

      {/* Drop zone — the drag handlers live on the backdrop, so a drop anywhere
          over the dialog counts; this only shows it. */}
      <div
        onClick={openFilePicker}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && openFilePicker()}
        aria-label={t('upload.idle.dropAriaLabel')}
        className="relative py-8 sm:py-14 px-5 rounded-xl text-center cursor-pointer transition-all overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        style={{
          border:     `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border-strong)'}`,
          background: isDragging ? 'rgba(94,106,210,0.06)' : 'var(--surface-2)',
        }}
      >
        {isDragging && (
          <div className="absolute inset-0 shimmer pointer-events-none" />
        )}
        <div
          className="w-14 h-14 mx-auto mb-3.5 rounded-xl bg-[var(--bg)] border border-[var(--border-strong)] flex items-center justify-center transition-colors"
          style={{ color: isDragging ? 'var(--accent-2)' : 'var(--text-dim)' }}
        >
          <Icons.Upload size={22} />
        </div>
        <p className="text-[14px] font-medium mb-1">
          {isDragging ? t('upload.idle.releaseToOpen') : t('upload.idle.dropHintMulti')}
        </p>
        <p className="text-[12px] text-[var(--text-dim)]">
          {t('upload.idle.or')}{' '}
          <span className="text-[var(--accent-2)] underline underline-offset-2">
            {t('upload.idle.clickToBrowse')}
          </span>
          {' · '}IFC2x3 / IFC4 / IFC4x3
        </p>
      </div>

      {/* Demo gallery shortcut — for users who don't have an IFC at hand */}
      {onOpenDemoGallery && (
        <div className="mt-3.5 text-center">
          <button
            onClick={onOpenDemoGallery}
            className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--text-dim)] hover:text-[var(--accent-2)] transition-colors cursor-pointer underline-offset-2 hover:underline"
          >
            <Icons.Layers size={13} />
            {tLanding('demoGallery.openCta')}
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 flex gap-2.5 text-[11px] text-[var(--text-faint)] justify-center flex-wrap">
        <span>🔒 {t('upload.idle.trust1')}</span>
        <span>·</span>
        <span>{t('upload.idle.trust2')}</span>
        <span>·</span>
        <span>{t('upload.idle.trust3')}</span>
        <span>·</span>
        <a
          href={`${import.meta.env.BASE_URL}privacy`}
          className="hover:text-[var(--text)] transition-colors underline underline-offset-2"
        >
          {t('upload.idle.privacy')}
        </a>
      </div>
    </motion.div>
  )
}

// ── Preparing ─────────────────────────────────────────────────────────────────

function PreparingView({ state }: { state: SelectionView }) {
  const { t } = useTranslation('common')
  const total = state.entries.length
  const done = state.entries.filter((e) => e.check !== null).length
  // Files checked out of files selected — a real count, so a real bar.
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <motion.div key="preparing" {...VIEW_MOTION} className="p-5 sm:p-9">
      <p className="text-[15px] font-semibold mb-1">{t('upload.preparing', { count: total })}</p>
      <p className="text-[12px] text-[var(--text-dim)] mb-5">{t('upload.preparingDetail')}</p>
      <div
        className="h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden mb-3"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <motion.div
          className="h-full rounded-full bg-[var(--accent)]"
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(pct, 6)}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>
      <span className="font-mono text-[11px] text-[var(--text-faint)]">
        {t('upload.preparingCount', { done, total })}
      </span>
    </motion.div>
  )
}

// ── Review ────────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: UploadEntryStatus | undefined }) {
  const { t } = useTranslation('common')
  if (!status) return null
  const [label, color] =
    status.kind === 'pending'             ? [t('upload.review.checking'), 'var(--text-faint)'] :
    status.kind === 'valid'               ? [t('upload.review.status.valid'), 'var(--ok)'] :
    status.kind === 'invalid'             ? [t('upload.review.status.invalid'), 'var(--danger)'] :
    status.kind === 'loaded-duplicate'    ? [status.match.modelId
                                              ? t('upload.review.status.loaded')
                                              : t('upload.review.status.loading'), 'var(--warn)'] :
    [t('upload.review.status.inSelection'), 'var(--warn)']
  return (
    <span className="flex-none mt-px text-[11px] font-medium whitespace-nowrap" style={{ color }}>
      {label}
    </span>
  )
}

function EntryRow({
  entry,
  status,
  nameOf,
  onToggle,
  onOpenExisting,
}: {
  entry:  UploadEntry
  status: UploadEntryStatus | undefined
  nameOf: (key: string) => string
  onToggle:       (key: string) => void
  onOpenExisting: (match: DuplicateMatch) => void
}) {
  const { t } = useTranslation('common')
  const { file } = entry
  const discipline = useMemo(() => inferDiscipline(file.name), [file.name])
  const selectable = isSelectable(status)
  const version = entry.check?.ok ? entry.check.version : null
  const large = selectable && isLargeFile(file.size)

  return (
    <li className={`flex items-start gap-3 px-3.5 py-2.5 ${status?.kind === 'invalid' ? 'opacity-75' : ''}`}>
      <input
        type="checkbox"
        className="mt-[3px] flex-none accent-[var(--accent)] disabled:opacity-40"
        checked={entry.checked === true}
        disabled={!selectable}
        onChange={() => onToggle(entry.key)}
        aria-label={t('upload.review.includeAria', { name: file.name })}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate font-mono text-[12.5px] text-[var(--text)]" title={file.name}>
            {file.name}
          </span>
          {discipline && (
            <span className="flex-none rounded px-1.5 py-px text-[10px] font-medium uppercase tracking-wide border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-dim)]">
              {t(DISCIPLINE_KEYS[discipline])}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-[var(--text-faint)]">
          <span>{formatFileSize(file.size)}</span>
          {entry.check?.ok && (
            <>
              <span>·</span>
              <span className="font-mono">{version ?? t('upload.review.schemaUnknown')}</span>
            </>
          )}
          {large && (
            <>
              <span>·</span>
              <span className="text-[var(--warn)]">{t('upload.large.rowNote')}</span>
            </>
          )}
        </div>

        {status?.kind === 'invalid' && (
          <p className="mt-1 text-[11.5px] text-[var(--danger)]">{t(ERROR_KEYS[status.error.code])}</p>
        )}
        {status?.kind === 'loaded-duplicate' && (
          <p className="mt-1 text-[11.5px] text-[var(--text-dim)]">
            {status.match.fileName !== file.name && (
              <>{t('upload.review.sameContentAs', { name: status.match.fileName })} · </>
            )}
            <button type="button" className={LINK} onClick={() => onOpenExisting(status.match)}>
              {status.match.modelId ? t('upload.review.openExisting') : t('upload.review.viewProgress')}
            </button>
          </p>
        )}
        {status?.kind === 'selection-duplicate' && (
          <p className="mt-1 text-[11.5px] text-[var(--text-dim)]">
            {t('upload.review.inSelection', { name: nameOf(status.ofKey) })}
          </p>
        )}
      </div>
      <StatusPill status={status} />
    </li>
  )
}

function ReviewView({
  state,
  flow,
}: {
  state: SelectionView
  flow:  Flow
}) {
  const { t } = useTranslation('common')
  const { entries } = state
  const statuses  = useMemo(() => entryStatuses(entries), [entries])
  const summary   = useMemo(() => summarizeSelection(entries), [entries])
  const suggested = useMemo(() => suggestedBatchName(entries), [entries])
  const names     = useMemo(() => new Map(entries.map((e) => [e.key, e.file.name])), [entries])
  const nameOf    = (key: string): string => names.get(key) ?? ''

  const preparing = state.id === 'preparing'
  const multi = entries.length > 1

  // One primary action. "Load all" and "Load selected" are the same click
  // while the checkboxes are at their defaults, so the second button only
  // appears once the user has changed something. It is labelled "Load new
  // only", not "Load all": it takes every valid file that is NOT already
  // loaded, so beside a selection that includes a duplicate on purpose it is
  // the smaller set, and "all" would promise the opposite.
  let primary: { label: string; scope: SubmitScope; count: number }
  if (!multi) {
    primary = {
      label: summary.hasLarge ? t('upload.review.loadInBackground') : t('upload.review.loadAll', { count: summary.selectedCount }),
      scope: 'selected',
      count: summary.selectedCount,
    }
  } else if (summary.selectionIsAll) {
    primary = { label: t('upload.review.loadAll', { count: summary.allCount }), scope: 'all', count: summary.allCount }
  } else {
    primary = { label: t('upload.review.loadSelected', { count: summary.selectedCount }), scope: 'selected', count: summary.selectedCount }
  }
  const showLoadAll = multi && !summary.selectionIsAll && summary.allCount > 0

  const defaultName = suggested ?? t('upload.review.defaultBatchName', { count: Math.max(1, primary.count) })

  return (
    <motion.div key="review" {...VIEW_MOTION} className="flex flex-col min-h-0">
      {/* Header */}
      <div className="flex justify-between items-start gap-3 px-5 sm:px-6 pt-5 sm:pt-6">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold tracking-tight">
            {t('upload.review.title', { count: entries.length })}
          </h2>
          <p className="text-[12.5px] text-[var(--text-dim)] mt-1">{t('upload.review.subtitle')}</p>
        </div>
        <CloseButton onClose={flow.handleClose} />
      </div>

      {/* Large-file banner */}
      {summary.hasLarge && (
        <div
          className="mx-5 sm:mx-6 mt-4 flex gap-2.5 rounded-lg border px-3 py-2.5 text-[12px] leading-snug"
          style={{
            borderColor: 'color-mix(in srgb, var(--warn) 35%, transparent)',
            background:  'color-mix(in srgb, var(--warn) 8%, transparent)',
          }}
          role="note"
        >
          <Icons.Warn size={14} className="flex-none mt-px text-[var(--warn)]" />
          <div className="min-w-0">
            <p className="text-[var(--text)]">{t('upload.large.banner')}</p>
            {summary.hasVeryLarge && (
              <p className="mt-1 text-[var(--text-dim)]">{t('upload.large.memoryWarning')}</p>
            )}
          </div>
        </div>
      )}

      {/* Batch */}
      {multi && (
        <div className="mx-5 sm:mx-6 mt-4 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4">
          <label className="flex-1 min-w-0 flex items-center gap-2">
            <span className="flex-none text-[11.5px] text-[var(--text-dim)]">{t('upload.review.batchName')}</span>
            <input
              type="text"
              value={state.batch.name ?? defaultName}
              placeholder={defaultName}
              onChange={(e) => flow.setBatchName(e.target.value)}
              className="min-w-0 flex-1 px-2.5 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[12.5px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          {loadingController.canCreateGroups() && (
            <label className="flex-none flex items-center gap-2 text-[12px] text-[var(--text-dim)] cursor-pointer" title={t('upload.review.createGroupHint')}>
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={state.batch.createGroup}
                onChange={(e) => flow.setCreateGroup(e.target.checked)}
              />
              {t('upload.review.createGroup')}
            </label>
          )}
        </div>
      )}

      {/* Rows */}
      <ul
        className="mx-5 sm:mx-6 mt-4 min-h-0 flex-1 max-h-[min(44vh,340px)] overflow-y-auto rounded-xl border divide-y divide-[var(--border)] transition-colors"
        style={{ borderColor: state.dragOver ? 'var(--accent)' : 'var(--border)' }}
        aria-busy={preparing}
      >
        {entries.map((entry) => (
          <EntryRow
            key={entry.key}
            entry={entry}
            status={statuses.get(entry.key)}
            nameOf={nameOf}
            onToggle={flow.toggleEntry}
            onOpenExisting={flow.openExisting}
          />
        ))}
      </ul>

      {/* Footer */}
      <div className="px-5 sm:px-6 pt-3 pb-5 sm:pb-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 text-[11.5px] text-[var(--text-faint)]">
          <button type="button" onClick={flow.openFilePicker} className={`inline-flex items-center gap-1.5 ${LINK}`}>
            <Icons.Plus size={13} />
            {state.dragOver ? t('upload.review.dropToAdd') : t('upload.review.addFiles')}
          </button>
          <span className="font-mono text-right">
            {t('upload.review.summary', {
              selected: summary.selectedCount,
              total: summary.total,
              size: formatFileSize(summary.selectedBytes),
            })}
          </span>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={flow.handleClose} className={BTN_GHOST}>
            {t('upload.review.cancel')}
          </button>
          {showLoadAll && (
            <button
              type="button"
              onClick={() => flow.submit('all')}
              disabled={preparing}
              className={BTN_SECONDARY}
            >
              {t('upload.review.loadNewOnly', { count: summary.allCount })}
            </button>
          )}
          <button
            type="button"
            onClick={() => flow.submit(primary.scope)}
            disabled={preparing || primary.count === 0}
            className={BTN_PRIMARY}
            autoFocus
          >
            {primary.label}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ── Duplicate ─────────────────────────────────────────────────────────────────

function DuplicateView({ state, flow }: { state: SelectionView; flow: Flow }) {
  const { t } = useTranslation('common')
  const entry = state.entries[0]
  const match = entry?.check?.ok ? entry.check.existing : null
  if (!entry || !match) return null
  const loaded = match.modelId !== null
  return (
    <motion.div key="duplicate" {...VIEW_MOTION} className="p-5 sm:p-9 min-h-0 overflow-y-auto">
      <div className="flex justify-between items-start mb-5">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-none border"
          style={{
            color:       'var(--warn)',
            borderColor: 'color-mix(in srgb, var(--warn) 30%, transparent)',
            background:  'color-mix(in srgb, var(--warn) 12%, transparent)',
          }}
        >
          <Icons.Copy size={19} />
        </div>
        <CloseButton onClose={flow.handleClose} />
      </div>

      <h2 className="text-[15px] font-semibold mb-1.5 break-words">
        {loaded
          ? t('upload.duplicate.title', { name: entry.file.name })
          : t('upload.duplicate.titleLoading', { name: entry.file.name })}
      </h2>
      <p className="text-[13px] text-[var(--text-dim)]">
        {match.fileName !== entry.file.name && (
          <>{t('upload.duplicate.sameContentAs', { name: match.fileName })}{' '}</>
        )}
        {t('upload.duplicate.body')}
      </p>

      <div className="flex flex-wrap gap-2.5 mt-6">
        <button type="button" onClick={() => flow.openExisting(match)} className={BTN_PRIMARY} autoFocus>
          {loaded ? t('upload.duplicate.openExisting') : t('upload.duplicate.viewProgress')}
        </button>
        <button type="button" onClick={() => flow.submit('duplicate')} className={BTN_SECONDARY}>
          {t('upload.duplicate.loadAnyway')}
        </button>
        <button type="button" onClick={flow.handleClose} className={BTN_GHOST}>
          {t('upload.duplicate.cancel')}
        </button>
      </div>
    </motion.div>
  )
}

// ── Error ─────────────────────────────────────────────────────────────────────

function ErrorView({
  state,
  onRetry,
  onClose,
}: {
  state:   Extract<UploadState, { id: 'error' }>
  onRetry: () => void
  onClose: () => void
}) {
  const { t } = useTranslation('common')
  const failures = state.entries.flatMap((e) =>
    e.check && !e.check.ok ? [{ key: e.key, name: e.file.name, error: e.check.error }] : [],
  )
  const single = failures.length === 1 ? failures[0] : null

  return (
    <motion.div key="error" {...VIEW_MOTION} className="p-5 sm:p-9 min-h-0 overflow-y-auto">
      <div className="flex justify-between items-start mb-5">
        <div className="w-11 h-11 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center flex-none">
          <Icons.ErrorIcon size={20} className="text-red-400" />
        </div>
        <CloseButton onClose={onClose} />
      </div>

      {single ? (
        <>
          <h2 className="text-[15px] font-semibold mb-1.5">{t('upload.error.title')}</h2>
          <p className="text-[12px] text-[var(--text-faint)] font-mono truncate mb-1" title={single.name}>{single.name}</p>
          <p className="text-[13px] text-[var(--text-dim)] mb-2">{t(ERROR_KEYS[single.error.code])}</p>
          {single.error.technical && (
            <details className="mb-2">
              <summary className="text-[11px] text-[var(--text-faint)] cursor-pointer hover:text-[var(--text-dim)] select-none">
                {t('upload.error.technicalDetails')}
              </summary>
              <pre className="mt-2 p-2.5 rounded-lg bg-[var(--surface-2)] text-[10.5px] text-[var(--text-faint)] font-mono overflow-auto max-h-24 whitespace-pre-wrap">
                {single.error.technical}
              </pre>
            </details>
          )}
        </>
      ) : (
        <>
          <h2 className="text-[15px] font-semibold mb-3">{t('upload.errors.titleMany')}</h2>
          <ul className="max-h-[min(40vh,260px)] overflow-y-auto rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
            {failures.map((f) => (
              <li key={f.key} className="px-3 py-2">
                <p className="text-[12px] font-mono text-[var(--text)] truncate" title={f.name}>{f.name}</p>
                <p className="text-[11.5px] text-[var(--danger)] mt-0.5">{t(ERROR_KEYS[f.error.code])}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="flex gap-2.5 mt-5">
        <button type="button" onClick={onRetry} className={`flex-1 ${BTN_PRIMARY}`} autoFocus>
          {t('upload.error.tryAgain')}
        </button>
        <button type="button" onClick={onClose} className={`flex-1 ${BTN_SECONDARY}`}>
          {t('upload.error.close')}
        </button>
      </div>
    </motion.div>
  )
}

// ── Submitted ─────────────────────────────────────────────────────────────────

function SubmittedView({ count, onClose }: { count: number; onClose: () => void }) {
  const { t } = useTranslation('common')
  return (
    <motion.div key="submitted" {...VIEW_MOTION} className="p-5 sm:p-9 text-center">
      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
        <Icons.Check size={20} className="text-emerald-400" />
      </div>
      <p className="text-[14px] font-medium mb-5">{t('upload.submitted.title', { count })}</p>
      <button type="button" onClick={onClose} className={BTN_SECONDARY}>
        {t('upload.error.close')}
      </button>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function UploadOverlay(props: UploadOverlayProps) {
  const { t } = useTranslation('common')
  const flow = useIfcUploadFlow(props)
  const {
    state,
    fileInputRef,
    canClose,
    isActive,
    dragHandlers,
    handleClose,
    handleRetry,
    onFileInputChange,
    openFilePicker,
  } = flow

  // Files appended to a reviewed selection are checked with the list still on
  // screen (their rows read "Checking…"), instead of the whole dialog jumping
  // back to the preparing view and then to the list again.
  const showList =
    state.id === 'review' ||
    (state.id === 'preparing' && state.entries.some((e) => e.checked !== null))

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-xl flex items-center justify-center p-5"
      // Close only on a click that lands directly on the backdrop. Without this
      // guard, the programmatic click from openFilePicker() on the hidden <input>
      // (a child of this backdrop) bubbles up here and closes the modal the
      // instant the OS file dialog opens — so the picked file never loads.
      onClick={canClose ? (e) => { if (e.target === e.currentTarget) handleClose() } : undefined}
      {...dragHandlers}
      aria-modal="true"
      role="dialog"
      aria-label={t('upload.dialogLabel')}
    >
      {/* Native file input — hidden */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".ifc"
        multiple
        className="hidden"
        onChange={onFileInputChange}
      />

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={`${showList ? 'w-[600px]' : 'w-[560px]'} max-w-full max-h-[calc(100dvh-2.5rem)] flex flex-col bg-[var(--surface)] border border-[var(--border-strong)] rounded-2xl overflow-hidden shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]`}
        onClick={e => e.stopPropagation()}
      >
        {/* Top activity indicator while files are being checked */}
        {isActive && (
          <div className="h-0.5 flex-none bg-[var(--surface-2)] overflow-hidden">
            <motion.div
              className="h-full bg-[var(--accent)]"
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
              style={{ width: '40%' }}
            />
          </div>
        )}

        <AnimatePresence mode="wait">

          {/* IDLE / DRAGGING */}
          {(state.id === 'idle' || state.id === 'dragging') && (
            <IdleView
              key="idle"
              isDragging={state.id === 'dragging'}
              onClose={handleClose}
              openFilePicker={openFilePicker}
              onOpenDemoGallery={props.onOpenDemoGallery}
            />
          )}

          {/* PREPARING (first round) */}
          {state.id === 'preparing' && !showList && (
            <PreparingView key="preparing" state={state} />
          )}

          {/* REVIEW (and later rounds of preparing) */}
          {(state.id === 'review' || state.id === 'preparing') && showList && (
            <ReviewView key="review" state={state} flow={flow} />
          )}

          {/* DUPLICATE */}
          {state.id === 'duplicate' && (
            <DuplicateView key="duplicate" state={state} flow={flow} />
          )}

          {/* ERROR */}
          {state.id === 'error' && (
            <ErrorView key="error" state={state} onRetry={handleRetry} onClose={handleClose} />
          )}

          {/* SUBMITTED */}
          {state.id === 'submitting' && (
            <SubmittedView key="submitted" count={state.entries.length} onClose={props.onClose} />
          )}

        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
