// ─── Sources: the first run, the list, and the connect flow ───────────────────

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTwinDeviceStore, loadSecrets } from '../../stores/twinDeviceStore'
import { toast } from '../../stores/toastStore'
import { useValidationStore } from '../../stores/validationStore'
import { fetchDeviceSource, isStreamUrl } from '../../lib/twin/device-runner'
import { DEFAULT_MAPPING, guessMapping, newTwinId, parseReadings, type DeviceSource } from '../../lib/twin/devices'
import { applyTemplate, TWIN_TEMPLATES } from '../../lib/twin/templates'
import type { TwinTemplateId } from '../../lib/twin/device-sim'
import { DEFAULT_NGSI, ngsiUrl, type NgsiConfig } from '../../lib/twin/ngsi'
import { Expander } from '../geo/ui'
import { Btn, Field, Hint, inputCls, MARGIN, Section, Switch } from './ui'
import { timeOf, useTwinNav } from './nav'
import { BackBar, useTwinImport } from './ProjectTab'

function useDemo() {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  return (id: TwinTemplateId): void => {
    const n = applyTemplate(id)
    toast(n ? t('demoBound', { count: n }) : t('demoNoTargets'), n ? 'success' : 'info')
  }
}

function DemoRows() {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const start = useDemo()
  const hasModel = useValidationStore((s) => Object.keys(s.spatialTrees).length > 0)
  return (
    <div className="flex flex-col">
      {TWIN_TEMPLATES.map((id) => (
        <button key={id} type="button" disabled={!hasModel} onClick={() => start(id)} data-testid={id === 'home' ? 'twin-demo' : `twin-demo-${id}`}
          className="group flex flex-col gap-0.5 -mx-2 px-2 py-2.5 rounded-[8px] text-left hover:bg-[var(--surface-2)] disabled:opacity-45 disabled:pointer-events-none transition-colors">
          <span className="text-[12.5px] max-md:text-[14px] font-medium text-[var(--text)]">{t(`tplName.${id}` as never)}</span>
          <span className="text-[11.5px] leading-[1.45] text-[var(--text-faint)]">{t(`tplHint.${id}` as never)}</span>
        </button>
      ))}
      {!hasModel && <div className="pt-1"><Hint>{t('panel.needModel')}</Hint></div>}
    </div>
  )
}

/** No sources yet: what this is, and the three real ways in. */
export function GetStarted() {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const { setFlow } = useTwinNav()
  const imp = useTwinImport()
  return (
    <>
      <Section>
        <p className="text-[13px] leading-[1.5] text-[var(--text-dim)]">{t('intro')}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Btn variant="primary" className="flex-1" onClick={() => setFlow({ kind: 'source', id: null })}>{t('panel.connectApi')}</Btn>
          <Btn className="flex-1" onClick={imp.pick}>{t('panel.importFile')}</Btn>
          {imp.input}
        </div>
      </Section>
      <Section title={t('panel.demoSection')}><DemoRows /></Section>
    </>
  )
}

export function SourcesTab() {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const { setFlow } = useTwinNav()
  const sources = useTwinDeviceStore((s) => s.sources)
  const status = useTwinDeviceStore((s) => s.status)
  return (
    <>
      <Section>
        <div className="flex flex-col -my-1">
          {sources.map((s) => {
            const st = status[s.id]
            const failed = s.enabled && st?.state === 'error'
            return (
              <div key={s.id} className="flex items-center gap-3 py-2.5 border-b border-[var(--border)] last:border-b-0">
                <Switch checked={s.enabled} label={t('enabled')} onChange={(enabled) => useTwinDeviceStore.getState().upsertSource({ ...s, enabled })} />
                <button type="button" className="flex-1 min-w-0 text-left group" onClick={() => setFlow({ kind: 'source', id: s.id })} aria-label={`${t('edit')}: ${s.name}`}>
                  <span className="block truncate text-[12.5px] max-md:text-[14px] font-medium text-[var(--text)] group-hover:underline">{s.name}</span>
                  <span className={`block truncate text-[11.5px] ${failed ? 'text-[var(--danger,#e0523f)]' : 'text-[var(--text-faint)]'}`}>
                    {!s.enabled ? t('off') : failed ? t((st.errorKey ?? 'error.http') as never) : st ? t('status', { count: st.devices, time: timeOf(st.lastAt) }) : t('waiting')}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
        <Btn className="self-start" onClick={() => setFlow({ kind: 'source', id: null })}>{t('addSource')}</Btn>
      </Section>
      <Section title={t('panel.demoSection')}><DemoRows /></Section>
    </>
  )
}

type TestState = { kind: 'idle' } | { kind: 'running' } | { kind: 'error'; key: string } | { kind: 'ok'; devices: number; fields: string[]; detected: string | null }

/** New or existing source. Nothing reaches the store, or the network loop, until Save. */
export function SourceFlow({ id }: { id: string | null }) {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const { setFlow } = useTwinNav()
  const saved = useTwinDeviceStore((s) => s.sources.find((x) => x.id === id))
  const boundCount = useTwinDeviceStore((s) => s.bindings.filter((b) => b.sourceId === id).length)
  const [draft, setDraft] = useState<DeviceSource>(() => saved ?? { id: newTwinId('s'), name: t('newSource'), url: '', intervalS: 30, mapping: { ...DEFAULT_MAPPING }, enabled: false })
  const [header, setHeader] = useState<[string, string]>(() => (Object.entries(loadSecrets()[draft.id] ?? {})[0] as [string, string]) ?? ['', ''])
  const [topicsText, setTopicsText] = useState(() => (draft.topics ?? []).join('\n'))
  const [advanced, setAdvanced] = useState(() => !!(saved && (saved.mapping.listPath || saved.mapping.idField || saved.mapping.timeField || header[0])))
  const [test, setTest] = useState<TestState>({ kind: 'idle' })
  const [confirming, setConfirming] = useState(false)
  const ctrl = useRef<AbortController | null>(null)
  useEffect(() => () => ctrl.current?.abort(), [])

  const m = draft.mapping
  const stream = isStreamUrl(draft.url)
  const back = (): void => setFlow(null)
  const setUrl = (url: string): void => { setDraft({ ...draft, url }); setTest({ kind: 'idle' }) }

  const runTest = async (): Promise<void> => {
    ctrl.current?.abort()
    const c = new AbortController()
    ctrl.current = c
    const timeout = setTimeout(() => c.abort(), 15_000)
    setTest({ kind: 'running' })
    const headers = header[0].trim() ? { [header[0].trim()]: header[1] } : {}
    const r = await fetchDeviceSource(draft, c.signal, headers)
    clearTimeout(timeout)
    if (ctrl.current !== c) return
    if (!r.ok) { setTest({ kind: 'error', key: r.errorKey === 'error.aborted' ? 'error.network' : r.errorKey }); return }
    // An untouched mapping takes what the response looks like; a filled one is the user's.
    const untouched = !m.listPath && !m.idField && !m.timeField
    const guess = untouched ? guessMapping(r.body) : null
    const mapping = guess ? { listPath: guess.listPath, idField: guess.idField, timeField: guess.timeField } : m
    const readings = parseReadings(r.body, { id: draft.id, mapping }, Date.now())
    if (guess) setDraft((d) => ({ ...d, mapping }))
    setTest({
      kind: 'ok', devices: readings.length,
      fields: [...new Set((readings[0]?.props ?? []).filter((p) => !p.joined).map((p) => p.path))].slice(0, 6),
      detected: guess?.listPath || null,
    })
  }

  const setNgsi = (ngsi: NgsiConfig | undefined): void => {
    setDraft({ ...draft, ngsi, url: ngsi ? ngsiUrl(ngsi) : draft.url })
    setTest({ kind: 'idle' })
  }
  const ngsi = draft.ngsi

  const save = (): void => {
    const store = useTwinDeviceStore.getState()
    store.setHeaders(draft.id, header[0].trim() ? { [header[0].trim()]: header[1] } : null)
    store.upsertSource({ ...draft, enabled: draft.url.trim() ? true : draft.enabled })
    back()
  }

  return (
    <div data-testid="twin-source-flow">
      <BackBar title={saved ? t('panel.editSource') : t('newSource')} />
      <Section>
        <Field label={t('name')}><input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
        <div role="group" aria-label={t('panel.fiware.kind')} className="grid grid-cols-2 gap-2">
          <Btn variant={ngsi ? 'secondary' : 'primary'} aria-pressed={!ngsi} onClick={() => setNgsi(undefined)}>{t('panel.fiware.kindApi')}</Btn>
          <Btn variant={ngsi ? 'primary' : 'secondary'} aria-pressed={!!ngsi} data-testid="twin-source-fiware" onClick={() => setNgsi(ngsi ?? { ...DEFAULT_NGSI })}>{t('panel.fiware.kindBroker')}</Btn>
        </div>
        {ngsi ? (
          <>
            <Field label={t('panel.fiware.broker')} hint={t('panel.fiware.brokerHint')}>
              <input className={inputCls} value={ngsi.broker} inputMode="url" spellCheck={false} placeholder="https://broker.example.com:1026" data-testid="twin-fiware-broker" onChange={(e) => setNgsi({ ...ngsi, broker: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('panel.fiware.api')}>
                <select className={inputCls} value={ngsi.api} data-testid="twin-fiware-api" onChange={(e) => setNgsi({ ...ngsi, api: e.target.value === 'v2' ? 'v2' : 'ld' })}>
                  <option value="ld">NGSI-LD</option>
                  <option value="v2">NGSIv2</option>
                </select>
              </Field>
              <Field label={t('panel.fiware.type')}>
                <input className={inputCls} spellCheck={false} placeholder="AirQualityObserved" value={ngsi.type} data-testid="twin-fiware-type" onChange={(e) => setNgsi({ ...ngsi, type: e.target.value })} />
              </Field>
            </div>
            <Field label={t('panel.fiware.tenant')}>
              <input className={inputCls} spellCheck={false} value={ngsi.tenant} onChange={(e) => setNgsi({ ...ngsi, tenant: e.target.value })} />
            </Field>
            {ngsi.api === 'ld'
              ? <Field label={t('panel.fiware.context')} hint={t('panel.fiware.contextHint')}><input className={inputCls} inputMode="url" spellCheck={false} value={ngsi.context} onChange={(e) => setNgsi({ ...ngsi, context: e.target.value })} /></Field>
              : <Field label={t('panel.fiware.servicePath')}><input className={inputCls} spellCheck={false} placeholder="/" value={ngsi.servicePath} onChange={(e) => setNgsi({ ...ngsi, servicePath: e.target.value })} /></Field>}
          </>
        ) : (
        <Field label={t('panel.url')}>
          <input className={inputCls} value={draft.url} inputMode="url" spellCheck={false} placeholder="https://…/api/devices · wss://…" data-testid="twin-source-url" onChange={(e) => setUrl(e.target.value)} />
        </Field>
        )}
        {stream ? <Hint>{t('panel.streamNoTest')}</Hint> : (
          <div className="flex items-center gap-3">
            <Btn disabled={!draft.url.trim() || test.kind === 'running'} onClick={() => void runTest()} data-testid="twin-source-test">
              {test.kind === 'running' ? t('panel.testing') : t('panel.test')}
            </Btn>
          </div>
        )}
        <div aria-live="polite" className="contents">
          {test.kind === 'error' && <Hint tone="danger">{t(test.key as never)}</Hint>}
          {test.kind === 'ok' && (test.devices > 0 ? (
            <div className="flex flex-col gap-1" data-testid="twin-source-result">
              <Hint tone="ok">{t('panel.testOk', { count: test.devices })}{test.detected ? ` · ${t('panel.detected', { path: test.detected })}` : ''}</Hint>
              {test.fields.length > 0 && <Hint>{t('panel.testFields', { list: test.fields.join(', ') })}</Hint>}
            </div>
          ) : <Hint tone="warn">{t('panel.testNone')}</Hint>)}
        </div>
        <Field label={t('every')}>
          <select className={inputCls} value={draft.intervalS} onChange={(e) => setDraft({ ...draft, intervalS: Number(e.target.value) })}>
            {[2, 5, 10, 30, 60, 300, 900].map((s) => <option key={s} value={s}>{s < 60 ? `${s} s` : `${s / 60} min`}</option>)}
          </select>
        </Field>
        {stream && (
          <Field label={t('mqttTopics')} hint={t('mqttHint')}>
            <textarea className={`${inputCls} !h-auto py-2 font-mono`} rows={3} spellCheck={false} data-testid="twin-mqtt-topics" value={topicsText}
              onChange={(e) => {
                setTopicsText(e.target.value)
                setDraft({ ...draft, topics: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })
              }} />
          </Field>
        )}
        <Expander open={advanced} onToggle={() => setAdvanced(!advanced)} label={t('panel.advanced')}>
          <div className="flex flex-col gap-3 py-1">
            <Field label={t('listPath')} hint={t('listPathHint')}><input className={inputCls} spellCheck={false} value={m.listPath} onChange={(e) => setDraft({ ...draft, mapping: { ...m, listPath: e.target.value } })} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('idField')}><input className={inputCls} spellCheck={false} value={m.idField} onChange={(e) => setDraft({ ...draft, mapping: { ...m, idField: e.target.value } })} /></Field>
              <Field label={t('timeField')}><input className={inputCls} spellCheck={false} value={m.timeField} onChange={(e) => setDraft({ ...draft, mapping: { ...m, timeField: e.target.value } })} /></Field>
            </div>
            <Field label={t('headerName')}><input className={inputCls} spellCheck={false} value={header[0]} onChange={(e) => setHeader([e.target.value, header[1]])} /></Field>
            <Field label={t('headerValue')} hint={t('headerHint')}><input className={inputCls} type="password" autoComplete="off" value={header[1]} onChange={(e) => setHeader([header[0], e.target.value])} /></Field>
          </div>
        </Expander>
      </Section>
      <div className={`sticky bottom-0 z-[1] flex items-center gap-2 ${MARGIN} py-3 border-t border-[var(--border)] bg-[var(--surface)]`}>
        <Btn variant="primary" onClick={save} data-testid="twin-source-save">{t('save')}</Btn>
        <Btn onClick={back}>{t('bulk.cancel')}</Btn>
        <span className="flex-1" />
        {saved && (confirming
          ? <Btn variant="danger" onClick={() => { useTwinDeviceStore.getState().removeSource(saved.id); back() }}>{boundCount ? t('panel.confirmRemoveSource', { count: boundCount }) : t('panel.confirm')}</Btn>
          : <Btn variant="danger" onClick={() => setConfirming(true)}>{t('remove')}</Btn>)}
      </div>
    </div>
  )
}
