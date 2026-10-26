// What a section looks like to a plan that doesn't include it: what it does,
// what the upgrade costs on top of the current plan, one button. Reused by
// every gated screen, so new higher-tier features need no upsell of their own.

import { PLANS } from '../../lib/pricing/catalog'
import { fmtEur, type CheckoutItem } from '../../lib/pricing/checkout'
import type { PaidPlan, SectionDef } from './registry'
import { Head, Panel, Primary } from './ui'

export default function LockedSection({ section, current, period, onUpgrade }: {
  section: SectionDef
  current: PaidPlan
  period: 'monthly' | 'yearly'
  onUpgrade: (item: CheckoutItem) => void
}) {
  const target = PLANS.find((p) => p.id === section.requires)!
  const from = PLANS.find((p) => p.id === current)!
  const key = period === 'yearly' ? 'yearlyEur' : 'monthlyEur'
  const extra = (target[key] ?? 0) - (from[key] ?? 0)
  const Icon = section.icon
  return (
    <>
      <Head title={section.label} />
      <Panel className="p-5 sm:p-8 max-w-[640px]">
        <Icon aria-hidden size={22} className="text-[var(--text-dim)]" />
        <p className="mt-3 text-[15px] font-semibold">Available on the {target.name} plan</p>
        {section.pitch && <p className="mt-1 text-[13px]">{section.pitch}</p>}
        <ul className="mt-3 space-y-1.5 text-[13px] text-[var(--text-dim)]">
          {target.features.map((f) => <li key={f}>· {f}</li>)}
        </ul>
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <Primary onClick={() => section.requires !== 'pro' && onUpgrade({ kind: 'plan', plan: section.requires, period })}>Upgrade to {target.name}</Primary>
          <span className="text-[12.5px] text-[var(--text-dim)] tabular-nums">{fmtEur(extra)} more per {period === 'yearly' ? 'year' : 'month'} · prorated today</span>
        </div>
      </Panel>
    </>
  )
}
