// ─── FederationFileControls ──────────────────────────────────────────────────
// Save the current set as a `.ifcfed.json` (no model bytes, no paths) and open
// one back: pick the manifest, then the IFC files; matching files load and get
// their placement, visibility, opacity and parked state back; the rest are
// listed as missing. All local and free (ADR D-37).
//
// `variant="bar"`: save + open, in the Scene panel (2+ models).
// `variant="link"`: open only, a quiet link in the upload dialog — the way back
// in after a reload, when the scene is empty.

import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SceneModel } from '../types'
import { useFederationStore } from '../stores/federationStore'
import { parseManifest } from '../lib/federation-manifest'
import { saveToLibrary } from '../lib/federation-library'
import FederationLibraryList, { downloadManifest } from './FederationLibraryList'
import FederationComparePanel from './FederationComparePanel'
import { manifestFromSession, modelCountBucket, FEDERATION_FILE_SUFFIX } from '../lib/federation-session'
import { restoreAndReport } from '../lib/federation-restore'
import { useFederationOpenStore } from '../stores/federationOpenStore'
import { trackFeatureUsed } from '../lib/analytics'
import { toast } from '../stores/toastStore'

interface Props {
  variant: 'bar' | 'link'
  models?: SceneModel[]
  chipClass?: string
  /** Called once the IFC files were handed to the loader (e.g. close the dialog). */
  onStarted?: () => void
}

const newId = (): string => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export default function FederationFileControls({ variant, models = [], chipClass = '', onStarted }: Props) {
  const { t } = useTranslation('common')
  const manifestInput = useRef<HTMLInputElement>(null)
  const ifcInput = useRef<HTMLInputElement>(null)
  const compareInput = useRef<HTMLInputElement>(null)
  const pendingState = useFederationOpenStore((s) => s.pending)
  const pending = pendingState?.manifest ?? null
  const missing = useFederationOpenStore((s) => s.missing)
  const { setPending: setPendingState, setMissing } = useFederationOpenStore.getState()
  const setPending = (m: null) => setPendingState(m)
  const [naming, setNaming] = useState<string | null>(null)

  const download = () => {
    const name = (naming ?? '').trim() || t('federationFile.defaultName')
    const fed = useFederationStore.getState()
    const manifest = manifestFromSession({
      id: newId(), name, models, parked: fed.parked,
      opacityById: fed.opacityById, disciplineById: fed.disciplineById, colorByDiscipline: fed.colorByDiscipline,
      views: fed.views,
    })
    downloadManifest(manifest)
    void saveToLibrary(manifest).then(() => useFederationOpenStore.getState().bumpLibrary())
    setNaming(null)
    trackFeatureUsed({ feature: 'federation_save', models: modelCountBucket(manifest.models.length) })
    toast(t('federationFile.saved'), 'success')
  }

  const onManifestPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const r = parseManifest(await file.text())
    if (!r.ok) { toast(t('federationFile.invalid'), 'error'); return }
    setMissing([])
    setPendingState({ manifest: r.value, source: 'file' })
  }

  const onCompareManifestPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const r = parseManifest(await file.text())
    if (!r.ok) { toast(t('federationFile.invalid'), 'error'); return }
    useFederationOpenStore.getState().setCompareBaseline(r.value)
  }

  const onIfcPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!pendingState || files.length === 0) return
    await restoreAndReport(pendingState.manifest, files, pendingState.source)
    onStarted?.()
  }

  const inputs = (
    <>
      <input ref={manifestInput} type="file" accept={`${FEDERATION_FILE_SUFFIX},.json,application/json`} className="hidden" onChange={(e) => { void onManifestPicked(e) }} data-testid="federation-manifest-input" />
      <input ref={compareInput} type="file" accept={`${FEDERATION_FILE_SUFFIX},.json,application/json`} className="hidden" onChange={(e) => { void onCompareManifestPicked(e) }} data-testid="federation-compare-manifest-input" />
      <input ref={ifcInput} type="file" accept=".ifc" multiple className="hidden" onChange={(e) => { void onIfcPicked(e) }} data-testid="federation-ifc-input" />
    </>
  )

  const pendingPanel = pending && (
    <div className="rounded-md border border-[var(--border)] p-1.5 space-y-1 text-left" data-testid="federation-open-pending">
      <p className="text-[11px] text-[var(--text-dim)] leading-snug">
        {t('federationFile.pickFiles', { name: pending.name, count: pending.models.length })}
      </p>
      <div className="flex gap-1 justify-center">
        <button className={chipClass} onClick={() => ifcInput.current?.click()}>{t('federationFile.chooseFiles')}</button>
        <button className={chipClass} onClick={() => setPending(null)}>{t('actions.cancel')}</button>
      </div>
    </div>
  )

  if (variant === 'link') {
    return (
      <div className="mt-2 text-center space-y-1.5" onClick={(e) => e.stopPropagation()}>
        {inputs}
        {!pending && (
          <button
            type="button"
            onClick={() => manifestInput.current?.click()}
            title={t('federationFile.openHint')}
            className="text-[12px] text-[var(--text-dim)] hover:text-[var(--accent-2)] underline-offset-2 hover:underline"
          >
            {t('federationFile.openSaved')}
          </button>
        )}
        {pendingPanel}
        {!pending && <FederationLibraryList chipClass={chipClass} />}
      </div>
    )
  }

  return (
    <>
      {inputs}
      <div className="flex items-center gap-1 flex-wrap">
        <button className={chipClass} onClick={() => setNaming(naming === null ? t('federationFile.defaultName') : null)} aria-expanded={naming !== null} title={t('federationFile.saveHint')}>{t('federationFile.save')}</button>
        <button className={chipClass} onClick={() => manifestInput.current?.click()} title={t('federationFile.openHint')}>{t('federationFile.open')}</button>
        <button className={chipClass} onClick={() => compareInput.current?.click()} title={t('federationFile.compare.openHint')}>{t('federationFile.compare.open')}</button>
      </div>
      {naming !== null && (
        <div className="flex gap-1">
          <input
            value={naming}
            autoFocus
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') download(); if (e.key === 'Escape') setNaming(null) }}
            aria-label={t('federationFile.namePrompt')}
            maxLength={80}
            className="flex-1 min-w-0 h-[24px] max-md:h-10 max-md:text-[16px] px-1.5 rounded-[6px] bg-[rgba(255,255,255,0.05)] border border-[var(--border)] text-[11px] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
          />
          <button className={chipClass} onClick={download}>{t('federationFile.download')}</button>
        </div>
      )}
      {pendingPanel}
      <FederationComparePanel models={models} chipClass={chipClass} />
      {!pending && <FederationLibraryList chipClass={chipClass} canCompare />}
      {missing.length > 0 && (
        <div className="rounded-md border border-[var(--border)] p-1.5 space-y-0.5" data-testid="federation-missing">
          <div className="flex items-center gap-1">
            <span className="flex-1 text-[10px] text-[var(--warn)]">{t('federationFile.missing', { count: missing.length })}</span>
            <button className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text)]" onClick={() => setMissing([])}>{t('federationFile.dismiss')}</button>
          </div>
          {missing.map((n) => <div key={n} className="truncate text-[10.5px] text-[var(--text-dim)]" title={n}>{n}</div>)}
        </div>
      )}
    </>
  )
}
