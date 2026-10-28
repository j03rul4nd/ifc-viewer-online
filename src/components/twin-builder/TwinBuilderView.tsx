// ─── /twin-builder ───────────────────────────────────────────────────────────
// Build your own AGV warehouse twin or import tracker — the same twins as the
// demos on /msp-global, with your layout, products, suppliers, orders and
// connections. Everything runs in this browser: the settings are kept in
// localStorage, exported as a file or shared as a link (in the URL fragment,
// which never reaches a server), and the ERP / fleet / agent connections are
// called from here, straight to the user's own systems.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_AGV_CONFIG, normaliseAgvConfig, type AgvTwinConfig } from '../msp/agv/config'
import { DEFAULT_IMPORTS_CONFIG, normaliseImportsConfig, type ImportsTwinConfig } from '../msp/supply/config'
import type { AgentUpdateRow } from '../msp/supply/supply'
import { encodeConfig, decodeConfig, loadLocal, saveLocal, download } from './share'
import { btn, btnPrimary } from './Fields'
import AgvBuilder from './AgvBuilder'
import ImportsBuilder from './ImportsBuilder'

const AgvTwin = React.lazy(() => import('../msp/agv/AgvTwin'))
const ImportTracker = React.lazy(() => import('../msp/supply/ImportTracker'))

type Kind = 'agv' | 'imports'
const KEY: Record<Kind, string> = { agv: 'twin-builder:agv', imports: 'twin-builder:imports' }

/** What leaves this browser (file, link) never carries the ERP secret. */
const shareable = (kind: Kind, c: AgvTwinConfig | ImportsTwinConfig) =>
  kind === 'agv' ? { kind, config: { ...(c as AgvTwinConfig), erp: { ...(c as AgvTwinConfig).erp, auth: '' } } } : { kind, config: c }

export default function TwinBuilderView() {
  const [kind, setKind] = useState<Kind>(() => (new URLSearchParams(location.search).get('kind') === 'imports' ? 'imports' : 'agv'))
  const [agv, setAgv] = useState<AgvTwinConfig>(() => normaliseAgvConfig(loadLocal(KEY.agv) ?? DEFAULT_AGV_CONFIG))
  const [imp, setImp] = useState<ImportsTwinConfig>(() => normaliseImportsConfig(loadLocal(KEY.imports) ?? DEFAULT_IMPORTS_CONFIG))
  // The preview runs the config as of the last "Update preview".
  const [shown, setShown] = useState<{ agv: AgvTwinConfig; imports: ImportsTwinConfig; n: number }>(() => ({ agv, imports: imp, n: 0 }))
  const [updates, setUpdates] = useState<AgentUpdateRow[]>([])
  const [pane, setPane] = useState<'setup' | 'preview'>('setup')
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { document.title = 'Digital Twin Builder: AGV Warehouse and Import Tracker, Free' }, [])
  useEffect(() => { saveLocal(KEY.agv, agv) }, [agv])
  useEffect(() => { saveLocal(KEY.imports, imp) }, [imp])

  // A shared link: #c=<encoded>. Opened once, then the fragment is cleared.
  useEffect(() => {
    const m = location.hash.match(/[#&]c=([A-Za-z0-9_-]+)/)
    if (!m) return
    decodeConfig(m[1]).then((v) => {
      const o = v as { kind?: Kind; config?: unknown }
      if (o.kind === 'imports') { const c = normaliseImportsConfig(o.config); setImp(c); setKind('imports'); setShown((s) => ({ ...s, imports: c, n: s.n + 1 })) }
      else { const c = normaliseAgvConfig(o.config); setAgv((prev) => ({ ...c, erp: { ...c.erp, auth: prev.erp.auth } })); setKind('agv'); setShown((s) => ({ ...s, agv: c, n: s.n + 1 })) }
      setMsg('Opened the shared twin.')
      history.replaceState(null, '', location.pathname + location.search)
    }).catch(() => setMsg('That link could not be opened.'))
  }, [])

  const cfg = kind === 'agv' ? agv : imp
  const dirty = useMemo(() => JSON.stringify(kind === 'agv' ? shown.agv : shown.imports) !== JSON.stringify(cfg), [kind, shown, cfg])
  const apply = () => { setShown((s) => ({ agv, imports: imp, n: s.n + 1 })); setUpdates([]); setPane('preview') }
  const flash = (t: string) => { setMsg(t); window.setTimeout(() => setMsg(''), 3500) }

  const share = async () => {
    const code = await encodeConfig(shareable(kind, cfg))
    const url = `${location.origin}/twin-builder?kind=${kind}#c=${code}`
    try { await navigator.clipboard.writeText(url); flash(url.length > 8000 ? 'Link copied — it is long; a file may travel better.' : 'Link copied. Anyone who opens it sees this twin; it is not stored anywhere.') }
    catch { prompt('Copy this link', url) }
  }
  const exportFile = () => download(`${(kind === 'agv' ? agv.name : imp.setup.company).replace(/[^\w-]+/g, '-').toLowerCase() || 'twin'}-${kind}.twin.json`, JSON.stringify(shareable(kind, cfg), null, 2))
  const importFile = async (f: File) => {
    try {
      const o = JSON.parse(await f.text()) as { kind?: Kind; config?: unknown }
      if (o.kind === 'imports') { setImp(normaliseImportsConfig(o.config)); setKind('imports') }
      else { const c = normaliseAgvConfig(o.config ?? o); setAgv((prev) => ({ ...c, erp: { ...c.erp, auth: prev.erp.auth } })); setKind('agv') }
      flash('Loaded. Press Update preview to see it.')
    } catch { flash('That file is not a twin configuration.') }
  }
  const reset = () => {
    if (!confirm('Start again from the demo? Your current settings in this browser are replaced.')) return
    if (kind === 'agv') setAgv(DEFAULT_AGV_CONFIG); else setImp(DEFAULT_IMPORTS_CONFIG)
  }

  return (
    <div className="flex h-full flex-col bg-[var(--bg)] text-[var(--text)]">
      <header className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--border)] px-4 py-2.5">
        <a href="/" className="text-[14px] font-semibold text-[var(--accent-2)]">IFC Viewer Online</a>
        <h1 className="text-[14px] font-semibold">Build your own twin</h1>
        <div className="flex rounded-lg bg-[var(--surface)] p-0.5" role="tablist">
          {(['agv', 'imports'] as Kind[]).map((k) => (
            <button key={k} role="tab" aria-selected={kind === k} type="button" onClick={() => setKind(k)}
              className={`rounded-md px-3 py-1 text-[13px] font-medium ${kind === k ? 'bg-[var(--bg)] text-[var(--text)] shadow-sm' : 'text-[var(--text-dim)]'}`}>
              {k === 'agv' ? 'AGV warehouse' : 'Imports from China'}
            </button>
          ))}
        </div>
        <span className="ml-auto hidden text-[12px] text-[var(--text-faint)] md:inline">Runs in your browser · nothing is uploaded</span>
      </header>

      <div className="flex flex-none gap-1 border-b border-[var(--border)] p-1.5 md:hidden">
        {(['setup', 'preview'] as const).map((p) => (
          <button key={p} type="button" onClick={() => setPane(p)} className={`flex-1 rounded-md py-1.5 text-[13px] font-medium ${pane === p ? 'bg-[var(--surface)] text-[var(--text)]' : 'text-[var(--text-dim)]'}`}>
            {p === 'setup' ? 'Set up' : 'Preview'}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(360px,460px)_1fr]">
        <aside className={`${pane === 'setup' ? 'flex' : 'hidden'} min-h-0 flex-col border-r border-[var(--border)] md:flex`}>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3">
            <p className="text-[13px] leading-snug text-[var(--text-dim)]">
              {kind === 'agv'
                ? 'Your warehouse, products and customers, with AGVs moving the pallets. Connect your ERP to receive each confirmation, and your fleet manager to see the real carts.'
                : 'Your suppliers and purchase orders on one map, with landed cost, QC and what needs you first. Load your orders from a spreadsheet and your agent’s updates as they come.'}
            </p>
            {kind === 'agv'
              ? <AgvBuilder cfg={agv} set={(fn) => setAgv((c) => fn(c))} />
              : <ImportsBuilder cfg={imp} set={(fn) => setImp((c) => fn(c))} onUpdates={(u) => { setUpdates((l) => [...l, ...u]); setPane('preview') }} updatesCount={updates.length} />}
            <div className="py-5 text-[12px] leading-relaxed text-[var(--text-faint)]">
              Saved in this browser as you type. Files and links leave out your ERP key. <a className="underline" href="/msp-global/">See the demos</a> · <a className="underline" href="/msp-global/#contact">Want it built with you?</a>
            </div>
          </div>
          <div className="flex flex-none flex-wrap items-center gap-2 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-2.5">
            <button type="button" className={btnPrimary} onClick={apply} disabled={!dirty && shown.n > 0}>{dirty || shown.n === 0 ? 'Update preview' : 'Preview is up to date'}</button>
            <button type="button" className={btn} onClick={share}>Copy link</button>
            <button type="button" className={btn} onClick={exportFile}>Export</button>
            <button type="button" className={btn} onClick={() => fileRef.current?.click()}>Import</button>
            <button type="button" className={btn} onClick={reset}>Reset</button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = '' }} />
            {msg && <p className="w-full text-[12px] text-[var(--text-dim)]" role="status">{msg}</p>}
          </div>
        </aside>

        <main className={`${pane === 'preview' ? 'block' : 'hidden'} relative min-h-0 md:block`}>
          <React.Suspense fallback={<div className="flex h-full items-center justify-center text-[13px] text-[var(--text-dim)]">Loading the twin…</div>}>
            {kind === 'agv'
              ? <AgvTwin key={`agv-${shown.n}`} config={shown.agv} />
              : <ImportTracker key={`imp-${shown.n}`} config={shown.imports} updates={updates} />}
          </React.Suspense>
          {dirty && shown.n > 0 && (
            <button type="button" onClick={apply} className="absolute bottom-16 left-1/2 z-[700] -translate-x-1/2 rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-white shadow-lg md:bottom-4">
              Settings changed · Update preview
            </button>
          )}
        </main>
      </div>
    </div>
  )
}
