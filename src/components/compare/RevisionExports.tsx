// PDF / XLSX / BCF of a revision comparison (T4 builders, wired here). Exports
// what the list shows (filters applied) with the review states set by the user.
// PDF and XLSX carry the Pro flag of REVISION_REPORT_PLAN as a label only: no
// gate yet. Captures first, download after (a background tab stops drawing).
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../../lib/viewer'
import type { RevisionChange, RevisionDiff } from '../../lib/compare/revision-types'
import type { ReviewState } from '../../lib/compare/revision-view'
import { downloadBlob, stamp } from './ui'
import { useRevisionStore } from './revisionStore'
import { useRevisionText } from './useRevisionText'
import { trackRcExport } from '../../lib/analytics'

type Kind = 'pdf' | 'xlsx' | 'bcf'

export default function RevisionExports({ viewerApiRef, rows, reviews, onDone }: {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  rows: RevisionChange[]
  reviews: ReadonlyMap<string, ReviewState>
  /** Called after captures moved the camera / isolation, so the workspace repaints. */
  onDone: () => void
}) {
  const { t, phrase, className } = useRevisionText()
  const { t: tc, i18n } = useTranslation('compare')
  const [busy, setBusy] = useState<Kind | null>(null)
  const [progress, setProgress] = useState('')

  const run = async (kind: Kind): Promise<void> => {
    const s = useRevisionStore.getState()
    if (!s.diff || busy) return
    setBusy(kind)
    trackRcExport({ format: kind })
    try {
      const [rr, cc, bcf] = await Promise.all([
        import('../../lib/compare/report-revision'),
        import('../../lib/compare/capture-change'),
        import('../../lib/compare/bcf-sync'),
      ])
      const changes = rows.map((c) => ({ ...c, review: reviews.get(c.globalId) ?? 'pending' }))
      const diff: RevisionDiff = { ...s.diff, changes }
      const base = rr.revisionReportText(tc as never, i18n.language)
      // One wording everywhere: the report says what the screen says
      // ("Nuevo: Viga", "Movido 120 mm al oeste"), never "IFCBEAM" or "W".
      const text = { ...base, sentence: phrase }
      const shown: RevisionDiff = {
        ...diff,
        changes: diff.changes.map((c) => ({
          ...c,
          ifcClass: className(c.ifcClass),
          delta: c.delta?.direction ? { ...c.delta, direction: (t as unknown as (key: string) => string)(`rc.dir.${c.delta.direction}`) } : c.delta,
        })),
      }
      const name = `${stamp()}_revision`
      if (kind === 'xlsx') {
        downloadBlob(new Blob([await rr.revisionToXlsx(shown, text)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${name}.xlsx`)
        return
      }
      const v = viewerApiRef.current
      let caps: Record<string, import('../../lib/compare/capture-change').ChangeCapture> = {}
      if (v) {
        const resolve = cc.resolverFromDiff(diff, (file, side) => (side === 'base' ? s.a.modelIds[file] : s.b.modelIds[file]) ?? null)
        caps = await cc.createChangeCapturer(v as never, resolve).captureAll(
          rr.orderedChanges(diff).map((c) => c.globalId),
          (done, total) => setProgress(t('rc.export.working', { done, total })),
        )
        onDone()
      }
      if (kind === 'pdf') {
        downloadBlob(new Blob([await rr.revisionToPdf(shown, cc.captureImages(caps), text)], { type: 'application/pdf' }), `${name}.pdf`)
      } else {
        const { bytes } = bcf.revisionChangesToBcfZip(diff, { author: 'IFC Viewer Online', sentence: phrase }, caps)
        downloadBlob(new Blob([bytes], { type: 'application/zip' }), `${name}.bcfzip`)
      }
    } catch (err) {
      const { toast } = await import('../../stores/toastStore')
      toast(t('rc.export.failed', { message: err instanceof Error ? err.message : String(err) }), 'error')
    } finally {
      setBusy(null); setProgress('')
    }
  }

  return (
    <div className="flex items-center gap-1" data-testid="rc-export-slot" data-tour="rc-exports">
      {(['pdf', 'xlsx', 'bcf'] as const).map((k) => (
        <button
          key={k} type="button" onClick={() => void run(k)} disabled={!!busy || !rows.length} data-testid={`rc-export-${k}`}
          title={busy === k ? progress : t(`rc.export.${k}Hint`)}
          className="h-8 px-2.5 rounded-md border border-[var(--border)] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] disabled:opacity-50 inline-flex items-center gap-1"
        >
          {busy === k ? '…' : t(`rc.export.${k}`)}
          {k !== 'bcf' && <span className="px-1 rounded text-[9px] font-semibold border border-[var(--accent)] text-[var(--accent)]">{t('rc.export.pro')}</span>}
        </button>
      ))}
      {busy && <span className="text-[10.5px] text-[var(--text-faint)] tabular-nums whitespace-nowrap">{progress}</span>}
    </div>
  )
}
