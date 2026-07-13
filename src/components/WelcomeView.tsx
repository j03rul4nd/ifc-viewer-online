// ─── WelcomeView ──────────────────────────────────────────────────────────────
// /welcome — the landing spot right after the FIRST sign-in / sign-up (App
// routes here once per user, keyed in localStorage; OAuth redirects that
// reload the page also end up here instead of the cold landing). Clerk-free
// by design (I-1): everything it needs comes from cloudAccountStore.
//
// Design: a WebGL aurora shader (SoftAurora) sits behind a vibrancy glass
// card — Apple-style depth, restrained accent colour, generous type scale.
// prefers-reduced-motion swaps the animated canvas for a static gradient and
// disables the entrance motion.

import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useCloudAccountStore } from '../stores/cloudAccountStore'
import AuroraBackdrop from './AuroraBackdrop'

interface WelcomeViewProps {
  onStart: () => void
  theme?: 'dark' | 'light'
}

// ── Icons (SVG, currentColor stroke — no emoji per design system) ─────────────

const iconProps = {
  width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function HistoryIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}
function SyncIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <path d="M21 12a9 9 0 0 0-9-9 9 9 0 0 0-6.3 2.6L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9 9 0 0 0 6.3-2.6L21 16" />
      <path d="M21 21v-5h-5" />
    </svg>
  )
}
function BrandIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 2.8 12V4a1 1 0 0 1 1-1h8a2 2 0 0 1 1.4.6l7.4 7.4a2 2 0 0 1 0 2.8Z" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export default function WelcomeView({ onStart, theme = 'dark' }: WelcomeViewProps) {
  const { t } = useTranslation('pro')
  const email = useCloudAccountStore((s) => s.email)
  const status = useCloudAccountStore((s) => s.status)
  const reduce = useReducedMotion()
  const light = theme === 'light'

  const benefits = [
    { Icon: HistoryIcon, title: t('welcomePage.historyTitle'), body: t('welcomePage.historyBody') },
    { Icon: SyncIcon, title: t('welcomePage.syncTitle'), body: t('welcomePage.syncBody') },
    { Icon: BrandIcon, title: t('welcomePage.brandTitle'), body: t('welcomePage.brandBody') },
  ]

  // Theme-aware materials (Apple vibrancy: translucent surface + hairline).
  const card = light
    ? { background: 'rgba(255,255,255,0.72)', borderColor: 'rgba(15,17,35,0.08)', boxShadow: '0 24px 70px -20px rgba(40,48,120,0.28)' }
    : { background: 'rgba(18,19,26,0.55)', borderColor: 'rgba(255,255,255,0.09)', boxShadow: '0 30px 90px -30px rgba(0,0,0,0.75)' }
  const tile = light
    ? { background: 'rgba(255,255,255,0.70)', borderColor: 'rgba(15,17,35,0.08)' }
    : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }

  const fade = useMemo(
    () => ({
      hidden: { opacity: 0, y: reduce ? 0 : 14 },
      show: (i: number) => ({
        opacity: 1, y: 0,
        transition: { duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 0.06 * i, ease: [0.22, 1, 0.36, 1] as const },
      }),
    }),
    [reduce],
  )

  return (
    <div className={`relative min-h-full w-full overflow-hidden ${light ? 'lp-light' : ''}`} style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Layer 1 — shared aurora shader backdrop */}
      <AuroraBackdrop light={light} />

      {/* Layer 2 — content */}
      <div className="relative z-10 min-h-full w-full flex items-center justify-center px-5 py-14 overflow-y-auto">
        <div className="w-full max-w-[600px] flex flex-col items-center text-center">
          {/* Success badge */}
          <motion.div
            custom={0} variants={fade} initial="hidden" animate="show"
            className="w-16 h-16 rounded-[20px] grid place-items-center mb-7"
            style={{
              color: 'white',
              background: 'linear-gradient(160deg, var(--accent), var(--accent-2))',
              boxShadow: '0 12px 30px -8px rgba(94,106,210,0.55), inset 0 1px 0 rgba(255,255,255,0.25)',
            }}
          >
            <CheckIcon />
          </motion.div>

          {/* Headline */}
          <motion.h1
            custom={1} variants={fade} initial="hidden" animate="show"
            className="text-[clamp(28px,4vw,40px)] font-semibold leading-[1.08] tracking-[-0.02em]"
          >
            {status === 'signed-in' ? t('welcomePage.title') : t('welcomePage.titleAnonymous')}
          </motion.h1>

          {status === 'signed-in' && email && (
            <motion.p
              custom={2} variants={fade} initial="hidden" animate="show"
              className="mt-3 text-[13px] font-medium px-3 py-1 rounded-full"
              style={{ color: 'var(--accent-2)', background: light ? 'rgba(54,69,196,0.08)' : 'rgba(139,147,232,0.12)' }}
            >
              {t('welcomePage.signedInAs', { email })}
            </motion.p>
          )}

          <motion.p
            custom={3} variants={fade} initial="hidden" animate="show"
            className="mt-4 max-w-[46ch] text-[15px] leading-relaxed"
            style={{ color: 'var(--text-dim)' }}
          >
            {t('welcomePage.subtitle')}
          </motion.p>

          {/* Value card (vibrancy glass) */}
          <motion.div
            custom={4} variants={fade} initial="hidden" animate="show"
            className="mt-9 w-full rounded-[24px] border p-3 backdrop-blur-xl"
            style={card}
          >
            <div className="grid gap-2.5 sm:grid-cols-3">
              {benefits.map(({ Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-[16px] border p-4 flex flex-col items-center gap-2 text-center"
                  style={tile}
                >
                  <span className="grid place-items-center w-10 h-10 rounded-[12px]" style={{ color: 'var(--accent-2)', background: light ? 'rgba(54,69,196,0.08)' : 'rgba(139,147,232,0.10)' }}>
                    <Icon />
                  </span>
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{title}</span>
                  <span className="text-[12px] leading-snug" style={{ color: 'var(--text-dim)' }}>{body}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* CTA */}
          <motion.div
            custom={5} variants={fade} initial="hidden" animate="show"
            className="mt-9 flex flex-col items-center gap-3"
          >
            <button
              onClick={onStart}
              className="group relative h-12 px-7 rounded-full text-[14px] font-semibold text-white cursor-pointer transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{
                background: 'linear-gradient(160deg, var(--accent), var(--accent-2))',
                boxShadow: '0 14px 34px -10px rgba(94,106,210,0.6), inset 0 1px 0 rgba(255,255,255,0.25)',
                ['--tw-ring-color' as string]: 'var(--accent-2)',
                ['--tw-ring-offset-color' as string]: 'var(--bg)',
              }}
            >
              {t('welcomePage.cta')}
            </button>
            <p className="text-[12px]" style={{ color: 'var(--text-faint)' }}>{t('welcomePage.hint')}</p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
