// ─── ClerkSessionBridge ───────────────────────────────────────────────────────
// Lives INSIDE the lazy vendor-auth chunk (mounted by main.tsx next to the
// ClerkProvider, only when a publishable key exists). It is the single writer
// of cloudAccountStore: the rest of the app reads the store and never imports
// @clerk/*.
//
// Also owns the return-from-checkout flow (docs-planning/01 §7): on
// ?billing=success it polls GET /entitlement every 2 s for up to 30 s until
// the Stripe webhook lands, then toasts and lets every <RequirePlan> re-render.

import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useClerk, useSession, useUser } from '@clerk/react'
import { useCloudAccountStore, type PlanCache } from '../../stores/cloudAccountStore'
import { getEntitlement } from '../../lib/cloud/account-client'
import { toast } from '../../stores/toastStore'
import { trackCheckoutCompleted } from '../../lib/analytics'

function planFromMetadata(meta: unknown): PlanCache | null {
  const m = meta as { plan?: string; planStatus?: string } | null
  if (!m || typeof m.plan !== 'string') return null
  const plan = (['free', 'pro', 'org'] as const).find((p) => p === m.plan) ?? 'free'
  const planStatus = (['active', 'past_due', 'canceled'] as const).find((s) => s === m.planStatus) ?? 'active'
  return { plan, planStatus }
}

export default function ClerkSessionBridge() {
  const { user, isLoaded } = useUser()
  const { session } = useSession()
  const clerk = useClerk()
  const setSession = useCloudAccountStore((s) => s.setSession)
  const setPlanCache = useCloudAccountStore((s) => s.setPlanCache)
  const { t } = useTranslation('pro')

  // ── Sync Clerk state → store ────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded) return
    if (!user || !session) {
      setSession({ status: 'anonymous', userId: null, email: null, planCache: null, getToken: null, signOut: null })
      return
    }
    setSession({
      status: 'signed-in',
      userId: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? null,
      planCache: planFromMetadata(user.publicMetadata),
      getToken: () => session.getToken(),
      signOut: () => clerk.signOut(),
    })
  }, [isLoaded, user, session, clerk, setSession])

  // ── ?billing=success → poll the truth until the webhook lands ───────────
  const polled = useRef(false)
  useEffect(() => {
    if (polled.current || !isLoaded || !session) return
    const params = new URLSearchParams(window.location.search)
    const billing = params.get('billing')
    if (!billing) return
    polled.current = true

    // Strip the param either way so reloads don't re-trigger.
    params.delete('billing')
    const query = params.toString()
    history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash)

    if (billing !== 'success') return
    let cancelled = false
    void (async () => {
      const deadline = Date.now() + 30_000
      while (!cancelled && Date.now() < deadline) {
        const token = await session.getToken()
        if (!token) break
        const r = await getEntitlement(token)
        if (r.ok && r.value.plan !== 'free') {
          setPlanCache({ plan: r.value.plan, planStatus: r.value.planStatus })
          trackCheckoutCompleted({ plan: r.value.plan })
          toast(t('checkoutWelcome'), 'success', { duration: 8000 })
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
      if (!cancelled) toast(t('checkoutPending'), 'info', { duration: 10000 })
    })()
    return () => { cancelled = true }
  }, [isLoaded, session, setPlanCache, t])

  return null
}
