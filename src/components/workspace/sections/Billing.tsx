import { useState } from 'react'
import { CREDIT_PACKS, PLANS } from '../../../lib/pricing/catalog'
import { fmtEur } from '../../../lib/pricing/checkout'
import type { LedgerKind } from '../sample-data'
import type { SectionProps } from '../registry'
import { Panel, Head, SectionLabel, Primary, Quiet, SettingGroup, SettingRow, fmtInt } from '../ui'
import CreditBar from '../CreditBar'
import CancelFlow from '../CancelFlow'

// Money in and out is not good or bad news, so only expired credits get colour.
const KIND_COLOR: Record<LedgerKind, string> = { usage: 'var(--text-dim)', purchase: 'var(--text)', plan_grant: 'var(--text)', refund: 'var(--text)', expiry: 'var(--danger)' }
/** The pack most buyers should pick: best value without a year's worth of credits. */
const SUGGESTED_PACK = 'pack_19'

export default function Billing({ data, actions }: SectionProps) {
  const [cancelOpen, setCancelOpen] = useState(false)
  const a = data.account
  const plan = PLANS.find((p) => p.id === a.plan)!
  const yearly = a.billing === 'yearly'
  const canceled = a.status === 'canceled'
  const planLeft = a.credits.planMonthly - a.credits.planUsed

  return (
    <>
      <Head title="Credits & billing" />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Panel className="p-4 sm:p-5"><CreditBar data={data} onTopUp={actions.topUp} /></Panel>
        <Panel className="p-4 sm:p-5">
          <p className="text-[12px] text-[var(--text-dim)]">Plan</p>
          <p className="text-[16px] font-semibold mt-1">{plan.name} · {fmtEur((yearly ? plan.yearlyEur : plan.monthlyEur) ?? 0)}/{yearly ? 'year' : 'month'}</p>
          <p className="text-[12.5px] text-[var(--text-dim)] mt-1">
            {canceled ? <>Ends {a.renewsOn}. Nothing more will be charged.</> : <>Renews {a.renewsOn}.{!yearly && plan.yearlyEur !== null && plan.monthlyEur !== null && <> Yearly saves {fmtEur(plan.monthlyEur * 12 - plan.yearlyEur)}.</>}</>}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {canceled
              ? <Primary onClick={() => {}}>Resume plan</Primary>
              : <>
                  {!yearly && a.plan !== 'team' && <Quiet onClick={() => actions.buy({ kind: 'plan', plan: a.plan, period: 'yearly' })}>Switch to yearly</Quiet>}
                  {a.plan === 'pro' && <Quiet onClick={() => actions.buy({ kind: 'plan', plan: 'team', period: a.billing })}>Upgrade to Team</Quiet>}
                  <Quiet onClick={() => setCancelOpen(true)}>Cancel plan</Quiet>
                </>}
          </div>
          <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center gap-3">
            <span aria-hidden className="h-[22px] px-1.5 grid place-items-center rounded-[4px] border border-[var(--border)] text-[10px] font-semibold">{a.card.brand.toUpperCase()}</span>
            <span className="flex-1 text-[12.5px] tabular-nums">•••• {a.card.last4} <span className="text-[var(--text-faint)]">· expires {a.card.expires}</span></span>
            <button className="text-[12.5px] text-[var(--accent)] hover:underline min-h-[32px]">Update</button>
          </div>
        </Panel>
      </div>

      <div className="mt-8"><SectionLabel id="topup">Top up</SectionLabel></div>
      <p className="-mt-1 mb-3 text-[12.5px] text-[var(--text-dim)]">Packs last 12 months and are spent after your plan credits.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {CREDIT_PACKS.map((p) => {
          const suggested = p.id === SUGGESTED_PACK
          return (
            <Panel key={p.id} className={`p-4 flex flex-col ${suggested ? 'border-[var(--border-strong,var(--text-faint))]' : ''}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13.5px] font-medium">{p.name}</p>
                {suggested && <span className="text-[11px] text-[var(--text-dim)] whitespace-nowrap">Most bought</span>}
              </div>
              <p className="mt-2 text-[22px] font-semibold tabular-nums">{fmtEur(p.priceEur)}</p>
              <p className="text-[12.5px] tabular-nums">{fmtInt(p.credits)} credits {p.bonus && <span className="text-[11.5px] text-[var(--text-dim)]">{p.bonus}</span>}</p>
              <p className="text-[11.5px] text-[var(--text-faint)] tabular-nums">{fmtEur(Math.round((p.priceEur / p.credits) * 1000) / 10)} per 100 · ≈ {Math.floor(p.credits / 30)} auto-fixes</p>
              <div className="mt-auto pt-4">
                {suggested
                  ? <Primary className="w-full" onClick={() => actions.buy({ kind: 'pack', pack: p.id })}>Buy {p.name}</Primary>
                  : <Quiet className="w-full" onClick={() => actions.buy({ kind: 'pack', pack: p.id })}>Buy {p.name}</Quiet>}
              </div>
            </Panel>
          )
        })}
      </div>

      <div className="grid gap-6 lg:gap-4 lg:grid-cols-2 mt-8">
        <div className="min-w-0">
          <SectionLabel>Credit history</SectionLabel>
          <Panel>
            <ul className="divide-y divide-[var(--border)] text-[13px]">
              {data.ledger.map((e, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-[11.5px] text-[var(--text-faint)] w-[78px] shrink-0 tabular-nums">{e.date}</span>
                  <span className="flex-1 min-w-0 [overflow-wrap:anywhere]">{e.description}</span>
                  <span className="tabular-nums shrink-0" style={{ color: KIND_COLOR[e.kind] }}>{e.credits > 0 ? '+' : '−'}{Math.abs(e.credits)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <div className="min-w-0">
          <SectionLabel>Invoices</SectionLabel>
          <Panel>
            <ul className="divide-y divide-[var(--border)] text-[13px]">
              {data.invoices.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-[11.5px] text-[var(--text-faint)] w-[78px] shrink-0 tabular-nums">{inv.date}</span>
                  <span className="flex-1 min-w-0 [overflow-wrap:anywhere]">{inv.description}</span>
                  <span className="tabular-nums shrink-0">{fmtEur(inv.amountEur)}</span>
                  <button className="text-[12px] text-[var(--accent)] hover:underline shrink-0 min-h-[32px]" aria-label={`Download invoice ${inv.id}`}>PDF</button>
                </li>
              ))}
            </ul>
          </Panel>
          <p className="text-[11.5px] text-[var(--text-faint)] mt-2">Prices include VAT where applicable. Invoices are issued by our payment provider; your company name and VAT ID go on them.</p>
        </div>
      </div>

      <div className="mt-8">
        <SettingGroup title="Billing details">
          <SettingRow title={a.org} detail="Carrer de Pau Claris 100, 08009 Barcelona, ES · VAT ID ESB12345678">
            <Quiet>Edit</Quiet>
          </SettingRow>
          <SettingRow title="Invoice email" detail={`${a.email} · add a second address for your accounts team`}>
            <Quiet>Edit</Quiet>
          </SettingRow>
          <SettingRow title="Something wrong with a charge?" detail="Wrong amount, missing VAT ID, a double charge — we fix it within 1 working day.">
            <Quiet onClick={() => actions.contact('billing')}>Contact billing</Quiet>
          </SettingRow>
        </SettingGroup>
      </div>

      {cancelOpen && <CancelFlow renewsOn={a.renewsOn} credits={planLeft} onClose={() => setCancelOpen(false)} onYearly={() => actions.buy({ kind: 'plan', plan: a.plan, period: 'yearly' })} onContact={actions.contact} />}
    </>
  )
}
