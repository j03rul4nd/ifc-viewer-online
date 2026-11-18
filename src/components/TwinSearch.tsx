// ─── TwinSearch ───────────────────────────────────────────────────────────────
// One search box over the whole digital twin: GeoJSON features from every
// provider, IFC elements, point clouds. Picking a result moves the camera to
// it and lists what it is CONNECTED to, each link saying why — a shared code,
// a name cited in a list, being inside or a few metres from it.

import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVectorLayerStore } from '../stores/vectorLayerStore'
import { useValidationStore } from '../stores/validationStore'
import { usePointCloudStore } from '../stores/pointCloudStore'
import { getTwinIndex, focusTwinEntity, enrichIfc, onTwinIndexChange, stableRefOf, type TwinHost } from '../lib/twin/twin-sources'
import { useTwinLinkStore, linksOf, type ManualLink } from '../stores/twinLinkStore'
import { entityKey, type TwinEntity, type TwinLink, type LinkReason, type TwinRef } from '../lib/twin/twin-index'

const SOURCE_BADGE: Record<TwinEntity['ref']['source'], string> = {
  vector: 'GEO', ifc: 'IFC', pointcloud: 'PC', mesh: '3D',
}

export function TwinSearch({ host }: { host: TwinHost }) {
  const { t } = useTranslation('layers')
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [focused, setFocused] = useState<TwinRef | null>(null)
  // Re-index when anything indexable changes.
  const layers = useVectorLayerStore((s) => s.layers)
  const trees = useValidationStore((s) => s.spatialTrees)
  const clouds = usePointCloudStore((s) => s.clouds)
  const selected = useVectorLayerStore((s) => s.selected)

  // Psets and element positions arrive in the background; re-index as they do.
  const [enriched, setEnriched] = useState(0)
  useEffect(() => onTwinIndexChange(() => setEnriched((n) => n + 1)), [])
  useEffect(() => { enrichIfc(host) }, [host, trees])

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 150)
    return () => clearTimeout(id)
  }, [q])

  // A feature clicked in the scene becomes the focus too: its links show here.
  useEffect(() => {
    if (selected) setFocused({ source: 'vector', sourceId: selected.layerId, localId: String(selected.featureIndex) })
  }, [selected])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const index = useMemo(() => getTwinIndex(host), [host, layers, trees, clouds, enriched])
  const hits = useMemo(() => (debounced.trim() ? index.search(debounced, { limit: 30 }) : []), [index, debounced])
  const focusEntity = focused ? index.get(focused) : undefined
  const links = useMemo(() => (focused ? index.related(focused, { limit: 25 }) : []), [index, focused])

  const manual = useTwinLinkStore((s) => s.links)
  const linking = useTwinLinkStore((s) => s.linking)
  const [urlDraft, setUrlDraft] = useState('')
  const myManual = focusEntity ? linksOf(manual, stableRefOf(focusEntity).key) : []

  const go = (e: TwinEntity): void => {
    // "Link to…" armed: the next entity picked becomes the other end.
    if (linking) {
      useTwinLinkStore.getState().addLink(linking, stableRefOf(e))
      return
    }
    setFocused(e.ref)
    void focusTwinEntity(e, host)
  }

  const addUrl = (): void => {
    if (!focusEntity) return
    let u: URL
    try { u = new URL(urlDraft.trim()) } catch { return }
    // Only web links: a javascript: or file: URL stored here would be a trap.
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return
    useTwinLinkStore.getState().addUrl(stableRefOf(focusEntity), u.toString())
    setUrlDraft('')
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid="twin-search">
      <div className="text-[11px] font-medium">{t('search.title')}</div>
      <input
        type="search" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={t('search.placeholder')}
        className="w-full px-2 py-1.5 max-md:py-2.5 rounded-[7px] text-[11px] max-md:text-[13px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]"
      />
      <div className="text-[10px] text-[var(--text-faint)] leading-snug">
        {t('search.hint', { count: index.size })}
      </div>

      {debounced.trim() && (
        hits.length === 0
          ? <div className="text-[10px] text-[var(--text-faint)]">{t('search.empty')}</div>
          : (
            <ul className="flex flex-col max-h-60 overflow-y-auto rounded-[7px] border border-[var(--border)]" data-testid="twin-results">
              {hits.map((h) => (
                <EntityRow key={entityKey(h.entity.ref)} entity={h.entity} detail={h.matched}
                  active={!!focused && entityKey(focused) === entityKey(h.entity.ref)} onClick={() => go(h.entity)} />
              ))}
            </ul>
          )
      )}

      {linking && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-[7px] border border-dashed border-[var(--accent)] text-[10px] text-[var(--text)]">
          <span className="flex-1">{t('links.pickTarget', { label: linking.label })}</span>
          <button type="button" className="text-[var(--accent)] hover:underline"
            onClick={() => useTwinLinkStore.getState().startLinking(null)}>{t('links.cancel')}</button>
        </div>
      )}

      {focusEntity && (
        <div className="flex flex-col gap-1 mt-1" data-testid="twin-links">
          <div className="text-[10px] text-[var(--text-dim)]">
            {t('search.related', { label: focusEntity.label })}
          </div>

          {/* The user's own links come first: they are facts, not inferences. */}
          {myManual.length > 0 && (
            <ul className="flex flex-col rounded-[7px] border border-[var(--accent)]" data-testid="twin-manual-links">
              {myManual.map((l) => (
                <ManualRow key={l.id} link={l} selfKey={stableRefOf(focusEntity).key} index={index}
                  onGo={go} onRemove={() => useTwinLinkStore.getState().remove(l.id)} />
              ))}
            </ul>
          )}
          <div className="flex gap-1.5 flex-wrap">
            <button type="button" disabled={!!linking}
              className="px-2 py-1 rounded-[6px] text-[10px] border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-40"
              onClick={() => useTwinLinkStore.getState().startLinking(stableRefOf(focusEntity))}>
              {t('links.linkTo')}
            </button>
            <input value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} placeholder={t('links.urlPlaceholder')}
              onKeyDown={(e) => { if (e.key === 'Enter') addUrl() }}
              className="flex-1 min-w-[120px] px-2 py-1 rounded-[6px] text-[10px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]" />
            <button type="button" disabled={!urlDraft.trim()} onClick={addUrl}
              className="px-2 py-1 rounded-[6px] text-[10px] border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-40">
              {t('links.addUrl')}
            </button>
          </div>
          {links.length === 0
            ? <div className="text-[10px] text-[var(--text-faint)]">{t('search.noRelated')}</div>
            : (
              <ul className="flex flex-col max-h-60 overflow-y-auto rounded-[7px] border border-[var(--border)]">
                {links.map((l) => (
                  <EntityRow key={entityKey(l.entity.ref)} entity={l.entity} detail={describeLink(l, t as unknown as TFn)}
                    onClick={() => go(l.entity)} />
                ))}
              </ul>
            )}
        </div>
      )}
    </div>
  )
}

function EntityRow({ entity, detail, active, onClick }: {
  entity: TwinEntity; detail: string; active?: boolean; onClick: () => void
}) {
  return (
    <li>
      <button type="button" onClick={onClick}
        className={`w-full text-left px-2 py-1.5 max-md:py-2.5 flex items-start gap-1.5 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-2)] ${active ? 'bg-[var(--surface-2)]' : ''}`}>
        <span className="shrink-0 mt-px px-1 rounded text-[8px] font-mono font-semibold bg-white/[0.06] text-[var(--text-dim)]">
          {SOURCE_BADGE[entity.ref.source]}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] text-[var(--text)] truncate">{entity.label}</span>
          <span className="block text-[10px] text-[var(--text-faint)] truncate">
            {entity.kind} · {entity.sourceLabel}{detail && detail !== entity.label ? ` · ${detail}` : ''}
          </span>
        </span>
      </button>
    </li>
  )
}

type TFn = (key: string, opts?: Record<string, unknown>) => string

function describeReason(r: LinkReason, t: TFn): string {
  switch (r.type) {
    case 'sharedValue': return t('search.reason.shared', { field: r.fieldB === 'label' ? r.fieldA : r.fieldB, value: r.value })
    case 'inside': return t('search.reason.inside')
    case 'contains': return t('search.reason.contains')
    case 'near': return t('search.reason.near', { m: r.distanceM })
  }
}

function describeLink(l: TwinLink, t: TFn): string {
  return l.reasons.slice(0, 2).map((r) => describeReason(r, t)).join(' · ')
}

function ManualRow({ link, selfKey, index, onGo, onRemove }: {
  link: ManualLink
  selfKey: string
  index: ReturnType<typeof getTwinIndex>
  onGo: (e: TwinEntity) => void
  onRemove: () => void
}) {
  const { t } = useTranslation('layers')
  const other = link.to ? (link.from.key === selfKey ? link.to : link.from) : null
  const loaded = other ? index.getByStableKey(other.key) : undefined
  return (
    <li className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--border)] last:border-b-0">
      <span className="shrink-0 px-1 rounded text-[8px] font-mono font-semibold bg-[var(--accent)]/20 text-[var(--text)]">
        {link.url ? 'URL' : t('links.badge')}
      </span>
      {link.url ? (
        <a href={link.url} target="_blank" rel="noopener noreferrer"
          className="flex-1 min-w-0 truncate text-[11px] text-[var(--accent)] hover:underline">{link.title ?? link.url}</a>
      ) : loaded ? (
        <button type="button" onClick={() => onGo(loaded)} className="flex-1 min-w-0 text-left truncate text-[11px] text-[var(--text)] hover:underline">
          {loaded.label} <span className="text-[var(--text-faint)]">· {loaded.sourceLabel}</span>
        </button>
      ) : (
        <span className="flex-1 min-w-0 truncate text-[11px] text-[var(--text-faint)]" title={t('links.notLoaded')}>
          {other?.label} · {t('links.notLoaded')}
        </span>
      )}
      <button type="button" aria-label={t('links.remove')} title={t('links.remove')} onClick={onRemove}
        className="shrink-0 w-5 h-5 text-[10px] text-[var(--text-dim)] hover:text-[var(--text)]">✕</button>
    </li>
  )
}
