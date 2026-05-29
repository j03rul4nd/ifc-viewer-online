# IFC Viewer — Email Capture Cloudflare Worker

Zero-server email capture: a Cloudflare Worker proxies subscriber signups to the
Resend Audiences API so the API key is never exposed to the frontend.

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

## Test

```bash
curl -X POST https://ifc-viewer-email-capture.<accountname>.workers.dev/subscribe \
  -H "Content-Type: application/json" \
  -H "Origin: https://j03rul4nd.github.io" \
  -d '{"email":"test@example.com","source":"landing"}'
# → {"ok":true}
```

## Maintenance

- Monitor usage in the Cloudflare Workers dashboard
- The free tier is more than sufficient until several thousand signups
- No server to patch, no containers to manage
