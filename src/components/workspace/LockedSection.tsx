// What a section looks like to a plan that doesn't include it: what it does,
// what the upgrade costs on top of the current plan, one button. Reused by
// every gated screen, so new higher-tier features need no upsell of their own.

import { Check } from 'lucide-react'
import { PLANS } from '../../lib/pricing/catalog'
import { fmtEur, type CheckoutItem } from '../../lib/pricing/checkout'
import type { PaidPlan, SectionDef } from './registry'
import { Head, Panel, Primary } from './ui'
import { useTx } from './i18n'


export default function LockedSection({ section, current, period, onUpgrade }: {
  section: SectionDef
  current: PaidPlan
  period: 'monthly' | 'yearly'
  onUpgrade: (item: CheckoutItem) => void
}) {
  const tx = useTx()
  const target = PLANS.find((p) => p.id === section.requires)!
  const from = PLANS.find((p) => p.id === current)!
  const key = period === 'yearly' ? 'yearlyEur' : 'monthlyEur'
  const extra = (target[key] ?? 0) - (from[key] ?? 0)
  return (
    <>
      <Head title={tx(section.label)} sub={section.pitch ? tx(section.pitch) : undefined} />
      <div className="grid gap-4 lg:grid-cols-[1fr_280px] items-start max-w-[860px]">
        <Panel className="p-4 sm:p-5">
          <h2 className="text-[13px] font-medium text-[var(--text-dim)]">{tx('Included in {{plan}}', { plan: target.name })}</h2>
          <ul className="mt-3 space-y-2.5 text-[13.5px]">
            {target.features.map((f) => (
              <li key={f} className="flex gap-2.5"><Check aria-hidden size={15} className="mt-[3px] shrink-0 text-[var(--accent-2)]" /><span>{tx(f)}</span></li>
            ))}
          </ul>
        </Panel>
        <Panel className="p-4 sm:p-5">
          <p className="text-[22px] font-semibold tabular-nums tracking-[-0.015em]">+{fmtEur(extra)}</p>
          <p className="mt-0.5 text-[12.5px] text-[var(--text-dim)]">{period === 'yearly' ? tx('per year, on top of your plan') : tx('per month, on top of your plan')}</p>
          <p className="mt-0.5 text-[12.5px] text-[var(--text-dim)]">{tx(target.audience)}</p>
          <Primary className="mt-4 w-full" onClick={() => section.requires !== 'pro' && onUpgrade({ kind: 'plan', plan: section.requires, period })}>{tx('Upgrade to {{plan}}', { plan: target.name })}</Primary>
        </Panel>
      </div>
    </>
  )
}
