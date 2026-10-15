// ─── ExternalDataPrompt ───────────────────────────────────────────────────────
// The one question a shared link or scene asks before it loads data from other
// servers (lib/privacy/external-data.ts): which servers, what they see, load
// or not. Nothing is requested from them until the answer is yes.
//
// When the map is asking at the same time (a scene turns both on), the two
// become one dialog: what the map's tiles reveal, which servers the live data
// comes from, and one answer that applies to each — the same two permissions,
// saved exactly as their own dialogs would save them.

import { useTranslation } from 'react-i18next'
import { Modal } from './Modal'
import { useExternalDataPrompt, useMapConsentBridge } from '../lib/privacy/external-data'

export function ExternalDataPrompt() {
  const { t } = useTranslation(['common', 'geo'])
  const request = useExternalDataPrompt((s) => s.queue[0] ?? null)
  const answer = useExternalDataPrompt((s) => s.answer)
  const mapAccept = useMapConsentBridge((s) => s.accept)
  const mapDecline = useMapConsentBridge((s) => s.decline)
  const combined = request !== null && mapAccept !== null
  const respond = (accepted: boolean): void => {
    answer(accepted)
    if (combined) (accepted ? mapAccept : mapDecline)?.()
  }
  return (
    <Modal
      open={request !== null}
      onClose={() => respond(false)}
      title={combined ? t('externalData.combinedTitle') : t('externalData.title')}
      size="sm"
      footer={(
        <>
          <button
            className="flex-1 h-9 rounded-[8px] border border-[var(--border-strong)] text-[12px] text-[var(--text)] hover:bg-[var(--surface-2)]"
            onClick={() => respond(false)}
          >
            {t('externalData.skip')}
          </button>
          <button
            autoFocus
            className="flex-1 h-9 rounded-[8px] text-[12px] font-semibold text-white"
            style={{ background: 'var(--accent)' }}
            onClick={() => respond(true)}
          >
            {combined ? t('externalData.loadBoth') : t('externalData.load')}
          </button>
        </>
      )}
    >
      {request && (
        <div className="px-4 py-3 flex flex-col gap-2 text-[12.5px] leading-relaxed text-[var(--text-dim)]">
          {combined && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">{t('externalData.combinedMap')}</p>
              <p>{t('geo:consent.body')}</p>
              <p className="pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">{t('externalData.combinedData')}</p>
            </>
          )}
          {!combined && <p>{t(`externalData.body.${request.kind}`)}</p>}
          <ul className="flex flex-col gap-0.5 font-mono text-[11.5px] text-[var(--text)]">
            {request.hosts.map((h) => <li key={h} className="truncate" title={h}>{h}</li>)}
          </ul>
          <p className="text-[11.5px] text-[var(--text-faint)]">{t('externalData.sees')}</p>
        </div>
      )}
    </Modal>
  )
}
