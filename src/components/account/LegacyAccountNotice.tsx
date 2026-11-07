// ─── LegacyAccountNotice ──────────────────────────────────────────────────────
// Accounts created before 2026-11-07 lived in Clerk's development instance. They
// were copied into the production instance with publicMetadata.legacyAccount,
// matched by email, without their old password (Google sign-in links by email;
// everyone else signs in with an emailed code). The first time one of them
// signs in, this explains why and apologises once. Dismissal is stored on the
// user (unsafeMetadata) so it never shows again on any device.
//
// Lives in the lazy Clerk chunk (rendered by ClerkSessionBridge), so it never
// reaches the anonymous bundle.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUser } from '@clerk/react'
import { Modal } from '../Modal'

export default function LegacyAccountNotice() {
  const { user, isLoaded } = useUser()
  const { t } = useTranslation('pro')
  const [dismissed, setDismissed] = useState(false)

  const isLegacy = (user?.publicMetadata as { legacyAccount?: boolean } | undefined)?.legacyAccount === true
  const seen = (user?.unsafeMetadata as { legacyNoticeSeen?: boolean } | undefined)?.legacyNoticeSeen === true
  const open = isLoaded && !!user && isLegacy && !seen && !dismissed

  const close = () => {
    setDismissed(true)
    if (!user) return
    // Best effort: if it fails the notice may show once more, which is harmless.
    void user.update({ unsafeMetadata: { ...user.unsafeMetadata, legacyNoticeSeen: true } }).catch(() => {})
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('legacy.title')}
      size="md"
      footer={
        <button
          onClick={close}
          className="min-h-[36px] px-4 rounded-[8px] bg-[var(--accent)] text-white text-[13px] font-medium hover:brightness-110 cursor-pointer"
        >
          {t('legacy.ok')}
        </button>
      }
    >
      <div className="flex flex-col gap-3 text-[13px] leading-relaxed text-[var(--text-dim)]">
        <p>{t('legacy.body1')}</p>
        <p>{t('legacy.body2')}</p>
        <p>{t('legacy.body3')}</p>
      </div>
    </Modal>
  )
}
