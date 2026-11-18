// ─── Inspection checklists ────────────────────────────────────────────────────
// Pick a template (built-in or own), walk the items ok / fail / n.a. with notes
// and photos, sign, export a PDF. A failed item opens a snag. Templates can be
// duplicated, written from scratch and moved around as JSON. All in IndexedDB.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../../i18n'
import type { ViewerAPI } from '../../lib/viewer'
import { useSceneStore } from '../../stores/sceneStore'
import { downloadBlob } from '../compare/ui'
import SignaturePad from './SignaturePad'
import {
  INSPECTION_RESULTS, addItemPhoto, builtInTemplates, canSignInspection, createInspection, createTemplate,
  groupBySection, inspectionPhotoIds, inspectionSummary, parseTemplatesJson, removeItemPhoto, setInspectionItemNote,
  setInspectionItemResult, signInspection, templateToText, templatesToJson, updateInspection, updateTemplate, validateInspection,
  type Inspection, type InspectionPatch, type InspectionResult, type InspectionTarget, type InspectionTemplate,
} from '../../lib/site/inspections'
import { deleteInspectionDraft, deleteTemplate, loadInspections, loadTemplates, saveInspection, saveTemplate } from '../../lib/site/inspection-store'
import { buildInspectionPdf, type InspectionReportLabels } from '../../lib/site/site-records-pdf'
import { deletePhoto, loadPhoto, newPhotoId, savePhoto, saveSnag } from '../../lib/site/snag-store'
import { compressPhoto } from '../../lib/site/photo'
import { canvasTextRasterizer, pngDataUrlToJpeg } from '../../lib/site/pdf-text-raster'
import { collectUnits, type Unit, type UnitsFragmentsLike } from '../../lib/site/units'
import type { PdfImage } from '../../lib/site/pdf-doc'

interface Props {
  projectKey: string
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  /** Current 3D selection; only its GlobalId is ever stored. */
  selectedGlobalId: string | null
}

const btn = 'h-7 max-md:h-9 px-2.5 rounded-[6px] border border-[var(--border)] text-[11px] max-md:text-[12.5px] font-medium text-[var(--text)] hover:border-[var(--border-strong)] disabled:opacity-40 whitespace-nowrap'
const btnPrimary = 'h-7 max-md:h-9 px-3 rounded-[6px] text-[11px] max-md:text-[12.5px] font-semibold bg-[var(--accent)] text-[var(--accent-contrast,#fff)] disabled:opacity-40 whitespace-nowrap'
const input = 'w-full rounded-[6px] border border-[var(--border)] bg-transparent px-2 py-1 text-[12px] text-[var(--text)] disabled:opacity-70'
const RESULT_STYLE: Record<InspectionResult, string> = { ok: 'bg-emerald-600 text-white', fail: 'bg-red-600 text-white', na: 'bg-slate-500 text-white' }

type View = { kind: 'list' } | { kind: 'edit'; id: string } | { kind: 'templates' } | { kind: 'template'; id: string | null; from?: InspectionTemplate }

function Thumb({ project, id, onRemove }: { project: string; id: string; onRemove?: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    let u: string | null = null
    void loadPhoto(project, id).then((p) => { if (p && alive) { u = URL.createObjectURL(p.blob); setUrl(u) } }).catch(() => {})
    return () => { alive = false; if (u) URL.revokeObjectURL(u) }
  }, [project, id])
  return (
    <span className="relative inline-block">
      {url ? <img src={url} alt="" className="h-14 w-14 rounded object-cover" /> : <span className="inline-block h-14 w-14 rounded bg-[var(--surface-2)]" />}
      {onRemove && <button type="button" aria-label="x" onClick={onRemove} className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-black/70 text-[10px] text-white">x</button>}
    </span>
  )
}

export default function InspectionPanel({ projectKey, viewerApiRef, selectedGlobalId }: Props) {
  const { t } = useTranslation('site')
  const it = useCallback((k: string, o?: Record<string, unknown>) => String(t(`insp.${k}`, o as never)), [t])
  const builtIns = useMemo(() => builtInTemplates((k) => String(t(k as never))), [t])
  const [own, setOwn] = useState<InspectionTemplate[]>([])
  const templates = useMemo(() => [...builtIns, ...own], [builtIns, own])
  const [list, setList] = useState<Inspection[]>([])
  const [view, setView] = useState<View>({ kind: 'list' })
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tplId, setTplId] = useState(builtIns[0]?.id ?? '')
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    loadInspections(projectKey).then((r) => { if (alive) setList(r) }, () => { if (alive) setMessage(it('saveFailed')) })
    loadTemplates().then((r) => { if (alive) setOwn(r) }, () => {})
    return () => { alive = false }
  }, [projectKey, it])

  const persist = useCallback((next: Inspection) => {
    setList((l) => [next, ...l.filter((x) => x.id !== next.id)].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)))
    saveInspection(projectKey, next).catch(() => setMessage(it('saveFailed')))
  }, [projectKey, it])

  const start = () => {
    const tpl = templates.find((x) => x.id === tplId)
    if (!tpl) return
    const target: InspectionTarget = selectedGlobalId ? { globalId: selectedGlobalId } : {}
    const ins = createInspection(tpl, target)
    persist(ins)
    setView({ kind: 'edit', id: ins.id })
  }

  // ── Templates ──
  const saveOwn = (tpl: InspectionTemplate) => {
    setOwn((l) => [...l.filter((x) => x.id !== tpl.id), tpl].sort((a, b) => a.name.localeCompare(b.name)))
    saveTemplate(tpl).catch(() => setMessage(it('saveFailed')))
  }
  const exportTemplates = (tpls: InspectionTemplate[]) => {
    downloadBlob(new Blob([templatesToJson(tpls)], { type: 'application/json' }), 'inspection-templates.json')
  }
  const importTemplates = async (file: File | undefined) => {
    if (!file) return
    try {
      const got = parseTemplatesJson(await file.text(), templates.map((x) => x.id))
      for (const tpl of got) saveOwn(tpl)
      setMessage(it('imported', { count: got.length }))
    } catch { setMessage(it('importFailed')) }
  }

  const current = view.kind === 'edit' ? list.find((x) => x.id === view.id) ?? null : null

  return (
    <div className="flex flex-col gap-3 p-3 text-[var(--text)]" data-testid="inspection-panel">
      <input ref={importRef} type="file" accept="application/json,.json" className="hidden"
        onChange={(e) => { void importTemplates(e.target.files?.[0]); e.target.value = '' }} />
      {message && <div className="text-[11.5px] opacity-80" aria-live="polite">{message}</div>}

      {view.kind === 'list' && (
        <>
          <div className="text-[13px] font-semibold">{it('title')}</div>
          <label className="flex flex-col gap-1 text-[11.5px]">{it('template')}
            <select className={input} value={tplId} onChange={(e) => setTplId(e.target.value)}>
              {templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={btnPrimary} onClick={start} disabled={!tplId}>{it('new')}</button>
            <button type="button" className={btn} onClick={() => setView({ kind: 'templates' })}>{it('manageTemplates')}</button>
          </div>
          {selectedGlobalId && <div className="text-[11px] opacity-70">{it('willLinkSelection')}</div>}
          {list.length === 0 && <div className="text-[11.5px] text-[var(--text-dim)]">{it('empty')}</div>}
          <ul className="flex flex-col gap-1">
            {list.map((x) => {
              const s = inspectionSummary(x)
              return (
                <li key={x.id}>
                  <button type="button" className="w-full rounded-[6px] border border-[var(--border)] p-2 text-left hover:border-[var(--border-strong)]"
                    onClick={() => setView({ kind: 'edit', id: x.id })}>
                    <div className="text-[12px] font-medium">{x.templateName}</div>
                    <div className="text-[11px] text-[var(--text-dim)]">
                      {x.date} · {x.target.unitName || x.target.label || x.target.globalId || '-'} · {x.status === 'signed' ? it('signed') : it('draft')}
                      {s.fail ? ` · ${it('res.fail')}: ${s.fail}` : ''}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {view.kind === 'edit' && current && (
        <InspectionEditor key={current.id} ins={current} project={projectKey} it={it} viewerApiRef={viewerApiRef} selectedGlobalId={selectedGlobalId}
          busy={busy} setBusy={setBusy} setMessage={setMessage} persist={persist}
          onBack={() => setView({ kind: 'list' })}
          onDelete={async () => {
            try { await deleteInspectionDraft(projectKey, current) } catch { /* nothing stored */ }
            for (const p of inspectionPhotoIds(current)) await deletePhoto(projectKey, p).catch(() => {})
            setList((l) => l.filter((x) => x.id !== current.id))
            setView({ kind: 'list' })
          }} />
      )}

      {view.kind === 'templates' && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[13px] font-semibold">{it('templates')}</div>
            <button type="button" className={btn} onClick={() => setView({ kind: 'list' })}>{it('back')}</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={btnPrimary} onClick={() => setView({ kind: 'template', id: null })}>{it('newTemplate')}</button>
            <button type="button" className={btn} onClick={() => importRef.current?.click()}>{it('importJson')}</button>
            <button type="button" className={btn} onClick={() => exportTemplates(own)} disabled={!own.length}>{it('exportJson')}</button>
          </div>
          <ul className="flex flex-col gap-1">
            {templates.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 rounded-[6px] border border-[var(--border)] p-2">
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium">{x.name}</div>
                  <div className="text-[11px] text-[var(--text-dim)]">{it('items', { count: x.items.length })}{x.builtIn ? ` · ${it('builtIn')}` : ''}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" className={btn} onClick={() => setView({ kind: 'template', id: null, from: x })}>{it('duplicate')}</button>
                  {!x.builtIn && <button type="button" className={btn} onClick={() => setView({ kind: 'template', id: x.id })}>{it('edit')}</button>}
                  {!x.builtIn && (
                    <button type="button" className={btn} onClick={() => {
                      if (typeof window !== 'undefined' && !window.confirm(it('confirmDeleteTemplate'))) return
                      setOwn((l) => l.filter((y) => y.id !== x.id)); void deleteTemplate(x.id).catch(() => {})
                    }}>{it('delete')}</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {view.kind === 'template' && (
        <TemplateEditor it={it} initial={view.id ? own.find((x) => x.id === view.id) ?? null : null} from={view.from}
          onCancel={() => setView({ kind: 'templates' })}
          onSave={(tpl) => { saveOwn(tpl); setView({ kind: 'templates' }) }} />
      )}
    </div>
  )
}

type Tr = (k: string, o?: Record<string, unknown>) => string

function TemplateEditor({ it, initial, from, onSave, onCancel }: {
  it: Tr; initial: InspectionTemplate | null; from?: InspectionTemplate; onSave: (t: InspectionTemplate) => void; onCancel: () => void
}) {
  const base = initial ?? from
  const [name, setName] = useState(initial ? initial.name : from ? it('copyOf', { name: from.name }) : '')
  const [trade, setTrade] = useState(base?.trade ?? '')
  const [text, setText] = useState(base ? templateToText(base.items) : '')
  const [error, setError] = useState<string | null>(null)
  const save = () => {
    try {
      // A duplicate is a new template starting from the source's (possibly edited) text.
      const tpl = initial ? updateTemplate(initial, { name, text, trade }) : createTemplate(name, text, trade)
      onSave(tpl)
    } catch { setError(it('templateInvalid')) }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[13px] font-semibold">{initial ? it('editTemplate') : it('newTemplate')}</div>
      <label className="flex flex-col gap-1 text-[11.5px]">{it('templateName')}
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-[11.5px]">{it('tradeField')}
        <input className={input} value={trade} onChange={(e) => setTrade(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-[11.5px]">{it('itemsField')}
        <textarea className={`${input} font-mono`} rows={12} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="text-[11px] text-[var(--text-dim)]">{it('itemsHint')}</div>
      {error && <div className="text-[11.5px] text-red-400">{error}</div>}
      <div className="flex gap-1.5">
        <button type="button" className={btnPrimary} onClick={save}>{it('save')}</button>
        <button type="button" className={btn} onClick={onCancel}>{it('cancel')}</button>
      </div>
    </div>
  )
}

function InspectionEditor({ ins, project, it, viewerApiRef, selectedGlobalId, busy, setBusy, setMessage, persist, onBack, onDelete }: {
  ins: Inspection; project: string; it: Tr; viewerApiRef: React.MutableRefObject<ViewerAPI | null>; selectedGlobalId: string | null
  busy: boolean; setBusy: (b: boolean) => void; setMessage: (m: string | null) => void; persist: (i: Inspection) => void
  onBack: () => void; onDelete: () => void
}) {
  const models = useSceneStore((s) => s.models)
  const [units, setUnits] = useState<Unit[] | null>(null)
  const readOnly = ins.status === 'signed'
  const patch = (p: InspectionPatch) => { if (!readOnly) persist(updateInspection(ins, p)) }
  const summary = inspectionSummary(ins)
  const issues = validateInspection(ins)

  const loadUnits = async () => {
    const v = viewerApiRef.current
    if (!v) return
    setBusy(true)
    try {
      const listed = models.flatMap((m) => { const f = v.getFragmentsModel(m.id) as UnitsFragmentsLike | null; return f ? [{ id: m.id, fragments: f }] : [] })
      setUnits(await collectUnits(listed))
    } catch { setUnits([]) } finally { setBusy(false) }
  }

  const mark = async (itemId: string, result: InspectionResult) => {
    if (readOnly) return
    const r = setInspectionItemResult(ins, itemId, result)
    persist(r.inspection)
    if (r.snag) { try { await saveSnag(project, r.snag); setMessage(it('snagCreated')) } catch { setMessage(it('saveFailed')) } }
  }

  const addPhotos = async (itemId: string, files: FileList | null) => {
    if (!files?.length || readOnly) return
    setBusy(true)
    let next = ins
    try {
      for (const f of Array.from(files)) {
        const c = await compressPhoto(f)
        const id = newPhotoId()
        await savePhoto({ project, id, blob: c.blob, width: c.width, height: c.height, createdAt: new Date().toISOString() })
        next = addItemPhoto(next, itemId, id)
      }
    } catch { setMessage(it('photoFailed')) } finally { setBusy(false) }
    if (next !== ins) persist(next)
  }

  const sign = () => {
    if (!canSignInspection(ins)) return
    if (typeof window !== 'undefined' && !window.confirm(it('confirmSign'))) return
    persist(signInspection(ins))
  }

  const labels = (): InspectionReportLabels => ({
    title: it('reportTitle'), project: it('project'), template: it('template'), date: it('date'), inspector: it('inspector'),
    unit: it('unit'), element: it('element'), place: it('place'),
    results: { ok: it('res.ok'), fail: it('res.fail'), na: it('res.na') }, pending: it('pending'), note: it('note'), snag: it('snag'),
    summary: it('summary'), signature: it('signature'), signedAt: it('signedAt'), draft: it('draftWatermark'), footer: it('footer'),
  })

  const exportPdf = async () => {
    setBusy(true)
    try {
      const photos = new Map<string, PdfImage>()
      for (const id of inspectionPhotoIds(ins)) {
        const p = await loadPhoto(project, id).catch(() => undefined)
        if (p) photos.set(id, { jpeg: new Uint8Array(await p.blob.arrayBuffer()), width: p.width, height: p.height })
      }
      const signature = ins.signature ? await pngDataUrlToJpeg(ins.signature) : null
      const pdf = buildInspectionPdf(ins, labels(), { project: project && project !== 'default' ? project : undefined, photos, signature, rasterize: canvasTextRasterizer() })
      const safe = ins.templateName.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'inspection'
      downloadBlob(new Blob([pdf as BlobPart], { type: 'application/pdf' }), `inspection-${safe}-${ins.date}.pdf`)
    } catch { setMessage(it('saveFailed')) } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">{ins.templateName}</div>
          <div className="text-[11px] text-[var(--text-dim)]">{summary.total - summary.pending}/{summary.total} · {it('res.fail')}: {summary.fail}</div>
        </div>
        <button type="button" className={btn} onClick={onBack}>{it('back')}</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={btn} disabled={busy} onClick={() => void exportPdf()}>{it('exportPdf')}</button>
        {!readOnly && <button type="button" className={btn} onClick={() => { if (typeof window === 'undefined' || window.confirm(it('confirmDelete'))) onDelete() }}>{it('deleteDraft')}</button>}
      </div>
      {readOnly && <div className="rounded bg-emerald-700/20 px-2 py-1 text-[11.5px]">{it('readOnly')}{ins.signedAt ? ` ${it('signedAt')}: ${ins.signedAt.slice(0, 16).replace('T', ' ')} UTC` : ''}</div>}

      <fieldset disabled={readOnly} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-[11.5px]">{it('date')}
          <input type="date" className={input} value={ins.date} onChange={(e) => patch({ date: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px]">{it('inspector')}
          <input className={input} defaultValue={ins.inspector} onBlur={(e) => { if (e.target.value.trim() !== ins.inspector) patch({ inspector: e.target.value.trim() }) }} />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px]">{it('place')}
          <input className={input} defaultValue={ins.target.label ?? ''} placeholder={it('placeHint')}
            onBlur={(e) => { if ((e.target.value.trim() || undefined) !== ins.target.label) patch({ target: { ...ins.target, label: e.target.value } }) }} />
        </label>
        <div className="flex flex-col gap-1 text-[11.5px]">{it('unit')}
          {units ? (
            <select className={input} value={ins.target.unitId ?? ''} onChange={(e) => {
              const u = units.find((x) => x.id === e.target.value)
              patch({ target: { ...ins.target, unitId: u?.id, unitName: u?.name } })
            }}>
              <option value="">-</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.storey ? `${u.storey} · ` : ''}{u.name}</option>)}
            </select>
          ) : (
            <div className="flex items-center gap-2">
              <span className="truncate">{ins.target.unitName ?? '-'}</span>
              {!readOnly && <button type="button" className={btn} disabled={busy || !models.length} onClick={() => void loadUnits()}>{it('pickUnit')}</button>}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 text-[11.5px]">{it('element')}
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-[11px]">{ins.target.globalId ?? '-'}</span>
            {!readOnly && selectedGlobalId && selectedGlobalId !== ins.target.globalId && (
              <button type="button" className={btn} onClick={() => patch({ target: { ...ins.target, globalId: selectedGlobalId } })}>{it('linkSelection')}</button>
            )}
            {!readOnly && ins.target.globalId && (
              <button type="button" className={btn} onClick={() => patch({ target: { ...ins.target, globalId: undefined } })}>{it('unlink')}</button>
            )}
          </div>
        </div>
      </fieldset>

      {groupBySection(ins.items).map((g, gi) => (
        <div key={`${g.section}-${gi}`} className="flex flex-col gap-1">
          {g.section && <div className="text-[12px] font-semibold opacity-80">{g.section}</div>}
          {g.items.map((item) => (
            <div key={item.id} className="flex flex-col gap-1 rounded-[6px] border border-[var(--border)] p-2">
              <div className="text-[12px]">{item.text}</div>
              <div className="flex flex-wrap items-center gap-1" role="group" aria-label={item.text}>
                {INSPECTION_RESULTS.map((r) => (
                  <button key={r} type="button" disabled={readOnly} aria-pressed={item.result === r}
                    className={`min-h-9 rounded px-2.5 text-[11.5px] ${item.result === r ? RESULT_STYLE[r] : 'border border-[var(--border)]'}`}
                    onClick={() => void mark(item.id, r)}>{it(`res.${r}`)}</button>
                ))}
                {!readOnly && (
                  <label className={`${btn} inline-flex items-center cursor-pointer`}>{it('addPhoto')}
                    <input type="file" accept="image/*" capture="environment" multiple className="hidden"
                      onChange={(e) => { void addPhotos(item.id, e.target.files); e.target.value = '' }} />
                  </label>
                )}
              </div>
              {(item.result === 'fail' || item.note || !readOnly) && (
                <input className={input} placeholder={it('note')} defaultValue={item.note ?? ''} disabled={readOnly}
                  onBlur={(e) => { if (!readOnly && (e.target.value.trim() || undefined) !== item.note) persist(setInspectionItemNote(ins, item.id, e.target.value)) }} />
              )}
              {item.snagId && <div className="text-[11px] text-[var(--text-dim)]">{it('snagLinked')}</div>}
              {item.photoIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {item.photoIds.map((p) => <Thumb key={p} project={project} id={p}
                    onRemove={readOnly ? undefined : () => persist(removeItemPhoto(ins, item.id, p))} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      <SignaturePad label={it('signature')} clearLabel={it('clear')} placeholder={it('signHere')} disabled={readOnly}
        value={ins.signature} onChange={(d) => patch({ signature: d ?? undefined })} />
      {!readOnly && (
        <div className="flex flex-col gap-1">
          {issues.length > 0 && <ul className="list-disc pl-4 text-[11.5px] opacity-80">{issues.map((i) => <li key={i}>{it(`issue.${i}`)}</li>)}</ul>}
          <button type="button" className={btnPrimary} disabled={!canSignInspection(ins)} onClick={sign}>{it('sign')}</button>
        </div>
      )}
    </div>
  )
}
