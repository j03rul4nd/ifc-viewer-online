// ─── FederationBar ───────────────────────────────────────────────────────────
// The Scene panel's controls for a set of files as a whole: find a file, show /
// hide / invert all, flip a whole discipline, colour the set by discipline,
// ghost files, and save the combination as a named view to come back to.
// The per-row part (discipline picker + opacity) is ModelLayerControls.
// Logic lives in lib/federation; state in federationStore.

import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SceneModel } from '../types'
import { useFederationStore, disciplineOf, disciplineColor } from '../stores/federationStore'
import {
  DISCIPLINES, captureView, resolveView, viewsFor, invertVisibility, clampOpacity,
  type Discipline,
} from '../lib/federation'
import { toast } from '../stores/toastStore'
import { modelRegistry } from '../lib/model-registry'
import {
  facetBuckets, usefulFacets, supersededIds, readSchema, parseContainerName,
  type FacetKind, type FacetInput,
} from '../lib/federation-index'

interface FederationBarProps {
  models: SceneModel[]
  query: string
  onQuery: (q: string) => void
  layersOpen: boolean
  onLayersOpen: (open: boolean) => void
  /** Bulk visibility: one call with every change, so filters re-apply once per model. */
  onSetVisible: (id: string, visible: boolean) => void
  /** Take models out of the scene, keeping them in the set (see federationStore.parked). */
  onPark: (ids: string[]) => void
  /** Load parked models back. */
  onUnpark: (parkedIds: string[]) => void
}

const fmtMB = (b: number): string => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : `${Math.max(0.1, b / 1024 ** 2).toFixed(1)} MB`)
/** Above this much IFC in the scene a browser tab starts to struggle on an average laptop. */
const HEAVY_SCENE_BYTES = 600 * 1024 ** 2

/** Schema read from the STEP header once per model. */
const schemaCache = new Map<string, FacetInput['schema']>()
function schemaOf(id: string): FacetInput['schema'] {
  if (!schemaCache.has(id)) schemaCache.set(id, readSchema(modelRegistry.getBuffer(id)))
  return schemaCache.get(id) ?? null
}

const chip = 'h-[24px] max-md:h-9 px-2 rounded-[6px] border text-[10.5px] max-md:text-[12px] font-medium transition-colors whitespace-nowrap'
const chipOff = 'text-[var(--text-dim)] border-[var(--border)] hover:text-[var(--text)] hover:border-[var(--border-strong)]'
const chipOn = 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border-strong)]'

export default function FederationBar({ models, query, onQuery, layersOpen, onLayersOpen, onSetVisible, onPark, onUnpark }: FederationBarProps) {
  const { t } = useTranslation('viewer')
  const disciplineById = useFederationStore((s) => s.disciplineById)
  const opacityById = useFederationStore((s) => s.opacityById)
  const colorOn = useFederationStore((s) => s.colorByDiscipline)
  const setColorOn = useFederationStore((s) => s.setColorByDiscipline)
  const setOpacity = useFederationStore((s) => s.setOpacity)
  const allViews = useFederationStore((s) => s.views)
  const saveView = useFederationStore((s) => s.saveView)
  const deleteView = useFederationStore((s) => s.deleteView)
  const [viewsOpen, setViewsOpen] = useState(false)
  const [viewName, setViewName] = useState('')

  const parked = useFederationStore((s) => s.parked)
  const unparkEntry = useFederationStore((s) => s.unpark)
  const [facet, setFacet] = useState<FacetKind>('discipline')
  const [parkedOpen, setParkedOpen] = useState(false)

  const facetInputs = useMemo<FacetInput[]>(() => models.map((m) => ({
    id: m.id, fileName: m.fileName, loadedAt: m.loadedAt,
    discipline: disciplineOf(m, disciplineById), schema: schemaOf(m.id),
  })), [models, disciplineById])
  const facets = useMemo(() => {
    const u = usefulFacets(facetInputs)
    return u.length > 0 ? u : (['discipline'] as FacetKind[])
  }, [facetInputs])
  const activeFacet = facets.includes(facet) ? facet : facets[0]
  const buckets = useMemo(() => facetBuckets(activeFacet, facetInputs), [activeFacet, facetInputs])
  const superseded = useMemo(() => supersededIds(facetInputs), [facetInputs])
  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models])

  const bucketLabel = (value: string): string => {
    if (value === '?') return t('scene.federation.facetUnknown')
    if (activeFacet === 'discipline') return t(`scene.federation.discipline.${value as Discipline}`)
    if (activeFacet === 'version') return t(value === 'old' ? 'scene.federation.versionOld' : 'scene.federation.versionLatest')
    if (activeFacet === 'schema' && value === 'other') return t('scene.federation.facetUnknown')
    return value
  }

  const loadedBytes = models.reduce((n, m) => n + (m.fileSize || 0), 0)
  const parkedBytes = parked.reduce((n, p) => n + p.fileSize, 0)

  const views = useMemo(() => viewsFor(allViews, models), [allViews, models])
  const apply = (next: Record<string, boolean>) => {
    for (const m of models) if (m.id in next && next[m.id] !== m.visible) onSetVisible(m.id, next[m.id])
  }
  const setAll = (v: boolean) => apply(Object.fromEntries(models.map((m) => [m.id, v])))
  // Clicking a bucket toggles it; Alt/⌥-click shows only that bucket.
  const toggleBucket = (ids: string[], solo: boolean) => {
    const set = new Set(ids)
    if (solo) { apply(Object.fromEntries(models.map((m) => [m.id, set.has(m.id)]))); return }
    const anyOn = ids.some((id) => byId.get(id)?.visible)
    apply(Object.fromEntries(ids.map((id) => [id, !anyOn])))
  }
  const ghostOthers = () => {
    // Ghost every discipline but MEP/structure — the classic clash-review look.
    for (const m of models) {
      const d = disciplineOf(m, disciplineById)
      setOpacity(m.id, d === 'A' || d === 'C' || d === 'L' ? 0.15 : 1)
    }
    onLayersOpen(true)
  }
  const resetOpacity = () => { for (const m of models) setOpacity(m.id, 1) }
  const anyGhost = models.some((m) => (opacityById[m.id] ?? 1) < 0.999)

  const onSave = () => {
    const name = viewName.trim() || t('scene.federation.viewDefault', { n: views.length + 1 })
    saveView(captureView(name, models, opacityById, colorOn))
    setViewName('')
    toast(t('scene.federation.viewSaved', { name }), 'success')
  }
  const onApply = (id: string) => {
    const view = allViews.find((v) => v.id === id)
    if (!view) return
    const r = resolveView(view, models)
    apply(r.visible)
    for (const [mid, o] of Object.entries(r.opacity)) setOpacity(mid, clampOpacity(o))
    setColorOn(view.colorByDiscipline)
    if (r.matched < Object.keys(view.visible).length) {
      toast(t('scene.federation.viewPartial', { matched: r.matched, total: Object.keys(view.visible).length }), 'info')
    }
  }

  const visibleCount = models.filter((m) => m.visible).length

  return (
    <div className="px-2 pt-2 space-y-1.5" data-testid="federation-bar">
      {models.length > 4 && (
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t('scene.federation.search', { count: models.length })}
          aria-label={t('scene.federation.search', { count: models.length })}
          className="w-full h-[26px] max-md:h-10 max-md:text-[16px] px-2 rounded-[7px] bg-[rgba(255,255,255,0.05)] border border-[var(--border)] text-[11px] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
        />
      )}

      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[10px] text-[var(--text-muted)] tabular-nums mr-0.5" title={t('scene.federation.visibleHint')}>
          {visibleCount}/{models.length}
        </span>
        <button className={`${chip} ${chipOff}`} onClick={() => setAll(true)} disabled={visibleCount === models.length}>{t('scene.federation.showAll')}</button>
        <button className={`${chip} ${chipOff}`} onClick={() => setAll(false)} disabled={visibleCount === 0}>{t('scene.federation.hideAll')}</button>
        <button className={`${chip} ${chipOff}`} onClick={() => apply(invertVisibility(models))} title={t('scene.federation.invertHint')}>{t('scene.federation.invert')}</button>
      </div>

      <div className="space-y-1">
        {facets.length > 1 && (
          <div className="flex items-center gap-0.5 flex-wrap" role="tablist" aria-label={t('scene.federation.filterBy')}>
            {facets.map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={activeFacet === k}
                onClick={() => setFacet(k)}
                className={`h-[20px] max-md:h-8 px-1.5 rounded-[5px] text-[10px] max-md:text-[12px] uppercase tracking-wide transition-colors ${activeFacet === k ? 'text-[var(--text)] bg-white/[0.06]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
              >
                {t(`scene.federation.facet.${k}`)}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1 flex-wrap" role="group" aria-label={t(`scene.federation.facet.${activeFacet}`)}>
          {buckets.map(({ value, ids }) => {
            const on = ids.filter((id) => byId.get(id)?.visible).length
            return (
              <button
                key={value}
                onClick={(e) => toggleBucket(ids, e.altKey)}
                title={`${bucketLabel(value)} · ${on}/${ids.length} — ${t('scene.federation.disciplineHint')}`}
                aria-pressed={on > 0}
                className={`${chip} ${on > 0 ? chipOn : chipOff} flex items-center gap-1 ${on === 0 ? 'opacity-55' : ''}`}
              >
                {activeFacet === 'discipline' && value !== '?' && (
                  <span className="w-2 h-2 rounded-full" style={{ background: disciplineColor(value as Discipline) }} />
                )}
                {bucketLabel(value)}
                <span className="text-[var(--text-muted)] tabular-nums">{ids.length}</span>
              </button>
            )
          })}
        </div>
      </div>

      {superseded.size > 0 && (
        <div className="flex items-center gap-1 flex-wrap rounded-md border border-[var(--border)] px-1.5 py-1">
          <span className="text-[10px] text-[var(--text-dim)] flex-1 min-w-[120px]">
            {t('scene.federation.supersededNote', { count: superseded.size })}
          </span>
          <button className={`${chip} ${chipOff}`} onClick={() => apply(Object.fromEntries(models.map((m) => [m.id, !superseded.has(m.id)])))}>
            {t('scene.federation.latestOnly')}
          </button>
          <button className={`${chip} ${chipOff}`} onClick={() => onPark([...superseded])} title={t('scene.federation.parkOldHint')}>
            {t('scene.federation.parkOld')}
          </button>
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-[var(--text-muted)] tabular-nums">
        <span className={loadedBytes > HEAVY_SCENE_BYTES ? 'text-[var(--warn)]' : ''} title={loadedBytes > HEAVY_SCENE_BYTES ? t('scene.federation.heavyHint') : undefined}>
          {t('scene.federation.memory', { count: models.length, size: fmtMB(loadedBytes) })}
        </span>
        {parked.length > 0 && (
          <button className="underline decoration-dotted hover:text-[var(--text)]" aria-expanded={parkedOpen} onClick={() => setParkedOpen((v) => !v)}>
            {t('scene.federation.parkedCount', { count: parked.length, size: fmtMB(parkedBytes) })}
          </button>
        )}
      </div>

      {parkedOpen && parked.length > 0 && (
        <div className="rounded-md border border-[var(--border)] p-1.5 space-y-1" data-testid="parked-models">
          <div className="flex items-center gap-1">
            <span className="flex-1 text-[10px] text-[var(--text-dim)] leading-snug">{t('scene.federation.parkedHint')}</span>
            <button className={`${chip} ${chipOff}`} onClick={() => onUnpark(parked.map((p) => p.id))}>{t('scene.federation.loadAll')}</button>
          </div>
          {parked.map((p) => {
            const c = parseContainerName(p.fileName)
            return (
              <div key={p.id} className="flex items-center gap-1">
                <span className="flex-1 min-w-0 truncate text-[11px] text-[var(--text)]" title={p.fileName}>
                  {p.fileName}
                  <span className="ml-1 text-[9.5px] text-[var(--text-muted)]">{fmtMB(p.fileSize)}{c.revision ? ` · ${c.revision}` : ''}</span>
                </span>
                <button className={`${chip} ${chipOff}`} onClick={() => onUnpark([p.id])}>{t('scene.federation.load')}</button>
                <button onClick={() => unparkEntry(p.id)} aria-label={t('scene.federation.forget', { name: p.fileName })} className="flex-none w-5 h-5 max-md:w-9 max-md:h-9 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--danger)]">
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M1 1l8 8M9 1L1 9"/></svg>
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-1 flex-wrap">
        <button className={`${chip} ${colorOn ? chipOn : chipOff}`} aria-pressed={colorOn} onClick={() => setColorOn(!colorOn)} title={t('scene.federation.colorHint')}>
          {t('scene.federation.color')}
        </button>
        <button className={`${chip} ${layersOpen ? chipOn : chipOff}`} aria-pressed={layersOpen} onClick={() => onLayersOpen(!layersOpen)} title={t('scene.federation.layersHint')}>
          {t('scene.federation.layers')}
        </button>
        {anyGhost
          ? <button className={`${chip} ${chipOff}`} onClick={resetOpacity}>{t('scene.federation.solid')}</button>
          : <button className={`${chip} ${chipOff}`} onClick={ghostOthers} title={t('scene.federation.ghostHint')}>{t('scene.federation.ghost')}</button>}
        <button className={`${chip} ${viewsOpen ? chipOn : chipOff}`} aria-expanded={viewsOpen} onClick={() => setViewsOpen((v) => !v)}>
          {t('scene.federation.views')}{views.length ? ` · ${views.length}` : ''}
        </button>
      </div>

      {viewsOpen && (
        <div className="rounded-md border border-[var(--border)] p-1.5 space-y-1">
          <div className="flex gap-1">
            <input
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSave() }}
              placeholder={t('scene.federation.viewName')}
              aria-label={t('scene.federation.viewName')}
              maxLength={60}
              className="flex-1 min-w-0 h-[24px] max-md:h-10 max-md:text-[16px] px-1.5 rounded-[6px] bg-[rgba(255,255,255,0.05)] border border-[var(--border)] text-[11px] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
            <button className={`${chip} ${chipOff}`} onClick={onSave}>{t('scene.federation.saveView')}</button>
          </div>
          {views.length === 0 && <p className="text-[10px] text-[var(--text-muted)] leading-snug px-0.5">{t('scene.federation.noViews')}</p>}
          {views.map((v) => (
            <div key={v.id} className="flex items-center gap-1">
              <button onClick={() => onApply(v.id)} className="flex-1 min-w-0 text-left text-[11px] max-md:text-[13px] max-md:py-2 text-[var(--text)] hover:text-[var(--accent)] truncate px-0.5" title={t('scene.federation.applyView')}>
                {v.name}
                <span className="ml-1 text-[9.5px] text-[var(--text-muted)]">
                  {Object.values(v.visible).filter(Boolean).length}/{Object.keys(v.visible).length}
                </span>
              </button>
              <button onClick={() => deleteView(v.id)} aria-label={t('scene.federation.deleteView', { name: v.name })} className="flex-none w-5 h-5 max-md:w-9 max-md:h-9 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--danger)]">
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M1 1l8 8M9 1L1 9"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Per-row layer controls: discipline (colour) and opacity. */
export function ModelLayerControls({ model, onPark }: { model: SceneModel; onPark?: () => void }) {
  const { t } = useTranslation('viewer')
  const disciplineById = useFederationStore((s) => s.disciplineById)
  const setDiscipline = useFederationStore((s) => s.setDiscipline)
  const opacity = useFederationStore((s) => s.opacityById[model.id] ?? 1)
  const setOpacity = useFederationStore((s) => s.setOpacity)
  const d = disciplineOf(model, disciplineById)
  const schema = schemaOf(model.id)
  const rev = parseContainerName(model.fileName).revision
  return (
    <div className="flex items-center gap-1.5 pl-7 pr-2 pb-1.5 -mt-0.5">
      {(schema || rev) && (
        <span className="flex-none text-[9px] text-[var(--text-muted)] tabular-nums" title={t('scene.federation.badgeHint')}>
          {[schema && schema !== 'other' ? schema : null, rev].filter(Boolean).join(' · ')}
        </span>
      )}
      <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: disciplineColor(d) }} />
      <select
        value={d}
        onChange={(e) => setDiscipline(model.id, e.target.value as Discipline)}
        aria-label={t('scene.federation.disciplineOf', { file: model.fileName })}
        className="h-[22px] max-md:h-9 bg-transparent border border-[var(--border)] rounded-[5px] text-[10px] max-md:text-[13px] text-[var(--text-dim)] px-0.5 focus:outline-none focus:border-[var(--accent)]"
      >
        {DISCIPLINES.map((x) => <option key={x} value={x}>{t(`scene.federation.discipline.${x}`)}</option>)}
      </select>
      <input
        type="range" min={0.05} max={1} step={0.05}
        value={opacity}
        onChange={(e) => setOpacity(model.id, Number(e.target.value))}
        aria-label={t('scene.federation.opacityOf', { file: model.fileName })}
        className="flex-1 min-w-0 accent-[var(--accent)]"
      />
      <span className="w-8 text-right text-[10px] text-[var(--text-muted)] tabular-nums">{Math.round(opacity * 100)}%</span>
      {onPark && (
        <button
          onClick={onPark}
          title={t('scene.federation.parkHint')}
          className="flex-none h-[22px] max-md:h-9 px-1.5 rounded-[5px] border border-[var(--border)] text-[10px] max-md:text-[12px] text-[var(--text-dim)] hover:text-[var(--text)]"
        >
          {t('scene.federation.park')}
        </button>
      )}
    </div>
  )
}
