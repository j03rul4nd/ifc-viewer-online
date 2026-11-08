// ─── RequestNudge ─────────────────────────────────────────────────────────────
// A small card that asks "what would help you most?" with the three answers
// that fit what this person just did (exported → share with the client, IDS →
// automatic checks, several models → versions and team issues…). One tap opens
// the form already on that answer; signed-in or not.
//
// Shown only when it earns the interruption:
//  · App mounts it only where feedback is allowed (top-level full viewer, not
//    in any iframe / SDK / WordPress / Shopify page, not in client mode, a tour
//    or a studio — see lib/feedback-gate).
//  · It waits for real use (a validated model plus one more action, or a few
//    minutes with it), never right after load, never on top of a dialog.
//  · Once per session, 30 days after an answer, and a growing pause after each
//    "no" (7, 14, 28… days).
//
// Clerk-free.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { MessageSquarePlus, X } from 'lucide-react'
import { openFeatureRequest, useCloudAccountStore } from '../../stores/cloudAccountStore'
import { trackFeatureRequestNudge } from '../../lib/analytics'
import { askDue, isEngaged, noteAsked, noteDismissed, readSignals, suggestedFeatures } from '../../lib/feedback-gate'
import type { RequestFeature } from '../../lib/feature-requests'

/** Never sooner than this after the card is mounted (the model just loaded). */
const MIN_WAIT_MS = 75_000
/** Without other signals, this much time with a validated model is enough. */
const DWELL_MS = 4 * 60_000
const POLL_MS = 15_000

/** Something else is talking to the user: do not stack another ask on it. */
function busyScreen(): boolean {
  const s = useCloudAccountStore.getState()
  return s.featureRequestOpen || s.accountModalOpen || document.querySelector('[role="dialog"]') !== null
}

export default function RequestNudge() {
  const { t } = useTranslation('pro')
  const formOpen = useCloudAccountStore((s) => s.featureRequestOpen)
  const [options, setOptions] = useState<RequestFeature[] | null>(null)

  useEffect(() => {
    if (!askDue()) return
    const mountedAt = Date.now()
    const id = window.setInterval(() => {
      const waited = Date.now() - mountedAt
      if (waited < MIN_WAIT_MS || !askDue() || busyScreen()) return
      const signals = readSignals()
      if (!isEngaged(signals) && waited < DWELL_MS) return
      window.clearInterval(id)
      noteAsked()
      const picks = suggestedFeatures(signals)
      setOptions(picks)
      trackFeatureRequestNudge({ action: 'shown', options: picks.join(',') })
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [])

  if (!options || formOpen) return null

  const choose = (feature: RequestFeature | 'other') => {
    trackFeatureRequestNudge({ action: 'chosen', options: feature })
    setOptions(null)
    openFeatureRequest('nudge', feature === 'other' ? { feature: 'other' } : { feature })
  }
  const dismiss = () => {
    trackFeatureRequestNudge({ action: 'dismissed', options: options.join(',') })
    noteDismissed()
    setOptions(null)
  }

  const chip = 'min-h-[32px] px-3 rounded-[8px] border border-[var(--border)] text-left text-[12px] leading-snug text-[var(--text)] hover:border-[var(--accent)] hover:bg-[rgba(10,132,129,0.12)] transition-colors cursor-pointer'

  return createPortal(
    <aside
      role="complementary"
      aria-label={t('requests.nudgeTitle')}
      className="fixed z-[56] right-3 left-3 sm:left-auto sm:w-[360px] bottom-[calc(env(safe-area-inset-bottom)+84px)] sm:bottom-5 rounded-2xl glass border border-[var(--border-strong)] shadow-[0_16px_48px_rgba(0,0,0,0.5)] p-3.5 flex flex-col gap-2.5"
    >
      <div className="flex items-start gap-2.5">
        <MessageSquarePlus aria-hidden size={18} className="mt-0.5 shrink-0 text-[var(--accent-2)]" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium leading-snug text-[var(--text)]">{t('requests.nudgeTitle')}</p>
          <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-dim)]">{t('requests.nudgeBody')}</p>
        </div>
        <button
          onClick={dismiss}
          aria-label={t('requests.nudgeDismiss')}
          className="shrink-0 w-7 h-7 -mt-1 -mr-1 grid place-items-center rounded-md text-[var(--text-faint)] hover:text-[var(--text)] cursor-pointer"
        >
          <X aria-hidden size={14} />
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {options.map((f) => (
          <button key={f} onClick={() => choose(f)} className={chip}>{t(`requests.feature.${f}.title`)}</button>
        ))}
        <button onClick={() => choose('other')} className="self-start mt-0.5 text-[12px] text-[var(--accent-2)] underline underline-offset-2 cursor-pointer">
          {t('requests.nudgeOther')}
        </button>
      </div>
    </aside>,
    document.body,
  )
}
