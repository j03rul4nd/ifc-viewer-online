// ─── TwinDevicesPanel ─────────────────────────────────────────────────────────
// Operational twin: API sources whose devices drive what IFC elements look
// like. Three blocks, in the order a user builds one:
//   1. Sources — an endpoint polled every N s (or the built-in simulated home).
//   2. Devices — what the last response contained, with "bind to selection".
//   3. Bindings — device → elements (any loaded model, by GlobalId) + rules.
// Plus the `.twin.json` export/import that travels with the project's IFCs.

import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ViewportPanel } from './ViewportPanel'
import { useTwinDeviceStore, loadSecrets, selectShownReadings } from '../stores/twinDeviceStore'
import { clearTwinHistory } from '../lib/twin/device-runner'
import { useValidationStore } from '../stores/validationStore'
import { toast } from '../stores/toastStore'
import {
  DEFAULT_MAPPING, bindingState, buildCatalog, buildGuidIndex, deviceKey, newTwinId, queryMatches, resolveLocs,
  type Binding, type CatalogEntry, type DeviceSource, type Reading, type TwinRule,
} from '../lib/twin/devices'
import { demoBindings, simulatedSource } from '../lib/twin/device-sim'
import { exportTwinProject, parseTwinProject } from '../lib/twin/twin-project'
import type { FilterOp } from '../lib/layers/style-groups'
import type { SelectedInfo, SpatialNode } from '../types'

const inputCls =
  'w-full min-w-0 px-2 py-1.5 max-md:py-2.5 rounded-[7px] text-[11px] max-md:text-[13px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]'
const btnCls =
  'shrink-0 px-2.5 py-1.5 max-md:py-2.5 rounded-[7px] text-[11px] max-md:text-[13px] font-medium border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-colors disabled:opacity-40'
const linkCls = 'text-left text-[10px] text-[var(--accent)] hover:underline disabled:opacity-40 disabled:no-underline'

const OPS: FilterOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isTrue', 'isFalse', 'contains', 'exists', 'missing']
const NO_VALUE: FilterOp[] = ['isTrue', 'isFalse', 'exists', 'missing']

/** GlobalId + label of the selected element, looked up in its model's tree. */
function selectionRef(selected: SelectedInfo | null, trees: Record<string, SpatialNode[]>): { globalId: string; label: string } | null {
  if (!selected?.modelId) return null
  const id = Number(selected.id)
  let found: { globalId: string; label: string } | null = null
  const visit = (n: SpatialNode): void => {
    if (found) return
    if (n.expressId === id) { found = { globalId: n.globalId, label: n.name || n.ifcClass }; return }
    const e = n.containedElements.find((x) => x.expressId === id)
    if (e) { found = { globalId: e.globalId, label: e.name || e.ifcClass }; return }
    n.children.forEach(visit)
  }
  ;(trees[selected.modelId] ?? []).forEach(visit)
  return found
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const timeOf = (ms: number | null): string => (ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—')

function metricsLine(r: Reading, max = 3): string {
  return r.props.filter((p) => !p.joined && p.field !== 'id' && p.field !== 'updated' && p.field !== 'kind')
    .slice(0, max).map((p) => `${p.field} ${p.display}`).join(' · ')
}

export default function TwinDevicesPanel({ selected, onClose }: { selected: SelectedInfo | null; onClose: () => void }) {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const open = useTwinDeviceStore((s) => s.panelOpen)
  const active = useTwinDeviceStore((s) => s.active)
  const sources = useTwinDeviceStore((s) => s.sources)
  const bindings = useTwinDeviceStore((s) => s.bindings)
  const readings = useTwinDeviceStore(selectShownReadings)
  const timeAt = useTwinDeviceStore((s) => s.timeAt)
  const alerting = useTwinDeviceStore((s) => s.alerting)
  const status = useTwinDeviceStore((s) => s.status)
  const trees = useValidationStore((s) => s.spatialTrees)
  const store = useTwinDeviceStore.getState
  const fileRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [openBinding, setOpenBinding] = useState<string | null>(null)

  const guidIndex = useMemo(() => buildGuidIndex(trees), [trees])
  const catalog = useMemo(() => buildCatalog(trees), [trees])
  const sel = useMemo(() => selectionRef(selected, trees), [selected, trees])
  const modelCount = Object.keys(trees).length
  const now = timeAt ?? Date.now()

  const startDemo = (): void => {
    const src = simulatedSource()
    src.name = t('demoName')
    const list = demoBindings(trees, src.id)
    store().upsertSource(src)
    list.forEach((b) => store().upsertBinding(b))
    store().setActive(true)
    toast(list.length ? t('demoBound', { count: list.length }) : t('demoNoTargets'), list.length ? 'success' : 'info')
  }

  const addSource = (): void => {
    const src: DeviceSource = { id: newTwinId('s'), name: t('newSource'), url: '', intervalS: 30, mapping: { ...DEFAULT_MAPPING }, enabled: false }
    store().upsertSource(src)
    setEditing(src.id)
  }

  const bindDevice = (r: Reading): void => {
    if (!sel) return
    const b: Binding = {
      id: newTwinId('b'), name: `${sel.label} · ${r.deviceId}`, sourceId: r.sourceId, deviceId: r.deviceId,
      targets: [sel], rules: [], staleColor: null, staleAfterS: 0,
    }
    store().upsertBinding(b)
    setOpenBinding(b.id)
  }

  const onImport = async (file: File): Promise<void> => {
    const doc = parseTwinProject(await file.text())
    if (!doc) { toast(t('importBad'), 'error'); return }
    store().replaceAll(doc.sources, doc.bindings)
    toast(t('imported', { sources: doc.sources.length, bindings: doc.bindings.length }), 'success')
  }

  return (
    <ViewportPanel id="twin-devices" open={open} onClose={onClose} label={t('title')} mobile="sheet" peek widthPx={330} anchor="top">
      <div className="flex-1 min-h-0 flex flex-col gap-3 p-3 max-md:pt-1 overflow-y-auto overscroll-contain" data-testid="twin-devices-panel">
        <div className="flex items-start gap-2">
          <div className="flex-1 text-[10px] text-[var(--text-faint)] leading-snug">{t('intro')}</div>
          <label className="flex items-center gap-1 text-[10px] text-[var(--text-dim)] shrink-0">
            <input type="checkbox" checked={active} onChange={(e) => store().setActive(e.target.checked)} data-testid="twin-active" />
            {t('live')}
          </label>
        </div>
        <div className="text-[10px] text-[var(--text-dim)]">{t('models', { count: modelCount })}</div>

        <TimeTravel />

        {sources.length === 0 && (
          <div className="flex flex-col gap-1.5 p-2 rounded-[7px] bg-[var(--surface-2)]">
            <div className="text-[11px] font-medium">{t('emptyTitle')}</div>
            <div className="text-[10px] text-[var(--text-dim)] leading-snug">{t('emptyHint')}</div>
            <button className={btnCls} disabled={modelCount === 0} onClick={startDemo} data-testid="twin-demo">{t('demo')}</button>
          </div>
        )}

        {/* ── Sources ── */}
        <section className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[11px] font-medium">{t('sources')}</span>
            <button className={linkCls} onClick={addSource}>{t('addSource')}</button>
          </div>
          {sources.map((s) => {
            const st = status[s.id]
            return (
              <div key={s.id} className="flex flex-col gap-1 p-2 rounded-[7px] border border-[var(--border)]">
                <div className="flex items-center gap-1.5">
                  <input type="checkbox" checked={s.enabled} title={t('enabled')}
                    onChange={(e) => store().upsertSource({ ...s, enabled: e.target.checked })} />
                  <span className="flex-1 truncate text-[11px]">{s.name}</span>
                  <span className={`text-[10px] ${st?.state === 'error' ? 'text-[var(--danger,#ef4444)]' : 'text-[var(--text-faint)]'}`}>
                    {!s.enabled ? t('off') : st?.state === 'error' ? t((st.errorKey ?? 'error.http') as never) : st ? t('status', { count: st.devices, time: timeOf(st.lastAt) }) : t('waiting')}
                  </span>
                  <button className={linkCls} onClick={() => setEditing(editing === s.id ? null : s.id)}>{t('edit')}</button>
                </div>
                {editing === s.id && <SourceEditor source={s} onDone={() => setEditing(null)} />}
              </div>
            )
          })}
          {sources.length > 0 && sources.every((s) => !s.url.startsWith('sim:')) && (
            <button className={linkCls} disabled={modelCount === 0} onClick={startDemo}>{t('demo')}</button>
          )}
        </section>

        {/* ── Devices ── */}
        {readings.size > 0 && (
          <section className="flex flex-col gap-1 pt-2 border-t border-[var(--border)]">
            <div className="text-[11px] font-medium">{t('devices', { count: readings.size })}</div>
            <div className="text-[10px] text-[var(--text-faint)]">{sel ? t('bindHint', { name: sel.label }) : t('selectHint')}</div>
            <div className="flex flex-col max-h-[180px] overflow-y-auto">
              {[...readings.values()].map((r) => (
                <div key={deviceKey(r.sourceId, r.deviceId)} className="flex items-center gap-1.5 py-0.5 text-[10px]">
                  <span className="font-medium text-[var(--text)] shrink-0">{r.deviceId}</span>
                  <span className="flex-1 truncate text-[var(--text-dim)]">{metricsLine(r)}</span>
                  <button className={linkCls} disabled={!sel} onClick={() => bindDevice(r)} title={t('bind')}>{t('bind')}</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Bindings ── */}
        {bindings.length > 0 && (
          <section className="flex flex-col gap-1 pt-2 border-t border-[var(--border)]">
            <div className="text-[11px] font-medium">{t('bindings', { count: bindings.length })}</div>
            {bindings.map((b) => {
              const reading = readings.get(deviceKey(b.sourceId, b.deviceId))
              const state = bindingState(b, reading, now)
              const found = resolveLocs(b, guidIndex, catalog).length
              const ringing = alerting.some((k) => k.startsWith(`${b.id}/`))
              const color = state.kind === 'rule' ? state.rule.effect.color : state.kind === 'stale' || state.kind === 'nodata' ? b.staleColor : null
              const label = state.kind === 'rule' ? state.rule.name : state.kind === 'stale' ? t('stale') : state.kind === 'nodata' ? t('nodata') : t('noRule')
              return (
                <div key={b.id} className={`flex flex-col gap-1 p-2 rounded-[7px] border ${ringing ? 'border-[#ef4444]' : 'border-[var(--border)]'}`} data-testid="twin-binding">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-[var(--border)]" style={{ background: color ?? 'transparent' }} />
                    <button className="flex-1 min-w-0 text-left text-[11px] truncate" onClick={() => setOpenBinding(openBinding === b.id ? null : b.id)}>{b.name}</button>
                    <span className="text-[10px] text-[var(--text-dim)] shrink-0" data-testid="twin-binding-state">{label}</span>
                  </div>
                  <div className={`text-[10px] ${found ? 'text-[var(--text-faint)]' : 'text-[var(--warning,#f59e0b)]'}`}>
                    {ringing && <span className="text-[#ef4444] font-medium">{t('alerting')} · </span>}
                    {b.deviceId} → {found ? t('targetsFound', { count: found }) : t('targetsMissing', { count: b.targets.length })}
                  </div>
                  {openBinding === b.id && <BindingEditor binding={b} reading={reading} selection={sel} catalog={catalog} />}
                </div>
              )
            })}
          </section>
        )}

        {/* ── Project file ── */}
        <section className="flex flex-col gap-1 pt-2 border-t border-[var(--border)]">
          <div className="text-[11px] font-medium">{t('file')}</div>
          <div className="text-[10px] text-[var(--text-faint)] leading-snug">{t('fileHint')}</div>
          <div className="flex gap-1.5">
            <button className={btnCls} disabled={sources.length === 0}
              onClick={() => download('project.twin.json', exportTwinProject(sources, bindings))}>{t('export')}</button>
            <button className={btnCls} onClick={() => fileRef.current?.click()}>{t('import')}</button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImport(f); e.target.value = '' }} />
          </div>
        </section>
      </div>
    </ViewportPanel>
  )
}

function SourceEditor({ source, onDone }: { source: DeviceSource; onDone: () => void }) {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const [draft, setDraft] = useState(source)
  const [header, setHeader] = useState(() => Object.entries(loadSecrets()[source.id] ?? {})[0] ?? ['', ''])
  const store = useTwinDeviceStore.getState
  const m = draft.mapping
  const save = (): void => {
    store().setHeaders(source.id, header[0].trim() ? { [header[0].trim()]: header[1] } : null)
    store().upsertSource({ ...draft, enabled: draft.url.trim() ? true : draft.enabled })
    onDone()
  }
  return (
    <div className="flex flex-col gap-1 pt-1">
      <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t('name')} />
      <input className={inputCls} value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://…/api/devices" />
      <div className="flex gap-1">
        <input className={inputCls} value={m.listPath} onChange={(e) => setDraft({ ...draft, mapping: { ...m, listPath: e.target.value } })} placeholder={t('listPath')} title={t('listPathHint')} />
        <input className={inputCls} value={m.idField} onChange={(e) => setDraft({ ...draft, mapping: { ...m, idField: e.target.value } })} placeholder={t('idField')} />
        <input className={inputCls} value={m.timeField} onChange={(e) => setDraft({ ...draft, mapping: { ...m, timeField: e.target.value } })} placeholder={t('timeField')} />
      </div>
      <div className="flex gap-1 items-center">
        <span className="text-[10px] text-[var(--text-dim)] shrink-0">{t('every')}</span>
        <select className={inputCls} value={draft.intervalS} onChange={(e) => setDraft({ ...draft, intervalS: Number(e.target.value) })}>
          {[2, 5, 10, 30, 60, 300, 900].map((s) => <option key={s} value={s}>{s < 60 ? `${s} s` : `${s / 60} min`}</option>)}
        </select>
      </div>
      <div className="flex gap-1">
        <input className={inputCls} value={header[0]} onChange={(e) => setHeader([e.target.value, header[1]])} placeholder={t('headerName')} />
        <input className={inputCls} type="password" value={header[1]} onChange={(e) => setHeader([header[0], e.target.value])} placeholder={t('headerValue')} />
      </div>
      <div className="text-[10px] text-[var(--text-faint)] leading-snug">{t('headerHint')}</div>
      <div className="flex gap-1.5">
        <button className={btnCls} onClick={save}>{t('save')}</button>
        <button className={btnCls} onClick={() => { store().removeSource(source.id); onDone() }}>{t('remove')}</button>
      </div>
    </div>
  )
}

function BindingEditor({ binding: b, reading, selection, catalog }: {
  binding: Binding; reading: Reading | undefined; selection: { globalId: string; label: string } | null; catalog: CatalogEntry[]
}) {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const store = useTwinDeviceStore.getState
  const fields = reading ? [...new Set(reading.props.filter((p) => !p.joined).map((p) => p.field))] : []
  const put = (patch: Partial<Binding>): void => store().upsertBinding({ ...b, ...patch })
  const setRule = (i: number, r: TwinRule): void => put({ rules: b.rules.map((x, j) => (j === i ? r : x)) })
  const addRule = (): void => put({
    rules: [...b.rules, { id: newTwinId('r'), name: t('newRule'), match: 'all', filters: [{ field: fields[0] ?? '', op: 'gt', value: 0 }], effect: { color: '#ef4444', opacity: 1, hide: false } }],
  })
  const inSel = selection && b.targets.some((x) => x.globalId === selection.globalId)

  return (
    <div className="flex flex-col gap-1.5 pt-1">
      {reading && <div className="text-[10px] text-[var(--text-dim)] break-words">{metricsLine(reading, 8)} · {timeOf(reading.at)}</div>}
      <input className={inputCls} value={b.name} onChange={(e) => put({ name: e.target.value })} />
      <div className="text-[10px] text-[var(--text-dim)]">{t('rulesTitle')}</div>
      {b.rules.map((r, i) => {
        const f = r.filters[0]
        return (
          <div key={r.id} className="flex flex-col gap-1 p-1.5 rounded-[6px] bg-[var(--surface-2)]">
            <div className="flex gap-1 items-center">
              <input className={inputCls} value={r.name} onChange={(e) => setRule(i, { ...r, name: e.target.value })} />
              <input type="color" className="w-7 h-7 shrink-0 bg-transparent" value={r.effect.color ?? '#cccccc'}
                onChange={(e) => setRule(i, { ...r, effect: { ...r.effect, color: e.target.value } })} />
              <label className="flex items-center gap-0.5 text-[10px] text-[var(--text-dim)] shrink-0" title={t('hide')}>
                <input type="checkbox" checked={r.effect.hide} onChange={(e) => setRule(i, { ...r, effect: { ...r.effect, hide: e.target.checked } })} />{t('hide')}
              </label>
              <button className={linkCls} onClick={() => put({ rules: b.rules.filter((x) => x.id !== r.id) })}>✕</button>
            </div>
            <label className="flex items-center gap-1 text-[10px] text-[var(--text-dim)]">
              <input type="checkbox" checked={!!r.alert} onChange={(e) => setRule(i, { ...r, alert: e.target.checked ? { forMin: 0 } : null })} />
              {t('alert')}
              {r.alert && (
                <select className={inputCls + ' !w-auto'} value={r.alert.forMin} onChange={(e) => setRule(i, { ...r, alert: { forMin: Number(e.target.value) } })}>
                  {[0, 1, 5, 15, 60].map((m) => <option key={m} value={m}>{m === 0 ? t('alertNow') : t('alertFor', { count: m })}</option>)}
                </select>
              )}
            </label>
            {f ? (
              <div className="flex gap-1">
                <input className={inputCls} list={`twin-fields-${b.id}`} value={f.field}
                  onChange={(e) => setRule(i, { ...r, filters: [{ ...f, field: e.target.value }] })} placeholder={t('field')} />
                <select className={inputCls} value={f.op} onChange={(e) => setRule(i, { ...r, filters: [{ ...f, op: e.target.value as FilterOp }] })}>
                  {OPS.map((op) => <option key={op} value={op}>{t(`op.${op}` as never)}</option>)}
                </select>
                {!NO_VALUE.includes(f.op) && (
                  <input className={inputCls} value={String(f.value ?? '')}
                    onChange={(e) => {
                      const v = e.target.value
                      setRule(i, { ...r, filters: [{ ...f, value: v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v }] })
                    }} />
                )}
              </div>
            ) : <div className="text-[10px] text-[var(--text-faint)]">{t('always')}</div>}
          </div>
        )
      })}
      <datalist id={`twin-fields-${b.id}`}>{fields.map((f) => <option key={f} value={f} />)}</datalist>
      <button className={linkCls} onClick={addRule}>{t('addRule')}</button>
      <div className="flex gap-1 items-center">
        <span className="text-[10px] text-[var(--text-dim)] shrink-0">{t('staleAfter')}</span>
        <select className={inputCls} value={b.staleAfterS} onChange={(e) => put({ staleAfterS: Number(e.target.value), staleColor: Number(e.target.value) ? b.staleColor ?? '#7b8494' : b.staleColor })}>
          {[0, 30, 60, 300, 900, 3600].map((s) => <option key={s} value={s}>{s === 0 ? t('never') : s < 60 ? `${s} s` : `${s / 60} min`}</option>)}
        </select>
      </div>
      <div className="flex gap-1 items-center">
        <span className="text-[10px] text-[var(--text-dim)] shrink-0">{t('label')}</span>
        <select className={inputCls} value={b.label?.field ?? ''} onChange={(e) => put({ label: e.target.value ? { field: e.target.value } : null })}>
          <option value="">{t('labelNone')}</option>
          {fields.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <QueryEditor binding={b} catalog={catalog} onChange={(query) => put({ query })} />
      <div className="text-[10px] text-[var(--text-dim)]">{t('targets', { count: b.targets.length })}</div>
      <div className="flex flex-wrap gap-1">
        {b.targets.slice(0, 12).map((tg) => (
          <span key={tg.globalId} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[10px]" title={tg.globalId}>
            {tg.label}
            <button onClick={() => put({ targets: b.targets.filter((x) => x.globalId !== tg.globalId) })} aria-label={t('remove')}>✕</button>
          </span>
        ))}
        {b.targets.length > 12 && <span className="text-[10px] text-[var(--text-faint)]">+{b.targets.length - 12}</span>}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        <button className={linkCls} disabled={!selection || !!inSel} onClick={() => selection && put({ targets: [...b.targets, selection] })}>
          {t('addSelection')}
        </button>
        <span className="flex-1" />
        <button className={linkCls} onClick={() => store().moveBinding(b.id, -1)} title={t('priorityUp')}>↑</button>
        <button className={linkCls} onClick={() => store().moveBinding(b.id, 1)} title={t('priorityDown')}>↓</button>
        <button className={linkCls} onClick={() => store().removeBinding(b.id)}>{t('remove')}</button>
      </div>
    </div>
  )
}

function QueryEditor({ binding: b, catalog, onChange }: {
  binding: Binding; catalog: CatalogEntry[]; onChange: (q: Binding['query']) => void
}) {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const q = b.query ?? { classes: [], storey: '', nameContains: '' }
  const classes = useMemo(() => [...new Set(catalog.map((e) => e.ifcClass))].sort(), [catalog])
  const storeys = useMemo(() => [...new Set(catalog.map((e) => e.storey).filter(Boolean))].sort(), [catalog])
  const count = useMemo(() => (b.query ? catalog.filter((e) => queryMatches(q, e)).length : 0), [b.query, catalog, q])
  return (
    <div className="flex flex-col gap-1 p-1.5 rounded-[6px] bg-[var(--surface-2)]">
      <div className="flex items-center gap-1 text-[10px] text-[var(--text-dim)]">
        <span className="flex-1">{t('query')}</span>
        {b.query && <span data-testid="twin-query-count">{t('matches', { count })}</span>}
      </div>
      <div className="flex gap-1">
        <select className={inputCls} value={q.classes[0] ?? ''} onChange={(e) => onChange({ ...q, classes: e.target.value ? [e.target.value] : [] })}>
          <option value="">{t('queryAnyClass')}</option>
          {classes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={inputCls} value={q.storey} onChange={(e) => onChange({ ...q, storey: e.target.value })}>
          <option value="">{t('queryAnyStorey')}</option>
          {storeys.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <input className={inputCls} value={q.nameContains} placeholder={t('queryName')} onChange={(e) => onChange({ ...q, nameContains: e.target.value })} />
    </div>
  )
}

function TimeTravel() {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const span = useTwinDeviceStore((s) => s.historySpan)
  const timeAt = useTwinDeviceStore((s) => s.timeAt)
  const retentionH = useTwinDeviceStore((s) => s.retentionH)
  const sources = useTwinDeviceStore((s) => s.sources)
  const store = useTwinDeviceStore.getState
  return (
    <div className="flex flex-col gap-1 p-2 rounded-[7px] bg-[var(--surface-2)]" data-testid="twin-history">
      <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]">
        <span className="flex-1">{t('history')}</span>
        <select className={inputCls + ' !w-auto'} value={retentionH} onChange={(e) => store().setRetentionH(Number(e.target.value))} title={t('retention')}>
          {[0, 6, 24, 72, 168].map((h) => <option key={h} value={h}>{h === 0 ? t('historyOff') : h < 48 ? `${h} h` : `${h / 24} d`}</option>)}
        </select>
        {span && <button className={linkCls} onClick={() => { sources.forEach((s) => void clearTwinHistory(s.id)); store().setHistorySpan(null); store().setTimeAt(null) }}>{t('clearHistory')}</button>}
      </div>
      {span ? (
        <>
          <input type="range" min={span.from} max={span.to} step={1000} value={timeAt ?? span.to} data-testid="twin-time"
            onChange={(e) => store().setTimeAt(Number(e.target.value))} />
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className={timeAt === null ? 'text-[#22c55e]' : 'text-[var(--warning,#f59e0b)]'}>
              {timeAt === null ? t('timeLive') : new Date(timeAt).toLocaleString()}
            </span>
            <span className="flex-1" />
            {timeAt !== null && <button className={linkCls} onClick={() => store().setTimeAt(null)}>{t('backToLive')}</button>}
          </div>
        </>
      ) : <div className="text-[10px] text-[var(--text-faint)]">{retentionH ? t('historyEmpty') : t('historyDisabled')}</div>}
    </div>
  )
}
