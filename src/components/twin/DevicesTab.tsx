// ─── Devices: what the sources report, and bulk binding ───────────────────────

import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTwinDeviceStore } from '../../stores/twinDeviceStore'
import { toast } from '../../stores/toastStore'
import { bulkBindings, planBulkBind, type BulkMatchOptions } from '../../lib/twin/bulk-bind'
import { deviceKey, newTwinId, type Binding, type Reading } from '../../lib/twin/devices'
import { Btn, EmptyNote, Field, Hint, inputCls, MARGIN, Section, VirtualRows } from './ui'
import { metricsLine, useSelectionRef, useShownReadings, useTwinElements, useTwinNav, deviceLabel } from './nav'
import { BackBar } from './ProjectTab'

export function DevicesTab() {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const { setFlow } = useTwinNav()
  const readings = useShownReadings()
  const bindings = useTwinDeviceStore((s) => s.bindings)
  const inPast = useTwinDeviceStore((s) => s.timeAt !== null)
  const sel = useSelectionRef()
  const [q, setQ] = useState('')
  const query = useDeferredValue(q.trim().toLowerCase())

  const list = useMemo(() => {
    const all = [...readings.values()]
    return query ? all.filter((r) => r.deviceId.toLowerCase().includes(query)) : all
  }, [readings, query])
  const bound = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of bindings) { const k = deviceKey(b.sourceId, b.deviceId); m.set(k, (m.get(k) ?? 0) + 1) }
    return m
  }, [bindings])

  const bind = (r: Reading): void => {
    if (!sel) return
    const b: Binding = {
      id: newTwinId('b'), name: `${sel.label} · ${deviceLabel(r.deviceId)}`, sourceId: r.sourceId, deviceId: r.deviceId,
      targets: [sel], rules: [], staleColor: null, staleAfterS: 0,
    }
    useTwinDeviceStore.getState().upsertBinding(b)
    setFlow({ kind: 'binding', id: b.id })
  }

  if (readings.size === 0) return <EmptyNote title={t('panel.noDevices')} hint={t('panel.noDevicesHint')} />
  return (
    <>
      <div className={`${MARGIN} pt-4 pb-3 flex flex-col gap-2.5`}>
        <div className="flex gap-2">
          <input className={inputCls} type="search" value={q} placeholder={t('panel.searchDevices')} aria-label={t('panel.searchDevices')} onChange={(e) => setQ(e.target.value)} />
          <Btn disabled={inPast} onClick={() => setFlow({ kind: 'bulk' })} data-testid="twin-bulk-open">{t('bulk.open')}</Btn>
        </div>
        <Hint tone={sel ? 'ok' : 'muted'}>{inPast ? t('panel.pastReadOnly') : sel ? t('bindHint', { name: sel.label }) : t('selectHint')}</Hint>
      </div>
      {list.length === 0 ? <EmptyNote title={t('panel.noResults')} /> : (
        <VirtualRows count={list.length} estimate={53} render={(i) => {
          const r = list[i]
          const n = bound.get(deviceKey(r.sourceId, r.deviceId)) ?? 0
          return (
            <div className={`flex items-center gap-3 ${MARGIN} py-2 min-h-[52px] border-t border-[var(--border)]`}>
              <div className="flex-1 min-w-0">
                <div className="truncate text-[12.5px] max-md:text-[14px] font-medium text-[var(--text)]" title={r.deviceId}>{deviceLabel(r.deviceId)}</div>
                <div className="truncate text-[11.5px] text-[var(--text-faint)] tabular-nums">{metricsLine(r) || '—'}</div>
              </div>
              {n > 0 && <span className="shrink-0 text-[11.5px] text-[var(--text-dim)]">{t('panel.bound', { count: n })}</span>}
              <Btn variant="ghost" className="!px-2" disabled={!sel || inPast} onClick={() => bind(r)}>{t('bind')}</Btn>
            </div>
          )
        }} />
      )}
    </>
  )
}

export function BulkFlow() {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const { setFlow, setTab } = useTwinNav()
  const sources = useTwinDeviceStore((s) => s.sources)
  const bindings = useTwinDeviceStore((s) => s.bindings)
  const { catalog, classes } = useTwinElements()
  // A snapshot: the preview answers the options chosen, it does not re-plan with every reading.
  const [readings] = useState(() => useTwinDeviceStore.getState().readings)
  const [sourceId, setSourceId] = useState(() => sources.find((s) => [...readings.values()].some((r) => r.sourceId === s.id))?.id ?? sources[0]?.id ?? '')
  const [opts, setOpts] = useState<BulkMatchOptions>({ deviceField: '', elementKey: 'name', mode: 'contains', classes: [] })
  const [templateId, setTemplateId] = useState('')
  // The first plan of a set of options indexes the catalog: the controls answer first.
  const planned = useDeferredValue(opts)
  const stale = planned !== opts

  const list = useMemo(() => [...readings.values()].filter((r) => r.sourceId === sourceId), [readings, sourceId])
  const fields = useMemo(() => [...new Set(list.flatMap((r) => r.props.filter((p) => !p.joined && typeof p.value === 'string').map((p) => p.field)))].sort(), [list])
  const plan = useMemo(() => planBulkBind(list, catalog, planned), [list, catalog, planned])
  const template = bindings.find((b) => b.id === templateId) ?? null
  const toCreate = useMemo(() => bulkBindings(plan, template, bindings), [plan, template, bindings])

  const create = (): void => {
    useTwinDeviceStore.getState().addBindings(toCreate)
    toast(t('bulk.created', { count: toCreate.length }), 'success')
    setFlow(null)
    setTab('bindings')
  }

  return (
    <div data-testid="twin-bulk">
      <BackBar title={t('bulk.open')} />
      <Section>
        <Hint>{t('bulk.hint')}</Hint>
        {sources.length > 1 && (
          <Field label={t('sources')}>
            <select className={inputCls} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        )}
        <Field label={t('bulk.device')}>
          <select className={inputCls} value={opts.deviceField} data-testid="twin-bulk-field" onChange={(e) => setOpts({ ...opts, deviceField: e.target.value })}>
            <option value="">{t('bulk.deviceId')}</option>
            {fields.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </Field>
        <Field label={t('bulk.element')}>
          <select className={inputCls} value={`${opts.mode}:${opts.elementKey}`} data-testid="twin-bulk-mode"
            onChange={(e) => { const [mode, elementKey] = e.target.value.split(':') as [BulkMatchOptions['mode'], BulkMatchOptions['elementKey']]; setOpts({ ...opts, mode, elementKey }) }}>
            <option value="contains:name">{t('bulk.nameContains')}</option>
            <option value="equals:name">{t('bulk.nameEquals')}</option>
            <option value="equals:globalId">{t('bulk.guidEquals')}</option>
          </select>
        </Field>
        <Field label={t('bulk.class')}>
          <select className={inputCls} value={opts.classes[0] ?? ''} onChange={(e) => setOpts({ ...opts, classes: e.target.value ? [e.target.value] : [] })}>
            <option value="">{t('queryAnyClass')}</option>
            {classes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label={t('bulk.rules')}>
          <select className={inputCls} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">{t('bulk.noRules')}</option>
            {bindings.filter((b) => b.rules.length).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
      </Section>
      <Section>
        <div className={`flex flex-col gap-2 transition-opacity ${stale ? 'opacity-50' : ''}`} aria-busy={stale}>
          <p className="text-[12.5px] text-[var(--text)]" data-testid="twin-bulk-preview">
            {t('bulk.preview', { matched: plan.matched.length, total: list.length, elements: plan.elements })}
            {toCreate.length < plan.matched.length && <span className="text-[var(--text-dim)]"> · {t('bulk.already', { count: plan.matched.length - toCreate.length })}</span>}
          </p>
          {plan.matched.slice(0, 8).map((m) => (
            <div key={m.reading.deviceId} className="truncate text-[11.5px] text-[var(--text-dim)]">{m.value} → {m.targets.map((x) => x.label).join(', ')}</div>
          ))}
          {plan.matched.length > 8 && <Hint>+{plan.matched.length - 8}</Hint>}
          {plan.unmatched.length > 0 && (
            <Hint tone="warn">{t('bulk.unmatched', { list: plan.unmatched.slice(0, 6).map((u) => u.value || u.deviceId).join(', ') + (plan.unmatched.length > 6 ? '…' : '') })}</Hint>
          )}
        </div>
      </Section>
      <div className={`sticky bottom-0 z-[1] flex gap-2 ${MARGIN} py-3 border-t border-[var(--border)] bg-[var(--surface)]`}>
        <Btn variant="primary" disabled={toCreate.length === 0 || stale} onClick={create} data-testid="twin-bulk-create">{t('bulk.create', { count: toCreate.length })}</Btn>
        <Btn onClick={() => setFlow(null)}>{t('bulk.cancel')}</Btn>
      </div>
    </div>
  )
}
