import type { SectionProps } from '../registry'
import type { FeatureStatus } from '../../../lib/plans/types'
import { INTEGRATIONS } from '../../../lib/plans/features'
import { planDef } from '../../../lib/plans/plans'
import { Head, Panel, SectionLabel, DataList } from '../ui'
import { SoonBanner } from '../Soon'
import { WEBHOOK_EVENTS } from '../plan-sample-data'
import { useTx } from '../i18n'

const STATUS: Record<FeatureStatus, string> = { live: 'Available', preview: 'Preview', soon: 'Soon', planned: 'Planned' }

/** W1, W4, I1–I7: where the viewer is used, and where its events go. */
export default function Integrations(_: SectionProps) {
  const tx = useTx()
  return (
    <>
      <Head title={tx('Integrations')} sub={tx('Open files from your storage, send alerts to your chat and events to your automations. Files picked from storage go straight to your browser.')} />
      <SoonBanner section="integrations" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {INTEGRATIONS.map((i) => (
          <Panel key={i.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13.5px] font-medium">{i.name}</p>
              <span className={`text-[10.5px] px-1.5 py-[1px] rounded-[5px] border border-[var(--border)] whitespace-nowrap ${i.status === 'live' ? 'text-[var(--ok)]' : 'text-[var(--text-faint)]'}`}>{tx(STATUS[i.status])}</span>
            </div>
            <p className="text-[12.5px] text-[var(--text-dim)] mt-1">{tx(i.does)}</p>
            <p className="text-[11.5px] text-[var(--text-faint)] mt-2">{i.plan === 'free' ? tx('Free') : planDef(i.plan).name}</p>
          </Panel>
        ))}
      </div>
      <SectionLabel>{tx('Webhook events')}</SectionLabel>
      <DataList rows={WEBHOOK_EVENTS} rowKey={(e) => e.event} primaryHeader={tx('Event')}
        primary={(e) => <code className="text-[12.5px]">{e.event}</code>}
        columns={[{ key: 'when', header: tx('Sent when'), wide: true, cell: (e) => <span className="text-[12.5px] text-[var(--text-dim)]">{tx(e.when)}</span> }]} />
      <p className="text-[12px] text-[var(--text-faint)] mt-3">{tx('Each request is signed with HMAC-SHA256 in the X-Signature header and retried for 24 hours.')}</p>
    </>
  )
}
