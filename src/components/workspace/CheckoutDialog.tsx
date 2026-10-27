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
import { Dialog, Primary, Quiet } from './ui'

export type { CheckoutItem }

type Step = { at: 'review' } | { at: 'paying' } | { at: 'done'; outcome: CheckoutOutcome }

export default function CheckoutDialog({ item: initial, onClose, provider = previewProvider('paid'), defaultCountry = 'ES', onPaid }: {
  item: CheckoutItem
  onClose: () => void
  provider?: CheckoutProvider
  defaultCountry?: string
  onPaid?: (item: CheckoutItem) => void
}) {
  const [item, setItem] = useState(initial)
  const [buyer, setBuyer] = useState<Buyer>({ country: defaultCountry, business: false })
  const [startNow, setStartNow] = useState(false)
  const [terms, setTerms] = useState(false)
  const [step, setStep] = useState<Step>({ at: 'review' })
  const q = useMemo(() => quote(item, buyer), [item, buyer])

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
      <Dialog title="Opening secure payment" onClose={onClose} dismissable={false}>
        <div className="py-6 text-center" role="status">
          <p className="text-[14px] font-medium">{fmtEur(q.totalEur)} · {q.label}</p>
          <p className="mt-2 text-[12.5px] text-[var(--text-dim)]">You'll finish on our payment provider's page. Card details are entered there and never reach our servers.</p>
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
        <Dialog title="Payment complete" onClose={onClose} footer={<Primary onClick={onClose}>Go to workspace</Primary>}>
          <p className="text-[14px]"><span style={{ color: 'var(--ok)' }}>✓</span> {q.label} · {fmtEur(q.totalEur)}</p>
          <ul className="mt-3 space-y-1.5 text-[12.5px] text-[var(--text-dim)]">
            <li>{item.kind === 'pack' ? 'Credits are in your balance now.' : startNow ? 'Your plan and its credits are active now.' : 'Your plan starts now; cloud features unlock when the 14-day withdrawal period ends.'}</li>
            <li>The invoice is in Credits & billing and in your inbox. Reference {o.reference}.</li>
            {q.recurring && <li>Renews {q.recurring === 'yearly' ? 'every year' : 'every month'} until you cancel — one click, in Credits & billing.</li>}
          </ul>
        </Dialog>
      )
    }
    return (
      <Dialog title={o.status === 'canceled' ? 'Payment not completed' : 'Payment failed'} onClose={onClose}
        footer={<><Quiet onClick={onClose}>Close</Quiet><Primary onClick={() => setStep({ at: 'review' })}>Try again</Primary></>}>
        <p className="text-[13.5px]">{o.status === 'canceled' ? 'You left the payment page before paying. Nothing was charged.' : o.reason}</p>
        <p className="mt-2 text-[12.5px] text-[var(--text-dim)]">
          {o.status === 'failed' ? 'Nothing was charged. Try another card, or ask your bank to allow the payment.' : 'Your account is unchanged.'} The free tools keep working meanwhile.
        </p>
      </Dialog>
    )
  }

  const field = 'w-full h-[38px] sm:h-[34px] rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-[13px] text-[var(--text)]'

  return (
    <Dialog title="Confirm purchase" onClose={onClose}
      footer={<>
        <Quiet onClick={onClose}>Cancel</Quiet>
        <Primary onClick={pay} disabled={!canPay}>Pay {fmtEur(q.totalEur)}{q.recurring ? (q.recurring === 'yearly' ? ' / year' : ' / month') : ''}</Primary>
      </>}>
      {item.kind === 'plan' && (
        <div role="radiogroup" aria-label="Billing period" className="grid grid-cols-2 gap-2 mb-4">
          {(['monthly', 'yearly'] as const).map((period) => {
            const p = quote({ ...item, period }, buyer)
            const on = item.period === period
            return (
              <button key={period} role="radio" aria-checked={on} onClick={() => setItem({ ...item, period })}
                className={`text-left rounded-[9px] border px-3 py-2.5 ${on ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--border)]'}`}>
                <span className="block text-[12.5px] font-medium capitalize">{period}</span>
                <span className="block text-[12px] text-[var(--text-dim)] tabular-nums">{fmtEur(p.totalEur)} {period === 'yearly' ? '/ yr' : '/ mo'}</span>
                {period === 'yearly' && p.savingEur > 0 && <span className="block text-[11.5px] text-[var(--text-dim)]">Save {fmtEur(p.savingEur)}</span>}
              </button>
            )
          })}
        </div>
      )}

      <div className="rounded-[10px] bg-[var(--surface-2)] p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium">{q.label}</p>
            <p className="text-[12px] text-[var(--text-dim)]">{q.detail}</p>
          </div>
          <span className="text-[22px] font-semibold tabular-nums">{fmtEur(q.totalEur)}</span>
        </div>
        <dl className="mt-3 pt-3 border-t border-[var(--border)] grid grid-cols-[1fr_auto] gap-y-1 text-[12px] text-[var(--text-dim)] tabular-nums">
          <dt>Subtotal</dt><dd className="text-right">{fmtEur(q.netEur)}</dd>
          <dt>{q.reverseCharge ? 'VAT — reverse charge' : inEu ? `VAT ${q.vatRate}% (${buyer.country})` : 'VAT — not applicable outside the EU'}</dt>
          <dd className="text-right">{fmtEur(q.vatEur)}</dd>
        </dl>
      </div>
      <p className="mt-2 text-[11.5px] text-[var(--text-faint)]">
        {q.recurring ? 'Renews automatically until you cancel. Cancel any time from Credits & billing.' : 'One-off payment. Credits are valid for 12 months.'}
      </p>

      <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Billing details</legend>
        <label className="text-[12px] text-[var(--text-dim)] sm:col-span-1">
          Country
          <select className={`${field} mt-1`} value={buyer.country} onChange={(e) => setBuyer({ ...buyer, country: e.target.value })} autoComplete="country">
            {CHECKOUT_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[12.5px] sm:self-end sm:h-[34px]">
          <input type="checkbox" checked={buyer.business} onChange={(e) => setBuyer({ ...buyer, business: e.target.checked })} />
          Buying for a company
        </label>
        {buyer.business && (
          <>
            <label className="text-[12px] text-[var(--text-dim)]">
              Company name
              <input className={`${field} mt-1`} value={buyer.companyName ?? ''} onChange={(e) => setBuyer({ ...buyer, companyName: e.target.value })} autoComplete="organization" />
            </label>
            {vatIdShown && (
              <label className="text-[12px] text-[var(--text-dim)]">
                VAT ID <span className="text-[var(--text-faint)]">(optional)</span>
                <input className={`${field} mt-1 uppercase`} value={buyer.vatId ?? ''} placeholder={`${buyer.country === 'GR' ? 'EL' : buyer.country}…`}
                  onChange={(e) => setBuyer({ ...buyer, vatId: e.target.value })} aria-invalid={vatIdBad} aria-describedby="vat-hint" />
                <span id="vat-hint" className="block mt-1 text-[11px]" style={{ color: vatIdBad ? 'var(--danger)' : undefined }}>
                  {vatIdBad ? `Should start with ${buyer.country === 'GR' ? 'EL' : buyer.country}.` : buyer.country === 'ES' ? 'Shown on the invoice.' : 'With a valid ID you pay no VAT (reverse charge).'}
                </span>
              </label>
            )}
          </>
        )}
      </fieldset>

      <label className="mt-5 flex items-start gap-2.5 text-[12.5px]">
        <input type="checkbox" checked={startNow} onChange={(e) => setStartNow(e.target.checked)} className="mt-0.5 shrink-0" />
        <span>I want to use my credits and cloud features straight away, and I understand that I lose the 14-day right of withdrawal for whatever I have already used. Unused credits remain refundable within 14 days.</span>
      </label>
      <label className="mt-3 flex items-start gap-2.5 text-[12.5px]">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 shrink-0" />
        <span>I accept the Terms of Use and have read the Privacy Policy.</span>
      </label>
      {!startNow && terms && (
        <p className="mt-3 text-[11.5px] text-[var(--text-dim)]">Without the first box, cloud features unlock once the 14-day withdrawal period ends.</p>
      )}
    </Dialog>
  )
}
