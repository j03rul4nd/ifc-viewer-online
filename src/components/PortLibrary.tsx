// ─── PortLibrary ──────────────────────────────────────────────────────────────
// The Port de Barcelona's public IFC library (CC BY 4.0) inside the demo gallery.
// Its server allows no cross-origin reads, so what opens here is our own copy
// (scripts/port-library/mirror.py). Heavier objects link to the Port's page.

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DemoSet } from '../demo-models/models'
import { portCategories, portDemoSet, searchPort, PORT_SITE, type PortObject } from '../demo-models/port-library'

const CATEGORY_KEYS: Record<string, string> = {
  Cerramientos: 'fences', 'Elementos portuarios': 'port', 'Elementos viales': 'road', 'Equipamiento portuario': 'equipment',
  'Medios Operación': 'operation', 'Medios Transporte': 'transport', 'Mobiliario Urbano': 'furniture', Monumento: 'monument',
}

const size = (n: number): string => (n < 1e6 ? `${Math.max(1, Math.round(n / 1e3))} KB` : `${(n / 1e6).toFixed(1)} MB`)

export default function PortLibrary({ onPick }: { onPick: (set: DemoSet) => void }) {
  const { t } = useTranslation('layers', { keyPrefix: 'portLibrary' })
  const [all, setAll] = useState<PortObject[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const deferred = useDeferredValue(query)
  // The catalogue only downloads for someone who came to look at it.
  useEffect(() => { void import('../demo-models/port-library.json').then((m) => setAll(m.default as PortObject[])) }, [])
  const shown = useMemo(() => searchPort(all, deferred, category), [all, deferred, category])
  const chipCls = (on: boolean): string => `shrink-0 h-8 px-3 rounded-full text-[12px] border transition-colors ${on ? 'border-[var(--accent)] text-[var(--text)] bg-[var(--surface-2)]' : 'border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)]'}`

  return (
    <div className="flex flex-col gap-4" data-testid="port-library">
      <p className="text-[13px] leading-[1.5] text-[var(--text-dim)] max-w-[680px]">{t('intro')}</p>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search')} aria-label={t('search')} data-testid="port-search"
        className="w-full h-10 px-3 rounded-[8px] text-[13px] max-md:text-[16px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]" />
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
        <button type="button" className={chipCls(category === null)} onClick={() => setCategory(null)}>{t('all')}</button>
        {portCategories(all).map((c) => (
          <button key={c} type="button" className={chipCls(category === c)} onClick={() => setCategory(c)}>{t(`categories.${CATEGORY_KEYS[c] ?? 'port'}` as never)}</button>
        ))}
      </div>
      <p aria-live="polite" className="text-[12px] text-[var(--text-faint)]">{t('count', { count: shown.length })}</p>
      {shown.length === 0 && all.length > 0 && <p className="py-8 text-center text-[13px] text-[var(--text-dim)]">{t('empty')}</p>}
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {shown.map((o) => <Card key={o.id} o={o} onPick={onPick} />)}
      </ul>
      <p className="text-[12px] leading-[1.5] text-[var(--text-faint)]">
        {t('credit')}{' '}
        <a className="underline hover:text-[var(--text)]" href={PORT_SITE} target="_blank" rel="noopener noreferrer">Port de Barcelona</a>{' · '}
        <a className="underline hover:text-[var(--text)]" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>
      </p>
    </div>
  )
}

function Card({ o, onPick }: { o: PortObject; onPick: (set: DemoSet) => void }) {
  const { t } = useTranslation('layers', { keyPrefix: 'portLibrary' })
  const set = portDemoSet(o)
  const label = <span className="block text-[12.5px] leading-[1.35] font-medium text-[var(--text)] line-clamp-2">{o.name}</span>
  return (
    <li className="min-w-0 rounded-[10px] border border-[var(--border)] overflow-hidden [content-visibility:auto] [contain-intrinsic-size:auto_220px]">
      {set ? (
        <button type="button" className="block w-full text-left hover:bg-[var(--surface-2)] transition-colors" data-testid="port-open" onClick={() => onPick(set)}>
          {o.thumb
            ? <img src={`${import.meta.env.BASE_URL}models/port-bcn/${encodeURIComponent(o.thumb)}`} alt="" loading="lazy" decoding="async" className="block w-full aspect-[4/3] object-cover bg-white" />
            : <span className="block w-full aspect-[4/3] bg-[var(--surface-2)]" />}
          <span className="block p-2.5">
            {label}
            <span className="block mt-1 text-[11.5px] text-[var(--text-faint)]">{o.lod} · {size(o.size ?? 0)}</span>
          </span>
        </button>
      ) : (
        <a className="block p-2.5 hover:bg-[var(--surface-2)] transition-colors" href={`${PORT_SITE}${o.lods[0].url}`} target="_blank" rel="noopener noreferrer">
          {label}
          <span className="block mt-1 text-[11.5px] text-[var(--text-faint)]">{t('onPortSite', { size: size(Math.min(...o.lods.map((l) => l.size))) })}</span>
        </a>
      )}
    </li>
  )
}
