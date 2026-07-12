// ─── WelcomeView ──────────────────────────────────────────────────────────────
// /welcome — the landing spot right after the FIRST sign-in / sign-up (App
// routes here once per user, keyed in localStorage; OAuth redirects that
// reload the page also end up here instead of the cold landing). Clerk-free
// by design (I-1): everything it needs comes from cloudAccountStore.

import React from 'react'
import { useTranslation } from 'react-i18next'
import { useCloudAccountStore } from '../stores/cloudAccountStore'

interface WelcomeViewProps {
  onStart: () => void
}

export default function WelcomeView({ onStart }: WelcomeViewProps) {
  const { t } = useTranslation('pro')
  const email = useCloudAccountStore((s) => s.email)
  const status = useCloudAccountStore((s) => s.status)

  const benefits = [
    { icon: '📜', title: t('welcomePage.historyTitle'), body: t('welcomePage.historyBody') },
    { icon: '🔄', title: t('welcomePage.syncTitle'), body: t('welcomePage.syncBody') },
    { icon: '🏷', title: t('welcomePage.brandTitle'), body: t('welcomePage.brandBody') },
  ]

  return (
    <div className="min-h-full w-full flex items-center justify-center px-4 py-10 bg-[var(--bg,#0b0b0f)] text-[var(--text,#e8e8ee)]">
      <div className="w-full max-w-[560px] flex flex-col items-center gap-6 text-center">
        <div
          className="w-14 h-14 rounded-2xl grid place-items-center text-[26px]"
          style={{ background: 'rgba(94,106,210,0.15)' }}
          aria-hidden
        >
          ✓
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-[26px] font-semibold leading-tight">
            {status === 'signed-in' ? t('welcomePage.title') : t('welcomePage.titleAnonymous')}
          </h1>
          {status === 'signed-in' && email && (
            <p className="text-[13px] text-[var(--text-muted,#9a9aa5)]">
              {t('welcomePage.signedInAs', { email })}
            </p>
          )}
          <p className="text-[13px] text-[var(--text-muted,#9a9aa5)] leading-relaxed">
            {t('welcomePage.subtitle')}
          </p>
        </div>

        <div className="w-full grid gap-3 sm:grid-cols-3">
          {benefits.map((b) => (
            <div
              key={b.title}
              className="rounded-xl border border-[var(--border,#2a2a33)] p-4 flex flex-col items-center gap-1.5"
            >
              <span className="text-[20px]" aria-hidden>{b.icon}</span>
              <span className="text-[12px] font-semibold">{b.title}</span>
              <span className="text-[11px] text-[var(--text-muted,#9a9aa5)] leading-snug">{b.body}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onStart}
            className="h-10 px-5 rounded-xl text-[13px] font-semibold transition-colors"
            style={{ background: 'var(--accent, #5E6AD2)', color: 'white' }}
          >
            {t('welcomePage.cta')}
          </button>
          <p className="text-[11px] text-[var(--text-muted,#9a9aa5)]">{t('welcomePage.hint')}</p>
        </div>
      </div>
    </div>
  )
}
