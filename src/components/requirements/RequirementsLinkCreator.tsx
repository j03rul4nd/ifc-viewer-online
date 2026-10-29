// ─── RequirementsLinkCreator ──────────────────────────────────────────────────
// The receiver's side of a requirements link (doc 17, M1): pack the loaded IDS,
// the active validation profile and a minimum Health Score into a link the
// receiver pastes in a BEP, a tender or an email. Suppliers who open it check
// their model against exactly that, in their own browser.

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useIdsStore } from '../../stores/idsStore'
import { useValidationStore } from '../../stores/validationStore'
import { VALIDATION_PROFILES } from '../../types'
import { writeIds } from '../../lib/ids/ids-writer'
import { buildRequirementsUrl, REQUIREMENTS_LINK_VERSION, type RequirementsPayload } from '../../lib/requirements/requirements-link'
import { trackRequirementsLinkCreated } from '../../lib/analytics'
import { toast } from '../../stores/toastStore'

const BUILTIN_IDS = new Set(VALIDATION_PROFILES.map((p) => p.id))

export default function RequirementsLinkCreator() {
  const { t } = useTranslation('ids')
  const doc = useIdsStore((s) => s.doc)
  const idsName = useIdsStore((s) => s.fileName)
  const profileId = useValidationStore((s) => s.activeProfileId)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [issuer, setIssuer] = useState('')
  const [useScore, setUseScore] = useState(true)
  const [minScore, setMinScore] = useState(80)
  const [useIds, setUseIds] = useState(true)
  const [busy, setBusy] = useState(false)

  const builtinProfile = profileId && BUILTIN_IDS.has(profileId) ? profileId : undefined
  const withIds = useIds && !!doc
  const canCreate = title.trim() !== '' && (useScore || withIds) && !busy

  const create = async (): Promise<void> => {
    if (!canCreate) return
    setBusy(true)
    try {
      const payload: RequirementsPayload = { v: REQUIREMENTS_LINK_VERSION, t: title.trim() }
      if (issuer.trim()) payload.i = issuer.trim()
      if (useScore) {
        payload.s = minScore
        if (builtinProfile) payload.p = builtinProfile
      }
      if (withIds && doc) {
        payload.x = writeIds(doc)
        if (idsName) payload.xn = idsName
      }
      const r = await buildRequirementsUrl(`${window.location.origin}${window.location.pathname}`, payload)
      if (!r.ok) {
        toast(t(r.reason === 'too-long' ? 'requirements.create.tooLong' : 'requirements.create.empty'), 'error', { duration: 8000 })
        return
      }
      await navigator.clipboard.writeText(r.url)
      trackRequirementsLinkCreated({ has_score: useScore, has_ids: withIds, has_profile: !!payload.p })
      toast(t('requirements.create.copied'), 'success')
    } catch {
      toast(t('requirements.create.failed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-[11.5px] text-[var(--accent)] hover:underline"
      >
        {t('requirements.create.open')}
      </button>
    )
  }

  const field = 'h-8 px-2.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)]'

  return (
    <section className="flex flex-col gap-2.5 px-3 py-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
      <div>
        <h3 className="m-0 text-[12.5px] font-semibold text-[var(--text)]">{t('requirements.create.title')}</h3>
        <p className="m-0 mt-0.5 text-[11.5px] text-[var(--text-faint)] leading-snug">{t('requirements.create.intro')}</p>
      </div>
      <label className="flex flex-col gap-1 text-[11px] text-[var(--text-dim)]">
        {t('requirements.create.what')}
        <input className={field} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={t('requirements.create.whatPlaceholder')} />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-[var(--text-dim)]">
        {t('requirements.create.who')}
        <input className={field} value={issuer} maxLength={80} onChange={(e) => setIssuer(e.target.value)} placeholder={t('requirements.create.whoPlaceholder')} />
      </label>
      <label className="flex items-center gap-2 text-[12px] text-[var(--text-dim)]">
        <input type="checkbox" checked={useScore} onChange={(e) => setUseScore(e.target.checked)} />
        {t('requirements.create.minScore')}
        <input
          type="number" min={0} max={100} value={minScore} disabled={!useScore}
          onChange={(e) => setMinScore(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
          className={`${field} w-16 disabled:opacity-40`}
          aria-label={t('requirements.create.minScore')}
        />
      </label>
      {useScore && builtinProfile && (
        <p className="m-0 -mt-1 pl-6 text-[11px] text-[var(--text-faint)]">{t('requirements.create.profileNote', { profile: VALIDATION_PROFILES.find((p) => p.id === builtinProfile)?.name ?? builtinProfile })}</p>
      )}
      <label className={`flex items-center gap-2 text-[12px] ${doc ? 'text-[var(--text-dim)]' : 'text-[var(--text-faint)]'}`}>
        <input type="checkbox" checked={withIds} disabled={!doc} onChange={(e) => setUseIds(e.target.checked)} />
        {doc ? t('requirements.create.includeIds', { name: idsName ?? 'IDS' }) : t('requirements.create.noIds')}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void create()}
          disabled={!canCreate}
          className="h-8 px-3 rounded-md bg-[var(--accent)] text-white text-[12px] font-medium disabled:opacity-40 hover:brightness-110"
        >
          {t('requirements.create.copy')}
        </button>
        <span className="text-[11px] text-[var(--text-faint)]">{t('requirements.create.private')}</span>
      </div>
    </section>
  )
}
