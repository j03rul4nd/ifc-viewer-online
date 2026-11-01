import { useState } from 'react'
import type { SectionProps } from '../registry'
import { Field, Head, Panel, Quiet, SectionLabel, fmtInt, inputClass } from '../ui'
import { SoonBanner } from '../Soon'
import { useAccess, valueOf } from '../roles'
import { useTx } from '../i18n'

const MONTHS = 3
const MEASURED = { runs: 96, runMinutes: 1860, rejected: 22, delivered: 61, blocked: 7, closed: 148, medianDays: 4.2 }
const eur = (n: number): string => `${fmtInt(n)} €`

/** For whoever signs the renewal: what was measured, what was assumed, and what is left once it is paid for. */
export default function Value(_: SectionProps) {
  const tx = useTx()
  const { can } = useAccess()
  const edit = can('automations.manage')
  const [hourly, setHourly] = useState(45)
  const [cost, setCost] = useState(175)
  const [perRejected, setPerRejected] = useState(45)
  const v = valueOf({ runMinutes: MEASURED.runMinutes, rejected: MEASURED.rejected, rejectedMinutes: perRejected, hourlyEur: hourly, monthlyCostEur: cost, months: MONTHS })
  const num = (set: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => set(Number(e.target.value.replace(/\D/g, '')))
  const firstTime = Math.round(((MEASURED.delivered - MEASURED.rejected) / MEASURED.delivered) * 100)
  return (
    <>
      <Head title={tx('Value report')} sub={tx('Last {{n}} months. Counts are measured; hours and money use the assumptions shown below.', { n: MONTHS })} action={<Quiet onClick={() => window.print()}>{tx('Print for the board')}</Quiet>} />
      <SoonBanner section="value" />

      <div className="mt-6 grid gap-3 sm:grid-cols-3 mb-8">
        <Panel className="p-4 min-w-0">
          <p className="text-[12px] text-[var(--text-dim)]">{tx('Left after paying for it')}</p>
          <p className="mt-1 text-[26px] font-semibold tabular-nums tracking-[-0.02em]">{eur(v.net)}</p>
          <p className="mt-1 text-[12px] text-[var(--text-faint)]">{tx('{{saved}} of time, against {{cost}} of cost', { saved: eur(v.saved), cost: eur(v.cost) })}</p>
        </Panel>
        <Panel className="p-4 min-w-0">
          <p className="text-[12px] text-[var(--text-dim)]">{tx('Return on each euro')}</p>
          <p className="mt-1 text-[26px] font-semibold tabular-nums tracking-[-0.02em]">{v.multiple === null ? '—' : `×${new Intl.NumberFormat().format(v.multiple)}`}</p>
          <p className="mt-1 text-[12px] text-[var(--text-faint)]">{tx('Time only. Rework and penalties avoided are not counted.')}</p>
        </Panel>
        <Panel className="p-4 min-w-0">
          <p className="text-[12px] text-[var(--text-dim)]">{tx('Hours given back to the team')}</p>
          <p className="mt-1 text-[26px] font-semibold tabular-nums tracking-[-0.02em]">{fmtInt(Math.round(v.hours))}</p>
          <p className="mt-1 text-[12px] text-[var(--text-faint)]">{tx('About {{n}} working days', { n: fmtInt(Math.round(v.hours / 8)) })}</p>
        </Panel>
      </div>

      <SectionLabel>{tx('What was measured')}</SectionLabel>
      <Panel className="p-4 mb-8 min-w-0">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 text-[13px]">
          {[
            [tx('Bad deliveries stopped before reaching the team'), fmtInt(MEASURED.rejected)],
            [tx('Deliveries accepted the first time'), `${firstTime} %`],
            [tx('Publications blocked by your standard'), fmtInt(MEASURED.blocked)],
            [tx('Automation firings'), fmtInt(MEASURED.runs)],
            [tx('Issues closed'), fmtInt(MEASURED.closed)],
            [tx('Median days to close an issue'), new Intl.NumberFormat().format(MEASURED.medianDays)],
          ].map(([k, val]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 min-w-0"><dt className="text-[var(--text-dim)]">{k}</dt><dd className="font-medium tabular-nums whitespace-nowrap">{val}</dd></div>
          ))}
        </dl>
      </Panel>

      <SectionLabel>{tx('The assumptions')}</SectionLabel>
      <Panel className="p-4 mb-8 min-w-0">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={tx('Cost of an hour (€)')}><input disabled={!edit} className={`${inputClass} tabular-nums`} inputMode="numeric" value={hourly} onChange={num(setHourly)} /></Field>
          <Field label={tx('Minutes lost on a bad delivery')}><input disabled={!edit} className={`${inputClass} tabular-nums`} inputMode="numeric" value={perRejected} onChange={num(setPerRejected)} /></Field>
          <Field label={tx('What you pay a month (€)')}><input disabled={!edit} className={`${inputClass} tabular-nums`} inputMode="numeric" value={cost} onChange={num(setCost)} /></Field>
        </div>
        <p className="mt-3 text-[12px] leading-[1.5] text-[var(--text-faint)]">{tx('Set them with your own figures: the result is only as good as they are. The minutes per automation are set on each one.')}</p>
      </Panel>
    </>
  )
}
