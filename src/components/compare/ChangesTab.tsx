// Results of a comparison: summary, file pairing, filterable change list, exports.
import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../../lib/viewer'
import { useCompareStore } from '../../stores/compareStore'
import { churnPercent } from '../../lib/compare/model-diff'
import { diffToCsv, diffToJson, diffToHtml } from '../../lib/compare/report'
import { locateInScene } from '../../lib/compare/overlay'
import { CHANGE_CATEGORIES, type ChangeCategory, type ElementDiff } from '../../lib/compare/types'
import { useReportText } from './useCompareText'
import { Button, Check, Hint, Section, Stat, STATUS_COLOR, downloadBlob, stamp } from './ui'

const PAGE = 200

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
  const { diff, base, head, ids, highlight, setHighlight } = useCompareStore()
  const reportText = useReportText()
  const [statuses, setStatuses] = useState<Set<ElementDiff['status']>>(new Set(['added', 'removed', 'modified']))
  const [category, setCategory] = useState<ChangeCategory | ''>('')
  const [cls, setCls] = useState('')
  const [storey, setStorey] = useState('')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [open, setOpen] = useState<string | null>(null)

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
  }

  const selectCls = 'h-7 px-1.5 rounded-md border border-[var(--border)] bg-transparent text-[11px] text-[var(--text-dim)] max-w-[180px]'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Stat label={t('status.added')} value={c.added} color={STATUS_COLOR.added} />
        <Stat label={t('status.removed')} value={c.removed} color={STATUS_COLOR.removed} />
        <Stat label={t('status.modified')} value={c.modified} color={STATUS_COLOR.modified} />
        <Stat label={t('status.unchanged')} value={c.unchanged} />
        <Stat label={t('changes.churn')} value={`${churnPercent(c)} %`} />
        {ids && <Stat label={t('ids.score')} value={`${ids.diff.baseScore} → ${ids.diff.headScore}`} color={ids.diff.headScore >= ids.diff.baseScore ? 'var(--ok)' : 'var(--danger)'} />}
      </div>

      {(diff.duplicateGuids.base > 0 || diff.duplicateGuids.head > 0) && (
        <Hint tone="warn">{t('changes.duplicates', { base: diff.duplicateGuids.base, head: diff.duplicateGuids.head })}</Hint>
      )}
      {!diff.geometryCompared && <Hint>{t('changes.noGeometry')}</Hint>}

      <div className="flex flex-wrap gap-2 items-center">
        {canShow3d && (
          <Button small primary={highlight} onClick={() => setHighlight(!highlight)}>
            {highlight ? t('changes.hide3d') : t('changes.show3d')}
          </Button>
        )}
        <Button small onClick={() => downloadBlob(new Blob([diffToHtml(diff, reportText, ids?.diff, i18n.language)], { type: 'text/html' }), `${fileBase}.html`)}>{t('export.html')}</Button>
        <Button small onClick={() => downloadBlob(new Blob([diffToCsv(diff)], { type: 'text/csv' }), `${fileBase}.csv`)}>{t('export.csv')}</Button>
        <Button small onClick={() => downloadBlob(new Blob([diffToJson(diff, ids?.diff)], { type: 'application/json' }), `${fileBase}.json`)}>{t('export.json')}</Button>
        <Button small onClick={onSaveBaseline} title={t('baseline.saveHint')}>{t('baseline.saveHead')}</Button>
      </div>
      {highlight && <Hint>{t('changes.legend')}</Hint>}

      <Section title={t('changes.files')}>
        <table className="w-full text-[11.5px]">
          <tbody>
            {diff.files.map((f, i) => (
              <tr key={i} className="border-b border-[var(--border)]">
                <td className="py-1 pr-2 text-[var(--text-dim)] truncate max-w-[260px]" title={`${f.base ?? '—'} → ${f.head ?? '—'}`}>
                  {f.base ?? '—'} <span className="text-[var(--text-faint)]">→</span> {f.head ?? '—'}
                </td>
                <td className="py-1 pr-2 text-[10.5px]" style={{ color: f.reason === 'unmatched' || f.reason === 'file-name' ? '#F5A623' : 'var(--text-faint)' }}>
                  {t(`pairing.${f.reason}`)}{f.overlap ? ` · ${Math.round(f.overlap * 100)} %` : ''}
                </td>
                <td className="py-1 text-right tabular-nums whitespace-nowrap">
                  <span style={{ color: STATUS_COLOR.added }}>+{f.counts.added}</span>{' '}
                  <span style={{ color: STATUS_COLOR.removed }}>−{f.counts.removed}</span>{' '}
                  <span style={{ color: STATUS_COLOR.modified }}>Δ{f.counts.modified}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={t('changes.list', { count: rows.length })}>
        <div className="flex flex-wrap gap-2 items-center">
          {(['added', 'removed', 'modified'] as const).map((s) => (
            <Check key={s} checked={statuses.has(s)} onChange={() => toggleStatus(s)}>
              <span style={{ color: STATUS_COLOR[s] }}>{t(`status.${s}`)}</span>
            </Check>
          ))}
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
          <input
            value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('filter.search')}
            className="h-7 px-2 rounded-md border border-[var(--border)] bg-transparent text-[11px] text-[var(--text)] flex-1 min-w-[140px]"
          />
        </div>

        <ul className="m-0 p-0 list-none flex flex-col">
          {rows.slice(0, limit).map((e) => {
            const at = locateInScene(e, head.modelIds, base.modelIds)
            const expanded = open === e.globalId
            return (
              <li key={e.globalId} className="border-b border-[var(--border)]">
                <div className="flex items-center gap-2 py-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLOR[e.status] }} aria-label={t(`status.${e.status}`)} />
                  <button type="button" onClick={() => setOpen(expanded ? null : e.globalId)} className="flex-1 min-w-0 text-left">
                    <span className="text-[11.5px] text-[var(--text)] truncate block">{e.name || e.globalId}</span>
                    <span className="text-[10.5px] text-[var(--text-faint)] truncate block">
                      {e.ifcClass}{e.storey ? ` · ${e.storey}` : ''}
                      {e.changes.length > 0 && ` · ${[...new Set(e.changes.map((ch) => t(`category.${ch.category}`)))].join(', ')}`}
                      {e.moveDistance != null && ` · ${e.moveDistance.toFixed(2)} m`}
                    </span>
                  </button>
                  {at && (
                    <button type="button" onClick={() => focus(e)} className="text-[10.5px] text-[var(--accent)] hover:underline shrink-0">
                      {t('changes.locate')}
                    </button>
                  )}
                </div>
                {expanded && (
                  <div className="pb-2 pl-4 flex flex-col gap-0.5">
                    <span className="text-[10.5px] font-mono text-[var(--text-faint)]">{e.globalId}</span>
                    {e.changes.length === 0 && <span className="text-[11px] text-[var(--text-dim)]">{e.status === 'added' ? e.headFile : e.baseFile}</span>}
                    {e.changes.map((ch, i) => (
                      <span key={i} className="text-[11px] text-[var(--text-dim)] break-words">
                        <b className="font-medium text-[var(--text)]">{t(`category.${ch.category}`)}</b>
                        {ch.key && <code className="mx-1 text-[10.5px]">{ch.key}</code>}: {fmt(ch.before)} <span className="text-[var(--text-faint)]">→</span> {fmt(ch.after)}
                      </span>
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
