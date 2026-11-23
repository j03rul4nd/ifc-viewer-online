# Deploy the billing Worker and Shopify App Pricing (owner steps)

Order matters: Worker first, then Partner Dashboard pricing, then `shopify app deploy`
(the app config points at the Worker). Design and cost table: [README.md](README.md) (D-327).

## 0. Free-plan safety checklist (do this first, and again before every deploy)

- [ ] Cloudflare dashboard → **Workers & Pages → Plans**: the account shows **Workers Free**.
      Do **not** click "Upgrade to Paid" (USD 5/month and usage billing).
- [ ] **Billing → Subscriptions**: no Workers Paid. R2 Paid is already active on the account
      for the `besco-*` buckets; this Worker does **not** bind R2, so it adds nothing there.
- [ ] `wrangler.jsonc` has only `kv_namespaces`, `triggers.crons` (1), `vars`,
      `workers_dev: true`. No `routes`, `r2_buckets`, `d1_databases`, `durable_objects`,
      `queues`, `ai`, `analytics_engine_datasets`, `limits`, `usage_model`
      (a test in `scripts/shopify-billing-worker.test.ts` fails if any appears).
- [ ] No custom domain or route for this Worker (so no zone add-ons: Argo, paid WAF,
      Load Balancing, Advanced Rate Limiting).
- [ ] Observability/Logpush not enabled for it (Logpush is a paid add-on).
- [ ] Budget alert at 1 USD stays on (an alert, not a stop: the Free plan is the stop).

On Workers Free every limit (100k requests/day, 10 ms CPU, 1k KV writes/day) makes
requests **fail**, it never bills. A merchant who hits a failure just reloads later.

Optional, free: Cloudflare dashboard → the Worker → Settings → Domains & Routes keeps
only `*.workers.dev`. Free WAF rate-limiting rules apply to zones, not workers.dev,
so they are not needed here: the Worker refuses unsigned requests before doing work.

## 1. Worker

From `integrations/shopify/worker` (wrangler via npx, nothing to install globally):

```sh
npx wrangler login
npx wrangler kv namespace create SHOPS
#   paste the printed id into wrangler.jsonc → kv_namespaces[0].id
npx wrangler secret put SHOPIFY_API_KEY      # Partner/Dev Dashboard → app → Client ID (26585d50…)
npx wrangler secret put SHOPIFY_API_SECRET   # same page → Client secret
npx wrangler deploy --dry-run --outdir dist  # check: no errors, no paid bindings listed
npx wrangler deploy
```

The URL must be `https://ifcvo-shopify-billing.joelbenitezdonari.workers.dev`. If the
workers.dev subdomain differs, change the three URLs in `../app/shopify.app.toml`.

Check: `curl -i https://ifcvo-shopify-billing.joelbenitezdonari.workers.dev/app` → 401
("Open IFC Viewer Online from your Shopify admin"); `curl -i -X POST …/webhooks` → 401.

Optional (daily resync of cancellations/freezes): Partner Dashboard → Settings →
Partner API clients → create one with "Manage apps" → then
`npx wrangler secret put PARTNER_API_TOKEN`, `PARTNER_ORG_ID` (the number in
partners.shopify.com/<id>/…) and `APP_GID` (`gid://shopify/App/<app id>`).

## 2. Plans (Partner Dashboard, not the Dev Dashboard)

Apps → IFC Viewer Online → Distribution → Manage listing → (English) Edit → Pricing
content → Manage → Settings → **Shopify App Pricing** → Switch. Default frequency Monthly.
Create public plans — names must be exactly these (the Worker maps by name):

| Name | Price | Trial | Welcome link |
|---|---|---|---|
| Free | $0 | — | `/app` |
| Starter | $9 / month | 14 days | `/app` |
| Business | $29 / month | — | `/app` |

Feature lists: `listing/LISTING.md` (or `listing/v3/SUBMIT.md` §3). Mark paid plans
"free for partners and developers" so the App Store reviewer can select them.

## 3. App

```sh
cd integrations/shopify/app   # from an up-to-date main checkout (C:/repo/ifc-cf-pages)
npm ci
shopify app build
shopify app deploy
```

## 4. Test on the dev store

1. Open the app in the dev store admin → page shows "Current plan: Free".
2. **Change plan** → Shopify plan page → pick Starter (no charge on a dev store) →
   back on `/app` it shows Starter.
3. Theme editor → a Starter block (e.g. IFC element details) shows; a Business block
   shows the "needs the Business plan" note in the editor only.
4. Uninstall → `npx wrangler kv key list --binding SHOPS` no longer lists the shop
   (one list call; avoid scripting it, lists are 1k/day on Free).

## Rollback

`shopify app deploy` of the previous version keeps storefronts working: with no
metafield every shop is Free. Deleting the Worker (`npx wrangler delete`) costs nothing.
