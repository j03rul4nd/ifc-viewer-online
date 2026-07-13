// ─── AuthPage ─────────────────────────────────────────────────────────────────
// Dedicated auth pages (/sign-in, /sign-up, /account) so Clerk's Paths config,
// its transactional emails and any future CDE deep-link can land on OUR domain
// instead of the hosted Account Portal. Lives in the lazy vendor-auth chunk
// (imports @clerk/*) — App loads it only when one of these routes is visited,
// so the anonymous bundle stays byte-identical (I-1).
//
// Design: the same aurora shader + vibrancy glass as /welcome; Clerk's embedded
// component is themed (authAppearance) so it sits on our glass card, not its own.
//
// Behaviour:
//  · /sign-in, /sign-up — combined flow; completion lands on /welcome.
//    Already signed in? → straight to /welcome (nothing to do here).
//  · /account — Clerk's full UserProfile; anonymous visitors get the sign-in
//    card whose completion returns right back to /account.

import { useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { SignIn, SignUp, UserProfile } from '@clerk/react'
import { useCloudAccountStore } from '../../stores/cloudAccountStore'
import AuroraBackdrop from '../AuroraBackdrop'
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
  const reduce = useReducedMotion()
  const light = theme === 'light'
  const appearance = authAppearance(light)

  // A signed-in user has no business on /sign-in | /sign-up — greet instead.
  useEffect(() => {
    if (status === 'signed-in' && kind !== 'account') onNavigateWelcome()
  }, [status, kind, onNavigateWelcome])

  // Account (UserProfile) is wide; sign-in/up cards are narrow.
  const wide = kind === 'account' && status === 'signed-in'

  const card = light
    ? { background: 'rgba(255,255,255,0.72)', borderColor: 'rgba(15,17,35,0.08)', boxShadow: '0 24px 70px -20px rgba(40,48,120,0.28)' }
    : { background: 'rgba(18,19,26,0.55)', borderColor: 'rgba(255,255,255,0.09)', boxShadow: '0 30px 90px -30px rgba(0,0,0,0.75)' }

  return (
    <div className={`relative min-h-full w-full overflow-hidden ${light ? 'lp-light' : ''}`} style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <AuroraBackdrop light={light} />

      <div className="relative z-10 min-h-full w-full flex flex-col items-center justify-center gap-6 px-4 py-12 overflow-y-auto">
        <motion.button
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.4 }}
          onClick={onNavigateHome}
          className="text-[12px] font-medium cursor-pointer transition-colors hover:opacity-80"
          style={{ color: 'var(--text-dim)' }}
        >
          ← {t('backHome')}
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: reduce ? 0 : 16, scale: reduce ? 1 : 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: reduce ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
          className={`rounded-[24px] border p-2 sm:p-3 backdrop-blur-xl ${wide ? 'w-full max-w-[880px]' : ''}`}
          style={card}
        >
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
        </motion.div>
      </div>
    </div>
  )
}
