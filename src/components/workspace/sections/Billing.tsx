import { useState } from 'react'
import { CREDIT_PACKS, PLANS } from '../../../lib/pricing/catalog'
import { fmtEur } from '../../../lib/pricing/checkout'
import type { LedgerKind } from '../sample-data'
import type { SectionProps } from '../registry'
import { Panel, Head, SectionLabel, Primary, Quiet, SettingGroup, SettingRow, fmtInt } from '../ui'
import CreditBar from '../CreditBar'
import CancelFlow from '../CancelFlow'
import { useTx } from '../i18n'


// Money in and out is not good or bad news, so only expired credits get colour.
const KIND_COLOR: Record<LedgerKind, string> = { usage: 'var(--text-dim)', purchase: 'var(--text)', plan_grant: 'var(--text)', refund: 'var(--text)', expiry: 'var(--danger)' }
/** The pack most buyers should pick: best value without a year's worth of credits. */
const SUGGESTED_PACK = 'pack_19'

export default function Billing({ data, actions }: SectionProps) {
  const tx = useTx()
  const [cancelOpen, setCancelOpen] = useState(false)
  const a = data.account
  const plan = PLANS.find((p) => p.id === a.plan)!
  const yearly = a.billing === 'yearly'
  const canceled = a.status === 'canceled'
  const planLeft = a.credits.planMonthly - a.credits.planUsed

  return (
    <>
      <Head title={tx("Credits & billing")} />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Panel tour="credits" className="p-4 sm:p-5"><CreditBar data={data} onTopUp={actions.topUp} /></Panel>
        <Panel tour="plan" className="p-4 sm:p-5">
          <p className="text-[12px] text-[var(--text-dim)]">{tx("Plan")}</p>
          <p className="text-[16px] font-semibold mt-1">{yearly ? tx('{{plan}} · {{amount}}/year', { plan: plan.name, amount: fmtEur(plan.yearlyEur ?? 0) }) : tx('{{plan}} · {{amount}}/month', { plan: plan.name, amount: fmtEur(plan.monthlyEur ?? 0) })}</p>
          <p className="text-[12.5px] text-[var(--text-dim)] mt-1">
            {canceled ? tx('Ends {{date}}. Nothing more will be charged.', { date: a.renewsOn }) : <>{tx('Renews {{date}}.', { date: a.renewsOn })}{!yearly && plan.yearlyEur !== null && plan.monthlyEur !== null && <> {tx('Yearly saves {{amount}}.', { amount: fmtEur(plan.monthlyEur * 12 - plan.yearlyEur) })}</>}</>}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {canceled
              ? <Primary onClick={() => {}}>{tx("Resume plan")}</Primary>
              : <>
                  {!yearly && a.plan !== 'team' && <Quiet onClick={() => actions.buy({ kind: 'plan', plan: a.plan, period: 'yearly' })}>{tx("Switch to yearly")}</Quiet>}
                  {a.plan === 'pro' && <Quiet onClick={() => actions.buy({ kind: 'plan', plan: 'team', period: a.billing })}>{tx("Upgrade to Team")}</Quiet>}
                  <Quiet onClick={() => setCancelOpen(true)}>{tx("Cancel plan")}</Quiet>
                </>}
          </div>
          <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center gap-3">
            <span aria-hidden className="h-[22px] px-1.5 grid place-items-center rounded-[4px] border border-[var(--border)] text-[10px] font-semibold">{a.card.brand.toUpperCase()}</span>
            <span className="flex-1 text-[12.5px] tabular-nums">•••• {a.card.last4} <span className="text-[var(--text-faint)]">· {tx('expires {{date}}', { date: a.card.expires })}</span></span>
            <button className="text-[12.5px] text-[var(--accent)] hover:underline min-h-[32px]">{tx("Update")}</button>
          </div>
        </Panel>
      </div>

      <div className="mt-8"><SectionLabel id="topup">{tx("Top up")}</SectionLabel></div>
      <p className="-mt-1 mb-3 text-[12.5px] text-[var(--text-dim)]">{tx("Packs last 12 months and are spent after your plan credits.")}</p>
      <div className="grid gap-3 sm:grid-cols-3" data-tour="packs">
        {CREDIT_PACKS.map((p) => {
          const suggested = p.id === SUGGESTED_PACK
          return (
            <Panel key={p.id} className={`p-4 flex flex-col ${suggested ? 'border-[var(--border-strong,var(--text-faint))]' : ''}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13.5px] font-medium">{tx(p.name)}</p>
                {suggested && <span className="text-[11px] text-[var(--text-dim)] whitespace-nowrap">{tx("Most bought")}</span>}
              </div>
              <p className="mt-2 text-[22px] font-semibold tabular-nums">{fmtEur(p.priceEur)}</p>
              <p className="text-[12.5px] tabular-nums">{tx('{{n}} credits', { n: fmtInt(p.credits) })} {p.bonus && <span className="text-[11.5px] text-[var(--text-dim)]">{p.bonus}</span>}</p>
              <p className="text-[11.5px] text-[var(--text-faint)] tabular-nums">{tx('{{price}} per 100 · ≈ {{n}} auto-fixes', { price: fmtEur(Math.round((p.priceEur / p.credits) * 1000) / 10), n: Math.floor(p.credits / 30) })}</p>
              <div className="mt-auto pt-4">
                {suggested
                  ? <Primary className="w-full" onClick={() => actions.buy({ kind: 'pack', pack: p.id })}>{tx('Buy {{name}}', { name: tx(p.name) })}</Primary>
                  : <Quiet className="w-full" onClick={() => actions.buy({ kind: 'pack', pack: p.id })}>{tx('Buy {{name}}', { name: tx(p.name) })}</Quiet>}
              </div>
            </Panel>
          )
        })}
      </div>

      <div className="grid gap-6 lg:gap-4 lg:grid-cols-2 mt-8">
        <div className="min-w-0" data-tour="ledger">
          <SectionLabel id="ledger">{tx("Credit history")}</SectionLabel>
          <Panel>
            <ul className="divide-y divide-[var(--border)] text-[13px]">
              {data.ledger.map((e, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-[11.5px] text-[var(--text-faint)] w-[78px] shrink-0 tabular-nums">{e.date}</span>
                  <span className="flex-1 min-w-0 [overflow-wrap:anywhere]">{tx(e.description)}</span>
                  <span className="tabular-nums shrink-0" style={{ color: KIND_COLOR[e.kind] }}>{e.credits > 0 ? '+' : '−'}{Math.abs(e.credits)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <div className="min-w-0">
          <SectionLabel>{tx("Invoices")}</SectionLabel>
          <Panel>
            <ul className="divide-y divide-[var(--border)] text-[13px]">
              {data.invoices.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-[11.5px] text-[var(--text-faint)] w-[78px] shrink-0 tabular-nums">{inv.date}</span>
                  <span className="flex-1 min-w-0 [overflow-wrap:anywhere]">{tx(inv.description)}</span>
                  <span className="tabular-nums shrink-0">{fmtEur(inv.amountEur)}</span>
                  <button className="text-[12px] text-[var(--accent)] hover:underline shrink-0 min-h-[32px]" aria-label={tx('Download invoice {{id}}', { id: inv.id })}>{tx("PDF")}</button>
                </li>
              ))}
            </ul>
          </Panel>
          <p className="text-[11.5px] text-[var(--text-faint)] mt-2">{tx("Prices include VAT where applicable. Invoices are issued by our payment provider; your company name and VAT ID go on them.")}</p>
        </div>
      </div>

      <div className="mt-8">
        <SettingGroup title={tx("Billing details")} tour="billing-details">
          <SettingRow title={a.org} detail={tx("Carrer de Pau Claris 100, 08009 Barcelona, ES · VAT ID ESB12345678")}>
            <Quiet>{tx("Edit")}</Quiet>
          </SettingRow>
          <SettingRow title={tx("Invoice email")} detail={tx('{{email}} · add a second address for your accounts team', { email: a.email })}>
            <Quiet>{tx("Edit")}</Quiet>
          </SettingRow>
          <SettingRow title={tx("Something wrong with a charge?")} detail={tx("Wrong amount, missing VAT ID, a double charge — we fix it within 1 working day.")}>
            <Quiet onClick={() => actions.contact('billing')}>{tx("Contact billing")}</Quiet>
          </SettingRow>
        </SettingGroup>
      </div>

      {cancelOpen && <CancelFlow renewsOn={a.renewsOn} credits={planLeft} onClose={() => setCancelOpen(false)} onYearly={() => actions.buy({ kind: 'plan', plan: a.plan, period: 'yearly' })} onContact={actions.contact} />}
    </>
  )
}
