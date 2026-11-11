// The front of the paid workspace: what the buyer gets back, in hours and
// euros, before any list of features. It is an estimate until there is
// measured data, so it says so and shows every assumption beside the result.
// The calculator asks about the buyer's work (deliveries, review hours, cost
// of an hour) and never what they would pay: the cost side is our list price.

import { useState } from 'react'
import { fmtEur } from '../../lib/pricing/checkout'
import { GAIN_ASSUMPTIONS, GAIN_DEFAULTS, estimateGain, type GainInput, type GainPlan } from './gain'
import { Field, Panel, inputClass } from './ui'
import { useTx, wsLocale } from './i18n'

const PLAN_NAME: Record<GainPlan, string> = { pro: 'Pro', team: 'Team', reception: 'Reception' }
const num = (n: number, digits = 1) => new Intl.NumberFormat(wsLocale(), { maximumFractionDigits: digits }).format(n)
const pct = (n: number) => `${Math.round(n * 100)} %`

export default function GainPanel({ plan, compact = false }: { plan: GainPlan; compact?: boolean }) {
  const tx = useTx()
  const [input, setInput] = useState<GainInput>(GAIN_DEFAULTS)
  // Text as typed (so "2," survives while typing), the number for the maths.
  const [raw, setRaw] = useState<Record<keyof GainInput, string>>({ deliveriesPerMonth: '12', reviewHours: num(2.5), hourlyEur: '45' })
  const g = estimateGain(input, plan)
  const a = GAIN_ASSUMPTIONS
  const set = (k: keyof GainInput) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/[^\d.,]/g, '')
    setRaw((r) => ({ ...r, [k]: v }))
    const n = parseFloat(v.replace(',', '.'))
    setInput((i) => ({ ...i, [k]: Number.isFinite(n) ? n : 0 }))
  }
  const name = tx(PLAN_NAME[plan])

  return (
    <section aria-labelledby="gain" className="mb-6" data-tour="gain">
      <Panel className="p-4 sm:p-5 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="gain" className="text-[13px] font-medium text-[var(--text-dim)]">{tx('What you get back each month')}</h2>
          <span className="text-[11px] px-1.5 py-0.5 rounded-[5px] border border-[var(--border)] text-[var(--text-faint)]">{tx('Estimate · your figures, our assumptions')}</span>
        </div>

        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div className="min-w-0">
            <p className="text-[30px] sm:text-[34px] leading-none font-semibold tabular-nums tracking-[-0.02em]" data-gain-hours>{tx('{{n}} h', { n: num(g.hours) })}</p>
            <p className="mt-1.5 text-[12.5px] text-[var(--text-dim)]">{tx('of checking you stop doing by hand')}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[30px] sm:text-[34px] leading-none font-semibold tabular-nums tracking-[-0.02em]" data-gain-eur>{fmtEur(g.savedEur)}</p>
            <p className="mt-1.5 text-[12.5px] text-[var(--text-dim)]">{tx('of that time, at your cost of an hour')}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[30px] sm:text-[34px] leading-none font-semibold tabular-nums tracking-[-0.02em]">{g.multiple === null ? '—' : `×${num(g.multiple)}`}</p>
            <p className="mt-1.5 text-[12.5px] text-[var(--text-dim)]">
              {g.paybackDays === null
                ? tx('Add your figures to see when it pays back')
                : g.paybackDays <= 1
                  ? tx('{{plan}} costs {{cost}} a month and pays for itself on the first working day', { plan: name, cost: fmtEur(g.costEur) })
                  : tx('{{plan}} costs {{cost}} a month and pays back in {{n}} working days', { plan: name, cost: fmtEur(g.costEur), n: g.paybackDays })}
            </p>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-[var(--border)] grid gap-3 sm:grid-cols-3" data-tour="roi">
          <Field label={tx('Models you receive or deliver a month')}>
            <input className={`${inputClass} tabular-nums`} inputMode="numeric" value={raw.deliveriesPerMonth} onChange={set('deliveriesPerMonth')} />
          </Field>
          <Field label={tx('Hours to check one by hand today')}>
            <input className={`${inputClass} tabular-nums`} inputMode="decimal" value={raw.reviewHours} onChange={set('reviewHours')} />
          </Field>
          <Field label={tx('Cost of an hour of that person (€)')}>
            <input className={`${inputClass} tabular-nums`} inputMode="numeric" value={raw.hourlyEur} onChange={set('hourlyEur')} />
          </Field>
        </div>

        {!compact && (
          <details className="mt-3 group">
            <summary className="list-none cursor-pointer text-[12.5px] text-[var(--text-dim)] hover:text-[var(--text)] inline-flex items-center gap-1 min-h-[32px]">
              <span aria-hidden className="transition-transform group-open:rotate-90">›</span>{tx('How this is worked out')}
            </summary>
            <ul className="mt-2 space-y-1.5 text-[12.5px] text-[var(--text-dim)] leading-[1.5]">
              <li>{tx('Saved checks do {{share}} of a manual review: names, properties, IDS and the Health Score.', { share: pct(a.automatedShare) })}</li>
              <li>{tx('{{share}} of deliveries come back wrong the first time; each one stopped at the door saves {{n}} min of chasing and re-checking.', { share: pct(a.bounceRate), n: Math.round(a.bounceHours * 60) })}</li>
              <li>{tx('Cost is our list price billed yearly, at the plan minimum. Rework on site and penalties avoided are not counted.')}</li>
              <li>{tx('Once you use it, the value report replaces this estimate with your measured counts.')}</li>
            </ul>
          </details>
        )}
      </Panel>
    </section>
  )
}
