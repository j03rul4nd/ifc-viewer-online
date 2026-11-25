// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .js Worker module without types
import * as S from '../integrations/shopify/worker/src/shopify.js'
// @ts-expect-error plain .js Worker module without types
import worker, { apiPlan, webhook, backgroundSync, scheduled, adminPage, MAX_CRON_SHOPS } from '../integrations/shopify/worker/src/index.js'

const SECRET = 'shpss_test_secret'
const API_KEY = 'test-api-key'
const SHOP = 'demo-store.myshopify.com'
const INST = 'gid://shopify/AppInstallation/1'

type Call = { url: string; body: string }
function kv(initial: Record<string, unknown> = {}) {
  const m = new Map<string, string>(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]))
  const s = { writes: 0, deletes: 0, m,
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => { s.writes++; m.set(k, v) },
    delete: async (k: string) => { s.deletes++; m.delete(k) } }
  return s
}
const env = (store = kv(), extra = {}) => ({ SHOPS: store, SHOPIFY_API_KEY: API_KEY, SHOPIFY_API_SECRET: SECRET, ADMIN_API_VERSION: '2026-10', ...extra })

/** Fake Shopify: token endpoint + Admin GraphQL with the given subscriptions. */
function shopify(subs: { name: string; status: string }[]) {
  const calls: Call[] = []
  const fetchImpl = async (url: string, init: { body: string }) => {
    calls.push({ url, body: init.body })
    if (url.endsWith('/admin/oauth/access_token')) {
      const f = new URLSearchParams(init.body)
      const online = f.get('requested_token_type')?.includes('online')
      return Response.json(online ? { access_token: 'online' } : { access_token: 'offline', refresh_token: 'r-' + calls.length, expires_in: 3600, refresh_token_expires_in: 7776000 })
    }
    const b = JSON.parse(init.body)
    if (b.query.includes('metafieldsSet')) return Response.json({ data: { metafieldsSet: { metafields: [{ id: 'm' }], userErrors: [] } } })
    return Response.json({ data: { currentAppInstallation: { id: INST, activeSubscriptions: subs } } })
  }
  return { calls, fetchImpl }
}

const idToken = (over: Record<string, unknown> = {}) => {
  const t = Math.floor(Date.now() / 1000)
  return S.signIdToken({ iss: `https://${SHOP}/admin`, dest: `https://${SHOP}`, aud: API_KEY, sub: '1', exp: t + 60, nbf: t - 1, iat: t, jti: 'j', sid: 's', ...over }, SECRET)
}
const planReq = async (tok?: string) => new Request('https://w.example/api/plan', { method: 'POST', headers: { authorization: 'Bearer ' + (tok ?? await idToken()) } })
const hook = async (topic: string, body: object, { shop = SHOP, sig }: { shop?: string; sig?: string } = {}) => {
  const raw = JSON.stringify(body)
  return new Request('https://w.example/webhooks', { method: 'POST', body: raw, headers: {
    'x-shopify-topic': topic, 'x-shopify-shop-domain': shop, 'x-shopify-hmac-sha256': sig ?? await S.signWebhook(new TextEncoder().encode(raw), SECRET) } })
}

describe('HMAC and ID token checks', () => {
  it('webhook HMAC accepts the right signature and rejects tampering or another secret', async () => {
    const body = new TextEncoder().encode('{"a":1}')
    const sig = await S.signWebhook(body, SECRET)
    expect(await S.verifyWebhook(body, sig, SECRET)).toBe(true)
    expect(await S.verifyWebhook(new TextEncoder().encode('{"a":2}'), sig, SECRET)).toBe(false)
    expect(await S.verifyWebhook(body, sig, 'other')).toBe(false)
    expect(await S.verifyWebhook(body, '', SECRET)).toBe(false)
  })
  it('admin launch query HMAC is checked over the sorted params', async () => {
    const p = { shop: SHOP, host: 'abc', timestamp: '1700000000', embedded: '1' }
    const q = new URLSearchParams({ ...p, hmac: await S.signQuery(p, SECRET) })
    expect(await S.verifyQuery(q, SECRET)).toBe(true)
    q.set('shop', 'evil.myshopify.com')
    expect(await S.verifyQuery(q, SECRET)).toBe(false)
  })
  it('ID token: valid → shop; wrong aud, expired, bad signature or mismatched iss → null', async () => {
    const o = { apiKey: API_KEY, secret: SECRET }
    expect(await S.verifyIdToken(await idToken(), o)).toBe(SHOP)
    expect(await S.verifyIdToken(await idToken({ aud: 'x' }), o)).toBeNull()
    expect(await S.verifyIdToken(await idToken({ exp: 1 }), o)).toBeNull()
    expect(await S.verifyIdToken(await idToken({ iss: 'https://other.myshopify.com/admin' }), o)).toBeNull()
    expect(await S.verifyIdToken((await idToken()).slice(0, -2) + 'xx', o)).toBeNull()
    expect(await S.verifyIdToken('garbage', o)).toBeNull()
  })
})

describe('plan mapping and metafield mutation', () => {
  it('maps active subscriptions to free | starter | business', () => {
    expect(S.planFromSubscriptions([])).toBe('free')
    expect(S.planFromSubscriptions(null)).toBe('free')
    expect(S.planFromSubscriptions([{ name: 'Starter', status: 'ACTIVE' }])).toBe('starter')
    expect(S.planFromSubscriptions([{ name: 'Business', status: 'ACTIVE' }, { name: 'Starter', status: 'ACTIVE' }])).toBe('business')
    expect(S.planFromSubscriptions([{ name: 'Business', status: 'FROZEN' }])).toBe('free')
    expect(S.planFromSubscriptions([{ name: 'Business', status: 'CANCELLED' }])).toBe('free')
    expect(S.planFromSubscriptions([{ name: 'Free', status: 'ACTIVE' }])).toBe('free')
    expect(S.planFromHandle('business-monthly')).toBe('business')
  })
  it('metafieldsSet targets the app installation, namespace ifcvo, key plan', () => {
    const b = S.setPlanBody(INST, 'starter')
    expect(b.query).toContain('metafieldsSet')
    expect(b.variables.metafields).toEqual([{ ownerId: INST, namespace: 'ifcvo', key: 'plan', type: 'single_line_text_field', value: 'starter' }])
    expect(() => S.setPlanBody(INST, 'enterprise')).toThrow()
  })
  it('plan page URL is the Shopify-hosted App Pricing page', () => {
    expect(S.plansUrl(SHOP, 'ifc-viewer-online')).toBe('https://admin.shopify.com/store/demo-store/charges/ifc-viewer-online/pricing_plans')
  })
})

describe('/api/plan (embedded page)', () => {
  it('first open: expiring offline token, metafield written, one KV write', async () => {
    const store = kv()
    const sh = shopify([{ name: 'Starter', status: 'ACTIVE' }])
    const r = await apiPlan(await planReq(), env(store), { fetchImpl: sh.fetchImpl, now: Date.now() + 1 })
    expect(await r.json()).toMatchObject({ plan: 'starter', plansUrl: expect.stringContaining('/pricing_plans') })
    const ex = new URLSearchParams(sh.calls[0].body)
    expect(ex.get('expiring')).toBe('1')
    expect(ex.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:token-exchange')
    expect(sh.calls.some((c) => c.body.includes('metafieldsSet'))).toBe(true)
    expect(store.writes).toBe(1)
    expect(JSON.parse(store.m.get(`shop:${SHOP}`)!)).toMatchObject({ plan: 'starter', installationId: INST })
  })
  it('later opens with an unchanged plan: online token, no metafield call, no KV write', async () => {
    const store = kv({ [`shop:${SHOP}`]: { refresh: 'r', refreshExp: Date.now() + 80 * 86400e3, plan: 'business', installationId: INST } })
    const sh = shopify([{ name: 'Business', status: 'ACTIVE' }])
    const r = await apiPlan(await planReq(await idToken({ exp: Math.floor(Date.now() / 1000) + 600 })), env(store), { fetchImpl: sh.fetchImpl, now: Date.now() + 100000 })
    expect((await r.json()).plan).toBe('business')
    expect(new URLSearchParams(sh.calls[0].body).get('requested_token_type')).toContain('online')
    expect(sh.calls.some((c) => c.body.includes('metafieldsSet'))).toBe(false)
    expect(store.writes).toBe(0)
  })
  it('rejects a missing or forged ID token without any Shopify call', async () => {
    const sh = shopify([])
    expect((await apiPlan(await planReq('nope'), env(), { fetchImpl: sh.fetchImpl })).status).toBe(401)
    expect(sh.calls).toHaveLength(0)
  })
})

describe('webhooks', () => {
  it('unsigned or badly signed requests get 401 before anything else', async () => {
    const store = kv({ [`shop:${SHOP}`]: { plan: 'starter' } })
    expect((await webhook(await hook('app/uninstalled', {}, { sig: 'bad' }), env(store), null)).status).toBe(401)
    const noSig = new Request('https://w.example/webhooks', { method: 'POST', body: '{}', headers: { 'x-shopify-topic': 'app/uninstalled' } })
    expect((await webhook(noSig, env(store), null)).status).toBe(401)
    expect(store.deletes).toBe(0)
  })
  it('GDPR topics return 200; shop/redact and app/uninstalled delete the shop record once', async () => {
    const store = kv({ [`shop:${SHOP}`]: { plan: 'starter', refresh: 'r' } })
    for (const t of ['customers/data_request', 'customers/redact']) expect((await webhook(await hook(t, { shop_domain: SHOP }), env(store), null)).status).toBe(200)
    expect(store.deletes).toBe(0)
    expect((await webhook(await hook('shop/redact', { shop_domain: SHOP }), env(store), null)).status).toBe(200)
    expect(store.m.size).toBe(0)
    expect((await webhook(await hook('app/uninstalled', {}), env(store), null)).status).toBe(200)
    expect(store.deletes).toBe(1) // nothing left: no second delete
  })
  it('app_subscriptions/update is not subscribed (App Pricing stopped it) and is a no-op', async () => {
    const store = kv({ [`shop:${SHOP}`]: { refresh: 'r0', refreshExp: Date.now() + 80 * 86400e3, plan: 'starter', installationId: INST } })
    const res = await worker.fetch(await hook('app_subscriptions/update', {}), env(store), { waitUntil: () => {} })
    expect(res.status).toBe(200)
    expect(store.writes).toBe(0)
  })
  it('background resync refreshes the token, writes the new plan and rotates the refresh token', async () => {
    const store = kv({ [`shop:${SHOP}`]: { refresh: 'r0', refreshExp: Date.now() + 80 * 86400e3, plan: 'starter', installationId: INST } })
    const sh = shopify([{ name: 'Business', status: 'ACTIVE' }])
    expect(await backgroundSync(env(store), SHOP, { fetchImpl: sh.fetchImpl })).toEqual({ plan: 'business', changed: true })
    expect(new URLSearchParams(sh.calls[0].body).get('grant_type')).toBe('refresh_token')
    expect(JSON.parse(store.m.get(`shop:${SHOP}`)!)).toMatchObject({ plan: 'business', refresh: 'r-1' })
    expect(store.writes).toBe(2) // rotated token saved first, then the new plan
  })
  it('a shop that never opened the app is skipped (no token, no writes)', async () => {
    const store = kv()
    expect(await backgroundSync(env(store), SHOP, { fetchImpl: shopify([]).fetchImpl })).toEqual({ skipped: 'no-token' })
    expect(store.writes).toBe(0)
  })
})

describe('cron and admin page', () => {
  it('Partner API cron (optional) caps the shops per run', async () => {
    const edges = Array.from({ length: 40 }, (_, i) => ({ node: { shop: { myshopifyDomain: `s${i}.myshopify.com` } } }))
    const calls: string[] = []
    const fetchImpl = async (url: string) => { calls.push(url); return Response.json({ data: { events: { edges } } }) }
    const r = await scheduled(env(kv(), { PARTNER_API_TOKEN: 't', PARTNER_ORG_ID: '1', APP_GID: 'gid://shopify/App/1' }), { fetchImpl })
    expect(r).toEqual({ shops: MAX_CRON_SHOPS })
    expect(calls).toHaveLength(1) // no KV records → no Shopify calls per shop
  })
  it('admin page needs a signed launch and allows framing only by the shop admin', async () => {
    expect((await adminPage(new Request(`https://w.example/app?shop=${SHOP}`), env())).status).toBe(401)
    const p = { shop: SHOP, host: 'h', timestamp: '1', embedded: '1' }
    const q = new URLSearchParams({ ...p, hmac: await S.signQuery(p, SECRET) })
    const r = await adminPage(new Request(`https://w.example/app?${q}`), env())
    expect(r.status).toBe(200)
    expect(r.headers.get('content-security-policy')).toBe(`frame-ancestors https://${SHOP} https://admin.shopify.com;`)
    const html = await r.text()
    expect(html).toContain(`<meta name="shopify-api-key" content="${API_KEY}">`)
    expect(html).toContain('https://cdn.shopify.com/shopifycloud/app-bridge.js')
    expect(html).toContain('/charges/ifc-viewer-online/pricing_plans')
  })
})

describe('Free-plan only configuration', () => {
  const root = path.resolve(__dirname, '../integrations/shopify')
  it('wrangler config has no paid products (no routes, R2, D1, Durable Objects, queues)', () => {
    const w = fs.readFileSync(path.join(root, 'worker/wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, '')
    expect(w).toContain('"workers_dev": true')
    for (const k of ['routes', 'route', 'r2_buckets', 'd1_databases', 'durable_objects', 'queues', 'usage_model', 'limits', 'analytics_engine_datasets', 'ai', 'browser']) expect(w).not.toMatch(new RegExp(`"${k}"\\s*:`))
  })
  it('app config points at the Worker, embedded, with billing and GDPR webhooks and no new scopes', () => {
    const t = fs.readFileSync(path.join(root, 'app/shopify.app.toml'), 'utf8')
    expect(t).toMatch(/embedded = true/)
    expect(t).toMatch(/application_url = "https:\/\/ifcvo-billing\.[a-z0-9-]+\.workers\.dev\/app"/)
    // App Store requirement: no app URL host may contain "shopify" or "example".
    for (const m of t.matchAll(/https?:\/\/([^/"\s]+)/g)) {
      if (m[1].endsWith('shopify.dev')) continue // doc links in comments
      expect(m[1]).not.toMatch(/shopify|example/i)
    }
    expect(t).not.toMatch(/topics = \[[^\]]*app_subscriptions\/update/)
    expect(t).toContain('app/uninstalled')
    expect(t).toMatch(/compliance_topics = \[\s*"customers\/data_request",\s*"customers\/redact",\s*"shop\/redact"\s*\]/)
    expect(t).toContain('scopes = "customer_read_orders,unauthenticated_read_product_listings"')
  })
})
