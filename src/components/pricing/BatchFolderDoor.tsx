// "Validate folder (Pro)" — the fake door behind a multi-IFC drop
// (lib/batch-folder-door.ts). It never pretends the feature exists: the first
// thing it says is that it is coming, then asks where to tell them.

import { useTranslation } from 'react-i18next'
import { Modal } from '../Modal'
import NotifyMeForm from './NotifyMeForm'
import { trackBatchFolderInterest } from '../../lib/analytics'

export default function BatchFolderDoor({ fileCount, onClose }: { fileCount: number; onClose: () => void }) {
  const { t } = useTranslation('pro')
  return (
    <Modal open onClose={onClose} title={t('batchFolder.title')} size="sm">
      <div className="flex flex-col gap-3 text-[13px] text-[var(--text-dim)]">
        <p><strong className="text-[var(--text)]">{t('batchFolder.soon')}</strong> {t('batchFolder.body')}</p>
        <NotifyMeForm
          source="batch_folder"
          label={t('batchFolder.notifyLabel')}
          text={{ submit: t('batchFolder.submit'), thanks: t('batchFolder.thanks'), error: t('batchFolder.error') }}
          onDone={() => trackBatchFolderInterest({ file_count: fileCount, step: 'email_left' })}
        />
      </div>
    </Modal>
  )
}
