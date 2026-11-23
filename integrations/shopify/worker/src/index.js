// IFC Viewer Online — Shopify billing Worker (D-327, README.md).
// Cloudflare Workers FREE plan only. Storefronts never call it: the theme reads the
// plan from the app metafield ifcvo.plan, which this Worker writes when it changes.
//
// Routes
//   GET  /app        embedded admin page (App Bridge): plan + link to Shopify's plan page
//   POST /api/plan   ID token → sync plan → { plan, plansUrl }
//   POST /webhooks   app_subscriptions/update, app/uninstalled, GDPR topics (HMAC)
//   cron             optional: Partner API subscription events of the last day → resync
//
// Bindings: KV SHOPS; secrets SHOPIFY_API_KEY, SHOPIFY_API_SECRET; optional secrets
// PARTNER_API_TOKEN, PARTNER_ORG_ID, APP_GID; vars ADMIN_API_VERSION, APP_HANDLE, HELP_URL.

import {
  MAX_BODY, PLANS, PLAN_QUERY, isShop, verifyWebhook, verifyQuery, verifyIdToken,
  planFromSubscriptions, setPlanBody, adminGraphql, exchangeToken, refreshToken, plansUrl,
} from './shopify.js'

const DAY = 86400 * 1000
/** Per-isolate throttle for /api/plan: a reload storm costs no Shopify calls and no KV. */
const THROTTLE_MS = 15000
/** Cron: at most this many shops per run (3 subrequests each; Free plan allows 50). */
export const MAX_CRON_SHOPS = 15
const recent = new Map()

const kvKey = (shop) => `shop:${shop}`
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } })
const text = (body, status) => new Response(body, { status, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } })

const cfg = (env) => ({
  apiKey: env.SHOPIFY_API_KEY,
  secret: env.SHOPIFY_API_SECRET,
  version: env.ADMIN_API_VERSION || '2026-10',
  appHandle: env.APP_HANDLE || 'ifc-viewer-online',
  helpUrl: env.HELP_URL || 'https://www.ifcvieweronline.eu/help/',
})

export async function readShop(env, shop) {
  const v = await env.SHOPS.get(kvKey(shop))
  return v ? JSON.parse(v) : null
}

/**
 * Reads the plan with `token` and writes ifcvo.plan only if it changed. `rec` is
 * the shop's KV record; returns { plan, rec, dirty } where dirty means rec must be saved.
 */
export async function syncPlan(env, shop, token, rec, { fetchImpl = fetch } = {}) {
  const { version } = cfg(env)
  const data = await adminGraphql(shop, token, { query: PLAN_QUERY }, { version, fetchImpl })
  const inst = data && data.currentAppInstallation
  if (!inst || !inst.id) throw new Error('no installation')
  const plan = planFromSubscriptions(inst.activeSubscriptions)
  const next = { ...(rec || {}) }
  let dirty = false
  if (next.plan !== plan || next.installationId !== inst.id) {
    const res = await adminGraphql(shop, token, setPlanBody(inst.id, plan), { version, fetchImpl })
    const errs = res && res.metafieldsSet && res.metafieldsSet.userErrors
    if (errs && errs.length) throw new Error('metafieldsSet: ' + errs.map((e) => e.message).join('; '))
    next.plan = plan
    next.installationId = inst.id
    dirty = true
  }
  return { plan, rec: next, dirty }
}

/** Background sync (webhook, cron): refresh the expiring offline token, rotate it in KV, sync. */
export async function backgroundSync(env, shop, { fetchImpl = fetch, now = Date.now() } = {}) {
  const rec = await readShop(env, shop)
  if (!rec || !rec.refresh || (rec.refreshExp && rec.refreshExp < now)) return { skipped: 'no-token' }
  const c = cfg(env)
  const t = await refreshToken(shop, rec.refresh, { apiKey: c.apiKey, secret: c.secret, fetchImpl })
  const base = { ...rec, refresh: t.refresh_token || rec.refresh, refreshExp: t.refresh_token_expires_in ? now + t.refresh_token_expires_in * 1000 : rec.refreshExp }
  const r = await syncPlan(env, shop, t.access_token, base, { fetchImpl })
  // The refresh token rotates, so this is one write even when the plan did not change.
  await env.SHOPS.put(kvKey(shop), JSON.stringify(r.rec))
  return { plan: r.plan }
}

/** POST /api/plan: the embedded page asks with its ID token. */
export async function apiPlan(request, env, { fetchImpl = fetch, now = Date.now() } = {}) {
  const c = cfg(env)
  const auth = request.headers.get('authorization') || ''
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const shop = await verifyIdToken(idToken, { apiKey: c.apiKey, secret: c.secret, now })
  if (!shop) return json({ error: 'unauthorized' }, 401)
  const hit = recent.get(shop)
  if (hit && now - hit.t < THROTTLE_MS) return json({ plan: hit.plan, plansUrl: plansUrl(shop, c.appHandle) })

  const rec = await readShop(env, shop)
  let token
  let base = rec || {}
  let dirty = false
  if (!rec || !rec.refresh || !rec.refreshExp || rec.refreshExp < now + 7 * DAY) {
    // First open (or refresh token about to lapse): one expiring offline token for background syncs.
    const t = await exchangeToken(shop, idToken, { apiKey: c.apiKey, secret: c.secret, fetchImpl })
    token = t.access_token
    base = { ...base, refresh: t.refresh_token, refreshExp: now + (t.refresh_token_expires_in || 0) * 1000 }
    dirty = true
  } else {
    // Online token: does not retire the stored offline token, so no KV write.
    token = (await exchangeToken(shop, idToken, { apiKey: c.apiKey, secret: c.secret, online: true, fetchImpl })).access_token
  }
  const r = await syncPlan(env, shop, token, base, { fetchImpl })
  if (dirty || r.dirty) await env.SHOPS.put(kvKey(shop), JSON.stringify(r.rec))
  recent.set(shop, { t: now, plan: r.plan })
  if (recent.size > 500) recent.clear()
  return json({ plan: r.plan, plansUrl: plansUrl(shop, c.appHandle) })
}

/** POST /webhooks: HMAC first, then the topic. Always 200 once verified (Shopify retries non-2xx). */
export async function webhook(request, env, ctx, { fetchImpl = fetch } = {}) {
  const sig = request.headers.get('x-shopify-hmac-sha256')
  const len = Number(request.headers.get('content-length') || 0)
  if (!sig || len > MAX_BODY) return text('unauthorized', 401)
  const raw = new Uint8Array(await request.arrayBuffer())
  if (raw.byteLength > MAX_BODY || !(await verifyWebhook(raw, sig, env.SHOPIFY_API_SECRET))) return text('unauthorized', 401)
  const topic = request.headers.get('x-shopify-topic') || ''
  const shop = request.headers.get('x-shopify-shop-domain') || ''
  if (!isShop(shop)) return text('ok', 200)
  switch (topic) {
    case 'app/uninstalled':
    case 'shop/redact': {
      // The only data kept per shop is its refresh token and plan: delete it (skip the write if absent).
      if (await env.SHOPS.get(kvKey(shop))) await env.SHOPS.delete(kvKey(shop))
      recent.delete(shop)
      return text('ok', 200)
    }
    case 'customers/data_request':
    case 'customers/redact':
      // No customer data is stored by this app.
      return text('ok', 200)
    case 'app_subscriptions/update': {
      const job = backgroundSync(env, shop, { fetchImpl }).catch((e) => console.log('sync failed', shop, String(e)))
      if (ctx && ctx.waitUntil) ctx.waitUntil(job)
      else await job
      return text('ok', 200)
    }
    default:
      return text('ok', 200)
  }
}

export const EVENTS_QUERY = `query IfcvoEvents($appId: ID!, $since: DateTime!) { events(filter: { subjectId: $appId, occurredAtMin: $since, eventTypes: [SUBSCRIPTION_CREATED, SUBSCRIPTION_UPDATED, SUBSCRIPTION_CANCELED, SUBSCRIPTION_FROZEN, SUBSCRIPTION_UNFROZEN] }, first: 50) { edges { node { shop { myshopifyDomain } } } } }`

/** Cron: shops with subscription events in the last 26 h (Partner API), resynced. Off without Partner secrets. */
export async function scheduled(env, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (!env.PARTNER_API_TOKEN || !env.PARTNER_ORG_ID || !env.APP_GID) return { skipped: 'no-partner-api' }
  const r = await fetchImpl(`https://partners.shopify.com/${env.PARTNER_ORG_ID}/api/${env.PARTNER_API_VERSION || '2026-10'}/graphql.json`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-shopify-access-token': env.PARTNER_API_TOKEN },
    body: JSON.stringify({ query: EVENTS_QUERY, variables: { appId: env.APP_GID, since: new Date(now - 26 * 3600 * 1000).toISOString() } }),
  })
  if (!r.ok) return { error: r.status }
  const j = await r.json()
  const edges = (j && j.data && j.data.events && j.data.events.edges) || []
  const shops = [...new Set(edges.map((e) => e && e.node && e.node.shop && e.node.shop.myshopifyDomain).filter(isShop))].slice(0, MAX_CRON_SHOPS)
  for (const shop of shops) await backgroundSync(env, shop, { fetchImpl, now }).catch((e) => console.log('cron sync failed', shop, String(e)))
  return { shops: shops.length }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** GET /app: the embedded admin page. Only served for a correctly signed admin launch. */
export async function adminPage(request, env) {
  const c = cfg(env)
  const url = new URL(request.url)
  const shop = url.searchParams.get('shop') || ''
  if (!isShop(shop) || !(await verifyQuery(url.searchParams, c.secret))) return text('Open IFC Viewer Online from your Shopify admin.', 401)
  const names = { free: 'Free', starter: 'Starter', business: 'Business' }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="shopify-api-key" content="${esc(c.apiKey)}">
<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
<title>IFC Viewer Online</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:24px;color:#303030;background:#f1f1f1}main{max-width:640px;background:#fff;border-radius:12px;padding:20px 24px}h1{font-size:18px;margin:0 0 12px}p{margin:8px 0}a.b,button{display:inline-block;margin:8px 8px 0 0;padding:6px 12px;border-radius:8px;border:1px solid #8a8a8a;background:#fff;color:#303030;text-decoration:none;cursor:pointer;font:inherit}button.p{background:#303030;color:#fff;border-color:#303030}</style>
</head><body><main>
<h1>IFC Viewer Online</h1>
<p>Current plan: <strong id="plan">checking…</strong></p>
<p>Features follow your plan automatically in the theme blocks. Free keeps the 3D viewer, IFC download, specs and rooms.</p>
<button class="p" id="change" type="button">Change plan</button>
<a class="b" href="${esc(c.helpUrl)}" target="_blank" rel="noopener">Setup guide</a>
</main><script>
const names=${JSON.stringify(names)};let plans=${JSON.stringify(plansUrl(shop, c.appHandle))};
document.getElementById('change').onclick=()=>open(plans,'_top');
(async()=>{try{const t=await shopify.idToken();const r=await fetch('/api/plan',{method:'POST',headers:{authorization:'Bearer '+t}});const j=await r.json();
if(!r.ok)throw 0;plans=j.plansUrl||plans;document.getElementById('plan').textContent=names[j.plan]||'Free'}catch(e){document.getElementById('plan').textContent='unavailable, reload the page'}})();
</script></body></html>`
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': `frame-ancestors https://${shop} https://admin.shopify.com;`,
    },
  })
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url)
    try {
      if (request.method === 'POST' && pathname === '/webhooks') return await webhook(request, env, ctx)
      if (request.method === 'POST' && pathname === '/api/plan') return await apiPlan(request, env)
      if (request.method === 'GET' && (pathname === '/' || pathname === '/app')) return await adminPage(request, env)
      return text('not found', 404)
    } catch (e) {
      console.log('error', pathname, String(e))
      return text('error', 500)
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(scheduled(env))
  },
}

export { PLANS }
