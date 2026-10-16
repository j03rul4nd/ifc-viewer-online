import { useState } from 'react'
import { CREDIT_PACKS, PAID_FEATURES, PLANS, type BillingPeriod } from '../../lib/pricing/catalog'
import { trackPricingIntent } from '../../lib/analytics'
import NotifyMeForm from './NotifyMeForm'

// Hidden landing section (see lib/pricing/pricing-preview.ts). English-only on
// purpose until prices are final — translate before it goes public.

type Door = { kind: 'plan' | 'pack' | 'feature'; item: string } | null

export default function PricingSection() {
  const [billing, setBilling] = useState<BillingPeriod>('monthly')
  const [door, setDoor] = useState<Door>(null)

  function open(kind: 'plan' | 'pack' | 'feature', item: string) {
    trackPricingIntent({ kind, item, surface: 'landing_pricing', billing: kind === 'plan' ? billing : undefined })
    setDoor({ kind, item })
  }

  const isOpen = (kind: string, item: string) => door?.kind === kind && door.item === item

  return (
    <section id="pricing" className="border-t border-[var(--border)] py-14 sm:py-[90px] px-4 sm:px-7" aria-labelledby="pricing-heading">
      <div className="max-w-[1200px] mx-auto">
        <p className="text-center text-[11px] uppercase tracking-[0.12em] text-[var(--text-faint)] mb-2">Internal preview · not public</p>
        <h2 id="pricing-heading" className="font-semibold tracking-[-0.03em] text-center mb-3" style={{ fontSize: 'clamp(22px, 6vw, 36px)' }}>
          Free in your browser. Pay only for the heavy lifting.
        </h2>
        <p className="text-center text-[14px] text-[var(--text-dim)] max-w-[640px] mx-auto mb-8">
          Everything that runs locally stays free. Server-side fixes, certificates and deep tests run on EU servers — buy credits once, or subscribe if you deliver models every week.
        </p>

        <div className="flex justify-center mb-8">
          <div role="radiogroup" aria-label="Billing period" className="inline-flex p-1 rounded-[9px] border border-[var(--border)] bg-[var(--surface-2)]">
            {(['monthly', 'yearly'] as const).map((p) => (
              <button
                key={p}
                role="radio"
                aria-checked={billing === p}
                onClick={() => setBilling(p)}
                className={`h-[30px] px-4 text-[13px] rounded-[7px] ${billing === p ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-dim)]'}`}
              >
                {p === 'monthly' ? 'Monthly' : 'Yearly · save 20%'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => {
            const price = billing === 'monthly' ? plan.monthlyEur : plan.yearlyEur
            return (
              <div
                key={plan.id}
                className={`flex flex-col rounded-[12px] border p-5 bg-[var(--surface)] ${plan.highlighted ? 'border-[var(--accent)]' : 'border-[var(--border)]'}`}
              >
                <h3 className="text-[16px] font-semibold">{plan.name}</h3>
                <p className="text-[12.5px] text-[var(--text-dim)] mb-3">{plan.audience}</p>
                <p className="mb-4">
                  {price == null
                    ? <span className="text-[22px] font-semibold">Let's talk</span>
                    : <><span className="text-[28px] font-semibold">€{price}</span><span className="text-[12.5px] text-[var(--text-dim)]">{price === 0 ? '' : billing === 'monthly' ? ' / month' : ' / year'}</span></>}
                </p>
                <ul className="flex-1 space-y-1.5 mb-4 text-[13px]">
                  {plan.features.map((f) => <li key={f} className="flex gap-2"><span aria-hidden="true" className="text-[var(--accent)]">✓</span>{f}</li>)}
                </ul>
                {plan.id === 'free' ? (
                  <p className="text-[12.5px] text-[var(--text-dim)]">What you use today.</p>
                ) : isOpen('plan', plan.id) ? (
                  <NotifyMeForm source={`pricing:${plan.id}`} label={`${plan.name} isn't available yet. Leave your email and we'll tell you when it is.`} />
                ) : (
                  <button
                    onClick={() => open('plan', plan.id)}
                    className={`h-[36px] rounded-[9px] text-[13.5px] font-medium ${plan.highlighted ? 'bg-[var(--accent)] text-white hover:brightness-110' : 'border border-[var(--border)] hover:bg-[var(--surface-2)]'}`}
                  >
                    {plan.monthlyEur == null ? 'Contact us' : `Get ${plan.name}`}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <h3 className="text-[18px] font-semibold mt-14 mb-1">No subscription? Buy credits.</h3>
        <p className="text-[13.5px] text-[var(--text-dim)] mb-5">Credits never renew automatically and last 12 months. If a run fails, the credits come back.</p>
        <div className="grid gap-4 sm:grid-cols-3 mb-10">
          {CREDIT_PACKS.map((pack) => (
            <div key={pack.id} className="rounded-[12px] border border-[var(--border)] p-5 bg-[var(--surface)]">
              <div className="flex items-baseline justify-between mb-1">
                <h4 className="text-[15px] font-semibold">{pack.name}</h4>
                {pack.bonus && <span className="text-[11.5px] text-[var(--accent)]">{pack.bonus}</span>}
              </div>
              <p className="mb-3"><span className="text-[24px] font-semibold">€{pack.priceEur}</span> <span className="text-[13px] text-[var(--text-dim)]">· {pack.credits} credits</span></p>
              {isOpen('pack', pack.id) ? (
                <NotifyMeForm source={`pricing:${pack.id}`} label="Credits aren't on sale yet. Leave your email and we'll tell you when they are." />
              ) : (
                <button onClick={() => open('pack', pack.id)} className="w-full h-[34px] rounded-[9px] text-[13px] font-medium border border-[var(--border)] hover:bg-[var(--surface-2)]">
                  Buy {pack.credits} credits
                </button>
              )}
            </div>
          ))}
        </div>

        <h3 className="text-[18px] font-semibold mb-4">What credits buy</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PAID_FEATURES.map((f) => (
            <div key={f.id} className="rounded-[12px] border border-[var(--border)] p-4 bg-[var(--surface)] flex flex-col">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <h4 className="text-[14px] font-semibold">{f.title}</h4>
                <span className="shrink-0 text-[12px] text-[var(--text-dim)]">
                  {f.credits == null ? 'Pro' : `${f.creditsNote === 'from' ? 'from ' : ''}${f.credits} cr${f.creditsNote && f.creditsNote !== 'from' ? ` ${f.creditsNote}` : ''}`}
                </span>
              </div>
              <p className="flex-1 text-[12.5px] text-[var(--text-dim)] mb-3">{f.description}</p>
              {isOpen('feature', f.id) ? (
                <NotifyMeForm compact source={`pricing:${f.id}`} label="Tell me when this launches." />
              ) : (
                <button onClick={() => open('feature', f.id)} className="self-start text-[12.5px] font-medium text-[var(--accent)] hover:underline">
                  I want this →
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
