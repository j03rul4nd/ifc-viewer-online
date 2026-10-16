import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { featureForRule } from '../../lib/pricing/catalog'
import { trackPricingIntent } from '../../lib/analytics'
import NotifyMeForm from './NotifyMeForm'

// Next step after the Health Score — the funnel's biggest hole (≈230 scores a
// day, ~1 % act on them). Public, but price-free: it only measures interest in
// auto-fix / certificates and captures an email to tell people at launch.

export default function ScoreUpsell({ score, topRule }: { score: number; topRule?: string }) {
  const { t } = useTranslation('validation')
  const feature = featureForRule(topRule)
  const fix = feature === 'auto_fix'
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[11.5px] font-medium text-[var(--text)]">{t(fix ? 'upsell.fixTitle' : 'upsell.certTitle')}</p>
          <p className="text-[10.5px] text-[var(--text-dim)]">{t(fix ? 'upsell.fixDesc' : 'upsell.certDesc')}</p>
        </div>
        {!open && (
          <button
            onClick={() => { trackPricingIntent({ kind: 'feature', item: feature, surface: 'score_upsell', score }); setOpen(true) }}
            className="shrink-0 h-[26px] px-2.5 text-[11px] font-medium rounded-[6px] bg-[var(--accent)] text-white hover:brightness-110"
          >
            {t('upsell.cta')}
          </button>
        )}
        <button
          onClick={() => setDismissed(true)}
          aria-label={t('upsell.dismiss')}
          className="shrink-0 text-[var(--text-faint)] hover:text-[var(--text)] text-[13px] leading-none px-1"
        >
          ×
        </button>
      </div>
      {open && (
        <div className="mt-2">
          <NotifyMeForm
            compact
            source={`score_upsell:${feature}`}
            label={t('upsell.label')}
            text={{ submit: t('upsell.submit'), thanks: t('upsell.thanks'), error: t('upsell.error') }}
          />
        </div>
      )}
    </div>
  )
}
