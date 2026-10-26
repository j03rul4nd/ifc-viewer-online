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

interface FederationBarProps {
  models: SceneModel[]
  query: string
  onQuery: (q: string) => void
  layersOpen: boolean
  onLayersOpen: (open: boolean) => void
  /** Bulk visibility: one call with every change, so filters re-apply once per model. */
  onSetVisible: (id: string, visible: boolean) => void
}

const chip = 'h-[24px] max-md:h-9 px-2 rounded-[6px] border text-[10.5px] max-md:text-[12px] font-medium transition-colors whitespace-nowrap'
const chipOff = 'text-[var(--text-dim)] border-[var(--border)] hover:text-[var(--text)] hover:border-[var(--border-strong)]'
const chipOn = 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border-strong)]'

export default function FederationBar({ models, query, onQuery, layersOpen, onLayersOpen, onSetVisible }: FederationBarProps) {
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

  const byDiscipline = useMemo(() => {
    const out = new Map<Discipline, SceneModel[]>()
    for (const m of models) {
      const d = disciplineOf(m, disciplineById)
      out.set(d, [...(out.get(d) ?? []), m])
    }
    return DISCIPLINES.filter((d) => out.has(d)).map((d) => ({ d, members: out.get(d)! }))
  }, [models, disciplineById])

  const views = useMemo(() => viewsFor(allViews, models), [allViews, models])
  const apply = (next: Record<string, boolean>) => {
    for (const m of models) if (m.id in next && next[m.id] !== m.visible) onSetVisible(m.id, next[m.id])
  }
  const setAll = (v: boolean) => apply(Object.fromEntries(models.map((m) => [m.id, v])))
  // Clicking a discipline toggles it; Alt/⌥-click shows only that discipline.
  const toggleDiscipline = (d: Discipline, members: SceneModel[], solo: boolean) => {
    const ids = new Set(members.map((m) => m.id))
    if (solo) { apply(Object.fromEntries(models.map((m) => [m.id, ids.has(m.id)]))); return }
    const anyOn = members.some((m) => m.visible)
    apply(Object.fromEntries(members.map((m) => [m.id, !anyOn])))
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

      {byDiscipline.length > 1 && (
        <div className="flex items-center gap-1 flex-wrap" role="group" aria-label={t('scene.federation.disciplines')}>
          {byDiscipline.map(({ d, members }) => {
            const on = members.filter((m) => m.visible).length
            return (
              <button
                key={d}
                onClick={(e) => toggleDiscipline(d, members, e.altKey)}
                title={`${t(`scene.federation.discipline.${d}`)} · ${on}/${members.length} — ${t('scene.federation.disciplineHint')}`}
                aria-pressed={on > 0}
                className={`${chip} ${on > 0 ? chipOn : chipOff} flex items-center gap-1 ${on === 0 ? 'opacity-55' : ''}`}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: disciplineColor(d) }} />
                {t(`scene.federation.discipline.${d}`)}
                <span className="text-[var(--text-muted)] tabular-nums">{members.length}</span>
              </button>
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
export function ModelLayerControls({ model }: { model: SceneModel }) {
  const { t } = useTranslation('viewer')
  const disciplineById = useFederationStore((s) => s.disciplineById)
  const setDiscipline = useFederationStore((s) => s.setDiscipline)
  const opacity = useFederationStore((s) => s.opacityById[model.id] ?? 1)
  const setOpacity = useFederationStore((s) => s.setOpacity)
  const d = disciplineOf(model, disciplineById)
  return (
    <div className="flex items-center gap-1.5 pl-7 pr-2 pb-1.5 -mt-0.5">
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
    </div>
  )
}
