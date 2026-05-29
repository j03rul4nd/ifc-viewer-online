/**
 * IFC Viewer — Email Capture Worker
 *
 * Proxies subscriber signups to the Resend Audiences API.
 * The RESEND_API_KEY is a Worker Secret — never exposed to the frontend.
 *
 * Endpoint:  POST /subscribe
 * Body:      { email: string, source?: string, locale?: string }
 * Response:  { ok: true } | { ok: false, error: string }
 *
 * Deploy:
 *   1. Install Wrangler: npm install -g wrangler
 *   2. Set secret:  wrangler secret put RESEND_API_KEY
 *   3. Set secret:  wrangler secret put RESEND_AUDIENCE_ID
 *   4. Deploy:      wrangler deploy
 *
 * Free tier limits (2026):
 *   Cloudflare Workers free: 100,000 req/day
 *   Resend free: 3,000 emails/month, 1 audience
 */

const ALLOWED_ORIGINS = [
  'https://j03rul4nd.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
]

/**
 * Validate email format — deliberately simple (RFC 5322 is overkill here).
 * Resend will reject malformed addresses at the API level anyway.
 */
function isValidEmail(email) {
  return typeof email === 'string'
    && email.length > 5
    && email.length < 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Build CORS headers — only allow known origins.
 * Returns null if the origin is not in the allow-list.
 */
function corsHeaders(origin) {
  if (!ALLOWED_ORIGINS.includes(origin)) return null
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
  }
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  })
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? ''
    const cors   = corsHeaders(origin)

    // ── Pre-flight ──────────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      if (!cors) return new Response(null, { status: 403 })
      return new Response(null, { status: 204, headers: cors })
    }

    // ── Route check ─────────────────────────────────────────────────────────
    const url = new URL(request.url)
    if (url.pathname !== '/subscribe' || request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Not found' }, 404, cors ?? {})
    }

    // ── Parse body ──────────────────────────────────────────────────────────
    let body
    try {
      body = await request.json()
    } catch {
      return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400, cors ?? {})
    }

    const { email, source = 'landing', locale = 'en' } = body

    if (!isValidEmail(email)) {
      return jsonResponse({ ok: false, error: 'Invalid email address' }, 422, cors ?? {})
    }

    // ── Call Resend Audiences API ────────────────────────────────────────────
    // Docs: https://resend.com/docs/api-reference/audiences/create-contact
    const audienceId = env.RESEND_AUDIENCE_ID
    const apiKey     = env.RESEND_API_KEY

    if (!apiKey || !audienceId) {
      console.error('[worker] Missing RESEND_API_KEY or RESEND_AUDIENCE_ID secret')
      return jsonResponse({ ok: false, error: 'Service not configured' }, 503, cors ?? {})
    }

    let resendRes
    try {
      resendRes = await fetch(
        `https://api.resend.com/audiences/${audienceId}/contacts`,
        {
          method:  'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({
            email,
            unsubscribed: false,
            // Store signup metadata as custom data Resend supports
            // (Resend free tier: first_name / last_name only; extra fields ignored gracefully)
            first_name: '',
            last_name:  '',
            // Tag for segmentation in Resend dashboard
            data: {
              source,
              locale,
              signed_up_at: new Date().toISOString(),
            },
          }),
        },
      )
    } catch (err) {
      console.error('[worker] Resend fetch failed:', err)
      return jsonResponse({ ok: false, error: 'Upstream error' }, 502, cors ?? {})
    }

    if (!resendRes.ok) {
      // 409 = contact already exists — treat as success (idempotent)
      if (resendRes.status === 409) {
        return jsonResponse({ ok: true, already: true }, 200, cors ?? {})
      }
      const errBody = await resendRes.text()
      console.error('[worker] Resend error:', resendRes.status, errBody)
      return jsonResponse({ ok: false, error: 'Subscription failed' }, 500, cors ?? {})
    }

    return jsonResponse({ ok: true }, 200, cors ?? {})
  },
}
