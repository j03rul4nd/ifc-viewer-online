// ─── FederationFileControls ──────────────────────────────────────────────────
// Save the current set as a `.ifcfed.json` (no model bytes, no paths) and open
// one back: pick the manifest, then the IFC files; matching files load and get
// their placement, visibility, opacity and parked state back; the rest are
// listed as missing. All local and free (ADR D-37).

import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SceneModel } from '../types'
import { useFederationStore } from '../stores/federationStore'
import { parseManifest, serializeManifest, type FederationManifestV1 } from '../lib/federation-manifest'
import { reconcile } from '../lib/federation-reconcile'
import {
  manifestFromSession, planRestore, federationFileName, modelCountBucket, FEDERATION_FILE_SUFFIX,
  type RestoreApply,
} from '../lib/federation-session'
import { DISCIPLINES, type Discipline } from '../lib/federation'
import { submitIfcFiles } from '../lib/loading'
import { trackFeatureUsed } from '../lib/analytics'
import { toast } from '../stores/toastStore'

interface Props {
  models: SceneModel[]
  chipClass: string
  /** Apply a saved state to a model that has just loaded. */
  onApplyRestored: (modelId: string, apply: RestoreApply) => void
}

const newId = (): string => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export default function FederationFileControls({ models, chipClass, onApplyRestored }: Props) {
  const { t } = useTranslation('common')
  const manifestInput = useRef<HTMLInputElement>(null)
  const ifcInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<FederationManifestV1 | null>(null)
  const [missing, setMissing] = useState<string[]>([])

  const onSave = () => {
    const fed = useFederationStore.getState()
    const name = (window.prompt(t('federationFile.namePrompt'), t('federationFile.defaultName')) ?? '').trim()
    if (!name) return
    const manifest = manifestFromSession({
      id: newId(), name, models, parked: fed.parked,
      opacityById: fed.opacityById, disciplineById: fed.disciplineById, colorByDiscipline: fed.colorByDiscipline,
    })
    const blob = new Blob([serializeManifest(manifest)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = federationFileName(name)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
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
    setPending(r.value)
  }

  const onIfcPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const manifest = pending
    if (!manifest || files.length === 0) return
    const plan = planRestore(manifest, reconcile(manifest, files.map((f) => ({ name: f.name, size: f.size }))))
    setPending(null)
    setMissing(plan.missing.map((m) => m.fileName))
    trackFeatureUsed({ feature: 'federation_open', models: modelCountBucket(manifest.models.length) })

    const fed = useFederationStore.getState()
    fed.setColorByDiscipline(plan.colorByDiscipline)
    for (const p of plan.parks) {
      const f = files[p.fileIndex]
      try { fed.park(f.name, await f.arrayBuffer()) } catch { /* unreadable: skip */ }
    }
    if (plan.loads.length === 0) return
    const handles = submitIfcFiles(plan.loads.map((l) => files[l.fileIndex]), {
      origin: 'upload', batchName: manifest.name || null,
    })
    handles.forEach((h, i) => {
      void h.settled.then((out) => {
        if (out.status !== 'loaded') return
        const apply = plan.loads[i].apply
        if (apply.discipline && (DISCIPLINES as string[]).includes(apply.discipline)) {
          useFederationStore.getState().setDiscipline(out.resultId, apply.discipline as Discipline)
        }
        onApplyRestored(out.resultId, apply)
      })
    })
  }

  return (
    <>
      <div className="flex items-center gap-1 flex-wrap">
        <button className={chipClass} onClick={onSave} title={t('federationFile.saveHint')}>{t('federationFile.save')}</button>
        <button className={chipClass} onClick={() => manifestInput.current?.click()} title={t('federationFile.openHint')}>{t('federationFile.open')}</button>
        <input ref={manifestInput} type="file" accept={`${FEDERATION_FILE_SUFFIX},.json,application/json`} className="hidden" onChange={(e) => { void onManifestPicked(e) }} data-testid="federation-manifest-input" />
        <input ref={ifcInput} type="file" accept=".ifc" multiple className="hidden" onChange={(e) => { void onIfcPicked(e) }} data-testid="federation-ifc-input" />
      </div>
      {pending && (
        <div className="rounded-md border border-[var(--border)] p-1.5 space-y-1" data-testid="federation-open-pending">
          <p className="text-[10px] text-[var(--text-dim)] leading-snug">
            {t('federationFile.pickFiles', { name: pending.name, count: pending.models.length })}
          </p>
          <div className="flex gap-1">
            <button className={chipClass} onClick={() => ifcInput.current?.click()}>{t('federationFile.chooseFiles')}</button>
            <button className={chipClass} onClick={() => setPending(null)}>{t('actions.cancel')}</button>
          </div>
        </div>
      )}
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
