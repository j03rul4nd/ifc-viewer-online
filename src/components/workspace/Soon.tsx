// "Coming soon" frame for workspace screens whose backend is not built. The
// screen shows the real design on sample data; this banner says so, names the
// plan and lets the visitor ask to be told — the same fake door as pricing.

import { useState } from 'react'
import { featuresInSection } from '../../lib/plans/features'
import { planDef } from '../../lib/plans/plans'
import { trackPricingIntent } from '../../lib/analytics'
import { Banner, Quiet } from './ui'
import type { PaidSource } from '../../hooks/usePaidQuery'
import type { PaidError } from '../../lib/cloud/paid-client'
import { useTx } from './i18n'

export function SoonChip() {
  const tx = useTx()
  return <span className="text-[11px] text-[var(--text-faint)]">{tx('Soon')}</span>
}

/**
 * What the screen is showing: sample data (the "coming soon" fake door), real
 * data from the API, or an error from it. `source` comes from usePaidQuery.
 */
export function SoonBanner({ section, source = 'sample', error }: { section: string; source?: PaidSource; error?: PaidError | null }) {
  const tx = useTx()
  const [asked, setAsked] = useState(false)
  if (source === 'live' || source === 'loading') {
    return <Banner tone="ok" title={tx('Connected to your workspace')}>{source === 'loading' ? tx('Loading…') : tx('Live data from the API. Changes are saved.')}</Banner>
  }
  if (source === 'error' && error) {
    const msg = error.code === 'plan_required' ? tx('Your workspace plan does not include this yet.')
      : error.code === 'forbidden' ? tx('Your role cannot open this. Ask an admin.')
      : error.code === 'not_a_member' ? tx('You are not a member of this organization.')
      : tx('Could not reach the API ({{code}}). Showing sample data.', { code: error.code })
    return <Banner tone="warn" title={tx('Not connected')}>{msg}</Banner>
  }
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
