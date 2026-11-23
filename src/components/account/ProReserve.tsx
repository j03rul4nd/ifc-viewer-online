// ─── Reserve Pro block + first-sign-in welcome (T-328) ──────────────────────
// Clerk-free (I-1): used by both AccountModal and DashboardView. When billing
// is off, the free user keeps their interest with one tap instead of a toast.

import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCloudAccountStore } from '../../stores/cloudAccountStore'
import { isProReserved, reservePro, takeWelcome } from '../../lib/cloud/pro-reserve'
import type { ProReserveSurface } from '../../lib/analytics'

type Phase = 'idle' | 'sending' | 'done' | 'failed'

export function ProReserveBlock({ surface }: { surface: ProReserveSurface }) {
  const { t, i18n } = useTranslation('pro')
  const email = useCloudAccountStore((s) => s.email)
  const [phase, setPhase] = useState<Phase>(() => (isProReserved() ? 'done' : 'idle'))

  const onReserve = async () => {
    setPhase('sending')
    const r = await reservePro(email, surface, (i18n.language || 'en').slice(0, 2))
    setPhase(r === 'reserved' ? 'done' : 'failed')
  }

  if (phase === 'done') {
    return (
      <p role="status" className="text-[12px] leading-snug" style={{ color: 'var(--success)' }}>
        ✓ {t('reserve.done')}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1.5" data-testid="pro-reserve">
      <p className="text-[12px] font-medium text-[var(--text)]">{t('reserve.title')}</p>
      <p className="text-[11px] leading-snug text-[var(--text-muted)]">{t('reserve.body')}</p>
      <button
        onClick={() => void onReserve()}
        disabled={phase === 'sending'}
        className="self-start h-8 px-3 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-50"
        style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
      >
        {phase === 'sending' ? t('reserve.sending') : t('reserve.cta')}
      </button>
      {phase === 'failed' && (
        <p role="alert" className="text-[11px] leading-snug" style={{ color: 'var(--warning)' }}>{t('reserve.failed')}</p>
      )}
    </div>
  )
}

/** True once per account per device (decided on first render, then marked seen). */
export function useFirstWelcome(): boolean {
  const userId = useCloudAccountStore((s) => s.userId)
  const status = useCloudAccountStore((s) => s.status)
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (status === 'signed-in' && userId && takeWelcome(userId)) setShow(true)
  }, [status, userId])
  return show
}

export function WelcomeCard({ showReserve, onCall, onDismiss }: {
  showReserve: boolean
  onCall: () => void
  onDismiss: () => void
}) {
  const { t } = useTranslation('pro')
  return (
    <section
      aria-labelledby="welcome-new-h"
      className="rounded-xl border p-3 flex flex-col gap-2"
      style={{ borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 6%, transparent)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 id="welcome-new-h" className="text-[13px] font-semibold text-[var(--text)]">{t('welcomeNew.title')}</h2>
        <button onClick={onDismiss} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]">{t('welcomeNew.dismiss')}</button>
      </div>
      <p className="text-[11px] text-[var(--text-muted)]">{t('welcomeNew.freeTitle')}</p>
      <ul className="text-[11px] text-[var(--text-muted)] leading-relaxed list-disc pl-4">
        <li>{t('dash.plan.free1')}</li>
        <li>{t('dash.plan.free2')}</li>
        <li>{t('dash.plan.free3')}</li>
        <li>{t('dash.plan.free4')}</li>
      </ul>
      {showReserve && <ProReserveBlock surface="welcome" />}
      <button onClick={onCall} className="self-start text-[11px] underline text-[var(--text)]">{t('welcomeNew.call')}</button>
    </section>
  )
}
