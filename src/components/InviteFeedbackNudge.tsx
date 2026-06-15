// ─── InviteFeedbackNudge ──────────────────────────────────────────────────────
// Phase 2 — the post-aha Mom-Test nudge. Shown ONCE per session to an invited
// visitor, AFTER their first validation run (never before the aha, never modal,
// always dismissible). Poses one segment-tuned honest question — the same Q1/Q2
// from the outreach kit — so when the founder follows up in the DM it resonates,
// and so PostHog can tie "prompted" to share_report_clicked by entry_source.
//
// There is deliberately NO in-app form: the conversation belongs in the DM. The
// value is the planted question + the analytics signal.

import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { inviteFeedbackKey, type InviteContext } from '../lib/invite-registry'
import { trackInviteFeedbackPrompted, trackInviteFeedbackDismissed } from '../lib/analytics'
import FounderAvatar from './FounderAvatar'

interface InviteFeedbackNudgeProps {
  context: InviteContext
  onDismiss: () => void
}

export default function InviteFeedbackNudge({ context, onDismiss }: InviteFeedbackNudgeProps) {
  const { t } = useTranslation('invite')

  // Fire once when it first appears (component mounts only when gated to show).
  useEffect(() => {
    trackInviteFeedbackPrompted({ segment: context.segment })
  }, [context.segment])

  const dismiss = (): void => {
    trackInviteFeedbackDismissed({ segment: context.segment })
    onDismiss()
  }

  return createPortal(
    <AnimatePresence>
      <motion.aside
        key="invite-feedback"
        role="note"
        aria-label={t('feedback.aria')}
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="fixed top-16 inset-x-0 z-[56] flex justify-center px-4 pointer-events-none"
      >
        <div className="pointer-events-auto w-full max-w-[460px] rounded-2xl glass border border-[var(--border-strong)] shadow-[0_16px_48px_rgba(0,0,0,0.5)] p-4 flex items-start gap-3">
          {/* Founder mark — real photo, so it reads as a person talking to you */}
          <FounderAvatar size={38} />

          <div className="flex flex-col gap-2 min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                {t('feedback.title')}
              </span>
              <button
                type="button"
                onClick={dismiss}
                aria-label={t('feedback.dismiss')}
                className="shrink-0 -mt-0.5 -mr-0.5 w-6 h-6 grid place-items-center rounded-md text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M1 1l8 8M9 1L1 9" />
                </svg>
              </button>
            </div>
            <p className="text-[13.5px] leading-snug text-[var(--text)] m-0">
              {t(inviteFeedbackKey(context))}
            </p>
            <p className="text-[11.5px] leading-snug text-[var(--text-faint)] m-0">
              {t('feedback.aside')}
            </p>
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>,
    document.body,
  )
}
