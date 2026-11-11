// ─── ClashPanel ───────────────────────────────────────────────────────────────
// Clash detection (Pro) and coordination (Team). Everything runs here, in the
// browser: geometry from fragments, tests in a worker, decisions in this
// browser's storage keyed by GlobalId pairs. Free plans see what it does and a
// way to the plans page; nothing that was free before is behind this.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ViewerAPI } from '../../lib/viewer'
import { ViewportPanel } from '../ViewportPanel'
import { useClashStore } from '../../stores/clashStore'
import { useSceneStore } from '../../stores/sceneStore'
import { useValidationStore } from '../../stores/validationStore'
import { useFederationStore, disciplineOf } from '../../stores/federationStore'
import { useFeatureAccess } from '../../hooks/usePlan'
import { useClashT, type ClashTextKey } from '../../lib/clash/i18n'
import {
  ANY, defaultMatrix, groupClashes, newTestId, parseMatrix, reconcile, statusCounts,
  type ClashMatrix, type ClashResult, type ClashSelector, type ClashStatus, type ClashTestDef, type GroupBy,
} from '../../lib/clash/model'
import { runMatrix, type RunProgress } from '../../lib/clash/run'
import type { CollectModel } from '../../lib/clash/collect'
import { clashTitle, clashesToBcfTopics, coordinationReportHtml } from '../../lib/clash/export'
import { downloadBcfBlob } from '../../lib/bcf'
import * as THREE from 'three'

interface Props { viewerApiRef: React.MutableRefObject<ViewerAPI | null> }

const STATUS_COLOR: Record<ClashStatus, string> = {
  new: 'var(--danger, #d9534f)', active: 'var(--warning, #e0a030)', resolved: 'var(--success, #3a9a6a)', approved: 'var(--text-dim)',
}
const btn = 'h-7 max-md:h-9 px-2.5 rounded-[6px] border border-[var(--border)] text-[11px] max-md:text-[12.5px] font-medium text-[var(--text)] hover:border-[var(--border-strong)] disabled:opacity-40 transition-colors whitespace-nowrap'
const btnPrimary = 'h-7 max-md:h-9 px-3 rounded-[6px] text-[11px] max-md:text-[12.5px] font-semibold bg-[var(--accent)] text-[var(--accent-contrast,#fff)] disabled:opacity-40 whitespace-nowrap'
const input = 'h-7 max-md:h-9 px-2 rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] text-[11px] max-md:text-[12.5px] text-[var(--text)] min-w-0'
const chip = (on: boolean) => `h-6 max-md:h-8 px-2 rounded-full border text-[10.5px] max-md:text-[12px] transition-colors ${on ? 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border-strong)]' : 'text-[var(--text-dim)] border-[var(--border)] hover:text-[var(--text)]'}`
const PAGE = 40

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
    <ViewportPanel id="clash" open={open} onClose={close} label={t('title')} mobile="sheet" widthPx={380} maxHeight="calc(100dvh - 120px)">
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

type T = (key: ClashTextKey, vars?: Record<string, string | number>) => string

function Upsell({ t }: { t: T }) {
  return (
    <div className="p-3 space-y-2.5">
      <div className="text-[12px] font-semibold text-[var(--text)]">{t('upsellTitle')}</div>
      <p className="text-[11.5px] leading-relaxed text-[var(--text-dim)]">{t('upsellBody')}</p>
      <a href="/pricing/" className={`${btnPrimary} inline-flex items-center`}>{t('upsellCta')}</a>
    </div>
  )
}

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
  const statusFilter = useClashStore((s) => s.statusFilter)
  const setStatusFilter = useClashStore((s) => s.setStatusFilter)

  const models = useMemo(() => sceneModels.map((m) => ({ ...m, discipline: disciplineOf(m, disciplineById) as string })), [sceneModels, disciplineById])
  const disciplines = useMemo(() => [...new Set(models.map((m) => m.discipline))].sort(), [models])
  const categories = useMemo(() => [...new Set(sceneModels.flatMap((m) => m.categories.map((c) => c.id.toUpperCase())))].sort(), [sceneModels])

  // A matrix to start from: the saved one, else every discipline present.
  useEffect(() => { if (!matrix && disciplines.length) setMatrix(defaultMatrix(disciplines)) }, [matrix, disciplines, setMatrix])

  const [editing, setEditing] = useState(false)
  const [progress, setProgress] = useState<RunProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const testName = useCallback((id: string) => matrix?.tests.find((x) => x.id === id)?.name ?? id, [matrix])

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
      const prev = useClashStore.getState().records
      const now = new Date().toISOString()
      const next = reconcile(prev, out.results, out.ranTests, now, (r) => clashTitle(r), testName)
      const resolvedSince = Object.keys(next).filter((k) => next[k].status === 'resolved' && prev[k] && prev[k].status !== 'resolved').length
      setRun(out.results, next, { elements: out.elements, triangles: out.triangles, ms: out.collectMs + out.testMs, collectMs: out.collectMs, at: now, resolvedSince })
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') setError(err instanceof Error ? err.message : String(err))
    } finally {
      setProgress(null)
      abortRef.current = null
    }
  }, [viewerApiRef, matrix, models, setRun, testName])

  useEffect(() => () => abortRef.current?.abort(), [])

  const visible = useMemo(() => results.filter((r) => statusFilter === 'all' || (records[r.key]?.status ?? 'new') === statusFilter), [results, records, statusFilter])
  const groups = useMemo(() => groupClashes(visible, groupBy, testName), [visible, groupBy, testName])
  const counts = useMemo(() => statusCounts(records, results.map((r) => r.key)), [records, results])

  const exportBcf = () => {
    const topics = clashesToBcfTopics(visible, records, testName)
    downloadBcfBlob(topics, `clashes-${new Date().toISOString().slice(0, 10)}.bcfzip`, '2.1')
  }
  const openReport = () => {
    const html = coordinationReportHtml({ lang, project: models.map((m) => m.fileName).join(', '), results, records, testName })
    const w = window.open('', '_blank')
    if (!w) return
    w.document.open(); w.document.write(html); w.document.close()
    setTimeout(() => { try { w.print() } catch { /* closed */ } }, 300)
  }

  if (!models.length) return <div className="p-3 text-[11.5px] text-[var(--text-dim)]">{t('needModel')}</div>

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="shrink-0 px-3 py-2 border-b border-[var(--border)] space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {progress ? (
            <>
              <button type="button" className={btn} onClick={() => abortRef.current?.abort()}>{t('cancel')}</button>
              <div className="flex-1 min-w-[120px]">
                <div className="text-[10.5px] text-[var(--text-dim)] truncate" aria-live="polite">
                  {progress.phase === 'collect' ? t('collecting', { done: progress.done, total: progress.total }) : t('testing', { test: testName(progress.test ?? ''), pct })}
                </div>
                <div className="h-1 rounded bg-[var(--surface-2)] overflow-hidden"><div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${pct}%` }} /></div>
              </div>
            </>
          ) : (
            <>
              <button type="button" className={btnPrimary} onClick={run} disabled={!matrix?.tests.some((x) => x.enabled)} data-testid="clash-run">{t('run')}</button>
              <button type="button" className={btn} onClick={() => setEditing((e) => !e)} aria-expanded={editing}>{t('matrix')} ({matrix?.tests.filter((x) => x.enabled).length ?? 0})</button>
              {results.length > 0 && <button type="button" className={btn} onClick={exportBcf} title={t('exportBcfHint')}>{t('exportBcf')}</button>}
              {results.length > 0 && team && <button type="button" className={btn} onClick={openReport}>{t('report')}</button>}
            </>
          )}
        </div>
        {error && <div className="text-[10.5px] text-[var(--danger)]">{error}</div>}
        {lastRun && !progress && (
          <div className="text-[10.5px] text-[var(--text-dim)]">
            {t('summary', { n: results.length, groups: groups.length, el: lastRun.elements.toLocaleString(lang), s: (lastRun.ms / 1000).toFixed(1) })}
            {lastRun.resolvedSince > 0 && <> · {t('resolvedSince', { n: lastRun.resolvedSince })}</>}
          </div>
        )}
      </div>

      {editing && matrix && (
        <MatrixEditor matrix={matrix} onChange={setMatrix} disciplines={disciplines} fileNames={models.map((m) => m.fileName)} categories={categories} t={t} onError={setError} />
      )}

      {results.length > 0 && (
        <div className="shrink-0 px-3 py-2 border-b border-[var(--border)] space-y-1.5">
          <div className="flex gap-1 flex-wrap" role="group">
            <button type="button" className={chip(statusFilter === 'all')} onClick={() => setStatusFilter('all')}>{t('filterAll')} {results.length}</button>
            {(['new', 'active', 'approved'] as const).map((s) => (
              <button key={s} type="button" className={chip(statusFilter === s)} onClick={() => setStatusFilter(s)}>
                <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ background: STATUS_COLOR[s] }} />{t(`status_${s}`)} {counts[s]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[10.5px] text-[var(--text-dim)]">
            {t('groupBy')}
            <select className={input} value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
              {(['element', 'storey', 'system', 'test', 'none'] as const).map((g) => <option key={g} value={g}>{t(`by_${g}`)}</option>)}
            </select>
          </label>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" data-testid="clash-list">
        {!lastRun && !progress && <div className="p-3 text-[11.5px] text-[var(--text-dim)]">{t('notRun')}</div>}
        {lastRun && !results.length && <div className="p-3 text-[11.5px] text-[var(--text-dim)]">{t('noClashes')}</div>}
        {groups.map((g) => <Group key={g.key} label={g.label} clashes={g.clashes} single={groupBy === 'none'} viewerApiRef={viewerApiRef} team={team} t={t} testName={testName} />)}
      </div>
    </div>
  )
}

function Group({ label, clashes, single, viewerApiRef, team, t, testName }: {
  label: string; clashes: ClashResult[]; single: boolean; viewerApiRef: Props['viewerApiRef']; team: boolean; t: T; testName: (id: string) => string
}) {
  const [openG, setOpenG] = useState(single)
  const [limit, setLimit] = useState(PAGE)
  return (
    <div className="border-b border-[var(--border)]">
      {!single && (
        <button type="button" onClick={() => setOpenG((o) => !o)} aria-expanded={openG}
          className="w-full flex items-center gap-2 px-3 py-1.5 max-md:py-2.5 text-left hover:bg-[var(--surface-2)]">
          <span className="text-[10px] text-[var(--text-faint)] w-2">{openG ? '▾' : '▸'}</span>
          <span className="flex-1 min-w-0 truncate text-[11.5px] font-medium text-[var(--text)]">{label}</span>
          <span className="text-[10.5px] font-mono text-[var(--text-dim)]">{clashes.length}</span>
        </button>
      )}
      {openG && (
        <div>
          {clashes.slice(0, limit).map((r) => <Row key={r.key} r={r} viewerApiRef={viewerApiRef} team={team} t={t} testName={testName} />)}
          {clashes.length > limit && (
            <button type="button" className="w-full text-[10.5px] py-1.5 text-[var(--accent)]" onClick={() => setLimit((l) => l + PAGE * 4)}>
              {t('more', { n: clashes.length - limit })}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function focusClash(viewer: ViewerAPI | null, r: ClashResult): void {
  if (!viewer) return
  try {
    viewer.isolateElements([{ expressId: r.a.localId, modelId: r.a.modelId }, { expressId: r.b.localId, modelId: r.b.modelId }], true)
    viewer.selectElement(r.a.localId, r.a.modelId)
    const [x, y, z] = r.point
    viewer.setCameraLookAt({ x: x + 4.5, y: y + 3.5, z: z + 4.5 }, { x, y, z }, true)
  } catch { /* viewer busy: the list still works */ }
}

function Row({ r, viewerApiRef, team, t, testName }: { r: ClashResult; viewerApiRef: Props['viewerApiRef']; team: boolean; t: T; testName: (id: string) => string }) {
  const rec = useClashStore((s) => s.records[r.key])
  const selected = useClashStore((s) => s.selectedKey === r.key)
  const select = useClashStore((s) => s.select)
  const update = useClashStore((s) => s.updateRecord)
  const status = rec?.status ?? 'new'
  const mm = Math.round((r.kind === 'hard' ? r.depth : r.distance) * 1000)
  return (
    <div className={`px-3 py-1.5 max-md:py-2.5 ${selected ? 'bg-[var(--surface-2)]' : 'hover:bg-[var(--surface-2)]'}`}>
      <button type="button" className="w-full text-left flex items-start gap-2" onClick={() => { select(selected ? null : r.key); if (!selected) focusClash(viewerApiRef.current, r) }} aria-expanded={selected}>
        <span className="mt-[5px] w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLOR[status] }} title={t(`status_${status}`)} />
        <span className="flex-1 min-w-0">
          <span className="block text-[11.5px] text-[var(--text)] truncate">{clashTitle(r)}</span>
          <span className="block text-[10px] text-[var(--text-dim)] truncate">
            {testName(r.test)} · {r.kind === 'hard' ? t('overlap', { mm }) : t('gap', { mm })}{r.a.storey || r.b.storey ? ` · ${r.a.storey || r.b.storey}` : ''}{rec?.assignee ? ` · ${rec.assignee}` : ''}
          </span>
        </span>
      </button>
      {selected && (
        <div className="mt-1.5 pl-4 space-y-1.5">
          <div className="text-[10px] text-[var(--text-faint)] font-mono break-all">{r.a.category} {r.a.guid ?? ''} · {r.a.fileName}<br />{r.b.category} {r.b.guid ?? ''} · {r.b.fileName}</div>
          <div className="flex gap-1 flex-wrap">
            <button type="button" className={btn} onClick={() => focusClash(viewerApiRef.current, r)}>{t('focus')}</button>
            {status !== 'approved' && <button type="button" className={btn} onClick={() => update(r.key, { status: 'approved' })}>{t('approve')}</button>}
            {status === 'approved' && <button type="button" className={btn} onClick={() => update(r.key, { status: 'active' })}>{t('reopen')}</button>}
          </div>
          {team ? (
            <div className="grid grid-cols-2 gap-1.5">
              <input className={input} placeholder={t('assignee')} aria-label={t('assignee')} defaultValue={rec?.assignee ?? ''} onBlur={(e) => update(r.key, { assignee: e.target.value.trim() || undefined })} />
              <input className={input} type="date" aria-label={t('due')} defaultValue={rec?.due ?? ''} onChange={(e) => update(r.key, { due: e.target.value || undefined })} />
              <input className={`${input} col-span-2`} placeholder={t('note')} aria-label={t('note')} defaultValue={rec?.note ?? ''} onBlur={(e) => update(r.key, { note: e.target.value.trim() || undefined })} />
            </div>
          ) : (
            <div className="text-[10px] text-[var(--text-faint)]">{t('teamOnly')}</div>
          )}
        </div>
      )}
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
    <div className="shrink-0 max-h-[46vh] overflow-y-auto border-b border-[var(--border)] px-3 py-2 space-y-2 bg-[var(--surface-1,transparent)]" data-testid="clash-matrix">
      <datalist id="clash-classes">{categories.map((c) => <option key={c} value={c} />)}</datalist>
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
