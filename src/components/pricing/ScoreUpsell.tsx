import { useState } from 'react'
import { PAID_FEATURES, featureForRule } from '../../lib/pricing/catalog'
import { trackPricingIntent } from '../../lib/analytics'
import NotifyMeForm from './NotifyMeForm'

// Next step after the Health Score — the funnel's biggest hole (≈230 scores a
// day, ~1 % act on them). Hidden behind the pricing preview until launch.

export default function ScoreUpsell({ score, topRule }: { score: number; topRule?: string }) {
  const feature = PAID_FEATURES.find((f) => f.id === featureForRule(topRule))!
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[11.5px] font-medium text-[var(--text)]">
            {feature.id === 'auto_fix' ? 'Fix these issues automatically' : 'Prove this score to your client'}
          </p>
          <p className="text-[10.5px] text-[var(--text-dim)]">{feature.description}</p>
        </div>
        {!open && (
          <button
            onClick={() => { trackPricingIntent({ kind: 'feature', item: feature.id, surface: 'score_upsell', score }); setOpen(true) }}
            className="shrink-0 h-[26px] px-2.5 text-[11px] font-medium rounded-[6px] bg-[var(--accent)] text-white hover:brightness-110"
          >
            {feature.id === 'auto_fix' ? 'Fix my IFC' : 'Get certificate'}
          </button>
        )}
        <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="shrink-0 text-[var(--text-faint)] hover:text-[var(--text)] text-[13px] leading-none px-1">×</button>
      </div>
      {open && (
        <div className="mt-2">
          <NotifyMeForm compact source={`score_upsell:${feature.id}`} label="Coming soon. Leave your email and we'll tell you when it's ready." />
        </div>
      )}
    </div>
  )
}
