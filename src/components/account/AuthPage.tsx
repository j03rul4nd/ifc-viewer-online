// ─── AuthPage ─────────────────────────────────────────────────────────────────
// Dedicated auth pages (/sign-in, /sign-up, /account) so Clerk's Paths config,
// its transactional emails and any future CDE deep-link can land on OUR domain
// instead of the hosted Account Portal. Lives in the lazy vendor-auth chunk
// (imports @clerk/*) — App loads it only when one of these routes is visited,
// so the anonymous bundle stays byte-identical (I-1).
//
// Design: what the account is for beside a plain card; Clerk's embedded component
// is themed (authAppearance) so it sits on our card, not its own.
//
// Behaviour:
//  · /sign-in, /sign-up — combined flow; completion lands on /welcome.
//    Already signed in? → straight to /welcome (nothing to do here).
//  · /account — Clerk's full UserProfile; anonymous visitors get the sign-in
//    card whose completion returns right back to /account.

import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { SignIn, SignUp, UserProfile } from '@clerk/react'
import { useCloudAccountStore } from '../../stores/cloudAccountStore'
import { Check } from 'lucide-react'
import { authAppearance } from './authAppearance'

export type AuthPageKind = 'signin' | 'signup' | 'account'

interface AuthPageProps {
  kind: AuthPageKind
  onNavigateHome: () => void
  onNavigateWelcome: () => void
  theme?: 'dark' | 'light'
}

export default function AuthPage({ kind, onNavigateHome, onNavigateWelcome, theme = 'dark' }: AuthPageProps) {
  const { t } = useTranslation('pro')
  const status = useCloudAccountStore((s) => s.status)
  const light = theme === 'light'
  const appearance = authAppearance(light)

  // A signed-in user has no business on /sign-in | /sign-up — greet instead.
  useEffect(() => {
    if (status === 'signed-in' && kind !== 'account') onNavigateWelcome()
  }, [status, kind, onNavigateWelcome])

  // Account (UserProfile) is wide; sign-in/up cards are narrow.
  const wide = kind === 'account' && status === 'signed-in'

  return (
    <div className={`min-h-[100dvh] w-full ${light ? 'lp-light' : ''}`} style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="min-h-[100dvh] w-full max-w-[1040px] mx-auto px-4 sm:px-6 py-6 flex flex-col">
        <button onClick={onNavigateHome} className="self-start min-h-[32px] text-[13px] text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer">← {t('backHome')}</button>
        <div className={`flex-1 py-8 grid gap-10 items-center ${wide ? '' : 'lg:grid-cols-[1fr_auto]'}`}>
          {!wide && (
            <section className="hidden lg:block max-w-[420px]">
              <h1 className="text-[30px] leading-[1.15] font-semibold tracking-[-0.02em]">{t('authTitle')}</h1>
              <ul className="mt-6 space-y-3 text-[14px] text-[var(--text-dim)]">
                {(['authPoint1', 'authPoint2', 'authPoint3'] as const).map((k) => (
                  <li key={k} className="flex gap-2.5"><Check aria-hidden size={16} className="mt-[3px] shrink-0 text-[var(--accent-2)]" />{t(k)}</li>
                ))}
              </ul>
            </section>
          )}
          <div className={`rounded-[12px] border border-[var(--border)] bg-[var(--surface)] p-2 sm:p-3 justify-self-center ${wide ? 'w-full max-w-[880px]' : 'max-w-full'}`}>
            {kind === 'signin' && status !== 'signed-in' && (
              <SignIn routing="hash" withSignUp oauthFlow="redirect" fallbackRedirectUrl="/welcome" signUpUrl="/sign-up" appearance={appearance} />
            )}
            {kind === 'signup' && status !== 'signed-in' && (
              <SignUp routing="hash" oauthFlow="redirect" fallbackRedirectUrl="/welcome" signInUrl="/sign-in" appearance={appearance} />
            )}
            {kind === 'account' && (
              status === 'signed-in' ? (
                <UserProfile routing="hash" appearance={appearance} />
              ) : (
                <SignIn routing="hash" withSignUp oauthFlow="redirect" fallbackRedirectUrl="/account" signUpUrl="/sign-up" appearance={appearance} />
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
