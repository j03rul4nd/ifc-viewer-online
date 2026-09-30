// Results of a comparison: summary, file pairing, filterable change list, exports.
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../../lib/viewer'
import { useCompareStore } from '../../stores/compareStore'
import { churnPercent } from '../../lib/compare/model-diff'
import { diffToCsv, diffToJson, diffToHtml } from '../../lib/compare/report'
import { locateInScene } from '../../lib/compare/overlay'
import { CHANGE_CATEGORIES, type ChangeCategory, type ElementDiff } from '../../lib/compare/types'
import { useReportText } from './useCompareText'
import { Button, Hint, Section, STATUS_COLOR, downloadBlob, stamp } from './ui'

const PAGE = 200

// Docking to the 3D view unmounts this tab; the filters survive it here, for as
// long as the diff they were set on is the current one.
interface ListView { statuses: ElementDiff['status'][]; category: ChangeCategory | ''; cls: string; storey: string; query: string }
let kept: { diff: unknown; view: ListView } | null = null

function fmt(v: unknown): string {
  if (v === undefined) return '∅'
  if (v === null) return '—'
  return Array.isArray(v) ? v.join(', ') || '∅' : String(v)
}

export default function ChangesTab({ viewerApiRef, onSaveBaseline }: {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  onSaveBaseline: () => void
}) {
  const { t, i18n } = useTranslation('compare')
  const { diff, base, head, ids, highlight, setHighlight, setDocked, setNavList, setCursor } = useCompareStore()
  const reportText = useReportText()
  const init = kept && kept.diff === diff ? kept.view : null
  const [statuses, setStatuses] = useState<Set<ElementDiff['status']>>(() => new Set(init?.statuses ?? ['added', 'removed', 'modified']))
  const [category, setCategory] = useState<ChangeCategory | ''>(init?.category ?? '')
  const [cls, setCls] = useState(init?.cls ?? '')
  const [storey, setStorey] = useState(init?.storey ?? '')
  const [query, setQuery] = useState(init?.query ?? '')
  const [limit, setLimit] = useState(PAGE)
  const [open, setOpen] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const rows = useMemo(() => {
    if (!diff) return []
    const q = query.trim().toLowerCase()
    return diff.elements.filter((e) =>
      statuses.has(e.status)
      && (!category || e.changes.some((c) => c.category === category))
      && (!cls || e.ifcClass === cls)
      && (!storey || (e.storey ?? '—') === storey)
      && (!q || e.globalId.toLowerCase().includes(q) || (e.name ?? '').toLowerCase().includes(q)
        || e.changes.some((c) => c.key.toLowerCase().includes(q))),
    )
  }, [diff, statuses, category, cls, storey, query])

  useEffect(() => { kept = { diff, view: { statuses: [...statuses], category, cls, storey, query } } }, [diff, statuses, category, cls, storey, query])

  // The dock steps through exactly what the list shows.
  useEffect(() => { setNavList(rows.map((e) => e.globalId)) }, [rows, setNavList])

  if (!diff) return <Hint>{t('changes.empty')}</Hint>

  const c = diff.counts
  const classes = Object.keys(diff.byClass).filter((k) => { const v = diff.byClass[k]; return v.added + v.removed + v.modified > 0 }).sort()
  const storeys = Object.keys(diff.byStorey).filter((k) => { const v = diff.byStorey[k]; return v.added + v.removed + v.modified > 0 }).sort()
  const canShow3d = Object.keys(head.modelIds).length > 0 || Object.keys(base.modelIds).length > 0
  const fileBase = `${stamp()}_${diff.baseLabel}_vs_${diff.headLabel}`.replace(/[^\p{L}\p{N}_.-]+/gu, '-')

  const toggleStatus = (s: ElementDiff['status']): void => setStatuses((prev) => {
    const next = new Set(prev)
    if (next.has(s)) next.delete(s); else next.add(s)
    return next.size ? next : prev
  })

  const focus = (e: ElementDiff): void => {
    const at = locateInScene(e, head.modelIds, base.modelIds)
    if (!at) return
    viewerApiRef.current?.selectElement(at.expressId, at.modelId)
    viewerApiRef.current?.focusElement(at.expressId, at.modelId)
    // Get out of the way: the element is in the 3D view, not in this dialog.
    setCursor(rows.findIndex((r) => r.globalId === e.globalId))
    setHighlight(true)
    setDocked(true)
  }

  const view3d = (): void => { setHighlight(true); setCursor(-1); setDocked(true) }
  const activeFilters = [category, cls, storey].filter(Boolean).length
  const selectCls = 'h-10 sm:h-8 px-2 rounded-lg border border-[var(--border)] bg-[rgba(14,14,18,0.98)] text-[12px] sm:text-[11.5px] text-[var(--text-dim)] w-full'
  const exports: Array<[string, () => void]> = [
    [t('export.html'), () => downloadBlob(new Blob([diffToHtml(diff, reportText, ids?.diff, i18n.language)], { type: 'text/html' }), `${fileBase}.html`)],
    [t('export.csv'), () => downloadBlob(new Blob([diffToCsv(diff)], { type: 'text/csv' }), `${fileBase}.csv`)],
    [t('export.json'), () => downloadBlob(new Blob([diffToJson(diff, ids?.diff)], { type: 'application/json' }), `${fileBase}.json`)],
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* The three counts are also the status filter: tap one to show or hide it. */}
      <div className="grid grid-cols-3 gap-2">
        {(['added', 'removed', 'modified'] as const).map((st) => {
          const on = statuses.has(st)
          return (
            <button
              key={st} type="button" aria-pressed={on} onClick={() => toggleStatus(st)}
              className={`text-left px-3 py-2.5 rounded-xl border transition-all ${on ? 'bg-[var(--surface)]' : 'opacity-45 border-dashed'}`}
              style={{ borderColor: on ? STATUS_COLOR[st] : 'var(--border)' }}
            >
              <div className="text-[22px] sm:text-[20px] font-semibold tabular-nums leading-none" style={{ color: STATUS_COLOR[st] }}>{c[st]}</div>
              <div className="mt-1 text-[11px] text-[var(--text-dim)] truncate">{t(`status.${st}`)}</div>
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-faint)] -mt-2">
        <span>{t('status.unchanged')}: <b className="font-medium text-[var(--text-dim)] tabular-nums">{c.unchanged}</b></span>
        <span>{t('changes.churn')}: <b className="font-medium text-[var(--text-dim)] tabular-nums">{churnPercent(c)} %</b></span>
        {ids && (
          <span>{t('ids.score')}: <b className="font-medium tabular-nums" style={{ color: ids.diff.headScore >= ids.diff.baseScore ? 'var(--ok)' : 'var(--danger)' }}>{ids.diff.baseScore} → {ids.diff.headScore}</b></span>
        )}
      </div>

      {(diff.duplicateGuids.base > 0 || diff.duplicateGuids.head > 0) && (
        <Hint tone="warn">{t('changes.duplicates', { base: diff.duplicateGuids.base, head: diff.duplicateGuids.head })}</Hint>
      )}
      {!diff.geometryCompared && <Hint>{t('changes.noGeometry')}</Hint>}

      <div className="flex flex-wrap gap-2 items-center">
        {canShow3d && <Button primary onClick={view3d}>{t('changes.show3d')}</Button>}
        {canShow3d && highlight && <Button small onClick={() => setHighlight(false)}>{t('changes.hide3d')}</Button>}
        <details className="relative group">
          <summary className="list-none cursor-pointer h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] text-[12px] text-[var(--text-dim)] hover:text-[var(--text)]">
            {t('export.menu')} <span className="text-[9px] transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="absolute z-20 mt-1 left-0 min-w-[160px] p-1 rounded-lg border border-[var(--border-strong)] bg-[rgba(14,14,18,0.98)] shadow-lg flex flex-col">
            {exports.map(([label, run]) => (
              <button
                key={label} type="button"
                onClick={(ev) => { run(); const d = ev.currentTarget.closest('details'); if (d) d.open = false }}
                className="h-9 px-2.5 text-left rounded-md text-[12px] text-[var(--text-dim)] hover:bg-white/10 hover:text-[var(--text)]"
              >
                {label}
              </button>
            ))}
          </div>
        </details>
        <Button onClick={onSaveBaseline} title={t('baseline.saveHint')}>{t('baseline.saveHead')}</Button>
      </div>
      {highlight && <Hint>{t('changes.legend')}</Hint>}

      <details className="group rounded-xl border border-[var(--border)]" open={diff.files.length <= 3}>
        <summary className="list-none cursor-pointer flex items-center gap-2 px-3 h-10 text-[12px] font-semibold text-[var(--text)]">
          <span className="text-[9px] text-[var(--text-faint)] transition-transform group-open:rotate-90">▶</span>
          {t('changes.files')} <span className="font-normal text-[var(--text-faint)]">({diff.files.length})</span>
        </summary>
        <ul className="m-0 px-3 pb-2 list-none flex flex-col">
          {diff.files.map((f, i) => (
            <li key={i} className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 py-1.5 border-t border-[var(--border)] text-[11.5px]">
              <span className="flex-1 min-w-0 truncate text-[var(--text-dim)]" title={`${f.base ?? '—'} → ${f.head ?? '—'}`}>
                {f.base ?? '—'} <span className="text-[var(--text-faint)]">→</span> {f.head ?? '—'}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[10.5px]" style={{ color: f.reason === 'unmatched' || f.reason === 'file-name' ? '#F5A623' : 'var(--text-faint)' }}>
                  {t(`pairing.${f.reason}`)}{f.overlap ? ` · ${Math.round(f.overlap * 100)} %` : ''}
                </span>
                <span className="ml-auto tabular-nums whitespace-nowrap">
                  <span style={{ color: STATUS_COLOR.added }}>+{f.counts.added}</span>{' '}
                  <span style={{ color: STATUS_COLOR.removed }}>−{f.counts.removed}</span>{' '}
                  <span style={{ color: STATUS_COLOR.modified }}>Δ{f.counts.modified}</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      </details>

      <Section title={t('changes.list', { count: rows.length })}>
        <div className="flex gap-2 items-center">
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('filter.search')}
            className="h-10 sm:h-8 px-3 rounded-lg border border-[var(--border)] bg-transparent text-[13px] sm:text-[12px] text-[var(--text)] flex-1 min-w-0"
          />
          <button
            type="button" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}
            className={`shrink-0 h-10 sm:h-8 px-3 rounded-lg border text-[12px] transition-colors ${showFilters || activeFilters ? 'border-[var(--accent)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-dim)]'}`}
          >
            {t('filter.toggle')}
            {activeFilters > 0 && <span className="ml-1.5 px-1.5 rounded-full bg-[var(--accent)] text-white text-[10px]">{activeFilters}</span>}
          </button>
        </div>
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select className={selectCls} value={category} onChange={(e) => setCategory(e.target.value as ChangeCategory | '')} aria-label={t('filter.category')}>
              <option value="">{t('filter.anyCategory')}</option>
              {CHANGE_CATEGORIES.filter((k) => diff.byCategory[k] > 0).map((k) => <option key={k} value={k}>{t(`category.${k}`)} ({diff.byCategory[k]})</option>)}
            </select>
            <select className={selectCls} value={cls} onChange={(e) => setCls(e.target.value)} aria-label={t('filter.class')}>
              <option value="">{t('filter.anyClass')}</option>
              {classes.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <select className={selectCls} value={storey} onChange={(e) => setStorey(e.target.value)} aria-label={t('filter.storey')}>
              <option value="">{t('filter.anyStorey')}</option>
              {storeys.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        )}

        <ul className="m-0 p-0 list-none flex flex-col">
          {rows.slice(0, limit).map((e) => {
            const at = locateInScene(e, head.modelIds, base.modelIds)
            const expanded = open === e.globalId
            return (
              <li key={e.globalId} className="border-b border-[var(--border)]">
                <div className="flex items-center gap-2.5 min-h-[52px] sm:min-h-0 py-1.5">
                  <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: STATUS_COLOR[e.status] }} aria-label={t(`status.${e.status}`)} />
                  <button type="button" onClick={() => setOpen(expanded ? null : e.globalId)} aria-expanded={expanded} className="flex-1 min-w-0 text-left py-1">
                    <span className="text-[12.5px] sm:text-[11.5px] text-[var(--text)] truncate block">{e.name || e.globalId}</span>
                    <span className="text-[11px] sm:text-[10.5px] text-[var(--text-faint)] truncate block">
                      {e.ifcClass}{e.storey ? ` · ${e.storey}` : ''}
                      {e.changes.length > 0 && ` · ${[...new Set(e.changes.map((ch) => t(`category.${ch.category}`)))].join(', ')}`}
                      {e.moveDistance != null && ` · ${e.moveDistance.toFixed(2)} m`}
                    </span>
                  </button>
                  {at && (
                    <button type="button" onClick={() => focus(e)} className="shrink-0 h-9 sm:h-7 px-3 rounded-full border border-[var(--border)] text-[11px] text-[var(--accent)] hover:border-[var(--accent)]">
                      {t('changes.locate')}
                    </button>
                  )}
                </div>
                {expanded && (
                  <div className="pb-2.5 pl-3.5 flex flex-col gap-1">
                    <span className="text-[10.5px] font-mono text-[var(--text-faint)] break-all">{e.globalId}</span>
                    {e.changes.length === 0 && <span className="text-[11px] text-[var(--text-dim)]">{e.status === 'added' ? e.headFile : e.baseFile}</span>}
                    {e.changes.map((ch, i) => (
                      <div key={i} className="text-[11.5px] text-[var(--text-dim)] break-words rounded-md bg-white/[0.03] px-2 py-1">
                        <b className="font-medium text-[var(--text)]">{t(`category.${ch.category}`)}</b>
                        {ch.key && <code className="mx-1 text-[10.5px]">{ch.key}</code>}
                        <div className="flex flex-wrap items-center gap-x-1.5">
                          <span className="line-through decoration-[var(--danger)] text-[var(--text-faint)]">{fmt(ch.before)}</span>
                          <span className="text-[var(--text-faint)]">→</span>
                          <span className="text-[var(--text)]">{fmt(ch.after)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {rows.length > limit && (
          <Button small onClick={() => setLimit((l) => l + PAGE)}>{t('changes.more', { count: rows.length - limit })}</Button>
        )}
      </Section>
    </div>
  )
}
