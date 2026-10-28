// ─── ProjectDocuments ────────────────────────────────────────────────────────
// The documents that came with the models (PDF, spreadsheets, photos, CAD…),
// listed in the Scene panel. PDFs, images and text open in a new tab; the rest
// download. Everything stays in this tab's memory — see documentStore.

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDocumentStore, documentKind, opensInBrowser } from '../stores/documentStore'

const KIND_GLYPH: Record<ReturnType<typeof documentKind>, string> = {
  pdf: 'PDF', image: 'IMG', sheet: 'XLS', text: 'TXT', cad: 'CAD', other: 'DOC',
}

const fmt = (b: number): string => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)

export default function ProjectDocuments() {
  const { t } = useTranslation('viewer')
  const docs = useDocumentStore((s) => s.docs)
  const remove = useDocumentStore((s) => s.remove)
  const [open, setOpen] = useState(true)
  if (docs.length === 0) return null

  const show = (file: File, name: string): void => {
    const url = URL.createObjectURL(file)
    if (opensInBrowser(name)) window.open(url, '_blank', 'noopener')
    else {
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
    }
    // Long enough for the new tab or the download to take the bytes.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <div className="border-t border-[var(--border)]" data-testid="project-documents">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-wider font-medium text-[var(--text-dim)] hover:text-[var(--text)]"
      >
        <span>{t('scene.documents.title', { count: docs.length })}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className={`transition-transform ${open ? 'rotate-180' : ''}`}><path d="M1 3l4 4 4-4"/></svg>
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-0.5">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-1.5 px-1 py-1 rounded hover:bg-white/[0.03]">
              <span className="flex-none w-8 text-center text-[8.5px] font-semibold tracking-wide rounded bg-white/[0.06] text-[var(--text-dim)] py-0.5">
                {KIND_GLYPH[documentKind(d.name)]}
              </span>
              <button
                onClick={() => show(d.file, d.name)}
                title={`${d.path} · ${opensInBrowser(d.name) ? t('scene.documents.open') : t('scene.documents.download')}`}
                className="flex-1 min-w-0 text-left text-[11px] max-md:text-[13px] max-md:py-1.5 text-[var(--text)] hover:text-[var(--accent)] truncate"
              >
                {d.name}
                <span className="ml-1 text-[9.5px] text-[var(--text-muted)]">{fmt(d.size)}</span>
              </button>
              <button
                onClick={() => remove(d.id)}
                aria-label={t('scene.documents.remove', { name: d.name })}
                className="flex-none w-5 h-5 max-md:w-9 max-md:h-9 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--danger)]"
              >
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M1 1l8 8M9 1L1 9"/></svg>
              </button>
            </div>
          ))}
          <p className="px-1 pt-1 text-[9.5px] text-[var(--text-muted)] leading-snug">{t('scene.documents.note')}</p>
        </div>
      )}
    </div>
  )
}
