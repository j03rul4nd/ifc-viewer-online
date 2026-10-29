import type { SectionProps } from '../registry'
import { AI_ACTIONS, estimateAi } from '../../../lib/plans/ai-credits'
import { Head, Panel, SectionLabel, DataList, fmtInt } from '../ui'
import { SoonBanner } from '../Soon'
import { useTx } from '../i18n'

/** Optional AI helpers (doc 18 §0): monthly credits, hard cap, disclaimer on every result. */
export default function Ai({ data }: SectionProps) {
  const tx = useTx()
  const monthly = data.account.plan === 'team' ? 200 : 50
  const used = Math.round(monthly * 0.35)
  return (
    <>
      <Head title={tx('AI credits')} sub={tx('Everything works without AI. These optional helpers draft; our engine checks and a person confirms.')} />
      <SoonBanner section="ai" />
      <Panel className="p-5 mb-6">
        <p className="text-[12px] text-[var(--text-faint)]">{tx('Left this month')}</p>
        <p className="text-[22px] font-semibold tabular-nums mt-1">{fmtInt(monthly - used)} <span className="text-[13px] font-normal text-[var(--text-dim)]">/ {fmtInt(monthly)}</span></p>
        <div className="h-1.5 rounded-full bg-[var(--surface-2)] mt-3 overflow-hidden"><div className="h-full bg-[var(--accent)]" style={{ width: `${(used / monthly) * 100}%` }} /></div>
        <p className="text-[12px] text-[var(--text-dim)] mt-3">{tx('When they run out, AI stops until next month or until you add a pack. You see the cost before every run.')}</p>
      </Panel>
      <SectionLabel>{tx('What each helper costs')}</SectionLabel>
      <DataList rows={AI_ACTIONS} rowKey={(a) => a.id} primaryHeader={tx('Helper')}
        primary={(a) => <p className="font-medium">{tx(a.label)}</p>}
        columns={[{ key: 'cost', header: tx('Credits'), align: 'right', cell: (a) => <span className="tabular-nums">{a.unit === 'page' ? tx('{{n}} per page', { n: a.creditsPerUnit }) : tx('{{n}} per run', { n: estimateAi(a.id, 1) })}</span> }]} />
      <p className="text-[12px] text-[var(--text-faint)] mt-4">{tx('Generated with AI. It can contain mistakes — review it before you use it.')}</p>
    </>
  )
}
