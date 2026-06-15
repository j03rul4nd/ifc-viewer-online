// ─── InviteView ───────────────────────────────────────────────────────────────
// Phase 1.5 — a one-time, skippable, full-screen welcome shown INSTEAD of the
// ribbon for the two cases where a framing paragraph genuinely helps: warm
// referrals (borrowed trust) and standards/IDS folks (pre-empt the "score vs.
// real conformance" objection). Deliberately subtractive: no marketing chrome,
// one primary action, always skippable, the normal landing sits underneath.
// Mirrors the full-screen composition of SharedReportView.

import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n/config'
import { inviteViewKey, FOUNDER_NAME, type InviteContext } from '../lib/invite-registry'
import FounderAvatar from './FounderAvatar'

interface InviteViewProps {
  context: InviteContext
  /** Primary action — open the upload flow (honors the DM's "drag an IFC" promise). */
  onOpenFile: () => void
  /** Secondary action — browse a demo model. */
  onOpenDemo: () => void
  /** Skip / close — reveals the normal landing underneath. */
  onDismiss: () => void
}

export default function InviteView({ context, onOpenFile, onOpenDemo, onDismiss }: InviteViewProps) {
  const { t } = useTranslation('invite')
  const block = inviteViewKey(context) // 'view.referral' | 'view.standards'

  // Escape closes — never trap the visitor.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => { if (e.key === 'Escape') onDismiss() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onDismiss])

  // Tier-2 named note (set by hand per code; inert by default — never seeded).
  const note = context.noteKey
    ? (i18n.t as (k: string) => string)(`invite:${context.noteKey}`)
    : null

  return (
    <motion.div
      role="dialog"
      aria-modal="false"
      aria-label={t('view.aria')}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[60] overflow-y-auto bg-[var(--bg)]"
      style={{ backgroundImage: 'radial-gradient(120% 80% at 50% -10%, rgba(94,106,210,0.10), transparent 60%)' }}
    >
      <div className="min-h-full flex items-center justify-center px-5 py-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[520px] flex flex-col gap-6"
        >
          {/* Founder mark — real photo */}
          <div className="flex items-center gap-2.5">
            <FounderAvatar size={40} />
            <span className="text-[12.5px] text-[var(--text-faint)]">
              {t('signature', { name: FOUNDER_NAME })}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            <h1 className="text-[26px] leading-tight font-semibold text-[var(--text)] m-0 tracking-[-0.01em]">
              {t(`${block}.title`)}
            </h1>
            <p className="text-[15px] leading-relaxed text-[var(--text-dim)] m-0">
              {t(`${block}.body`)}
            </p>
            {note && (
              <p className="text-[14px] leading-relaxed text-[var(--text-dim)] italic m-0 pl-3 border-l-2 border-[var(--accent)]/40">
                {note}
              </p>
            )}
          </div>

          {context.loomUrl && (
            <a
              href={context.loomUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-[var(--accent-2)] hover:underline w-fit"
            >
              {t('view.demo')} →
            </a>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onOpenFile}
              className="h-10 px-5 rounded-xl bg-[var(--accent)] text-white text-[13.5px] font-medium hover:opacity-90 transition-opacity"
            >
              {t('view.open')}
            </button>
            <button
              type="button"
              onClick={onOpenDemo}
              className="h-10 px-5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-strong)] text-[var(--text-dim)] text-[13.5px] font-medium hover:text-[var(--text)] transition-colors"
            >
              {t('view.demo')}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="h-10 px-3 text-[var(--text-faint)] text-[13px] hover:text-[var(--text-dim)] transition-colors"
            >
              {t('view.skip')}
            </button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
