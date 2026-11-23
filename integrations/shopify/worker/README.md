# Shopify billing Worker

Syncs the merchant's Shopify App Pricing plan to the app metafield `ifcvo.plan`, which
the theme app extension reads in Liquid. Owner steps: [DEPLOY.md](DEPLOY.md).

## D-327 — Paid plans through Shopify App Pricing, synced by a Free-plan Worker (2026-11-24)

**Context.** The App Store does not allow off-platform charges or licence keys for
features used inside Shopify, so the Ed25519 licence keys (T-325, `license/sign.mjs`)
cannot be how merchants pay. Plans (Free $0, Starter $9/month with a 14-day trial,
Business $29/month; `listing/LISTING.md`) must be charged by Shopify. Owner rule: zero
infrastructure spend before revenue, and nothing that bills on overage.

**What Shopify requires (checked on shopify.dev, 2026-11-23/24).**
- *Managed Pricing* is now called **Shopify App Pricing**. Plans are defined in the
  Partner Dashboard (listing → Pricing content → Settings → Shopify App Pricing);
  Shopify hosts the plan page
  `https://admin.shopify.com/store/<store>/charges/<app-handle>/pricing_plans` and
  charges. The app must not call `appSubscriptionCreate`.
- The app must check the subscription and send merchants without one to that page.
  After approval Shopify redirects to the plan's *welcome link* (a path in App Home,
  with `plan_handle` appended).
- App Pricing **does not send `app_subscriptions/update`** for its changes: status
  comes from the redirect, or from the Partner API (`activeSubscription`, `events`)
  for changes without a redirect (cancel, freeze). Subscriptions also show up in Admin
  `currentAppInstallation.activeSubscriptions` (the docs note their `test` field), which
  needs no extra scope.
- Public apps must use **expiring offline tokens** (1 h access token, 90-day rotating
  refresh token); non-expiring ones are blocked from 2027-01-01.
- An App Home page needs an app URL; embedded pages load App Bridge and use ID tokens
  (token exchange, no OAuth redirect: Shopify-managed install with the scopes in
  `shopify.app.toml`).

**Decision.**
1. **Billing:** Shopify App Pricing, plans named exactly `Free`, `Starter`, `Business`
   (the Worker maps the subscription *name*, case-insensitive; highest ACTIVE wins;
   anything else, frozen or cancelled is Free). Welcome link for every plan: `/app`.
2. **Theme gate:** the runtime snippet prints
   `data-ifcvo-plan="{{ app.metafields.ifcvo.plan.value }}"` once per page; `ifcvo.js`
   gates from it; empty or unknown is Free. Storefronts never call the Worker, so
   visitor traffic cannot use up any quota. Licence keys removed (code, public key,
   docs). Free keeps everything that was free before (viewer, IFC download, specs,
   rooms, explorer, views).
3. **Worker (Cloudflare Workers Free, `workers.dev` only):**
   - `GET /app`: embedded page, served only for a launch whose query HMAC verifies;
     CSP `frame-ancestors` limited to the shop and admin.shopify.com. Shows the current
     plan, a **Change plan** button (Shopify's plan page) and the setup guide link.
   - `POST /api/plan`: verifies the ID token (HS256 with the app secret, `aud`, `exp`,
     `nbf`, `iss` = `dest`). First open: token exchange for an **expiring offline token**
     and store its refresh token. Later opens: an **online** token (does not retire the
     stored offline token, so no KV write). Reads `activeSubscriptions`, and calls
     `metafieldsSet` (owner = app installation, `ifcvo.plan`, single line text) **only
     if the plan changed**. Per-isolate 15 s throttle per shop.
   - `POST /webhooks`: HMAC (base64 SHA-256 of the raw body) checked first; missing
     header or body > 64 KB → 401 without crypto. `app/uninstalled` and `shop/redact`
     delete the shop's KV record (only if present); `customers/data_request` and
     `customers/redact` → 200 (no customer data stored). `app_subscriptions/update`
     (still subscribed, in case Shopify sends it) → background resync.
   - Daily cron (optional): with Partner API secrets, reads subscription events of the
     last 26 h and resyncs at most 15 shops (3 subrequests each, under the Free limit
     of 50). Without them it does nothing; cancellations/freezes then apply the next time
     the merchant opens the app or reinstalls.
4. **Storage:** one KV key per shop, `shop:<domain>` →
   `{ refresh, refreshExp, plan, installationId }`. Writes only on install, plan change,
   background refresh (rotation) and uninstall. No customer or buyer data.

**Costs that could appear, and why they cannot.**
| Product | Free limit | What happens at the limit | Why we stay far below |
|---|---|---|---|
| Workers requests | 100,000/day | Requests fail (1027 error), no charge on the Free plan | Only merchants' admin opens, webhooks and 1 cron/day; storefront visitors never call it |
| Workers CPU | 10 ms/request | Request fails | HMAC/JWT only; waiting on Shopify is not CPU time |
| Subrequests | 50/request | Request fails | ≤ 4 per request; cron capped at 15 shops |
| KV writes / deletes / lists | 1,000/day each | Write fails (sync retried next open) | Written only on change; no lists |
| KV reads | 100,000/day | Read fails | One read per admin open / webhook |
| KV storage | 1 GB | Write fails | < 300 bytes per shop |
| Cron triggers | 5 per account | Deploy fails | 1 used |
None of these bill on the **Workers Free** plan; billing exists only after a manual
upgrade to Workers Paid, which must not happen (DEPLOY.md checklist). Not used: R2, D1,
Durable Objects, Queues, Workers AI, Analytics Engine, Logpush, custom domains/routes,
Argo, Load Balancing, paid WAF/rate-limiting.

**Rejected.** Billing API with our own charge flow (more code, still needs a server);
licence keys (not allowed); storefront calls to the Worker (per-visitor traffic and
rate-limit exposure); Partner API as the only source (needs an extra org token; kept
optional for the cron).

**Risks.** Plan names in the Partner Dashboard must contain "starter"/"business".
Freezes without a redirect wait for the cron (needs Partner secrets) or the next open.
`admin.shopify.com/store/<handle>` assumes the store handle equals the myshopify
subdomain (true unless the merchant renamed the store handle; Shopify then redirects).

## Files

- `src/shopify.js` — HMAC, ID token, token exchange/refresh, plan mapping, `metafieldsSet` body.
- `src/index.js` — routes, KV dedupe, cron, admin page.
- `wrangler.jsonc` — Free-plan config (KV `SHOPS`, one cron, `workers_dev`).
- Tests: `scripts/shopify-billing-worker.test.ts`.
