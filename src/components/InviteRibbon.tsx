// ─── InviteRibbon ─────────────────────────────────────────────────────────────
// The Tier-1 contextual touch for a personalized invite: a slim, dismissible,
// founder-voiced note tuned by SEGMENT/SOURCE (never by name). Subtractive by
// design — one line, no buttons but a quiet dismiss, indistinguishable from the
// product (same tokens/motion). See personalized-invite-system-research.md §10.
//
// Gating (mobile / public / dismissed / unknown code) lives in
// shouldShowInviteRibbon — this component only renders when the parent decides to.

import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { inviteRibbonKey, FOUNDER_NAME, type InviteContext } from '../lib/invite-registry'
import FounderAvatar from './FounderAvatar'

interface InviteRibbonProps {
  context: InviteContext
  onDismiss: () => void
}

export default function InviteRibbon({ context, onDismiss }: InviteRibbonProps) {
  const { t } = useTranslation('invite')
  const [open, setOpen] = useState(true)

  // Animate the exit, then notify the parent (which persists the dismissal).
  const close = (): void => {
    setOpen(false)
    window.setTimeout(onDismiss, 220)
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.aside
          key="invite-ribbon"
          role="note"
          aria-label={t('aria')}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 14 }}
          // Deferred entrance so it never competes with first paint / TTI.
          transition={{ duration: 0.32, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="fixed left-4 z-[55] max-w-[360px] rounded-2xl glass border border-[var(--border-strong)] shadow-[0_16px_48px_rgba(0,0,0,0.5)] p-3.5 flex items-start gap-3"
          style={{ bottom: 'max(16px, env(safe-area-inset-bottom, 0px))' }}
        >
          {/* Founder mark — real photo */}
          <FounderAvatar size={32} />

          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-[12.5px] leading-snug text-[var(--text)] m-0">
              {t(inviteRibbonKey(context))}
            </p>
            <span className="text-[11px] text-[var(--text-faint)]">
              {t('signature', { name: FOUNDER_NAME })}
            </span>
          </div>

          <button
            type="button"
            onClick={close}
            aria-label={t('dismiss')}
            className="shrink-0 -mt-0.5 -mr-0.5 w-6 h-6 grid place-items-center rounded-md text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M1 1l8 8M9 1L1 9" />
            </svg>
          </button>
        </motion.aside>
      )}
    </AnimatePresence>,
    document.body,
  )
}
