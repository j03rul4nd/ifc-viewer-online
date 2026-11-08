// ─── RequestUpdates ───────────────────────────────────────────────────────────
// Closes the loop: when one of a signed-in user's requests moves (status or our
// reply), tell them once, with a button that opens "Your requests". Seeing the
// answer is what makes the next request worth sending.
//
// Cheap by design: only users who have sent a request (we remember their ids
// locally) and at most every 12 hours. Renders nothing; App mounts it only
// where talking to the user is allowed (see lib/feedback-gate).

import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { openFeatureRequest, useCloudAccountStore } from '../../stores/cloudAccountStore'
import { listMyFeatureRequests } from '../../lib/feature-requests'
import { changedSince, noteUpdatesChecked, readSeen, updatesCheckDue } from '../../lib/feedback-gate'
import { trackFeatureRequestUpdateSeen } from '../../lib/analytics'
import { toast } from '../../stores/toastStore'

export default function RequestUpdates() {
  const { t } = useTranslation('pro')
  const getToken = useCloudAccountStore((s) => s.getToken)

  useEffect(() => {
    if (!getToken || !updatesCheckDue()) return
    let cancelled = false
    const id = window.setTimeout(async () => {
      const token = await getToken()
      if (!token || cancelled) return
      const res = await listMyFeatureRequests(token)
      if (!res.ok || cancelled) return
      noteUpdatesChecked()
      const moved = changedSince(readSeen(), res.requests)
      if (moved.length === 0) return
      // Not marked seen here: they see it when they open the list.
      const first = moved[0]
      const message = moved.length === 1
        ? t('requests.updateOne', { feature: t(`requests.feature.${first.feature}.title`), status: t(`requests.status.${first.status}`) })
        : t('requests.updateMany', { count: moved.length })
      trackFeatureRequestUpdateSeen({ count: moved.length, opened: false })
      toast(message, 'info', {
        duration: 15_000,
        action: {
          label: t('requests.updateCta'),
          run: () => {
            trackFeatureRequestUpdateSeen({ count: moved.length, opened: true })
            openFeatureRequest('update', { view: 'mine' })
          },
        },
      })
    }, 8_000) // after the page settles, never during load
    return () => { cancelled = true; window.clearTimeout(id) }
  }, [getToken, t])

  return null
}
