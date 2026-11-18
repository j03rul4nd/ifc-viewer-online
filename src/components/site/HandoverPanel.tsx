// ─── Key handover walkthrough ─────────────────────────────────────────────────
// Opened from a unit row: checklist per room, meters, keys, both signatures,
// then a signed PDF. Defects become snags for the unit. Saved in IndexedDB.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from '../../i18n'
import { downloadBlob } from '../compare/ui'
import SignaturePad from './SignaturePad'
import {
  CATEGORY_TRADE, HANDOVER_CATEGORIES, HANDOVER_RESULTS, canSign, createHandover, groupByRoom, handoverSummary, linkedSnagIds,
  markItem, parseAttendees, setItemNote, signHandover, updateHandover, validateHandover,
  type Handover, type HandoverCategory, type HandoverPatch, type HandoverResult, type HandoverUnit,
} from '../../lib/site/handover'
import { deleteHandoverDraft, loadHandovers, saveHandover } from '../../lib/site/handover-store'
import { buildHandoverPdf, type HandoverReportLabels } from '../../lib/site/handover-report'
import { loadPhoto, loadSnags, saveSnag } from '../../lib/site/snag-store'
import { canvasTextRasterizer, pngDataUrlToJpeg } from '../../lib/site/pdf-text-raster'
import type { PdfImage } from '../../lib/site/pdf-doc'

interface Props {
  unit: HandoverUnit
  project: string
  onClose: () => void
  /** Called once the handover is signed (the host marks the unit delivered). */
  onSigned: (h: Handover) => void
}

const btn = 'rounded border border-white/15 px-2 py-1 text-xs disabled:opacity-40'
const btnPrimary = 'rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-contrast,#fff)] disabled:opacity-40'
const input = 'w-full rounded border border-white/15 bg-transparent px-2 py-1 text-sm disabled:opacity-70'
const RESULT_STYLE: Record<HandoverResult, string> = { ok: 'bg-emerald-600 text-white', defect: 'bg-red-600 text-white', na: 'bg-slate-500 text-white' }

export default function HandoverPanel({ unit, project, onClose, onSigned }: Props) {
  const { t } = useTranslation('site')
  const ht = useCallback((k: string, o?: Record<string, unknown>) => String(t(`handover.${k}`, o as never)), [t])
  const [list, setList] = useState<Handover[]>([])
  const [h, setH] = useState<Handover | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    loadHandovers(project, unit.id).then((rows) => {
      if (!alive) return
      setList(rows)
      setH(rows[0] ?? createHandover(unit))
    }).catch(() => { if (alive) { setH(createHandover(unit)); setMessage(ht('saveFailed')) } })
    return () => { alive = false }
    // Only a different unit restarts the walkthrough, not a new object for the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, unit.id])

  const persist = useCallback((next: Handover) => {
    setH(next)
    setList((l) => [next, ...l.filter((x) => x.id !== next.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    saveHandover(project, next).catch(() => setMessage(ht('saveFailed')))
  }, [project, ht])

  const readOnly = h?.status === 'signed'
  const patch = (p: HandoverPatch) => { if (h && !readOnly) persist(updateHandover(h, p)) }

  const catLabel = (c: HandoverCategory) => ht(`cat.${c}`)
  const mark = async (itemId: string, result: HandoverResult) => {
    if (!h || readOnly) return
    const item = h.checklist.find((i) => i.id === itemId)
    if (!item) return
    const title = `${unit.name} · ${item.room || ht('general')} · ${catLabel(item.category)}`
    const r = markItem(h, itemId, result, { title, trade: ht(`trade.${CATEGORY_TRADE[item.category]}`) })
    persist(r.handover)
    if (r.snag) {
      try { await saveSnag(project, r.snag); setMessage(ht('snagCreated')) } catch { setMessage(ht('saveFailed')) }
    }
  }

  const issues = useMemo(() => (h ? validateHandover(h) : []), [h])
  const summary = useMemo(() => (h ? handoverSummary(h) : null), [h])

  const sign = () => {
    if (!h || !canSign(h)) return
    if (typeof window !== 'undefined' && !window.confirm(ht('confirmSign'))) return
    const signed = signHandover(h)
    persist(signed)
    onSigned(signed)
  }

  const labels = (): HandoverReportLabels => ({
    title: ht('reportTitle'), project: ht('project'), unit: ht('unit'), date: ht('date'), buyer: ht('buyer'), buyerId: ht('buyerId'),
    attendees: ht('attendees'), checklist: ht('checklist'), room: ht('general'), item: ht('item'), result: ht('result'), note: ht('note'),
    general: ht('general'),
    category: Object.fromEntries(HANDOVER_CATEGORIES.map((c) => [c, catLabel(c)])) as Record<HandoverCategory, string>,
    results: { ok: ht('res.ok'), defect: ht('res.defect'), na: ht('res.na') },
    pending: ht('pending'), defects: ht('defects'), meters: ht('meters'), water: ht('water'), electricity: ht('electricity'), gas: ht('gas'),
    keys: ht('keys'), keyCount: ht('keyCount'), keyTypes: ht('keys'), signatures: ht('signatures'), signBuyer: ht('signBuyer'),
    signDeveloper: ht('signDeveloper'), signedAt: ht('signedAt'), draft: ht('draft'), footer: ht('footer'), summary: ht('summary'),
  })

  const exportPdf = async () => {
    if (!h) return
    setBusy(true)
    try {
      const ids = new Set(linkedSnagIds(h))
      let snags = [] as Awaited<ReturnType<typeof loadSnags>>
      try { snags = (await loadSnags(project)).filter((s) => ids.has(s.id)) } catch { /* no snags */ }
      const photos = new Map<string, PdfImage>()
      for (const s of snags) for (const id of s.photoIds) {
        const p = await loadPhoto(project, id).catch(() => undefined)
        if (p) photos.set(id, { jpeg: new Uint8Array(await p.blob.arrayBuffer()), width: p.width, height: p.height })
      }
      const signatures = {
        buyer: h.signatures.buyer ? await pngDataUrlToJpeg(h.signatures.buyer) : null,
        developer: h.signatures.developer ? await pngDataUrlToJpeg(h.signatures.developer) : null,
      }
      const pdf = buildHandoverPdf(h, labels(), {
        project: project && project !== 'default' ? project : undefined, snags, photos, signatures, rasterize: canvasTextRasterizer(),
      })
      const safe = unit.name.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'unit'
      downloadBlob(new Blob([pdf as BlobPart], { type: 'application/pdf' }), `handover-${safe}-${h.date}.pdf`)
    } catch { setMessage(ht('saveFailed')) } finally { setBusy(false) }
  }

  const removeDraft = async () => {
    if (!h || readOnly) return
    try { await deleteHandoverDraft(project, h) } catch { /* nothing stored */ }
    const rest = list.filter((x) => x.id !== h.id)
    setList(rest)
    setH(rest[0] ?? createHandover(unit))
  }

  if (!h || !summary) return <div className="p-3 text-xs opacity-70">…</div>

  return (
    <div className="flex flex-col gap-3 p-3 text-[var(--text)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold">{ht('title')}</div>
          <div className="text-xs opacity-70">{unit.name}</div>
        </div>
        <button type="button" className={btn} onClick={onClose}>{ht('close')}</button>
      </div>

      {list.length > 1 && (
        <label className="flex flex-col gap-1 text-xs">{ht('previous')}
          <select className={input} value={h.id} onChange={(e) => { const x = list.find((l) => l.id === e.target.value); if (x) setH(x) }}>
            {list.map((x) => <option key={x.id} value={x.id}>{x.date} · {x.buyerName || '-'} · {x.status === 'signed' ? ht('signed') : ht('draft')}</option>)}
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-1.5">
        {readOnly && <button type="button" className={btn} onClick={() => setH(createHandover(unit))}>{ht('new')}</button>}
        {!readOnly && list.some((x) => x.id === h.id) && <button type="button" className={btn} onClick={() => void removeDraft()}>{ht('deleteDraft')}</button>}
        <button type="button" className={btn} disabled={busy} onClick={() => void exportPdf()}>{ht('exportPdf')}</button>
      </div>
      {readOnly && <div className="rounded bg-emerald-700/20 px-2 py-1 text-xs">{ht('readOnly')}{h.signedAt ? ` ${ht('signedAt')}: ${h.signedAt.slice(0, 16).replace('T', ' ')} UTC` : ''}</div>}
      {message && <div className="text-xs opacity-80" aria-live="polite">{message}</div>}

      <fieldset disabled={readOnly} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs">{ht('date')}
          <input type="date" className={input} value={h.date} onChange={(e) => patch({ date: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs">{ht('buyer')}
          <input className={input} defaultValue={h.buyerName} key={`b-${h.id}`} onBlur={(e) => patch({ buyerName: e.target.value.trim() })} />
        </label>
        <label className="flex flex-col gap-1 text-xs">{ht('buyerId')}
          <input className={input} defaultValue={h.buyerIdOptional ?? ''} key={`i-${h.id}`} onBlur={(e) => patch({ buyerIdOptional: e.target.value.trim() || undefined })} />
        </label>
        <label className="flex flex-col gap-1 text-xs">{ht('attendees')}
          <textarea className={input} rows={2} placeholder={ht('attendeesHint')} defaultValue={h.attendees.join('\n')} key={`a-${h.id}`}
            onBlur={(e) => patch({ attendees: parseAttendees(e.target.value) })} />
        </label>
      </fieldset>

      <div className="text-xs font-semibold">{ht('checklist')} · {summary.total - summary.pending}/{summary.total}</div>
      {groupByRoom(h.checklist).map((g) => (
        <div key={g.room || '_'} className="flex flex-col gap-1">
          <div className="text-xs font-semibold opacity-80">{g.room || ht('general')}</div>
          {g.items.map((it) => (
            <div key={it.id} className="flex flex-col gap-1 rounded border border-white/10 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">{catLabel(it.category)}</span>
                <div className="flex gap-1" role="group" aria-label={catLabel(it.category)}>
                  {HANDOVER_RESULTS.map((r) => (
                    <button key={r} type="button" disabled={readOnly} aria-pressed={it.result === r}
                      className={`min-h-9 rounded px-2 text-xs ${it.result === r ? RESULT_STYLE[r] : 'border border-white/15'}`}
                      onClick={() => void mark(it.id, r)}>{ht(`res.${r}`)}</button>
                  ))}
                </div>
              </div>
              {(it.result === 'defect' || it.note) && (
                <input className={input} placeholder={ht('note')} defaultValue={it.note ?? ''} key={`n-${h.id}-${it.id}`} disabled={readOnly}
                  onBlur={(e) => { if (!readOnly && (e.target.value.trim() || undefined) !== it.note) persist(setItemNote(h, it.id, e.target.value)) }} />
              )}
            </div>
          ))}
        </div>
      ))}

      <fieldset disabled={readOnly} className="flex flex-col gap-2">
        <div className="text-xs font-semibold">{ht('meters')}</div>
        <div className="grid grid-cols-3 gap-2">
          {(['water', 'electricity', 'gas'] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1 text-xs">{ht(k)}
              <input className={input} inputMode="decimal" defaultValue={h.meterReadings[k] ?? ''} key={`m-${h.id}-${k}`}
                onBlur={(e) => patch({ meterReadings: { ...h.meterReadings, [k]: e.target.value.trim() || undefined } })} />
            </label>
          ))}
        </div>
        <div className="text-xs font-semibold">{ht('keys')}</div>
        <div className="grid grid-cols-[6rem_1fr] gap-2">
          <label className="flex flex-col gap-1 text-xs">{ht('keyCount')}
            <input type="number" min={0} className={input} value={h.keysDelivered.count || ''}
              onChange={(e) => patch({ keysDelivered: { ...h.keysDelivered, count: Math.max(0, Math.floor(Number(e.target.value) || 0)) } })} />
          </label>
          <label className="flex flex-col gap-1 text-xs">{ht('keyTypes')}
            <input className={input} defaultValue={h.keysDelivered.types} key={`k-${h.id}`}
              onBlur={(e) => patch({ keysDelivered: { ...h.keysDelivered, types: e.target.value.trim() } })} />
          </label>
        </div>
      </fieldset>

      <div className="text-xs font-semibold">{ht('signatures')}</div>
      <SignaturePad key={`sb-${h.id}`} label={ht('signBuyer')} clearLabel={ht('clear')} placeholder={ht('signHere')} disabled={readOnly}
        value={h.signatures.buyer} onChange={(d) => patch({ signatures: { ...h.signatures, buyer: d ?? undefined } })} />
      <SignaturePad key={`sd-${h.id}`} label={ht('signDeveloper')} clearLabel={ht('clear')} placeholder={ht('signHere')} disabled={readOnly}
        value={h.signatures.developer} onChange={(d) => patch({ signatures: { ...h.signatures, developer: d ?? undefined } })} />

      {!readOnly && (
        <div className="flex flex-col gap-1">
          {issues.length > 0 && <ul className="list-disc pl-4 text-xs opacity-80">{issues.map((i) => <li key={i}>{ht(`issue.${i}`)}</li>)}</ul>}
          <button type="button" className={btnPrimary} disabled={!canSign(h)} onClick={sign}>{ht('sign')}</button>
        </div>
      )}
    </div>
  )
}
