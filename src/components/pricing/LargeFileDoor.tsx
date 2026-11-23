// A big IFC the browser could not open: the users with the most pain. No
// server processing exists, so the copy is honest — leave an email and the
// file gets handled by hand. Sizes only reach analytics, never file names.

import { useTranslation } from 'react-i18next'
import { Modal } from '../Modal'
import NotifyMeForm from './NotifyMeForm'
import { trackServerProcessingInterest } from '../../lib/analytics'
import { useCloudAccountStore } from '../../stores/cloudAccountStore'

export default function LargeFileDoor({ sizeMb, onClose }: { sizeMb: number; onClose: () => void }) {
  const { t } = useTranslation('toasts')
  const email = useCloudAccountStore((s) => (s.status === 'signed-in' ? s.email : null))
  return (
    <Modal open onClose={onClose} title={t('largeFileDoor.title')} size="sm">
      <div className="flex flex-col gap-3 text-[13px] text-[var(--text-dim)]">
        <p>{t('largeFileDoor.body', { size: sizeMb })}</p>
        <NotifyMeForm
          source={`large_file:${sizeMb}`}
          label={t('largeFileDoor.notifyLabel')}
          initialEmail={email}
          text={{ submit: t('largeFileDoor.submit'), thanks: t('largeFileDoor.thanks'), error: t('largeFileDoor.error') }}
          onDone={() => trackServerProcessingInterest({ file_size_mb: sizeMb, step: 'email_left' })}
        />
        <button type="button" onClick={onClose} className="self-end text-[12px] text-[var(--text-dim)] hover:text-[var(--text)]">
          {t('largeFileDoor.dismiss')}
        </button>
      </div>
    </Modal>
  )
}
