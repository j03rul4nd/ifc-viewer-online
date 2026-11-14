// ─── Compare two PDF revisions ────────────────────────────────────────────────
// Three clicks: old set, new set, read the clouds. The comparison starts by
// itself once both files are in; each sheet with changes opens as an overlay
// (grey same, red only in the old one, green only in the new one, clouds), and
// the new set downloads with its clouds drawn. Nothing leaves this browser.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { readPdfSheets } from '../../lib/drawing/import-file'
import { compareSheetSets, type RevisionSheet, type SetComparison } from '../../lib/drawing/revision-2d'
import { revisionCloudsPdf } from '../../lib/drawing/revision-pdf'
import { downloadFile } from '../../lib/share-file'
import { trackFeatureUsed } from '../../lib/analytics'
import { IDENTITY } from '../../lib/drawing/types'
import { useDrawingStore } from '../../stores/drawingStore'
import { btn } from './DrawingPanels'

interface Picked { name: string; sheets: RevisionSheet[] }

export function RevisionComparePdf({ busy, run, fail, say }: { busy: boolean; run(work: () => Promise<void>): Promise<void>; fail(msg: string): void; say(msg: string): void }) {
  const { t } = useTranslation('drawings')
  const addDrawing = useDrawingStore((st) => st.addDrawing)
  const [old, setOld] = useState<Picked | null>(null)
  const [neu, setNeu] = useState<Picked | null>(null)
  const [result, setResult] = useState<SetComparison | null>(null)

  const pick = (set: (p: Picked) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    void run(async () => {
      try {
        const sheets = await readPdfSheets(new Uint8Array(await file.arrayBuffer()))
        setResult(null)
        set({ name: file.name.replace(/\.[^.]+$/, ''), sheets })
      } catch {
        fail(t('create.compare.pdfError'))
      }
    })
  }

  // Click 3 is reading the result: it starts as soon as both sets are in.
  useEffect(() => {
    if (!old || !neu) return
    void run(async () => {
      const started = performance.now()
      const r = compareSheetSets(old.sheets, neu.sheets)
      setResult(r)
      for (const s of r.sheets) {
        if (s.status !== 'compared' || !s.clouds.length) continue
        addDrawing({ name: t('create.compare.overlayName', { sheet: s.label }), source: 'diff', layers: s.layers, entities: s.entities, metresPerUnit: null, placement: IDENTITY })
      }
      const clouds = r.sheets.reduce((n, s) => n + s.clouds.length, 0)
      say(t('create.compare.pdfDone', { clouds, sheets: r.sheets.length, seconds: ((performance.now() - started) / 1000).toFixed(1) }))
      trackFeatureUsed({ feature: 'drawing_compare' })
    })
    // Only the two files start it; the rest are stable callbacks.
  }, [old, neu])

  const exportPdf = () => {
    if (!result || !neu) return
    const bytes = revisionCloudsPdf(result.sheets.filter((s) => s.status === 'compared'), t('create.compare.cloudLayer'))
    downloadFile(new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' }), `${neu.name}-clouded.pdf`)
  }

  const file = (k: 'old' | 'new', value: Picked | null, set: (p: Picked) => void) => (
    <label className={`${btn} w-full flex items-center justify-between gap-2 cursor-pointer mt-1`}>
      <span className="truncate">{value ? `${value.name} · ${t('create.compare.pages', { count: value.sheets.length })}` : t(`create.compare.${k}Pdf`)}</span>
      <input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={busy} onChange={pick(set)} />
    </label>
  )

  return (
    <div className="mt-2 pt-2 border-t border-[var(--border)]">
      <p className="text-[var(--text-dim)] mb-0.5">{t('create.compare.pdfTitle')}</p>
      <p className="text-[10px] text-[var(--text-faint)] leading-snug">{t('create.compare.pdfBlurb')}</p>
      {file('old', old, setOld)}
      {file('new', neu, setNeu)}
      {result && (
        <ul className="mt-1.5 flex flex-col gap-1" aria-label={t('create.compare.results')}>
          {result.sheets.map((s, i) => (
            <li key={i} className="rounded-md border border-[var(--border)] px-2 py-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono truncate">{s.label}</span>
                <span className="text-[10px] text-[var(--text-faint)] whitespace-nowrap">
                  {s.status === 'compared' ? t('create.compare.clouds', { count: s.clouds.length }) : t(`create.compare.status.${s.status}`)}
                </span>
              </div>
              {s.status === 'compared' && s.alignment && (
                <div className="text-[10px] text-[var(--text-faint)]">
                  {t('create.compare.aligned', { method: t(`create.compare.method.${s.alignment.method}`), scale: s.alignment.placement.scale.toFixed(3), rms: s.alignment.rmsMm.toFixed(2) })}
                </div>
              )}
              {s.clouds.length > 0 && (
                <ol className="text-[10px] text-[var(--text-dim)] mt-0.5">
                  {s.clouds.map((c) => (
                    <li key={c.id}>{t('create.compare.cloudLine', { id: c.id, added: c.added, removed: c.removed })}{c.texts.length ? ` · ${c.texts.slice(0, 2).join(' → ')}` : ''}</li>
                  ))}
                </ol>
              )}
            </li>
          ))}
          {result.autoExcluded.length > 0 && <li className="text-[10px] text-[var(--text-faint)]">{t('create.compare.autoExcluded', { count: result.autoExcluded.length })}</li>}
          <button type="button" className={`${btn} w-full`} disabled={busy || !result.sheets.some((s) => s.status === 'compared')} onClick={exportPdf}>{t('create.compare.exportPdf')}</button>
        </ul>
      )}
    </div>
  )
}
