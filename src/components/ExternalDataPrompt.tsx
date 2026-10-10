// ─── ExternalDataPrompt ───────────────────────────────────────────────────────
// The one question a shared link or scene asks before it loads data from other
// servers (lib/privacy/external-data.ts): which servers, what they see, load
// or not. Nothing is requested from them until the answer is yes.

import { useTranslation } from 'react-i18next'
import { Modal } from './Modal'
import { useExternalDataPrompt } from '../lib/privacy/external-data'

export function ExternalDataPrompt() {
  const { t } = useTranslation('common')
  const request = useExternalDataPrompt((s) => s.queue[0] ?? null)
  const answer = useExternalDataPrompt((s) => s.answer)
  return (
    <Modal
      open={request !== null}
      onClose={() => answer(false)}
      title={t('externalData.title')}
      size="sm"
      footer={(
        <>
          <button
            className="flex-1 h-9 rounded-[8px] border border-[var(--border-strong)] text-[12px] text-[var(--text)] hover:bg-[var(--surface-2)]"
            onClick={() => answer(false)}
          >
            {t('externalData.skip')}
          </button>
          <button
            autoFocus
            className="flex-1 h-9 rounded-[8px] text-[12px] font-semibold text-white"
            style={{ background: 'var(--accent)' }}
            onClick={() => answer(true)}
          >
            {t('externalData.load')}
          </button>
        </>
      )}
    >
      {request && (
        <div className="px-4 py-3 flex flex-col gap-2 text-[12.5px] leading-relaxed text-[var(--text-dim)]">
          <p>{t(`externalData.body.${request.kind}`)}</p>
          <ul className="flex flex-col gap-0.5 font-mono text-[11.5px] text-[var(--text)]">
            {request.hosts.map((h) => <li key={h} className="truncate" title={h}>{h}</li>)}
          </ul>
          <p className="text-[11.5px] text-[var(--text-faint)]">{t('externalData.sees')}</p>
        </div>
      )}
    </Modal>
  )
}
