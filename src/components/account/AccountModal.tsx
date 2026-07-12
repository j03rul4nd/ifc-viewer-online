// ─── AccountModal ─────────────────────────────────────────────────────────────
// The account surface (F2): sign-in / sign-out, plan + billing, and API keys.
// Loaded lazily (vendor-auth chunk) from the Toolbar entry point — the
// anonymous bundle never contains this file or @clerk/*.
//
//  · Anonymous  → Clerk <SignIn> embedded (S-1 scenario A: works under COEP).
//  · Signed in  → plan card (checkout/portal by full-page redirect, never
//    embedded Stripe), API keys with show-once secret, sign-out.
//
// All server calls go through account-client (Result, never throw); every
// failure degrades to a visible, translated state — no blank panels.

import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { SignIn } from '@clerk/react'
import { useCloudAccountStore } from '../../stores/cloudAccountStore'
import { useEntitlement } from '../../hooks/useEntitlement'
import {
  createApiKey, createCheckout, createPortal as createBillingPortal,
  listApiKeys, revokeApiKey, listCertificates,
  type ApiKeySummary, type CreatedApiKey, type HistoryCertificate,
} from '../../lib/cloud/account-client'
import { isCloudEnabled } from '../../lib/cloud/api-client'
import { trackCheckoutStarted } from '../../lib/analytics'
import { toast } from '../../stores/toastStore'

interface AccountModalProps {
  onClose: () => void
}

type KeysState =
  | { phase: 'loading' }
  | { phase: 'error'; code: string }
  | { phase: 'ready'; keys: ApiKeySummary[] }

type HistoryState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; items: HistoryCertificate[] }

export default function AccountModal({ onClose }: AccountModalProps) {
  const { t } = useTranslation('pro')
  const status = useCloudAccountStore((s) => s.status)
  const email = useCloudAccountStore((s) => s.email)
  const getToken = useCloudAccountStore((s) => s.getToken)
  const signOut = useCloudAccountStore((s) => s.signOut)
  const entitlement = useEntitlement()

  const [keys, setKeys] = useState<KeysState>({ phase: 'loading' })
  const [newKey, setNewKey] = useState<CreatedApiKey | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState<HistoryState>({ phase: 'loading' })

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const loadKeys = useCallback(async () => {
    const token = await getToken?.()
    if (!token) return
    const r = await listApiKeys(token)
    setKeys(r.ok ? { phase: 'ready', keys: r.value.keys } : { phase: 'error', code: r.error.code })
  }, [getToken])

  const loadHistory = useCallback(async () => {
    const token = await getToken?.()
    if (!token) return
    const r = await listCertificates(token)
    setHistory(r.ok ? { phase: 'ready', items: r.value.certificates } : { phase: 'error' })
  }, [getToken])

  // On open with a session: refresh the plan truth + load keys + history.
  useEffect(() => {
    if (status !== 'signed-in') return
    void entitlement.refresh()
    void loadKeys()
    void loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const handleCreateKey = async () => {
    const token = await getToken?.()
    if (!token) return
    setBusy('create')
    const r = await createApiKey(token)
    setBusy(null)
    if (r.ok) {
      setNewKey(r.value)
      void loadKeys()
    } else if (r.error.code === 'quota_exceeded') {
      toast(t('keys.quota'), 'warning', { duration: 6000 })
    } else {
      toast(t('errors.generic'), 'error')
    }
  }

  const handleRevoke = async (id: string) => {
    const token = await getToken?.()
    if (!token) return
    setBusy(id)
    const r = await revokeApiKey(token, id)
    setBusy(null)
    if (r.ok) {
      if (newKey?.id === id) setNewKey(null)
      void loadKeys()
    } else {
      toast(t('errors.generic'), 'error')
    }
  }

  const handleCheckout = async () => {
    const token = await getToken?.()
    if (!token) return
    setBusy('checkout')
    trackCheckoutStarted({ interval: 'month' })
    const r = await createCheckout(token, 'month')
    setBusy(null)
    if (r.ok) {
      window.location.href = r.value.url // full-page redirect to Stripe — never embedded
    } else if (r.error.code === 'service_disabled') {
      toast(t('billing.notYet'), 'info', { duration: 6000 })
    } else {
      toast(t('errors.generic'), 'error')
    }
  }

  const handlePortal = async () => {
    const token = await getToken?.()
    if (!token) return
    setBusy('portal')
    const r = await createBillingPortal(token)
    setBusy(null)
    if (r.ok) window.location.href = r.value.url
    else toast(r.error.code === 'service_disabled' ? t('billing.notYet') : t('errors.generic'), 'error')
  }

  const copyKey = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* key stays visible and selectable */ }
  }

  const smallBtn =
    'h-7 px-2.5 rounded-lg text-[11px] font-medium border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog" aria-modal="true" aria-label={t('title')}
        className="relative z-[81] w-[460px] max-w-full max-h-[calc(100dvh-3rem)] rounded-2xl bg-[rgba(14,14,18,0.98)] backdrop-blur-[20px] border border-[var(--border-strong)] shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
          <span className="text-[13px] font-semibold text-[var(--text)]">{t('title')}</span>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors" aria-label={t('close')}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M1 1l8 8M9 1L1 9"/></svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-4">
          {status !== 'signed-in' ? (
            /* ── Anonymous: embedded Clerk sign-in (S-1 scenario A) ─────────── */
            <div className="flex flex-col items-center gap-3">
              <p className="text-[12px] text-[var(--text-muted)] leading-snug self-start">{t('signInIntro')}</p>
              <SignIn routing="hash" />
            </div>
          ) : (
            <>
              {/* ── Identity ─────────────────────────────────────────────────── */}
              <section className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] text-[var(--text)] truncate">{email ?? t('signedIn')}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{t('signedInHint')}</p>
                </div>
                <button onClick={() => void signOut?.()} className={smallBtn}>{t('signOut')}</button>
              </section>

              {/* ── Plan / billing ───────────────────────────────────────────── */}
              <section className="rounded-xl border border-[var(--border)] p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t('plan.title')}</span>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase"
                    style={entitlement.plan === 'free'
                      ? { background: 'var(--surface-2)', color: 'var(--text-muted)' }
                      : { background: 'rgba(94,106,210,0.15)', color: 'var(--accent)' }}
                  >
                    {entitlement.plan}
                  </span>
                </div>

                {entitlement.status === 'past_due' && (
                  <p className="text-[11px] leading-snug rounded-lg px-2 py-1.5" style={{ background: 'rgba(245,166,35,0.10)', color: '#F5A623' }}>
                    ! {t('plan.pastDue')}
                  </p>
                )}

                {entitlement.plan === 'free' ? (
                  <>
                    <ul className="text-[11px] text-[var(--text-muted)] leading-relaxed list-disc pl-4">
                      <li>{t('plan.benefitHistory')}</li>
                      <li>{t('plan.benefitSync')}</li>
                      <li>{t('plan.benefitBranding')}</li>
                    </ul>
                    <button
                      onClick={() => void handleCheckout()}
                      disabled={busy === 'checkout'}
                      className="self-start h-8 px-3 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-50"
                      style={{ background: 'var(--accent)', color: 'white' }}
                    >
                      {busy === 'checkout' ? t('plan.redirecting') : t('plan.upgrade')}
                    </button>
                  </>
                ) : (
                  <button onClick={() => void handlePortal()} disabled={busy === 'portal'} className={`self-start ${smallBtn}`}>
                    {busy === 'portal' ? t('plan.redirecting') : t('plan.manage')}
                  </button>
                )}
              </section>

              {/* ── API keys ─────────────────────────────────────────────────── */}
              <section className="rounded-xl border border-[var(--border)] p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t('keys.title')}</span>
                  <button onClick={() => void handleCreateKey()} disabled={busy === 'create' || !isCloudEnabled()} className={smallBtn}>
                    {busy === 'create' ? t('keys.creating') : t('keys.create')}
                  </button>
                </div>
                <p className="text-[10px] text-[var(--text-muted)] leading-snug">{t('keys.hint')}</p>

                {newKey && (
                  <div className="rounded-lg border p-2 flex flex-col gap-1.5" style={{ borderColor: 'rgba(76,175,130,0.4)', background: 'rgba(76,175,130,0.06)' }}>
                    <p className="text-[10px] font-medium" style={{ color: 'var(--ok, #4caf82)' }}>✓ {t('keys.createdOnce')}</p>
                    <div className="flex items-center gap-1.5">
                      <code className="flex-1 truncate font-mono text-[10px] text-[var(--text)] px-2 py-1 rounded bg-[var(--surface-2)] border border-[var(--border)]">
                        {newKey.key}
                      </code>
                      <button onClick={() => void copyKey(newKey.key)} className={smallBtn}>
                        {copied ? t('keys.copied') : t('keys.copy')}
                      </button>
                    </div>
                  </div>
                )}

                {keys.phase === 'loading' && <p className="text-[11px] text-[var(--text-muted)]">{t('keys.loading')}</p>}
                {keys.phase === 'error' && (
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {keys.code === 'cloud_disabled' || keys.code === 'service_disabled' ? t('keys.disabled') : t('errors.generic')}
                  </p>
                )}
                {keys.phase === 'ready' && keys.keys.length === 0 && !newKey && (
                  <p className="text-[11px] text-[var(--text-muted)]">{t('keys.empty')}</p>
                )}
                {keys.phase === 'ready' && keys.keys.map((k) => (
                  <div key={k.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-[var(--border)]">
                    <code className="font-mono text-[11px] text-[var(--text)]">{k.prefix}…</code>
                    <span className="flex-1 text-[10px] text-[var(--text-muted)] truncate">
                      {new Date(k.created_at).toLocaleDateString()}
                      {k.last_used_at ? ` · ${t('keys.lastUsed')} ${new Date(k.last_used_at).toLocaleDateString()}` : ''}
                    </span>
                    <button onClick={() => void handleRevoke(k.id)} disabled={busy === k.id}
                      className="h-6 px-2 rounded text-[10px] font-medium border border-[var(--border)] text-[var(--danger,#e5534b)] hover:border-[var(--danger,#e5534b)] transition-colors disabled:opacity-40">
                      {t('keys.revoke')}
                    </button>
                  </div>
                ))}
              </section>

              {/* ── Certificate history (F2 P7) ──────────────────────────────── */}
              <section className="rounded-xl border border-[var(--border)] p-3 flex flex-col gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{t('history.title')}</span>
                <p className="text-[10px] text-[var(--text-muted)] leading-snug">{t('history.hint')}</p>
                {history.phase === 'loading' && <p className="text-[11px] text-[var(--text-muted)]">{t('history.loading')}</p>}
                {history.phase === 'error' && <p className="text-[11px] text-[var(--text-muted)]">{t('errors.generic')}</p>}
                {history.phase === 'ready' && history.items.length === 0 && (
                  <p className="text-[11px] text-[var(--text-muted)]">{t('history.empty')}</p>
                )}
                {history.phase === 'ready' && history.items.map((c) => (
                  <div key={c.cert_hash} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-[var(--border)]">
                    <span className="text-[13px] font-bold tabular-nums" style={{ color: c.payload.health_score >= 70 ? 'var(--ok, #4caf82)' : '#F5A623' }}>
                      {c.payload.health_score}
                    </span>
                    <span className="flex-1 text-[10px] text-[var(--text-muted)] truncate">
                      {new Date(c.created_at).toLocaleDateString()} · {c.cert_hash.slice(0, 10)}…
                      {c.status === 'revoked' ? ` · ${t('history.revoked')}` : ''}
                    </span>
                    <a href={c.verify_url} target="_blank" rel="noopener noreferrer"
                      className="h-6 px-2 grid place-items-center rounded text-[10px] font-medium border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] transition-colors">
                      {t('history.view')}
                    </a>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
