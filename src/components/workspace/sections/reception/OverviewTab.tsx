// The project at a glance: what to do today, the estimated saving, and a
// traffic light per supplier and milestone. The first thing a BIM manager and
// the site management read.

import { useState } from 'react'
import { Panel, Primary, Quiet, SectionLabel, Sparkline, inputClass, scoreColor } from '../../ui'
import { MILESTONES, DEFAULT_ASSUMPTIONS, milestoneStates, savings, supplierStats, type MilestoneState, type RxDelivery, type RxProject, type RxSupplier, type SavingsAssumptions } from './sample'
import type { Rx } from './strings'

const LIGHT: Record<MilestoneState, [string, string]> = {
  done: ['Done', 'var(--ok)'], ok: ['On track', 'var(--ok)'], risk: ['At risk', 'var(--warn)'], late: ['Late', 'var(--danger)'], none: ['Not started', 'var(--border)'],
}
export const LIGHT_LABELS = Object.values(LIGHT).map((l) => l[0])
export const MILESTONE_LABELS = [...MILESTONES]
const ASSUMPTIONS = [['hourlyEur', 'Cost per hour (€)'], ['minutesPerCheck', 'Minutes to check one model'], ['minutesPerCycle', 'Minutes per return cycle']] as const
export const ASSUMPTION_LABELS = ASSUMPTIONS.map((x) => x[1])

function Light({ state, rx }: { state: MilestoneState; rx: Rx }) {
  const [label, color] = LIGHT[state]
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap">
      <span aria-hidden className={`inline-block w-2.5 h-2.5 rounded-full ${state === 'none' ? 'border border-[var(--border)]' : ''}`} style={{ background: state === 'none' ? 'transparent' : color }} />
      <span className={state === 'none' ? 'text-[var(--text-faint)]' : ''}>{rx(label)}</span>
    </span>
  )
}

export default function OverviewTab({ project, suppliers, deliveries, rx, lang, onReview, onSupplier, onReport, onTab }: {
  project: RxProject; suppliers: RxSupplier[]; deliveries: RxDelivery[]; rx: Rx; lang: string
  onReview: () => void; onSupplier: (id: string) => void; onReport: () => void; onTab: (t: 'suppliers') => void
}) {
  const [a, setA] = useState<SavingsAssumptions>(DEFAULT_ASSUMPTIONS)
  const [editing, setEditing] = useState(false)
  const s = savings(deliveries, a)
  const pending = deliveries.filter((d) => d.verdict === 'pending')
  const rows = suppliers.map((x) => ({ s: x, st: supplierStats(project, x, deliveries), ms: milestoneStates(project, x, deliveries) }))
  const late = rows.filter((r) => r.st.daysLate > 0)
  const bounced = suppliers.filter((x) => x.state === 'bounced')
  const eur = (n: number) => new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

  // First-time acceptance week by week, for the trend line.
  const weeks = [...new Set(deliveries.filter((d) => d.verdict !== 'pending').map((d) => d.receivedAt.slice(0, 10)))].sort()
  const weekly: number[] = []
  for (let i = 0; i < weeks.length; i += 3) {
    const slice = deliveries.filter((d) => d.verdict !== 'pending' && weeks.slice(i, i + 3).includes(d.receivedAt.slice(0, 10)))
    weekly.push(Math.round((slice.filter((d) => d.verdict === 'accepted').length / Math.max(1, slice.length)) * 100))
  }

  return (
    <div className="space-y-5">
      <Panel className="p-4 sm:p-5">
        <SectionLabel>{rx('Today')}</SectionLabel>
        <ul className="space-y-2 text-[13px]">
          {pending.length > 0 && <li className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="flex-1 min-w-[200px]">{rx('{{n}} deliveries to review, already checked. About {{min}} minutes with the shortcuts.', { n: pending.length, min: pending.length * 2 })}</span><Primary onClick={onReview}>{rx('Start review')}</Primary></li>}
          {late.map((r) => <li key={r.s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="flex-1 min-w-[200px]">{rx('{{name}} has not delivered for {{n}} days.', { name: r.s.name, n: r.st.daysLate })}</span><Quiet onClick={() => onSupplier(r.s.id)}>{rx('See supplier')}</Quiet></li>)}
          {bounced.map((b) => <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="flex-1 min-w-[200px]">{rx('The invitation to {{name}} bounced: correct the e-mail.', { name: b.name })}</span><Quiet onClick={() => onSupplier(b.id)}>{rx('Fix e-mail')}</Quiet></li>)}
          {pending.length === 0 && late.length === 0 && bounced.length === 0 && <li className="text-[var(--text-dim)]">{rx('Nothing waiting on you today.')}</li>}
        </ul>
      </Panel>

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5">
        <Panel className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SectionLabel>{rx('Estimated saving on this project')}</SectionLabel>
              <p className="text-[11.5px] text-[var(--text-faint)] -mt-1.5">{rx('Estimate on sample data, last {{n}} months. Change the assumptions to yours.', { n: s.months })}</p>
            </div>
            <Quiet onClick={() => setEditing((e) => !e)}>{editing ? rx('Done') : rx('Assumptions')}</Quiet>
          </div>
          <dl className="grid grid-cols-3 gap-3 mt-4">
            <div><dt className="text-[11.5px] text-[var(--text-faint)]">{rx('Hours saved')}</dt><dd className="text-[26px] font-semibold tabular-nums leading-tight">{s.hours} h</dd></div>
            <div><dt className="text-[11.5px] text-[var(--text-faint)]">{rx('Value')}</dt><dd className="text-[26px] font-semibold tabular-nums leading-tight">{eur(s.eur)}</dd></div>
            <div><dt className="text-[11.5px] text-[var(--text-faint)]">{rx('vs. what it costs')}</dt><dd className="text-[26px] font-semibold tabular-nums leading-tight" style={{ color: s.multiple >= 1 ? 'var(--ok)' : 'var(--warn)' }}>{rx('{{x}}×', { x: s.multiple.toFixed(1) })}</dd></div>
          </dl>
          <p className="text-[12px] text-[var(--text-dim)] mt-3">
            {rx('{{checked}} deliveries arrived already checked ({{m}} min each by hand) and {{avoided}} return cycles were avoided because suppliers fixed them before sending ({{c}} min each).', { checked: s.checked, m: a.minutesPerCheck, avoided: s.avoided, c: a.minutesPerCycle })}
            {' '}{rx('Cost: {{cost}} for {{n}} months.', { cost: eur(s.cost), n: s.months })}
          </p>
          {editing && (
            <div className="grid grid-cols-3 gap-3 mt-3">
              {ASSUMPTIONS.map(([k, label]) => (
                <label key={k} className="text-[11.5px] text-[var(--text-dim)]">{rx(label)}
                  <input type="number" min={0} className={`${inputClass} mt-1 tabular-nums`} value={a[k]} onChange={(e) => setA({ ...a, [k]: Math.max(0, Number(e.target.value)) })} />
                </label>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="p-4 sm:p-5">
          <SectionLabel>{rx('Accepted first time, over the project')}</SectionLabel>
          <div className="flex items-end gap-4">
            <span className="text-[26px] font-semibold tabular-nums leading-tight">{weekly.at(-1) ?? 0}%</span>
            <Sparkline values={weekly} width={220} height={40} />
          </div>
          <p className="text-[12px] text-[var(--text-dim)] mt-2">{rx('Suppliers learn the rules: the share of deliveries accepted without a return goes up week by week.')}</p>
          <div className="mt-4"><Primary onClick={onReport}>{rx('Report for site management')}</Primary></div>
        </Panel>
      </div>

      <Panel>
        <div className="px-4 sm:px-5 pt-4 flex items-center justify-between gap-3">
          <SectionLabel>{rx('Suppliers by milestone')}</SectionLabel>
          <Quiet onClick={() => onTab('suppliers')}>{rx('All suppliers')}</Quiet>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[560px]">
            <thead className="text-left text-[12px] text-[var(--text-faint)]">
              <tr><th className="px-4 sm:px-5 py-2 font-medium">{rx('Supplier')}</th>{MILESTONES.map((m) => <th key={m} className="py-2 pr-4 font-medium">{rx(m)}</th>)}<th className="py-2 pr-4 sm:pr-5 font-medium text-right">{rx('Last score')}</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((r) => (
                <tr key={r.s.id} className="hover:bg-[var(--surface-2)]">
                  <td className="px-4 sm:px-5 py-2"><button onClick={() => onSupplier(r.s.id)} className="text-left hover:underline">{r.s.name}</button><span className="block text-[11.5px] text-[var(--text-faint)]">{rx(r.s.discipline)}</span></td>
                  {r.ms.map((m, i) => <td key={i} className="py-2 pr-4"><Light state={m} rx={rx} /></td>)}
                  <td className="py-2 pr-4 sm:pr-5 text-right tabular-nums">{r.st.trend.length ? <span style={{ color: scoreColor(r.st.trend.at(-1)!) }}>{r.st.trend.at(-1)}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
