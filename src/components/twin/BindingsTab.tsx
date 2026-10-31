// ─── Bindings: the operating view, and one binding's detail ───────────────────

import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTwinDeviceStore } from '../../stores/twinDeviceStore'
import { focusTwinBinding } from '../../lib/twin/device-runner'
import { bindingState, deviceKey, newTwinId, queryLocs, resolveLocs, type Binding, type TwinRule } from '../../lib/twin/devices'
import { stateKeyOf, stateSummary } from '../../lib/twin/series'
import type { Filter, FilterOp } from '../../lib/layers/style-groups'
import { Expander } from '../geo/ui'
import { Btn, EmptyNote, Field, Hint, IconBtn, inputCls, MARGIN, Section, VirtualRows } from './ui'
import { ALERT_FILTER, metricsLine, timeOf, useSelectionRef, useShownReadings, useTwinElements, useTwinNav } from './nav'
import { BackBar } from './ProjectTab'

const OPS: FilterOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isTrue', 'isFalse', 'contains', 'exists', 'missing']
const NO_VALUE: FilterOp[] = ['isTrue', 'isFalse', 'exists', 'missing']

const TargetIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
    <circle cx="8" cy="8" r="4.5" /><path d="M8 1v3M8 12v3M1 8h3M12 8h3" />
  </svg>
)

export function BindingsTab() {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const { setFlow, stateFilter, setStateFilter, setTab } = useTwinNav()
  const bindings = useTwinDeviceStore((s) => s.bindings)
  const alerting = useTwinDeviceStore((s) => s.alerting)
  const timeAt = useTwinDeviceStore((s) => s.timeAt)
  const readings = useShownReadings()
  const { guidIndex, catalog } = useTwinElements()
  const [q, setQ] = useState('')
  const query = useDeferredValue(q.trim().toLowerCase())
  const now = timeAt ?? Date.now()

  const ringing = useMemo(() => new Set(alerting.map((k) => k.split('/')[0])), [alerting])
  const summary = useMemo(() => stateSummary(bindings, readings, now, { stale: t('stale'), nodata: t('nodata'), none: t('noRule') }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bindings, readings, timeAt, t])
  const list = useMemo(() => {
    let out = query ? bindings.filter((b) => b.name.toLowerCase().includes(query) || b.deviceId.toLowerCase().includes(query)) : bindings
    if (stateFilter === ALERT_FILTER) out = out.filter((b) => ringing.has(b.id))
    else if (stateFilter) out = out.filter((b) => stateKeyOf(b, readings, now) === stateFilter)
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindings, query, stateFilter, readings, timeAt, ringing])

  if (bindings.length === 0) {
    return (
      <EmptyNote title={t('panel.noBindings')} hint={t('panel.noBindingsHint')}>
        <Btn onClick={() => setTab('devices')}>{t('panel.tabs.devices')}</Btn>
      </EmptyNote>
    )
  }
  return (
    <>
      <div className={`${MARGIN} pt-4 pb-3 flex flex-col gap-3`}>
        <div className="flex flex-wrap gap-1.5" data-testid="twin-summary">
          {stateFilter === ALERT_FILTER && (
            <button type="button" aria-pressed onClick={() => setStateFilter(null)}
              className="inline-flex items-center gap-1.5 h-7 max-md:h-9 px-2.5 rounded-full text-[11.5px] border border-[var(--accent)] bg-[var(--surface-2)] text-[var(--text)]">
              {t('alertsActive', { count: alerting.length })}
            </button>
          )}
          {summary.map((c) => (
            <button key={c.key} type="button" onClick={() => setStateFilter(stateFilter === c.key ? null : c.key)} aria-pressed={stateFilter === c.key} title={t('summaryFilter')}
              className={`inline-flex items-center gap-1.5 h-7 max-md:h-9 px-2.5 rounded-full text-[11.5px] max-md:text-[13px] border transition-colors text-[var(--text)] ${stateFilter === c.key ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--border)] hover:bg-[var(--surface-2)]'}`}>
              <span className="w-2 h-2 rounded-full border border-[var(--border)]" style={{ background: c.color ?? 'transparent' }} aria-hidden />
              {c.label}
              <span className="text-[var(--text-dim)] tabular-nums">{c.bindings}</span>
            </button>
          ))}
        </div>
        {bindings.length > 8 && (
          <input className={inputCls} type="search" value={q} placeholder={t('filterBindings')} aria-label={t('filterBindings')} data-testid="twin-binding-filter" onChange={(e) => setQ(e.target.value)} />
        )}
      </div>
      {list.length === 0 ? <EmptyNote title={t('panel.noResults')} /> : (
        <VirtualRows count={list.length} estimate={61} render={(i) => {
          const b = list[i]
          const reading = readings.get(deviceKey(b.sourceId, b.deviceId))
          const state = bindingState(b, reading, now)
          const found = resolveLocs(b, guidIndex, catalog).length
          const ring = ringing.has(b.id)
          const color = state.kind === 'rule' ? state.rule.effect.color : state.kind === 'stale' || state.kind === 'nodata' ? b.staleColor : null
          const label = state.kind === 'rule' ? state.rule.name : state.kind === 'stale' ? t('stale') : state.kind === 'nodata' ? t('nodata') : t('noRule')
          return (
            <div className={`flex items-center gap-2 pl-4 pr-2.5 py-2 min-h-[60px] border-t border-[var(--border)] ${ring ? 'shadow-[inset_2px_0_0_var(--danger,#e0523f)]' : ''}`} data-testid="twin-binding">
              <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-[var(--border-strong)]" style={{ background: color ?? 'transparent' }} aria-hidden />
              <button type="button" className="flex-1 min-w-0 pl-1 text-left group" onClick={() => setFlow({ kind: 'binding', id: b.id })}>
                <span className="flex items-baseline gap-2">
                  <span className="flex-1 min-w-0 truncate text-[12.5px] max-md:text-[14px] font-medium text-[var(--text)] group-hover:underline">{b.name}</span>
                  <span className="shrink-0 max-w-[40%] truncate text-[11.5px] text-[var(--text-dim)]" data-testid="twin-binding-state">{label}</span>
                </span>
                <span className={`block text-[11.5px] leading-[1.4] [overflow-wrap:anywhere] ${found ? 'text-[var(--text-faint)]' : 'text-[var(--warn,#e9a23b)]'}`}>
                  {ring && <span className="font-medium text-[var(--danger,#e0523f)]">{t('alerting')} · </span>}
                  {b.deviceId} → {found ? t('targetsFound', { count: found }) : t('targetsMissing', { count: b.targets.length })}
                </span>
              </button>
              <IconBtn label={t('panel.locate')} disabled={!found} onClick={() => focusTwinBinding(b.id)}><TargetIcon /></IconBtn>
            </div>
          )
        }} />
      )}
    </>
  )
}

export function BindingFlow({ id }: { id: string }) {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const { setFlow } = useTwinNav()
  const b = useTwinDeviceStore((s) => s.bindings.find((x) => x.id === id))
  const readings = useShownReadings()
  const selection = useSelectionRef()
  const store = useTwinDeviceStore.getState
  const [more, setMore] = useState(() => !!b && (b.staleAfterS > 0 || !!b.label || !!b.media))
  if (!b) return <BackBar title={t('panel.tabs.bindings')} />

  const reading = readings.get(deviceKey(b.sourceId, b.deviceId))
  const fields = reading ? [...new Set(reading.props.filter((p) => !p.joined).map((p) => p.field))] : []
  const put = (patch: Partial<Binding>): void => store().upsertBinding({ ...b, ...patch })
  const setRule = (r: TwinRule): void => put({ rules: b.rules.map((x) => (x.id === r.id ? r : x)) })
  const addRule = (): void => put({
    rules: [...b.rules, { id: newTwinId('r'), name: t('newRule'), match: 'all', filters: [{ field: fields[0] ?? '', op: 'gt', value: 0 }], effect: { color: '#e0523f', opacity: 1, hide: false } }],
  })
  const inSel = !!selection && b.targets.some((x) => x.globalId === selection.globalId)
  const index = store().bindings.findIndex((x) => x.id === b.id)
  const total = store().bindings.length

  return (
    <div data-testid="twin-binding-flow">
      <BackBar title={t('panel.editBinding')} trailing={<IconBtn label={t('panel.locate')} onClick={() => focusTwinBinding(b.id)}><TargetIcon /></IconBtn>} />
      <Section>
        <Field label={t('name')}><input className={inputCls} value={b.name} onChange={(e) => put({ name: e.target.value })} /></Field>
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] font-medium text-[var(--text)]">{b.deviceId}</span>
          <Hint>{reading ? `${metricsLine(reading, 8)} · ${timeOf(reading.at)}` : t('nodata')}</Hint>
        </div>
      </Section>

      <Section title={t('rulesTitle')} trailing={<Btn variant="ghost" className="!h-6 max-md:!h-9 !px-2" onClick={addRule}>{t('addRule')}</Btn>}>
        {b.rules.length === 0 && <Hint>{t('panel.noRules')}</Hint>}
        {b.rules.map((r) => <RuleCard key={r.id} rule={r} listId={`twin-fields-${b.id}`} onChange={setRule} onRemove={() => put({ rules: b.rules.filter((x) => x.id !== r.id) })} />)}
        <datalist id={`twin-fields-${b.id}`}>{fields.map((f) => <option key={f} value={f} />)}</datalist>
      </Section>

      <Section title={t('targets', { count: b.targets.length })}>
        {b.targets.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {b.targets.slice(0, 12).map((tg) => (
              <span key={tg.globalId} className="inline-flex items-center gap-1 max-w-full h-7 max-md:h-9 pl-2.5 pr-1 rounded-full bg-[var(--surface-2)] text-[11.5px] text-[var(--text)]" title={tg.globalId}>
                <span className="truncate">{tg.label}</span>
                <button type="button" className="w-5 h-5 max-md:w-8 max-md:h-8 shrink-0 rounded-full text-[var(--text-dim)] hover:text-[var(--text)]" aria-label={`${t('remove')}: ${tg.label}`}
                  onClick={() => put({ targets: b.targets.filter((x) => x.globalId !== tg.globalId) })}>✕</button>
              </span>
            ))}
            {b.targets.length > 12 && <span className="self-center text-[11.5px] text-[var(--text-faint)]">+{b.targets.length - 12}</span>}
          </div>
        )}
        <Btn className="self-start" disabled={!selection || inSel} onClick={() => selection && put({ targets: [...b.targets, selection] })}>{t('addSelection')}</Btn>
        <QueryEditor binding={b} onChange={(query) => put({ query })} />
      </Section>

      <Section>
        <Expander open={more} onToggle={() => setMore(!more)} label={t('panel.display')}>
          <div className="flex flex-col gap-3 py-1">
            <Field label={t('staleAfter')}>
              <select className={inputCls} value={b.staleAfterS} onChange={(e) => put({ staleAfterS: Number(e.target.value), staleColor: Number(e.target.value) ? b.staleColor ?? '#7b8494' : b.staleColor })}>
                {[0, 30, 60, 300, 900, 3600].map((s) => <option key={s} value={s}>{s === 0 ? t('never') : s < 60 ? `${s} s` : `${s / 60} min`}</option>)}
              </select>
            </Field>
            <Field label={t('label')}>
              <select className={inputCls} value={b.label?.field ?? ''} onChange={(e) => put({ label: e.target.value ? { field: e.target.value } : null })}>
                <option value="">{t('labelNone')}</option>
                {fields.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Field label={t('media')}>
              <select className={inputCls} value={b.media?.field ?? ''} onChange={(e) => put({ media: e.target.value ? { field: e.target.value } : null })}>
                <option value="">{t('labelNone')}</option>
                {fields.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
          </div>
        </Expander>
        <div className="flex items-center gap-1">
          <IconBtn label={t('priorityUp')} disabled={index <= 0} onClick={() => store().moveBinding(b.id, -1)}>↑</IconBtn>
          <IconBtn label={t('priorityDown')} disabled={index >= total - 1} onClick={() => store().moveBinding(b.id, 1)}>↓</IconBtn>
          <span className="flex-1" />
          <Btn variant="danger" onClick={() => { store().removeBinding(b.id); setFlow(null) }}>{t('remove')}</Btn>
        </div>
      </Section>
    </div>
  )
}

function RuleCard({ rule: r, listId, onChange, onRemove }: { rule: TwinRule; listId: string; onChange: (r: TwinRule) => void; onRemove: () => void }) {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const setFilter = (i: number, f: Filter): void => onChange({ ...r, filters: r.filters.map((x, j) => (j === i ? f : x)) })
  return (
    <div className="flex flex-col gap-2.5 p-3 rounded-[10px] bg-[var(--surface-2)]">
      <div className="flex items-center gap-2">
        <input type="color" aria-label={r.name} className="w-8 h-8 max-md:w-11 max-md:h-11 shrink-0 p-0 rounded-[8px] bg-transparent cursor-pointer" value={r.effect.color ?? '#cccccc'}
          onChange={(e) => onChange({ ...r, effect: { ...r.effect, color: e.target.value } })} />
        <input className={inputCls} value={r.name} aria-label={t('name')} onChange={(e) => onChange({ ...r, name: e.target.value })} />
        <IconBtn label={t('remove')} onClick={onRemove} className="-mr-1">✕</IconBtn>
      </div>
      {r.filters.length === 0 && <Hint>{t('always')}</Hint>}
      {r.filters.length > 1 && (
        <select className={inputCls} aria-label={t('panel.conditions')} value={r.match} onChange={(e) => onChange({ ...r, match: e.target.value as TwinRule['match'] })}>
          <option value="all">{t('panel.matchAll')}</option>
          <option value="any">{t('panel.matchAny')}</option>
        </select>
      )}
      {r.filters.map((f, i) => (
        <div key={i} className="flex gap-1.5 items-center">
          <input className={`${inputCls} flex-[2]`} list={listId} value={f.field} placeholder={t('field')} aria-label={t('field')} onChange={(e) => setFilter(i, { ...f, field: e.target.value })} />
          <select className={`${inputCls} flex-1`} aria-label={t('panel.conditions')} value={f.op} onChange={(e) => setFilter(i, { ...f, op: e.target.value as FilterOp })}>
            {OPS.map((op) => <option key={op} value={op}>{t(`op.${op}` as never)}</option>)}
          </select>
          {!NO_VALUE.includes(f.op) && (
            <input className={`${inputCls} flex-1`} value={String(f.value ?? '')} aria-label={t('panel.value')}
              onChange={(e) => { const v = e.target.value; setFilter(i, { ...f, value: v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v }) }} />
          )}
          <IconBtn label={t('remove')} className="-mr-1" onClick={() => onChange({ ...r, filters: r.filters.filter((_, j) => j !== i) })}>✕</IconBtn>
        </div>
      ))}
      <Btn variant="ghost" className="self-start !h-6 max-md:!h-9 !px-1.5 -ml-1.5" onClick={() => onChange({ ...r, filters: [...r.filters, { field: '', op: 'gt', value: 0 }] })}>{t('panel.addCondition')}</Btn>
      <label className="flex items-center gap-2.5 text-[11.5px] text-[var(--text-dim)]">
        <span className="shrink-0">{t('panel.opacity')}</span>
        <input type="range" min={0.05} max={1} step={0.05} value={r.effect.opacity} className="flex-1 min-w-0 accent-[var(--accent)]" onChange={(e) => onChange({ ...r, effect: { ...r.effect, opacity: Number(e.target.value) } })} />
        <span className="w-8 text-right tabular-nums">{Math.round(r.effect.opacity * 100)}%</span>
      </label>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] max-md:text-[13px] text-[var(--text-dim)]">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={r.effect.hide} onChange={(e) => onChange({ ...r, effect: { ...r.effect, hide: e.target.checked } })} />{t('hide')}
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={!!r.alert} onChange={(e) => onChange({ ...r, alert: e.target.checked ? { forMin: 0 } : null })} />{t('alert')}
        </label>
        {r.alert && (
          <select className={`${inputCls} !w-auto flex-1`} aria-label={t('alert')} value={r.alert.forMin} onChange={(e) => onChange({ ...r, alert: { forMin: Number(e.target.value) } })}>
            {[0, 1, 5, 15, 60].map((m) => <option key={m} value={m}>{m === 0 ? t('alertNow') : t('alertFor', { count: m })}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}

function QueryEditor({ binding: b, onChange }: { binding: Binding; onChange: (q: Binding['query']) => void }) {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const { catalog, classes, storeys } = useTwinElements()
  const q = b.query ?? { classes: [], storey: '', nameContains: '' }
  const counted = useDeferredValue(q)
  const count = b.query ? queryLocs(counted, catalog).length : 0
  return (
    <div className="flex flex-col gap-2 pt-1">
      <div className="flex items-center gap-2 text-[11.5px] max-md:text-[13px] text-[var(--text-dim)]">
        <span className="flex-1">{t('query')}</span>
        {b.query && <span className="tabular-nums" data-testid="twin-query-count">{t('matches', { count })}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select className={inputCls} aria-label={t('queryAnyClass')} value={q.classes[0] ?? ''} onChange={(e) => onChange({ ...q, classes: e.target.value ? [e.target.value] : [] })}>
          <option value="">{t('queryAnyClass')}</option>
          {classes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={inputCls} aria-label={t('queryAnyStorey')} value={q.storey} onChange={(e) => onChange({ ...q, storey: e.target.value })}>
          <option value="">{t('queryAnyStorey')}</option>
          {storeys.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <input className={inputCls} value={q.nameContains} placeholder={t('queryName')} aria-label={t('queryName')} onChange={(e) => onChange({ ...q, nameContains: e.target.value })} />
    </div>
  )
}
