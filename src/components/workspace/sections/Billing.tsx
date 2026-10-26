import { useState } from 'react'
import { CREDIT_PACKS, PLANS } from '../../../lib/pricing/catalog'
import { fmtEur } from '../../../lib/pricing/checkout'
import type { LedgerKind } from '../sample-data'
import type { SectionProps } from '../registry'
import { Panel, Head, SectionLabel, Primary, Quiet, Dialog, fmtInt } from '../ui'
import CreditBar from '../CreditBar'

const KIND_COLOR: Record<LedgerKind, string> = { usage: 'var(--text)', purchase: 'var(--ok)', plan_grant: 'var(--ok)', refund: 'var(--ok)', expiry: 'var(--danger)' }
/** The pack most buyers should pick: best value without a year's worth of credits. */
const SUGGESTED_PACK = 'pack_19'

function CancelDialog({ renewsOn, credits, onClose }: { renewsOn: string; credits: number; onClose: () => void }) {
  return (
    <Dialog title="Cancel your plan?" onClose={onClose}
      footer={<><Quiet onClick={onClose}>Cancel plan at period end</Quiet><Primary onClick={onClose}>Keep my plan</Primary></>}>
      <p className="text-[13.5px]">Your plan stays active until <b>{renewsOn}</b>. After that:</p>
      <ul className="mt-3 space-y-1.5 text-[12.5px] text-[var(--text-dim)]">
        <li>· The {credits} plan credits you have left expire; pack credits stay until their own date.</li>
        <li>· Projects become read-only. Certificates you issued stay verifiable.</li>
        <li>· The viewer, Health Score and IDS checks stay free, as always.</li>
      </ul>
      <p className="mt-4 text-[12px] text-[var(--text-faint)]">You can resume any time before {renewsOn} without paying again.</p>
    </Dialog>
  )
}

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
            <Panel key={p.id} className={`p-4 flex flex-col ${suggested ? 'border-[var(--accent)]' : ''}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13.5px] font-medium">{p.name}</p>
                {suggested && <span className="text-[11px] text-[var(--accent)]">Most bought</span>}
              </div>
              <p className="mt-2 text-[22px] font-semibold tabular-nums">{fmtEur(p.priceEur)}</p>
              <p className="text-[12.5px] tabular-nums">{fmtInt(p.credits)} credits {p.bonus && <span className="text-[11.5px]" style={{ color: 'var(--ok)' }}>{p.bonus}</span>}</p>
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
                  <span className="flex-1 min-w-0 truncate">{e.description}</span>
                  <span className="tabular-nums shrink-0" style={{ color: KIND_COLOR[e.kind] }}>{e.credits > 0 ? '+' : ''}{e.credits}</span>
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
                  <span className="flex-1 min-w-0 truncate">{inv.description}</span>
                  <span className="tabular-nums shrink-0">{fmtEur(inv.amountEur)}</span>
                  <button className="text-[12px] text-[var(--accent)] hover:underline shrink-0 min-h-[32px]" aria-label={`Download invoice ${inv.id}`}>PDF</button>
                </li>
              ))}
            </ul>
          </Panel>
          <p className="text-[11.5px] text-[var(--text-faint)] mt-2">Prices include VAT where applicable. Invoices are issued by our payment provider; your company name and VAT ID go on them.</p>
        </div>
      </div>

      {cancelOpen && <CancelDialog renewsOn={a.renewsOn} credits={planLeft} onClose={() => setCancelOpen(false)} />}
    </>
  )
}
