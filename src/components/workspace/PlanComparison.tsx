// Free, Pro, Team, Reception and Enterprise side by side, with the prices of
// doc 12 §2 (lib/plans/plans.ts). Free leads and says plainly that it stays
// free: the paid plans add servers, records and teams, they take nothing away.

import { Check } from 'lucide-react'
import { PLAN_DEFS } from '../../lib/plans/plans'
import { fmtEur } from '../../lib/pricing/checkout'
import { Panel } from './ui'
import { useTx } from './i18n'

type Key = 'free' | 'pro' | 'team' | 'reception' | 'enterprise'
const def = (k: Key) => PLAN_DEFS.find((p) => p.key === k)!

export default function PlanComparison({ current, onPick, onContact }: { current?: Key; onPick?: (k: 'pro' | 'team') => void; onContact?: () => void }) {
  const tx = useTx()
  const yearlyMonth = (k: Key) => Math.round((def(k).yearlyEur ?? 0) / 12)
  const cols: { key: Key; name: string; price: string; note: string; gain: string; items: string[] }[] = [
    { key: 'free', name: tx('Free'), price: fmtEur(0), note: tx('Forever. No card, no account needed.'),
      gain: tx('Open, check and share any IFC in your browser.'),
      items: [tx('Viewer, measure, section, multi-model'), tx('Health Score, rule checks and IDS'), tx('Requirements links, delivery report, BCF'), tx('Files never leave your browser')] },
    { key: 'pro', name: tx('Pro'), price: tx('{{amount}} / month', { amount: fmtEur(yearlyMonth('pro')) }), note: tx('Billed yearly · {{amount}} month to month', { amount: fmtEur(def('pro').monthlyEur ?? 0) }),
      gain: tx('Your file opens, your client sees it and there is a record.'),
      items: [tx('Files up to 1 GB on EU servers'), tx('Projects with every version and its score'), tx('Client link with password and expiry'), tx('Verifiable certificates with your logo')] },
    { key: 'team', name: tx('Team'), price: tx('{{amount}} / editor / month', { amount: fmtEur(yearlyMonth('team')) }), note: tx('Billed yearly · minimum 3 editors · reviewers and guests free'),
      gain: tx('Nothing leaves your company wrong, and your record proves it.'),
      items: [tx('Quality gate on every upload'), tx('House standard shared across projects'), tx('Team BCF issues and automations'), tx('Value report for the board')] },
    { key: 'reception', name: tx('Reception'), price: tx('from {{amount}} / month', { amount: fmtEur(def('reception').fromEur ?? 0) }), note: tx('Per active project, up to 15 suppliers'),
      gain: tx('Only what complies reaches you, and you know who delivers well.'),
      items: [tx('Delivery inbox that checks before you look'), tx('Accept or return with the reasons'), tx('Supplier record and sealed register'), tx('Close-out report for the client')] },
    { key: 'enterprise', name: tx('Enterprise'), price: tx('from {{amount}} / year', { amount: fmtEur(def('enterprise').fromEur ?? 0) }), note: tx('Whole portfolio, by agreement'),
      gain: tx('Reception everywhere, with SSO, DPA and your own deployment.'),
      items: [tx('Reception on every project'), tx('SSO, SLA and DPA'), tx('Isolated on-premise deployment')] },
  ]
  return (
    <section aria-labelledby="plans" data-tour="plans">
      <h2 id="plans" className="text-[13px] font-medium text-[var(--text-dim)] mb-1">{tx('Plans')}</h2>
      <p className="mb-3 text-[12.5px] text-[var(--text-dim)] max-w-[680px]">{tx('What is free today stays free. Paid plans add servers, records and a team on top; they never take a free tool away.')}</p>
      {/* Scrolls sideways on phones instead of squeezing five columns. */}
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto snap-x snap-mandatory">
        <ol className="grid grid-flow-col auto-cols-[78%] sm:auto-cols-[44%] lg:auto-cols-fr gap-3 pb-1">
          {cols.map((c) => {
            const here = c.key === current
            return (
              <li key={c.key} className="snap-start min-w-0">
                <Panel className={`h-full p-4 flex flex-col ${here ? 'border-[var(--text-faint)]' : ''}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[13.5px] font-semibold">{c.name}</p>
                    {here && <span className="text-[11px] text-[var(--text-dim)] whitespace-nowrap">{tx('Your plan')}</span>}
                  </div>
                  <p className="mt-2 text-[17px] font-semibold tabular-nums [overflow-wrap:anywhere]">{c.price}</p>
                  <p className="mt-0.5 text-[11.5px] text-[var(--text-faint)] leading-[1.45]">{c.note}</p>
                  <p className="mt-3 text-[12.5px] leading-[1.45]">{c.gain}</p>
                  <ul className="mt-3 space-y-1.5 text-[12px] text-[var(--text-dim)]">
                    {c.items.map((it) => <li key={it} className="flex gap-2"><Check aria-hidden size={13} className="mt-[3px] shrink-0 text-[var(--accent-2,var(--accent))]" /><span>{it}</span></li>)}
                  </ul>
                  <div className="mt-auto pt-4">
                    {here || c.key === 'free' ? null
                      : (c.key === 'pro' || c.key === 'team') && onPick
                        ? <button onClick={() => onPick(c.key as 'pro' | 'team')} className="w-full h-[36px] sm:h-[32px] rounded-[8px] border border-[var(--border)] text-[12.5px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]">{tx('Choose {{plan}}', { plan: c.name })}</button>
                        : onContact && <button onClick={onContact} className="w-full h-[36px] sm:h-[32px] rounded-[8px] border border-[var(--border)] text-[12.5px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]">{tx('Talk to us')}</button>}
                  </div>
                </Panel>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
