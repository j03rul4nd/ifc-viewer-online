// ─── RequestNudge ─────────────────────────────────────────────────────────────
// A small, dismissible card that asks a signed-in user "what would help you
// most?" — once they have actually used the viewer for a while, never on a
// timer from page load, never modal, and at most once every 30 days (also
// after they sent a request on their own). One tap opens the form.
//
// Clerk-free: App mounts it only for signed-in users in the viewer.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { MessageSquarePlus, X } from 'lucide-react'
import { openFeatureRequest, useCloudAccountStore } from '../../stores/cloudAccountStore'
import { markRequestNudged, requestNudgeDue } from '../../lib/feature-requests'

/** Time in the viewer with a validated model before asking. */
const DWELL_MS = 3 * 60_000

export default function RequestNudge() {
  const { t } = useTranslation('pro')
  const formOpen = useCloudAccountStore((s) => s.featureRequestOpen)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!requestNudgeDue()) return
    const id = window.setTimeout(() => {
      // Re-check: they may have sent a request meanwhile.
      if (!requestNudgeDue() || useCloudAccountStore.getState().featureRequestOpen) return
      markRequestNudged()
      setShow(true)
    }, DWELL_MS)
    return () => window.clearTimeout(id)
  }, [])

  if (!show || formOpen) return null

  return createPortal(
    <aside
      role="note"
      aria-label={t('requests.nudgeTitle')}
      className="fixed z-[56] right-3 left-3 sm:left-auto sm:w-[340px] bottom-[calc(env(safe-area-inset-bottom)+84px)] sm:bottom-5 rounded-2xl glass border border-[var(--border-strong)] shadow-[0_16px_48px_rgba(0,0,0,0.5)] p-3.5 flex items-start gap-3"
    >
      <MessageSquarePlus aria-hidden size={18} className="mt-0.5 shrink-0 text-[var(--accent-2)]" />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <p className="text-[13px] font-medium leading-snug text-[var(--text)]">{t('requests.nudgeTitle')}</p>
        <p className="text-[12px] leading-snug text-[var(--text-dim)]">{t('requests.nudgeBody')}</p>
        <button
          onClick={() => { setShow(false); openFeatureRequest('nudge') }}
          className="self-start min-h-[32px] px-3 rounded-[8px] bg-[var(--accent)] text-white text-[12px] font-medium hover:brightness-110 cursor-pointer"
        >
          {t('requests.nudgeCta')}
        </button>
      </div>
      <button
        onClick={() => setShow(false)}
        aria-label={t('requests.nudgeDismiss')}
        className="shrink-0 w-7 h-7 -mt-1 -mr-1 grid place-items-center rounded-md text-[var(--text-faint)] hover:text-[var(--text)] cursor-pointer"
      >
        <X aria-hidden size={14} />
      </button>
    </aside>,
    document.body,
  )
}
