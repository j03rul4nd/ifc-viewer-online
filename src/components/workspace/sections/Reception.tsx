import { useState } from 'react'
import type { SectionProps } from '../registry'
import { RECEPTION_UNLIMITED_EUR, planDef } from '../../../lib/plans/plans'
import { paidApi, type ApiDelivery } from '../../../lib/cloud/paid-client'
import { usePaidQuery } from '../../../hooks/usePaidQuery'
import { Head, DataList, Dot, Sparkline, Tabs, useSubTab, scoreColor, Primary, Quiet } from '../ui'
import { SoonBanner } from '../Soon'
import { SAMPLE_API_DELIVERIES, SAMPLE_API_SUPPLIERS } from '../api-samples'
import { useTx } from '../i18n'

const VERDICT: Record<ApiDelivery['verdict'], [string, string]> = {
  pending: ['To review', 'var(--warn)'], accepted: ['Accepted', 'var(--ok)'], rejected: ['Rejected', 'var(--danger)'],
}
const TABS = [{ id: 'inbox', label: 'Inbox' }, { id: 'suppliers', label: 'Suppliers' }] as const

/** Reception plan (doc 17): R2 inbox, R3 accept/reject, R4 supplier record. */
export default function Reception(_: SectionProps) {
  const tx = useTx()
  const [tab, setTab] = useSubTab('reception', TABS)
  const deliveries = usePaidQuery(() => paidApi.deliveries(), SAMPLE_API_DELIVERIES)
  const suppliers = usePaidQuery(() => paidApi.suppliers(), SAMPLE_API_SUPPLIERS)
  const live = deliveries.source === 'live'
  const [msg, setMsg] = useState<string | null>(null)
  const plan = planDef('reception')

  async function decide(d: ApiDelivery, verdict: 'accepted' | 'rejected') {
    const reason = verdict === 'rejected' ? window.prompt(tx('Why is it rejected? The supplier will read this.')) ?? '' : undefined
    if (verdict === 'rejected' && !reason?.trim()) return
    const r = await paidApi.decide(d.id, verdict, reason?.trim())
    setMsg(r.ok ? null : r.error.message ?? r.error.code)
    deliveries.reload(); suppliers.reload()
  }

  return (
    <>
      <Head title={tx('Reception')}
        sub={tx('Suppliers check against your requirements for free; you receive only what complies. {{price}} a month per project, {{unlimited}} unlimited.', { price: `€${plan.monthlyEur}`, unlimited: `€${RECEPTION_UNLIMITED_EUR}` })} />
      <SoonBanner section="reception" source={deliveries.source} error={deliveries.error} />
      {msg && <p role="alert" className="text-[12.5px] text-[var(--danger)] mb-3">{msg}</p>}
      <Tabs label={tx('Reception')} tabs={TABS.map((t) => ({ ...t, label: tx(t.label), count: t.id === 'inbox' ? deliveries.data.deliveries.filter((d) => d.verdict === 'pending').length : undefined }))} value={tab} onChange={setTab} />
      {tab === 'inbox' ? (
        <DataList rows={deliveries.data.deliveries} rowKey={(d) => d.id} primaryHeader={tx('Delivery')}
          primary={(d) => <><p className="font-medium">{d.file_name}</p><p className="text-[11.5px] text-[var(--text-faint)]">{d.supplier} · {d.received_at.slice(0, 16).replace('T', ' ')}</p></>}
          columns={[
            { key: 'score', header: tx('Score'), align: 'right', cell: (d) => d.score === null ? <span className="text-[12px] text-[var(--text-faint)]">{tx('Validating…')}</span> : <span className="tabular-nums font-medium" style={{ color: scoreColor(d.score) }}>{d.score}<span className="text-[var(--text-faint)] font-normal"> / {d.required_score}</span></span> },
            { key: 'verdict', header: tx('Status'), cell: (d) => <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap"><Dot color={VERDICT[d.verdict][1]} />{tx(VERDICT[d.verdict][0])}</span> },
            { key: 'reason', header: tx('Why'), wide: true, hideOnPhone: true, className: 'max-w-[280px]', cell: (d) => <span className="text-[12px] text-[var(--text-dim)]">{d.reason ?? '—'}</span> },
          ]}
          actions={(d) => live && d.verdict === 'pending'
            ? <span className="flex gap-1.5"><Quiet onClick={() => void decide(d, 'rejected')}>{tx('Reject')}</Quiet><Primary onClick={() => void decide(d, 'accepted')}>{tx('Accept')}</Primary></span>
            : null} />
      ) : (
        <DataList rows={suppliers.data.suppliers} rowKey={(s) => s.id} primaryHeader={tx('Supplier')}
          primary={(s) => <><p className="font-medium">{s.name}</p><p className="text-[11.5px] text-[var(--text-faint)]">{s.discipline ?? '—'} · {tx('{{n}} deliveries', { n: s.deliveries })}</p></>}
          columns={[
            { key: 'first', header: tx('Accepted first time'), align: 'right', cell: (s) => <span className="tabular-nums">{Math.round(s.firstTimeRate * 100)}%</span> },
            { key: 'avg', header: tx('Average score'), align: 'right', cell: (s) => s.avgScore === null ? '—' : <span className="tabular-nums" style={{ color: scoreColor(s.avgScore) }}>{s.avgScore}</span> },
            { key: 'trend', header: tx('Trend'), hideOnPhone: true, cell: (s) => <Sparkline values={s.trend} /> },
          ]} />
      )}
    </>
  )
}
