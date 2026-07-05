// ─── ClientHealthBadge (D-25) ──────────────────────────────────────────────────
// The Health Score as a trust seal for non-technical audiences: one big number,
// a semantic ring, one phrase. No rule breakdown, no severities, no "fix first"
// — that is coordinator language (the technical panel keeps it). States:
//   no score yet → "Verify model" CTA (runs the existing validation quietly)
//   validating   → ring spinner with live progress
//   scored       → animated ring + number + tier phrase

import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { useValidationRunner } from '../hooks/useValidationRunner'
import { clientScoreTier, clientScoreColor } from '../lib/presentation/clientScore'

const RING_R = 21
const RING_C = 2 * Math.PI * RING_R

export default function ClientHealthBadge() {
  const { t } = useTranslation('client')
  const { run, canRun, isRunning, progress, result } = useValidationRunner()

  const score = result?.qualityScore ?? null
  const tier = score !== null ? clientScoreTier(score) : null
  const color = tier ? clientScoreColor(tier) : 'var(--accent)'

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28, delay: 0.1 }}
      className="absolute top-3 left-3 z-[20] pointer-events-auto select-none"
    >
      <div className="flex items-center gap-3 pl-2.5 pr-4 py-2 rounded-2xl bg-[rgba(12,12,16,0.88)] backdrop-blur-[18px] border border-[var(--border-strong)] shadow-[0_8px_32px_rgba(0,0,0,0.5)]">

        {score !== null || isRunning ? (
          <>
            {/* Score ring */}
            <div className="relative w-[52px] h-[52px] shrink-0">
              <svg width="52" height="52" viewBox="0 0 52 52" className={isRunning && score === null ? 'animate-spin' : ''}>
                <circle cx="26" cy="26" r={RING_R} fill="none" stroke="var(--surface-2)" strokeWidth="4" />
                <motion.circle
                  cx="26" cy="26" r={RING_R} fill="none"
                  stroke={color} strokeWidth="4" strokeLinecap="round"
                  transform="rotate(-90 26 26)"
                  strokeDasharray={RING_C}
                  initial={{ strokeDashoffset: RING_C }}
                  animate={{ strokeDashoffset: RING_C * (1 - (isRunning && score === null ? 0.25 : (score ?? 0) / 100)) }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                />
              </svg>
              <span
                className="absolute inset-0 flex items-center justify-center text-[15px] font-bold font-mono tabular-nums"
                style={{ color }}
              >
                {isRunning && score === null ? (progress > 0 ? `${progress}` : '·') : score}
              </span>
            </div>

            {/* Phrase */}
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[var(--text)] leading-tight whitespace-nowrap">
                {isRunning && score === null
                  ? t('badge.verifying')
                  : tier === 'verified' ? t('badge.tier.verified')
                  : tier === 'attention' ? t('badge.tier.attention')
                  : tier === 'review' ? t('badge.tier.review')
                  : ''}
              </div>
              <div className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider mt-0.5">
                {t('badge.scoreLabel')}{score !== null ? ` · ${score}/100` : ''}
              </div>
            </div>
          </>
        ) : (
          /* No validation yet — quiet CTA that runs it */
          <button
            onClick={() => void run(undefined, undefined, true)}
            disabled={!canRun}
            className="flex items-center gap-2 py-1 text-left disabled:opacity-40 disabled:cursor-not-allowed group"
          >
            <span className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--accent)] text-white group-hover:brightness-110 transition-all shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-[var(--text)] leading-tight whitespace-nowrap">{t('badge.verify')}</span>
              <span className="block text-[10px] text-[var(--text-faint)] mt-0.5">{t('badge.verifyHint')}</span>
            </span>
          </button>
        )}
      </div>
    </motion.div>
  )
}
