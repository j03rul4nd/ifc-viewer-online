// ─── ProUpsellModal ───────────────────────────────────────────────────────────
// Small, user-action-only upsell (never opened by a timer — docs-planning/01
// §3.4). Says what Pro unlocks and routes to the account modal, which owns
// sign-in and checkout. No @clerk/* imports — safe anywhere.

import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../Modal'
import { trackProUpsellShown } from '../../lib/analytics'

interface ProUpsellModalProps {
  trigger: 'api_keys' | 'rulesets' | 'history' | 'landing' | 'manual'
  onOpenAccount: () => void
  onClose: () => void
}

export default function ProUpsellModal({ trigger, onOpenAccount, onClose }: ProUpsellModalProps) {
  const { t } = useTranslation('pro')

  useEffect(() => { trackProUpsellShown({ trigger }) }, [trigger])

  return (
    <Modal
      open
      onClose={onClose}
      title={t('upsell.title')}
      size="sm"
      footer={(
        <>
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
        </>
      )}
    >
      <div className="px-4 py-3 flex flex-col gap-3">
        <ul className="text-[12px] text-[var(--text-muted)] leading-relaxed list-disc pl-4">
          <li>{t('plan.benefitHistory')}</li>
          <li>{t('plan.benefitSync')}</li>
          <li>{t('plan.benefitBranding')}</li>
        </ul>
        <p className="text-[11px] text-[var(--text-muted)]">{t('upsell.freeStays')}</p>
      </div>
    </Modal>
  )
}
