// ─── IdsPanelMobile ──────────────────────────────────────────────────────────
// Dedicated touch-first IDS results experience (mobile < md). Rendered instead
// of the docked IdsPanel via an early return; the desktop panel is untouched.
// Near-standalone: re-subscribes to idsStore / sceneStore and drives runs through
// useIdsRun, so no logic is duplicated from the desktop component.
//
// UX (2026 rebuild): a resizable snap-point sheet (peek / half / full) that floats
// over the LIVE 3D scene — orbit the model at peek while the results hover. A
// self-sufficient loader (examples + native file pick) means IDS is reachable on
// a phone with no desktop-modal hop. Primary verbs live in a sticky thumb-zone
// footer with visible toggle state. Tapping a failure opens the swipe-to-review
// "issue reel" (IdsFailurePager) instead of dead-ending the session.

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useIdsStore } from '../../stores/idsStore'
import { useSceneStore } from '../../stores/sceneStore'
import { useIdsRun } from '../../hooks/useIdsRun'
import { modelRegistry } from '../../lib/model-registry'
import { diffIdsResults } from '../../lib/ids/ids-diff'
import { toIdsJson, toIdsCsv, toIdsHtml, idsResultToBcfTopics } from '../../lib/ids/ids-report'
import { exportBcfZip } from '../../lib/bcf'
import { downloadBlob } from '../../lib/diffStore'
import { parseIds, IdsParseError } from '../../lib/ids/ids-parser'
import { IDS_EXAMPLES, type IdsExample } from '../../lib/ids/ids-examples'
import { trackIdsExport, trackIdsFileLoaded } from '../../lib/analytics'
import { haptic } from '../../lib/haptics'
import { toast } from '../../stores/toastStore'
import { SCORE_COLOR } from '../ids/score'
import { FacetChip, FACET_KINDS } from '../ids/FacetChip'
import { localizeReasons, localizeRemediation } from '../ids/reasons'
import * as Icons from '../Icons'
import { MobileSheet } from './MobileSheet'
import { MobileActionSheet, type SheetAction } from './MobileActionSheet'
import IdsFailurePager, { type PagerFailure } from './IdsFailurePager'
import {
  SheetHeaderBar, ScoreHero, StatPill, PrimaryCTA, SecondaryButton,
  Chip, MobileSearch, MobileEmpty, Strip, SheetFooterBar, tint,
} from './mobileUi'
import type { ViewerAPI } from '../../lib/viewer'
import type { IdsSpecResult } from '../../lib/ids/ids-types'

interface Props {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  onOpenLoader: () => void
}

// Detent layout: peek (scene-first) / half (browse) / full (read).
const SNAP_POINTS = [0.16, 0.56, 0.92]
const PEEK = 0, HALF = 1, FULL = 2

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
  const setLoaded = useIdsStore((s) => s.setLoaded)
  const setError = useIdsStore((s) => s.setError)

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
  const [snapIdx, setSnapIdx] = useState(HALF)
  const [pagerOpen, setPagerOpen] = useState(false)
  const [pagerIndex, setPagerIndex] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const diff = useMemo(
    () => (result && prevResult ? diffIdsResults(prevResult, result) : null),
    [result, prevResult],
  )

  // Fresh result (re-run or model switch) → reset transient view state, close the
  // reel, and CLEAR any active scene isolation so the viewer never keeps hiding an
  // outdated failure set while the footer button reads inactive (state/scene sync).
  useEffect(() => {
    setDiffDismissed(false)
    setExpanded(new Set())
    setPagerOpen(false)
    setIsolated((wasIsolated) => {
      if (wasIsolated) viewerApiRef.current?.isolateElements([], false)
      return false
    })
  }, [result]) // eslint-disable-line react-hooks/exhaustive-deps

  // Run-completion feedback: reveal at half + a haptic tuned to the outcome.
  const prevStatus = useRef(status)
  useEffect(() => {
    if (prevStatus.current === 'running' && status === 'done') {
      setSnapIdx(HALF)
      haptic(result && result.score >= 70 ? 'success' : 'warning')
    }
    prevStatus.current = status
  }, [status, result])

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

  // Flat, ordered list of selectable failures — the reel's contents. Order mirrors
  // exactly how the SpecCards render below so pager index maps 1:1 to a tapped row.
  const pagerFailures = useMemo<PagerFailure[]>(() => {
    const out: PagerFailure[] = []
    for (const { spec } of visibleSpecs) {
      const vis = matches(spec.name) ? spec.failures : spec.failures.filter((f) => matches(f.name) || matches(f.ifcClass))
      for (const f of vis) {
        if (f.expressId >= 0) out.push({ expressId: f.expressId, name: f.name, ifcClass: f.ifcClass, globalId: f.globalId, specName: spec.name, reasons: f.reasons })
      }
    }
    return out
  }, [visibleSpecs, matches])

  const toggleSpec = useCallback((i: number) => {
    haptic('light')
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }, [])

  const openPager = useCallback((specName: string, f: { expressId: number; name: string }) => {
    const idx = pagerFailures.findIndex((pf) => pf.specName === specName && pf.expressId === f.expressId && pf.name === f.name)
    if (idx < 0) return
    haptic('light')
    setPagerIndex(idx)
    setPagerOpen(true) // the reel takes the full stage; sheet slides off (suspended)
  }, [pagerFailures])

  const closePager = useCallback(() => {
    setPagerOpen(false) // clears `suspended` → sheet slides back to its detent
  }, [])

  const toggleIsolate = useCallback(() => {
    const next = !isolated
    setIsolated(next)
    haptic('light')
    viewerApiRef.current?.isolateElements(failures, next)
    setSnapIdx(PEEK) // drop to peek so the isolate is actually visible
  }, [isolated, failures, viewerApiRef])

  const onToggleHighlight = useCallback(() => {
    haptic('light')
    toggleHighlight()
    setSnapIdx(PEEK) // reveal the overlay paint instead of toggling it blind
  }, [toggleHighlight])

  const loadFile = useCallback(async (file: File): Promise<void> => {
    try {
      const xml = await file.text()
      const parsed = parseIds(xml)
      setLoaded(file.name, parsed)
      const facetKinds = new Set<string>()
      for (const s of parsed.specifications) {
        for (const f of s.applicability) facetKinds.add(f.kind)
        for (const r of s.requirements) facetKinds.add(r.facet.kind)
      }
      trackIdsFileLoaded({ spec_count: parsed.specifications.length, facet_count: facetKinds.size })
      haptic('light')
    } catch (err) {
      const msg = err instanceof IdsParseError ? err.message : (err instanceof Error ? err.message : String(err))
      setError('parse', t('loader.parseError', { message: msg }))
      toast(t('loader.invalidFile', { message: msg }), 'error')
    }
  }, [setLoaded, setError, t])

  const loadExample = useCallback((ex: IdsExample): void => {
    try {
      const parsed = parseIds(ex.xml)
      setLoaded(ex.fileName, parsed)
      const facetKinds = new Set<string>()
      for (const s of parsed.specifications) {
        for (const f of s.applicability) facetKinds.add(f.kind)
        for (const r of s.requirements) facetKinds.add(r.facet.kind)
      }
      trackIdsFileLoaded({ spec_count: parsed.specifications.length, facet_count: facetKinds.size })
      haptic('light')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError('parse', t('loader.parseError', { message: msg }))
    }
  }, [setLoaded, setError, t])

  const pickFile = useCallback(() => fileInputRef.current?.click(), [])

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
    const list: SheetAction[] = []
    if (doc) {
      list.push({ key: 'load', label: t('loader.choose'), desc: fileName ?? undefined, icon: <Icons.Upload size={17} />, onClick: pickFile })
    }
    if (result) {
      list.push(
        { key: 'json', label: t('export.json'), desc: t('export.jsonDesc'), onClick: () => doExport('json') },
        { key: 'csv', label: t('export.csv'), desc: t('export.csvDesc'), onClick: () => doExport('csv') },
        { key: 'html', label: t('export.html'), desc: t('export.htmlDesc'), onClick: () => doExport('html') },
        { key: 'bcf', label: t('export.bcf'), desc: hasFailures ? t('export.bcfDesc') : t('export.bcfEmpty'), disabled: !hasFailures, onClick: () => doExport('bcf') },
      )
    }
    return list
  }, [t, doc, fileName, result, hasFailures, pickFile, doExport])

  const close = useCallback(() => setPanelOpen(false), [setPanelOpen])

  const scoreBadge = result ? (
    <span className="font-mono font-bold text-[15px] tabular-nums" style={{ color: SCORE_COLOR(result.score) }}>{result.score}</span>
  ) : null

  return (
    <>
      <MobileSheet
        open={panelOpen}
        onClose={close}
        label={t('title')}
        snapPoints={SNAP_POINTS}
        detentIndex={snapIdx}
        onDetentChange={setSnapIdx}
        suspended={pagerOpen}
      >
        <SheetHeaderBar
          icon={<Icons.Shield size={15} />}
          title={t('title')}
          badge={scoreBadge}
          onOverflow={overflowActions.length ? () => setActionsOpen(true) : undefined}
          onClose={close}
        />

        <div className="flex-1 overflow-y-auto scroll-contain overscroll-contain" style={{ paddingBottom: 8 }}>

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
          ) : doc ? (
            <div className="px-4 pt-3">
              <div className="text-[13px] text-[var(--text-dim)] leading-relaxed">{t('states.noResultGeneric')}</div>
            </div>
          ) : null}

          {/* Progress */}
          {busy && (
            <div className="px-4 pt-3 pb-1">
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
          <div className="px-4 pt-2 flex flex-col gap-2 empty:hidden">
            {stale && runMeta && (
              <Strip tone="warn">{t('states.staleIds', { file: runMeta.idsFileName })}</Strip>
            )}
            {result && (result.unreadableEntities ?? 0) > 0 && (
              <Strip tone="danger">{t('states.unreadableEntities', { count: result.unreadableEntities ?? 0 })}</Strip>
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
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4" style={{ scrollSnapType: 'x proximity' }}>
                <Chip active={filters.statusTab === 'all'} onClick={() => setFilters({ statusTab: 'all' })}>{t('filters.all')}</Chip>
                <Chip active={filters.statusTab === 'pass'} color="var(--ok)" onClick={() => setFilters({ statusTab: filters.statusTab === 'pass' ? 'all' : 'pass' })}>{t('summary.pass', { count: result.passedSpecs })}</Chip>
                <Chip active={filters.statusTab === 'fail'} color="var(--danger)" onClick={() => setFilters({ statusTab: filters.statusTab === 'fail' ? 'all' : 'fail' })}>{t('summary.fail', { count: result.failedSpecs })}</Chip>
                {result.naSpecs > 0 && (
                  <Chip active={filters.statusTab === 'na'} color="var(--text-faint)" onClick={() => setFilters({ statusTab: filters.statusTab === 'na' ? 'all' : 'na' })}>{t('summary.na', { count: result.naSpecs })}</Chip>
                )}
              </div>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
                {FACET_KINDS.map((k) => (
                  <button key={k} onClick={() => { haptic('tick'); setFilters({
                    facetKinds: filters.facetKinds.includes(k) ? filters.facetKinds.filter((x) => x !== k) : [...filters.facetKinds, k],
                  }) }} className="shrink-0 min-h-[38px] flex items-center">
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
                    onSelect={(f) => openPager(spec.name, f)}
                    matches={matches}
                  />
                ))
              )}
            </div>
          )}

          {/* No IDS loaded — self-sufficient loader (examples + file pick), no modal hop */}
          {!doc && !busy && (
            <div className="px-4 pt-3 flex flex-col gap-3">
              <MobileEmpty icon={<Icons.Shield size={30} />} text={t('states.noIds')} />
              <span className="text-[11px] text-[var(--text-faint)] px-0.5">{t('examples.label')}</span>
              <div className="flex flex-col gap-2">
                {IDS_EXAMPLES.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => loadExample(ex)}
                    className="w-full text-left rounded-2xl px-3.5 py-3 active:scale-[0.99] transition-transform"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', WebkitTapHighlightColor: 'transparent' }}
                  >
                    <span className="block text-[13.5px] font-medium text-[var(--text)]">{t(`examples.${ex.labelKey}Name` as 'examples.hasWallsName')}</span>
                    <span className="block text-[11.5px] text-[var(--text-faint)] leading-snug mt-0.5">{t(`examples.${ex.labelKey}Desc` as 'examples.hasWallsDesc')}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sticky thumb-zone footer: primary verbs + visible toggle state */}
        <SheetFooterBar>
          {busy ? (
            <SecondaryButton onClick={cancel} disabled={status === 'cancelling'}>
              {status === 'cancelling' ? t('run.cancelling') : t('run.cancel')}
            </SecondaryButton>
          ) : !doc ? (
            <PrimaryCTA onClick={pickFile}>{t('loader.choose')}</PrimaryCTA>
          ) : (
            <>
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
              {result && (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <ToggleButton active={highlightMode} disabled={failures.length === 0} onClick={onToggleHighlight} icon={<Icons.Shield size={15} />}>
                      {t('actions.highlight')}
                    </ToggleButton>
                  </div>
                  <div className="flex-1">
                    <ToggleButton active={isolated} disabled={failures.length === 0 && !isolated} onClick={toggleIsolate} icon={<Icons.Isolate size={15} />}>
                      {isolated ? t('actions.showAll') : t('actions.isolate')}
                    </ToggleButton>
                  </div>
                </div>
              )}
            </>
          )}
          {!hasBuffer && doc && modelId && !busy && (
            <span className="text-[11px] text-center" style={{ color: 'var(--warn)' }}>{t('states.bufferUnavailable')}</span>
          )}
        </SheetFooterBar>
      </MobileSheet>

      {/* Hidden native file input — mobile browsers pick .ids/.xml fine */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".ids,.xml,application/xml,text/xml"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = '' }}
      />

      <MobileActionSheet
        open={actionsOpen}
        title={t('title')}
        actions={overflowActions}
        onClose={() => setActionsOpen(false)}
      />

      <IdsFailurePager
        open={pagerOpen}
        failures={pagerFailures}
        index={pagerIndex}
        onIndexChange={setPagerIndex}
        modelId={modelId}
        viewerApiRef={viewerApiRef}
        onClose={closePager}
      />
    </>
  )
}

// ── Toggle button (visible on/off state, thumb-zone footer) ─────────────────────

function ToggleButton({
  active, disabled, onClick, icon, children,
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className="w-full h-12 rounded-xl flex items-center justify-center gap-2 text-[12.5px] font-semibold transition-all active:scale-[0.97] disabled:opacity-35"
      style={{
        background: active ? tint('var(--accent)', 16) : 'var(--surface-2)',
        color: active ? 'var(--accent-2)' : 'var(--text-dim)',
        border: `1px solid ${active ? tint('var(--accent)', 42) : 'var(--border)'}`,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {icon}
      {children}
    </button>
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
  onSelect: (f: { expressId: number; name: string }) => void
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
        aria-expanded={expandable ? open : undefined}
        className="w-full flex items-start gap-2.5 px-3.5 py-3 min-h-[52px] text-left active:bg-[rgba(255,255,255,0.03)]"
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
              onClick={() => f.expressId >= 0 && onSelect({ expressId: f.expressId, name: f.name })}
              className="w-full text-left rounded-xl px-3 py-2.5 min-h-[44px] active:scale-[0.99] transition-transform"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', WebkitTapHighlightColor: 'transparent' }}
            >
              <span className="flex items-center gap-2">
                <span className="text-[12.5px] text-[var(--text)] font-medium truncate">{f.name || `#${f.expressId}`}</span>
                <span className="text-[10px] font-mono text-[var(--text-faint)] shrink-0 ml-auto">{f.ifcClass}{f.expressId >= 0 ? ` #${f.expressId}` : ''}</span>
              </span>
              <span className="block text-[11px] leading-snug mt-1" style={{ color: 'var(--danger)' }}>{localizeReasons(t, f.reasons)}</span>
              {(() => { const fix = localizeRemediation(t, f.reasons); return fix
                ? <span className="block text-[10.5px] leading-snug mt-0.5 text-[var(--text-faint)]">{t('howToFix')}: {fix}</span> : null })()}
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
