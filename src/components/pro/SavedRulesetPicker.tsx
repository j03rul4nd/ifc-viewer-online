// ─── SavedRulesetPicker ───────────────────────────────────────────────────────
// Shared "in my account" panel for the three syncable artifact kinds
// (validator_profile | ids_spec | eir_profile). One component, used by
// CustomProfileModal, IdsModal and EirProfileEditor (03-feature-plan-pro §P6).
//
// Contract with the host:
//   · serializeCurrent() → { name, content } | null  — the editor's current
//     state ready to save (null when there's nothing valid to save yet).
//   · onLoad(content)     — apply a fetched ruleset's raw content. The host
//     re-validates with the real parser (a remote spec is no more trusted than
//     a dropped file — §case 5).
//
// No @clerk/* import — reads useEntitlement + cloudAccountStore only (I-1). When
// accounts are disabled it renders nothing, so hosts can drop it in
// unconditionally.

import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCloudAccountStore, isAccountEnabled, openAccountModal } from '../../stores/cloudAccountStore'
import { useEntitlement } from '../../hooks/useEntitlement'
import {
  listRulesets, getRuleset, createRuleset, deleteRuleset,
  type RulesetKind, type RulesetSummary,
} from '../../lib/cloud/account-client'
import { trackProUpsellShown } from '../../lib/analytics'
import { toast } from '../../stores/toastStore'

interface SavedRulesetPickerProps {
  kind: RulesetKind
  serializeCurrent: () => { name: string; content: string } | null
  onLoad: (content: string) => void
}

type ListState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error'; code: string }
  | { phase: 'ready'; items: RulesetSummary[] }

export default function SavedRulesetPicker({ kind, serializeCurrent, onLoad }: SavedRulesetPickerProps) {
  const { t } = useTranslation('pro')
  const status = useCloudAccountStore((s) => s.status)
  const getToken = useCloudAccountStore((s) => s.getToken)
  const entitlement = useEntitlement()
  const [list, setList] = useState<ListState>({ phase: 'idle' })
  const [busy, setBusy] = useState<string | null>(null)

  const canWrite = (entitlement.plan === 'pro' || entitlement.plan === 'org') &&
    (entitlement.status === 'active' || entitlement.status === 'past_due')

  const refresh = useCallback(async () => {
    const token = await getToken?.()
    if (!token) return
    setList({ phase: 'loading' })
    const r = await listRulesets(token, kind)
    setList(r.ok ? { phase: 'ready', items: r.value.rulesets } : { phase: 'error', code: r.error.code })
  }, [getToken, kind])

  useEffect(() => {
    if (status === 'signed-in') void refresh()
  }, [status, refresh])

  if (!isAccountEnabled()) return null

  const section = (children: React.ReactNode) => (
    <div className="rounded-xl border border-[var(--border)] p-3 flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 10a2.5 2.5 0 0 1 0-5 3 3 0 0 1 5.8-1A2.7 2.7 0 0 1 11 10H4z" />
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t('sync.title')}</span>
      </div>
      {children}
    </div>
  )

  // ── Anonymous / loading: invite to sign in ────────────────────────────────
  if (status !== 'signed-in') {
    return section(
      <>
        <p className="text-[11px] text-[var(--text-muted)] leading-snug">{t('sync.signInPrompt')}</p>
        <button onClick={openAccountModal} className="self-start h-7 px-2.5 rounded-lg text-[11px] font-medium border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] transition-colors">
          {t('sync.signIn')}
        </button>
      </>,
    )
  }

  // ── Signed-in but free: upsell ────────────────────────────────────────────
  if (!canWrite && (list.phase !== 'ready' || list.items.length === 0)) {
    return section(
      <>
        <p className="text-[11px] text-[var(--text-muted)] leading-snug">
          {entitlement.status === 'canceled' ? t('sync.readOnly') : t('sync.upsell')}
        </p>
        <button
          onClick={() => { trackProUpsellShown({ trigger: 'rulesets' }); openAccountModal() }}
          className="self-start h-7 px-2.5 rounded-lg text-[11px] font-semibold"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          {t('sync.seePlans')}
        </button>
      </>,
    )
  }

  const handleSave = async () => {
    const payload = serializeCurrent()
    if (!payload) { toast(t('sync.nothingToSave'), 'info'); return }
    const token = await getToken?.()
    if (!token) return
    setBusy('save')
    const r = await createRuleset(token, { name: payload.name, kind, content: payload.content })
    setBusy(null)
    if (r.ok) { toast(t('sync.saved'), 'success'); void refresh() }
    else if (r.error.code === 'quota_exceeded') toast(t('sync.quota'), 'warning')
    else if (r.error.code === 'upgrade_required') { trackProUpsellShown({ trigger: 'rulesets' }); openAccountModal() }
    else toast(t('errors.generic'), 'error')
  }

  const handleOpen = async (id: string) => {
    const token = await getToken?.()
    if (!token) return
    setBusy(id)
    const r = await getRuleset(token, id)
    setBusy(null)
    if (r.ok) { onLoad(r.value.content); toast(t('sync.loaded'), 'success') }
    else toast(t('errors.generic'), 'error')
  }

  const handleDelete = async (id: string) => {
    const token = await getToken?.()
    if (!token) return
    setBusy(id)
    const r = await deleteRuleset(token, id)
    setBusy(null)
    if (r.ok) void refresh()
    else toast(t('errors.generic'), 'error')
  }

  return section(
    <>
      {canWrite && (
        <button onClick={() => void handleSave()} disabled={busy === 'save'}
          className="self-start h-7 px-2.5 rounded-lg text-[11px] font-medium border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] transition-colors disabled:opacity-40">
          {busy === 'save' ? t('sync.saving') : t('sync.saveCurrent')}
        </button>
      )}
      {entitlement.status === 'canceled' && (
        <p className="text-[10px] leading-snug rounded px-2 py-1" style={{ background: 'rgba(245,166,35,0.10)', color: '#F5A623' }}>
          {t('sync.readOnlyNote')}
        </p>
      )}

      {list.phase === 'loading' && <p className="text-[11px] text-[var(--text-muted)]">{t('sync.loading')}</p>}
      {list.phase === 'error' && <p className="text-[11px] text-[var(--text-muted)]">{t('errors.generic')}</p>}
      {list.phase === 'ready' && list.items.length === 0 && <p className="text-[11px] text-[var(--text-muted)]">{t('sync.empty')}</p>}
      {list.phase === 'ready' && list.items.map((r) => (
        <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-[var(--border)]">
          <span className="flex-1 text-[11px] text-[var(--text)] truncate">{r.name}</span>
          <button onClick={() => void handleOpen(r.id)} disabled={busy === r.id}
            className="h-6 px-2 rounded text-[10px] font-medium border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] transition-colors disabled:opacity-40">
            {t('sync.open')}
          </button>
          {canWrite && (
            <button onClick={() => void handleDelete(r.id)} disabled={busy === r.id}
              className="h-6 px-2 rounded text-[10px] font-medium border border-[var(--border)] text-[var(--danger,#e5534b)] hover:border-[var(--danger,#e5534b)] transition-colors disabled:opacity-40">
              {t('sync.delete')}
            </button>
          )}
        </div>
      ))}
    </>,
  )
}
