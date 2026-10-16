// ─── BatchFixResultCard ──────────────────────────────────────────────────────
// What a batch rename produced: the fixed IFC (written once, checked once),
// its Health Score before → after, and the way out (download, undo, dismiss).
// The score here is the FIXED file's; the headline at the top of the panel
// stays on the file as loaded, and the card says so.
//
// Also home to BatchFixBar, the one-line "Fix all N" offer inside an open
// rule group, so both halves of the flow share their wording and styling.

import { useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { FixBatch, FixRun, FixRunErrorCode } from '../../stores/batchFixStore'
import type { FixSummary } from '../../lib/fix/score-delta'
import { fixHeaderChanged } from '../../lib/fix/fix-run'
import { downloadBlob } from '../../lib/diffStore'
import { trackExportClicked } from '../../lib/analytics'

const OK_TINT     = 'color-mix(in srgb, var(--ok) 10%, transparent)'
const OK_BORDER   = 'color-mix(in srgb, var(--ok) 30%, transparent)'
const OK_WASH     = 'color-mix(in srgb, var(--ok) 6%, transparent)'
const WARN        = 'var(--warn, #F5A623)'

/**
 * Save a finished run's bytes. Called straight from the click: nothing is
 * awaited before `downloadBlob`, because the save picker needs the click's
 * transient activation and any await in between can spend it. The bytes are
 * the ones that were checked; they are never exported a second time (the
 * header carries the export time, so a second export would differ).
 *
 * Returns null when there is nothing to save (not done, or the bytes went
 * stale), else the download, which resolves once the export is tracked.
 */
export function downloadFixedRun(
  run: FixRun,
  download: (blob: Blob, fileName: string) => Promise<void> = downloadBlob,
): Promise<void> | null {
  if (run.status !== 'done' || !run.bytes) return null
  const saving = download(new Blob([run.bytes], { type: 'application/x-step' }), run.fileName)
  return saving.then(() => trackExportClicked({ format: 'ifc', model_count: 1, source: 'batch_fix' }))
}

/** Where a batch stands, model by model, reduced to what the card shows. */
export interface FixCardView {
  /** A model still being written or checked (the first in batch order), if any. */
  working: { modelId: string; status: 'exporting' | 'checking'; progress: number; fileName?: string } | null
  errors: FixRun[]
  stale: FixRun[]
  /** Every model's run is done: the score is measured. */
  allDone: boolean
  totalDiffs: number
  skippedDiffs: number
}

export function fixCardView(modelIds: readonly string[], runs: readonly FixRun[], batchId: string): FixCardView {
  const byModel = new Map(runs.filter((r) => r.batchId === batchId).map((r) => [r.modelId, r]))
  let working: FixCardView['working'] = null
  const errors: FixRun[] = []
  const stale: FixRun[] = []
  let done = 0
  let totalDiffs = 0
  let skippedDiffs = 0
  for (const id of modelIds) {
    const run = byModel.get(id)
    // No run yet: the checks go one model at a time, so this one is queued.
    if (!run || run.status === 'exporting' || run.status === 'checking') {
      if (!working) {
        working = run
          ? { modelId: id, status: run.status as 'exporting' | 'checking', progress: run.progress, fileName: run.fileName }
          : { modelId: id, status: 'exporting', progress: 0 }
      }
      continue
    }
    if (run.status === 'error') errors.push(run)
    else if (run.status === 'stale') stale.push(run)
    else done++
    totalDiffs += run.totalDiffs ?? 0
    skippedDiffs += run.skippedDiffs ?? 0
  }
  return { working, errors, stale, allDone: modelIds.length > 0 && done === modelIds.length, totalDiffs, skippedDiffs }
}

export interface BatchFixResultCardProps {
  batch: FixBatch
  /** The batch's models that are still in the scene, in batch order. */
  modelIds: string[]
  runs: FixRun[]
  summary: FixSummary
  /** Phone layout: a rounded card with thumb-sized buttons. */
  compact?: boolean
  onDownload: (modelId: string) => void
  onUndo: () => void
  onDismiss: () => void
  /** Check again (stale) and Retry (error) both re-export and re-check. */
  onRecheck: () => void
  /** Empty names still to fill, offered after a duplicate-name batch. */
  alsoFixEmptyCount?: number
  onAlsoFixEmpty?: () => void
  /** The card grew or shrank: the desktop list below re-measures its offset. */
  onResize?: () => void
  /**
   * Take keyboard focus when this batch's card appears. Set right after
   * Apply: the control that opened the preview is gone by then (its count
   * dropped to 0), so focus would otherwise fall to <body>.
   */
  autoFocus?: boolean
}

/** What the card says for a failed run, by code. The raw message goes in the tooltip. */
const ERROR_TEXT_KEY = {
  no_buffer:     'batchFix.disabledNoBuffer',
  no_result:     'batchFix.card.errorNoResult',
  export_failed: 'batchFix.card.errorExport',
  check_failed:  'batchFix.card.errorCheck',
  stalled:       'batchFix.card.errorStalled',
} as const satisfies Record<FixRunErrorCode, string>

/** Failures Retry cannot fix: the bytes or the original result are not there to retry with. */
const NOT_RETRYABLE: ReadonlySet<FixRunErrorCode> = new Set(['no_buffer', 'no_result'])

export default function BatchFixResultCard({
  batch, modelIds, runs, summary, compact = false,
  onDownload, onUndo, onDismiss, onRecheck, alsoFixEmptyCount = 0, onAlsoFixEmpty, onResize, autoFocus = false,
}: BatchFixResultCardProps) {
  const { t } = useTranslation('validation')
  const ref = useRef<HTMLDivElement>(null)
  const resize = useRef(onResize)
  resize.current = onResize

  // Same contract as FloodValidationSlot: the virtualised list under this card
  // is positioned from its offset, which moves whenever the card changes size.
  // (When the card goes away the panel re-measures on its own.)
  useLayoutEffect(() => {
    const el = ref.current
    resize.current?.()
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => resize.current?.())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Layout, not passive: this must land before the closing dialog's own
  // focus restore (a timeout) looks at where focus is.
  useLayoutEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus, batch.batchId])

  const view = fixCardView(modelIds, runs, batch.batchId)
  const headerChanged = fixHeaderChanged(runs.filter((r) => r.batchId === batch.batchId && modelIds.includes(r.modelId)))
  const firstError = view.errors[0]?.error
  const runOf = new Map(runs.filter((r) => r.batchId === batch.batchId).map((r) => [r.modelId, r]))
  const single = modelIds.length <= 1
  const headerFile = single ? runOf.get(modelIds[0])?.fileName : undefined

  const delta = summary.after - summary.before
  const deltaColor = delta > 0 ? 'var(--ok)' : delta < 0 ? 'var(--danger)' : 'var(--text-faint)'
  const deltaText = `${delta > 0 ? '+' : ''}${delta}`
  const settled = view.working === null

  const btn = compact
    ? 'h-10 px-3.5 rounded-xl text-[12.5px] font-semibold'
    : 'h-6 px-2 rounded text-[10px] font-medium'
  const ghost = `${btn} border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] bg-[var(--surface-2)] disabled:opacity-40`
  const primary = `${btn} border disabled:opacity-40 disabled:cursor-not-allowed`

  return (
    <div
      ref={ref}
      data-testid="batch-fix-card"
      role="region"
      aria-label={t('batchFix.card.title')}
      tabIndex={-1}
      className={compact
        ? 'rounded-2xl p-3.5 flex flex-col gap-2 outline-none focus-visible:ring-1 focus-visible:ring-[var(--ok)]'
        : 'px-3 py-2.5 border-b border-[var(--border)] shrink-0 flex flex-col gap-1.5 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--ok)]'}
      style={compact
        ? { background: 'var(--surface-2)', border: `1px solid ${OK_BORDER}` }
        : { background: OK_WASH }}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2 min-w-0">
        <svg width={compact ? 14 : 11} height={compact ? 14 : 11} viewBox="0 0 12 12" fill="none" stroke="var(--ok)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M3 1.5h4l2.5 2.5v6.5H3z" />
          <path d="M4.8 7l1.2 1.2L8 6" />
        </svg>
        <span className={`${compact ? 'text-[12.5px]' : 'text-[11px]'} font-semibold text-[var(--text)] shrink-0`}>
          {t('batchFix.card.title')}
        </span>
        {headerFile && (
          <span className={`${compact ? 'text-[11.5px]' : 'text-[10px]'} font-mono text-[var(--text-faint)] truncate min-w-0`} title={headerFile}>
            {headerFile}
          </span>
        )}
        <button
          type="button"
          data-testid="batch-fix-dismiss"
          onClick={onDismiss}
          aria-label={t('batchFix.card.dismiss')}
          title={t('batchFix.card.dismiss')}
          className={`ml-auto shrink-0 ${compact ? 'w-8 h-8' : 'w-5 h-5'} flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors`}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1.5 1.5l5 5M6.5 1.5l-5 5" /></svg>
        </button>
      </div>

      {/* ── Progress: writing, then checking ── */}
      {view.working && (
        <div data-testid="batch-fix-progress" className="flex flex-col gap-1">
          <span className={`${compact ? 'text-[11.5px]' : 'text-[10px]'} text-[var(--text-dim)]`}>
            {view.working.status === 'exporting'
              ? t('batchFix.card.exporting')
              : t('batchFix.card.checking', { progress: Math.round(view.working.progress) })}
            {!single && view.working.fileName && (
              <span className="text-[var(--text-faint)] font-mono"> · {view.working.fileName}</span>
            )}
          </span>
          <div className="h-1 bg-[var(--surface-2)] rounded-full overflow-hidden">
            {view.working.status === 'exporting' ? (
              <div className="h-full w-full rounded-full animate-pulse" style={{ background: 'var(--ok)', opacity: 0.35 }} />
            ) : (
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.max(2, Math.min(100, view.working.progress))}%`, background: 'var(--ok)' }}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Score before → after ── */}
      <div className="flex items-baseline gap-2 flex-wrap">
        <span data-testid="batch-fix-score" className={`${compact ? 'text-[14px]' : 'text-[12px]'} font-mono font-bold text-[var(--text)]`}>
          {t('batchFix.card.score', { before: summary.before, after: summary.after })}
        </span>
        <span className={`${compact ? 'text-[12px]' : 'text-[10px]'} font-mono font-semibold`} style={{ color: deltaColor }}>
          {t('batchFix.card.delta', { delta: deltaText })}
        </span>
        <span
          data-testid="batch-fix-badge"
          data-measured={summary.measured && view.allDone ? 'true' : 'false'}
          className="px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider leading-none border"
          style={summary.measured && view.allDone
            ? { color: 'var(--ok)', borderColor: OK_BORDER, background: OK_TINT }
            : { color: 'var(--text-faint)', borderColor: 'var(--border)' }}
        >
          {summary.measured && view.allDone ? t('batchFix.card.measured') : t('batchFix.card.predicted')}
        </span>
      </div>

      <span data-testid="batch-fix-resolved" className={`${compact ? 'text-[11.5px]' : 'text-[10px]'} text-[var(--text-dim)]`}>
        {t('batchFix.card.cleared', { count: summary.resolved })}
        {' · '}
        {t('batchFix.card.added', { count: summary.added })}
        {view.totalDiffs > batch.renamed && (
          <span className="text-[var(--text-faint)]"> · {t('batchFix.card.edits', { count: view.totalDiffs })}</span>
        )}
      </span>

      {view.skippedDiffs > 0 && (
        <span className={`${compact ? 'text-[11.5px]' : 'text-[10px]'}`} style={{ color: WARN }}>
          {t('batchFix.card.skipped', { count: view.skippedDiffs })}
        </span>
      )}

      <span className={`${compact ? 'text-[11px]' : 'text-[9.5px]'} text-[var(--text-faint)] leading-snug`}>
        {t('batchFix.card.headlineNote')}
        {/* The header came from the export settings: say why header checks moved too. */}
        {headerChanged && <span data-testid="batch-fix-header-note"> {t('batchFix.card.headerNote')}</span>}
      </span>

      {/* ── Stale: the edits moved after the check ── */}
      {view.stale.length > 0 && (
        <div data-testid="batch-fix-stale" className="flex items-center gap-2 flex-wrap">
          <span className={`${compact ? 'text-[11.5px]' : 'text-[10px]'}`} style={{ color: WARN }}>
            {t('batchFix.card.stale')}
          </span>
          {settled && (
            <button type="button" onClick={onRecheck} className={ghost}>{t('batchFix.card.recheck')}</button>
          )}
        </div>
      )}

      {/* ── Error ── */}
      {view.errors.length > 0 && (
        <div data-testid="batch-fix-error" className="flex items-center gap-2 flex-wrap">
          <span
            className={`${compact ? 'text-[11.5px]' : 'text-[10px]'} text-[var(--danger)]`}
            // The technical message, for a support request; the text is the user's language.
            title={firstError?.message || undefined}
          >
            {t(ERROR_TEXT_KEY[firstError?.code ?? 'check_failed'])}
          </span>
          {settled && !NOT_RETRYABLE.has(firstError?.code ?? 'check_failed') && (
            <button type="button" onClick={onRecheck} className={ghost}>{t('batchFix.card.retry')}</button>
          )}
        </div>
      )}

      {/* ── Actions ── */}
      <div className={`flex items-center flex-wrap ${compact ? 'gap-2 mt-0.5' : 'gap-1.5 mt-0.5'}`}>
        {modelIds.map((id) => {
          const run = runOf.get(id)
          const ready = run?.status === 'done' && !!run.bytes
          return (
            <button
              key={id}
              type="button"
              data-testid="batch-fix-download"
              data-model-id={id}
              disabled={!ready}
              onClick={() => onDownload(id)}
              className={primary}
              style={{ background: OK_TINT, color: 'var(--ok)', borderColor: OK_BORDER }}
            >
              {single || !run ? t('batchFix.card.download') : t('batchFix.card.downloadFile', { file: run.fileName })}
            </button>
          )
        })}
        <button type="button" data-testid="batch-fix-undo" onClick={onUndo} className={ghost}>
          {t('batchFix.card.undo')}
        </button>
        {batch.ruleId === 'RULE_DUPLICATE_NAME' && alsoFixEmptyCount > 0 && onAlsoFixEmpty && settled && (
          <button
            type="button"
            data-testid="batch-fix-also-empty"
            onClick={onAlsoFixEmpty}
            className={`${compact ? 'text-[12px]' : 'text-[10px]'} font-medium text-[var(--accent)] hover:underline`}
          >
            {t('batchFix.card.alsoFixEmpty', { count: alsoFixEmptyCount })}
          </button>
        )}
      </div>
    </div>
  )
}

// ── "Fix all N" inside an open rule group ─────────────────────────────────────

export interface BatchFixBarProps {
  /** Issues the batch would clear; 0 hides the button (everything already edited). */
  count: number
  /** A batch for this rule exists: point at its card instead. */
  done: boolean
  /** Why the button is disabled, shown as its tooltip. */
  disabledReason?: string | null
  onFix: () => void
  /** Phone layout: a full-width button inside the group card. */
  mobile?: boolean
}

export function BatchFixBar({ count, done, disabledReason, onFix, mobile = false }: BatchFixBarProps) {
  const { t } = useTranslation('validation')
  if (count <= 0 && !done) return null

  if (mobile) {
    return (
      <div data-testid="batch-fix-bar" className="flex flex-col gap-1">
        {count > 0 && (
          <button
            type="button"
            onClick={onFix}
            disabled={!!disabledReason}
            title={disabledReason ?? t('batchFix.fixAllTitle')}
            className="h-10 w-full rounded-xl text-[12.5px] font-semibold active:scale-[0.98] transition-transform disabled:opacity-40"
            style={{ background: OK_TINT, color: 'var(--ok)', border: `1px solid ${OK_BORDER}`, WebkitTapHighlightColor: 'transparent' }}
          >
            {t('batchFix.fixAll', { count })}
          </button>
        )}
        <span className="text-[11px] text-[var(--text-faint)] px-1">
          {done ? t('batchFix.barDone') : (disabledReason ?? t('batchFix.bar', { count }))}
        </span>
      </div>
    )
  }

  return (
    <div
      data-testid="batch-fix-bar"
      className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)] min-h-[36px]"
      style={{ background: OK_WASH }}
    >
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="var(--ok)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="M2 6.5l2.5 2.5L10 3.5" />
      </svg>
      {/* Disabled: say why in the bar itself, not only in a hover tooltip, and
          never "can be fixed here" next to a button that refuses. */}
      <span className="text-[10.5px] text-[var(--text-dim)] truncate min-w-0 flex-1" title={disabledReason ?? undefined}>
        {done ? t('batchFix.barDone') : (disabledReason ?? t('batchFix.bar', { count }))}
      </span>
      {count > 0 && (
        <button
          type="button"
          onClick={onFix}
          disabled={!!disabledReason}
          title={disabledReason ?? t('batchFix.fixAllTitle')}
          className="px-2 h-6 rounded text-[10px] border transition-colors font-medium shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: OK_TINT, color: 'var(--ok)', borderColor: OK_BORDER }}
        >
          {t('batchFix.fixAll', { count })}
        </button>
      )}
    </div>
  )
}
