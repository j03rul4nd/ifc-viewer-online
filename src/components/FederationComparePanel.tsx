// ─── FederationComparePanel ──────────────────────────────────────────────────
// The loaded models (new) against a saved federation (baseline), model by
// model: unchanged / changed / added / removed, plus placement and visibility
// flags. Element-level changes are the revision compare's job: pick the old
// IFC files and it opens with them as side A. Local and free (ADR D-37).

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SceneModel } from '../types'
import { useFederationStore } from '../stores/federationStore'
import { useFederationOpenStore } from '../stores/federationOpenStore'
import { compareFederation, countBucket, type CurrentModel, type ModelCompareStatus } from '../lib/federation-compare'
import { reconcile } from '../lib/federation-reconcile'
import { useRevisionStore } from './compare/revisionStore'
import { trackFeatureUsed, isRevisionCompareEnabled, onRevisionCompareFlag } from '../lib/analytics'
import { useCompareStore } from '../stores/compareStore'
import { toast } from '../stores/toastStore'

const TONE: Record<ModelCompareStatus, string> = {
  unchanged: 'text-[var(--text-muted)]',
  changed: 'text-[var(--warn)]',
  added: 'text-[var(--accent-2)]',
  removed: 'text-[var(--text-dim)] line-through',
}

export default function FederationComparePanel({ models, chipClass = '' }: { models: SceneModel[]; chipClass?: string }) {
  const { t } = useTranslation('common')
  const baseline = useFederationOpenStore((s) => s.compareBaseline)
  const parked = useFederationStore((s) => s.parked)
  const opacityById = useFederationStore((s) => s.opacityById)
  const oldInput = useRef<HTMLInputElement>(null)
  // The hand-off opens the revision compare; with its flag off there is nothing to hand to.
  const [rcFlag, setRcFlag] = useState(isRevisionCompareEnabled)
  useEffect(() => onRevisionCompareFlag(setRcFlag), [])

  const current = useMemo<CurrentModel[]>(() => [
    ...models.map((m) => ({
      fileName: m.fileName, size: m.fileSize || 0, visible: m.visible, parked: false,
      opacity: opacityById[m.id] ?? 1, transform: m.transform,
    })),
    ...parked.map((p) => ({ fileName: p.fileName, size: p.fileSize, visible: true, parked: true })),
  ], [models, parked, opacityById])

  const result = useMemo(() => (baseline ? compareFederation(baseline, current) : null), [baseline, current])

  // One event per baseline picked, bucketed counts only.
  const tracked = useRef<string | null>(null)
  useEffect(() => {
    if (!baseline || !result || tracked.current === baseline.id) return
    tracked.current = baseline.id
    trackFeatureUsed({
      feature: 'federation_compare',
      changed: countBucket(result.counts.changed),
      added: countBucket(result.counts.added),
      removed: countBucket(result.counts.removed),
    })
  }, [baseline, result])

  if (!baseline || !result) return null
  const close = () => useFederationOpenStore.getState().setCompareBaseline(null)

  const onOldPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    const rec = reconcile(baseline, files.map((f) => ({ name: f.name, size: f.size })))
    const old = rec.refs.flatMap((r) => (r.fileIndex === undefined ? [] : [files[r.fileIndex]]))
    if (old.length === 0) { toast(t('federationFile.compare.noOldMatch'), 'error'); return }
    // Clear the classic set diff so the modal opens on the revision compare.
    useCompareStore.getState().setDiff(null)
    const rs = useRevisionStore.getState()
    rs.reset()
    rs.setSource('own')
    rs.setSide('a', { files: old })
    useFederationOpenStore.getState().requestRevision()
  }

  const { counts } = result
  const size = (n?: number) => (!n || !(n > 0) ? '?' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

  return (
    <div className="rounded-md border border-[var(--border)] p-1.5 space-y-1 text-left" data-testid="federation-compare">
      <input ref={oldInput} type="file" accept=".ifc" multiple className="hidden" onChange={onOldPicked} data-testid="federation-compare-old-input" />
      <div className="flex items-center gap-1">
        <span className="flex-1 min-w-0 truncate text-[10.5px] text-[var(--text-muted)]" title={baseline.name}>
          {t('federationFile.compare.title', { name: baseline.name })}
        </span>
        <button className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text)]" onClick={close}>{t('federationFile.dismiss')}</button>
      </div>
      <div className="text-[10px] text-[var(--text-dim)]" data-testid="federation-compare-summary">
        {t('federationFile.compare.summary', counts)}
        {(counts.placement > 0 || counts.visibility > 0) && <> · {t('federationFile.compare.flags', counts)}</>}
      </div>
      <table className="w-full text-[10.5px]">
        <tbody>
          {result.rows.map((r, i) => (
            <tr key={i} className="align-top">
              <td className={`pr-1 whitespace-nowrap ${TONE[r.status]}`}>{t(`federationFile.compare.status.${r.status}`)}{r.sizeUnknown && <span className="text-[var(--text-dim)]"> ({t('federationFile.compare.sizeUnknown')})</span>}</td>
              <td className="min-w-0 max-w-0 w-full">
                <div className="truncate text-[var(--text)]" title={r.currentName ?? r.baselineName}>{r.currentName ?? r.baselineName}</div>
                {r.status === 'changed' && (
                  <div className="truncate text-[var(--text-dim)]" title={r.baselineName}>
                    {r.baselineName !== r.currentName ? `${r.baselineName} → ` : ''}{size(r.baselineSize)} → {size(r.currentSize)}
                  </div>
                )}
                {(r.placementChanged || r.visibilityChanged) && (
                  <div className="text-[var(--text-dim)]">
                    {[r.placementChanged && t('federationFile.compare.placement'), r.visibilityChanged && t('federationFile.compare.visibility')].filter(Boolean).join(' · ')}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rcFlag && counts.changed > 0 && (
        <div className="space-y-0.5">
          <button className={chipClass} onClick={() => oldInput.current?.click()} title={t('federationFile.compare.elementsHint')}>
            {t('federationFile.compare.elements')}
          </button>
        </div>
      )}
    </div>
  )
}
