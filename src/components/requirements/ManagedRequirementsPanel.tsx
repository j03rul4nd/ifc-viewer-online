// ─── ManagedRequirementsPanel ─────────────────────────────────────────────────
// B2 (Reception, doc 25b F1): keep the requirements as a profile in the account,
// publish numbered versions with a short note, read the change history, and
// copy a link that always points at the current version. Links made at v1 keep
// working after v2 (the link carries its own snapshot; the server keeps every
// version).
//
// DARK: rendered only with the pricing preview, VITE_API_URL and a session
// (usePaidLive) — the public site never shows it. Validating stays free for
// whoever opens the link; this panel is the "define and manage" side.

import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePaidLive } from '../../hooks/usePaidQuery'
import { paidApi, type ApiRequirementVersion } from '../../lib/cloud/paid-client'
import type { RequirementsPayload } from '../../lib/requirements/requirements-link'
import { toast } from '../../stores/toastStore'
import { openAccountModal } from '../../stores/cloudAccountStore'

interface Props {
  /** The requirements as currently set in the creator (null = nothing valid yet). */
  current: () => RequirementsPayload | null
  /** Copy a link for a payload that carries the profile reference. */
  copyLink: (payload: RequirementsPayload) => Promise<void>
}

type Profile = { id: string; name: string }

export default function ManagedRequirementsPanel({ current, copyLink }: Props) {
  const { t } = useTranslation('ids')
  const live = usePaidLive()
  const [profiles, setProfiles] = useState<Profile[] | null>(null)
  const [selected, setSelected] = useState<string>('')
  const [history, setHistory] = useState<ApiRequirementVersion[] | null>(null)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [needsPlan, setNeedsPlan] = useState(false)

  const loadProfiles = useCallback(async () => {
    const r = await paidApi.requirementProfiles()
    if (r.ok) setProfiles(r.value.rulesets.map((p) => ({ id: p.id, name: p.name })))
    else setProfiles([])
  }, [])

  const loadHistory = useCallback(async (id: string) => {
    if (!id) { setHistory(null); return }
    const r = await paidApi.requirementVersions(id)
    setHistory(r.ok ? r.value.versions : [])
  }, [])

  useEffect(() => { if (live) void loadProfiles() }, [live, loadProfiles])
  useEffect(() => { void loadHistory(selected) }, [selected, loadHistory])

  if (!live) return null

  const failed = (code: string): void => {
    if (code === 'upgrade_required' || code === 'plan_required' || code === 'forbidden') { setNeedsPlan(true); return }
    toast(t('requirements.managed.failed'), 'error')
  }

  const publish = async (): Promise<void> => {
    const payload = current()
    if (!payload) { toast(t('requirements.create.empty'), 'info'); return }
    if (!note.trim()) { toast(t('requirements.managed.noteRequired'), 'info'); return }
    setBusy(true)
    try {
      let id = selected
      if (!id) {
        const created = await paidApi.createRequirementProfile((name.trim() || payload.t).slice(0, 120), JSON.stringify(stripRef(payload)))
        if (!created.ok) { failed(created.error.code); return }
        id = created.value.id
      }
      const r = await paidApi.publishRequirementVersion(id, JSON.stringify(stripRef(payload)), note.trim())
      if (!r.ok) { failed(r.error.code); return }
      toast(t('requirements.managed.published', { version: r.value.version }), 'success')
      setNote('')
      await loadProfiles()
      setSelected(id)
      await loadHistory(id)
    } finally {
      setBusy(false)
    }
  }

  const copyCurrent = async (): Promise<void> => {
    const payload = current()
    const profile = profiles?.find((p) => p.id === selected)
    const latest = history?.[0]
    if (!payload || !profile || !latest) return
    // The snapshot in the link is what the creator holds now; publish first if
    // it differs, so the fallback matches the server's current version.
    await copyLink({ ...stripRef(payload), pr: { id: profile.id, v: latest.version, nm: profile.name } })
  }

  const field = 'h-8 px-2.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)]'

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t('requirements.managed.title')}</span>
        <span className="text-[10px] text-[var(--text-faint)]">{t('requirements.managed.plan')}</span>
      </div>
      {needsPlan ? (
        <>
          <p className="m-0 text-[11px] text-[var(--text-muted)] leading-snug">{t('requirements.managed.upsell')}</p>
          <button type="button" onClick={openAccountModal} className="self-start h-7 px-2.5 rounded-lg text-[11px] font-semibold bg-[var(--accent)] text-white">
            {t('requirements.managed.seePlans')}
          </button>
        </>
      ) : (
        <>
          <select className={field} value={selected} onChange={(e) => setSelected(e.target.value)} aria-label={t('requirements.managed.profile')}>
            <option value="">{t('requirements.managed.newProfile')}</option>
            {(profiles ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {!selected && (
            <input className={field} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={t('requirements.managed.namePlaceholder')} aria-label={t('requirements.managed.name')} />
          )}
          <input className={field} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={t('requirements.managed.notePlaceholder')} aria-label={t('requirements.managed.note')} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || !note.trim()} onClick={() => void publish()}
              className="h-7 px-2.5 rounded-md text-[11.5px] font-medium border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-40">
              {selected ? t('requirements.managed.publishNext', { version: (history?.[0]?.version ?? 0) + 1 }) : t('requirements.managed.publishFirst')}
            </button>
            {selected && history && history.length > 0 && (
              <button type="button" disabled={busy} onClick={() => void copyCurrent()}
                className="h-7 px-2.5 rounded-md text-[11.5px] font-semibold bg-[var(--accent)] text-white disabled:opacity-40">
                {t('requirements.managed.copyCurrent', { version: history[0].version })}
              </button>
            )}
          </div>
          {selected && history && (
            <div className="flex flex-col gap-1">
              <span className="text-[10.5px] text-[var(--text-faint)]">{t('requirements.managed.history')}</span>
              {history.length === 0 && <span className="text-[11px] text-[var(--text-muted)]">{t('requirements.managed.noVersions')}</span>}
              <ol className="m-0 p-0 list-none flex flex-col gap-0.5 max-h-32 overflow-auto">
                {history.map((v) => (
                  <li key={v.version} className="text-[11px] text-[var(--text-dim)]">
                    <span className="font-semibold text-[var(--text)]">v{v.version}</span>
                    {' · '}{new Date(v.created_at).toLocaleDateString()}
                    {' · '}{v.note}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** A stored version never carries a reference to itself. */
function stripRef(p: RequirementsPayload): RequirementsPayload {
  const { pr: _pr, ...rest } = p
  return rest
}
