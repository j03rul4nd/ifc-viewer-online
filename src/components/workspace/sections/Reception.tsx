import type { SectionProps } from '../registry'
import type { DeliveryVerdict } from '../../../lib/plans/types'
import { RECEPTION_UNLIMITED_EUR, planDef } from '../../../lib/plans/plans'
import { Head, Primary, DataList, Dot, Sparkline, Tabs, useSubTab, scoreColor } from '../ui'
import { SoonBanner } from '../Soon'
import { SAMPLE_DELIVERIES, SAMPLE_SUPPLIERS } from '../plan-sample-data'
import { useTx } from '../i18n'

const VERDICT: Record<DeliveryVerdict, [string, string]> = {
  pending: ['To review', 'var(--warn)'], accepted: ['Accepted', 'var(--ok)'], rejected: ['Rejected', 'var(--danger)'],
}
const TABS = [{ id: 'inbox', label: 'Inbox' }, { id: 'suppliers', label: 'Suppliers' }] as const

/** Reception plan (doc 17): R2 inbox, R3 accept/reject, R4 supplier record. */
export default function Reception(_: SectionProps) {
  const tx = useTx()
  const [tab, setTab] = useSubTab('reception', TABS)
  const plan = planDef('reception')
  return (
    <>
      <Head title={tx('Reception')}
        sub={tx('Suppliers check against your requirements for free; you receive only what complies. {{price}} a month per project, {{unlimited}} unlimited.', { price: `€${plan.monthlyEur}`, unlimited: `€${RECEPTION_UNLIMITED_EUR}` })}
        action={<Primary disabled>{tx('New requirements link')}</Primary>} />
      <SoonBanner section="reception" />
      <Tabs label={tx('Reception')} tabs={TABS.map((t) => ({ ...t, label: tx(t.label), count: t.id === 'inbox' ? SAMPLE_DELIVERIES.filter((d) => d.verdict === 'pending').length : undefined }))} value={tab} onChange={setTab} />
      {tab === 'inbox' ? (
        <DataList rows={SAMPLE_DELIVERIES} rowKey={(d) => d.id} primaryHeader={tx('Delivery')}
          primary={(d) => <><p className="font-medium">{d.file}</p><p className="text-[11.5px] text-[var(--text-faint)]">{d.id} · {d.supplier} · {d.receivedAt}</p></>}
          columns={[
            { key: 'score', header: tx('Score'), align: 'right', cell: (d) => <span className="tabular-nums font-medium" style={{ color: scoreColor(d.score) }}>{d.score}<span className="text-[var(--text-faint)] font-normal"> / {d.requiredScore}</span></span> },
            { key: 'verdict', header: tx('Status'), cell: (d) => <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap"><Dot color={VERDICT[d.verdict][1]} />{tx(VERDICT[d.verdict][0])}</span> },
            { key: 'reason', header: tx('Why'), wide: true, hideOnPhone: true, className: 'max-w-[280px]', cell: (d) => <span className="text-[12px] text-[var(--text-dim)]">{d.reason ?? (d.sealedAt ? tx('Sealed {{at}}', { at: d.sealedAt }) : '—')}</span> },
          ]} />
      ) : (
        <DataList rows={SAMPLE_SUPPLIERS} rowKey={(s) => s.id} primaryHeader={tx('Supplier')}
          primary={(s) => <><p className="font-medium">{s.name}</p><p className="text-[11.5px] text-[var(--text-faint)]">{s.discipline} · {tx('{{n}} deliveries', { n: s.deliveries })}</p></>}
          columns={[
            { key: 'first', header: tx('Accepted first time'), align: 'right', cell: (s) => <span className="tabular-nums">{Math.round(s.firstTimeRate * 100)}%</span> },
            { key: 'avg', header: tx('Average score'), align: 'right', cell: (s) => <span className="tabular-nums" style={{ color: scoreColor(s.avgScore) }}>{s.avgScore}</span> },
            { key: 'trend', header: tx('Trend'), hideOnPhone: true, cell: (s) => <Sparkline values={s.trend} /> },
          ]} />
      )}
    </>
  )
}
