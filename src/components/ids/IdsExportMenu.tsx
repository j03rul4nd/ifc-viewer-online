// ─── IdsExportMenu ────────────────────────────────────────────────────────────
// Popover export menu for the IdsPanel header (P6-1). JSON + CSV ship now;
// HTML + BCF are listed but disabled until P6-2.

import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toIdsJson, toIdsCsv, toIdsHtml, idsResultToBcfTopics } from '../../lib/ids/ids-report'
import { exportBcfZip } from '../../lib/bcf'
import { downloadBlob } from '../../lib/diffStore'
import { trackIdsExport } from '../../lib/analytics'
import { toast } from '../../stores/toastStore'
import type { IdsResult } from '../../lib/ids/ids-types'

type Format = 'json' | 'csv' | 'html' | 'bcf'

export function IdsExportMenu({ result, idsFile, modelFile, takeSnapshot }: {
  result: IdsResult
  idsFile: string | null
  modelFile: string | null
  /** Returns a data:image/png URL of the current 3D view, or '' (used by BCF). */
  takeSnapshot?: () => string
}) {
  const { t } = useTranslation('ids')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const stem = (idsFile ?? 'ids').replace(/\.[^.]+$/, '')

  const doExport = (format: Format): void => {
    try {
      let blob: Blob
      let ext: string = format
      if (format === 'json') blob = new Blob([toIdsJson(result, { idsFile, modelFile })], { type: 'application/json' })
      else if (format === 'csv') blob = new Blob([toIdsCsv(result)], { type: 'text/csv' })
      else if (format === 'html') blob = new Blob([toIdsHtml(result, { idsFile, modelFile })], { type: 'text/html' })
      else {
        const topics = idsResultToBcfTopics(result, takeSnapshot?.() || undefined)
        blob = new Blob([exportBcfZip(topics, '2.1')], { type: 'application/octet-stream' })
        ext = 'bcfzip'
      }
      void downloadBlob(blob, `${stem}-ids.${ext}`)
      trackIdsExport({ format })
      toast(t('export.done'), 'success')
    } catch {
      toast(t('errors.checkFailed'), 'error')
    }
    setOpen(false)
  }

  // BCF without any failure has no topics → nothing useful to export.
  const hasFailures = result.specs.some((s) => s.status === 'fail' && s.failures.length > 0)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-6 px-2 rounded-md border border-[var(--border)] text-[10.5px] text-[var(--text-dim)] hover:text-[var(--text)]"
      >
        {t('export.label')}
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-50 w-[230px] rounded-lg bg-[rgba(12,12,16,0.98)] backdrop-blur-[20px] border border-[var(--border-strong)] shadow-[0_16px_40px_rgba(0,0,0,0.6)] overflow-hidden py-1">
          <ExportItem label={t('export.json')} desc={t('export.jsonDesc')} onClick={() => doExport('json')} />
          <ExportItem label={t('export.csv')} desc={t('export.csvDesc')} onClick={() => doExport('csv')} />
          <ExportItem label={t('export.html')} desc={t('export.htmlDesc')} onClick={() => doExport('html')} />
          <ExportItem label={t('export.bcf')} desc={hasFailures ? t('export.bcfDesc') : t('export.bcfEmpty')} onClick={() => doExport('bcf')} disabled={!hasFailures} />
        </div>
      )}
    </div>
  )
}

function ExportItem({ label, desc, onClick, disabled }: {
  label: string
  desc: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
    >
      <span className="text-[11.5px] font-medium text-[var(--text)]">{label}</span>
      <span className="text-[9.5px] text-[var(--text-faint)] truncate">{desc}</span>
    </button>
  )
}
