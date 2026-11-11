// "What Pro did for you this month" (Pro, dark): counts from the month and an
// estimate of hours saved, with the formula in view so it can be trusted.

import { Panel, fmtInt } from '../../ui'
import { HOURLY_RATE_EUR, MINUTES_SAVED, PRO_PRICE_EUR, SAMPLE_MONTH, type MonthActivity } from './pro-sample'
import { savings } from './pro-reports'
import { useP } from './pro-i18n'

export default function MonthSummary({ month = SAMPLE_MONTH }: { month?: MonthActivity }) {
  const p = useP()
  const s = savings(month)
  if (s.empty) return <Panel className="p-4 mb-5"><p className="text-[13px] text-[var(--text-dim)]">{p('Nothing yet this month. Check a folder or compare two deliveries and the hours saved add up here.')}</p></Panel>
  const items: [string, number][] = [
    [p('Deliveries checked'), month.deliveries], [p('Files in folder checks'), month.batchFiles],
    [p('Comparisons'), month.diffs], [p('Client link visits'), month.linkViews], [p('Certificates'), month.certificates],
  ]
  return (
    <Panel className="p-4 sm:p-5 mb-5">
      <div data-pro="month-summary" className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="lg:w-[260px] shrink-0">
          <p className="text-[12px] text-[var(--text-dim)]">{p('Pro this month')}</p>
          <p className="mt-1 text-[26px] font-semibold tabular-nums leading-tight">{p('~{{hours}} h saved', { hours: s.hours })}</p>
          <p className="text-[12.5px] text-[var(--text-dim)]">{p('≈ {{value}} € of your time for {{price}} € a month', { value: fmtInt(s.value), price: PRO_PRICE_EUR })}</p>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3 flex-1">
          {items.map(([k, v]) => <div key={k}><dt className="text-[11.5px] text-[var(--text-dim)]">{k}</dt><dd className="text-[18px] font-semibold tabular-nums">{fmtInt(v)}</dd></div>)}
        </dl>
      </div>
      <p className="mt-3 text-[11px] text-[var(--text-faint)]">{p('Estimate: {{batch}} min per file checked, {{diff}} min per comparison, {{cert}} min per certificate, {{link}} min per client visit, at {{rate}} € an hour.', { batch: MINUTES_SAVED.batchFiles, diff: MINUTES_SAVED.diffs, cert: MINUTES_SAVED.certificates, link: MINUTES_SAVED.linkViews, rate: HOURLY_RATE_EUR })}</p>
    </Panel>
  )
}
