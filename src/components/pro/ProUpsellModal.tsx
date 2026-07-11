// ─── ProUpsellModal ───────────────────────────────────────────────────────────
// Small, user-action-only upsell (never opened by a timer — docs-planning/01
// §3.4). Says what Pro unlocks and routes to the account modal, which owns
// sign-in and checkout. No @clerk/* imports — safe anywhere.

import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { trackProUpsellShown } from '../../lib/analytics'

interface ProUpsellModalProps {
  trigger: 'api_keys' | 'rulesets' | 'history' | 'landing' | 'manual'
  onOpenAccount: () => void
  onClose: () => void
}

export default function ProUpsellModal({ trigger, onOpenAccount, onClose }: ProUpsellModalProps) {
  const { t } = useTranslation('pro')

  useEffect(() => { trackProUpsellShown({ trigger }) }, [trigger])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog" aria-modal="true" aria-label={t('upsell.title')}
        className="relative z-[86] w-[380px] max-w-full rounded-2xl bg-[rgba(14,14,18,0.98)] border border-[var(--border-strong)] shadow-[0_24px_64px_rgba(0,0,0,0.6)] p-4 flex flex-col gap-3"
      >
        <p className="text-[14px] font-semibold text-[var(--text)]">{t('upsell.title')}</p>
        <ul className="text-[12px] text-[var(--text-muted)] leading-relaxed list-disc pl-4">
          <li>{t('plan.benefitHistory')}</li>
          <li>{t('plan.benefitSync')}</li>
          <li>{t('plan.benefitBranding')}</li>
        </ul>
        <p className="text-[11px] text-[var(--text-muted)]">{t('upsell.freeStays')}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="h-8 px-3 rounded-lg text-[12px] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
            {t('upsell.later')}
          </button>
          <button
            onClick={() => { onClose(); onOpenAccount() }}
            className="h-8 px-3 rounded-lg text-[12px] font-semibold"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            {t('upsell.cta')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
