// ─── ClashPanel ───────────────────────────────────────────────────────────────
// Clash detection (Pro) and coordination (Team). Everything runs here, in the
// browser: geometry from fragments, tests in a worker, decisions through a
// sync adapter (this browser, or the Team workspace when the cloud is on).
// Free plans see what it does and a way to the plans page; nothing that was
// free before is behind this.
//
// v2: ignore rules, matrix templates, order by estimated cost, trend across
// runs, a report with images, and a virtual list so 5,000+ results scroll
// without stalling the page (only the rows on screen are rendered).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ViewerAPI } from '../../lib/viewer'
import { ViewportPanel } from '../ViewportPanel'
import { useClashStore } from '../../stores/clashStore'
import { useSceneStore } from '../../stores/sceneStore'
import { useValidationStore } from '../../stores/validationStore'
import { useFederationStore, disciplineOf } from '../../stores/federationStore'
import { useCloudAccountStore } from '../../stores/cloudAccountStore'
import { useFeatureAccess } from '../../hooks/usePlan'
import { useClashT, type ClashTextKey } from '../../lib/clash/i18n'
import {
  ANY, defaultMatrix, groupClashes, newTestId, parseMatrix, reconcile, statusCounts,
  type ClashMatrix, type ClashResult, type ClashSelector, type ClashStatus, type ClashTestDef, type GroupBy,
} from '../../lib/clash/model'
import { runMatrix, type RunProgress } from '../../lib/clash/run'
import type { CollectModel } from '../../lib/clash/collect'
import { clashTitle, clashesToBcfTopics, coordinationReportHtml } from '../../lib/clash/export'
import { applySuppression, parseRuleList, type SuppressRule } from '../../lib/clash/suppress'
import { estimateCost, sortByCost, totalCost } from '../../lib/clash/cost'
import { TEMPLATE_IDS, templateMatrix, type TemplateId } from '../../lib/clash/templates'
import { trendPoint, trendPolyline } from '../../lib/clash/trend'
import { cloudSync, isClashCloudEnabled, localSync, projectKey } from '../../lib/clash/sync'
import { downloadBcfBlob } from '../../lib/bcf'
import * as THREE from 'three'

interface Props { viewerApiRef: React.MutableRefObject<ViewerAPI | null> }

const STATUS_COLOR: Record<ClashStatus, string> = {
  new: 'var(--danger, #d9534f)', active: 'var(--warning, #e0a030)', resolved: 'var(--success, #3a9a6a)', approved: 'var(--text-dim)',
}
const btn = 'h-7 max-md:h-9 px-2.5 rounded-[6px] border border-[var(--border)] text-[11px] max-md:text-[12.5px] font-medium text-[var(--text)] hover:border-[var(--border-strong)] disabled:opacity-40 transition-colors whitespace-nowrap'
const btnPrimary = 'h-7 max-md:h-9 px-3 rounded-[6px] text-[11px] max-md:text-[12.5px] font-semibold bg-[var(--accent)] text-[var(--accent-contrast,#fff)] disabled:opacity-40 whitespace-nowrap'
const input = 'h-7 max-md:h-9 px-2 rounded-[6px] border border-[var(--border-control)] bg-[var(--surface-2)] text-[11px] max-md:text-[12.5px] text-[var(--text)] min-w-0'
const chip = (on: boolean) => `h-6 max-md:h-8 px-2 rounded-full border text-[10.5px] max-md:text-[12px] transition-colors ${on ? 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border-strong)]' : 'text-[var(--text-dim)] border-[var(--border)] hover:text-[var(--text)]'}`
const ROW_H = 40
const HEAD_H = 30
const SHOTS = 10

type T = (key: ClashTextKey, vars?: Record<string, string | number>) => string

export default function ClashPanel({ viewerApiRef }: Props) {
  const { t, lang } = useClashT()
  const open = useClashStore((s) => s.open)
  const setOpen = useClashStore((s) => s.setOpen)
  const pro = useFeatureAccess('clash_detection').state === 'available'
  const team = useFeatureAccess('clash_coordination').state === 'available'
  const close = useCallback(() => {
    setOpen(false)
    try { viewerApiRef.current?.isolateElements([], false) } catch { /* viewer gone */ }
  }, [setOpen, viewerApiRef])

  return (
    <ViewportPanel id="clash" open={open} onClose={close} label={t('title')} mobile="sheet" widthPx={400} maxHeight="calc(100dvh - 120px)">
      <div className="shrink-0 px-3 pt-2.5 pb-2 border-b border-[var(--border)] flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-[var(--text)] flex items-center gap-1.5">
            {t('title')}
            <span className="text-[9.5px] font-mono uppercase tracking-[0.08em] px-1.5 py-[1px] rounded border border-[var(--border)] text-[var(--text-dim)]">{team ? 'Team' : 'Pro'}</span>
          </div>
          <div className="text-[10.5px] text-[var(--text-dim)] leading-snug">{t('subtitle')}</div>
        </div>
        <button type="button" onClick={close} aria-label={t('close')} className="text-[var(--text-dim)] hover:text-[var(--text)] text-[16px] leading-none px-1 max-md:hidden">×</button>
      </div>
      {pro ? <ClashWorkspace viewerApiRef={viewerApiRef} team={team} t={t} lang={lang} /> : <Upsell t={t} />}
    </ViewportPanel>
  )
}

function Upsell({ t }: { t: T }) {
  return (
    <div className="p-3 space-y-2.5">
      <div className="text-[12px] font-semibold text-[var(--text)]">{t('upsellTitle')}</div>
      <p className="text-[11.5px] leading-relaxed text-[var(--text-dim)]">{t('upsellBody')}</p>
      <a href="/pricing/" className={`${btnPrimary} inline-flex items-center`}>{t('upsellCta')}</a>
    </div>
  )
}

/** Wait for two frames (and a beat) so the camera has settled before a snapshot. */
const settle = (ms: number) => new Promise<void>((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => r())), ms))

function ClashWorkspace({ viewerApiRef, team, t, lang }: { viewerApiRef: Props['viewerApiRef']; team: boolean; t: T; lang: string }) {
  const sceneModels = useSceneStore((s) => s.models)
  const disciplineById = useFederationStore((s) => s.disciplineById)
  const matrix = useClashStore((s) => s.matrix)
  const setMatrix = useClashStore((s) => s.setMatrix)
  const records = useClashStore((s) => s.records)
  const results = useClashStore((s) => s.results)
  const lastRun = useClashStore((s) => s.lastRun)
  const setRun = useClashStore((s) => s.setRun)
  const groupBy = useClashStore((s) => s.groupBy)
  const setGroupBy = useClashStore((s) => s.setGroupBy)
  const sortBy = useClashStore((s) => s.sortBy)
  const setSortBy = useClashStore((s) => s.setSortBy)
  const statusFilter = useClashStore((s) => s.statusFilter)
  const setStatusFilter = useClashStore((s) => s.setStatusFilter)
  const rules = useClashStore((s) => s.rules)
  const setRules = useClashStore((s) => s.setRules)
  const project = useClashStore((s) => s.project)
  const trendAll = useClashStore((s) => s.trend)
  const syncState = useClashStore((s) => s.syncState)
  const selectedKey = useClashStore((s) => s.selectedKey)
  const getToken = useCloudAccountStore((s) => s.getToken)

  const models = useMemo(() => sceneModels.map((m) => ({ ...m, discipline: disciplineOf(m, disciplineById) as string })), [sceneModels, disciplineById])
  const disciplines = useMemo(() => [...new Set(models.map((m) => m.discipline))].sort(), [models])
  const categories = useMemo(() => [...new Set(sceneModels.flatMap((m) => m.categories.map((c) => c.id.toUpperCase())))].sort(), [sceneModels])
  const pKey = useMemo(() => projectKey(models.map((m) => m.fileName)), [models])
  const trend = trendAll[project] ?? []

  // A matrix to start from: the saved one, else every discipline present.
  useEffect(() => { if (!matrix && disciplines.length) setMatrix(defaultMatrix(disciplines)) }, [matrix, disciplines, setMatrix])

  // Where decisions live: the Team workspace when the (dark) cloud is on, else this browser.
  useEffect(() => {
    const cloud = team && isClashCloudEnabled() && getToken
      ? cloudSync({ baseUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? '', getToken: async () => (await getToken?.()) ?? null })
      : localSync
    void useClashStore.getState().connectSync(cloud, pKey)
  }, [team, getToken, pKey])

  const [panel, setPanel] = useState<'none' | 'matrix' | 'rules'>('none')
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const [shotProgress, setShotProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const testName = useCallback((id: string) => matrix?.tests.find((x) => x.id === id)?.name ?? id, [matrix])

  const { shown, suppressed } = useMemo(() => applySuppression(results, rules), [results, rules])

  const run = useCallback(async () => {
    const viewer = viewerApiRef.current
    if (!viewer || !matrix) return
    setError(null)
    const ac = new AbortController()
    abortRef.current = ac
    try {
      const trees = useValidationStore.getState().spatialTrees
      const collect: CollectModel[] = models.filter((m) => m.visible).flatMap((m) => {
        const fragments = viewer.getFragmentsModel(m.id) as CollectModel['fragments'] | null
        if (!fragments) return []
        const obj = viewer.getModelObject(m.id)
        obj?.updateMatrixWorld(true)
        return [{ id: m.id, fileName: m.fileName, discipline: m.discipline, fragments, matrixWorld: obj ? obj.matrixWorld.clone() as THREE.Matrix4 : null, tree: trees[m.id] ?? [] }]
      })
      setProgress({ phase: 'collect', done: 0, total: 1 })
      const out = await runMatrix(collect, matrix, setProgress, ac.signal)
      const st = useClashStore.getState()
      const prev = st.records
      const now = new Date().toISOString()
      const next = reconcile(prev, out.results, out.ranTests, now, (r) => clashTitle(r), testName)
      const resolvedSince = Object.keys(next).filter((k) => next[k].status === 'resolved' && prev[k] && prev[k].status !== 'resolved').length
      setRun(out.results, next, { elements: out.elements, triangles: out.triangles, ms: out.collectMs + out.testMs, collectMs: out.collectMs, at: now, resolvedSince })
      const sup = applySuppression(out.results, st.rules)
      st.addTrend(trendPoint(now, collect.map((c) => c.fileName), sup.shown, next, sup.suppressed))
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') setError(err instanceof Error ? err.message : String(err))
    } finally {
      setProgress(null)
      abortRef.current = null
    }
  }, [viewerApiRef, matrix, models, setRun, testName])

  useEffect(() => () => abortRef.current?.abort(), [])

  const visible = useMemo(() => shown.filter((r) => statusFilter === 'all' || (records[r.key]?.status ?? 'new') === statusFilter), [shown, records, statusFilter])
  const groups = useMemo(() => (sortBy === 'cost' ? [{ key: 'cost', label: '', clashes: sortByCost(visible) }] : groupClashes(visible, groupBy, testName)), [visible, groupBy, sortBy, testName])
  const elementGroups = useMemo(() => (sortBy === 'cost' ? groupClashes(visible, 'element').length : 0), [visible, sortBy])
  const counts = useMemo(() => statusCounts(records, shown.map((r) => r.key)), [records, shown])
  const cost = useMemo(() => totalCost(visible.filter((r) => { const s = records[r.key]?.status ?? 'new'; return s === 'new' || s === 'active' })), [visible, records])
  const selected = useMemo(() => (selectedKey ? results.find((r) => r.key === selectedKey) ?? null : null), [selectedKey, results])
  const eur = (n: number) => n.toLocaleString(lang.slice(0, 2))

  const exportBcf = () => {
    const topics = clashesToBcfTopics(visible, records, testName)
    downloadBcfBlob(topics, `clashes-${new Date().toISOString().slice(0, 10)}.bcfzip`, '2.1')
  }

  const openReport = async (withShots: boolean) => {
    // Open the window first (inside the click) so pop-up blockers allow it.
    const w = window.open('', '_blank')
    const shots: Record<string, string> = {}
    const viewer = viewerApiRef.current
    if (withShots && viewer?.takeSnapshot) {
      const open = shown.filter((r) => { const s = records[r.key]?.status ?? 'new'; return s === 'new' || s === 'active' })
      const top = sortByCost(open).slice(0, SHOTS)
      const cam = viewer.getCameraViewpoint?.() ?? null
      setShotProgress({ done: 0, total: top.length })
      for (const [i, r] of top.entries()) {
        focusClash(viewer, r, false)
        await settle(350)
        try { const img = viewer.takeSnapshot(0.5); if (img) shots[r.key] = img } catch { /* no image for this one */ }
        setShotProgress({ done: i + 1, total: top.length })
      }
      try { viewer.isolateElements([], false); if (cam) viewer.setCameraLookAt(cam.position, cam.target, false) } catch { /* fine */ }
      setShotProgress(null)
    }
    const html = coordinationReportHtml({ lang, project: models.map((m) => m.fileName).join(', '), results: shown, records, testName, shots, trend, suppressed })
    if (!w) return
    w.document.open(); w.document.write(html); w.document.close()
    setTimeout(() => { try { w.print() } catch { /* closed */ } }, 400)
  }

  if (!models.length) return <div className="p-3 text-[11.5px] text-[var(--text-dim)]">{t('needModel')}</div>

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  const busy = !!progress || !!shotProgress
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="shrink-0 px-3 py-2 border-b border-[var(--border)] space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {busy ? (
            <>
              {progress && <button type="button" className={btn} onClick={() => abortRef.current?.abort()}>{t('cancel')}</button>}
              <div className="flex-1 min-w-[120px]">
                <div className="text-[10.5px] text-[var(--text-dim)] truncate" aria-live="polite">
                  {shotProgress ? t('capturing', shotProgress)
                    : progress!.phase === 'collect' ? t('collecting', { done: progress!.done, total: progress!.total }) : t('testing', { test: testName(progress!.test ?? ''), pct })}
                </div>
                <div className="h-1 rounded bg-[var(--surface-2)] overflow-hidden"><div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${shotProgress ? (shotProgress.done / Math.max(1, shotProgress.total)) * 100 : pct}%` }} /></div>
              </div>
            </>
          ) : (
            <>
              <button type="button" className={btnPrimary} onClick={run} disabled={!matrix?.tests.some((x) => x.enabled)} data-testid="clash-run">{t('run')}</button>
              <button type="button" className={btn} onClick={() => setPanel((p) => (p === 'matrix' ? 'none' : 'matrix'))} aria-expanded={panel === 'matrix'}>{t('matrix')} ({matrix?.tests.filter((x) => x.enabled).length ?? 0})</button>
              <button type="button" className={btn} onClick={() => setPanel((p) => (p === 'rules' ? 'none' : 'rules'))} aria-expanded={panel === 'rules'} data-testid="clash-rules-toggle">{t('rules')} ({rules.filter((r) => r.enabled).length})</button>
              {results.length > 0 && <button type="button" className={btn} onClick={exportBcf} title={t('exportBcfHint')}>{t('exportBcf')}</button>}
              {results.length > 0 && team && <button type="button" className={btn} onClick={() => void openReport(true)} data-testid="clash-report">{t('reportShots')}</button>}
            </>
          )}
        </div>
        {error && <div className="text-[10.5px] text-[var(--danger)]">{error}</div>}
        {lastRun && !busy && (
          <div className="text-[10.5px] text-[var(--text-dim)] space-y-0.5">
            <div>
              {t('summary', { n: shown.length, groups: sortBy === 'cost' ? elementGroups : groups.length, el: lastRun.elements.toLocaleString(lang), s: (lastRun.ms / 1000).toFixed(1) })}
              {suppressed > 0 && <> · {t('suppressed', { n: suppressed })}</>}
              {lastRun.resolvedSince > 0 && <> · {t('resolvedSince', { n: lastRun.resolvedSince })}</>}
            </div>
            {cost > 0 && <div title={t('costHint')}>{t('costTotal', { eur: eur(cost) })} <span className="text-[var(--text-faint)]">({t('estimate')})</span></div>}
            {team && <div className="text-[var(--text-faint)]" data-testid="clash-sync">{t(syncState === 'cloud' ? 'sync_cloud' : syncState === 'cloud-error' ? 'sync_error' : 'sync_local')}</div>}
          </div>
        )}
        {trend.length > 1 && !busy && <TrendChart points={trend} t={t} />}
      </div>

      {panel === 'matrix' && matrix && (
        <MatrixEditor matrix={matrix} onChange={setMatrix} disciplines={disciplines} fileNames={models.map((m) => m.fileName)} categories={categories} t={t} onError={setError} />
      )}
      {panel === 'rules' && <RulesEditor rules={rules} onChange={setRules} categories={categories} t={t} />}

      {results.length > 0 && (
        <div className="shrink-0 px-3 py-2 border-b border-[var(--border)] space-y-1.5">
          <div className="flex gap-1 flex-wrap" role="group">
            <button type="button" className={chip(statusFilter === 'all')} onClick={() => setStatusFilter('all')}>{t('filterAll')} {shown.length}</button>
            {(['new', 'active', 'approved'] as const).map((s) => (
              <button key={s} type="button" className={chip(statusFilter === s)} onClick={() => setStatusFilter(s)}>
                <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ background: STATUS_COLOR[s] }} />{t(`status_${s}`)} {counts[s]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-[10.5px] text-[var(--text-dim)]">
              {t('sortBy')}
              <select className={input} value={sortBy} onChange={(e) => setSortBy(e.target.value as 'group' | 'cost')} data-testid="clash-sort">
                <option value="group">{t('sort_group')}</option>
                <option value="cost">{t('sort_cost')}</option>
              </select>
            </label>
            {sortBy === 'group' && (
              <label className="flex items-center gap-1.5 text-[10.5px] text-[var(--text-dim)]">
                {t('groupBy')}
                <select className={input} value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
                  {(['element', 'storey', 'system', 'test', 'none'] as const).map((g) => <option key={g} value={g}>{t(`by_${g}`)}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>
      )}

      {!lastRun && !progress && <div className="p-3 text-[11.5px] text-[var(--text-dim)]">{t('notRun')}</div>}
      {lastRun && !shown.length && <div className="p-3 text-[11.5px] text-[var(--text-dim)]">{t('noClashes')}</div>}
      <VirtualList groups={groups} flat={sortBy === 'cost' || groupBy === 'none'} viewerApiRef={viewerApiRef} t={t} testName={testName} lang={lang} />
      {selected && <Detail r={selected} viewerApiRef={viewerApiRef} team={team} t={t} lang={lang} />}
    </div>
  )
}

function TrendChart({ points, t }: { points: ReturnType<typeof trendPoint>[]; t: T }) {
  const w = 340, h = 44
  const last = points[points.length - 1], prev = points[points.length - 2]
  const delta = last.open - prev.open
  return (
    <div className="space-y-0.5" data-testid="clash-trend">
      <div className="flex items-center justify-between text-[10px] text-[var(--text-dim)]">
        <span>{t('trend')} · {t('trendRuns', { n: points.length })}</span>
        <span className={delta > 0 ? 'text-[var(--danger)]' : 'text-[var(--success,#3a9a6a)]'}>{t('trendOpen')} {last.open} ({delta > 0 ? '+' : ''}{delta})</span>
      </div>
      <svg viewBox={`0 -3 ${w} ${h + 6}`} className="w-full h-11" role="img" aria-label={t('trend')} preserveAspectRatio="none">
        <polyline points={trendPolyline(points, w, h - 2, 'resolved')} fill="none" stroke="var(--success, #3a9a6a)" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        <polyline points={trendPolyline(points, w, h - 2, 'open')} fill="none" stroke="var(--danger, #d9534f)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

type Row = { kind: 'head'; key: string; label: string; n: number } | { kind: 'clash'; r: ClashResult }

/** Only the rows on screen are rendered; heights are fixed so scrolling is arithmetic. */
function VirtualList({ groups, flat, viewerApiRef, t, testName, lang }: {
  groups: ReturnType<typeof groupClashes>; flat: boolean; viewerApiRef: Props['viewerApiRef']; t: T; testName: (id: string) => string; lang: string
}) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set())
  const [scroll, setScroll] = useState(0)
  const [height, setHeight] = useState(400)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.clientHeight || 400))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const rows = useMemo(() => {
    const out: Row[] = []
    for (const g of groups) {
      if (!flat) out.push({ kind: 'head', key: g.key, label: g.label, n: g.clashes.length })
      if (flat || openGroups.has(g.key)) for (const r of g.clashes) out.push({ kind: 'clash', r })
    }
    return out
  }, [groups, flat, openGroups])
  const tops = useMemo(() => {
    const a = new Float64Array(rows.length + 1)
    for (let i = 0; i < rows.length; i++) a[i + 1] = a[i] + (rows[i].kind === 'head' ? HEAD_H : ROW_H)
    return a
  }, [rows])
  // First row at or above the scroll position (binary search on the prefix sums).
  let lo = 0, hi = rows.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (tops[m + 1] <= scroll) lo = m + 1; else hi = m }
  const first = Math.max(0, lo - 4)
  let last = first
  while (last < rows.length && tops[last] < scroll + height + 200) last++
  const toggle = (k: string) => setOpenGroups((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  return (
    <div ref={ref} className="flex-1 min-h-[120px] overflow-y-auto overscroll-contain" data-testid="clash-list" onScroll={(e) => setScroll(e.currentTarget.scrollTop)}>
      <div style={{ height: tops[rows.length], position: 'relative' }}>
        {rows.slice(first, last).map((row, j) => {
          const i = first + j
          const style: React.CSSProperties = { position: 'absolute', top: tops[i], left: 0, right: 0, height: row.kind === 'head' ? HEAD_H : ROW_H }
          return row.kind === 'head'
            ? (
              <button key={`h:${row.key}`} type="button" style={style} onClick={() => toggle(row.key)} aria-expanded={openGroups.has(row.key)}
                className="flex items-center gap-2 px-3 text-left border-b border-[var(--border)] hover:bg-[var(--surface-2)]">
                <span className="text-[10px] text-[var(--text-faint)] w-2">{openGroups.has(row.key) ? '▾' : '▸'}</span>
                <span className="flex-1 min-w-0 truncate text-[11.5px] font-medium text-[var(--text)]">{row.label}</span>
                <span className="text-[10.5px] font-mono text-[var(--text-dim)]">{row.n}</span>
              </button>
            )
            : <ClashRow key={row.r.key} r={row.r} style={style} viewerApiRef={viewerApiRef} t={t} testName={testName} lang={lang} />
        })}
      </div>
    </div>
  )
}

function focusClash(viewer: ViewerAPI | null, r: ClashResult, animate = true): void {
  if (!viewer) return
  try {
    viewer.isolateElements([{ expressId: r.a.localId, modelId: r.a.modelId }, { expressId: r.b.localId, modelId: r.b.modelId }], true)
    viewer.selectElement(r.a.localId, r.a.modelId)
    const [x, y, z] = r.point
    viewer.setCameraLookAt({ x: x + 4.5, y: y + 3.5, z: z + 4.5 }, { x, y, z }, animate)
  } catch { /* viewer busy: the list still works */ }
}

const ClashRow = React.memo(function ClashRow({ r, style, viewerApiRef, t, testName, lang }: { r: ClashResult; style: React.CSSProperties; viewerApiRef: Props['viewerApiRef']; t: T; testName: (id: string) => string; lang: string }) {
  const status = useClashStore((s) => s.records[r.key]?.status ?? 'new')
  const assignee = useClashStore((s) => s.records[r.key]?.assignee)
  const selected = useClashStore((s) => s.selectedKey === r.key)
  const select = useClashStore((s) => s.select)
  const mm = Math.round((r.kind === 'hard' ? r.depth : r.distance) * 1000)
  return (
    <button type="button" style={style} aria-pressed={selected}
      className={`px-3 text-left flex items-start gap-2 pt-1.5 ${selected ? 'bg-[var(--surface-2)]' : 'hover:bg-[var(--surface-2)]'}`}
      onClick={() => { select(selected ? null : r.key); if (!selected) focusClash(viewerApiRef.current, r) }}>
      <span className="mt-[5px] w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLOR[status] }} title={t(`status_${status}`)} />
      <span className="flex-1 min-w-0">
        <span className="flex gap-2 text-[11.5px] text-[var(--text)]"><span className="truncate flex-1">{clashTitle(r)}</span><span className="font-mono text-[10px] text-[var(--text-dim)] shrink-0" title={t('costHint')}>{t('cost', { eur: estimateCost(r).toLocaleString(lang.slice(0, 2)) })}</span></span>
        <span className="block text-[10px] text-[var(--text-dim)] truncate">
          {testName(r.test)} · {r.kind === 'hard' ? t('overlap', { mm }) : t('gap', { mm })}{r.a.storey || r.b.storey ? ` · ${r.a.storey || r.b.storey}` : ''}{assignee ? ` · ${assignee}` : ''}
        </span>
      </span>
    </button>
  )
})

function Detail({ r, viewerApiRef, team, t, lang }: { r: ClashResult; viewerApiRef: Props['viewerApiRef']; team: boolean; t: T; lang: string }) {
  const rec = useClashStore((s) => s.records[r.key])
  const update = useClashStore((s) => s.updateRecord)
  const select = useClashStore((s) => s.select)
  const status = rec?.status ?? 'new'
  return (
    <div className="shrink-0 border-t border-[var(--border-strong)] px-3 py-2 space-y-1.5 bg-[var(--surface-1,transparent)]" data-testid="clash-detail">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 text-[11.5px] font-medium text-[var(--text)] truncate">{clashTitle(r)}</div>
        <span className="text-[10px] font-mono text-[var(--text-dim)]" title={t('costHint')}>{t('cost', { eur: estimateCost(r).toLocaleString(lang.slice(0, 2)) })} · {t('estimate')}</span>
        <button type="button" className="text-[var(--text-dim)] hover:text-[var(--text)] leading-none" aria-label={t('close')} onClick={() => select(null)}>×</button>
      </div>
      <div className="text-[10px] text-[var(--text-faint)] font-mono break-all">{r.a.category} {r.a.guid ?? ''} · {r.a.fileName}<br />{r.b.category} {r.b.guid ?? ''} · {r.b.fileName}</div>
      <div className="flex gap-1 flex-wrap">
        <button type="button" className={btn} onClick={() => focusClash(viewerApiRef.current, r)}>{t('focus')}</button>
        {status !== 'approved' && <button type="button" className={btn} onClick={() => update(r.key, { status: 'approved' })}>{t('approve')}</button>}
        {status === 'approved' && <button type="button" className={btn} onClick={() => update(r.key, { status: 'active' })}>{t('reopen')}</button>}
      </div>
      {team ? (
        <div className="grid grid-cols-2 gap-1.5" key={r.key}>
          <input className={input} placeholder={t('assignee')} aria-label={t('assignee')} defaultValue={rec?.assignee ?? ''} onBlur={(e) => update(r.key, { assignee: e.target.value.trim() || undefined })} />
          <input className={input} type="date" aria-label={t('due')} defaultValue={rec?.due ?? ''} onChange={(e) => update(r.key, { due: e.target.value || undefined })} />
          <input className={`${input} col-span-2`} placeholder={t('note')} aria-label={t('note')} defaultValue={rec?.note ?? ''} onBlur={(e) => update(r.key, { note: e.target.value.trim() || undefined })} />
        </div>
      ) : (
        <div className="text-[10px] text-[var(--text-faint)]">{t('teamOnly')}</div>
      )}
    </div>
  )
}

// ── ignore rules ───────────────────────────────────────────────────────────────

function RulesEditor({ rules, onChange, categories, t }: { rules: SuppressRule[]; onChange: (r: SuppressRule[]) => void; categories: string[]; t: T }) {
  const patch = (id: string, p: Partial<SuppressRule>) => onChange(rules.map((r) => (r.id === id ? { ...r, ...p } : r)))
  const add = () => onChange([...rules, { id: newTestId(), name: t('addRule'), a: { classes: [], names: [] }, b: { classes: [], names: [] }, sameModelOnly: false, maxDepth: 0, enabled: true }])
  return (
    <div className="shrink-0 max-h-[46vh] overflow-y-auto border-b border-[var(--border)] px-3 py-2 space-y-1.5" data-testid="clash-rules">
      <datalist id="clash-rule-classes">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="text-[10.5px] text-[var(--text-dim)]">{t('rulesHint')}</div>
      {rules.map((r) => (
        <div key={r.id} className="rounded-[8px] border border-[var(--border)] p-2 space-y-1.5">
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--text)]">
            <input type="checkbox" checked={r.enabled} onChange={(e) => patch(r.id, { enabled: e.target.checked })} />
            {r.preset ? <span className="flex-1">{t(`rule_${r.preset}` as ClashTextKey)}</span>
              : <input className={`${input} flex-1`} value={r.name} aria-label={t('testName')} onChange={(e) => patch(r.id, { name: e.target.value })} />}
            {!r.preset && <button type="button" className="text-[10.5px] text-[var(--text-dim)] hover:text-[var(--danger)]" onClick={() => onChange(rules.filter((x) => x.id !== r.id))}>{t('removeTest')}</button>}
          </label>
          {!r.preset && (
            <>
              {(['a', 'b'] as const).map((side) => (
                <div key={side} className="grid grid-cols-[52px_1fr_1fr] gap-1 items-center">
                  <span className="text-[10px] text-[var(--text-faint)]">{side === 'a' ? t('ruleSideA') : t('ruleSideB')}</span>
                  <input className={input} list="clash-rule-classes" placeholder={`${t('classes')}: ${t('any')}`} defaultValue={r[side].classes.join(', ')}
                    onBlur={(e) => patch(r.id, { [side]: { ...r[side], classes: parseRuleList(e.target.value).map((c) => c.toUpperCase()) } })} />
                  <input className={input} placeholder={t('ruleNames')} defaultValue={r[side].names.join(', ')}
                    onBlur={(e) => patch(r.id, { [side]: { ...r[side], names: parseRuleList(e.target.value) } })} />
                </div>
              ))}
              <div className="flex items-center gap-3 text-[10.5px] text-[var(--text-dim)]">
                <label className="flex items-center gap-1"><input type="checkbox" checked={r.sameModelOnly} onChange={(e) => patch(r.id, { sameModelOnly: e.target.checked })} />{t('sameModelOnly')}</label>
                <label className="flex items-center gap-1">{t('maxDepth')}<input className={`${input} w-14`} type="number" min={0} step={5} value={Math.round(r.maxDepth * 1000)} onChange={(e) => patch(r.id, { maxDepth: Math.max(0, Number(e.target.value) || 0) / 1000 })} /></label>
              </div>
            </>
          )}
        </div>
      ))}
      <button type="button" className={btn} onClick={add}>{t('addRule')}</button>
    </div>
  )
}

// ── matrix editor ──────────────────────────────────────────────────────────────

function MatrixEditor({ matrix, onChange, disciplines, fileNames, categories, t, onError }: {
  matrix: ClashMatrix; onChange: (m: ClashMatrix) => void; disciplines: string[]; fileNames: string[]; categories: string[]; t: T; onError: (e: string | null) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const patch = (id: string, p: Partial<ClashTestDef>) => onChange({ ...matrix, tests: matrix.tests.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const add = () => onChange({ ...matrix, tests: [...matrix.tests, { id: newTestId(), name: `${t('hard')} ${matrix.tests.length + 1}`, kind: 'hard', tolerance: 0.01, a: { ...ANY }, b: { ...ANY }, skipSameModel: true, enabled: true }] })
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(matrix, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'clash-matrix.json'; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const importJson = async (f: File) => {
    const m = parseMatrix(await f.text())
    if (!m) { onError(t('badMatrix')); return }
    onError(null); onChange(m)
  }
  return (
    <div className="shrink-0 max-h-[46vh] overflow-y-auto border-b border-[var(--border)] px-3 py-2 space-y-2" data-testid="clash-matrix">
      <datalist id="clash-classes">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      <select className={`${input} w-full`} value="" data-testid="clash-template" aria-label={t('tplPick')}
        onChange={(e) => { const id = e.target.value as TemplateId; if (id) onChange(templateMatrix(id, disciplines)) }}>
        <option value="">{t('tplPick')}</option>
        {TEMPLATE_IDS.map((id) => <option key={id} value={id}>{t(`tpl_${id}` as ClashTextKey)}</option>)}
      </select>
      {matrix.tests.map((x) => (
        <div key={x.id} className="rounded-[8px] border border-[var(--border)] p-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <input type="checkbox" checked={x.enabled} onChange={(e) => patch(x.id, { enabled: e.target.checked })} aria-label={x.name} />
            <input className={`${input} flex-1`} value={x.name} aria-label={t('testName')} onChange={(e) => patch(x.id, { name: e.target.value })} />
            <button type="button" className="text-[10.5px] text-[var(--text-dim)] hover:text-[var(--danger)]" onClick={() => onChange({ ...matrix, tests: matrix.tests.filter((y) => y.id !== x.id) })}>{t('removeTest')}</button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <select className={input} value={x.kind} onChange={(e) => patch(x.id, { kind: e.target.value as ClashTestDef['kind'] })}>
              <option value="hard">{t('hard')}</option>
              <option value="clearance">{t('clearance')}</option>
            </select>
            <label className="flex items-center gap-1 text-[10.5px] text-[var(--text-dim)]" title={x.kind === 'hard' ? t('toleranceHardHint') : t('toleranceClearHint')}>
              {t('tolerance')}
              <input className={`${input} w-16`} type="number" min={0} max={5000} step={5} value={Math.round(x.tolerance * 1000)} onChange={(e) => patch(x.id, { tolerance: Math.max(0, Number(e.target.value) || 0) / 1000 })} />
            </label>
          </div>
          {(['a', 'b'] as const).map((side) => (
            <SelectorEditor key={side} label={side === 'a' ? t('sideA') : t('sideB')} sel={x[side]} onChange={(s) => patch(x.id, { [side]: s })} disciplines={disciplines} fileNames={fileNames} t={t} />
          ))}
          <label className="flex items-center gap-1.5 text-[10.5px] text-[var(--text-dim)]">
            <input type="checkbox" checked={x.skipSameModel} onChange={(e) => patch(x.id, { skipSameModel: e.target.checked })} />{t('skipSameModel')}
          </label>
        </div>
      ))}
      <div className="flex gap-1.5 flex-wrap">
        <button type="button" className={btn} onClick={add}>{t('addTest')}</button>
        <button type="button" className={btn} onClick={() => onChange(defaultMatrix(disciplines))}>{t('resetMatrix')}</button>
        <button type="button" className={btn} onClick={exportJson}>{t('exportMatrix')}</button>
        <button type="button" className={btn} onClick={() => fileRef.current?.click()}>{t('importMatrix')}</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = '' }} />
      </div>
    </div>
  )
}

function SelectorEditor({ label, sel, onChange, disciplines, fileNames, t }: {
  label: string; sel: ClashSelector; onChange: (s: ClashSelector) => void; disciplines: string[]; fileNames: string[]; t: T
}) {
  const toggle = (v: string) => onChange({ ...sel, models: sel.models.includes(v) ? sel.models.filter((x) => x !== v) : [...sel.models, v] })
  const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-mono uppercase tracking-[0.08em] text-[var(--text-faint)]">{label}</div>
      <div className="flex gap-1 flex-wrap" aria-label={t('models')}>
        <button type="button" className={chip(!sel.models.length)} onClick={() => onChange({ ...sel, models: [] })}>{t('any')}</button>
        {disciplines.map((d) => <button key={d} type="button" className={chip(sel.models.includes(d))} onClick={() => toggle(d)}>{d}</button>)}
        {fileNames.length > 1 && fileNames.map((f) => <button key={f} type="button" className={`${chip(sel.models.includes(f))} max-w-[160px] truncate`} title={f} onClick={() => toggle(f)}>{f.replace(/\.ifc$/i, '')}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-1">
        <input className={input} list="clash-classes" placeholder={`${t('classes')}: ${t('any')}`} aria-label={t('classes')} defaultValue={sel.classes.join(', ')}
          onBlur={(e) => onChange({ ...sel, classes: list(e.target.value).map((c) => c.toUpperCase()) })} />
        <input className={input} placeholder={`${t('systems')}: ${t('any')}`} aria-label={t('systems')} defaultValue={sel.systems.join(', ')}
          onBlur={(e) => onChange({ ...sel, systems: list(e.target.value) })} />
      </div>
    </div>
  )
}
