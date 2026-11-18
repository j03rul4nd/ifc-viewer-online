// ─── Site snag list panel ─────────────────────────────────────────────────────
// List, filter, create/edit snags with photos; CSV and PDF out. Everything is
// stored in this browser (IndexedDB). Not mounted here: the host passes the
// project key and, optionally, the current 3D selection to attach.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from '../../i18n'
import {
  SNAG_PRIORITIES, SNAG_STATUSES, createSnag, distinctTrades, distinctUnits, filterSnags, isOverdue,
  nextStatuses, snagStats, snagsToCsv, transitionSnag, updateSnag,
  type Snag, type SnagFilter, type SnagLocation, type SnagPriority, type SnagStatus,
} from '../../lib/site/snags'
import { deleteSnag, loadPhoto, loadSnags, newPhotoId, savePhoto, saveSnag } from '../../lib/site/snag-store'
import { compressPhoto } from '../../lib/site/photo'
import { buildSnagReportPdf, type ReportLabels, type ReportPhoto } from '../../lib/site/snag-report'

export interface SnagSelection { modelId: string; expressId: number; globalId?: string }

export interface SnagPanelProps {
  /** Separates snag lists per project/site. */
  projectKey?: string
  selection?: SnagSelection | null
  /** Called when the user clicks a snag that has a model location. */
  onFocusLocation?: (location: SnagLocation) => void
  /** Every change of the list (e.g. to draw pins in 3D). */
  onSnagsChange?: (snags: readonly Snag[]) => void
  /** Opens this snag's form (e.g. a pin was clicked); `onOpened` acknowledges it. */
  openSnagId?: string | null
  onOpened?: () => void
}

interface FormState {
  id?: string
  title: string
  description: string
  trade: string
  priority: SnagPriority
  assignee: string
  dueDate: string
  unitId: string
  location: SnagLocation
  photoIds: string[]
}

const emptyForm = (): FormState => ({ title: '', description: '', trade: '', priority: 'medium', assignee: '', dueDate: '', unitId: '', location: {}, photoIds: [] })

function download(data: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Thumb({ project, id, onRemove }: { project: string; id: string; onRemove?: () => void }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let u: string | undefined
    let alive = true
    void loadPhoto(project, id).then((p) => { if (p && alive) { u = URL.createObjectURL(p.blob); setUrl(u) } }).catch(() => {})
    return () => { alive = false; if (u) URL.revokeObjectURL(u) }
  }, [project, id])
  return (
    <span className="relative inline-block">
      {url ? <img src={url} alt="" className="h-14 w-14 rounded object-cover" /> : <span className="inline-block h-14 w-14 rounded bg-white/10" />}
      {onRemove && <button type="button" onClick={onRemove} className="absolute -right-1 -top-1 rounded-full bg-black/70 px-1 text-xs" aria-label="x">×</button>}
    </span>
  )
}

const formOf = (s: Snag): FormState => ({ id: s.id, title: s.title, description: s.description, trade: s.trade, priority: s.priority, assignee: s.assignee, dueDate: s.dueDate, unitId: s.unitId ?? '', location: s.location, photoIds: s.photoIds })

export function SnagPanel({ projectKey = 'default', selection, onFocusLocation, onSnagsChange, openSnagId, onOpened }: SnagPanelProps) {
  const { t } = useTranslation('site')
  const [snags, setSnags] = useState<Snag[]>([])
  const [filter, setFilter] = useState<SnagFilter>({})
  const [form, setForm] = useState<FormState | null>(null)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    loadSnags(projectKey).then((s) => { if (alive) setSnags(s) }).catch(() => setError(t('storageError')))
    return () => { alive = false }
  }, [projectKey, t])

  const persist = useCallback(async (s: Snag) => {
    setSnags((list) => [s, ...list.filter((x) => x.id !== s.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    try { await saveSnag(projectKey, s) } catch { setError(t('storageError')) }
  }, [projectKey, t])

  useEffect(() => { onSnagsChange?.(snags) }, [snags, onSnagsChange])
  useEffect(() => {
    if (!openSnagId) return
    const s = snags.find((x) => x.id === openSnagId)
    if (!s) return
    setForm(formOf(s)); onOpened?.()
  }, [openSnagId, snags, onOpened])

  const visible = useMemo(() => filterSnags(snags, filter), [snags, filter])
  const stats = useMemo(() => snagStats(snags), [snags])
  const trades = useMemo(() => distinctTrades(snags), [snags])
  const units = useMemo(() => distinctUnits(snags), [snags])

  const submit = async () => {
    if (!form) return
    if (!form.title.trim()) { setError(t('titleRequired')); return }
    setError(undefined)
    const fields = { title: form.title, description: form.description, trade: form.trade.trim(), priority: form.priority, assignee: form.assignee, dueDate: form.dueDate, unitId: form.unitId.trim() || undefined, location: form.location, photoIds: form.photoIds }
    const existing = form.id ? snags.find((s) => s.id === form.id) : undefined
    await persist(existing ? updateSnag(existing, fields) : createSnag(fields))
    setForm(null)
  }

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length || !form) return
    setBusy(true)
    try {
      const ids: string[] = []
      for (const f of Array.from(files)) {
        const c = await compressPhoto(f)
        const id = newPhotoId()
        await savePhoto({ project: projectKey, id, blob: c.blob, width: c.width, height: c.height, createdAt: new Date().toISOString() })
        ids.push(id)
      }
      setForm((cur) => cur && { ...cur, photoIds: [...cur.photoIds, ...ids] })
    } catch { setError(t('storageError')) } finally { setBusy(false) }
  }

  const move = (s: Snag, to: SnagStatus) => { void persist(transitionSnag(s, to)) }

  const remove = async (s: Snag) => {
    if (!window.confirm(t('confirmDelete'))) return
    setSnags((list) => list.filter((x) => x.id !== s.id))
    try { await deleteSnag(projectKey, s) } catch { setError(t('storageError')) }
  }

  const exportCsv = () => download(snagsToCsv(visible), 'text/csv;charset=utf-8', `snags-${projectKey}.csv`)

  const exportPdf = async () => {
    setBusy(true)
    try {
      const photos = new Map<string, ReportPhoto>()
      for (const s of visible) for (const id of s.photoIds) {
        const p = await loadPhoto(projectKey, id)
        if (p) photos.set(id, { jpeg: new Uint8Array(await p.blob.arrayBuffer()), width: p.width, height: p.height })
      }
      const labels: ReportLabels = {
        title: t('reportTitle'), generated: t('generated'), noTrade: t('noTrade'), assignee: t('fieldAssignee'),
        due: t('fieldDue'), overdue: t('overdue'), unit: t('fieldUnit'), location: t('location'), total: t('total'),
        status: { open: t('status_open'), in_progress: t('status_in_progress'), resolved: t('status_resolved'), closed: t('status_closed') },
        priority: { low: t('priority_low'), medium: t('priority_medium'), high: t('priority_high'), critical: t('priority_critical') },
      }
      const pdf = buildSnagReportPdf(visible, labels, photos, { project: projectKey === 'default' ? undefined : projectKey })
      download(pdf, 'application/pdf', `snags-${projectKey}.pdf`)
    } catch { setError(t('storageError')) } finally { setBusy(false) }
  }

  const input = 'w-full rounded border border-white/15 bg-transparent px-2 py-1 text-sm'

  if (form) {
    return (
      <div className="flex flex-col gap-2 p-3 text-sm">
        <h3 className="font-semibold">{form.id ? t('edit') : t('new')}</h3>
        <label>{t('fieldTitle')}<input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus /></label>
        <label>{t('fieldDescription')}<textarea className={input} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label>{t('fieldTrade')}<input className={input} list="snag-trades" value={form.trade} onChange={(e) => setForm({ ...form, trade: e.target.value })} /></label>
        <datalist id="snag-trades">{trades.map((tr) => <option key={tr} value={tr} />)}</datalist>
        <div className="grid grid-cols-2 gap-2">
          <label>{t('fieldPriority')}
            <select className={input} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as SnagPriority })}>
              {SNAG_PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority_${p}`)}</option>)}
            </select>
          </label>
          <label>{t('fieldDue')}<input type="date" className={input} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
          <label>{t('fieldAssignee')}<input className={input} value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} /></label>
          <label>{t('fieldUnit')}<input className={input} list="snag-units" value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })} /></label>
        </div>
        <datalist id="snag-units">{units.map((u) => <option key={u} value={u} />)}</datalist>
        <div className="flex flex-wrap items-center gap-2">
          {form.location.globalId || form.location.expressId !== undefined
            ? <>
                <span className="text-xs opacity-80">{t('attached')}: {form.location.globalId ?? form.location.expressId}</span>
                <button type="button" className="text-xs underline" onClick={() => setForm({ ...form, location: {} })}>{t('detach')}</button>
              </>
            : selection && <button type="button" className="rounded border border-white/15 px-2 py-1 text-xs" onClick={() => setForm({ ...form, location: { modelId: selection.modelId, expressId: selection.expressId, globalId: selection.globalId } })}>{t('attachSelection')}</button>}
        </div>
        <div className="flex flex-wrap gap-2">
          {form.photoIds.map((id) => <Thumb key={id} project={projectKey} id={id} onRemove={() => setForm({ ...form, photoIds: form.photoIds.filter((p) => p !== id) })} />)}
          <label className="cursor-pointer rounded border border-dashed border-white/25 px-2 py-4 text-xs">
            {t('addPhoto')}
            <input type="file" accept="image/*" capture="environment" multiple className="hidden" disabled={busy} onChange={(e) => { void addPhotos(e.target.files); e.target.value = '' }} />
          </label>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button type="button" className="rounded bg-white/15 px-3 py-1" disabled={busy} onClick={() => void submit()}>{t('save')}</button>
          <button type="button" className="px-3 py-1" onClick={() => { setForm(null); setError(undefined) }}>{t('cancel')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-3 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{t('title')}</h3>
        <button type="button" className="rounded bg-white/15 px-2 py-1 text-xs" onClick={() => setForm({ ...emptyForm(), location: selection ? { modelId: selection.modelId, expressId: selection.expressId, globalId: selection.globalId } : {} })}>{t('new')}</button>
      </div>
      <p className="text-xs opacity-70">{t('stats', { total: stats.total, open: stats.byStatus.open + stats.byStatus.in_progress, overdue: stats.overdue })}</p>
      <input className={input} placeholder={t('search')} value={filter.text ?? ''} onChange={(e) => setFilter({ ...filter, text: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <select className={input} value={filter.status?.[0] ?? ''} onChange={(e) => setFilter({ ...filter, status: e.target.value ? [e.target.value as SnagStatus] : undefined })}>
          <option value="">{t('allStatuses')}</option>
          {SNAG_STATUSES.map((s) => <option key={s} value={s}>{t(`status_${s}`)}</option>)}
        </select>
        <select className={input} value={filter.trade ?? ''} onChange={(e) => setFilter({ ...filter, trade: e.target.value || undefined })}>
          <option value="">{t('allTrades')}</option>
          {trades.map((tr) => <option key={tr} value={tr}>{tr}</option>)}
        </select>
        <select className={input} value={filter.unitId ?? ''} onChange={(e) => setFilter({ ...filter, unitId: e.target.value || undefined })}>
          <option value="">{t('allUnits')}</option>
          {units.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!filter.overdue} onChange={(e) => setFilter({ ...filter, overdue: e.target.checked })} />{t('overdueOnly')}</label>
      </div>
      <div className="flex gap-2">
        <button type="button" className="rounded border border-white/15 px-2 py-1 text-xs" disabled={!visible.length} onClick={exportCsv}>{t('exportCsv')}</button>
        <button type="button" className="rounded border border-white/15 px-2 py-1 text-xs" disabled={!visible.length || busy} onClick={() => void exportPdf()}>{t('exportPdf')}</button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!snags.length && <p className="text-xs opacity-70">{t('empty')}</p>}
      <ul className="flex flex-col gap-2">
        {visible.map((s) => (
          <li key={s.id} className="rounded border border-white/10 p-2">
            <div className="flex items-start justify-between gap-2">
              <button type="button" className="text-left font-medium" onClick={() => { if (s.location.expressId !== undefined || s.location.globalId) onFocusLocation?.(s.location) }}>{s.title}</button>
              <span className="text-xs opacity-70">{t(`priority_${s.priority}`)}</span>
            </div>
            <div className="text-xs opacity-70">
              {[t(`status_${s.status}`), s.trade, s.unitId, s.assignee, s.dueDate].filter(Boolean).join(' · ')}
              {isOverdue(s) && <span className="ml-1 text-red-400">{t('overdue')}</span>}
            </div>
            {s.photoIds.length > 0 && <div className="mt-1 flex gap-1">{s.photoIds.slice(0, 4).map((id) => <Thumb key={id} project={projectKey} id={id} />)}</div>}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <select aria-label={t('moveTo')} className="rounded border border-white/15 bg-transparent px-1" value="" onChange={(e) => e.target.value && move(s, e.target.value as SnagStatus)}>
                <option value="">{t('moveTo')}</option>
                {nextStatuses(s.status).map((n) => <option key={n} value={n}>{t(`status_${n}`)}</option>)}
              </select>
              <button type="button" className="underline" onClick={() => setForm(formOf(s))}>{t('edit')}</button>
              <button type="button" className="underline opacity-70" onClick={() => void remove(s)}>{t('delete')}</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default SnagPanel
