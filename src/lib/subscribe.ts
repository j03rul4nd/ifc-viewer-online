/**
 * Email subscription — thin client for the Cloudflare Worker endpoint.
 *
 * The Worker proxies signups to the Resend Audiences API so the API key is
 * never exposed in the frontend bundle.
 *
 * Requires env var: VITE_SUBSCRIBE_URL
 * (not set = every call returns { ok: false, disabled: true } silently)
 */

export interface SubscribeResult {
  ok:       boolean
  already?: boolean    // true when email already in the list (still counts as success)
  disabled?: boolean   // true when VITE_SUBSCRIBE_URL is not configured
  error?:   string
}

export async function subscribeEmail(
  email: string,
  source: string = 'landing',
  locale: string = 'en',
): Promise<SubscribeResult> {
  const endpoint = import.meta.env.VITE_SUBSCRIBE_URL as string | undefined

  // No endpoint configured (dev / pre-deploy) — fail gracefully
  if (!endpoint) {
    if (import.meta.env.DEV) {
      console.info('[subscribe] VITE_SUBSCRIBE_URL not set — signup would go to:', email)
    }
    return { ok: false, disabled: true }
  }

  try {
    const res = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, source, locale }),
    })

    const data = await res.json() as SubscribeResult

    if (!res.ok && !data.ok) {
      return { ok: false, error: data.error ?? 'Subscription failed' }
    }

    return data
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error'
    console.error('[subscribe] Error:', message)
    return { ok: false, error: message }
  }
}
