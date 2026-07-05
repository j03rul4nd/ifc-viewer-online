// ─── IdsPanel ─────────────────────────────────────────────────────────────────
// Docked IDS results panel (P5-1) — sibling of ValidationPanel in the bottom
// slot (the two are exclusive: expanding one collapses the other). The IdsModal
// stays as the loader/runner; this panel owns results: summary header, filters,
// group-by, virtualized spec/failure rows, click-to-3D, highlight/isolate.

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from 'react-i18next'
import { useIdsStore, type IdsFilters } from '../stores/idsStore'
import { useSceneStore } from '../stores/sceneStore'
import { useUIStore } from '../stores/uiStore'
import { useIdsRun } from '../hooks/useIdsRun'
import { useIsMobile } from '../hooks/useIsMobile'
import IdsPanelMobile from './mobile/IdsPanelMobile'
import { hasActiveIdsRun } from '../lib/ids/ids-runner'
import i18n from '../i18n/config'
import { modelRegistry } from '../lib/model-registry'
import { SCORE_COLOR } from './ids/score'
import { FacetChip, FACET_KINDS } from './ids/FacetChip'
import { IdsExportMenu } from './ids/IdsExportMenu'
import { localizeReasons, localizeRemediation } from './ids/reasons'
import { diffIdsResults } from '../lib/ids/ids-diff'
import * as Icons from './Icons'
import type { TFunction } from 'i18next'
import type { ViewerAPI } from '../lib/viewer'
import type { IdsReason, IdsResult, IdsSpecResult } from '../lib/ids/ids-types'

// ── Row model (flattened for virtualization) ─────────────────────────────────

type GroupFraction =
  | { type: 'spec'; status: 'pass' | 'fail' | 'na'; skipped: boolean; passed: number; applicable: number }
  | { type: 'count'; kind: 'specs' | 'failures'; n: number }

type PanelRow =
  | {
      kind: 'group'
      key: string
      status: 'pass' | 'fail' | 'na'
      /** EIR severity (from spec identifier `eir:<sev>`) — tints failing rows amber/blue. */
      severity?: 'error' | 'warning' | 'info'
      title: string
      fraction: GroupFraction
      facets: string[]
      detail?: string
      expandable: boolean
    }
  | { kind: 'failure'; key: string; expressId: number; name: string; ifcClass: string; globalId?: string | null; reasons: IdsReason[]; context?: string }
  | { kind: 'truncation'; key: string; hiddenCount: number }

const ROW_H = { group: 34, failure: 44, truncation: 26 } as const

interface IdsPanelProps {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  /** Opens the IdsModal (loader). */
  onOpenLoader: () => void
}

export default function IdsPanel({ viewerApiRef, onOpenLoader }: IdsPanelProps) {
  const { t } = useTranslation('ids')
  const isMobile = useIsMobile()
  const activeModelId = useSceneStore((s) => s.activeModelId)
  const models = useSceneStore((s) => s.models)
  const fileName = useIdsStore((s) => s.fileName)
  const doc = useIdsStore((s) => s.doc)
  const status = useIdsStore((s) => s.status)
  const progress = useIdsStore((s) => s.progress)
  const progressPhase = useIdsStore((s) => s.progressPhase)
  const error = useIdsStore((s) => s.error)
  const highlightMode = useIdsStore((s) => s.highlightMode)
  const panelOpen = useIdsStore((s) => s.panelOpen)
  const filters = useIdsStore((s) => s.filters)
  const multiRun = useIdsStore((s) => s.multiRun)
  const resultsByModel = useIdsStore((s) => s.resultsByModel)
  const setPanelOpen = useIdsStore((s) => s.setPanelOpen)
  const setFilters = useIdsStore((s) => s.setFilters)

  const modelId = activeModelId ?? models[0]?.id ?? null
  const result = useIdsStore((s) => (modelId ? s.resultsByModel[modelId] ?? null : null))
  const prevResult = useIdsStore((s) => (modelId ? s.previousResultByModel[modelId] ?? null : null))
  const runMeta = useIdsStore((s) => (modelId ? s.runMetaByModel[modelId] ?? null : null))
  const modelName = useMemo(
    () => models.find((m) => m.id === modelId)?.fileName ?? null,
    [models, modelId],
  )
  const hasBuffer = useMemo(() => (modelId ? !!modelRegistry.getBuffer(modelId) : false), [modelId, models])
  const busy = status === 'running' || status === 'cancelling'

  const { run, runAll, cancel, toggleHighlight } = useIdsRun()

  // Federated check (P7-2): which loaded models have a buffer + a result, for the
  // per-model score chips. Stable refs (selector footgun, validationStore.ts:428).
  const modelScores = useMemo(
    () => models
      .map((m) => ({ id: m.id, name: m.fileName, score: resultsByModel[m.id]?.score ?? null }))
      .filter((m) => m.score !== null),
    [models, resultsByModel],
  )

  // Orphan guard (§7.11): after a dev hot-reload the store can read `running`
  // while the runner module lost its live run (activeRuns re-initialised). Detect
  // it once on mount and surface a Retry instead of a stuck spinner.
  useEffect(() => {
    const s = useIdsStore.getState()
    if ((s.status === 'running' || s.status === 'cancelling') && !hasActiveIdsRun()) {
      s.setError('orphaned', i18n.t('ids:errors.orphaned'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [focusIdx, setFocusIdx] = useState(-1)
  const [isolated, setIsolated] = useState(false)
  const [diffDismissed, setDiffDismissed] = useState(false)

  // Since-last-run comparison (P7-3). Recomputed when either run ref changes; the
  // dismiss flag resets whenever a fresh result lands.
  const diff = useMemo(
    () => (result && prevResult ? diffIdsResults(prevResult, result) : null),
    [result, prevResult],
  )
  useEffect(() => { setDiffDismissed(false) }, [result])
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Requirement facet kinds per spec — paired by index with the CURRENT doc,
  // only when the result was produced by it (stale results skip the pairing).
  const specFacets = useMemo(() => {
    if (!result || !doc || doc.specifications.length !== result.specs.length) return null
    if (runMeta && fileName && runMeta.idsFileName !== fileName) return null
    return doc.specifications.map((s) => [...new Set(s.requirements.map((r) => r.facet.kind as string))])
  }, [result, doc, runMeta, fileName])

  const stale = !!(result && runMeta && fileName && runMeta.idsFileName !== fileName)

  const rows = useMemo<PanelRow[]>(
    () => buildRows(result, filters, expanded, specFacets),
    [result, filters, expanded, specFacets],
  )

  const failures = useMemo(
    () => (result && modelId
      ? result.specs.flatMap((s) => s.failures.filter((f) => f.expressId >= 0).map((f) => ({ expressId: f.expressId, modelId })))
      : []),
    [result, modelId],
  )

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => ROW_H[rows[i].kind],
    overscan: 12,
  })

  const openPanel = useCallback((): void => {
    useUIStore.getState().setValidationPanelOpen(false)
    setPanelOpen(true)
  }, [setPanelOpen])

  const toggleRow = useCallback((key: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const selectIn3D = useCallback((expressId: number): void => {
    viewerApiRef.current?.selectElement(expressId, modelId ?? undefined)
    viewerApiRef.current?.focusElement(expressId, modelId ?? undefined)
  }, [viewerApiRef, modelId])

  const toggleIsolate = useCallback((): void => {
    const next = !isolated
    setIsolated(next)
    viewerApiRef.current?.isolateElements(failures, next)
  }, [isolated, failures, viewerApiRef])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    // Escape always closes the panel (works from the search box too).
    if (e.key === 'Escape') { setPanelOpen(false); return }
    // But don't hijack typing: Enter/arrows must edit the caret in the search
    // box, not fire row actions / steal caret movement.
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    if (rows.length === 0) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const dir = e.key === 'ArrowDown' ? 1 : -1
      const next = Math.max(0, Math.min(rows.length - 1, focusIdx + dir))
      setFocusIdx(next)
      virtualizer.scrollToIndex(next)
      return
    }
    if (e.key === 'Enter' && focusIdx >= 0 && focusIdx < rows.length) {
      e.preventDefault()
      const row = rows[focusIdx]
      if (row.kind === 'group' && row.expandable) toggleRow(row.key)
      else if (row.kind === 'failure' && row.expressId >= 0) selectIn3D(row.expressId)
    }
  }

  useEffect(() => {
    if (focusIdx >= rows.length) setFocusIdx(rows.length - 1)
  }, [rows.length, focusIdx])

  const hasAnything = !!doc || !!result || busy

  // ── Mobile: dedicated bottom-sheet variant (desktop render path untouched) ──
  if (isMobile) {
    return <IdsPanelMobile viewerApiRef={viewerApiRef} onOpenLoader={onOpenLoader} />
  }

  // ── Collapsed bar ──────────────────────────────────────────────────────────
  if (!panelOpen) {
    if (!hasAnything) return null
    return (
      <button
        onClick={openPanel}
        className="flex items-center gap-2 px-3 h-10 xs:h-9 border-t border-[var(--border)] bg-[var(--surface)] w-full text-left hover:bg-[var(--surface-2)] transition-colors shrink-0 max-md:hidden"
      >
        <Icons.Shield size={13} className="text-[var(--accent)] shrink-0" />
        <span className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider shrink-0">IDS</span>
        {busy ? (
          <span className="text-[11px] text-[var(--accent)] font-mono animate-pulse">{t('collapsed.checking', { pct: Math.round(progress) })}</span>
        ) : result ? (
          <span className="flex items-center gap-2">
            <span
              className="px-1.5 py-0.5 rounded-full font-mono font-bold text-[10px] border leading-none"
              style={{ color: SCORE_COLOR(result.score), borderColor: 'transparent', background: 'var(--surface-2)' }}
            >
              {result.score}
            </span>
            <span className="text-[11px] font-mono text-[var(--ok)]">{t('summary.passShort', { count: result.passedSpecs })}</span>
            {result.failedSpecs > 0 && <span className="text-[11px] font-mono text-[var(--danger)]">{t('summary.failShort', { count: result.failedSpecs })}</span>}
            {result.naSpecs > 0 && <span className="text-[11px] font-mono text-[var(--text-faint)]">{t('summary.naShort', { count: result.naSpecs })}</span>}
          </span>
        ) : (
          <span className="text-[11px] text-[var(--text-faint)]">{t('collapsed.notRun', { file: fileName ?? t('collapsed.noFile') })}</span>
        )}
        <span className="ml-auto text-[var(--text-faint)]">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M1 8.5L6 3.5L11 8.5L10 9.5L6 5.5L2 9.5Z" /></svg>
        </span>
      </button>
    )
  }

  // ── Expanded panel ─────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex flex-col border-t border-[var(--border)] bg-[var(--surface)] shrink-0 outline-none"
      style={{ height: 'min(44dvh, 520px)', minHeight: 220 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-9 border-b border-[var(--border)] shrink-0">
        <Icons.Shield size={13} className="text-[var(--accent)] shrink-0" />
        <span className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider">{t('title')}</span>
        {fileName && <span className="text-[10px] font-mono text-[var(--text-faint)] truncate max-w-[160px]">{fileName}</span>}
        {modelName && (
          <span className="text-[10px] text-[var(--text-faint)] bg-[var(--surface-2)] border border-[var(--border)] rounded-full px-1.5 py-0.5 truncate max-w-[160px]" title={t('summary.checkedModel')}>
            {modelName}
          </span>
        )}
        {result && (
          <>
            <span className="text-[14px] font-bold font-mono leading-none" style={{ color: SCORE_COLOR(result.score) }}>{result.score}</span>
            <StatusChip label={t('summary.pass', { count: result.passedSpecs })} color="var(--ok)" active={filters.statusTab === 'pass'} onClick={() => setFilters({ statusTab: filters.statusTab === 'pass' ? 'all' : 'pass' })} />
            <StatusChip label={t('summary.fail', { count: result.failedSpecs })} color="var(--danger)" active={filters.statusTab === 'fail'} onClick={() => setFilters({ statusTab: filters.statusTab === 'fail' ? 'all' : 'fail' })} />
            {result.naSpecs > 0 && <StatusChip label={t('summary.na', { count: result.naSpecs })} color="var(--text-faint)" active={filters.statusTab === 'na'} onClick={() => setFilters({ statusTab: filters.statusTab === 'na' ? 'all' : 'na' })} />}
            {runMeta && (
              <span className="text-[9.5px] text-[var(--text-faint)] hidden lg:inline">
                {new Date(runMeta.at).toLocaleTimeString()} · {runMeta.durationMs} ms{runMeta.modelSchema ? ` · ${runMeta.modelSchema}` : ''}
              </span>
            )}
          </>
        )}
        <div className="flex-1" />
        {busy ? (
          <button onClick={cancel} disabled={status === 'cancelling'} className="h-6 px-2 rounded-md border border-[var(--border)] text-[10.5px] text-[var(--text-dim)] hover:text-[var(--text)] disabled:opacity-40">
            {status === 'cancelling' ? t('run.cancelling') : t('run.cancel')}
          </button>
        ) : (
          <>
            <button
              onClick={() => void run()}
              disabled={!doc || !hasBuffer}
              title={!hasBuffer ? t('actions.reloadToRun') : undefined}
              className="h-6 px-2 rounded-md border border-[var(--border)] text-[10.5px] text-[var(--text-dim)] hover:text-[var(--text)] disabled:opacity-40"
            >
              {result ? t('actions.rerunShort') : t('actions.runShort')}
            </button>
            {models.length > 1 && (
              <button
                onClick={() => void runAll()}
                disabled={!doc}
                title={t('actions.checkAllTitle')}
                className="h-6 px-2 rounded-md border border-[var(--border)] text-[10.5px] text-[var(--text-dim)] hover:text-[var(--text)] disabled:opacity-40"
              >
                {t('actions.checkAll', { count: models.length })}
              </button>
            )}
            <button
              onClick={toggleHighlight}
              disabled={failures.length === 0}
              title={t('actions.highlightTitle')}
              className={`h-6 px-2 rounded-md border text-[10.5px] transition-colors disabled:opacity-40 ${highlightMode ? 'border-[var(--danger)] text-[var(--danger)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]'}`}
            >
              {t('actions.highlight')}
            </button>
            <button
              onClick={toggleIsolate}
              disabled={failures.length === 0 && !isolated}
              title={t('actions.isolateTitle')}
              className={`h-6 px-2 rounded-md border text-[10.5px] transition-colors disabled:opacity-40 ${isolated ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]'}`}
            >
              {isolated ? t('actions.showAll') : t('actions.isolate')}
            </button>
            {result && (
              <IdsExportMenu
                result={result}
                idsFile={fileName}
                modelFile={modelName}
                takeSnapshot={() => viewerApiRef.current?.takeSnapshot() ?? ''}
              />
            )}
          </>
        )}
        <button onClick={() => setPanelOpen(false)} aria-label={t('actions.collapse')} className="w-6 h-6 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text)]">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M1 3.5L6 8.5L11 3.5L10 2.5L6 6.5L2 2.5Z" /></svg>
        </button>
      </div>

      {/* Stale-result honesty banner (§5.4) */}
      {stale && runMeta && (
        <div className="px-3 py-1 text-[10px] border-b border-[var(--border)]" style={{ color: '#F5A623' }}>
          {t('states.staleIds', { file: runMeta.idsFileName })}
        </div>
      )}

      {/* Since-last-run strip (P7-3) */}
      {diff && !diff.unchanged && !diffDismissed && !busy && (
        <div className="flex items-center gap-2.5 px-3 h-7 border-b border-[var(--border)] shrink-0 text-[10.5px]">
          <span className="font-mono" style={{ color: diff.scoreDelta > 0 ? 'var(--ok)' : diff.scoreDelta < 0 ? 'var(--danger)' : 'var(--text-faint)' }}>
            {diff.scoreDelta > 0
              ? t('diff.scoreUp', { prev: diff.prevScore, curr: diff.currScore, delta: diff.scoreDelta })
              : diff.scoreDelta < 0
                ? t('diff.scoreDown', { prev: diff.prevScore, curr: diff.currScore, delta: diff.scoreDelta })
                : t('diff.scoreSame', { curr: diff.currScore })}
          </span>
          {diff.resolved > 0 && <span style={{ color: 'var(--ok)' }}>{t('diff.resolved', { count: diff.resolved })}</span>}
          {diff.added > 0 && <span style={{ color: 'var(--danger)' }}>{t('diff.added', { count: diff.added })}</span>}
          <button onClick={() => setDiffDismissed(true)} aria-label={t('diff.dismiss')} className="ml-auto w-5 h-5 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text)]">
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M1 1l8 8M9 1L1 9" /></svg>
          </button>
        </div>
      )}

      {/* Federated check progress (P7-2) */}
      {multiRun && (
        <div className="flex items-center gap-2 px-3 h-7 border-b border-[var(--border)] shrink-0">
          <div className="flex-1 h-0.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-150" style={{ width: `${(multiRun.done / multiRun.total) * 100}%` }} />
          </div>
          <span className="text-[10px] font-mono text-[var(--text-faint)] shrink-0">{t('multiRun.progress', { done: multiRun.done, total: multiRun.total })}</span>
        </div>
      )}

      {/* Per-model score chips (P7-2): only meaningful with ≥2 checked models */}
      {!multiRun && modelScores.length > 1 && (
        <div className="flex items-center gap-1.5 px-3 h-7 border-b border-[var(--border)] shrink-0 overflow-x-auto" title={t('multiRun.modelsTitle')}>
          {modelScores.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                useSceneStore.getState().setActiveModel(m.id)
                viewerApiRef.current?.setActiveModel(m.id)
              }}
              className={`shrink-0 inline-flex items-center gap-1.5 h-5 px-1.5 rounded-md border text-[10px] transition-colors ${m.id === modelId ? 'border-[var(--accent)]' : 'border-[var(--border)] hover:border-[var(--border-strong)]'}`}
            >
              <span className="font-mono font-bold" style={{ color: SCORE_COLOR(m.score as number) }}>{m.score}</span>
              <span className="text-[var(--text-dim)] truncate max-w-[120px]">{m.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Filter bar */}
      {result && (
        <div className="flex items-center gap-1.5 px-3 h-8 border-b border-[var(--border)] shrink-0 overflow-x-auto">
          <GroupByButtons groupBy={filters.groupBy} onChange={(g) => setFilters({ groupBy: g })} />
          <div className="w-px h-4 bg-[var(--border)] shrink-0" />
          {FACET_KINDS.map((k) => (
            <FacetChip
              key={k}
              kind={k}
              active={filters.facetKinds.includes(k)}
              onClick={() => setFilters({
                facetKinds: filters.facetKinds.includes(k)
                  ? filters.facetKinds.filter((x) => x !== k)
                  : [...filters.facetKinds, k],
              })}
            />
          ))}
          <div className="flex-1" />
          <input
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            placeholder={t('filters.search')}
            className="h-5.5 w-[180px] px-2 py-0.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[10.5px] text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none focus:border-[var(--accent)]"
          />
        </div>
      )}

      {/* Progress */}
      {busy && (
        <div className="px-3 py-2 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-[var(--text-faint)]">{t(`progress.${progressPhase ?? 'open'}`)}</span>
            <span className="text-[10px] font-mono text-[var(--text-faint)]">{Math.round(progress)}%</span>
          </div>
          <div className="h-0.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-150" style={{ width: `${progress}%`, background: 'var(--accent)' }} />
          </div>
        </div>
      )}

      {/* Error strip */}
      {status === 'error' && error && (
        <div className="px-3 py-1.5 text-[10.5px] text-[var(--danger)] border-b border-[var(--border)] flex items-center gap-2 shrink-0">
          <span className="truncate">{error.message}</span>
          <button onClick={() => void run()} className="ml-auto h-5 px-2 rounded border border-[var(--border)] text-[10px] text-[var(--text-dim)] hover:text-[var(--text)] shrink-0">{t('run.retry')}</button>
        </div>
      )}

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {!modelId ? (
          <EmptyState text={t('states.noModel')} />
        ) : !doc && !result ? (
          <EmptyState text={t('states.noIds')} action={{ label: t('loader.choose'), onClick: onOpenLoader }} />
        ) : !result ? (
          busy ? null : <EmptyState text={t('states.noResult', { file: fileName ?? t('states.noResultGeneric') })} action={{ label: t('run.run'), onClick: () => void run(), disabled: !hasBuffer }} />
        ) : rows.length === 0 ? (
          <EmptyState text={t('states.noMatch')} action={{ label: t('filters.clear'), onClick: () => setFilters({ search: '', statusTab: 'all', facetKinds: [] }) }} />
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((v) => {
              const row = rows[v.index]
              return (
                <div
                  key={row.key}
                  data-index={v.index}
                  ref={virtualizer.measureElement}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }}
                >
                  <RowView
                    row={row}
                    focused={v.index === focusIdx}
                    expanded={row.kind === 'group' ? expanded.has(row.key) : false}
                    onClick={() => {
                      setFocusIdx(v.index)
                      containerRef.current?.focus()
                      if (row.kind === 'group' && row.expandable) toggleRow(row.key)
                      else if (row.kind === 'failure' && row.expressId >= 0) selectIn3D(row.expressId)
                    }}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Row construction (pure — no i18n; labels are rendered by RowView) ────────

/** Extract the EIR severity a spec carries in its `eir:<sev>` identifier, if any. */
function eirSeverity(identifier?: string): 'error' | 'warning' | 'info' | undefined {
  if (!identifier?.startsWith('eir:')) return undefined
  const sev = identifier.slice(4)
  return sev === 'warning' || sev === 'info' ? sev : sev === 'error' ? 'error' : undefined
}

function buildRows(
  result: IdsResult | null,
  filters: IdsFilters,
  expanded: Set<string>,
  specFacets: string[][] | null,
): PanelRow[] {
  if (!result) return []
  const q = filters.search.trim().toLowerCase()
  const matches = (s: string | null | undefined): boolean => !q || (s ?? '').toLowerCase().includes(q)

  const visibleSpecs = result.specs
    .map((spec, i) => ({ spec, i }))
    .filter(({ spec }) => filters.statusTab === 'all' || spec.status === filters.statusTab)
    .filter(({ i }) => filters.facetKinds.length === 0
      || (specFacets?.[i] ?? []).some((k) => filters.facetKinds.includes(k)))
    .filter(({ spec }) => matches(spec.name)
      || spec.failures.some((f) => matches(f.name) || matches(f.ifcClass)))

  const rows: PanelRow[] = []

  if (filters.groupBy === 'spec') {
    for (const { spec, i } of visibleSpecs) {
      const key = `spec:${i}`
      rows.push({
        kind: 'group',
        key,
        status: spec.status,
        severity: eirSeverity(spec.identifier),
        title: spec.name,
        fraction: { type: 'spec', status: spec.status, skipped: spec.skippedReason === 'ifcVersion', passed: spec.passedCount, applicable: spec.applicableCount },
        facets: specFacets?.[i] ?? [],
        detail: spec.description,
        expandable: spec.failures.length > 0 || !!spec.description,
      })
      if (!expanded.has(key)) continue
      const visFailures = matches(spec.name)
        ? spec.failures
        : spec.failures.filter((f) => matches(f.name) || matches(f.ifcClass))
      for (const f of visFailures) {
        rows.push({ kind: 'failure', key: `${key}:f${f.expressId}`, expressId: f.expressId, name: f.name, ifcClass: f.ifcClass, globalId: f.globalId, reasons: f.reasons })
      }
      if (spec.failedCount > spec.failures.length) {
        rows.push({ kind: 'truncation', key: `${key}:trunc`, hiddenCount: spec.failedCount - spec.failures.length })
      }
    }
    return rows
  }

  const failing = visibleSpecs.flatMap(({ spec }) =>
    spec.failures.filter((f) => f.expressId >= 0 && (matches(spec.name) || matches(f.name) || matches(f.ifcClass)))
      .map((f) => ({ spec, f })))

  if (filters.groupBy === 'element') {
    const byEl = new Map<number, { name: string; ifcClass: string; globalId?: string | null; items: Array<{ spec: IdsSpecResult; reasons: IdsReason[] }> }>()
    for (const { spec, f } of failing) {
      const e = byEl.get(f.expressId) ?? { name: f.name, ifcClass: f.ifcClass, globalId: f.globalId, items: [] }
      e.items.push({ spec, reasons: f.reasons })
      byEl.set(f.expressId, e)
    }
    for (const [expressId, e] of byEl) {
      const key = `el:${expressId}`
      rows.push({
        kind: 'group', key, status: 'fail',
        title: e.name || `#${expressId}`,
        fraction: { type: 'count', kind: 'specs', n: e.items.length },
        facets: [], detail: `${e.ifcClass} #${expressId}${e.globalId ? ` · ${e.globalId}` : ''}`, expandable: true,
      })
      if (!expanded.has(key)) continue
      for (const it of e.items) {
        rows.push({ kind: 'failure', key: `${key}:${it.spec.name}`, expressId, name: it.spec.name, ifcClass: e.ifcClass, globalId: e.globalId, reasons: it.reasons })
      }
    }
    return rows
  }

  // groupBy === 'class'
  const byClass = new Map<string, Array<{ spec: IdsSpecResult; f: { expressId: number; name: string; ifcClass: string; globalId?: string | null; reasons: IdsReason[] } }>>()
  for (const it of failing) {
    const arr = byClass.get(it.f.ifcClass) ?? []
    arr.push(it)
    byClass.set(it.f.ifcClass, arr)
  }
  for (const [cls, items] of byClass) {
    const key = `cls:${cls}`
    rows.push({
      kind: 'group', key, status: 'fail', title: cls,
      fraction: { type: 'count', kind: 'failures', n: items.length },
      facets: [], expandable: true,
    })
    if (!expanded.has(key)) continue
    for (const { spec, f } of items) {
      rows.push({ kind: 'failure', key: `${key}:${spec.name}:${f.expressId}`, expressId: f.expressId, name: f.name, ifcClass: f.ifcClass, globalId: f.globalId, reasons: f.reasons, context: spec.name })
    }
  }
  return rows
}

function fractionLabel(t: TFunction<'ids'>, f: GroupFraction): string {
  if (f.type === 'count') {
    return f.kind === 'specs'
      ? t('filters.specsCounted', { count: f.n })
      : t('filters.failuresCounted', { count: f.n })
  }
  if (f.status === 'na') return f.skipped ? t('status.skipped') : t('status.na')
  return t('status.fraction', { passed: f.passed, applicable: f.applicable })
}

// ── Leaf views ────────────────────────────────────────────────────────────────

function RowView({ row, focused, expanded, onClick }: {
  row: PanelRow
  focused: boolean
  expanded: boolean
  onClick: () => void
}) {
  const { t } = useTranslation('ids')
  if (row.kind === 'truncation') {
    return (
      <div className="px-8 py-1 text-[9.5px] text-[var(--text-faint)] italic">
        {t('truncation', { count: row.hiddenCount })}
      </div>
    )
  }
  if (row.kind === 'group') {
    // EIR severity recolours a FAILING spec: warning→amber, info→accent.
    const failColor = row.severity === 'warning' ? '#F5A623' : row.severity === 'info' ? 'var(--accent)' : 'var(--danger)'
    const failIcon = row.severity === 'warning' ? '!' : row.severity === 'info' ? 'i' : '✗'
    const color = row.status === 'pass' ? 'var(--ok)' : row.status === 'fail' ? failColor : 'var(--text-faint)'
    const icon = row.status === 'pass' ? '✓' : row.status === 'fail' ? failIcon : '–'
    return (
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-2)] ${focused ? 'bg-[var(--surface-2)]' : ''}`}
      >
        <span className="font-mono text-[12px] w-3.5 text-center shrink-0" style={{ color }}>{icon}</span>
        <span className="text-[11.5px] text-[var(--text)] truncate">{row.title}</span>
        {row.facets.map((k) => <FacetChip key={k} kind={k} />)}
        {row.detail && <span className="text-[9.5px] text-[var(--text-faint)] truncate hidden md:inline">{row.detail}</span>}
        <span className="ml-auto text-[10px] font-mono shrink-0" style={{ color }}>{fractionLabel(t, row.fraction)}</span>
        {row.expandable && (
          <Icons.Chevron size={11} className={`text-[var(--text-faint)] shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        )}
      </button>
    )
  }
  const remediation = localizeRemediation(t, row.reasons)
  return (
    <button
      onClick={onClick}
      className={`w-full text-left pl-8 pr-3 py-1.5 border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-2)] ${focused ? 'bg-[var(--surface-2)]' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[var(--text)] truncate">{row.name || `#${row.expressId}`}</span>
        <span className="text-[9.5px] font-mono text-[var(--text-faint)] shrink-0">{row.ifcClass}{row.expressId >= 0 ? ` #${row.expressId}` : ''}</span>
        {row.globalId && <span className="text-[9.5px] font-mono text-[var(--text-faint)] shrink-0 hidden md:inline" title={`GUID ${row.globalId}`}>{row.globalId}</span>}
        {row.context && <span className="text-[9.5px] text-[var(--text-faint)] truncate">· {row.context}</span>}
      </div>
      <div className="text-[10px] leading-snug mt-0.5 truncate" style={{ color: 'var(--danger)' }}>
        {localizeReasons(t, row.reasons)}
      </div>
      {remediation && (
        <div className="text-[9.5px] leading-snug mt-0.5 truncate text-[var(--text-faint)]" title={`${t('howToFix')}: ${remediation}`}>
          {t('howToFix')}: {remediation}
        </div>
      )}
    </button>
  )
}

function StatusChip({ label, color, active, onClick }: { label: string; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-5 px-1.5 rounded-full text-[10px] font-mono leading-none border transition-colors"
      style={active
        ? { color, borderColor: color, background: 'var(--surface-2)' }
        : { color, borderColor: 'transparent' }}
    >
      {label}
    </button>
  )
}

function GroupByButtons({ groupBy, onChange }: { groupBy: IdsFilters['groupBy']; onChange: (g: IdsFilters['groupBy']) => void }) {
  const { t } = useTranslation('ids')
  const labels: Record<IdsFilters['groupBy'], string> = {
    spec: t('filters.groupSpec'),
    element: t('filters.groupElement'),
    class: t('filters.groupClass'),
  }
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {(['spec', 'element', 'class'] as const).map((g) => (
        <button
          key={g}
          onClick={() => onChange(g)}
          className="px-1.5 h-5 rounded text-[9px] font-medium transition-colors"
          style={groupBy === g
            ? { background: 'var(--surface-2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }
            : { color: 'var(--text-faint)', border: '1px solid transparent' }}
        >
          {labels[g]}
        </button>
      ))}
    </div>
  )
}

function EmptyState({ text, action }: { text: string; action?: { label: string; onClick: () => void; disabled?: boolean } }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 px-6 text-center">
      <p className="text-[11px] text-[var(--text-faint)] m-0 max-w-[420px] leading-relaxed">{text}</p>
      {action && (
        <button
          onClick={action.onClick}
          disabled={action.disabled}
          className="h-7 px-3 rounded-md bg-[var(--accent)] text-white text-[11px] font-medium disabled:opacity-40 hover:brightness-110 transition-all"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
