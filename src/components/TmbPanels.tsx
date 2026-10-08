// ─── TmbPanels ────────────────────────────────────────────────────────────────
// The two TMB pieces of the Data layers panel:
//   TmbKeysBox     the user's own app_id / app_key (free at developer.tmb.cat),
//                  checked once, kept in this browser only.
//   TmbArrivals    next buses at the selected stop, refreshed every 30 s while
//                  the stop stays selected — one request per refresh, never
//                  the whole network (each user's free quota is small).

import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getTmbKeys, setTmbKeys, onTmbKeys, testTmbKeys, fetchArrivals, type TmbArrival,
} from '../lib/layers/tmb'

type T = (k: string, o?: Record<string, unknown>) => string

const input = 'min-w-0 flex-1 px-1.5 py-1 max-md:py-2 rounded-[6px] text-[10px] max-md:text-[12px] font-mono bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]'
const btn = 'shrink-0 px-2 py-1 max-md:py-2 rounded-[6px] text-[10px] max-md:text-[12px] font-medium border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-2)] hover:border-[var(--accent)] transition-colors disabled:opacity-40'

export function useTmbKeys() {
  return useSyncExternalStore(onTmbKeys, getTmbKeys)
}

export function TmbKeysBox() {
  const { t: tRaw } = useTranslation('layers')
  const t = tRaw as unknown as T
  const keys = useTmbKeys()
  const [open, setOpen] = useState(false)
  const [appId, setAppId] = useState('')
  const [appKey, setAppKey] = useState('')
  const [state, setState] = useState<'idle' | 'testing' | 'bad' | 'network'>('idle')

  if (keys && !open) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]" data-testid="tmb-keys">
        <span className="w-1.5 h-1.5 rounded-full bg-[#5ce27a]" />
        <span className="flex-1">{t('tmb.keysSaved')}</span>
        <button className="text-[var(--accent)] hover:underline" onClick={() => setTmbKeys(null)}>{t('tmb.remove')}</button>
      </div>
    )
  }
  if (!open) {
    return (
      <button className="self-start text-[10px] text-[var(--accent)] hover:underline" data-testid="tmb-keys"
        onClick={() => setOpen(true)}>
        + {t('tmb.addKeys')}
      </button>
    )
  }
  const save = async (): Promise<void> => {
    const k = { appId: appId.trim(), appKey: appKey.trim() }
    if (!k.appId || !k.appKey) return
    setState('testing')
    const r = await testTmbKeys(k)
    if (r === 'ok') { setTmbKeys(k); setOpen(false); setAppId(''); setAppKey(''); setState('idle') }
    else setState(r)
  }
  return (
    <div className="flex flex-col gap-1 p-1.5 rounded-[7px] border border-[var(--border)]" data-testid="tmb-keys">
      <div className="text-[10px] text-[var(--text-faint)] leading-snug">
        {t('tmb.why')}{' '}
        <a className="text-[var(--accent)] hover:underline" href="https://developer.tmb.cat" target="_blank" rel="noreferrer noopener">developer.tmb.cat</a>
      </div>
      <div className="flex gap-1">
        <input className={input} placeholder="app_id" value={appId} autoComplete="off" spellCheck={false}
          onChange={(e) => setAppId(e.target.value)} aria-label="app_id" />
        <input className={input} placeholder="app_key" value={appKey} autoComplete="off" spellCheck={false} type="password"
          onChange={(e) => setAppKey(e.target.value)} aria-label="app_key" />
      </div>
      <div className="text-[10px] text-[var(--text-faint)]">{t('tmb.privacy')}</div>
      {state === 'bad' && <div className="text-[10px] text-[#f25c54]">{t('tmb.bad')}</div>}
      {state === 'network' && <div className="text-[10px] text-[#f25c54]">{t('error.network')}</div>}
      <div className="flex gap-1">
        <button className={btn} disabled={state === 'testing' || !appId.trim() || !appKey.trim()} onClick={() => void save()}>
          {state === 'testing' ? '…' : t('tmb.save')}
        </button>
        <button className={btn} onClick={() => { setOpen(false); setState('idle') }}>{t('action.cancel')}</button>
      </div>
    </div>
  )
}

const REFRESH_MS = 30_000

export function TmbArrivals({ stopCode }: { stopCode: string }) {
  const { t: tRaw } = useTranslation('layers')
  const t = tRaw as unknown as T
  const keys = useTmbKeys()
  const [rows, setRows] = useState<TmbArrival[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!keys) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const ac = new AbortController()
    setRows(null); setError(null)
    const load = async (): Promise<void> => {
      // A hidden tab spends nothing; the next look refreshes.
      if (!document.hidden) {
        const r = await fetchArrivals(stopCode, ac.signal)
        if (ac.signal.aborted) return
        if (r.ok) { setRows(r.arrivals); setError(null) } else if (r.errorKey !== 'error.aborted') setError(r.errorKey)
      }
      timer = setTimeout(() => void load(), REFRESH_MS)
    }
    void load()
    return () => { ac.abort(); if (timer) clearTimeout(timer) }
  }, [stopCode, keys])

  if (!keys) return <div className="text-[10px] text-[var(--text-faint)]">{t('tmb.arrivalsNeedKeys')}</div>
  return (
    <div className="flex flex-col gap-0.5 pt-1 border-t border-[var(--border)]" data-testid="tmb-arrivals">
      <div className="text-[10px] font-medium text-[var(--text)]">{t('tmb.nextBuses')}</div>
      {error && <div className="text-[10px] text-[#f25c54]">{t(error)}</div>}
      {!error && rows === null && <div className="text-[10px] text-[var(--text-faint)]">…</div>}
      {rows && rows.length === 0 && <div className="text-[10px] text-[var(--text-faint)]">{t('tmb.noBuses')}</div>}
      {rows?.slice(0, 12).map((r, i) => (
        <div key={i} className="flex items-baseline gap-1.5 text-[10px]">
          <span className="shrink-0 min-w-[28px] px-1 rounded text-center font-semibold bg-[#DC241F] text-white">{r.line}</span>
          <span className="flex-1 min-w-0 truncate text-[var(--text-dim)]">{r.destination}</span>
          <span className="shrink-0 tabular-nums text-[var(--text)]">
            {r.minutes.length === 0 ? '—' : r.minutes.slice(0, 2).map((m) => (m === 0 ? t('tmb.now') : t('tmb.min', { n: m }))).join(' · ')}
          </span>
        </div>
      ))}
    </div>
  )
}
