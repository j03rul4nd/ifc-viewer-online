// ─── DashboardView ────────────────────────────────────────────────────────────
// /dashboard — the full-page account surface (F2). A roomier home for what the
// compact AccountModal already shows: plan, certificate history, API keys and
// branding, laid out as an overview with stat tiles.
//
// CLERK-FREE by design (I-1): like WelcomeView it lives in the main bundle and
// never imports @clerk/*. Session, token and sign-out come from
// cloudAccountStore; every server call goes through account-client (Result,
// never throws). Profile management links out to /account (the lazy auth
// chunk); billing uses full-page Stripe redirects.
//
//  · Anonymous → a sign-in CTA that routes to /sign-in.
//  · Signed in → live overview wired to the same endpoints as AccountModal.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCloudAccountStore } from '../../stores/cloudAccountStore'
import { useEntitlement } from '../../hooks/useEntitlement'
import { isCloudEnabled } from '../../lib/cloud/api-client'
import {
  createApiKey, createCheckout, createPortal as createBillingPortal,
  listApiKeys, revokeApiKey, listCertificates,
  getBranding, putBranding, deleteBranding, MAX_LOGO_BYTES,
  type ApiKeySummary, type CreatedApiKey, type HistoryCertificate,
} from '../../lib/cloud/account-client'
import { trackCheckoutStarted } from '../../lib/analytics'
import { toast } from '../../stores/toastStore'

interface DashboardViewProps {
  onNavigateHome: () => void
  onOpenViewer: () => void
  /** Navigate the SPA to a path (pushState + popstate) — used for /sign-in,
   *  /account and /admin without importing the router. */
  onNavigate: (path: string) => void
  isAdmin?: boolean
  theme?: 'dark' | 'light'
}

const LOGO_MIME = /^image\/(png|jpeg|webp)$/

// ── Icons (SVG stroke, no emoji — design system) ──────────────────────────────
const ic = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const CertIcon = () => (<svg {...ic} aria-hidden><path d="M12 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /><path d="M9 14.5 8 21l4-2 4 2-1-6.5" /></svg>)
const ScoreIcon = () => (<svg {...ic} aria-hidden><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>)
const KeyIcon = () => (<svg {...ic} aria-hidden><path d="M15 7a4 4 0 1 0-3.9 5H14v2h2v2h3v-3.1A4 4 0 0 0 15 7Z" /><circle cx="15" cy="7" r="0.6" /></svg>)
const PlanIcon = () => (<svg {...ic} aria-hidden><path d="m12 2 2.4 5 5.6.6-4 4 1 5.4L12 19l-5 3 1-5.4-4-4 5.6-.6L12 2Z" /></svg>)

export default function DashboardView({ onNavigateHome, onOpenViewer, onNavigate, isAdmin, theme = 'dark' }: DashboardViewProps) {
  const { t } = useTranslation('pro')
  const status = useCloudAccountStore((s) => s.status)
  const email = useCloudAccountStore((s) => s.email)
  const getToken = useCloudAccountStore((s) => s.getToken)
  const signOut = useCloudAccountStore((s) => s.signOut)
  const entitlement = useEntitlement()
  const light = theme === 'light'

  const [keys, setKeys] = useState<{ phase: 'loading' | 'error' | 'ready'; keys?: ApiKeySummary[]; code?: string }>({ phase: 'loading' })
  const [newKey, setNewKey] = useState<CreatedApiKey | null>(null)
  const [history, setHistory] = useState<{ phase: 'loading' | 'error' | 'ready'; items?: HistoryCertificate[] }>({ phase: 'loading' })
  const [branding, setBranding] = useState<{ phase: 'loading' | 'error' | 'ready'; logo?: string | null }>({ phase: 'loading' })
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadKeys = useCallback(async () => {
    const token = await getToken?.(); if (!token) return
    const r = await listApiKeys(token)
    setKeys(r.ok ? { phase: 'ready', keys: r.value.keys } : { phase: 'error', code: r.error.code })
  }, [getToken])
  const loadHistory = useCallback(async () => {
    const token = await getToken?.(); if (!token) return
    const r = await listCertificates(token)
    setHistory(r.ok ? { phase: 'ready', items: r.value.certificates } : { phase: 'error' })
  }, [getToken])
  const loadBranding = useCallback(async () => {
    const token = await getToken?.(); if (!token) return
    const r = await getBranding(token)
    setBranding(r.ok ? { phase: 'ready', logo: r.value.logo } : { phase: 'error' })
  }, [getToken])

  useEffect(() => {
    if (status !== 'signed-in') return
    void entitlement.refresh(); void loadKeys(); void loadHistory(); void loadBranding()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const stats = useMemo(() => {
    const items = history.phase === 'ready' ? history.items ?? [] : []
    const scores = items.map((c) => c.payload.health_score).filter((n) => typeof n === 'number')
    return {
      count: items.length,
      avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      best: scores.length ? Math.max(...scores) : null,
      keyCount: keys.phase === 'ready' ? keys.keys!.length : null,
    }
  }, [history, keys])

  const handleCreateKey = async () => {
    const token = await getToken?.(); if (!token) return
    setBusy('create'); const r = await createApiKey(token); setBusy(null)
    if (r.ok) { setNewKey(r.value); void loadKeys() }
    else if (r.error.code === 'quota_exceeded') toast(t('keys.quota'), 'warning', { duration: 6000 })
    else toast(t('errors.generic'), 'error')
  }
  const handleRevoke = async (id: string) => {
    const token = await getToken?.(); if (!token) return
    setBusy(id); const r = await revokeApiKey(token, id); setBusy(null)
    if (r.ok) { if (newKey?.id === id) setNewKey(null); void loadKeys() }
    else toast(t('errors.generic'), 'error')
  }
  const handleCheckout = async () => {
    const token = await getToken?.(); if (!token) return
    setBusy('checkout'); trackCheckoutStarted({ interval: 'month' })
    const r = await createCheckout(token, 'month'); setBusy(null)
    if (r.ok) window.location.href = r.value.url
    else toast(r.error.code === 'service_disabled' ? t('billing.notYet') : t('errors.generic'), r.error.code === 'service_disabled' ? 'info' : 'error', { duration: 6000 })
  }
  const handlePortal = async () => {
    const token = await getToken?.(); if (!token) return
    setBusy('portal'); const r = await createBillingPortal(token); setBusy(null)
    if (r.ok) window.location.href = r.value.url
    else toast(r.error.code === 'service_disabled' ? t('billing.notYet') : t('errors.generic'), 'error')
  }
  const handleLogoFile = async (file: File) => {
    if (!LOGO_MIME.test(file.type)) { toast(t('branding.badType'), 'warning'); return }
    if (file.size > MAX_LOGO_BYTES) { toast(t('branding.tooBig', { kb: Math.round(MAX_LOGO_BYTES / 1024) }), 'warning'); return }
    const dataUrl = await new Promise<string>((res, rej) => { const rd = new FileReader(); rd.onload = () => res(rd.result as string); rd.onerror = () => rej(new Error('x')); rd.readAsDataURL(file) }).catch(() => null)
    if (!dataUrl) { toast(t('errors.generic'), 'error'); return }
    const token = await getToken?.(); if (!token) return
    setBusy('logo'); const r = await putBranding(token, dataUrl); setBusy(null)
    if (r.ok) setBranding({ phase: 'ready', logo: dataUrl })
    else if (r.error.code === 'upgrade_required') toast(t('branding.needsPro'), 'warning', { duration: 6000 })
    else toast(t('errors.generic'), 'error')
  }
  const handleRemoveLogo = async () => {
    const token = await getToken?.(); if (!token) return
    setBusy('logo'); const r = await deleteBranding(token); setBusy(null)
    if (r.ok) setBranding({ phase: 'ready', logo: null }); else toast(t('errors.generic'), 'error')
  }
  const copyKey = async (value: string) => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* stays visible */ } }

  // ── Materials (Apple vibrancy, theme-aware) ─────────────────────────────────
  const card = light
    ? { background: 'rgba(255,255,255,0.72)', borderColor: 'rgba(15,17,35,0.08)', boxShadow: '0 20px 50px -24px rgba(40,48,120,0.22)' }
    : { background: 'rgba(18,19,26,0.6)', borderColor: 'rgba(255,255,255,0.08)', boxShadow: '0 24px 70px -30px rgba(0,0,0,0.7)' }
  const scrim = light
    ? 'radial-gradient(90% 60% at 50% -10%, rgba(94,106,210,0.14), transparent 60%)'
    : 'radial-gradient(90% 60% at 50% -10%, rgba(94,106,210,0.22), transparent 60%)'

  const ghostBtn = 'h-9 px-3.5 rounded-lg text-[12px] font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const ghostStyle = { borderColor: 'var(--border)', color: 'var(--text)' }
  const proBadge = entitlement.plan === 'free'
  const chrome = `min-h-full w-full ${light ? 'lp-light' : ''}`

  return (
    <div className={chrome} style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="pointer-events-none fixed inset-0" aria-hidden style={{ background: scrim }} />

      <div className="relative z-10 mx-auto w-full max-w-[1040px] px-5 py-8 md:py-12">
        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <header className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <div className="min-w-0">
            <h1 className="text-[clamp(22px,3vw,30px)] font-semibold tracking-[-0.02em] leading-tight">{t('dashboard.title')}</h1>
            <p className="text-[13px] mt-0.5 truncate" style={{ color: 'var(--text-dim)' }}>
              {status === 'signed-in' && email ? `${t('dashboard.greeting')}, ${email}` : t('dashboard.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <button onClick={() => onNavigate('/admin')} className={ghostBtn} style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                {t('dashboard.admin')}
              </button>
            )}
            <button onClick={onOpenViewer} className={ghostBtn} style={ghostStyle}>{t('dashboard.openViewer')}</button>
            {status === 'signed-in'
              ? <button onClick={() => void signOut?.()} className={ghostBtn} style={ghostStyle}>{t('signOut')}</button>
              : <button onClick={onNavigateHome} className={ghostBtn} style={ghostStyle}>{t('backHome')}</button>}
          </div>
        </header>

        {status !== 'signed-in' ? (
          /* ── Anonymous ───────────────────────────────────────────────────── */
          <div className="rounded-[24px] border p-8 md:p-12 backdrop-blur-xl text-center flex flex-col items-center gap-4" style={card}>
            <div className="w-14 h-14 rounded-2xl grid place-items-center" style={{ color: 'white', background: 'linear-gradient(160deg, var(--accent), var(--accent-2))' }}><CertIcon /></div>
            <h2 className="text-[20px] font-semibold">{t('dashboard.signInTitle')}</h2>
            <p className="max-w-[46ch] text-[14px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>{t('dashboard.signInBody')}</p>
            <button
              onClick={() => onNavigate('/sign-in')}
              className="mt-2 h-11 px-6 rounded-full text-[14px] font-semibold text-white"
              style={{ background: 'linear-gradient(160deg, var(--accent), var(--accent-2))', boxShadow: '0 12px 30px -10px rgba(94,106,210,0.6)' }}
            >
              {status === 'loading' ? t('dashboard.loadingSession') : t('dashboard.signInCta')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* ── Stat tiles ─────────────────────────────────────────────────── */}
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <StatTile card={card} Icon={CertIcon} label={t('dashboard.statCertificates')} value={String(stats.count)} />
              <StatTile card={card} Icon={ScoreIcon} label={t('dashboard.statAvgScore')} value={stats.avg != null ? String(stats.avg) : t('dashboard.noScore')} accent={stats.avg != null && stats.avg >= 70} />
              <StatTile card={card} Icon={ScoreIcon} label={t('dashboard.statBestScore')} value={stats.best != null ? String(stats.best) : t('dashboard.noScore')} accent={stats.best != null && stats.best >= 70} />
              <StatTile card={card} Icon={KeyIcon} label={t('dashboard.statApiKeys')} value={stats.keyCount != null ? String(stats.keyCount) : t('dashboard.noScore')} />
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
              {/* ── Certificate history ──────────────────────────────────────── */}
              <section className="rounded-[20px] border p-5 backdrop-blur-xl" style={card}>
                <div className="flex items-center gap-2 mb-3"><span style={{ color: 'var(--accent-2)' }}><CertIcon /></span><h2 className="text-[14px] font-semibold">{t('history.title')}</h2></div>
                <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>{t('history.hint')}</p>
                {history.phase === 'loading' && <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{t('history.loading')}</p>}
                {history.phase === 'error' && <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{t('errors.generic')}</p>}
                {history.phase === 'ready' && history.items!.length === 0 && <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{t('history.empty')}</p>}
                {history.phase === 'ready' && history.items!.length > 0 && (
                  <ul className="flex flex-col gap-1.5">
                    {history.items!.map((c) => (
                      <li key={c.cert_hash} className="flex items-center gap-3 px-3 py-2 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                        <span className="text-[16px] font-bold tabular-nums w-9 text-center" style={{ color: c.payload.health_score >= 70 ? 'var(--ok, #4caf82)' : '#F5A623' }}>{c.payload.health_score}</span>
                        <span className="flex-1 min-w-0 text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                          {new Date(c.created_at).toLocaleDateString()} · <span className="font-mono">{c.cert_hash.slice(0, 12)}…</span>
                          {c.status === 'revoked' ? ` · ${t('history.revoked')}` : ''}
                        </span>
                        <a href={c.verify_url} target="_blank" rel="noopener noreferrer" className="h-7 px-2.5 grid place-items-center rounded-lg text-[11px] font-medium border" style={ghostStyle}>{t('history.view')}</a>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* ── Right column: plan + quick actions ───────────────────────── */}
              <div className="flex flex-col gap-5">
                <section className="rounded-[20px] border p-5 backdrop-blur-xl flex flex-col gap-3" style={card}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><span style={{ color: 'var(--accent-2)' }}><PlanIcon /></span><h2 className="text-[14px] font-semibold">{t('plan.title')}</h2></div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase" style={proBadge ? { background: 'var(--surface-2)', color: 'var(--text-muted)' } : { background: 'rgba(94,106,210,0.15)', color: 'var(--accent)' }}>{entitlement.plan}</span>
                  </div>
                  {entitlement.status === 'past_due' && <p className="text-[11px] rounded-lg px-2 py-1.5" style={{ background: 'rgba(245,166,35,0.10)', color: '#F5A623' }}>! {t('plan.pastDue')}</p>}
                  {proBadge ? (
                    <>
                      <ul className="text-[11px] leading-relaxed list-disc pl-4" style={{ color: 'var(--text-muted)' }}>
                        <li>{t('plan.benefitHistory')}</li><li>{t('plan.benefitSync')}</li><li>{t('plan.benefitBranding')}</li>
                      </ul>
                      <button onClick={() => void handleCheckout()} disabled={busy === 'checkout'} className="self-start h-9 px-4 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>{busy === 'checkout' ? t('plan.redirecting') : t('plan.upgrade')}</button>
                    </>
                  ) : (
                    <button onClick={() => void handlePortal()} disabled={busy === 'portal'} className={`self-start ${ghostBtn}`} style={ghostStyle}>{busy === 'portal' ? t('plan.redirecting') : t('dashboard.manageBilling')}</button>
                  )}
                </section>

                <section className="rounded-[20px] border p-5 backdrop-blur-xl flex flex-col gap-2" style={card}>
                  <h2 className="text-[14px] font-semibold mb-1">{t('dashboard.quickActions')}</h2>
                  <button onClick={() => onNavigate('/account')} className={`${ghostBtn} justify-start text-left`} style={ghostStyle}>{t('manageProfile')}</button>
                  <button onClick={onOpenViewer} className={`${ghostBtn} justify-start text-left`} style={ghostStyle}>{t('dashboard.openViewer')}</button>
                </section>
              </div>
            </div>

            {/* ── API keys ─────────────────────────────────────────────────────── */}
            <section className="rounded-[20px] border p-5 backdrop-blur-xl" style={card}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2"><span style={{ color: 'var(--accent-2)' }}><KeyIcon /></span><h2 className="text-[14px] font-semibold">{t('keys.title')}</h2></div>
                <button onClick={() => void handleCreateKey()} disabled={busy === 'create' || !isCloudEnabled()} className={ghostBtn} style={ghostStyle}>{busy === 'create' ? t('keys.creating') : t('keys.create')}</button>
              </div>
              <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>{t('keys.hint')}</p>
              {newKey && (
                <div className="rounded-lg border p-2.5 flex items-center gap-2 mb-2" style={{ borderColor: 'rgba(76,175,130,0.4)', background: 'rgba(76,175,130,0.06)' }}>
                  <code className="flex-1 truncate font-mono text-[11px] px-2 py-1 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>{newKey.key}</code>
                  <button onClick={() => void copyKey(newKey.key)} className={ghostBtn} style={ghostStyle}>{copied ? t('keys.copied') : t('keys.copy')}</button>
                </div>
              )}
              {keys.phase === 'loading' && <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{t('keys.loading')}</p>}
              {keys.phase === 'error' && <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{keys.code === 'cloud_disabled' || keys.code === 'service_disabled' ? t('keys.disabled') : t('errors.generic')}</p>}
              {keys.phase === 'ready' && keys.keys!.length === 0 && !newKey && <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{t('keys.empty')}</p>}
              {keys.phase === 'ready' && keys.keys!.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {keys.keys!.map((k) => (
                    <li key={k.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                      <code className="font-mono text-[11px]" style={{ color: 'var(--text)' }}>{k.prefix}…</code>
                      <span className="flex-1 text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{new Date(k.created_at).toLocaleDateString()}{k.last_used_at ? ` · ${t('keys.lastUsed')} ${new Date(k.last_used_at).toLocaleDateString()}` : ''}</span>
                      <button onClick={() => void handleRevoke(k.id)} disabled={busy === k.id} className="h-7 px-2 rounded-lg text-[10px] font-medium border" style={{ borderColor: 'var(--border)', color: 'var(--danger,#e5534b)' }}>{t('keys.revoke')}</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── Branding ─────────────────────────────────────────────────────── */}
            <section className="rounded-[20px] border p-5 backdrop-blur-xl" style={card}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2"><span style={{ color: 'var(--accent-2)' }}><PlanIcon /></span><h2 className="text-[14px] font-semibold">{t('branding.title')}</h2></div>
                <label className={`${ghostBtn} grid place-items-center ${proBadge || busy === 'logo' ? 'opacity-40 pointer-events-none' : 'cursor-pointer'}`} style={ghostStyle}>
                  {busy === 'logo' ? t('branding.uploading') : t('branding.upload')}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={proBadge || busy === 'logo'} onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleLogoFile(f); e.target.value = '' }} />
                </label>
              </div>
              <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>{proBadge ? t('branding.needsPro') : t('branding.hint')}</p>
              {branding.phase === 'ready' && branding.logo && (
                <div className="flex items-center gap-3">
                  <img src={branding.logo} alt="" className="max-h-12 max-w-[180px] object-contain rounded bg-white p-1.5" />
                  <button onClick={() => void handleRemoveLogo()} disabled={busy === 'logo'} className="h-7 px-2.5 rounded-lg text-[11px] font-medium border" style={{ borderColor: 'var(--border)', color: 'var(--danger,#e5534b)' }}>{t('branding.remove')}</button>
                </div>
              )}
              {branding.phase === 'ready' && !branding.logo && !proBadge && <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{t('branding.empty', { kb: Math.round(MAX_LOGO_BYTES / 1024) })}</p>}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Stat tile ─────────────────────────────────────────────────────────────────
function StatTile({ card, Icon, label, value, accent }: { card: React.CSSProperties; Icon: () => React.JSX.Element; label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[18px] border p-4 backdrop-blur-xl flex flex-col gap-2" style={card}>
      <span className="grid place-items-center w-8 h-8 rounded-[10px]" style={{ color: 'var(--accent-2)', background: 'rgba(94,106,210,0.10)' }}><Icon /></span>
      <span className="text-[26px] font-semibold tabular-nums leading-none" style={accent ? { color: 'var(--ok, #4caf82)' } : { color: 'var(--text)' }}>{value}</span>
      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}
