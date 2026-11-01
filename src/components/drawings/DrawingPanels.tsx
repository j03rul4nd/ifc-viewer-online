// ─── The drawings inspector ───────────────────────────────────────────────────
// Five questions, one tab each, because the order of work is the order of tabs:
// what is in this scene, what do I want to make, what do I see of it (layers),
// how does this sheet sit in the model, and what do I hand over. Each tab shows
// only what applies to the active sheet; nothing here is a modal.

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../../lib/viewer'
import { useDrawingStore } from '../../stores/drawingStore'
import { useModelStore } from '../../stores/modelStore'
import { usePointCloudStore } from '../../stores/pointCloudStore'
import { trackFeatureUsed } from '../../lib/analytics'
import { buildCut, SKIP_CATEGORIES, type BuildCutOptions, type CutPlane } from '../../lib/drawing/plan-cut'
import { runDrawingJob } from '../../lib/drawing/run-job'
import { diffSheets } from '../../lib/drawing/diff'
import type { ScanSlice } from '../../lib/drawing/scan-slice'
import { PAPER, type PaperSize } from '../../lib/drawing/export'
import { IDENTITY, LAYER_PALETTE, type Drawing, type NewEntity, type Pt } from '../../lib/drawing/types'

export type InspectorTab = 'scene' | 'create' | 'layers' | 'sheet' | 'output'
export const INSPECTOR_TABS: InspectorTab[] = ['scene', 'create', 'layers', 'sheet', 'output']

export const btn = 'h-7 px-2 rounded-md text-[11px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)] disabled:opacity-40 whitespace-nowrap'
export const field = 'h-7 px-1.5 rounded-md text-[11px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] min-w-0'
const stop = (e: React.KeyboardEvent) => e.stopPropagation()

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="p-2.5 border-b border-[var(--border)]">
      <div className="flex items-center justify-between gap-2 mb-1.5 min-h-[20px]">
        <h3 className="text-[10px] font-mono uppercase tracking-[0.08em] text-[var(--text-faint)] truncate">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex items-center justify-between gap-2 min-h-[28px]"><span className="text-[var(--text-dim)] truncate">{label}</span>{children}</label>
}

function Num({ value, onChange, label, step = 0.1, width = 'w-20' }: { value: number; onChange(v: number): void; label: string; step?: number; width?: string }) {
  // Text while typing: "0," or "-" are steps towards a number, not errors.
  const [text, setText] = useState(String(value))
  useEffect(() => { setText((t) => (Number(t.replace(',', '.')) === value ? t : String(value))) }, [value])
  return (
    <input
      aria-label={label} inputMode="decimal" step={step} className={`${field} ${width} text-right font-mono`} value={text} onKeyDown={stop}
      onChange={(e) => { setText(e.target.value); const n = Number(e.target.value.replace(',', '.')); if (Number.isFinite(n) && e.target.value.trim() !== '') onChange(n) }}
    />
  )
}

export interface PanelShared {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  active: Drawing | null
  busy: boolean
  run(work: () => Promise<void>): Promise<void>
  fail(message: string): void
  say(message: string): void
}

// ── Scene ─────────────────────────────────────────────────────────────────────

export function ScenePanel({ viewerApiRef, active, markerCount }: PanelShared & { markerCount: number }) {
  const { t } = useTranslation('drawings')
  const s = useDrawingStore()
  const models = useModelStore((st) => st.models)
  const clouds = usePointCloudStore((st) => st.clouds)
  const setCloudVisible = usePointCloudStore((st) => st.setVisible)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const toggleModel = (id: string) => {
    const next = new Set(hidden)
    if (next.has(id)) next.delete(id); else next.add(id)
    viewerApiRef.current?.setModelVisible(id, !next.has(id))
    setHidden(next)
  }
  const modelRows = Object.values(models)
  const frameAll = async () => {
    const api = viewerApiRef.current
    if (!api) return
    if (clouds.length) (await api.getPointClouds()).frameWithModel()
    else api.frameAllModels()
  }
  const layFlat = () => {
    // Every plan, at its own level: the building as a stack of drawings.
    for (const d of s.drawings) if (d.source === 'plan' || d.source === 'scan' || d.source === 'pdf' || d.source === 'dxf') s.patch(d.id, { in3d: true, visible: true })
    trackFeatureUsed({ feature: 'drawing_scene_stack' })
  }
  const empty = !modelRows.length && !clouds.length && !s.drawings.length
  return (
    <>
      <Section title={t('scene.title')} action={<button type="button" className={btn} onClick={() => void frameAll()} disabled={empty}>{t('scene.frame')}</button>}>
        {empty && <p className="text-[var(--text-faint)] leading-relaxed">{t('scene.empty')}</p>}
        <SceneGroup label={t('scene.models', { count: modelRows.length })}>
          {modelRows.map((m) => (
            <SceneRow key={m.modelId} name={m.modelInfo.fileName} on={!hidden.has(m.modelId)} onToggle={() => toggleModel(m.modelId)} label={t('scene.show', { name: m.modelInfo.fileName })} />
          ))}
        </SceneGroup>
        <SceneGroup label={t('scene.scans', { count: clouds.length })}>
          {clouds.map((c) => (
            <SceneRow key={c.id} name={c.fileName} meta={c.pointCount ? `${(c.pointCount / 1e6).toFixed(1)} M` : undefined} on={c.visible} onToggle={() => setCloudVisible(c.id, !c.visible)} label={t('scene.show', { name: c.fileName })} />
          ))}
        </SceneGroup>
        <label className="flex items-center gap-1.5 min-h-[26px] text-[var(--text-dim)]">
          <input type="checkbox" checked={s.liveData} onChange={(e) => s.setLiveData(e.target.checked)} /> {t('live', { count: markerCount })}
        </label>
      </Section>
      <Section title={t('scene.sheets', { count: s.drawings.length })} action={s.drawings.length > 0 ? <button type="button" className={btn} onClick={layFlat}>{t('scene.stack')}</button> : undefined}>
        {s.drawings.length === 0 && <p className="text-[var(--text-faint)]">{t('scene.noSheets')}</p>}
        <ul className="flex flex-col gap-1">
          {s.drawings.map((d) => (
            <li key={d.id} className={`rounded-md border p-1.5 ${d.id === active?.id ? 'border-[var(--accent)]' : 'border-[var(--border)]'}`}>
              <div className="flex items-center gap-1.5">
                <input type="checkbox" aria-label={t('scene.show', { name: d.name })} checked={d.visible} onChange={(e) => s.patch(d.id, { visible: e.target.checked })} />
                <button type="button" className="flex-1 min-w-0 text-left truncate" title={d.name} onClick={() => s.setActive(d.id)}>{d.name}</button>
                <span className="text-[9px] font-mono uppercase text-[var(--text-faint)]">{d.source}</span>
              </div>
              {d.source !== 'section' && (
                <div className="flex items-center gap-1.5 mt-1 pl-5">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={d.in3d} onChange={(e) => s.patch(d.id, { in3d: e.target.checked })} /> {t('scene.in3d')}</label>
                  {d.in3d && <Num label={t('elevation')} value={d.elevation} onChange={(v) => s.patch(d.id, { elevation: v })} step={0.5} width="w-14 ml-auto" />}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}

function SceneGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1.5">
      <p className="text-[var(--text-faint)] mb-0.5">{label}</p>
      <ul className="flex flex-col">{children}</ul>
    </div>
  )
}

function SceneRow({ name, meta, on, onToggle, label }: { name: string; meta?: string; on: boolean; onToggle(): void; label: string }) {
  return (
    <li className="flex items-center gap-1.5 min-h-[24px]">
      <input type="checkbox" aria-label={label} checked={on} onChange={onToggle} />
      <span className="flex-1 min-w-0 truncate" title={name}>{name}</span>
      {meta && <span className="font-mono text-[10px] text-[var(--text-faint)]">{meta}</span>}
    </li>
  )
}

// ── Create ────────────────────────────────────────────────────────────────────

type Task = 'plan' | 'section' | 'set' | 'scan' | 'compare'
const TASKS: Task[] = ['plan', 'section', 'set', 'scan', 'compare']

/** One soup map per run: models don't change while the form is being filled in. */
async function soupsOf(api: ViewerAPI): Promise<[string, Float32Array[]][]> {
  return [...(await api.collectDrawingSoups(SKIP_CATEGORIES))]
}

export async function cutPlan(api: ViewerAPI, y: number, options: BuildCutOptions) {
  const soups = await soupsOf(api)
  return runDrawingJob<ReturnType<typeof buildCut>>({ kind: 'cut', soups, plane: { kind: 'plan', y }, options })
}

export function CreatePanel({ viewerApiRef, busy, run, fail, say }: PanelShared) {
  const { t } = useTranslation('drawings')
  const s = useDrawingStore()
  const clouds = usePointCloudStore((st) => st.clouds)
  // Only to re-read the bounds when a model arrives or goes.
  useModelStore((st) => st.models)
  const [task, setTask] = useState<Task>('plan')
  const [levels, setLevels] = useState<{ name: string; y: number }[]>([])
  const [levelIdx, setLevelIdx] = useState(0)
  const [height, setHeight] = useState(1.2)
  const [axis, setAxis] = useState<'sectionX' | 'sectionY'>('sectionX')
  const [pos, setPos] = useState(50)
  const [beyond, setBeyond] = useState(2.5)
  const [poche, setPoche] = useState(true)
  const [cloudId, setCloudId] = useState('')
  const [thickness, setThickness] = useState(0.1)
  const [cell, setCell] = useState(0.02)
  const [tolerance, setTolerance] = useState(0.03)
  const [againstModel, setAgainstModel] = useState(true)
  const [before, setBefore] = useState('')
  const [after, setAfter] = useState('')
  const box = viewerApiRef.current?.drawingSceneBounds() ?? null
  const hasModels = !!box

  useEffect(() => {
    const api = viewerApiRef.current
    if (api) void api.getStoreyLevels().then(setLevels).catch(() => setLevels([]))
  }, [viewerApiRef, hasModels])

  const options: BuildCutOptions = { beyond, poche }
  const level = levels[levelIdx]
  const baseY = level?.y ?? box?.min.y ?? 0
  const planName = (name: string | undefined) => t('generate.planName', { level: name ?? '', height })

  const doPlan = () => run(async () => {
    const api = viewerApiRef.current; if (!api) return
    const started = performance.now()
    const cut = await cutPlan(api, baseY + height, options)
    if (!cut.entities.length) { fail(t('errors.emptyCut')); return }
    s.addDrawing({ name: planName(level?.name), source: 'plan', layers: cut.layers, entities: cut.entities, metresPerUnit: 1, placement: IDENTITY, elevation: Math.round(baseY * 1000) / 1000 })
    say(t('create.done', { count: cut.entities.length, seconds: ((performance.now() - started) / 1000).toFixed(1) }))
    trackFeatureUsed({ feature: 'drawing_generate' })
  })

  const doSection = () => run(async () => {
    const api = viewerApiRef.current; if (!api || !box) return
    const started = performance.now()
    const plane: CutPlane = axis === 'sectionX'
      ? { kind: 'sectionX', x: box.min.x + (box.max.x - box.min.x) * pos / 100 }
      : { kind: 'sectionY', z: box.min.z + (box.max.z - box.min.z) * pos / 100 }
    const cut = await runDrawingJob<ReturnType<typeof buildCut>>({ kind: 'cut', soups: await soupsOf(api), plane, options })
    if (!cut.entities.length) { fail(t('errors.emptyCut')); return }
    // A section lives in its own plane: sheets of the plan must not lie over it.
    for (const d of useDrawingStore.getState().drawings) s.patch(d.id, { visible: false })
    s.addDrawing({ name: t('generate.sectionName', { axis: axis === 'sectionX' ? 'X' : 'Y', pos: Math.round(pos) }), source: 'section', layers: cut.layers, entities: cut.entities, metresPerUnit: 1, placement: IDENTITY })
    say(t('create.done', { count: cut.entities.length, seconds: ((performance.now() - started) / 1000).toFixed(1) }))
    trackFeatureUsed({ feature: 'drawing_generate' })
  })

  const doSet = () => run(async () => {
    const api = viewerApiRef.current; if (!api || !levels.length) return
    const started = performance.now()
    const soups = await soupsOf(api)
    let made = 0
    for (const l of levels) {
      const cut = await runDrawingJob<ReturnType<typeof buildCut>>({ kind: 'cut', soups, plane: { kind: 'plan', y: l.y + height }, options })
      if (!cut.entities.length) continue
      s.addDrawing({ name: planName(l.name), source: 'plan', layers: cut.layers, entities: cut.entities, metresPerUnit: 1, placement: IDENTITY, elevation: Math.round(l.y * 1000) / 1000 })
      made++
    }
    if (!made) { fail(t('errors.emptyCut')); return }
    say(t('create.setDone', { count: made, seconds: ((performance.now() - started) / 1000).toFixed(1) }))
    trackFeatureUsed({ feature: 'drawing_sheet_set' })
  })

  const doScan = () => run(async () => {
    const api = viewerApiRef.current; if (!api) return
    const id = cloudId || clouds[0]?.id
    if (!id) return
    const pc = await api.getPointClouds()
    // A cap in memory, not in quality: the band is a sliver, and a grid cell needs few hits.
    const sample = pc.samplePoints(id, 20_000_000)
    if (!sample) { fail(t('errors.emptyScan')); return }
    const y = hasModels ? baseY + height : (pc.getBounds(id)?.min.y ?? 0) + height
    let reference: Pt[][] | null = null
    if (againstModel && hasModels) {
      const cut = await cutPlan(api, y, {})
      reference = cut.entities.flatMap((e) => (e.kind === 'polyline' ? [e.closed ? [...e.points, e.points[0]] : e.points] : []))
    }
    const r = await runDrawingJob<ScanSlice>({ kind: 'scan', positions: sample.positions, reference, options: { plane: { kind: 'plan', y }, thickness, cell, tolerance } })
    if (!r.entities.length) { fail(t('errors.emptyScan')); return }
    s.addDrawing({
      name: t('create.scanName', { height: Math.round(y * 100) / 100 }), source: 'scan', layers: r.layers, entities: r.entities,
      metresPerUnit: 1, placement: IDENTITY, elevation: Math.round(baseY * 1000) / 1000, lineWeight: cell,
    })
    const pct = (n: number) => Math.round((n / Math.max(r.report.cells, 1)) * 100)
    say(reference
      ? t('create.scanReport', { matches: pct(r.report.matches), check: pct(r.report.check), differs: pct(r.report.differs), tolerance: Math.round(tolerance * 1000) })
      : t('create.scanPlain', { count: r.report.pointsInBand }))
    trackFeatureUsed({ feature: 'drawing_scan_slice' })
  })

  const doCompare = () => run(async () => {
    const a = s.drawings.find((d) => d.id === before)
    const b = s.drawings.find((d) => d.id === after)
    if (!a || !b || a === b) return
    const diff = diffSheets(a, b)
    s.addDrawing({ name: t('create.diffName', { before: a.name, after: b.name }), source: 'diff', layers: diff.layers, entities: diff.entities, metresPerUnit: 1, placement: IDENTITY })
    say(t('create.diffReport', { added: diff.added, removed: diff.removed, same: diff.same }))
    trackFeatureUsed({ feature: 'drawing_compare' })
  })

  const levelField = (
    <>
      <Row label={t('generate.level')}>
        <select className={`${field} w-32`} value={levelIdx} onChange={(e) => setLevelIdx(Number(e.target.value))}>
          {levels.length === 0 && <option value={0}>{t('generate.base')}</option>}
          {levels.map((l, i) => <option key={`${l.name}-${i}`} value={i}>{l.name}</option>)}
        </select>
      </Row>
      <Row label={t('generate.height')}><Num label={t('generate.height')} value={height} onChange={setHeight} /></Row>
    </>
  )
  const drawnLook = (
    <>
      <Row label={t('create.beyond')}><Num label={t('create.beyond')} value={beyond} onChange={(v) => setBeyond(Math.max(0, v))} step={0.5} /></Row>
      <label className="flex items-center gap-1.5 min-h-[26px] text-[var(--text-dim)]"><input type="checkbox" checked={poche} onChange={(e) => setPoche(e.target.checked)} /> {t('create.poche')}</label>
    </>
  )
  // Not while it is still arriving: a slice of half a cloud reads as half a building.
  const canScan = clouds.some((c) => c.status === 'ready')

  return (
    <>
      <div role="tablist" aria-label={t('create.what')} className="flex flex-col p-1.5 gap-0.5 border-b border-[var(--border)]">
        {TASKS.map((id) => (
          <button
            key={id} type="button" role="tab" aria-selected={task === id} onClick={() => setTask(id)}
            className={`text-left rounded-md px-2 py-1.5 ${task === id ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)]'}`}
          >
            <span className="block">{t(`create.${id}.title`)}</span>
            <span className="block text-[10px] text-[var(--text-faint)] leading-snug">{t(`create.${id}.blurb`)}</span>
          </button>
        ))}
      </div>
      <div className="p-2.5 flex flex-col gap-0.5">
        {task === 'plan' && <>
          {!hasModels && <p className="text-[var(--text-faint)] mb-1">{t('generate.needModel')}</p>}
          {levelField}{drawnLook}
          <button type="button" className={`${btn} w-full mt-1.5`} disabled={!hasModels || busy} onClick={() => void doPlan()}>{t('generate.run')}</button>
        </>}
        {task === 'section' && <>
          {!hasModels && <p className="text-[var(--text-faint)] mb-1">{t('generate.needModel')}</p>}
          <Row label={t('generate.kind')}>
            <select className={`${field} w-32`} value={axis} onChange={(e) => setAxis(e.target.value as typeof axis)}>
              <option value="sectionX">{t('generate.sectionX')}</option>
              <option value="sectionY">{t('generate.sectionY')}</option>
            </select>
          </Row>
          <Row label={`${t('generate.position')} ${pos}%`}><input aria-label={t('generate.position')} type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} className="w-28" /></Row>
          {drawnLook}
          <button type="button" className={`${btn} w-full mt-1.5`} disabled={!hasModels || busy} onClick={() => void doSection()}>{t('generate.run')}</button>
        </>}
        {task === 'set' && <>
          <p className="text-[var(--text-dim)] mb-1">{levels.length ? t('create.set.count', { count: levels.length }) : t('create.set.none')}</p>
          <Row label={t('generate.height')}><Num label={t('generate.height')} value={height} onChange={setHeight} /></Row>
          {drawnLook}
          <button type="button" className={`${btn} w-full mt-1.5`} disabled={!levels.length || busy} onClick={() => void doSet()}>{t('create.set.run')}</button>
        </>}
        {task === 'scan' && <>
          {!canScan && <p className="text-[var(--text-faint)] mb-1">{t('create.scan.need')}</p>}
          <Row label={t('create.scan.cloud')}>
            <select className={`${field} w-32`} value={cloudId} onChange={(e) => setCloudId(e.target.value)}>
              {clouds.map((c) => <option key={c.id} value={c.id}>{c.fileName}</option>)}
            </select>
          </Row>
          {levelField}
          <Row label={t('create.scan.thickness')}><Num label={t('create.scan.thickness')} value={thickness} onChange={(v) => setThickness(Math.max(0.005, v))} step={0.01} /></Row>
          <Row label={t('create.scan.cell')}><Num label={t('create.scan.cell')} value={cell} onChange={(v) => setCell(Math.max(0.002, v))} step={0.005} /></Row>
          <label className="flex items-center gap-1.5 min-h-[26px] text-[var(--text-dim)]"><input type="checkbox" checked={againstModel} disabled={!hasModels} onChange={(e) => setAgainstModel(e.target.checked)} /> {t('create.scan.against')}</label>
          {againstModel && hasModels && <Row label={t('create.scan.tolerance')}><Num label={t('create.scan.tolerance')} value={tolerance} onChange={(v) => setTolerance(Math.max(0.001, v))} step={0.005} /></Row>}
          <button type="button" className={`${btn} w-full mt-1.5`} disabled={!canScan || busy} onClick={() => void doScan()}>{t('generate.run')}</button>
        </>}
        {task === 'compare' && <>
          {s.drawings.length < 2 && <p className="text-[var(--text-faint)] mb-1">{t('create.compare.need')}</p>}
          {([['before', before, setBefore], ['after', after, setAfter]] as const).map(([k, value, set]) => (
            <Row key={k} label={t(`create.compare.${k}`)}>
              <select className={`${field} w-36`} value={value} onChange={(e) => set(e.target.value)}>
                <option value="">—</option>
                {s.drawings.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Row>
          ))}
          <button type="button" className={`${btn} w-full mt-1.5`} disabled={!before || !after || before === after || busy} onClick={() => void doCompare()}>{t('create.compare.run')}</button>
        </>}
      </div>
    </>
  )
}

// ── Layers ────────────────────────────────────────────────────────────────────

const MAX_ROWS = 300

export function LayersPanel({ active }: PanelShared) {
  const { t } = useTranslation('drawings')
  const s = useDrawingStore()
  const [query, setQuery] = useState('')
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of active?.entities ?? []) m.set(e.layer, (m.get(e.layer) ?? 0) + 1)
    return m
  }, [active?.entities])
  if (!active) return <p className="p-2.5 text-[var(--text-faint)]">{t('noSheet')}</p>
  const q = query.trim().toLowerCase()
  const shown = q ? active.layers.filter((l) => l.name.toLowerCase().includes(q)) : active.layers
  const names = new Set(shown.map((l) => l.name))
  const patchLayer = (name: string, p: Partial<Drawing['layers'][number]>) => s.edit(active.id, (d) => ({ layers: d.layers.map((l) => (l.name === name ? { ...l, ...p } : l)) }))
  const setAll = (visible: boolean) => s.edit(active.id, (d) => ({ layers: d.layers.map((l) => (names.has(l.name) ? { ...l, visible } : l)) }))
  const isolate = (name: string) => s.edit(active.id, (d) => ({ layers: d.layers.map((l) => ({ ...l, visible: l.name === name })) }))
  const addLayer = () => {
    let n = active.layers.length
    let name = `${t('layers.new')} ${n}`
    while (active.layers.some((l) => l.name === name)) name = `${t('layers.new')} ${++n}`
    s.edit(active.id, (d) => ({ layers: [...d.layers, { name, color: LAYER_PALETTE[n % LAYER_PALETTE.length], visible: true, locked: false }] }))
    s.setActiveLayer(name)
  }
  const deleteLayer = (name: string) => {
    if (active.layers.length < 2) return
    s.edit(active.id, (d) => ({ layers: d.layers.filter((l) => l.name !== name), entities: d.entities.filter((e) => e.layer !== name) }))
    if (s.activeLayer === name) s.setActiveLayer(active.layers.find((l) => l.name !== name)?.name ?? null)
  }
  return (
    <Section title={t('layers.title', { count: active.layers.length })} action={<button type="button" className={btn} onClick={addLayer}>{t('layers.add')}</button>}>
      <input aria-label={t('layers.search')} placeholder={t('layers.search')} className={`${field} w-full mb-1`} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={stop} />
      <div className="flex gap-1 mb-1.5">
        <button type="button" className={`${btn} flex-1`} onClick={() => setAll(true)}>{t('layers.allOn')}</button>
        <button type="button" className={`${btn} flex-1`} onClick={() => setAll(false)}>{t('layers.allOff')}</button>
      </div>
      <ul className="flex flex-col">
        {shown.slice(0, MAX_ROWS).map((l) => (
          <li key={l.name} className={`group flex items-center gap-1 rounded px-1 min-h-[26px] ${s.activeLayer === l.name ? 'bg-[var(--surface-2)]' : ''}`}>
            <input type="checkbox" aria-label={t('layers.visible', { name: l.name })} checked={l.visible} onChange={(e) => patchLayer(l.name, { visible: e.target.checked })} />
            <input type="color" aria-label={t('layers.color', { name: l.name })} value={l.color} onChange={(e) => patchLayer(l.name, { color: e.target.value })} className="w-4 h-4 p-0 border-0 bg-transparent shrink-0" />
            <button type="button" className="flex-1 min-w-0 truncate text-left" title={t('layers.makeActive', { name: l.name })} onClick={() => s.setActiveLayer(l.name)}>{l.name}</button>
            <span className="font-mono text-[10px] text-[var(--text-faint)]">{counts.get(l.name) ?? 0}</span>
            <button type="button" className="text-[10px] text-[var(--text-faint)] hover:text-[var(--text)] px-0.5" title={t('layers.isolate', { name: l.name })} aria-label={t('layers.isolate', { name: l.name })} onClick={() => isolate(l.name)}>◎</button>
            <button type="button" aria-label={t('layers.lock', { name: l.name })} aria-pressed={l.locked} className={l.locked ? 'text-[var(--accent)]' : 'text-[var(--text-faint)]'} onClick={() => patchLayer(l.name, { locked: !l.locked })}>{l.locked ? '■' : '□'}</button>
            <button type="button" aria-label={t('layers.delete', { name: l.name })} className="text-[var(--text-faint)] hover:text-[var(--danger)]" onClick={() => deleteLayer(l.name)}>×</button>
          </li>
        ))}
      </ul>
      {shown.length > MAX_ROWS && <p className="mt-1 text-[var(--text-faint)]">{t('layers.more', { count: shown.length - MAX_ROWS })}</p>}
    </Section>
  )
}

// ── This sheet ────────────────────────────────────────────────────────────────

export function SheetPanel({ active, busy, onPage, pdfInfo }: PanelShared & { onPage(delta: number): void; pdfInfo?: { lines: number; texts: number } }) {
  const { t } = useTranslation('drawings')
  const s = useDrawingStore()
  if (!active) return <p className="p-2.5 text-[var(--text-faint)]">{t('noSheet')}</p>
  const p = active.placement
  const place = (next: Partial<Drawing['placement']>) => s.edit(active.id, (d) => ({ placement: { ...d.placement, ...next } }))
  const moved = p.rotation !== 0 || p.x !== 0 || p.y !== 0
  const skipped = Object.entries(active.skipped)
  const anchored = active.source === 'plan' || active.source === 'section' || active.source === 'scan' || active.source === 'diff'
  return (
    <>
      <Section title={t('sheetSection')}>
        <input aria-label={t('sheet')} className={`${field} w-full mb-1`} value={active.name} onChange={(e) => s.patch(active.id, { name: e.target.value })} onKeyDown={stop} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[var(--text-dim)]">
          <dt>{t('stats.source')}</dt><dd className="text-right font-mono uppercase text-[10px] leading-5">{active.source}</dd>
          <dt>{t('stats.entities')}</dt><dd className="text-right font-mono">{active.entities.length.toLocaleString()}</dd>
          {pdfInfo && <><dt>{t('stats.vectors')}</dt><dd className="text-right font-mono">{pdfInfo.lines.toLocaleString()} / {pdfInfo.texts.toLocaleString()}</dd></>}
        </dl>
        {pdfInfo && pdfInfo.lines === 0 && <p className="mt-1 text-[var(--text-faint)] leading-snug">{t('stats.scanned')}</p>}
        {skipped.length > 0 && <p className="mt-1 text-[var(--text-faint)] leading-snug">{t('import.skipped', { list: skipped.map(([k, n]) => `${k} ×${n}`).join(', ') })}</p>}
        {active.page && active.page.pageCount > 1 && (
          <div className="flex items-center gap-1 mt-1.5">
            <button type="button" className={btn} disabled={busy || active.page.pageNumber <= 1} onClick={() => onPage(-1)}>‹</button>
            <span className="flex-1 text-center">{t('page', { n: active.page.pageNumber, total: active.page.pageCount })}</span>
            <button type="button" className={btn} disabled={busy || active.page.pageNumber >= active.page.pageCount} onClick={() => onPage(1)}>›</button>
          </div>
        )}
      </Section>
      <Section title={t('place.title')}>
        <p className={`mb-1 leading-snug ${anchored ? 'text-[var(--text-dim)]' : active.metresPerUnit ? 'text-[var(--text-dim)]' : 'text-[var(--danger)]'}`}>
          {anchored ? t('place.anchored') : active.metresPerUnit ? t('units', { value: active.metresPerUnit.toPrecision(4) }) : t('noUnits')}
        </p>
        <div className="flex gap-1 mb-1.5">
          <button type="button" className={`${btn} flex-1`} disabled={anchored} onClick={() => s.setTool('calibrate')}>{t('tools.calibrate')}</button>
          <button type="button" className={`${btn} flex-1`} disabled={anchored} onClick={() => s.setTool('align')}>{t('tools.align')}</button>
        </div>
        <Row label={t('place.scale')}><Num label={t('place.scale')} value={p.scale} onChange={(v) => { if (v > 0) place({ scale: v }) }} step={0.001} /></Row>
        <Row label={t('place.rotation')}><Num label={t('place.rotation')} value={Math.round((p.rotation * 180 / Math.PI) * 1000) / 1000} onChange={(v) => place({ rotation: v * Math.PI / 180 })} step={1} /></Row>
        <Row label="X (m)"><Num label="X" value={Math.round(p.x * 1000) / 1000} onChange={(v) => place({ x: v })} /></Row>
        <Row label="Y (m)"><Num label="Y" value={Math.round(p.y * 1000) / 1000} onChange={(v) => place({ y: v })} /></Row>
        {moved && !anchored && <button type="button" className={`${btn} w-full mt-1`} onClick={() => s.edit(active.id, (d) => ({ placement: { ...IDENTITY, scale: d.metresPerUnit ?? 1 } }))}>{t('fileCoords')}</button>}
      </Section>
      <Section title={t('place.look')}>
        <Row label={`${t('place.opacity')} ${Math.round((active.opacity ?? 1) * 100)}%`}>
          <input aria-label={t('place.opacity')} type="range" min={10} max={100} value={Math.round((active.opacity ?? 1) * 100)} onChange={(e) => s.patch(active.id, { opacity: Number(e.target.value) / 100 })} className="w-28" />
        </Row>
        <button type="button" className={`${btn} w-full mt-1 hover:text-[var(--danger)]`} onClick={() => s.removeDrawing(active.id)}>{t('remove')}</button>
      </Section>
    </>
  )
}

// ── Output ────────────────────────────────────────────────────────────────────

export interface OutputOptions { paper: PaperSize; title: string; project: string; author: string }

export function OutputPanel({ active, options, setOptions, onExport, onExportAll, sheetCount, busy, cloud }: PanelShared & {
  options: OutputOptions
  setOptions(o: OutputOptions): void
  onExport(kind: 'dxf' | 'svg' | 'pdf'): void
  onExportAll(): void
  sheetCount: number
  cloud?: React.ReactNode
}) {
  const { t } = useTranslation('drawings')
  const set = (p: Partial<OutputOptions>) => setOptions({ ...options, ...p })
  return (
    <>
      <Section title={t('export.title')}>
        {!active && <p className="text-[var(--text-faint)]">{t('noSheet')}</p>}
        <div className="flex flex-col gap-1">
          <input aria-label={t('export.sheetTitle')} placeholder={active?.name ?? t('export.sheetTitle')} className={field} value={options.title} onChange={(e) => set({ title: e.target.value })} onKeyDown={stop} />
          <input aria-label={t('export.project')} placeholder={t('export.project')} className={field} value={options.project} onChange={(e) => set({ project: e.target.value })} onKeyDown={stop} />
          <input aria-label={t('export.author')} placeholder={t('export.author')} className={field} value={options.author} onChange={(e) => set({ author: e.target.value })} onKeyDown={stop} />
          <Row label={t('export.paper')}>
            <select className={`${field} w-20`} value={options.paper} onChange={(e) => set({ paper: e.target.value as PaperSize })}>
              {(Object.keys(PAPER) as PaperSize[]).map((p) => <option key={p}>{p}</option>)}
            </select>
          </Row>
          <div className="flex gap-1">
            {(['dxf', 'svg', 'pdf'] as const).map((k) => <button key={k} type="button" className={`${btn} flex-1 uppercase`} disabled={!active || busy} onClick={() => onExport(k)}>{k}</button>)}
          </div>
          <button type="button" className={`${btn} w-full`} disabled={sheetCount < 2 || busy} onClick={onExportAll}>{t('export.all', { count: sheetCount })}</button>
        </div>
      </Section>
      {cloud}
    </>
  )
}

export type { NewEntity }
