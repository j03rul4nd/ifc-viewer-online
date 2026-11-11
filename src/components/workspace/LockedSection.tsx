// What a section looks like to a plan that doesn't include it. Not an empty
// padlock: the real screen, on sample data, behind glass — so the buyer sees
// what they would get — plus what the upgrade costs on top of the current plan
// and one button. Reused by every gated screen, so new higher-tier features
// need no upsell of their own.

import type { ReactNode } from 'react'
import { Check, Lock } from 'lucide-react'
import { PLANS } from '../../lib/pricing/catalog'
import { fmtEur, type CheckoutItem } from '../../lib/pricing/checkout'
import type { PaidPlan, SectionDef } from './registry'
import { Head, Panel, Primary } from './ui'
import { useTx } from './i18n'

export default function LockedSection({ section, current, period, onUpgrade, preview }: {
  section: SectionDef
  current: PaidPlan
  period: 'monthly' | 'yearly'
  onUpgrade: (item: CheckoutItem) => void
  /** The section itself rendered on sample data; shown read-only behind the offer. */
  preview?: ReactNode
}) {
  const tx = useTx()
  const target = PLANS.find((p) => p.id === section.requires)!
  const from = PLANS.find((p) => p.id === current)!
  const key = period === 'yearly' ? 'yearlyEur' : 'monthlyEur'
  const extra = (target[key] ?? 0) - (from[key] ?? 0)
  const offer = (
    <Panel className="p-4 sm:p-5 shadow-xl">
      <p className="flex items-center gap-1.5 text-[12px] text-[var(--text-dim)]"><Lock aria-hidden size={12} />{tx('Included in {{plan}}', { plan: target.name })}</p>
      {preview && section.pitch && <p className="mt-2 text-[13.5px] font-medium leading-[1.45] [overflow-wrap:anywhere]">{tx(section.pitch)}</p>}
      <p className="mt-2 text-[22px] font-semibold tabular-nums tracking-[-0.015em]">+{fmtEur(extra)}</p>
      <p className="mt-0.5 text-[12.5px] text-[var(--text-dim)]">{period === 'yearly' ? tx('per year, on top of your plan') : tx('per month, on top of your plan')}</p>
      <ul className="mt-3 space-y-2 text-[13px]">
        {target.features.slice(0, 4).map((f) => (
          <li key={f} className="flex gap-2.5"><Check aria-hidden size={14} className="mt-[3px] shrink-0 text-[var(--accent-2,var(--accent))]" /><span>{tx(f)}</span></li>
        ))}
      </ul>
      <Primary className="mt-4 w-full" onClick={() => section.requires !== 'pro' && onUpgrade({ kind: 'plan', plan: section.requires, period })}>{tx('Upgrade to {{plan}}', { plan: target.name })}</Primary>
      <p className="mt-2 text-[11.5px] text-[var(--text-faint)]">{tx('Everything on your current plan stays as it is.')}</p>
    </Panel>
  )

  if (!preview) {
    return (
      <>
        <Head title={tx(section.label)} sub={section.pitch ? tx(section.pitch) : undefined} />
        <div className="max-w-[420px]">{offer}</div>
      </>
    )
  }

  return (
    <div data-locked-preview>
      <p className="mb-3 text-[12px] text-[var(--text-dim)]">{tx('Preview on sample data — this is the real screen you get with {{plan}}.', { plan: target.name })}</p>
      <div className="relative">
        {/* The real screen, inert: it can't be clicked, tabbed into or read twice by a screen reader. */}
        <div aria-hidden inert className="pointer-events-none select-none max-h-[620px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)] opacity-90">
          {preview}
        </div>
        <div className="absolute inset-x-0 bottom-0 sm:bottom-6 flex justify-center px-0 sm:px-4">
          <div className="w-full sm:w-[380px]" data-tour="locked-offer">
            <h1 className="sr-only">{tx(section.label)}</h1>
            {offer}
          </div>
        </div>
      </div>
    </div>
  )
}
