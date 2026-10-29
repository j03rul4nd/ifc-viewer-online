// ─── Hidden plan landings ─────────────────────────────────────────────────────
// /plans, /plans/pro, /plans/team, /plans/reception, /plans/api,
// /plans/ai-credits. Only reachable with the pricing preview on (see
// lib/pricing/pricing-preview.ts), marked noindex and linked from nowhere
// public. English-only on purpose until prices are final, like the pricing
// section — translate before they go public. Everything reads lib/plans, so a
// price or a feature status changes in one place.

import { useEffect, useMemo, useState } from 'react'
import { Check, Clock, ArrowRight } from 'lucide-react'
import { PLAN_DEFS, ADDONS, FOUNDER_OFFER, RECEPTION_UNLIMITED_EUR, planDef, planMonthlyCost } from '../../lib/plans/plans'
import { PAID_FEATURE_DEFS, INTEGRATIONS, featuresForPlan } from '../../lib/plans/features'
import { quoteApi, validationCredits, API_CREDIT_EUR, MB_PER_CREDIT, CREDITS_PER_GB_MONTH } from '../../lib/plans/api-cost'
import { AI_ACTIONS, AI_CREDIT_EUR, AI_DISCLAIMER, MIN_AI_MARGIN, estimateAi } from '../../lib/plans/ai-credits'
import type { FeatureStatus, PaidFeatureDef, PlanDef, PlanKey } from '../../lib/plans/types'
import { trackPricingIntent } from '../../lib/analytics'
import NotifyMeForm from '../pricing/NotifyMeForm'

export type PlansPage = 'overview' | 'pro' | 'team' | 'reception' | 'api' | 'ai-credits'
const PAGES: PlansPage[] = ['overview', 'pro', 'team', 'reception', 'api', 'ai-credits']

export function plansPageFromPath(pathname: string): PlansPage {
  const seg = pathname.split('/plans')[1]?.replace(/^\/+/, '').split('/')[0] ?? ''
  return (PAGES as string[]).includes(seg) ? (seg as PlansPage) : 'overview'
}

const BASE = import.meta.env.BASE_URL
const hrefOf = (p: PlansPage) => `${BASE}plans${p === 'overview' ? '' : `/${p}`}`
const EUR = (n: number) => new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)
const STATUS_LABEL: Record<FeatureStatus, string> = { live: 'Available', preview: 'In preview', soon: 'Coming soon', planned: 'Planned' }

function StatusTag({ status }: { status: FeatureStatus }) {
  const live = status === 'live'
  return (
    <span className={`inline-flex items-center gap-1 text-[10.5px] uppercase tracking-[0.06em] px-1.5 py-[1px] rounded-[5px] border whitespace-nowrap ${live ? 'border-[var(--ok)] text-[var(--ok)]' : 'border-[var(--border)] text-[var(--text-faint)]'}`}>
      {live ? <Check size={10} aria-hidden /> : <Clock size={10} aria-hidden />}{STATUS_LABEL[status]}
    </span>
  )
}

function priceLine(p: PlanDef, period: 'monthly' | 'yearly'): string {
  if (p.monthlyEur === null) return p.fromEur ? `from ${EUR(p.fromEur)} / year` : 'Contact us'
  if (p.monthlyEur === 0) return '€0, forever'
  const unit = p.unit === 'seat' ? ' per editor' : p.unit === 'project' ? ' per project' : ''
  const v = period === 'yearly' ? (p.yearlyEur ?? 0) / 12 : p.monthlyEur
  return `${EUR(Math.round(v * 100) / 100)}${unit} / month${period === 'yearly' ? ', billed yearly' : ''}`
}

function FeatureList({ features }: { features: PaidFeatureDef[] }) {
  return (
    <ul className="divide-y divide-[var(--border)] rounded-[12px] border border-[var(--border)]">
      {features.map((f) => (
        <li key={f.id} className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-medium">{f.title} <span className="text-[11px] text-[var(--text-faint)] font-normal">{f.code}</span></p>
            <p className="text-[13px] text-[var(--text-dim)] mt-0.5">{f.pitch}</p>
          </div>
          <StatusTag status={f.status} />
        </li>
      ))}
    </ul>
  )
}

function Cta({ plan, label }: { plan: PlanKey; label?: string }) {
  const [open, setOpen] = useState(false)
  if (open) return <NotifyMeForm source={`plans:${plan}`} label="Not on sale yet. Leave your email and we'll write once, at launch." />
  return (
    <button onClick={() => { trackPricingIntent({ kind: 'plan', item: plan, surface: 'plans_page' }); setOpen(true) }}
      className="h-[38px] px-4 rounded-[8px] text-[13.5px] font-medium bg-[var(--accent)] text-white hover:brightness-110">
      {label ?? `Get ${planDef(plan).name}`}
    </button>
  )
}

function Hero({ kicker, title, body, children }: { kicker: string; title: string; body: string; children?: React.ReactNode }) {
  return (
    <header className="mb-12">
      <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-faint)] mb-3">{kicker}</p>
      <h1 className="font-semibold tracking-[-0.03em] max-w-[760px]" style={{ fontSize: 'clamp(26px, 5vw, 42px)', lineHeight: 1.1 }}>{title}</h1>
      <p className="text-[15px] text-[var(--text-dim)] mt-4 max-w-[640px]">{body}</p>
      {children && <div className="mt-6 flex flex-wrap items-center gap-3">{children}</div>}
    </header>
  )
}

// ── Pages ────────────────────────────────────────────────────────────────────

function Overview() {
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('yearly')
  const shown = PLAN_DEFS.filter((p) => p.key !== 'developer')
  return (
    <>
      <Hero kicker="Plans" title="Everything in your browser stays free. You pay when our servers work for you."
        body="Viewer, validator, Health Score, IDS, requirements links and reports run on your computer and cost nothing, forever. Paid plans add what needs a server: storage, large files, sharing, team workflow and receiving deliveries." />
      <div role="radiogroup" aria-label="Billing period" className="inline-flex p-0.5 rounded-[8px] border border-[var(--border)] mb-6">
        {(['yearly', 'monthly'] as const).map((p) => (
          <button key={p} role="radio" aria-checked={period === p} onClick={() => setPeriod(p)}
            className={`h-[30px] px-3 text-[12.5px] rounded-[6px] ${period === p ? 'bg-[var(--surface-2)] font-medium' : 'text-[var(--text-dim)]'}`}>
            {p === 'yearly' ? 'Yearly · 2 months free' : 'Monthly'}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {shown.map((p) => {
          const own = p.key === 'free' ? [] : featuresForPlan(p.key).filter((f) => f.family !== 'sales' || f.status === 'live')
          const live = own.filter((f) => f.status === 'live').length
          return (
            <article key={p.key} className={`rounded-[12px] border p-5 flex flex-col ${p.highlighted ? 'border-[var(--accent)]' : 'border-[var(--border)]'}`}>
              <h2 className="text-[16px] font-semibold">{p.name}</h2>
              <p className="text-[12.5px] text-[var(--text-dim)]">{p.audience}</p>
              <p className="text-[14px] font-medium mt-3 tabular-nums">{priceLine(p, period)}</p>
              {p.minUnits && p.minUnits > 1 && <p className="text-[11.5px] text-[var(--text-faint)]">Minimum {p.minUnits} editors · reviewers and guests free</p>}
              {p.key === 'reception' && <p className="text-[11.5px] text-[var(--text-faint)]">Up to 10 suppliers · {EUR(RECEPTION_UNLIMITED_EUR)} unlimited</p>}
              <p className="text-[13px] mt-3 italic text-[var(--text-dim)]">“{p.promise}”</p>
              {p.extends && (own.length > 0 || p.key === 'enterprise') && <p className="text-[12px] text-[var(--text-faint)] mt-3">Everything in {planDef(p.extends).name}{p.key === 'enterprise' ? ', across the portfolio, plus SSO, DPA and on-premise' : ', plus:'}</p>}
              <ul className="mt-2 space-y-1.5 text-[12.5px] flex-1">
                {(p.key === 'free'
                  ? ['Viewer, measure, section, federation', 'Health Score, 44 rules, IDS 1.0', 'Requirements links and delivery report', 'Unlimited client SDK and embeds']
                  : own.slice(0, 6).map((f) => f.title)
                ).map((t) => <li key={t} className="flex gap-1.5"><Check size={13} className="mt-[2px] shrink-0 text-[var(--text-faint)]" aria-hidden />{t}</li>)}
              </ul>
              {own.length > 0 && <p className="text-[11px] text-[var(--text-faint)] mt-3">{live} of {own.length} available today · the rest on the roadmap</p>}
              <div className="mt-4">
                {p.key === 'free' ? <a href={BASE} className="text-[13px] underline">Open the viewer</a>
                  : p.key === 'enterprise' ? <a href={`${BASE}on-premise-ifc-validator/`} className="text-[13px] underline">Talk to us</a>
                  : <a href={hrefOf(p.key as PlansPage)} className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--accent)]">See {p.name} <ArrowRight size={13} aria-hidden /></a>}
              </div>
            </article>
          )
        })}
      </div>
      <p className="text-[12.5px] text-[var(--text-dim)] mt-5">
        Founder offer: {Math.round(FOUNDER_OFFER.discount * 100)}% off for life on yearly plans, for the first {FOUNDER_OFFER.seats} teams. Building on top of us? <a href={hrefOf('api')} className="underline">Developer API from {EUR(planDef('developer').monthlyEur ?? 0)} a month</a>.
      </p>

      <h2 className="text-[18px] font-semibold mt-14 mb-3">Add-ons</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {ADDONS.map((a) => (
          <div key={a.id} className="rounded-[12px] border border-[var(--border)] p-4">
            <div className="flex items-start justify-between gap-2"><p className="text-[14px] font-medium">{a.name}</p><StatusTag status={a.status} /></div>
            <p className="text-[13px] text-[var(--text-dim)] mt-1">{a.description}</p>
            <p className="text-[12.5px] mt-2 tabular-nums">{EUR(a.priceEur)} per {a.per} · on {a.on.map((k) => planDef(k).name).join(', ')}</p>
          </div>
        ))}
      </div>

      <h2 className="text-[18px] font-semibold mt-14 mb-3">The whole roadmap</h2>
      <p className="text-[13px] text-[var(--text-dim)] mb-4">What each plan will include and how far each piece is. Prices do not change as features arrive.</p>
      <FeatureList features={PAID_FEATURE_DEFS.filter((f) => f.plan !== 'free')} />
    </>
  )
}

function PlanPage({ plan, kicker, title, body, proof }: { plan: PlanKey; kicker: string; title: string; body: string; proof: { label: string; value: string }[] }) {
  const p = planDef(plan)
  return (
    <>
      <Hero kicker={kicker} title={title} body={body}>
        <Cta plan={plan} />
        <span className="text-[13px] text-[var(--text-dim)] tabular-nums">{priceLine(p, 'monthly')}</span>
      </Hero>
      <div className="grid gap-3 sm:grid-cols-3 mb-12">
        {proof.map((x) => (
          <div key={x.label} className="rounded-[12px] border border-[var(--border)] p-4">
            <p className="text-[22px] font-semibold tabular-nums">{x.value}</p>
            <p className="text-[12.5px] text-[var(--text-dim)] mt-1">{x.label}</p>
          </div>
        ))}
      </div>
      <h2 className="text-[18px] font-semibold mb-3">{p.extends && p.extends !== 'free' ? `Everything in ${planDef(p.extends).name}, plus` : 'What you get'}</h2>
      <FeatureList features={featuresForPlan(plan)} />
      <Quotas plan={p} />
    </>
  )
}

function Quotas({ plan }: { plan: PlanDef }) {
  const q = plan.quotas
  const rows: [string, string | null][] = [
    ['Cloud storage', q.storageGb ? `${q.storageGb} GB${plan.unit === 'seat' ? ' per editor, shared' : ''}` : null],
    ['Largest file on our servers', q.maxFileMb ? `${q.maxFileMb >= 1024 ? `${q.maxFileMb / 1024} GB` : `${q.maxFileMb} MB`}` : null],
    ['Hosted API calls a month', q.apiCallsMonth ? q.apiCallsMonth.toLocaleString('en') : null],
    ['Server credits a month', q.cloudCreditsMonth ? q.cloudCreditsMonth.toLocaleString('en') : null],
    ['AI credits a month (optional)', q.aiCreditsMonth ? q.aiCreditsMonth.toLocaleString('en') : null],
    ['Suppliers per project', q.suppliers ? `${q.suppliers} · unlimited for ${EUR(RECEPTION_UNLIMITED_EUR)}` : null],
  ]
  return (
    <>
      <h2 className="text-[18px] font-semibold mt-12 mb-3">Limits</h2>
      <table className="w-full text-[13px] rounded-[12px] border border-[var(--border)] overflow-hidden">
        <tbody className="divide-y divide-[var(--border)]">
          {rows.filter(([, v]) => v).map(([k, v]) => <tr key={k}><td className="px-4 py-2.5 text-[var(--text-dim)]">{k}</td><td className="px-4 py-2.5 text-right tabular-nums">{v}</td></tr>)}
        </tbody>
      </table>
    </>
  )
}

function TeamPage() {
  const [editors, setEditors] = useState(4)
  const ours = (planMonthlyCost('team', editors, 'yearly') ?? 0) * 12
  // doc 19 §3: BIMcollab Premium for 10 users (≥ €1,548/yr, issues only) + one Solibri Advanced (€2,109/yr).
  const theirs = 1548 + 2109
  return (
    <>
      <PlanPage plan="team" kicker="Team · for studios that deliver" title="Nothing leaves your company wrong — and your record proves it."
        body="BCF issues and Solibri-style autorun in one web tool, from 3 editors. Reviewers and clients join free, so the people who check your work never need a licence."
        proof={[{ label: 'per editor a month, billed yearly', value: EUR(29) }, { label: 'reviewers and guests', value: 'Free' }, { label: 'to publish below your minimum score', value: 'Blocked' }]} />
      <h2 className="text-[18px] font-semibold mt-12 mb-3">What it replaces</h2>
      <div className="rounded-[12px] border border-[var(--border)] p-5">
        <label className="block text-[13.5px] font-medium">Editors <span className="tabular-nums">{editors}</span>
          <input type="range" min={3} max={20} value={editors} onChange={(e) => setEditors(Number(e.target.value))} className="w-full mt-2 accent-[var(--accent)]" />
        </label>
        <p className="text-[14px] mt-3 tabular-nums">Team: <strong>{EUR(Math.round(ours))}</strong> a year · BIMcollab Premium (10 users) + Solibri Advanced: about <strong>{EUR(theirs)}</strong> a year.</p>
        <p className="text-[12px] text-[var(--text-faint)] mt-1">Competitor prices from their public pages, October 2026.</p>
      </div>
    </>
  )
}

function ReceptionPage() {
  const [projects, setProjects] = useState(3)
  const cost = projects * 149
  return (
    <>
      <PlanPage plan="reception" kicker="Reception · for whoever receives models" title="Only what complies reaches you. And you know which supplier delivers well."
        body="Publish your requirements as a link for tenders and contracts. Suppliers check and fix against it for free, in their browser. You receive deliveries re-validated on our servers, accept or reject with a reason, and keep a sealed register."
        proof={[{ label: 'per active project a month, up to 10 suppliers', value: EUR(149) }, { label: 'unlimited suppliers', value: EUR(RECEPTION_UNLIMITED_EUR) }, { label: 'suppliers never pay to deliver', value: '€0' }]} />
      <h2 className="text-[18px] font-semibold mt-12 mb-3">How it works</h2>
      <ol className="grid gap-3 md:grid-cols-4 text-[13px]">
        {['You publish requirements: IDS, rules, minimum score, naming — as a link and QR.', 'Each supplier opens the link, checks the model and fixes it in their browser, free.', 'They deliver to your inbox; we re-validate on our servers and seal the delivery.', 'You accept or reject with a reason. Their record updates on its own.'].map((s, i) => (
          <li key={s} className="rounded-[12px] border border-[var(--border)] p-4"><span className="text-[var(--text-faint)] tabular-nums">{i + 1}</span><p className="mt-1">{s}</p></li>
        ))}
      </ol>
      <div className="rounded-[12px] border border-[var(--border)] p-5 mt-8">
        <label className="block text-[13.5px] font-medium">Active projects <span className="tabular-nums">{projects}</span>
          <input type="range" min={1} max={10} value={projects} onChange={(e) => setProjects(Number(e.target.value))} className="w-full mt-2 accent-[var(--accent)]" />
        </label>
        <p className="text-[14px] mt-3 tabular-nums">{EUR(cost)} a month{cost > RECEPTION_UNLIMITED_EUR ? ` — the unlimited tier at ${EUR(RECEPTION_UNLIMITED_EUR)} is cheaper` : ''}.</p>
      </div>
    </>
  )
}

function ApiPage() {
  const [files, setFiles] = useState(1500)
  const [avgMb, setAvgMb] = useState(60)
  const [storedGb, setStoredGb] = useState(50)
  const q = quoteApi({ files, avgMb, storedGb })
  const field = 'w-full h-[36px] rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-[13px]'
  return (
    <>
      <Hero kicker="Developer API" title="Validate IFC from your platform. Pay only for what runs on our servers."
        body="The client SDK runs in your users' browsers with no request limits and stays free. The hosted API validates, stores and compares on EU servers for platforms, CDEs and AI agents.">
        <Cta plan="developer" label="Get an API key" />
        <span className="text-[13px] text-[var(--text-dim)]">{EUR(planDef('developer').monthlyEur ?? 0)} a month, 5,000 credits included</span>
      </Hero>
      <h2 className="text-[18px] font-semibold mb-3">What a credit buys</h2>
      <table className="w-full text-[13px] rounded-[12px] border border-[var(--border)] overflow-hidden mb-10">
        <tbody className="divide-y divide-[var(--border)]">
          <tr><td className="px-4 py-2.5">Validate a file up to {MB_PER_CREDIT} MB</td><td className="px-4 py-2.5 text-right">1 credit</td></tr>
          <tr><td className="px-4 py-2.5">Each further {MB_PER_CREDIT} MB started</td><td className="px-4 py-2.5 text-right">+1 credit (400 MB = {validationCredits(400)})</td></tr>
          <tr><td className="px-4 py-2.5">Store 1 GB for a month</td><td className="px-4 py-2.5 text-right">{CREDITS_PER_GB_MONTH} credits</td></tr>
          <tr><td className="px-4 py-2.5">Over the included credits</td><td className="px-4 py-2.5 text-right">{EUR(API_CREDIT_EUR)} each</td></tr>
          <tr><td className="px-4 py-2.5">Job failed on our side</td><td className="px-4 py-2.5 text-right">Credits returned</td></tr>
        </tbody>
      </table>
      <h2 className="text-[18px] font-semibold mb-3">Estimate your bill</h2>
      <div className="rounded-[12px] border border-[var(--border)] p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-[12.5px]">Files a month<input type="number" min={0} value={files} onChange={(e) => setFiles(Number(e.target.value))} className={`${field} mt-1`} /></label>
          <label className="text-[12.5px]">Average size (MB)<input type="number" min={1} value={avgMb} onChange={(e) => setAvgMb(Number(e.target.value))} className={`${field} mt-1`} /></label>
          <label className="text-[12.5px]">Stored (GB)<input type="number" min={0} value={storedGb} onChange={(e) => setStoredGb(Number(e.target.value))} className={`${field} mt-1`} /></label>
        </div>
        <p className="text-[15px] mt-4 tabular-nums" aria-live="polite"><strong>{EUR(q.totalEur)}</strong> a month · {q.credits.toLocaleString('en')} credits ({q.overage.toLocaleString('en')} over the included 5,000) · {EUR(q.perFileEur)} per file</p>
      </div>
      <h2 className="text-[18px] font-semibold mt-12 mb-3">Endpoints</h2>
      <pre className="text-[12.5px] rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-4 overflow-x-auto">{`POST /v1/validate        IFC + IDS/EIR profile → run id
GET  /v1/runs/:id        score, failed specs, issues, certificate
POST /v1/compare         two versions → changes by GlobalId
POST /v1/webhooks        delivery.received, validation.completed, score.dropped…`}</pre>
      <p className="text-[12.5px] text-[var(--text-faint)] mt-2">Draft — the API is not public yet. {INTEGRATIONS.filter((i) => i.kind === 'automation').map((i) => i.name).join(', ')} connect through webhooks.</p>
    </>
  )
}

function AiCreditsPage() {
  const [pages, setPages] = useState(40)
  const cost = estimateAi('ai_eir_draft', pages)
  return (
    <>
      <Hero kicker="AI credits" title="AI is optional here. Everything works without it."
        body="A few helpers draft things for you — requirements from a client's PDF, a plain-language summary of a report. Our deterministic engine checks the result and a person confirms it. You see the cost before every run, and it stops when your credits run out." />
      <div className="grid gap-3 md:grid-cols-3 mb-12">
        {[
          ['Our own unit', 'An AI credit is not a provider token. If AI prices change, we revise the rate with 30 days\' notice — never silently.'],
          ['Hard monthly cap', 'Pro includes 50 a month, Team and Reception 200. When they run out, AI stops until next month or until you add a pack.'],
          ['Always disclosed', `Every result says: “${AI_DISCLAIMER}” and stays a draft until someone reviews it.`],
        ].map(([t, b]) => <div key={t} className="rounded-[12px] border border-[var(--border)] p-4"><p className="text-[14px] font-medium">{t}</p><p className="text-[13px] text-[var(--text-dim)] mt-1">{b}</p></div>)}
      </div>
      <h2 className="text-[18px] font-semibold mb-3">What each helper costs</h2>
      <table className="w-full text-[13px] rounded-[12px] border border-[var(--border)] overflow-hidden">
        <tbody className="divide-y divide-[var(--border)]">
          {AI_ACTIONS.map((a) => <tr key={a.id}><td className="px-4 py-2.5">{a.label}</td><td className="px-4 py-2.5 text-right tabular-nums">{a.creditsPerUnit} per {a.unit}</td></tr>)}
          <tr><td className="px-4 py-2.5">Extra pack</td><td className="px-4 py-2.5 text-right tabular-nums">500 credits for {EUR(9)} ({EUR(AI_CREDIT_EUR)} each)</td></tr>
        </tbody>
      </table>
      <div className="rounded-[12px] border border-[var(--border)] p-5 mt-8">
        <label className="block text-[13.5px] font-medium">Pages in the client's PDF <span className="tabular-nums">{pages}</span>
          <input type="range" min={1} max={200} value={pages} onChange={(e) => setPages(Number(e.target.value))} className="w-full mt-2 accent-[var(--accent)]" />
        </label>
        <p className="text-[14px] mt-3 tabular-nums">An EIR draft uses about <strong>{cost}</strong> credits — {cost <= 200 ? 'within' : 'over'} a Team month.</p>
      </div>
      <p className="text-[12px] text-[var(--text-faint)] mt-4">Every helper is priced at least {MIN_AI_MARGIN}× over what it costs us, measured, so a provider price rise never turns into a loss or a surprise bill.</p>
    </>
  )
}

// ── Shell ────────────────────────────────────────────────────────────────────

const NAV: { id: PlansPage; label: string }[] = [
  { id: 'overview', label: 'All plans' }, { id: 'pro', label: 'Pro' }, { id: 'team', label: 'Team' },
  { id: 'reception', label: 'Reception' }, { id: 'api', label: 'API' }, { id: 'ai-credits', label: 'AI credits' },
]

export default function PlansSite({ onNavigateHome }: { onNavigateHome: () => void }) {
  const [page, setPage] = useState<PlansPage>(() => (typeof location !== 'undefined' ? plansPageFromPath(location.pathname) : 'overview'))

  // Hidden pages: never indexed, even if a URL leaks.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'; meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    const prevTitle = document.title
    return () => { meta.remove(); document.title = prevTitle }
  }, [])
  useEffect(() => {
    document.title = `${NAV.find((n) => n.id === page)?.label ?? 'Plans'} · IFC Viewer Online`
    const onPop = () => setPage(plansPageFromPath(location.pathname))
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [page])

  const go = (p: PlansPage) => { history.pushState(null, '', hrefOf(p)); setPage(p); scrollTo?.(0, 0) }
  const body = useMemo(() => {
    switch (page) {
      case 'pro': return <PlanPage plan="pro" kicker="Pro · for one person" title="Your file opens, your client sees it, and there's a record."
        body="Large files on EU servers, projects with versions, a link your client opens without installing anything, and certificates they can verify. For less than a Solibri Starter seat."
        proof={[{ label: 'a month, or €190 a year', value: EUR(19) }, { label: 'largest file on our servers', value: '1 GB' }, { label: 'to install, for you or your client', value: 'Nothing' }]} />
      case 'team': return <TeamPage />
      case 'reception': return <ReceptionPage />
      case 'api': return <ApiPage />
      case 'ai-credits': return <AiCreditsPage />
      default: return <Overview />
    }
  }, [page])

  return (
    <div className="min-h-full bg-[var(--bg)] text-[var(--text)]">
      <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
        <nav aria-label="Plans" className="max-w-[1160px] mx-auto px-4 sm:px-7 h-[52px] flex items-center gap-1 overflow-x-auto">
          <button onClick={onNavigateHome} className="text-[13px] font-semibold mr-3 shrink-0">IFC Viewer Online</button>
          {NAV.map((n) => (
            <a key={n.id} href={hrefOf(n.id)} aria-current={page === n.id ? 'page' : undefined}
              onClick={(e) => { if (e.metaKey || e.ctrlKey || e.button !== 0) return; e.preventDefault(); go(n.id) }}
              className={`shrink-0 h-[30px] px-2.5 inline-flex items-center rounded-[7px] text-[13px] no-underline ${page === n.id ? 'bg-[var(--surface-2)] font-medium text-[var(--text)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}`}>
              {n.label}
            </a>
          ))}
        </nav>
      </div>
      <p className="max-w-[1160px] mx-auto px-4 sm:px-7 pt-4 text-[11px] uppercase tracking-[0.12em] text-[var(--text-faint)]">
        Internal preview · not public · <a href={`${BASE}workspace`} className="underline normal-case tracking-normal">open the paid workspace →</a>
      </p>
      <main className="max-w-[1160px] mx-auto px-4 sm:px-7 py-10 sm:py-14">{body}</main>
    </div>
  )
}
