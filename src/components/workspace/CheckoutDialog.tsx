// Checkout: review → payment page → result. The buyer sees the exact total
// (VAT for their country, or the B2B reverse charge) before leaving for the
// provider, and every way back — paid, cancelled, declined — has its own
// screen with the next step. The unticked consent box is the EU requirement
// for digital content supplied immediately (TRLGDCU art. 103 m,
// docs-planning/09 §2.4): without it the buyer keeps the 14-day withdrawal
// right on everything. The provider is injected (lib/pricing/checkout), so the
// preview stub and the real merchant of record share this screen.

import { useMemo, useState } from 'react'
import {
  quote, fmtEur, looksLikeVatId, CHECKOUT_COUNTRIES, EU_VAT_RATES, previewProvider,
  type Buyer, type CheckoutItem, type CheckoutOutcome, type CheckoutProvider,
} from '../../lib/pricing/checkout'
import { Dialog, Primary, Quiet, inputClass } from './ui'
import { useTx, wsLocale, type Tx } from './i18n'
import { PLANS, CREDIT_PACKS } from '../../lib/pricing/catalog'

/** What is being bought, in the page language. */
function itemText(item: CheckoutItem, tx: Tx): { label: string; detail: string } {
  if (item.kind === 'pack') {
    const p = CREDIT_PACKS.find((x) => x.id === item.pack)!
    return { label: tx('{{name}} pack', { name: tx(p.name) }), detail: tx('{{count}} credits · valid 12 months', { count: p.credits }) }
  }
  const plan = PLANS.find((x) => x.id === item.plan)!
  return {
    label: item.period === 'yearly' ? tx('{{plan}} — yearly', { plan: plan.name }) : tx('{{plan}} — monthly', { plan: plan.name }),
    detail: tx(plan.features[0] ?? plan.audience),
  }
}

export type { CheckoutItem }

type Step = { at: 'review' } | { at: 'paying' } | { at: 'done'; outcome: CheckoutOutcome }

export default function CheckoutDialog({ item: initial, onClose, provider = previewProvider('paid'), defaultCountry = 'ES', onPaid }: {
  item: CheckoutItem
  onClose: () => void
  provider?: CheckoutProvider
  defaultCountry?: string
  onPaid?: (item: CheckoutItem) => void
}) {
  const tx = useTx()
  const [item, setItem] = useState(initial)
  const [buyer, setBuyer] = useState<Buyer>({ country: defaultCountry, business: false })
  const [startNow, setStartNow] = useState(false)
  const [terms, setTerms] = useState(false)
  const [step, setStep] = useState<Step>({ at: 'review' })
  const q = useMemo(() => quote(item, buyer), [item, buyer])
  const text = itemText(item, tx)
  // Country names in the page language, sorted the way that language sorts.
  const countries = useMemo(() => {
    let names: Intl.DisplayNames | null = null
    try { names = new Intl.DisplayNames([wsLocale()], { type: 'region' }) } catch { /* old browser: English names */ }
    return CHECKOUT_COUNTRIES.map((c) => ({ code: c.code, name: names?.of(c.code) ?? c.name })).sort((a, b) => a.name.localeCompare(b.name, wsLocale()))
  }, [])

  const inEu = buyer.country in EU_VAT_RATES
  const vatIdShown = buyer.business && inEu
  const vatIdBad = vatIdShown && !!buyer.vatId && !looksLikeVatId(buyer.vatId, buyer.country)
  const canPay = terms && !vatIdBad && (!buyer.business || !!buyer.companyName?.trim())

  const pay = async () => {
    setStep({ at: 'paying' })
    const outcome = await provider.start(item, buyer, q).catch((e: unknown): CheckoutOutcome => ({ status: 'failed', reason: String(e) }))
    setStep({ at: 'done', outcome })
    if (outcome.status === 'paid') onPaid?.(item)
  }

  if (step.at === 'paying') {
    return (
      <Dialog title={tx("Opening secure payment")} onClose={onClose} dismissable={false}>
        <div className="py-6 text-center" role="status">
          <p className="text-[14px] font-medium">{fmtEur(q.totalEur)} · {text.label}</p>
          <p className="mt-2 text-[12.5px] text-[var(--text-dim)]">{tx("You'll finish on our payment provider's page. Card details are entered there and never reach our servers.")}</p>
          <div className="mt-5 mx-auto h-1 w-40 rounded-full bg-[var(--surface-2)] overflow-hidden" aria-hidden>
            <div className="h-full w-1/2 bg-[var(--text-dim)]" />
          </div>
        </div>
      </Dialog>
    )
  }

  if (step.at === 'done') {
    const o = step.outcome
    if (o.status === 'paid') {
      return (
        <Dialog title={tx("Payment complete")} onClose={onClose} footer={<Primary onClick={onClose}>{tx("Go to workspace")}</Primary>}>
          <p className="text-[14px]"><span style={{ color: 'var(--ok)' }}>✓</span> {text.label} · {fmtEur(q.totalEur)}</p>
          <ul className="mt-3 space-y-1.5 text-[12.5px] text-[var(--text-dim)]">
            <li>{item.kind === 'pack' ? tx("Credits are in your balance now.") : startNow ? tx("Your plan and its credits are active now.") : tx("Your plan starts now; cloud features unlock when the 14-day withdrawal period ends.")}</li>
            <li>{tx('The invoice is in Credits & billing and in your inbox. Reference {{ref}}.', { ref: o.reference })}</li>
            {q.recurring && <li>{q.recurring === 'yearly' ? tx('Renews every year until you cancel — one click, in Credits & billing.') : tx('Renews every month until you cancel — one click, in Credits & billing.')}</li>}
          </ul>
        </Dialog>
      )
    }
    return (
      <Dialog title={o.status === 'canceled' ? tx("Payment not completed") : tx("Payment failed")} onClose={onClose}
        footer={<><Quiet onClick={onClose}>{tx("Close")}</Quiet><Primary onClick={() => setStep({ at: 'review' })}>{tx("Try again")}</Primary></>}>
        <p className="text-[13.5px]">{o.status === 'canceled' ? tx("You left the payment page before paying. Nothing was charged.") : o.reason}</p>
        <p className="mt-2 text-[12.5px] text-[var(--text-dim)]">
          {o.status === 'failed' ? tx("Nothing was charged. Try another card, or ask your bank to allow the payment.") : tx("Your account is unchanged.")} {tx("The free tools keep working meanwhile.")}
        </p>
      </Dialog>
    )
  }

  const field = inputClass

  return (
    <Dialog title={tx("Confirm purchase")} onClose={onClose} size="lg"
      footer={<>
        <Quiet onClick={onClose}>{tx("Cancel")}</Quiet>
        <Primary onClick={pay} disabled={!canPay}>{q.recurring === 'yearly' ? tx('Pay {{amount}} / year', { amount: fmtEur(q.totalEur) }) : q.recurring ? tx('Pay {{amount}} / month', { amount: fmtEur(q.totalEur) }) : tx('Pay {{amount}}', { amount: fmtEur(q.totalEur) })}</Primary>
      </>}>
      <div className="grid gap-5 sm:grid-cols-[1fr_240px]">
        <div className="min-w-0 order-2 sm:order-1">
      {item.kind === 'plan' && (
        <div role="radiogroup" aria-label={tx("Billing period")} className="grid grid-cols-2 gap-2 mb-5">
          {(['monthly', 'yearly'] as const).map((period) => {
            const p = quote({ ...item, period }, buyer)
            const on = item.period === period
            return (
              <button key={period} role="radio" aria-checked={on} onClick={() => setItem({ ...item, period })}
                className={`text-left rounded-[9px] border px-3 py-2.5 ${on ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--border)]'}`}>
                <span className="block text-[13px] font-medium">{period === 'yearly' ? tx('Yearly') : tx('Monthly')}</span>
                <span className="block text-[12px] text-[var(--text-dim)] tabular-nums">{period === 'yearly' ? tx('{{amount}} / yr', { amount: fmtEur(p.totalEur) }) : tx('{{amount}} / mo', { amount: fmtEur(p.totalEur) })}</span>
                {period === 'yearly' && p.savingEur > 0 && <span className="block text-[11.5px] text-[var(--text-dim)]">{tx("Save")} {fmtEur(p.savingEur)}</span>}
              </button>
            )
          })}
        </div>
      )}

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">{tx("Billing details")}</legend>
        <label className="text-[12px] text-[var(--text-dim)] sm:col-span-1">
          {tx("Country")}
          <select className={`${field} mt-1`} value={buyer.country} onChange={(e) => setBuyer({ ...buyer, country: e.target.value })} autoComplete="country">
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[12.5px] sm:self-end sm:h-[34px]">
          <input type="checkbox" checked={buyer.business} onChange={(e) => setBuyer({ ...buyer, business: e.target.checked })} className="accent-[var(--accent)]" />
          {tx("Buying for a company")}
        </label>
        {buyer.business && (
          <>
            <label className="text-[12px] text-[var(--text-dim)]">
              {tx("Company name")}
              <input className={`${field} mt-1`} value={buyer.companyName ?? ''} onChange={(e) => setBuyer({ ...buyer, companyName: e.target.value })} autoComplete="organization" />
            </label>
            {vatIdShown && (
              <label className="text-[12px] text-[var(--text-dim)]">
                {tx("VAT ID")} <span className="text-[var(--text-faint)]">{tx("(optional)")}</span>
                <input className={`${field} mt-1 uppercase`} value={buyer.vatId ?? ''} placeholder={`${buyer.country === 'GR' ? 'EL' : buyer.country}…`}
                  onChange={(e) => setBuyer({ ...buyer, vatId: e.target.value })} aria-invalid={vatIdBad} aria-describedby="vat-hint" />
                <span id="vat-hint" className="block mt-1 text-[11px]" style={{ color: vatIdBad ? 'var(--danger)' : undefined }}>
                  {vatIdBad ? tx('Should start with {{prefix}}.', { prefix: buyer.country === 'GR' ? 'EL' : buyer.country }) : buyer.country === 'ES' ? tx("Shown on the invoice.") : tx("With a valid ID you pay no VAT (reverse charge).")}
                </span>
              </label>
            )}
          </>
        )}
      </fieldset>

      <label className="mt-5 flex items-start gap-2.5 text-[12.5px]">
        <input type="checkbox" checked={startNow} onChange={(e) => setStartNow(e.target.checked)} className="mt-0.5 shrink-0 accent-[var(--accent)]" />
        <span>{tx("I want to use my credits and cloud features straight away, and I understand that I lose the 14-day right of withdrawal for whatever I have already used. Unused credits remain refundable within 14 days.")}</span>
      </label>
      <label className="mt-3 flex items-start gap-2.5 text-[12.5px]">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 shrink-0 accent-[var(--accent)]" />
        <span>{tx("I accept the Terms of Use and have read the Privacy Policy.")}</span>
      </label>
      {!startNow && terms && (
        <p className="mt-3 text-[11.5px] text-[var(--text-dim)]">{tx("Without the first box, cloud features unlock once the 14-day withdrawal period ends.")}</p>
      )}
        </div>
        <div className="order-1 sm:order-2 sm:sticky sm:top-0 self-start">
      <div className="rounded-[10px] bg-[var(--surface-2)] p-4">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium">{text.label}</p>
          <p className="text-[12px] text-[var(--text-dim)]">{text.detail}</p>
        </div>
        <p className="mt-3 text-[24px] font-semibold tabular-nums tracking-[-0.015em]">{fmtEur(q.totalEur)}</p>
        <dl className="mt-3 pt-3 border-t border-[var(--border-strong)] grid grid-cols-[1fr_auto] gap-y-1 text-[12px] text-[var(--text-dim)] tabular-nums">
          <dt>{tx("Subtotal")}</dt><dd className="text-right">{fmtEur(q.netEur)}</dd>
          <dt>{q.reverseCharge ? tx("VAT — reverse charge") : inEu ? tx('VAT {{rate}}% ({{country}})', { rate: q.vatRate, country: buyer.country }) : tx("VAT — not applicable outside the EU")}</dt>
          <dd className="text-right">{fmtEur(q.vatEur)}</dd>
        </dl>
      </div>
      <p className="mt-2 text-[11.5px] text-[var(--text-faint)]">
        {q.recurring ? tx("Renews automatically until you cancel. Cancel any time from Credits & billing.") : tx("One-off payment. Credits are valid for 12 months.")}
      </p>

        </div>
      </div>
    </Dialog>
  )
}
