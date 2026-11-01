// "Coming soon" frame for workspace screens whose backend is not built. The
// screen shows the real design on sample data; this banner says so, names the
// plan and lets the visitor ask to be told — the same fake door as pricing.

import { useState } from 'react'
import { featuresInSection } from '../../lib/plans/features'
import { planDef } from '../../lib/plans/plans'
import { trackPricingIntent } from '../../lib/analytics'
import { Banner, Quiet } from './ui'
import { useTx } from './i18n'

export function SoonChip() {
  const tx = useTx()
  return <span className="text-[11px] text-[var(--text-faint)]">{tx('Soon')}</span>
}

export function SoonBanner({ section }: { section: string }) {
  const tx = useTx()
  const [asked, setAsked] = useState(false)
  const pending = featuresInSection(section).filter((f) => f.status !== 'live')
  if (pending.length === 0) return null
  const plan = planDef(pending[0].plan).name
  return (
    <Banner tone="info" title={tx('Coming soon · {{plan}} plan', { plan })}
      action={asked
        ? <span className="text-[12.5px] text-[var(--text-dim)]">{tx("Noted — we'll tell you when it opens.")}</span>
        : <Quiet onClick={() => { trackPricingIntent({ kind: 'feature', item: section, surface: 'workspace_soon' }); setAsked(true) }}>{tx('Tell me when it opens')}</Quiet>}>
      {tx('This is the design on sample data. Nothing here is saved yet.')}
    </Banner>
  )
}
