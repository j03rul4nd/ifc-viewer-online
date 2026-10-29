import { useMemo, useState } from 'react'
import { CREDIT_PACKS, PAID_FEATURES, PLANS, type BillingPeriod } from '../../lib/pricing/catalog'
import { trackPricingIntent } from '../../lib/analytics'
import NotifyMeForm from './NotifyMeForm'

// Hidden landing section (see lib/pricing/pricing-preview.ts). English-only on
// purpose until prices are final — translate before it goes public.
//
// Not a row of identical plan cards (docs-planning/10): visitors answer "how
// often do you deliver models?" and the calculator turns their real usage into
// the cheapest option, so the page recommends instead of listing.

type Door = { kind: 'plan' | 'pack' | 'feature'; item: string } | null

const EUR = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)

/** Monthly credits a usage pattern needs: auto-fix 30, certificate 20 per delivery. */
function monthlyCredits(deliveries: number, fixes: boolean, certs: boolean): number {
  return deliveries * ((fixes ? 30 : 0) + (certs ? 20 : 0))
}

/** Cheapest way to cover `credits` a month with packs (12-month validity → buy per year, spread monthly). */
function packCostPerMonth(credits: number): number {
  if (credits === 0) return 0
  const yearly = credits * 12
  let best = Infinity
  for (const p of CREDIT_PACKS) best = Math.min(best, Math.ceil(yearly / p.credits) * p.priceEur)
  return best / 12
}

export default function PricingSection() {
  const [billing, setBilling] = useState<BillingPeriod>('yearly')
  const [door, setDoor] = useState<Door>(null)
  const [deliveries, setDeliveries] = useState(2)
  const [fixes, setFixes] = useState(true)
  const [certs, setCerts] = useState(true)

  const pro = PLANS.find((p) => p.id === 'pro')!
  const team = PLANS.find((p) => p.id === 'team')!
  const needed = monthlyCredits(deliveries, fixes, certs)
  const packMonthly = packCostPerMonth(needed)
  const proMonthly = billing === 'yearly' ? (pro.yearlyEur ?? 0) / 12 : (pro.monthlyEur ?? 0)
  const recommend = needed === 0 ? 'free' : needed > 200 * 2.5 ? 'team' : packMonthly <= proMonthly && needed <= 100 ? 'credits' : 'pro'

  const verdict = useMemo(() => {
    switch (recommend) {
      case 'free': return { title: 'Stay on Free', body: 'Viewing, validation, IDS and the Health Score are free and run in your browser. You only pay for cloud work.' }
      case 'credits': return { title: `Buy credits — about ${EUR(packMonthly)} a month`, body: `${needed} credits a month is cheaper with packs than a subscription (${EUR(proMonthly)}). Packs last 12 months.` }
      case 'pro': return { title: `Pro — ${EUR(proMonthly)} a month`, body: `Covers ${Math.min(needed, 200)} of your ${needed} monthly credits${needed > 200 ? ' (top up the rest)' : ''}, plus project history and version comparison. Packs would cost ${EUR(packMonthly)}.` }
      case 'team': return { title: `Team — ${EUR(billing === 'yearly' ? (team.yearlyEur ?? 0) / 12 : team.monthlyEur ?? 0)} a month`, body: 'From 3 editors at €35 each: quality gate on every upload, shared house standard and team issues. Reviewers and guests are free.' }
    }
  }, [recommend, needed, packMonthly, proMonthly, billing, team])

  function open(kind: 'plan' | 'pack' | 'feature', item: string) {
    trackPricingIntent({ kind, item, surface: 'landing_pricing', billing: kind === 'plan' ? billing : undefined })
    setDoor({ kind, item })
  }
  const isOpen = (kind: string, item: string) => door?.kind === kind && door.item === item

  const rows: { label: string; free: string; pro: string; team: string }[] = [
    { label: 'Viewer, measure, section, multi-model', free: '✓', pro: '✓', team: '✓' },
    { label: 'Health Score, 44 rules, IDS 1.0, requirements links', free: '✓', pro: '✓', team: '✓' },
    { label: 'Where files are processed', free: 'Your browser only', pro: 'Browser · EU servers up to 1 GB', team: 'Browser · EU servers up to 3 GB' },
    { label: 'Cloud projects with versions', free: '—', pro: '20 GB', team: '100 GB per editor' },
    { label: 'Client link / client portal with your logo', free: '—', pro: 'Link', team: 'Portal' },
    { label: 'Quality gate, house standard, team issues', free: '—', pro: '—', team: '✓ (coming soon)' },
    { label: 'Seats', free: '1', pro: '1', team: '€35 per editor, 3 minimum · reviewers free' },
  ]
  const price = (p: typeof pro) => billing === 'yearly' ? `${EUR((p.yearlyEur ?? 0) / 12)}/mo, billed yearly` : `${EUR(p.monthlyEur ?? 0)}/mo`

  return (
    <section id="pricing" className="border-t border-[var(--border)] py-14 sm:py-[90px] px-4 sm:px-7" aria-labelledby="pricing-heading">
      <div className="max-w-[1080px] mx-auto">
        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-faint)] mb-3">
          Internal preview · not public · <a href={`${import.meta.env.BASE_URL}plans`} className="underline normal-case tracking-normal">all plans →</a> · <a href={`${import.meta.env.BASE_URL}workspace`} className="underline normal-case tracking-normal">paid workspace design →</a>
        </p>
        <h2 id="pricing-heading" className="font-semibold tracking-[-0.03em] mb-3 max-w-[720px]" style={{ fontSize: 'clamp(22px, 5vw, 34px)' }}>
          Everything in your browser stays free. You pay only when our servers do the work.
        </h2>
        <p className="text-[14px] text-[var(--text-dim)] max-w-[640px] mb-10">
          Fixing a model and handing back a clean IFC, certificates your client can verify, files too large for a browser. Tell us how you work and we'll tell you the cheapest way to pay — often that's nothing.
        </p>

        {/* ── Calculator → one recommendation ── */}
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] items-start mb-14">
          <div className="space-y-5">
            <label className="block">
              <span className="flex justify-between text-[13.5px] font-medium">Deliveries you check per month <span className="tabular-nums">{deliveries}</span></span>
              <input type="range" min={0} max={20} value={deliveries} onChange={(e) => setDeliveries(Number(e.target.value))} className="w-full mt-2 accent-[var(--accent)]" />
            </label>
            <fieldset className="space-y-2">
              <legend className="text-[13.5px] font-medium mb-1">For each delivery you want</legend>
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={fixes} onChange={(e) => setFixes(e.target.checked)} /> A fixed, clean IFC (auto-fix · 30 credits)</label>
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={certs} onChange={(e) => setCerts(e.target.checked)} /> A certificate for the client (20 credits)</label>
            </fieldset>
            <div role="radiogroup" aria-label="Billing period" className="inline-flex p-0.5 rounded-[8px] border border-[var(--border)]">
              {(['yearly', 'monthly'] as const).map((p) => (
                <button key={p} role="radio" aria-checked={billing === p} onClick={() => setBilling(p)}
                  className={`h-[28px] px-3 text-[12.5px] rounded-[6px] ${billing === p ? 'bg-[var(--surface-2)] text-[var(--text)] font-medium' : 'text-[var(--text-dim)]'}`}>
                  {p === 'yearly' ? 'Yearly · save 20%' : 'Monthly'}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-6" aria-live="polite">
            <p className="text-[12px] text-[var(--text-faint)] tabular-nums">You'd use about {needed} credits a month</p>
            <p className="text-[22px] font-semibold tracking-[-0.02em] mt-1">{verdict.title}</p>
            <p className="text-[13.5px] text-[var(--text-dim)] mt-2">{verdict.body}</p>
            <div className="mt-5">
              {recommend === 'free' ? (
                <a href={`${import.meta.env.BASE_URL}`} className="inline-flex items-center h-[34px] px-4 rounded-[8px] text-[13px] font-medium border border-[var(--border)] no-underline">Open the viewer</a>
              ) : isOpen(recommend === 'credits' ? 'pack' : 'plan', recommend) ? (
                <NotifyMeForm source={`pricing:${recommend}`} label="Not on sale yet. Leave your email and we'll write once, at launch." />
              ) : (
                <button onClick={() => open(recommend === 'credits' ? 'pack' : 'plan', recommend)} className="h-[34px] px-4 rounded-[8px] text-[13px] font-medium bg-[var(--accent)] text-white hover:brightness-110">
                  {recommend === 'credits' ? 'Buy credits' : `Get ${recommend === 'pro' ? 'Pro' : 'Team'}`}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Comparison: one table, not four identical cards ── */}
        <div className="overflow-x-auto rounded-[12px] border border-[var(--border)]">
          <table className="w-full text-[13px] min-w-[640px]">
            <thead>
              <tr className="text-left">
                <th className="px-4 py-3 font-medium text-[var(--text-faint)] w-[36%]" />
                <th className="py-3 align-top"><p className="font-semibold">Free</p><p className="text-[12px] text-[var(--text-dim)] font-normal">€0</p></th>
                <th className="py-3 align-top"><p className="font-semibold">Pro</p><p className="text-[12px] text-[var(--text-dim)] font-normal">{price(pro)}</p></th>
                <th className="py-3 align-top"><p className="font-semibold">Team</p><p className="text-[12px] text-[var(--text-dim)] font-normal">{price(team)}</p></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="px-4 py-2.5 text-[var(--text-dim)]">{r.label}</td>
                  <td>{r.free}</td>
                  <td className={recommend === 'pro' ? 'font-medium' : ''}>{r.pro}</td>
                  <td>{r.team}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[12.5px] text-[var(--text-dim)] mt-3">
          Need it inside your own network with no internet? <a href={`${import.meta.env.BASE_URL}on-premise-ifc-validator/`} className="underline">On-premise and air-gapped deployments</a>.
        </p>

        {/* ── What credits buy ── */}
        <h3 className="text-[16px] font-semibold mt-14 mb-1">What credits buy</h3>
        <p className="text-[13px] text-[var(--text-dim)] mb-4">
          1 credit ≈ {EUR(CREDIT_PACKS[0].priceEur / CREDIT_PACKS[0].credits)}. Packs: {CREDIT_PACKS.map((p) => `${p.credits} for ${EUR(p.priceEur)}`).join(' · ')}. If a job fails on our side, the credits come back.
        </p>
        <div className="overflow-x-auto rounded-[12px] border border-[var(--border)]">
          <table className="w-full text-[13px] min-w-[640px]">
            <tbody className="divide-y divide-[var(--border)]">
              {PAID_FEATURES.map((f) => (
                <tr key={f.id}>
                  <td className="px-4 py-3 align-top w-[30%] font-medium">{f.title}</td>
                  <td className="py-3 pr-4 align-top text-[var(--text-dim)]">{f.description}</td>
                  <td className="py-3 pr-4 align-top tabular-nums whitespace-nowrap">
                    {f.credits == null ? 'In Pro' : `${f.creditsNote === 'from' ? 'from ' : ''}${f.credits} cr${f.creditsNote && f.creditsNote !== 'from' ? ` ${f.creditsNote}` : ''}`}
                  </td>
                  <td className="py-3 pr-4 align-top text-right w-[160px]">
                    {isOpen('feature', f.id)
                      ? <NotifyMeForm compact source={`pricing:${f.id}`} label="Tell me when this launches." />
                      : <button onClick={() => open('feature', f.id)} className="text-[12.5px] font-medium text-[var(--accent)] hover:underline">I want this</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
