// Saved baselines = the project's timeline. Compare any two, share them as files.
import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  deleteBaseline, exportBaselineFile, importBaselineFile, type BaselineSummary,
} from '../../lib/compare/baseline-store'
import { toast } from '../../stores/toastStore'
import { Button, Hint, Section, downloadBlob } from './ui'

export default function HistoryTab({ baselines, refresh, onCompare }: {
  baselines: BaselineSummary[]
  refresh: () => Promise<void>
  onCompare: (baseId: string, headId: string) => void
}) {
  const { t } = useTranslation('compare')
  const fileRef = useRef<HTMLInputElement>(null)
  const [sel, setSel] = useState<string[]>([])
  // Oldest → newest for the timeline reading order.
  const ordered = [...baselines].sort((a, b) => a.createdAt - b.createdAt)
  const maxEl = Math.max(1, ...ordered.map((b) => b.elements))

  const toggle = (id: string): void => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-2)))

  return (
    <div className="flex flex-col gap-4">
      <Section
        title={t('history.title')}
        right={
          <>
            <input ref={fileRef} type="file" accept=".ifcbaseline" multiple className="hidden" onChange={async (e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ''
              for (const f of files) {
                try { await importBaselineFile(f) } catch (err) { toast(t('history.importError', { name: f.name, message: err instanceof Error ? err.message : String(err) }), 'error') }
              }
              await refresh()
            }} />
            <Button small onClick={() => fileRef.current?.click()}>{t('history.import')}</Button>
          </>
        }
      >
        <Hint>{t('history.hint')}</Hint>
        {ordered.length === 0 ? <Hint>{t('source.baselineEmpty')}</Hint> : (
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="text-[10.5px] text-[var(--text-faint)] text-left">
                <th className="font-normal py-1 w-6" />
                <th className="font-normal py-1">{t('history.label')}</th>
                <th className="font-normal py-1">{t('history.date')}</th>
                <th className="font-normal py-1">{t('history.elements')}</th>
                <th className="font-normal py-1 text-right">IDS</th>
                <th className="font-normal py-1" />
              </tr>
            </thead>
            <tbody>
              {ordered.map((b, i) => {
                const prev = ordered[i - 1]
                const delta = prev ? b.elements - prev.elements : 0
                return (
                  <tr key={b.id} className="border-t border-[var(--border)]">
                    <td className="py-1"><input type="checkbox" className="accent-[var(--accent)]" checked={sel.includes(b.id)} onChange={() => toggle(b.id)} aria-label={b.label} /></td>
                    <td className="py-1 pr-2 text-[var(--text)]" title={b.files.map((f) => f.fileName).join('\n')}>
                      {b.label}
                      <div className="text-[10.5px] text-[var(--text-faint)]">{t('filesCount', { count: b.files.length })} · {b.bytes < 1024 * 1024 ? `${Math.max(1, Math.round(b.bytes / 1024))} KB` : `${(b.bytes / 1024 / 1024).toFixed(1)} MB`}</div>
                    </td>
                    <td className="py-1 pr-2 text-[var(--text-dim)] whitespace-nowrap">{new Date(b.createdAt).toLocaleString()}</td>
                    <td className="py-1 pr-2 min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(4, (b.elements / maxEl) * 90)}px` }} />
                        <span className="tabular-nums text-[var(--text-dim)]">{b.elements}</span>
                        {prev && delta !== 0 && <span className="tabular-nums text-[10.5px]" style={{ color: delta > 0 ? 'var(--ok)' : 'var(--danger)' }}>{delta > 0 ? '+' : ''}{delta}</span>}
                      </div>
                    </td>
                    <td className="py-1 text-right tabular-nums text-[var(--text-dim)]">{b.idsScore != null ? b.idsScore : '—'}</td>
                    <td className="py-1 text-right whitespace-nowrap">
                      <button type="button" className="text-[10.5px] text-[var(--accent)] hover:underline mr-2" onClick={async () => {
                        const { blob, fileName } = await exportBaselineFile(b.id)
                        downloadBlob(blob, fileName)
                      }}>{t('history.export')}</button>
                      <button type="button" className="text-[10.5px] text-[var(--danger)] hover:underline" onClick={async () => {
                        if (!window.confirm(t('history.confirmDelete', { label: b.label }))) return
                        await deleteBaseline(b.id)
                        setSel((s) => s.filter((x) => x !== b.id))
                        await refresh()
                      }}>{t('history.delete')}</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <div>
          <Button small primary disabled={sel.length !== 2} onClick={() => {
            const [a, b] = sel.map((id) => baselines.find((x) => x.id === id)!).sort((x, y) => x.createdAt - y.createdAt)
            onCompare(a.id, b.id)
          }}>{t('history.compareTwo')}</Button>
        </div>
      </Section>
    </div>
  )
}
