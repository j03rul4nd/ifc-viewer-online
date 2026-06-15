// ─── IdsPanelMobile ──────────────────────────────────────────────────────────
// Dedicated touch-first IDS results experience (mobile < md). Rendered instead
// of the docked IdsPanel via an early return; the desktop panel is untouched.
// Near-standalone: re-subscribes to idsStore / sceneStore and drives runs through
// useIdsRun, so no logic is duplicated from the desktop component.
//
// UX: frosted bottom-sheet, score hero, a single primary Run CTA (+ overflow
// action sheet for highlight / isolate / export), status + facet filter chips,
// and spec *cards* that expand to their failing elements (tap → select in 3D).

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useIdsStore } from '../../stores/idsStore'
import { useSceneStore } from '../../stores/sceneStore'
import { useIdsRun } from '../../hooks/useIdsRun'
import { modelRegistry } from '../../lib/model-registry'
import { diffIdsResults } from '../../lib/ids/ids-diff'
import { toIdsJson, toIdsCsv, toIdsHtml, idsResultToBcfTopics } from '../../lib/ids/ids-report'
import { exportBcfZip } from '../../lib/bcf'
import { downloadBlob } from '../../lib/diffStore'
import { trackIdsExport } from '../../lib/analytics'
import { toast } from '../../stores/toastStore'
import { SCORE_COLOR } from '../ids/score'
import { FacetChip, FACET_KINDS } from '../ids/FacetChip'
import { localizeReasons } from '../ids/reasons'
import * as Icons from '../Icons'
import { MobileSheet } from './MobileSheet'
import { MobileActionSheet, type SheetAction } from './MobileActionSheet'
import {
  SheetHeaderBar, ScoreHero, StatPill, PrimaryCTA, SecondaryButton,
  Chip, MobileSearch, MobileEmpty, Strip,
} from './mobileUi'
import type { ViewerAPI } from '../../lib/viewer'
import type { IdsSpecResult } from '../../lib/ids/ids-types'

interface Props {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  onOpenLoader: () => void
}

export default function IdsPanelMobile({ viewerApiRef, onOpenLoader }: Props) {
  const { t } = useTranslation('ids')
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
  const setPanelOpen = useIdsStore((s) => s.setPanelOpen)
  const setFilters = useIdsStore((s) => s.setFilters)

  const modelId = activeModelId ?? models[0]?.id ?? null
  const result = useIdsStore((s) => (modelId ? s.resultsByModel[modelId] ?? null : null))
  const prevResult = useIdsStore((s) => (modelId ? s.previousResultByModel[modelId] ?? null : null))
  const runMeta = useIdsStore((s) => (modelId ? s.runMetaByModel[modelId] ?? null : null))
  const modelName = useMemo(() => models.find((m) => m.id === modelId)?.fileName ?? null, [models, modelId])
  const hasBuffer = useMemo(() => (modelId ? !!modelRegistry.getBuffer(modelId) : false), [modelId, models])
  const busy = status === 'running' || status === 'cancelling'

  const { run, runAll, cancel, toggleHighlight } = useIdsRun()

  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [isolated, setIsolated] = useState(false)
  const [diffDismissed, setDiffDismissed] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)

  const diff = useMemo(
    () => (result && prevResult ? diffIdsResults(prevResult, result) : null),
    [result, prevResult],
  )
  useEffect(() => { setDiffDismissed(false) }, [result])

  const specFacets = useMemo(() => {
    if (!result || !doc || doc.specifications.length !== result.specs.length) return null
    if (runMeta && fileName && runMeta.idsFileName !== fileName) return null
    return doc.specifications.map((s) => [...new Set(s.requirements.map((r) => r.facet.kind as string))])
  }, [result, doc, runMeta, fileName])

  const stale = !!(result && runMeta && fileName && runMeta.idsFileName !== fileName)

  const failures = useMemo(
    () => (result && modelId
      ? result.specs.flatMap((s) => s.failures.filter((f) => f.expressId >= 0).map((f) => ({ expressId: f.expressId, modelId })))
      : []),
    [result, modelId],
  )

  // Visible specs (mirror of IdsPanel buildRows spec branch).
  const q = filters.search.trim().toLowerCase()
  const matches = useCallback((s: string | null | undefined): boolean => !q || (s ?? '').toLowerCase().includes(q), [q])
  const visibleSpecs = useMemo(() => {
    if (!result) return []
    return result.specs
      .map((spec, i) => ({ spec, i }))
      .filter(({ spec }) => filters.statusTab === 'all' || spec.status === filters.statusTab)
      .filter(({ i }) => filters.facetKinds.length === 0 || (specFacets?.[i] ?? []).some((k) => filters.facetKinds.includes(k)))
      .filter(({ spec }) => matches(spec.name) || spec.failures.some((f) => matches(f.name) || matches(f.ifcClass)))
  }, [result, filters.statusTab, filters.facetKinds, specFacets, matches])

  const toggleSpec = useCallback((i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }, [])

  const selectIn3D = useCallback((expressId: number) => {
    viewerApiRef.current?.selectElement(expressId, modelId ?? undefined)
    viewerApiRef.current?.focusElement(expressId, modelId ?? undefined)
    setPanelOpen(false)
  }, [viewerApiRef, modelId, setPanelOpen])

  const toggleIsolate = useCallback(() => {
    const next = !isolated
    setIsolated(next)
    viewerApiRef.current?.isolateElements(failures, next)
  }, [isolated, failures, viewerApiRef])

  const doExport = useCallback((format: 'json' | 'csv' | 'html' | 'bcf') => {
    if (!result) return
    try {
      let blob: Blob
      let ext: string = format
      if (format === 'json') blob = new Blob([toIdsJson(result, { idsFile: fileName, modelFile: modelName })], { type: 'application/json' })
      else if (format === 'csv') blob = new Blob([toIdsCsv(result)], { type: 'text/csv' })
      else if (format === 'html') blob = new Blob([toIdsHtml(result, { idsFile: fileName, modelFile: modelName })], { type: 'text/html' })
      else {
        const topics = idsResultToBcfTopics(result, viewerApiRef.current?.takeSnapshot?.() || undefined)
        blob = new Blob([exportBcfZip(topics, '2.1')], { type: 'application/octet-stream' })
        ext = 'bcfzip'
      }
      const stem = (fileName ?? 'ids').replace(/\.[^.]+$/, '')
      void downloadBlob(blob, `${stem}-ids.${ext}`)
      trackIdsExport({ format })
      toast(t('export.done'), 'success')
    } catch {
      toast(t('errors.checkFailed'), 'error')
    }
  }, [result, fileName, modelName, viewerApiRef, t])

  const hasFailures = !!result?.specs.some((s) => s.status === 'fail' && s.failures.length > 0)

  const overflowActions = useMemo<SheetAction[]>(() => {
    const list: SheetAction[] = [
      {
        key: 'highlight', label: t('actions.highlight'), tone: highlightMode ? 'accent' : 'default',
        desc: t('actions.highlightTitle'), disabled: failures.length === 0,
        icon: <Icons.Shield size={17} />, onClick: toggleHighlight,
      },
      {
        key: 'isolate', label: isolated ? t('actions.showAll') : t('actions.isolate'), tone: isolated ? 'accent' : 'default',
        desc: t('actions.isolateTitle'), disabled: failures.length === 0 && !isolated,
        icon: <Icons.Isolate size={17} />, onClick: toggleIsolate,
      },
    ]
    if (result) {
      list.push(
        { key: 'json', label: t('export.json'), desc: t('export.jsonDesc'), onClick: () => doExport('json') },
        { key: 'csv', label: t('export.csv'), desc: t('export.csvDesc'), onClick: () => doExport('csv') },
        { key: 'html', label: t('export.html'), desc: t('export.htmlDesc'), onClick: () => doExport('html') },
        { key: 'bcf', label: t('export.bcf'), desc: hasFailures ? t('export.bcfDesc') : t('export.bcfEmpty'), disabled: !hasFailures, onClick: () => doExport('bcf') },
      )
    }
    return list
  }, [t, highlightMode, isolated, failures.length, result, hasFailures, toggleHighlight, toggleIsolate, doExport])

  const close = useCallback(() => setPanelOpen(false), [setPanelOpen])

  const scoreBadge = result ? (
    <span className="font-mono font-bold text-[15px] tabular-nums" style={{ color: SCORE_COLOR(result.score) }}>{result.score}</span>
  ) : null

  return (
    <>
      <MobileSheet open={panelOpen} onClose={close} label={t('title')}>
        <SheetHeaderBar
          icon={<Icons.Shield size={15} />}
          title={t('title')}
          badge={scoreBadge}
          onOverflow={result || failures.length ? () => setActionsOpen(true) : undefined}
          onClose={close}
        />

        <div className="flex-1 overflow-y-auto scroll-contain overscroll-contain"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>

          {/* Hero / summary */}
          {result ? (
            <ScoreHero
              score={result.score}
              color={SCORE_COLOR(result.score)}
              grade={fileName ?? undefined}
              subtitle={modelName ? t('summary.checkedModel') + ' · ' + modelName : undefined}
              stats={
                <>
                  <StatPill value={result.passedSpecs} label={t('summary.passLabel')} color="var(--ok)" />
                  <StatPill value={result.failedSpecs} label={t('summary.failLabel')} color="var(--danger)" />
                  {result.naSpecs > 0 && <StatPill value={result.naSpecs} label={t('summary.naLabel')} color="var(--text-faint)" />}
                </>
              }
            />
          ) : (
            <div className="px-4 pt-3">
              <div className="text-[13px] text-[var(--text-dim)] leading-relaxed">
                {doc ? t('states.noResultGeneric') : t('states.noIds')}
              </div>
            </div>
          )}

          {/* Run controls */}
          <div className="px-4 pt-1 pb-3 flex flex-col gap-2">
            {busy ? (
              <SecondaryButton onClick={cancel} disabled={status === 'cancelling'}>
                {status === 'cancelling' ? t('run.cancelling') : t('run.cancel')}
              </SecondaryButton>
            ) : !doc ? (
              <PrimaryCTA onClick={onOpenLoader}>{t('loader.choose')}</PrimaryCTA>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <PrimaryCTA onClick={() => void run()} disabled={!hasBuffer}>
                    {result ? t('run.rerun') : t('run.run')}
                  </PrimaryCTA>
                </div>
                {models.length > 1 && (
                  <SecondaryButton onClick={() => void runAll()}>{t('actions.checkAll', { count: models.length })}</SecondaryButton>
                )}
              </div>
            )}
            {!hasBuffer && doc && modelId && !busy && (
              <span className="text-[11px]" style={{ color: 'var(--warn)' }}>{t('states.bufferUnavailable')}</span>
            )}
          </div>

          {/* Progress */}
          {busy && (
            <div className="px-4 pb-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] text-[var(--text-faint)]">{t(`progress.${progressPhase ?? 'open'}`)}</span>
                <span className="text-[11px] font-mono text-[var(--text-faint)]">{Math.round(progress)}%</span>
              </div>
              <div className="h-1 bg-[var(--surface-2)] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-150" style={{ width: `${Math.max(2, progress)}%` }} />
              </div>
            </div>
          )}

          {/* Strips */}
          <div className="px-4 flex flex-col gap-2 empty:hidden">
            {stale && runMeta && (
              <Strip tone="warn">{t('states.staleIds', { file: runMeta.idsFileName })}</Strip>
            )}
            {status === 'error' && error && (
              <Strip tone="danger" action={{ label: t('run.retry'), onClick: () => void run() }}>{error.message}</Strip>
            )}
            {diff && !diff.unchanged && !diffDismissed && !busy && (
              <Strip
                tone={diff.scoreDelta > 0 ? 'ok' : diff.scoreDelta < 0 ? 'danger' : 'info'}
                onDismiss={() => setDiffDismissed(true)}
              >
                {diff.scoreDelta > 0
                  ? t('diff.scoreUp', { prev: diff.prevScore, curr: diff.currScore, delta: diff.scoreDelta })
                  : diff.scoreDelta < 0
                    ? t('diff.scoreDown', { prev: diff.prevScore, curr: diff.currScore, delta: diff.scoreDelta })
                    : t('diff.scoreSame', { curr: diff.currScore })}
                {diff.resolved > 0 ? ` · ${t('diff.resolved', { count: diff.resolved })}` : ''}
                {diff.added > 0 ? ` · ${t('diff.added', { count: diff.added })}` : ''}
              </Strip>
            )}
            {multiRun && (
              <Strip tone="info">{t('multiRun.progress', { done: multiRun.done, total: multiRun.total })}</Strip>
            )}
          </div>

          {/* Filters */}
          {result && (
            <div className="px-4 pt-3 pb-1 flex flex-col gap-2.5">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
                <Chip active={filters.statusTab === 'all'} onClick={() => setFilters({ statusTab: 'all' })}>{t('filters.all')}</Chip>
                <Chip active={filters.statusTab === 'pass'} color="var(--ok)" onClick={() => setFilters({ statusTab: filters.statusTab === 'pass' ? 'all' : 'pass' })}>{t('summary.pass', { count: result.passedSpecs })}</Chip>
                <Chip active={filters.statusTab === 'fail'} color="var(--danger)" onClick={() => setFilters({ statusTab: filters.statusTab === 'fail' ? 'all' : 'fail' })}>{t('summary.fail', { count: result.failedSpecs })}</Chip>
                {result.naSpecs > 0 && (
                  <Chip active={filters.statusTab === 'na'} color="var(--text-faint)" onClick={() => setFilters({ statusTab: filters.statusTab === 'na' ? 'all' : 'na' })}>{t('summary.na', { count: result.naSpecs })}</Chip>
                )}
              </div>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
                {FACET_KINDS.map((k) => (
                  <button key={k} onClick={() => setFilters({
                    facetKinds: filters.facetKinds.includes(k) ? filters.facetKinds.filter((x) => x !== k) : [...filters.facetKinds, k],
                  })} className="shrink-0">
                    <FacetChip kind={k} active={filters.facetKinds.includes(k)} />
                  </button>
                ))}
              </div>
              <MobileSearch value={filters.search} onChange={(v) => setFilters({ search: v })} placeholder={t('filters.search')} />
            </div>
          )}

          {/* Spec cards */}
          {result && (
            <div className="px-4 pt-2 flex flex-col gap-2.5">
              {visibleSpecs.length === 0 ? (
                <MobileEmpty
                  text={t('states.noMatch')}
                  action={{ label: t('filters.clear'), onClick: () => setFilters({ search: '', statusTab: 'all', facetKinds: [] }) }}
                />
              ) : (
                visibleSpecs.map(({ spec, i }) => (
                  <SpecCard
                    key={i}
                    spec={spec}
                    facets={specFacets?.[i] ?? []}
                    open={expanded.has(i)}
                    onToggle={() => toggleSpec(i)}
                    onSelect={selectIn3D}
                    matches={matches}
                  />
                ))
              )}
            </div>
          )}

          {/* No IDS loaded at all */}
          {!result && !doc && !busy && (
            <MobileEmpty
              icon={<Icons.Shield size={30} />}
              text={t('states.noIds')}
              action={{ label: t('loader.choose'), onClick: onOpenLoader }}
            />
          )}
        </div>
      </MobileSheet>

      <MobileActionSheet
        open={actionsOpen}
        title={t('title')}
        actions={overflowActions}
        onClose={() => setActionsOpen(false)}
      />
    </>
  )
}

// ── Spec card ─────────────────────────────────────────────────────────────────

function SpecCard({
  spec, facets, open, onToggle, onSelect, matches,
}: {
  spec: IdsSpecResult
  facets: string[]
  open: boolean
  onToggle: () => void
  onSelect: (expressId: number) => void
  matches: (s: string | null | undefined) => boolean
}) {
  const { t } = useTranslation('ids')
  const color = spec.status === 'pass' ? 'var(--ok)' : spec.status === 'fail' ? 'var(--danger)' : 'var(--text-faint)'
  const icon = spec.status === 'pass' ? '✓' : spec.status === 'fail' ? '✗' : '–'
  const fraction = spec.status === 'na'
    ? (spec.skippedReason === 'ifcVersion' ? t('status.skipped') : t('status.na'))
    : t('status.fraction', { passed: spec.passedCount, applicable: spec.applicableCount })
  const expandable = spec.failures.length > 0 || !!spec.description
  const visFailures = matches(spec.name) ? spec.failures : spec.failures.filter((f) => matches(f.name) || matches(f.ifcClass))

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderLeft: `3px solid ${color}` }}
    >
      <button
        onClick={expandable ? onToggle : undefined}
        className="w-full flex items-start gap-2.5 px-3.5 py-3 text-left active:bg-[rgba(255,255,255,0.03)]"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <span className="font-mono text-[15px] leading-none mt-0.5 shrink-0" style={{ color }}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-medium text-[var(--text)] leading-snug">{spec.name}</span>
          <span className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[11px] font-mono" style={{ color }}>{fraction}</span>
            {facets.map((k) => <FacetChip key={k} kind={k} />)}
          </span>
        </span>
        {expandable && (
          <Icons.Chevron size={14} className={`text-[var(--text-faint)] shrink-0 mt-1 transition-transform ${open ? 'rotate-90' : ''}`} />
        )}
      </button>

      {open && (
        <div className="px-3.5 pb-3 flex flex-col gap-2">
          {spec.description && (
            <p className="text-[11.5px] text-[var(--text-faint)] leading-relaxed m-0">{spec.description}</p>
          )}
          {visFailures.map((f) => (
            <button
              key={`${f.expressId}:${f.name}`}
              onClick={() => f.expressId >= 0 && onSelect(f.expressId)}
              className="w-full text-left rounded-xl px-3 py-2.5 active:scale-[0.99] transition-transform"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', WebkitTapHighlightColor: 'transparent' }}
            >
              <span className="flex items-center gap-2">
                <span className="text-[12.5px] text-[var(--text)] font-medium truncate">{f.name || `#${f.expressId}`}</span>
                <span className="text-[10px] font-mono text-[var(--text-faint)] shrink-0 ml-auto">{f.ifcClass}{f.expressId >= 0 ? ` #${f.expressId}` : ''}</span>
              </span>
              <span className="block text-[11px] leading-snug mt-1" style={{ color: 'var(--danger)' }}>{localizeReasons(t, f.reasons)}</span>
            </button>
          ))}
          {spec.failedCount > spec.failures.length && (
            <p className="text-[10.5px] text-[var(--text-faint)] italic m-0 px-1">{t('truncation', { count: spec.failedCount - spec.failures.length })}</p>
          )}
        </div>
      )}
    </div>
  )
}
