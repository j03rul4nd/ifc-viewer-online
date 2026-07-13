// ─── AuthPage ─────────────────────────────────────────────────────────────────
// Dedicated auth pages (/sign-in, /sign-up, /account) so Clerk's Paths config,
// its transactional emails and any future CDE deep-link can land on OUR domain
// instead of the hosted Account Portal. Lives in the lazy vendor-auth chunk
// (imports @clerk/*) — App loads it only when one of these routes is visited,
// so the anonymous bundle stays byte-identical (I-1).
//
// Behaviour:
//  · /sign-in, /sign-up — combined flow; completion lands on /welcome.
//    Already signed in? → straight to /welcome (nothing to do here).
//  · /account — Clerk's full UserProfile; anonymous visitors get the sign-in
//    card whose completion returns right back to /account.

import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { SignIn, SignUp, UserProfile } from '@clerk/react'
import { useCloudAccountStore } from '../../stores/cloudAccountStore'

export type AuthPageKind = 'signin' | 'signup' | 'account'

interface AuthPageProps {
  kind: AuthPageKind
  onNavigateHome: () => void
  onNavigateWelcome: () => void
}

export default function AuthPage({ kind, onNavigateHome, onNavigateWelcome }: AuthPageProps) {
  const { t } = useTranslation('pro')
  const status = useCloudAccountStore((s) => s.status)

  // A signed-in user has no business on /sign-in | /sign-up — greet instead.
  useEffect(() => {
    if (status === 'signed-in' && kind !== 'account') onNavigateWelcome()
  }, [status, kind, onNavigateWelcome])

  return (
    <div className="min-h-full w-full flex flex-col items-center justify-center gap-5 px-4 py-10 bg-[var(--bg,#0b0b0f)] text-[var(--text,#e8e8ee)]">
      <button
        onClick={onNavigateHome}
        className="text-[12px] text-[var(--text-muted,#9a9aa5)] hover:text-[var(--text)] transition-colors"
      >
        ← {t('backHome')}
      </button>

      {kind === 'signin' && status !== 'signed-in' && (
        <SignIn routing="hash" withSignUp oauthFlow="redirect" fallbackRedirectUrl="/welcome" signUpUrl="/sign-up" />
      )}
      {kind === 'signup' && status !== 'signed-in' && (
        <SignUp routing="hash" oauthFlow="redirect" fallbackRedirectUrl="/welcome" signInUrl="/sign-in" />
      )}
      {kind === 'account' && (
        status === 'signed-in' ? (
          <UserProfile routing="hash" />
        ) : (
          <SignIn routing="hash" withSignUp oauthFlow="redirect" fallbackRedirectUrl="/account" signUpUrl="/sign-up" />
        )
      )}
    </div>
  )
}
