// ─── DashboardView ────────────────────────────────────────────────────────────
// /dashboard — the account home. Whoever lands here signed up on purpose, so the
// page does three jobs, in this order: show what they can do right now, show
// what they have, and (on Free) show plainly what Pro and Team add.
//
// One variant per state (see `pageState`): anonymous · free_empty · free_active
// · pro · team · past_due. Rules the layout keeps:
//   · never a tile at 0 or a generic error: missing data hides its block, and a
//     cloud that is off is the normal production state, not a failure;
//   · one primary button per screen;
//   · locked features say what they give and link to the plan, no greyed-out
//     buttons;
//   · API keys, branding and billing live in the Settings tab.
//
// CLERK-FREE by design (I-1): it lives in the main bundle and never imports
// @clerk/*. Session, token and sign-out come from cloudAccountStore; every
// server call goes through account-client (Result, never throws). Colours are
// tokens only (--bg, --surface, --border, --text*, --accent, --ok, --warn,
// --danger), so `.lp-light` flips the whole page.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCloudAccountStore, openFeatureRequest } from '../../stores/cloudAccountStore'
import { useEntitlement } from '../../hooks/useEntitlement'
import { isCloudEnabled } from '../../lib/cloud/api-client'
import {
  createApiKey, createCheckout, createPortal as createBillingPortal,
  listApiKeys, revokeApiKey, listCertificates,
  getBranding, putBranding, deleteBranding, MAX_LOGO_BYTES,
  type ApiKeySummary, type CreatedApiKey, type HistoryCertificate,
} from '../../lib/cloud/account-client'
import { planDef } from '../../lib/plans/plans'
import { fmtEur } from '../../lib/pricing/checkout'
import { pricingPath } from '../../lib/pricing/pricing-paths'
import { trackCheckoutStarted, trackDashboardCta } from '../../lib/analytics'
import { toast } from '../../stores/toastStore'
import { pageState, type DashboardState } from './dashboard-state'

interface DashboardViewProps {
  onNavigateHome: () => void
  onOpenViewer: () => void
  /** Navigate the SPA to a path (pushState + popstate) — used for /sign-in,
   *  /account, /call and /admin without importing the router. */
  onNavigate: (path: string) => void
  isAdmin?: boolean
  theme?: 'dark' | 'light'
}

type Tab = 'overview' | 'settings'
type Cta = Parameters<typeof trackDashboardCta>[0]['cta']

const LOGO_MIME = /^image\/(png|jpeg|webp)$/
const SCORE_OK = 70
const RECENT = 5

// ── Shared styles (tokens only) ───────────────────────────────────────────────
const S = {
  panel: { background: 'var(--surface)', borderColor: 'var(--border)' } as React.CSSProperties,
  dim: { color: 'var(--text-dim)' } as React.CSSProperties,
  faint: { color: 'var(--text-faint)' } as React.CSSProperties,
  secondary: { borderColor: 'var(--border)', color: 'var(--text)', background: 'transparent' } as React.CSSProperties,
  primary: { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } as React.CSSProperties,
}
const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:[outline-color:var(--accent)]'
const btn = `inline-flex items-center justify-center h-9 px-3.5 rounded-md text-[13px] font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${focus}`
const link = `text-[13px] font-medium underline-offset-4 hover:underline rounded-sm ${focus}`

const ic = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const Check = () => (<svg {...ic} aria-hidden><path d="m5 12 5 5 9-10" /></svg>)
const Arrow = () => (<svg {...ic} width={14} height={14} aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>)

function PlanCol({ name, price, note, items, currentLabel, soonLabel }: { name: string; price: string; note: string; items: [string, boolean][]; currentLabel?: string; soonLabel: string }) {
  return (
    <div className="p-5 flex flex-col gap-3" style={{ background: 'var(--surface)' }}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold">{name}</h3>
        {currentLabel && <span className="text-[11px] font-medium px-2 py-0.5 rounded border" style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}>{currentLabel}</span>}
      </div>
      <p><span className="text-[22px] font-semibold tabular-nums">{price}</span><span className="block text-[11px] mt-0.5" style={S.faint}>{note}</span></p>
      <ul className="flex flex-col gap-2">
        {items.map(([label, soon]) => (
          <li key={label} className="flex gap-2 text-[12px] leading-snug" style={S.dim}>
            <span className="mt-px shrink-0" style={{ color: soon ? 'var(--text-faint)' : 'var(--ok)' }}><Check /></span>
            <span>{label}{soon && <span className="ml-1.5 text-[10px] font-medium uppercase tracking-[0.04em] px-1 py-px rounded border whitespace-nowrap" style={{ borderColor: 'var(--border)', color: 'var(--text-faint)' }}>{soonLabel}</span>}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Locked({ title, body, cta, onClick }: { title: string; body: string; cta: string; onClick: () => void }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 max-w-[60ch]">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        <p className="text-[12px] mt-1 leading-relaxed" style={S.dim}>{body}</p>
      </div>
      <button onClick={onClick} className={`${link} inline-flex items-center gap-1`} style={{ color: 'var(--dash-link)' }}>{cta} <Arrow /></button>
    </div>
  )
}

export default function DashboardView({ onNavigateHome, onOpenViewer, onNavigate, isAdmin, theme = 'dark' }: DashboardViewProps) {
  const { t, i18n } = useTranslation('pro')
  const status = useCloudAccountStore((s) => s.status)
  const email = useCloudAccountStore((s) => s.email)
  const getToken = useCloudAccountStore((s) => s.getToken)
  const signOut = useCloudAccountStore((s) => s.signOut)
  const entitlement = useEntitlement()
  const cloud = isCloudEnabled()

  const [tab, setTab] = useState<Tab>('overview')
  const [keys, setKeys] = useState<{ phase: 'loading' | 'off' | 'ready'; keys?: ApiKeySummary[] }>({ phase: 'loading' })
  const [newKey, setNewKey] = useState<CreatedApiKey | null>(null)
  const [history, setHistory] = useState<{ phase: 'loading' | 'off' | 'ready'; items: HistoryCertificate[] }>({ phase: 'loading', items: [] })
  const [branding, setBranding] = useState<{ phase: 'loading' | 'off' | 'ready'; logo?: string | null }>({ phase: 'loading' })
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const signedIn = status === 'signed-in'
  const isPaid = entitlement.plan !== 'free'

  // Any failure here means "not available yet" — production runs with the
  // cloud off — so it hides the block instead of printing an error.
  const loadHistory = useCallback(async () => {
    const token = await getToken?.(); if (!token) { setHistory({ phase: 'off', items: [] }); return }
    const r = await listCertificates(token)
    setHistory(r.ok ? { phase: 'ready', items: [...r.value.certificates].sort((a, b) => b.created_at.localeCompare(a.created_at)) } : { phase: 'off', items: [] })
  }, [getToken])
  const loadKeys = useCallback(async () => {
    const token = await getToken?.(); if (!token) return
    const r = await listApiKeys(token)
    setKeys(r.ok ? { phase: 'ready', keys: r.value.keys } : { phase: 'off' })
  }, [getToken])
  const loadBranding = useCallback(async () => {
    const token = await getToken?.(); if (!token) return
    const r = await getBranding(token)
    setBranding(r.ok ? { phase: 'ready', logo: r.value.logo } : { phase: 'off' })
  }, [getToken])

  useEffect(() => {
    if (!signedIn) return
    void entitlement.refresh(); void loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn])
  // Settings data only when it can be used (paid) and only once the tab opens.
  useEffect(() => {
    if (!signedIn || tab !== 'settings' || !isPaid) return
    void loadKeys(); void loadBranding()
  }, [signedIn, tab, isPaid, loadKeys, loadBranding])

  const certs = history.items
  const state: DashboardState = pageState(status, entitlement.plan, entitlement.status, certs.length)
  const cta = (c: Cta) => trackDashboardCta({ cta: c, state })

  const lang = i18n.language || undefined
  const prices = useMemo(() => {
    const pro = planDef('pro'), team = planDef('team')
    return {
      pro: fmtEur(Math.round((pro.yearlyEur ?? 0) / 12), lang), proMonthly: fmtEur(pro.monthlyEur ?? 0, lang),
      team: fmtEur(Math.round((team.yearlyEur ?? 0) / 12), lang), teamMonthly: fmtEur(team.monthlyEur ?? 0, lang),
      teamMin: team.minUnits ?? 3,
    }
  }, [lang])
  const pricing = (role: 'solo' | 'team') => `${pricingPath((i18n.language ?? 'en').slice(0, 2))}?role=${role}`

  const openViewer = () => { cta('open_viewer'); onOpenViewer() }
  const handleCheckout = async () => {
    cta('checkout')
    // Payments not open (no cloud, or billing switched off): the waiting list
    // on /pricing/ is the honest next step, never a dead-end toast.
    const toWaitlist = () => { toast(t('dash.plan.waitlist'), 'info', { duration: 5000 }); window.location.href = pricing('solo') }
    const token = await getToken?.()
    if (!token || !cloud) { toWaitlist(); return }
    setBusy('checkout'); trackCheckoutStarted({ interval: 'year' })
    const r = await createCheckout(token, 'year'); setBusy(null)
    if (r.ok) window.location.href = r.value.url
    else if (r.error.code === 'service_disabled' || r.error.code === 'cloud_disabled') toWaitlist()
    else toast(t('errors.generic'), 'error')
  }
  const handlePortal = async () => {
    cta('billing_portal')
    const token = await getToken?.(); if (!token) return
    setBusy('portal'); const r = await createBillingPortal(token); setBusy(null)
    if (r.ok) window.location.href = r.value.url
    else toast(r.error.code === 'service_disabled' || r.error.code === 'cloud_disabled' ? t('billing.notYet') : t('errors.generic'), 'info', { duration: 6000 })
  }
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
  const handleLogoFile = async (file: File) => {
    if (!LOGO_MIME.test(file.type)) { toast(t('branding.badType'), 'warning'); return }
    if (file.size > MAX_LOGO_BYTES) { toast(t('branding.tooBig', { kb: Math.round(MAX_LOGO_BYTES / 1024) }), 'warning'); return }
    const dataUrl = await new Promise<string>((res, rej) => { const rd = new FileReader(); rd.onload = () => res(rd.result as string); rd.onerror = () => rej(new Error('read')); rd.readAsDataURL(file) }).catch(() => null)
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
  const copyKey = async (value: string) => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* key stays visible */ } }
  const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return iso.slice(0, 10) } }
  const goPlan = () => { cta('locked_feature'); setTab('overview'); requestAnimationFrame(() => document.getElementById('dash-plan')?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }
  const scoreColor = (n: number) => (n >= SCORE_OK ? 'var(--ok)' : 'var(--warn)')

  const planLabel = { free: 'Free', pro: 'Pro', org: 'Team' }[entitlement.plan]

  // ── Overview blocks ─────────────────────────────────────────────────────────
  const continueBlock = certs.length > 0 && (
    <section className="rounded-lg border p-5" style={S.panel} aria-labelledby="dash-cont">
      <h2 id="dash-cont" className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={S.faint}>{t('dash.cont.title')}</h2>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="text-[40px] font-semibold leading-none tabular-nums" style={{ color: scoreColor(certs[0].payload.health_score) }}>{certs[0].payload.health_score}</span>
          <div>
            <p className="text-[14px] font-medium">{t('dash.cont.last')}</p>
            <p className="text-[12px]" style={S.dim}>{t('dash.cont.issued', { date: fmtDate(certs[0].created_at) })}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a href={certs[0].verify_url} target="_blank" rel="noopener noreferrer" onClick={() => cta('view_certificate')} className={btn} style={S.secondary}>{t('dash.cont.view')}</a>
          {/* On Free the plan block owns the primary button. */}
          <button onClick={openViewer} className={btn} style={state === 'free_active' ? S.secondary : S.primary}>{t('dash.cont.validate')}</button>
        </div>
      </div>
      {certs.length > 1 && (
        <div className="mt-5">
          <h3 className="text-[12px] font-medium" style={S.dim}>{t('dash.cont.recent')}</h3>
          <ul className="mt-1 divide-y" style={{ borderColor: 'var(--border)' }}>
            {certs.slice(1, RECENT + 1).map((c) => (
              <li key={c.cert_hash} className="flex items-center gap-3 py-2.5" style={{ borderColor: 'var(--border)' }}>
                <span className="w-9 text-[15px] font-semibold tabular-nums" style={{ color: scoreColor(c.payload.health_score) }}>{c.payload.health_score}</span>
                <span className="flex-1 min-w-0 text-[12px] truncate" style={S.dim}>
                  {fmtDate(c.created_at)} · <span className="font-mono" style={S.faint}>{c.cert_hash.slice(0, 10)}</span>
                  {c.status === 'revoked' ? ` · ${t('history.revoked')}` : ''}
                </span>
                <a href={c.verify_url} target="_blank" rel="noopener noreferrer" onClick={() => cta('view_certificate')} className={link} style={{ color: 'var(--dash-link)' }}
                  aria-label={t('dash.cont.viewAria', { score: c.payload.health_score, date: fmtDate(c.created_at) })}>{t('history.view')}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )

  const startBlock = (
    <section className="rounded-lg border p-5 md:p-6" style={S.panel} aria-labelledby="dash-start">
      <h2 id="dash-start" className="text-[17px] font-semibold">{t('dash.start.title')}</h2>
      <p className="mt-1 text-[13px]" style={S.dim}>{t('dash.start.sub')}</p>
      <ol className="mt-4 grid gap-px rounded-md overflow-hidden border md:grid-cols-3" style={{ borderColor: 'var(--border)', background: 'var(--border)' }}>
        {([1, 2, 3] as const).map((n) => (
          <li key={n} className="p-4 flex gap-3" style={{ background: 'var(--surface)' }}>
            <span className="shrink-0 grid place-items-center w-6 h-6 rounded-full border text-[12px] font-semibold tabular-nums" style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }} aria-hidden>{n}</span>
            <div>
              <p className="text-[13px] font-medium">{t(`dash.start.s${n}t` as const)}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed" style={S.dim}>{t(`dash.start.s${n}d` as const)}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button onClick={openViewer} className={btn} style={S.primary}>{t('dash.start.cta')}</button>
        <span className="text-[12px]" style={S.faint}>{t('dash.start.private')}</span>
      </div>
    </section>
  )

  const planBlock = (
    <section id="dash-plan" className="rounded-lg border overflow-hidden scroll-mt-6" style={S.panel} aria-labelledby="dash-plan-h">
      <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
        <h2 id="dash-plan-h" className="text-[17px] font-semibold">{t('dash.plan.title')}</h2>
        <p className="mt-1 text-[13px]" style={S.dim}>{t('dash.plan.sub')}</p>
      </div>
      <div className="grid gap-px md:grid-cols-3" style={{ background: 'var(--border)' }}>
        <PlanCol name="Free" price={fmtEur(0, lang)} note={t('dash.plan.freeNote')} currentLabel={t('dash.plan.current')} soonLabel={t('dash.plan.soon')}
          items={[[t('dash.plan.free1'), false], [t('dash.plan.free2'), false], [t('dash.plan.free3'), false], [t('dash.plan.free4'), false]]} />
        <PlanCol name="Pro" price={t('dash.plan.perMonth', { amount: prices.pro })} note={t('dash.plan.proNote', { amount: prices.proMonthly })} soonLabel={t('dash.plan.soon')}
          items={[[t('dash.plan.pro1'), false], [t('dash.plan.pro2'), false], [t('dash.plan.pro3'), true], [t('dash.plan.pro4'), true], [t('dash.plan.pro5'), true]]} />
        <PlanCol name="Team" price={t('dash.plan.perEditor', { amount: prices.team })} note={t('dash.plan.teamNote', { amount: prices.teamMonthly, min: prices.teamMin })} soonLabel={t('dash.plan.soon')}
          items={[[t('dash.plan.team1'), false], [t('dash.plan.team2'), true], [t('dash.plan.team3'), true], [t('dash.plan.team4'), true]]} />
      </div>
      <div className="p-5 border-t flex flex-wrap items-center gap-x-5 gap-y-3" style={{ borderColor: 'var(--border)' }}>
        {/* Free with history: the plan is the next step, so it gets the primary button. */}
        <button onClick={() => void handleCheckout()} disabled={busy === 'checkout'} className={btn} style={state === 'free_active' ? S.primary : S.secondary}>
          {busy === 'checkout' ? t('plan.redirecting') : t('dash.plan.cta')}
        </button>
        <a href={pricing('solo')} onClick={() => cta('compare_plans')} className={`${link} inline-flex items-center gap-1`} style={{ color: 'var(--text)' }}>{t('dash.plan.compare')} <Arrow /></a>
        <a href={pricing('team')} onClick={() => cta('compare_plans')} className={link} style={S.dim}>{t('dash.plan.forTeams')}</a>
        <button onClick={() => { cta('call'); onNavigate('/call') }} className={link} style={S.dim}>{t('dash.plan.call')}</button>
      </div>
    </section>
  )

  const feedbackLine = (
    <section className="rounded-lg border px-5 py-4 flex flex-wrap items-center justify-between gap-3" style={S.panel} aria-labelledby="dash-fb">
      <div className="min-w-0">
        <h2 id="dash-fb" className="text-[14px] font-semibold">{t('dash.fb.title')}</h2>
        <p className="text-[12px] mt-0.5" style={S.dim}>{t('dash.fb.body')}</p>
      </div>
      <button onClick={() => { cta('feature_request'); openFeatureRequest('dashboard') }} className={btn} style={S.secondary}>{t('dash.fb.cta')}</button>
    </section>
  )

  const teamUpsell = state === 'pro' && (
    <p className="text-[13px] px-1" style={S.dim}>
      {t('dash.team.upsell', { min: prices.teamMin })}{' '}
      <a href={pricing('team')} onClick={() => cta('team_upsell')} className={link} style={{ color: 'var(--dash-link)' }}>{t('dash.team.upsellCta')}</a>
    </p>
  )

  const overview = (() => {
    switch (state) {
      case 'free_empty': return <>{startBlock}{planBlock}{feedbackLine}</>
      case 'free_active': return <>{continueBlock}{planBlock}{feedbackLine}</>
      case 'past_due': return <>{continueBlock || startBlock}{feedbackLine}</>
      default: return <>{continueBlock || startBlock}{teamUpsell}{feedbackLine}</>
    }
  })()

  // ── Settings tab ────────────────────────────────────────────────────────────
  const settings = (
    <>
      {isPaid && (
        <section className="rounded-lg border p-5 flex flex-wrap items-center justify-between gap-3" style={S.panel} aria-labelledby="dash-bill">
          <div className="min-w-0">
            <h2 id="dash-bill" className="text-[14px] font-semibold">{state === 'team' ? t('dash.team.title') : t('dash.billing.title')}</h2>
            <p className="text-[12px] mt-1" style={S.dim}>{state === 'team' ? t('dash.team.body') : t('dash.billing.body')}</p>
          </div>
          <button onClick={() => void handlePortal()} disabled={busy === 'portal'} className={btn} style={S.secondary}>
            {busy === 'portal' ? t('plan.redirecting') : state === 'team' ? t('dash.team.cta') : t('dash.billing.cta')}
          </button>
        </section>
      )}

      <section className="rounded-lg border p-5" style={S.panel} aria-labelledby={isPaid ? 'dash-brand' : undefined}>
        {!isPaid ? <Locked title={t('dash.locked.logoTitle')} body={t('dash.locked.logoBody')} cta={t('dash.locked.cta')} onClick={goPlan} /> : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="dash-brand" className="text-[14px] font-semibold">{t('branding.title')}</h2>
              {branding.phase === 'ready' && (
                <label className={`${btn} ${busy === 'logo' ? 'opacity-50 pointer-events-none' : 'cursor-pointer'} focus-within:outline focus-within:outline-2`} style={S.secondary}>
                  {busy === 'logo' ? t('branding.uploading') : t('branding.upload')}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy === 'logo'} onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleLogoFile(f); e.target.value = '' }} />
                </label>
              )}
            </div>
            <p className="text-[12px] mt-1" style={S.dim}>{branding.phase === 'off' ? t('dash.settings.later') : t('branding.hint')}</p>
            {branding.phase === 'ready' && (branding.logo ? (
              <div className="mt-3 flex items-center gap-3">
                <img src={branding.logo} alt={t('dash.settings.logoAlt')} className="max-h-12 max-w-[180px] object-contain rounded bg-white p-1.5 border" style={{ borderColor: 'var(--border)' }} />
                <button onClick={() => void handleRemoveLogo()} disabled={busy === 'logo'} className={btn} style={{ ...S.secondary, color: 'var(--danger)' }}>{t('branding.remove')}</button>
              </div>
            ) : <p className="mt-3 text-[12px]" style={S.faint}>{t('branding.empty', { kb: Math.round(MAX_LOGO_BYTES / 1024) })}</p>)}
          </>
        )}
      </section>

      <section className="rounded-lg border p-5" style={S.panel} aria-labelledby={isPaid ? 'dash-keys' : undefined}>
        {!isPaid ? <Locked title={t('dash.locked.apiTitle')} body={t('dash.locked.apiBody')} cta={t('dash.locked.cta')} onClick={goPlan} /> : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="dash-keys" className="text-[14px] font-semibold">{t('keys.title')}</h2>
              {keys.phase === 'ready' && <button onClick={() => void handleCreateKey()} disabled={busy === 'create'} className={btn} style={S.secondary}>{busy === 'create' ? t('keys.creating') : t('keys.create')}</button>}
            </div>
            <p className="text-[12px] mt-1" style={S.dim}>{keys.phase === 'off' ? t('dash.settings.later') : t('keys.hint')}</p>
            {newKey && (
              <div className="mt-3 rounded-md border p-2.5 flex items-center gap-2" style={{ borderColor: 'var(--ok)' }} role="status">
                <code className="flex-1 truncate font-mono text-[12px] px-2 py-1 rounded" style={{ background: 'var(--surface-2)' }}>{newKey.key}</code>
                <button onClick={() => void copyKey(newKey.key)} className={btn} style={S.secondary}>{copied ? t('keys.copied') : t('keys.copy')}</button>
              </div>
            )}
            {keys.phase === 'ready' && keys.keys!.length === 0 && !newKey && <p className="mt-3 text-[12px]" style={S.faint}>{t('keys.empty')}</p>}
            {keys.phase === 'ready' && keys.keys!.length > 0 && (
              <ul className="mt-3 divide-y" style={{ borderColor: 'var(--border)' }}>
                {keys.keys!.map((k) => (
                  <li key={k.id} className="flex items-center gap-3 py-2" style={{ borderColor: 'var(--border)' }}>
                    <code className="font-mono text-[12px]">{k.prefix}…</code>
                    <span className="flex-1 min-w-0 text-[11px] truncate" style={S.faint}>{fmtDate(k.created_at)}{k.last_used_at ? ` · ${t('keys.lastUsed')} ${fmtDate(k.last_used_at)}` : ''}</span>
                    <button onClick={() => void handleRevoke(k.id)} disabled={busy === k.id} className={btn} style={{ ...S.secondary, color: 'var(--danger)' }}>{t('keys.revoke')}</button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="rounded-lg border p-5 flex flex-wrap items-center justify-between gap-3" style={S.panel} aria-labelledby="dash-profile">
        <div className="min-w-0">
          <h2 id="dash-profile" className="text-[14px] font-semibold">{t('dash.settings.profileTitle')}</h2>
          <p className="text-[12px] mt-1 truncate" style={S.dim}>{email}</p>
        </div>
        <button onClick={() => onNavigate('/account')} className={btn} style={S.secondary}>{t('manageProfile')}</button>
      </section>
    </>
  )

  // ── Page ────────────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-full w-full ${theme === 'light' ? 'lp-light' : ''}`}
      // Links in the accent colour: the dark accent is too dim for small text (3.9:1), so it uses its light step there.
      style={{ background: 'var(--bg)', color: 'var(--text)', '--dash-link': theme === 'light' ? 'var(--accent)' : 'var(--accent-strong, #55CAC3)' } as React.CSSProperties}>
      <div className="mx-auto w-full max-w-[1040px] px-4 py-6 md:px-6 md:py-10">
        <header className="flex flex-wrap items-center justify-between gap-3 pb-5 mb-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] md:text-[26px] font-semibold tracking-[-0.015em] leading-tight">{t('dash.title')}</h1>
              {signedIn && <span className="text-[11px] font-medium px-2 py-0.5 rounded border" style={{ borderColor: 'var(--border)', color: 'var(--text-dim)' }}>{planLabel}</span>}
            </div>
            {signedIn && email && <p className="text-[13px] mt-0.5 truncate" style={S.dim}>{t('dash.signedInAs', { email })}</p>}
          </div>
          <nav className="flex flex-wrap items-center gap-2" aria-label={t('dash.navAria')}>
            {isAdmin && <button onClick={() => onNavigate('/admin')} className={btn} style={S.secondary}>{t('dash.admin')}</button>}
            {signedIn && <button onClick={openViewer} className={btn} style={S.secondary}>{t('dash.openViewer')}</button>}
            {signedIn
              ? <button onClick={() => void signOut?.()} className={btn} style={S.secondary}>{t('signOut')}</button>
              : <button onClick={onNavigateHome} className={btn} style={S.secondary}>{t('backHome')}</button>}
          </nav>
        </header>

        {!signedIn ? (
          <section className="rounded-lg border p-6 md:p-8 grid gap-6 md:grid-cols-[1.2fr_1fr]" style={S.panel} aria-labelledby="dash-anon">
            <div>
              <h2 id="dash-anon" className="text-[20px] font-semibold tracking-[-0.01em]">{t('dash.anon.title')}</h2>
              <p className="mt-2 text-[14px] leading-relaxed max-w-[52ch]" style={S.dim}>{t('dash.anon.body')}</p>
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <button onClick={() => { cta('sign_in'); onNavigate('/sign-in') }} disabled={status === 'loading'} className={btn} style={S.primary}>
                  {status === 'loading' ? t('dash.loading') : t('dash.anon.cta')}
                </button>
                <button onClick={openViewer} className={link} style={S.dim}>{t('dash.anon.continue')}</button>
              </div>
            </div>
            <div className="md:border-l md:pl-6" style={{ borderColor: 'var(--border)' }}>
              <ul className="flex flex-col gap-3">
                {([1, 2, 3] as const).map((n) => (
                  <li key={n} className="flex gap-2 text-[13px] leading-snug" style={S.dim}><span className="mt-px shrink-0" style={{ color: 'var(--ok)' }}><Check /></span>{t(`dash.anon.p${n}` as const)}</li>
                ))}
              </ul>
              <p className="mt-4 text-[12px]" style={S.faint}>{t('dash.anon.free')}</p>
            </div>
          </section>
        ) : (
          <>
            {state === 'past_due' && (
              <div role="alert" className="mb-5 rounded-lg border px-5 py-4 flex flex-wrap items-center justify-between gap-3" style={{ borderColor: 'var(--warn)', background: 'var(--surface)' }}>
                <p className="text-[13px]">{t('plan.pastDue')}</p>
                <button onClick={() => void handlePortal()} disabled={busy === 'portal'} className={btn} style={S.primary}>{busy === 'portal' ? t('plan.redirecting') : t('dash.pastDueCta')}</button>
              </div>
            )}
            <div role="tablist" aria-label={t('dash.tabsAria')} className="flex gap-1 mb-5 border-b" style={{ borderColor: 'var(--border)' }}>
              {(['overview', 'settings'] as Tab[]).map((k) => (
                <button key={k} role="tab" id={`dash-tab-${k}`} aria-selected={tab === k} aria-controls="dash-panel" onClick={() => setTab(k)}
                  className={`-mb-px h-9 px-3 text-[13px] font-medium border-b-2 ${focus}`}
                  style={{ borderColor: tab === k ? 'var(--accent)' : 'transparent', color: tab === k ? 'var(--text)' : 'var(--text-dim)' }}>
                  {t(`dash.tabs.${k}` as const)}
                </button>
              ))}
            </div>
            <div role="tabpanel" id="dash-panel" aria-labelledby={`dash-tab-${tab}`} className="flex flex-col gap-4">
              {tab === 'settings' ? settings
                : history.phase === 'loading' ? <p className="text-[13px]" style={S.faint} aria-live="polite">{t('dash.loading')}</p>
                : overview}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
