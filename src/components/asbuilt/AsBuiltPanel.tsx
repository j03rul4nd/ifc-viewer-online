// ─── As-Built panel (T-405) ───────────────────────────────────────────────────
// Lazy chunk. One stepper: scan → align (point pairs) → tolerance → run →
// results. Design: docs/AS_BUILT_PHASE3_DESIGN.md §4. Colouring/isolating and
// CSV (T-406) go through the viewer's own paint/isolate APIs and are undone
// on Clear, on a new run and when the panel closes.
//
// Memory: the cloud sample and element triangles are transferred to the
// worker (we keep no copy); the worker is terminated on result/abort. Pair
// markers live only while picking (the controller disposes them on stop).

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import * as THREE from 'three'
import type { ViewerAPI } from '../../lib/viewer'
import { useAsBuiltStore, completePairs } from '../../stores/asBuiltStore'
import {
  MIN_SCORING_PAIRS, effectiveTolerance, suspiciousPairs,
  type FitError,
} from '../../lib/asbuilt/rigid-fit'
import { createPairController, modelPickerFrom, type PairController } from '../../lib/asbuilt/pair-controller'
import { MAX_CLOUD_POINTS, chunkCloud, trianglesToElements } from '../../lib/asbuilt/build-input'
import { runAsBuiltInWorker } from '../../lib/asbuilt/asbuilt-client'
import { collectItemTriangles, type ItemGeometrySource } from '../../lib/scene/item-triangles'
import type { AsBuiltPipelineResult } from '../../lib/asbuilt/pipeline'
import type { ElementDeviation, ElementState } from '../../lib/asbuilt/as-built-score'
import type { ScoringGateState } from '../../stores/asBuiltStore'
import { asBuiltCsv } from '../../lib/asbuilt/results-csv'
import { asBuiltIsolateTargets, asBuiltPaintPlan, createAsBuiltView, type AsBuiltView } from '../../lib/asbuilt/results-colors'
import { downloadFile } from '../../lib/share-file'
import { Group, Hint, Note, PrimaryButton, Segmented, SmallButton, Stat, RowIcon } from '../pointcloud/pc-ui'

// ── Pure helpers (tested) ─────────────────────────────────────────────────────

export type RunBlock =
  | { kind: 'need-pairs'; have: number; need: number }
  | { kind: 'degenerate' }
  | { kind: 'too-few-pairs-to-score' }
  | { kind: 'alignment-too-coarse'; rmseMm: number; tolMm: number }

/** Why Run is disabled, or null when it may run. */
export function runBlock(o: {
  completePairs: number; fitError: FitError | null; gate: ScoringGateState | null
  alignmentRmseM: number | null; declaredMm: number
}): RunBlock | null {
  if (o.fitError) return { kind: 'degenerate' }
  if (!o.gate) return { kind: 'need-pairs', have: o.completePairs, need: MIN_SCORING_PAIRS }
  if (o.gate.ok) return null
  if (o.gate.reason === 'too-few-pairs-to-score') return { kind: 'too-few-pairs-to-score' }
  return { kind: 'alignment-too-coarse', rmseMm: (o.alignmentRmseM ?? 0) * 1000, tolMm: o.declaredMm }
}

export function describeBlock(b: RunBlock, t: TFunction<'pointcloud'>): string {
  switch (b.kind) {
    case 'need-pairs': return t('asBuilt.block.needPairs', { have: b.have, need: b.need })
    case 'degenerate': return t('asBuilt.block.degenerate')
    case 'too-few-pairs-to-score': return t('asBuilt.block.tooFewToScore', { need: MIN_SCORING_PAIRS })
    case 'alignment-too-coarse': return t('asBuilt.block.tooCoarse', { rmse: b.rmseMm.toFixed(1), tol: b.tolMm.toFixed(0) })
  }
}

const STATE_RANK: Record<ElementState, number> = { missing: 0, deviated: 1, conforming: 2, occluded: 3, unobserved: 4 }

/** Worst first: missing, deviated, conforming (each by p95 desc), then occluded, unobserved. */
export function sortWorstFirst(rows: readonly ElementDeviation[]): ElementDeviation[] {
  return rows.slice().sort((a, b) =>
    STATE_RANK[a.state] - STATE_RANK[b.state]
    || (b.deviationP95 ?? -1) - (a.deviationP95 ?? -1)
    || a.id - b.id)
}

/** Shown rows cap: the table is a triage list, not the model. */
export const MAX_ROWS = 200

export interface ElementLabel { name?: string; globalId?: string }

// ── Presentational results (tested via static markup) ────────────────────────

export function AsBuiltResults({ result, labels, onRowClick }: {
  result: AsBuiltPipelineResult
  labels: ReadonlyMap<number, ElementLabel>
  onRowClick?: (id: number) => void
}) {
  const { t } = useTranslation('pointcloud')
  const rows = useMemo(() => sortWorstFirst(result.elements).slice(0, MAX_ROWS), [result])
  const coverage = `${Math.round(result.coverage.observedFraction * 100)} %`
  return (
    <div className="flex flex-col gap-2" data-testid="asbuilt-results">
      {result.score === null
        ? <Note tone="warn"><span data-testid="asbuilt-refusal">{t(`asBuilt.result.inconclusive.${result.inconclusiveReason ?? 'nothing-scoreable'}` as never)}</span></Note>
        : null}
      <div className="grid grid-cols-2 gap-1.5">
        {result.score !== null && <Stat label={t('asBuilt.result.score')} value={String(Math.round(result.score))} />}
        <Stat label={t('asBuilt.result.coverage')} value={coverage} />
      </div>
      <div className="max-h-[320px] overflow-auto rounded-[10px] border border-[var(--border)]">
        <table className="w-full text-[11.5px]">
          <thead className="text-[var(--text-faint)] text-left">
            <tr>
              <th className="px-2 py-1 font-medium">{t('asBuilt.result.col.element')}</th>
              <th className="px-2 py-1 font-medium">{t('asBuilt.result.col.state')}</th>
              <th className="px-2 py-1 font-medium text-right">{t('asBuilt.result.col.p95')}</th>
              <th className="px-2 py-1 font-medium text-right">{t('asBuilt.result.col.matched')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const l = labels.get(r.id)
              return (
                <tr key={r.id} data-testid="asbuilt-row" data-state={r.state}
                  onClick={() => onRowClick?.(r.id)}
                  className="cursor-pointer border-t border-[var(--border)] hover:bg-[var(--surface-2)]">
                  <td className="px-2 py-1.5 text-[var(--text)]">
                    <div className="truncate max-w-[150px]">{l?.name || `${r.ifcClass} #${r.id}`}</div>
                    {l?.globalId && <div className="font-mono text-[10px] text-[var(--text-faint)] truncate max-w-[150px]">{l.globalId}</div>}
                  </td>
                  <td className="px-2 py-1.5 text-[var(--text-dim)]">{t(`asBuilt.state.${r.state}` as never)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{r.deviationP95 === null ? '—' : (r.deviationP95 * 1000).toFixed(0)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{Math.round(r.matchedFraction * 100)} %</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {result.elements.length > rows.length && <Hint>{t('asBuilt.result.more', { shown: rows.length, total: result.elements.length })}</Hint>}
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

type Stage = 'model' | 'cloud' | 'score'
const SKIP = /^IFC(SPACE|OPENINGELEMENT|ANNOTATION|GRID|GRIDAXIS|SITE|VIRTUALELEMENT)$/
const tick = () => new Promise<void>((r) => setTimeout(r, 0))
const isAbort = (e: unknown) => (e as { name?: string })?.name === 'AbortError'

interface ItemsDataSource {
  getItemsData?(ids: number[], cfg: Record<string, unknown>): Promise<Array<Record<string, unknown>>>
}

async function readLabels(model: ItemsDataSource, ids: number[]): Promise<Map<number, ElementLabel>> {
  const out = new Map<number, ElementLabel>()
  if (!model.getItemsData || ids.length === 0) return out
  try {
    const data = await model.getItemsData(ids, { attributesDefault: false, attributes: ['Name', 'GlobalId'], relationsDefault: { attributes: false, relations: false } })
    const val = (v: unknown) => { const x = (v as { value?: unknown } | undefined)?.value; return x == null ? undefined : String(x) }
    data.forEach((d, i) => out.set(ids[i], { name: val(d?.Name), globalId: val(d?.GlobalId) }))
  } catch { /* labels are a nicety: fall back to class + id */ }
  return out
}

export default function AsBuiltPanel({ viewerApiRef, modelId, clouds }: {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  modelId: string
  clouds: ReadonlyArray<{ id: string; name: string }>
}) {
  const { t } = useTranslation('pointcloud')
  const s = useAsBuiltStore()
  const [stage, setStage] = useState<Stage | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [labels, setLabels] = useState<Map<number, ElementLabel>>(new Map())
  const [resultModelId, setResultModelId] = useState<string | null>(null)
  const controllerRef = useRef<PairController | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const viewRef = useRef<AsBuiltView | null>(null)
  const [tolUsedM, setTolUsedM] = useState<number | null>(null)
  const [, setViewTick] = useState(0)

  // Default to the first ready scan; drop a cloud that went away.
  useEffect(() => {
    if (!s.cloudId || !clouds.some((c) => c.id === s.cloudId)) s.setCloudId(clouds[0]?.id ?? null)
  }, [clouds, s])

  // Leaving the panel: stop picking (disposes markers) and cancel a run.
  useEffect(() => () => {
    controllerRef.current?.stop()
    controllerRef.current = null
    abortRef.current?.abort()
    viewRef.current?.clear()
    viewRef.current = null
  }, [])

  const controller = (): PairController | null => {
    if (controllerRef.current) return controllerRef.current
    const viewer = viewerApiRef.current
    const canvas = viewer?.getCanvas()
    if (!viewer || !canvas) return null
    const picker = viewer.getScenePicker()
    controllerRef.current = createPairController({
      target: canvas,
      scene: viewer.drawingHost().scene,
      pickModel: modelPickerFrom(picker),
      pickCloud: (x, y) => {
        const hit = viewer.peekPointClouds()?.pickPoint(x, y)
        if (!hit || hit.cloudId !== useAsBuiltStore.getState().cloudId) return null
        return [hit.position.x, hit.position.y, hit.position.z]
      },
    })
    return controllerRef.current
  }

  const picking = s.phase === 'picking-model' || s.phase === 'picking-cloud'
  const running = s.phase === 'running'
  const nComplete = completePairs(s.pairs).length
  const suspicious = s.fit ? new Set(suspiciousPairs(s.fit.residualsM, s.fit.fitRmseM)) : new Set<number>()
  const block = runBlock({ completePairs: nComplete, fitError: s.fitError, gate: s.gate, alignmentRmseM: s.fit?.alignmentRmseM ?? null, declaredMm: s.declaredMm })
  const tauMm = s.fit
    ? effectiveTolerance({ declaredM: s.declaredMm / 1000, measurementM: s.precisionMm / 1000, alignmentRmseM: s.fit.alignmentRmseM }) * 1000
    : null
  const result = s.phase === 'done' ? (s.result as AsBuiltPipelineResult | null) : null

  const togglePicking = (): void => {
    const c = controller()
    if (!c) return
    if (c.active) c.stop()
    else c.start()
  }

  const apply = (): void => {
    const r = controller()?.apply()
    if (!r) return
    setMessage(r.ok ? t('asBuilt.fit.applied') : r.reason === 'tilt-out-of-range' ? t('asBuilt.fit.tiltOut') : t('asBuilt.fit.applyFailed'))
  }

  const run = async (): Promise<void> => {
    const viewer = viewerApiRef.current
    const st = useAsBuiltStore.getState()
    if (!viewer || !st.fit || !st.cloudId || block) return
    controllerRef.current?.stop()
    viewRef.current?.clear()
    const ac = new AbortController()
    abortRef.current = ac
    setMessage(null)
    st.setResult(null)
    st.setPhase('running')
    try {
      setStage('model')
      const model = viewer.getFragmentsModel(modelId) as (ItemGeometrySource & ItemsDataSource) | null
      const obj = viewer.getModelObject(modelId)
      if (!model || !obj) throw Object.assign(new Error('no model'), { key: 'asBuilt.run.noModel' })
      const classes = new Map<number, string>()
      const soups = await collectItemTriangles(model, {
        skip: SKIP,
        bucket: (category, localId) => { classes.set(localId, category); return String(localId) },
      })
      if (ac.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      // Model space -> world, in place (the soups are our own copy).
      obj.updateWorldMatrix(true, false)
      const m = obj.matrixWorld
      const v = new THREE.Vector3()
      let n = 0
      for (const chunks of soups.values()) {
        if (++n % 200 === 0) { await tick(); if (ac.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' }) }
        for (const c of chunks) for (let i = 0; i + 2 < c.length; i += 3) {
          v.set(c[i], c[i + 1], c[i + 2]).applyMatrix4(m)
          c[i] = v.x; c[i + 1] = v.y; c[i + 2] = v.z
        }
      }
      const elements = await trianglesToElements(soups, { modelId, classOf: (id) => classes.get(id) })
      soups.clear()
      if (elements.length === 0) throw Object.assign(new Error('no geometry'), { key: 'asBuilt.run.noModel' })

      setStage('cloud')
      await tick()
      const sample = viewer.peekPointClouds()?.samplePoints(st.cloudId, MAX_CLOUD_POINTS)
      if (!sample || sample.positions.length === 0) throw Object.assign(new Error('no cloud'), { key: 'asBuilt.run.noCloud' })
      const cloud = chunkCloud(sample.positions)

      setStage('score')
      const s2 = useAsBuiltStore.getState()
      const fit = s2.fit!
      const toleranceM = effectiveTolerance({ declaredM: s2.declaredMm / 1000, measurementM: s2.precisionMm / 1000, alignmentRmseM: fit.alignmentRmseM })
      const res = await runAsBuiltInWorker({
        elements,
        cloud,
        toleranceM,
        alignmentRmseM: fit.alignmentRmseM,
      }, { signal: ac.signal })
      const worst = sortWorstFirst(res.elements).slice(0, MAX_ROWS).map((e) => e.id)
      setLabels(await readLabels(model, worst))
      setResultModelId(modelId)
      setTolUsedM(toleranceM)
      useAsBuiltStore.getState().setResult(res)
      useAsBuiltStore.getState().setPhase('done')
    } catch (e) {
      if (isAbort(e)) { useAsBuiltStore.getState().setPhase('idle') }
      else {
        const key = (e as { key?: string }).key ?? 'asBuilt.run.failed'
        setMessage(t(key as never))
        useAsBuiltStore.getState().setPhase('error')
      }
    } finally {
      setStage(null)
      if (abortRef.current === ac) abortRef.current = null
    }
  }

  const onRow = (id: number): void => {
    const viewer = viewerApiRef.current
    const mid = resultModelId ?? modelId
    viewer?.selectElement(id, mid)
    viewer?.focusElement(id, mid)
  }

  const view = (): AsBuiltView | null => {
    const viewer = viewerApiRef.current
    if (!viewer) return null
    if (!viewRef.current) viewRef.current = createAsBuiltView(viewer)
    return viewRef.current
  }
  const colourByState = (): void => {
    if (!result) return
    view()?.paint(asBuiltPaintPlan(resultModelId ?? modelId, result.elements, tolUsedM))
    setViewTick((n) => n + 1)
  }
  const isolateProblems = (): void => {
    if (!result) return
    view()?.isolate(asBuiltIsolateTargets(resultModelId ?? modelId, result.elements))
    setViewTick((n) => n + 1)
  }
  const clearView = (): void => { viewRef.current?.clear(); setViewTick((n) => n + 1) }
  const downloadCsv = async (): Promise<void> => {
    if (!result) return
    const mid = resultModelId ?? modelId
    const model = viewerApiRef.current?.getFragmentsModel(mid) as ItemsDataSource | null | undefined
    const rows = sortWorstFirst(result.elements)
    const all = model ? await readLabels(model, rows.map((r) => r.id)) : labels
    downloadFile(new Blob([asBuiltCsv(rows, all)], { type: 'text/csv;charset=utf-8' }), 'as-built-results.csv')
  }
  const viewActive = !!viewRef.current && (viewRef.current.painted || viewRef.current.isolated)

  return (
    <div className="flex flex-col gap-4" data-testid="asbuilt-panel">
      {clouds.length > 1 && (
        <Group title={t('asBuilt.step.cloud')}>
          <select value={s.cloudId ?? ''} onChange={(e) => s.setCloudId(e.target.value)} disabled={running}
            className="w-full px-2 py-2 max-md:min-h-[44px] rounded-[9px] border border-[var(--border-strong)] bg-[var(--surface)] text-[12.5px] text-[var(--text)]">
            {clouds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Group>
      )}

      <Group title={t('asBuilt.step.align')}>
        <Segmented stretch label={t('asBuilt.mode.label')} value={s.mode}
          onChange={(v) => s.setMode(v as '4dof' | '6dof')}
          options={[{ value: '4dof', label: t('asBuilt.mode.level') }, { value: '6dof', label: t('asBuilt.mode.free') }]} />
        <div className="flex gap-1.5">
          <SmallButton active={picking} disabled={running} onClick={togglePicking} testId="asbuilt-pick">
            {picking ? t('asBuilt.pairs.stop') : t('asBuilt.pairs.add')}
          </SmallButton>
        </div>
        <Hint>{s.phase === 'picking-cloud' ? t('asBuilt.pairs.pickCloud') : picking ? t('asBuilt.pairs.pickModel') : t('asBuilt.pairs.hint', { need: MIN_SCORING_PAIRS })}</Hint>
        {s.pairs.length > 0 && (
          <ul className="flex flex-col gap-1">
            {s.pairs.map((p, i) => {
              const r = s.fit?.residualsM[i]
              return (
                <li key={i} className="flex items-center gap-2 text-[12px] text-[var(--text-dim)]">
                  <span className="flex-1">{t('asBuilt.pairs.item', { n: i + 1 })}</span>
                  {suspicious.has(i) && <span className="text-[var(--warning)]">{t('asBuilt.pairs.suspicious')}</span>}
                  <span className="font-mono">{r === undefined ? (p.cloud ? '' : t('asBuilt.pairs.pending')) : `${(r * 1000).toFixed(1)} mm`}</span>
                  <RowIcon label={t('asBuilt.pairs.remove', { n: i + 1 })} danger onClick={() => s.removePair(i)}>
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 3l8 8M11 3l-8 8" /></svg>
                  </RowIcon>
                </li>
              )
            })}
          </ul>
        )}
        {s.fitError && <Note tone="warn">{t('asBuilt.block.degenerate')}</Note>}
        {s.fit && (
          <>
            <div className="grid grid-cols-2 gap-1.5" data-testid="asbuilt-fit">
              <Stat label={t('asBuilt.fit.rmse')} value={`${(s.fit.fitRmseM * 1000).toFixed(1)} mm`} />
              <Stat label={t('asBuilt.fit.loo')} value={s.fit.looRmseM === null ? '—' : `${(s.fit.looRmseM * 1000).toFixed(1)} mm`} />
            </div>
            <SmallButton disabled={running} onClick={apply} testId="asbuilt-apply">{t('asBuilt.fit.apply')}</SmallButton>
          </>
        )}
      </Group>

      <Group title={t('asBuilt.step.tolerance')}>
        <label className="flex items-center justify-between gap-3 text-[12.5px] text-[var(--text-dim)]">
          {t('asBuilt.tol.declared')}
          <input type="number" min={1} step={1} value={s.declaredMm} disabled={running}
            onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0) s.setDeclaredMm(v) }}
            className="w-20 px-2 py-1 max-md:min-h-[44px] rounded-[8px] border border-[var(--border-strong)] bg-[var(--surface)] text-right font-mono text-[var(--text)]" />
        </label>
        <label className="flex items-center justify-between gap-3 text-[12.5px] text-[var(--text-dim)]">
          {t('asBuilt.tol.precision')}
          <input type="number" min={0} step={1} value={s.precisionMm} disabled={running}
            onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) s.setPrecisionMm(v) }}
            className="w-20 px-2 py-1 max-md:min-h-[44px] rounded-[8px] border border-[var(--border-strong)] bg-[var(--surface)] text-right font-mono text-[var(--text)]" />
        </label>
        {tauMm !== null && <Stat label={t('asBuilt.fit.tau')} value={`${tauMm.toFixed(1)} mm`} />}
      </Group>

      <Group title={t('asBuilt.step.run')}>
        {running ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[12.5px] text-[var(--text-dim)]" role="status">{stage ? t(`asBuilt.run.stage.${stage}` as never) : ''}</span>
            <SmallButton onClick={() => abortRef.current?.abort()} testId="asbuilt-cancel">{t('asBuilt.run.cancel')}</SmallButton>
          </div>
        ) : (
          <PrimaryButton disabled={block !== null} onClick={() => { void run() }} testId="asbuilt-run">{t('asBuilt.run.start')}</PrimaryButton>
        )}
        {block && !running && <Hint><span data-testid="asbuilt-block">{describeBlock(block, t)}</span></Hint>}
        {message && <Note>{message}</Note>}
      </Group>

      {result && (
        <Group title={t('asBuilt.step.results')}>
          <div className="flex flex-wrap gap-1.5">
            <SmallButton onClick={colourByState} testId="asbuilt-colour">{t('asBuilt.view.colour')}</SmallButton>
            <SmallButton onClick={isolateProblems} testId="asbuilt-isolate">{t('asBuilt.view.isolate')}</SmallButton>
            <SmallButton disabled={!viewActive} onClick={clearView} testId="asbuilt-clear">{t('asBuilt.view.clear')}</SmallButton>
            <SmallButton onClick={() => { void downloadCsv() }} testId="asbuilt-csv">{t('asBuilt.view.csv')}</SmallButton>
          </div>
          <AsBuiltResults result={result} labels={labels} onRowClick={onRow} />
        </Group>
      )}
    </div>
  )
}
