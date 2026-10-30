// ─── Project file, recording settings, the timeline and the flows' back bar ───

import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTwinDeviceStore } from '../../stores/twinDeviceStore'
import { useValidationStore } from '../../stores/validationStore'
import { toast } from '../../stores/toastStore'
import { clearTwinHistory } from '../../lib/twin/device-runner'
import { operatedCsv, operatedState } from '../../lib/twin/devices'
import { exportTwinProject, parseTwinProject } from '../../lib/twin/twin-project'
import { Btn, Field, Hint, IconBtn, inputCls, MARGIN, Section } from './ui'
import { download, useShownReadings, useTwinElements, useTwinNav } from './nav'

export function BackBar({ title, trailing }: { title: string; trailing?: React.ReactNode }) {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const { setFlow } = useTwinNav()
  return (
    <div className="sticky top-0 z-[2] flex items-center gap-1 pl-2 pr-2.5 h-11 border-y border-[var(--border)] bg-[var(--surface)]">
      <IconBtn label={t('panel.back')} onClick={() => setFlow(null)}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8.5 2.5L4 7l4.5 4.5" /></svg>
      </IconBtn>
      <span className="flex-1 min-w-0 truncate text-[12.5px] max-md:text-[14px] font-semibold text-[var(--text)]">{title}</span>
      {trailing}
    </div>
  )
}

/** Choose a .twin.json; replacing a twin in use asks first. */
export function useTwinImport() {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const ref = useRef<HTMLInputElement>(null)
  const onFile = async (file: File): Promise<void> => {
    const doc = parseTwinProject(await file.text())
    if (!doc) { toast(t('importBad'), 'error'); return }
    const s = useTwinDeviceStore.getState()
    if (s.sources.length > 0 && !window.confirm(t('panel.importReplace', { sources: s.sources.length, bindings: s.bindings.length }))) return
    s.replaceAll(doc.sources, doc.bindings)
    toast(t('imported', { sources: doc.sources.length, bindings: doc.bindings.length }), 'success')
  }
  return {
    pick: (): void => ref.current?.click(),
    input: (
      <input ref={ref} type="file" accept=".json,application/json" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = '' }} />
    ),
  }
}

export function ProjectTab() {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const sources = useTwinDeviceStore((s) => s.sources)
  const bindings = useTwinDeviceStore((s) => s.bindings)
  const span = useTwinDeviceStore((s) => s.historySpan)
  const retentionH = useTwinDeviceStore((s) => s.retentionH)
  const timeAt = useTwinDeviceStore((s) => s.timeAt)
  const trees = useValidationStore((s) => s.spatialTrees)
  const readings = useShownReadings()
  const { guidIndex, catalog } = useTwinElements()
  const imp = useTwinImport()
  const store = useTwinDeviceStore.getState

  const exportState = (kind: 'csv' | 'json'): void => {
    const now = timeAt ?? Date.now()
    const rows = operatedState(bindings, readings, guidIndex, catalog, now, { stale: t('stale'), nodata: t('nodata'), none: t('noRule') })
    const files = new Map(Object.keys(trees).map((id) => [id, id.replace(/-\d+$/, '')]))
    const named = rows.map((r) => ({ ...r, modelId: files.get(r.modelId) ?? r.modelId }))
    const stamp = new Date(now).toISOString().slice(0, 16).replace(/[:T]/g, '-')
    if (kind === 'csv') download(`as-operated-${stamp}.csv`, operatedCsv(named), 'text/csv')
    else download(`as-operated-${stamp}.json`, JSON.stringify({ kind: 'ifc-twin-as-operated', at: new Date(now).toISOString(), rows: named }, null, 2))
  }

  return (
    <>
      <Section title={t('file')}>
        <Hint>{t('fileHint')}</Hint>
        <div className="flex flex-wrap gap-2">
          <Btn disabled={sources.length === 0} onClick={() => download('project.twin.json', exportTwinProject(sources, bindings))}>{t('export')}</Btn>
          <Btn onClick={imp.pick}>{t('import')}</Btn>
          {imp.input}
        </div>
      </Section>
      <Section title={t('panel.operated')}>
        <Hint>{t('operatedHint')}</Hint>
        <div className="flex flex-wrap gap-2">
          <Btn disabled={bindings.length === 0} data-testid="twin-export-csv" onClick={() => exportState('csv')}>{t('operatedCsv')}</Btn>
          <Btn disabled={bindings.length === 0} onClick={() => exportState('json')}>{t('operatedJson')}</Btn>
        </div>
      </Section>
      <Section title={t('history')}>
        <Field label={t('retention')}>
          <select className={inputCls} value={retentionH} onChange={(e) => store().setRetentionH(Number(e.target.value))}>
            {[0, 6, 24, 72, 168].map((h) => <option key={h} value={h}>{h === 0 ? t('historyOff') : h < 48 ? `${h} h` : `${h / 24} d`}</option>)}
          </select>
        </Field>
        {span
          ? <Btn className="self-start" onClick={() => { sources.forEach((s) => void clearTwinHistory(s.id)); store().setHistorySpan(null); store().setTimeAt(null) }}>{t('clearHistory')}</Btn>
          : <Hint>{retentionH ? t('historyEmpty') : t('historyDisabled')}</Hint>}
      </Section>
    </>
  )
}

/**
 * Live or past, pinned under everything because it changes everything above.
 * The thumb follows the finger at once; the (costly) rebuild gets the latest
 * position once a frame at most. Hidden on a very short lane, where the body
 * needs the room more: the Project tab's history stays reachable.
 */
export function TimelineDock() {
  const { t } = useTranslation('layers', { keyPrefix: 'devices' })
  const span = useTwinDeviceStore((s) => s.historySpan)
  const timeAt = useTwinDeviceStore((s) => s.timeAt)
  const store = useTwinDeviceStore.getState
  const [drag, setDrag] = useState<number | null>(null)
  const frame = useRef<number | null>(null)
  const pending = useRef<number | null>(null)
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current) }, [])
  if (!span && timeAt === null) return null

  const commit = (v: number): void => {
    pending.current = v
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      if (pending.current !== null) store().setTimeAt(pending.current)
    })
  }
  const shown = drag ?? timeAt
  return (
    <div className={`shrink-0 ${MARGIN} py-2.5 flex flex-col gap-1.5 border-t border-[var(--border)] [@media(max-height:480px)]:hidden`} data-testid="twin-history">
      <div className="flex items-center gap-2 min-h-6 text-[11.5px] max-md:text-[13px]">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${shown === null ? 'bg-[var(--ok,#22c55e)]' : 'bg-[var(--warn,#f59e0b)]'}`} aria-hidden />
        <span className="flex-1 min-w-0 truncate tabular-nums text-[var(--text)]">{shown === null ? t('timeLive') : new Date(shown).toLocaleString()}</span>
        {timeAt !== null && <Btn variant="ghost" className="!h-6 max-md:!h-9 !px-1.5" onClick={() => { setDrag(null); pending.current = null; store().setTimeAt(null) }}>{t('backToLive')}</Btn>}
      </div>
      {span && (
        <input type="range" min={span.from} max={span.to} step={1000} value={shown ?? span.to} data-testid="twin-time" aria-label={t('history')}
          className="w-full accent-[var(--accent)] max-md:h-8"
          onChange={(e) => { const v = Number(e.target.value); setDrag(v); commit(v) }}
          onPointerUp={() => setDrag(null)} onKeyUp={() => setDrag(null)} />
      )}
    </div>
  )
}
