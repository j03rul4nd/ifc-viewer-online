// ─── FederationLibraryList ───────────────────────────────────────────────────
// Federations saved in this browser (manifests only, ADR D-37). Open asks for
// the IFC files like a picked .ifcfed.json does; Download gives the file back;
// Delete removes it from the browser.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listLibrary, deleteFromLibrary, type LibraryEntry } from '../lib/federation-library'
import { serializeManifest, type FederationManifestV1 } from '../lib/federation-manifest'
import { federationFileName } from '../lib/federation-session'
import { useFederationOpenStore } from '../stores/federationOpenStore'

export function downloadManifest(manifest: FederationManifestV1): void {
  const url = URL.createObjectURL(new Blob([serializeManifest(manifest)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = federationFileName(manifest.name)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function FederationLibraryList({ chipClass = '' }: { chipClass?: string }) {
  const { t, i18n } = useTranslation('common')
  const rev = useFederationOpenStore((s) => s.libraryRev)
  const [entries, setEntries] = useState<LibraryEntry[]>([])

  useEffect(() => {
    let alive = true
    void listLibrary().then((l) => { if (alive) setEntries(l) })
    return () => { alive = false }
  }, [rev])

  if (entries.length === 0) return null

  const open = (e: LibraryEntry) => {
    const s = useFederationOpenStore.getState()
    s.setMissing([])
    s.setPending({ manifest: e.manifest, source: 'library' })
  }
  const remove = async (e: LibraryEntry) => {
    if (!window.confirm(t('federationFile.library.confirmDelete', { name: e.name }))) return
    await deleteFromLibrary(e.id)
    useFederationOpenStore.getState().bumpLibrary()
  }
  const date = (ms: number) => {
    try { return new Date(ms).toLocaleDateString(i18n.language) } catch { return '' }
  }

  return (
    <div className="rounded-md border border-[var(--border)] p-1.5 space-y-1 text-left" data-testid="federation-library">
      <div className="text-[10.5px] text-[var(--text-muted)]" title={t('federationFile.library.hint')}>{t('federationFile.library.title')}</div>
      {entries.map((e) => (
        <div key={e.id} className="flex items-center gap-1">
          <div className="flex-1 min-w-0">
            <div className="truncate text-[11px] text-[var(--text)]" title={e.name}>{e.name}</div>
            <div className="text-[10px] text-[var(--text-dim)]">
              {date(e.savedAt)} · {t('federationFile.library.models', { count: e.modelCount })}
            </div>
          </div>
          <button className={chipClass} onClick={() => open(e)}>{t('federationFile.library.open')}</button>
          <button className={chipClass} onClick={() => downloadManifest(e.manifest)}>{t('federationFile.download')}</button>
          <button className={chipClass} onClick={() => { void remove(e) }} aria-label={t('federationFile.library.delete')}>{t('federationFile.library.delete')}</button>
        </div>
      ))}
    </div>
  )
}
