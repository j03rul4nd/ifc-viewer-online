// ─── LiveSources ──────────────────────────────────────────────────────────────
// Two pieces of the Data layers panel:
//   • <PresetSources/> — public sources that work today (see feed-presets.ts),
//     each pre-configured from what it was measured to do, the scene's own
//     city first and the rest folded under "Other places";
//   • <LiveControls/>  — per layer: refresh on/off, the requested interval, and
//     what the source actually allows (its own freshness, its quota), plus
//     what changed on the last refresh.
// And <ProxySetting/> for sources that send no CORS header.

import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TmbKeysBox, useTmbKeys } from './TmbPanels'
import { useVectorLayerStore, type VectorLayer } from '../stores/vectorLayerStore'
import { presetsForSite, type FeedPreset } from '../lib/layers/feed-presets'
import { useSceneAnchorStore } from '../stores/sceneAnchorStore'
import { useGeoStore } from '../stores/geoStore'
import { LIVE_INTERVALS_S } from '../lib/layers/live-feed'
import {
  addPreset, frameVectorLayer, setLive, liveUrlOf, getLayersProxy, setLayersProxy,
  setHistory, historyStats, clearHistory, startTimeTravel, HISTORY_RETENTIONS_H,
  previewTable, attachJoin, layerRows,
} from '../lib/layers/vector-runner'
import { inferSchema } from '../lib/twin/flatten-props'
import { toast } from '../stores/toastStore'

const btn =
  'shrink-0 px-2 py-1 max-md:py-2 rounded-[6px] text-[10px] max-md:text-[12px] font-medium border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-colors disabled:opacity-40'

const KIND_BADGE: Record<string, string> = { gbfs: 'GBFS', 'gtfs-rt': 'GTFS-RT', ods: 'ODS', wfs: 'WFS', geojson: 'JSON', join: 'CSV+' }

export function PresetSources() {
  const tmbKeys = useTmbKeys()
  const { t } = useTranslation('layers')
  const [busy, setBusy] = useState<string | null>(null)
  const hasProxy = !!getLayersProxy()
  // The scene's site, if it has one: a city's own sources go first.
  const anchor = useSceneAnchorStore((s) => s.anchor)
  const placement = useGeoStore((s) => s.placement)
  const site = anchor ?? placement
  const { near, other } = presetsForSite(site ? { lat: site.lat, lon: site.lon } : null)
  const card = (p: FeedPreset) => (
    <div key={p.id} className="flex items-start gap-1.5 px-2 py-1.5 rounded-[7px] border border-[var(--border)]" data-testid={`preset-${p.id}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-[var(--text)] truncate">{t(`presets.${p.id}.name` as never)}</span>
          <span className="shrink-0 px-1 rounded text-[8px] font-mono font-semibold bg-white/[0.06] text-[var(--text-dim)]">{KIND_BADGE[p.kind]}</span>
          {p.needsKey === 'tmb' && !tmbKeys && (
            <span className="shrink-0 px-1 rounded text-[8px] font-semibold bg-[#f5a524]/20 text-[#f5a524]"
              title={t('tmb.why')}>{t('tmb.needsKey')}</span>
          )}
          {p.needsProxy && (
            <span className={`shrink-0 px-1 rounded text-[8px] font-semibold ${hasProxy ? 'bg-white/[0.06] text-[var(--text-dim)]' : 'bg-[#f5a524]/20 text-[#f5a524]'}`}
              title={t('presets.needsProxyHint')}>{t('presets.needsProxy')}</span>
          )}
        </div>
        <div className="text-[10px] text-[var(--text-faint)] leading-snug">{t(`presets.${p.id}.hint` as never)}</div>
      </div>
      <button className={btn} disabled={busy !== null}
        onClick={async () => {
          setBusy(p.id)
          try {
            const r = await addPreset(p, t(`presets.${p.id}.name` as never), undefined, (k) => t(k as never))
            if (!r.ok) toast(t(r.errorKey as never), 'error')
            else setTimeout(() => void frameVectorLayer(r.id), 300)
          } finally { setBusy(null) }
        }}>
        {busy === p.id ? '…' : t('presets.connect')}
      </button>
    </div>
  )
  return (
    <div className="flex flex-col gap-1 pt-2 border-t border-[var(--border)]" data-testid="preset-sources">
      <div className="text-[11px] font-medium">{t('presets.title')}</div>
      <div className="text-[10px] text-[var(--text-faint)] leading-snug">{t('presets.hint')}</div>
      <TmbKeysBox />
      {near.map(card)}
      {other.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer select-none text-[10px] text-[var(--text-dim)] hover:text-[var(--text)] py-1 max-md:py-2">
            {t('presets.otherPlaces', { n: other.length })}
          </summary>
          <div className="flex flex-col gap-1">{other.map(card)}</div>
        </details>
      )}
    </div>
  )
}

function ago(ms: number, t: (k: string, o?: Record<string, unknown>) => string): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return t('live.secondsAgo', { n: s })
  const m = Math.round(s / 60)
  return m < 60 ? t('live.minutesAgo', { n: m }) : t('live.hoursAgo', { n: Math.round(m / 60) })
}

export function LiveControls({ layer }: { layer: VectorLayer }) {
  const { t: tRaw } = useTranslation('layers')
  const t = tRaw as unknown as (k: string, o?: Record<string, unknown>) => string
  const status = useVectorLayerStore((s) => s.liveStatus[layer.id])
  const [, tick] = useState(0)
  // Re-render every second so "12 s ago" and "next in 18 s" stay true.
  useEffect(() => {
    if (!layer.live?.enabled) return
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [layer.live?.enabled])
  if (!liveUrlOf(layer.id)) return null
  const live = layer.live
  const now = Date.now()
  return (
    <div className="flex flex-col gap-1 pt-1.5 border-t border-[var(--border)]" data-testid="live-controls">
      <div className="flex items-center gap-1.5">
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--text)]">
          <input type="checkbox" checked={!!live?.enabled} onChange={(e) => setLive(layer.id, { enabled: e.target.checked })} />
          {t('live.toggle')}
        </label>
        {live?.enabled && <span className="w-1.5 h-1.5 rounded-full bg-[#5ce27a] animate-pulse" aria-hidden />}
        <span className="flex-1" />
        <select value={live?.intervalS ?? 30} aria-label={t('live.interval')}
          onChange={(e) => setLive(layer.id, { intervalS: Number(e.target.value) })}
          className="px-1.5 py-1 rounded-[6px] text-[10px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)]">
          {LIVE_INTERVALS_S.map((s) => <option key={s} value={s}>{s >= 60 ? `${s / 60} min` : `${s} s`}</option>)}
        </select>
      </div>
      {live?.enabled && (
        <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]">
          <input type="checkbox" checked={live.animate} onChange={(e) => setLive(layer.id, { animate: e.target.checked })} />
          {t('live.animate')}
        </label>
      )}
      <HistoryRow layer={layer} t={t} />
      {status && (
        <div className="text-[10px] leading-snug text-[var(--text-faint)]" data-testid="live-status">
          {status.error
            ? <span className="text-[#f25c54]">{t(status.error)}{status.failures > 1 ? ` · ${t('live.retrying', { n: status.failures })}` : ''}</span>
            : (
              <>
                {status.dataAt !== null
                  ? t('live.dataAge', { ago: ago(now - status.dataAt, t) })
                  : status.lastAt !== null ? t('live.fetched', { ago: ago(now - status.lastAt, t) }) : null}
                {status.unchanged
                  ? ` · ${t('live.unchanged')}`
                  : status.lastAt !== null ? ` · ${t('live.changes', { added: status.added, removed: status.removed, changed: status.changed })}` : ''}
              </>
            )}
          {live?.enabled && status.nextAt !== null && (
            <div>
              {t('live.next', { s: Math.max(0, Math.round((status.nextAt - now) / 1000)) })}
              {status.nextAt - (status.lastAt ?? now) > (live.intervalS * 1000) * 1.5 && !status.error ? ` · ${t('live.sourcePaced')}` : ''}
              {status.quotaRemaining !== null ? ` · ${t('live.quota', { n: status.quotaRemaining })}` : ''}
              {status.viaProxy ? ` · ${t('live.viaProxy')}` : ''}
            </div>
          )}
          {status.identity === 'index' && <div>{t('live.identityIndex')}</div>}
        </div>
      )}
    </div>
  )
}

export function ProxySetting() {
  const { t } = useTranslation('layers')
  const [value, setValue] = useState(getLayersProxy() ?? '')
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-1 pt-2 border-t border-[var(--border)]">
      <button type="button" onClick={() => setOpen(!open)} className="text-left text-[10px] text-[var(--text-dim)] hover:text-[var(--text)]">
        {open ? '▾' : '▸'} {t('proxy.title')}
      </button>
      {open && (
        <>
          <div className="text-[10px] text-[var(--text-faint)] leading-snug">{t('proxy.hint')}</div>
          <div className="flex gap-1.5">
            <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://my-proxy.example/?url={url}"
              className="flex-1 min-w-0 px-2 py-1 rounded-[6px] text-[10px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-faint)]" />
            <button className={btn} onClick={() => {
              if (value.trim() && !value.includes('{url}')) { toast(t('proxy.needsPlaceholder'), 'warning'); return }
              setLayersProxy(value.trim() || null)
              toast(value.trim() ? t('proxy.saved') : t('proxy.cleared'), 'success')
            }}>{t('proxy.save')}</button>
          </div>
        </>
      )}
    </div>
  )
}

function fmtBytes(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`
}

/** Recording + "View history" for one live layer. */
function HistoryRow({ layer, t }: { layer: VectorLayer; t: (k: string, o?: Record<string, unknown>) => string }) {
  const h = layer.history
  const [stats, setStats] = useState<{ bytes: number; from: number | null } | null>(null)
  useEffect(() => {
    let alive = true
    const read = (): void => { void historyStats(layer.id).then((s) => { if (alive) setStats({ bytes: s.bytes, from: s.from }) }) }
    read()
    const id = setInterval(read, 10_000)
    return () => { alive = false; clearInterval(id) }
  }, [layer.id])
  const sinceH = stats?.from ? (Date.now() - stats.from) / 3600_000 : 0
  return (
    <div className="flex flex-col gap-1" data-testid="history-row">
      <div className="flex items-center gap-1.5">
        <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]" title={t('history.recordHint')}>
          <input type="checkbox" checked={!!h?.enabled} onChange={(e) => setHistory(layer.id, { enabled: e.target.checked })} />
          {t('history.record')}
        </label>
        <select value={h?.retentionH ?? 6} disabled={!h?.enabled} aria-label={t('history.retention')}
          onChange={(e) => setHistory(layer.id, { retentionH: Number(e.target.value) })}
          className="px-1 py-0.5 rounded-[5px] text-[10px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] disabled:opacity-40">
          {HISTORY_RETENTIONS_H.map((r) => <option key={r} value={r}>{r >= 48 ? t('history.days', { n: r / 24 }) : t('history.hours', { n: r })}</option>)}
        </select>
        <span className="flex-1" />
        {stats && stats.bytes > 0 && (
          <span className="text-[10px] font-mono text-[var(--text-faint)]" title={t('history.sizeHint')}>{fmtBytes(stats.bytes)}</span>
        )}
      </div>
      {stats && stats.bytes > 0 && (
        <div className="flex items-center gap-1.5">
          <button className={btn} onClick={async () => {
            if (!(await startTimeTravel())) toast(t('history.nothingYet'), 'info')
          }}>⏪ {t('history.view')}</button>
          <span className="text-[10px] text-[var(--text-faint)]">
            {sinceH >= 1 ? t('history.spanH', { n: Math.floor(sinceH) }) : t('history.spanM', { n: Math.max(1, Math.round(sinceH * 60)) })}
          </span>
          <span className="flex-1" />
          <button className="text-[10px] text-[var(--text-faint)] hover:text-[#f25c54]"
            onClick={async () => { await clearHistory(layer.id); setStats({ bytes: 0, from: null }) }}>{t('history.clear')}</button>
        </div>
      )}
    </div>
  )
}

/**
 * "Join live data…": a status table (CSV / ';' / '#' records) refreshed on a
 * timer, matched onto this layer's features by a key. Folded until asked for.
 */
export function JoinForm({ layer }: { layer: VectorLayer }) {
  const { t: tRaw } = useTranslation('layers')
  const t = tRaw as unknown as (k: string, o?: Record<string, unknown>) => string
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [headerless, setHeaderless] = useState(false)
  const [names, setNames] = useState('')
  const [cols, setCols] = useState<string[] | null>(null)
  const [sample, setSample] = useState<string[][]>([])
  const [layerKey, setLayerKey] = useState('')
  const [tableKey, setTableKey] = useState('')
  const [timeCol, setTimeCol] = useState('')
  const [interval, setIntervalS] = useState(300)
  const [busy, setBusy] = useState(false)
  const fields = layer.data ? inferSchema(layerRows(layer.data)).map((f) => f.field) : []
  const tableOpts = (): { header?: boolean; columns?: string[] } => headerless
    ? { header: false, columns: names.split(',').map((x) => x.trim()).filter(Boolean) }
    : {}
  const sel = 'min-w-0 flex-1 px-1.5 py-1 rounded-[6px] text-[10px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)]'

  if (!open) {
    return (
      <button type="button" className="self-start text-[10px] text-[var(--accent)] hover:underline" onClick={() => setOpen(true)}>
        + {t('join.open')}
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-1.5 rounded-[7px] border border-[var(--border)] p-2" data-testid="join-form">
      <div className="text-[11px] font-medium">{t('join.title')}</div>
      <div className="text-[10px] text-[var(--text-faint)] leading-snug">{t('join.hint')}</div>
      <div className="flex gap-1.5">
        <input className={sel} value={url} onChange={(e) => { setUrl(e.target.value); setCols(null) }} placeholder="https://…/status.csv" />
        <button className={btn} disabled={busy || !url.trim()} onClick={async () => {
          setBusy(true)
          try {
            const r = await previewTable(url.trim(), tableOpts())
            if (!r.ok) { toast(t(r.errorKey), 'error'); return }
            setCols(r.columns); setSample(r.sample)
            setTableKey(r.columns[0] ?? '')
            // Guess the layer key: a field whose values look like the table's first column.
            const first = new Set(r.sample.map((row) => String(row[0]).trim()))
            const guess = fields.find((f) => layer.data!.features.slice(0, 200).some((ft) => first.has(String(ft.properties[f] ?? '').trim())))
            setLayerKey(guess ?? fields[0] ?? '')
            setTimeCol(r.columns.find((c) => /time|hora|fecha|data|date|timestamp|updated/i.test(c)) ?? '')
          } finally { setBusy(false) }
        }}>{t('join.test')}</button>
      </div>
      <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]">
        <input type="checkbox" checked={headerless} onChange={(e) => { setHeaderless(e.target.checked); setCols(null) }} />
        {t('join.headerless')}
      </label>
      {headerless && (
        <input className={sel} value={names} onChange={(e) => { setNames(e.target.value); setCols(null) }} placeholder={t('join.namesPlaceholder')} />
      )}
      {cols && (
        <>
          <div className="text-[10px] font-mono text-[var(--text-faint)] truncate" title={sample.map((r) => r.join(' | ')).join('\n')}>
            {cols.join(' · ')}
          </div>
          <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]">
            <span className="w-24 shrink-0">{t('join.layerKey')}</span>
            <select className={sel} value={layerKey} onChange={(e) => setLayerKey(e.target.value)}>
              {fields.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]">
            <span className="w-24 shrink-0">{t('join.tableKey')}</span>
            <select className={sel} value={tableKey} onChange={(e) => setTableKey(e.target.value)}>
              {cols.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]">
            <span className="w-24 shrink-0">{t('join.timeColumn')}</span>
            <select className={sel} value={timeCol} onChange={(e) => setTimeCol(e.target.value)}>
              <option value="">—</option>
              {cols.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]">
            <span className="w-24 shrink-0">{t('live.interval')}</span>
            <select className={sel} value={interval} onChange={(e) => setIntervalS(Number(e.target.value))}>
              {LIVE_INTERVALS_S.map((x) => <option key={x} value={x}>{x >= 60 ? `${x / 60} min` : `${x} s`}</option>)}
            </select>
          </label>
          <div className="flex gap-1.5">
            <button className={btn} disabled={busy || !layerKey || !tableKey} onClick={async () => {
              setBusy(true)
              try {
                const r = await attachJoin(layer.id, url.trim(), {
                  table: tableOpts(), spec: { layerKey, tableKey }, timeColumn: timeCol || undefined,
                }, interval)
                if (!r.ok) toast(t(r.errorKey), 'error')
                else { toast(t('join.done'), 'success'); setOpen(false) }
              } finally { setBusy(false) }
            }}>{t('join.apply')}</button>
            <button className="text-[10px] text-[var(--text-dim)] hover:text-[var(--text)]" onClick={() => setOpen(false)}>{t('links.cancel')}</button>
          </div>
        </>
      )}
    </div>
  )
}
