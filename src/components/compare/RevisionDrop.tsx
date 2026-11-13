// The three-click start of revision compare (M6): drop the old revision, drop
// the new one, and the comparison starts by itself. Both sides accept one file
// or a set (one per discipline). Dropping both sets at once on either zone
// splits them by file date (older = A). Everything is read in this browser.
import React, { useRef, useState } from 'react'
import { useRevisionStore } from './revisionStore'
import { useRevisionText } from './useRevisionText'

function isIfc(f: File): boolean { return /\.ifc$/i.test(f.name) }

function Zone({ side, files, onFiles, busy }: { side: 'a' | 'b'; files: File[]; onFiles: (f: File[]) => void; busy: boolean }) {
  const { t } = useRevisionText()
  const ref = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const has = files.length > 0
  return (
    <div
      role="button" tabIndex={0} data-testid={`rc-drop-${side}`}
      aria-label={t(`rc.drop.${side}`)}
      onClick={() => !busy && ref.current?.click()}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !busy) ref.current?.click() }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); const f = [...e.dataTransfer.files].filter(isIfc); if (f.length) onFiles(f) }}
      className={`flex-1 min-w-0 min-h-[150px] sm:min-h-[190px] flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed cursor-pointer transition-colors text-center
        ${over ? 'border-[var(--accent)] bg-[var(--accent)]/10' : has ? 'border-[var(--ok)] bg-[var(--surface)]' : 'border-[var(--border-strong)] hover:border-[var(--accent)]'}`}
    >
      <input
        ref={ref} type="file" accept=".ifc" multiple className="hidden" data-testid={`rc-input-${side}`}
        onChange={(e) => { const f = [...(e.target.files ?? [])].filter(isIfc); if (f.length) onFiles(f); e.target.value = '' }}
      />
      <span className="w-9 h-9 rounded-full inline-flex items-center justify-center text-[15px] font-bold bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)] text-[var(--text)]">{side === 'a' ? 'A' : 'B'}</span>
      <span className="text-[13.5px] font-semibold text-[var(--text)]">{t(`rc.drop.${side}`)}</span>
      {has ? (
        <span className="text-[11.5px] text-[var(--ok)] max-w-full truncate" title={files.map((f) => f.name).join('\n')}>
          ✓ {files.length === 1 ? files[0].name : t('rc.drop.files', { count: files.length })}
        </span>
      ) : (
        <span className="text-[11.5px] text-[var(--text-faint)]">{t('rc.drop.hint')}</span>
      )}
    </div>
  )
}

export default function RevisionDrop({ onStart, onAdvanced }: { onStart: () => void; onAdvanced: () => void }) {
  const { t } = useRevisionText()
  const { a, b, phase, progress, error, setSide } = useRevisionStore()
  const busy = phase === 'reading'

  const put = (side: 'a' | 'b', files: File[]): void => {
    const s = useRevisionStore.getState()
    const other = side === 'a' ? s.b.files : s.a.files
    // Both revisions dropped together on one zone: two files with the same
    // name, or an even set with names repeated → older ones are A.
    const names = files.map((f) => f.name)
    if (!other.length && files.length >= 2 && new Set(names).size < names.length) {
      const sorted = [...files].sort((x, y) => x.lastModified - y.lastModified)
      const seen = new Set<string>(); const older: File[] = []; const newer: File[] = []
      for (const f of sorted) { if (seen.has(f.name)) newer.push(f); else { seen.add(f.name); older.push(f) } }
      setSide('a', { files: older }); setSide('b', { files: newer })
      onStart()
      return
    }
    setSide(side, { files })
    const st = useRevisionStore.getState()
    if (st.a.files.length && st.b.files.length) onStart()
  }

  const swap = (): void => {
    const s = useRevisionStore.getState()
    const af = s.a.files, bf = s.b.files
    setSide('a', { files: bf }); setSide('b', { files: af })
    if (af.length && bf.length) onStart()
  }

  const list = Object.entries(progress)
  const pct = list.length ? Math.round(list.reduce((n, [, v]) => n + v, 0) / list.length) : 8

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col md:flex-row items-stretch gap-2 md:gap-3">
        <Zone side="a" files={a.files} onFiles={(f) => put('a', f)} busy={busy} />
        <div className="flex md:flex-col items-center justify-center">
          <button type="button" onClick={swap} disabled={busy || (!a.files.length && !b.files.length)} title={t('rc.drop.swap')} aria-label={t('rc.drop.swap')}
            className="h-10 w-10 rounded-full border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] disabled:opacity-30">
            <span className="md:hidden">⇅</span><span className="hidden md:inline">⇄</span>
          </button>
        </div>
        <Zone side="b" files={b.files} onFiles={(f) => put('b', f)} busy={busy} />
      </div>

      <p className="m-0 flex items-center gap-2 text-[11.5px] text-[var(--text-dim)]" data-testid="rc-local-notice">
        <span aria-hidden>🔒</span>{t('rc.local')}
      </p>

      {busy && (
        <div className="flex flex-col gap-1" role="status" aria-live="polite">
          <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
            <div className="h-full bg-[var(--accent)] transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-3 text-[10.5px] text-[var(--text-faint)]">
            {list.length ? list.map(([name, v]) => <span key={name} className="truncate max-w-[260px]">{name} · {v}%</span>) : <span>{t('rc.reading')}</span>}
          </div>
        </div>
      )}
      {error && <p className="m-0 text-[11.5px] text-[var(--danger)]">{t('error', { message: error })}</p>}

      <button type="button" onClick={onAdvanced} className="self-start text-[11.5px] text-[var(--text-faint)] underline underline-offset-2 hover:text-[var(--text)]">
        {t('rc.advanced')}
      </button>
    </div>
  )
}
