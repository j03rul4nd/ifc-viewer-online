# IFC Viewer — Cloudflare Worker

One stateless Cloudflare Worker, two endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/subscribe` | POST | Email capture — proxies signups to the Resend Audiences API so the API key is never exposed to the frontend. |
| `/r?d=…` (alias `/report`) | GET | **Crawlable shared report (D-21, moat #3).** Server-renders a shared validation report as HTML with `<title>` + OpenGraph/Twitter meta + JSON-LD, so a shared link unfurls on social and gets indexed. The full report is base64url-encoded in the URL — **stateless, no stored model data**. |

### Why the report route exists

The in-app share link used a `#report=` **hash fragment**, which never leaves the
browser — crawlers and social unfurlers see nothing. This route moves the payload
to a query param the Worker can read and renders real HTML server-side. Each shared
report becomes a backlink + viral invite (the only *compounding* asset). The "how to
fix" prose mirrors the EN remediation corpus (`src/i18n/rule-remediation.ts`) so the
indexed pages carry expert AEC content.

**Security:** the `d` payload is fully attacker-controlled, so every field is coerced
to a safe value and HTML-escaped; the JSON-LD block unicode-escapes `<` to prevent
`</script>` breakout. Malformed/empty links render a `noindex` fallback page (still a
conversion CTA), never an executable payload.

**Link expiry:** shared reports are point-in-time snapshots, so a link older than
`REPORT_MAX_AGE_DAYS` (default 90) renders an "expired" page with **HTTP 410 Gone**
(`noindex`) so crawlers drop the URL. This is *advisory* — the payload is stateless,
so a forged `ts` bypasses it, but normal links carry their true creation time. The
data is non-sensitive (a Health Score the sender chose to publish).

**Rate limiting:** the [Workers Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
caps abuse per IP per 60s — `/subscribe` strict (5/min, it spends the Resend quota),
`/r` lenient (60/min, read-only + edge-cached). Configured as `[[unsafe.bindings]]`
in `wrangler.toml`. If the bindings are absent (local dev) the Worker **fails open**
(no limiting) so legitimate users are never blocked on an infra hiccup.

Try it: `…workers.dev/r?d=<base64url-json>` (the frontend Share button builds these).

## Cost

| Service          | Free limit                  |
|------------------|-----------------------------|
| CF Workers free  | 100,000 req/day             |
| Resend free      | 3,000 emails/month, 1 audience |

Both are free at the scale needed before the first 200 subscribers (the leading
indicator target for enabling the paid tier).

## Deploy (one-time setup, ~10 minutes)

### 1. Install Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. Create a Resend audience

1. Log into [resend.com](https://resend.com)
2. Go to **Audiences** → **Create audience** → name it "IFC Viewer"
3. Copy the **Audience ID** (looks like `e40fbb52-...`)

### 3. Set Worker secrets

```bash
cd cf-worker
wrangler secret put RESEND_API_KEY
# paste your Resend API key when prompted

wrangler secret put RESEND_AUDIENCE_ID
# paste the audience ID from step 2
```

### 4. Deploy

```bash
wrangler deploy
```

Wrangler prints the Worker URL, e.g.:
`https://ifc-viewer-email-capture.<accountname>.workers.dev`

### 5. Configure the frontend

Add to `.env.local` (not committed):
```
VITE_SUBSCRIBE_URL=https://ifc-viewer-email-capture.<accountname>.workers.dev/subscribe
```

Add to GitHub Actions secrets (for CI builds):
- `VITE_SUBSCRIBE_URL` → same URL

For crawlable shared reports, also set the report route (same Worker, path `/r`):
```
VITE_REPORT_URL=https://ifc-viewer-email-capture.<accountname>.workers.dev/r
```
Without it, the Share button falls back to the in-app `#report=` hash link (works,
but not crawlable). The Worker reads `APP_URL` / `OG_IMAGE_URL` from `wrangler.toml`
(defaults point at the current GitHub Pages deploy) — update them if the SPA moves.

## Test

```bash
curl -X POST https://ifc-viewer-email-capture.<accountname>.workers.dev/subscribe \
  -H "Content-Type: application/json" \
  -H "Origin: https://www.ifcvieweronline.eu" \
  -d '{"email":"test@example.com","source":"landing"}'
# → {"ok":true}
```

Report route (paste a real `d` from the app's Share button, or any base64url JSON):
```bash
curl "https://ifc-viewer-email-capture.<accountname>.workers.dev/r?d=<payload>"
# → 200 text/html with <title>IFC Health Score …</title> + OG meta
```

## Maintenance

- Monitor usage in the Cloudflare Workers dashboard
- The free tier is more than sufficient until several thousand signups
- No server to patch, no containers to manage
