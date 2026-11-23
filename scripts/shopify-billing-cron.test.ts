// @vitest-environment node
// Rotating billing cron without the Partner API (integrations/shopify/worker, D-327).
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .js Worker module without types
import { rotateSync, scheduled, saveShop, CRON_BATCH, SUBREQ_BUDGET, CURSOR_KEY } from '../integrations/shopify/worker/src/index.js'

const INST = 'gid://shopify/AppInstallation/1'
const DAY = 86400e3

type Rec = { refresh?: string; refreshExp?: number; plan?: string; installationId?: string }
/** In-memory KV with metadata, sorted list pages and a numeric cursor; counts every op. */
function kv() {
  const m = new Map<string, { v: string; meta?: unknown }>()
  const s = {
    m, writes: 0, gets: 0, lists: 0,
    get: async (k: string) => { s.gets++; return m.get(k)?.v ?? null },
    put: async (k: string, v: string, o?: { metadata?: unknown }) => { s.writes++; m.set(k, { v, meta: o?.metadata }) },
    delete: async (k: string) => { s.writes++; m.delete(k) },
    list: async ({ prefix, limit, cursor }: { prefix: string; limit: number; cursor?: string }) => {
      s.lists++
      const names = [...m.keys()].filter((k) => k.startsWith(prefix)).sort()
      const start = cursor ? Number(cursor) : 0
      const keys = names.slice(start, start + limit).map((name) => ({ name, metadata: m.get(name)!.meta }))
      const end = start + keys.length
      return end >= names.length ? { keys, list_complete: true } : { keys, list_complete: false, cursor: String(end) }
    },
    rec: (shop: string) => JSON.parse(m.get(`shop:${shop}`)!.v) as Rec,
  }
  return s
}
type Store = ReturnType<typeof kv>
const env = (store: Store, extra = {}) => ({ SHOPS: store, SHOPIFY_API_KEY: 'k', SHOPIFY_API_SECRET: 's', ADMIN_API_VERSION: '2026-10', ...extra })
const shopName = (i: number) => `s${String(i).padStart(3, '0')}.myshopify.com`
const paid = (plan = 'starter'): Rec => ({ refresh: 'r0', refreshExp: Date.now() + 60 * DAY, plan, installationId: INST })

/** Seeds shops; `legacy` stores them without metadata (records written before this change). */
async function seed(store: Store, recs: Rec[], { legacy = false } = {}) {
  for (let i = 0; i < recs.length; i++) {
    if (legacy) store.m.set(`shop:${shopName(i)}`, { v: JSON.stringify(recs[i]) })
    else await saveShop({ SHOPS: store }, shopName(i), recs[i])
  }
  store.writes = 0
  store.gets = 0
}

type Sub = { name: string; status: string }
/** Fake Shopify. `subs` per shop (default: still Starter); `refreshStatus` to fail the refresh. */
function shopify(subs: (shop: string) => Sub[] = () => [{ name: 'Starter', status: 'ACTIVE' }], refreshStatus = 200) {
  const calls: { shop: string; kind: string }[] = []
  const fetchImpl = async (url: string, init: { body: string }) => {
    const shop = new URL(url).hostname
    if (url.endsWith('/admin/oauth/access_token')) {
      calls.push({ shop, kind: 'refresh' })
      if (refreshStatus !== 200) return new Response('no', { status: refreshStatus })
      return Response.json({ access_token: 'a', refresh_token: 'r-new', expires_in: 3600, refresh_token_expires_in: 7776000 })
    }
    if (JSON.parse(init.body).query.includes('metafieldsSet')) {
      calls.push({ shop, kind: 'set' })
      return Response.json({ data: { metafieldsSet: { metafields: [{ id: 'm' }], userErrors: [] } } })
    }
    calls.push({ shop, kind: 'query' })
    return Response.json({ data: { currentAppInstallation: { id: INST, activeSubscriptions: subs(shop) } } })
  }
  return { calls, fetchImpl }
}
const ops = (store: Store, sh: { calls: unknown[] }) => store.gets + store.lists + store.writes + sh.calls.length
const business = () => [{ name: 'Business', status: 'ACTIVE' }]

describe('rotating cron without the Partner API', () => {
  it('runs by default when no Partner secrets are set', async () => {
    expect(await scheduled(env(kv()), { fetchImpl: shopify().fetchImpl })).toMatchObject({ listed: 0, complete: true, writes: 0 })
  })

  it('plan unchanged: refresh + query only; the single write is the rotated refresh token', async () => {
    const store = kv()
    await seed(store, [paid('starter')])
    const sh = shopify()
    const r = await rotateSync(env(store), { fetchImpl: sh.fetchImpl })
    expect(sh.calls.map((c) => c.kind)).toEqual(['refresh', 'query'])
    expect(r).toMatchObject({ checked: 1, changed: 0, writes: 1 })
    expect(store.writes).toBe(1)
    expect(store.rec(shopName(0))).toMatchObject({ plan: 'starter', refresh: 'r-new' })
  })

  it('plan changed: metafieldsSet + one write (plan and rotated token together)', async () => {
    const store = kv()
    await seed(store, [paid('starter')])
    const sh = shopify(business)
    const r = await rotateSync(env(store), { fetchImpl: sh.fetchImpl })
    expect(sh.calls.map((c) => c.kind)).toEqual(['refresh', 'query', 'set'])
    expect(r).toMatchObject({ changed: 1, writes: 1 })
    expect(store.writes).toBe(1)
    expect(store.rec(shopName(0)).plan).toBe('business')
  })

  it.each<[string, Sub[]]>([
    ['cancelled (no active subscription)', []],
    ['frozen', [{ name: 'Starter', status: 'FROZEN' }]],
    ['cancelled status', [{ name: 'Business', status: 'CANCELLED' }]],
  ])('%s subscription becomes free', async (_l, subs) => {
    const store = kv()
    await seed(store, [paid('business')])
    const sh = shopify(() => subs)
    await rotateSync(env(store), { fetchImpl: sh.fetchImpl })
    expect(store.rec(shopName(0)).plan).toBe('free')
    expect(sh.calls.at(-1)!.kind).toBe('set')
  })

  it('free shops cost no call and no write; expired or missing refresh tokens are skipped', async () => {
    const store = kv()
    await seed(store, [paid('free'), { ...paid('starter'), refreshExp: Date.now() - DAY }, { refresh: 'x' }])
    const sh = shopify()
    const r = await rotateSync(env(store), { fetchImpl: sh.fetchImpl })
    expect(sh.calls).toHaveLength(0)
    expect(store.writes).toBe(0)
    expect(r).toMatchObject({ skipped: 3, complete: true })
  })

  it('refresh rejected (uninstall webhook missed): record removed, one write', async () => {
    const store = kv()
    await seed(store, [paid()])
    const r = await rotateSync(env(store), { fetchImpl: shopify(undefined, 401).fetchImpl })
    expect(r).toMatchObject({ removed: 1, writes: 1 })
    expect(store.m.has(`shop:${shopName(0)}`)).toBe(false)
  })

  it('a transient Shopify error keeps the record and counts as failed', async () => {
    const store = kv()
    await seed(store, [paid()])
    const r = await rotateSync(env(store), { fetchImpl: shopify(undefined, 503).fetchImpl })
    expect(r).toMatchObject({ failed: 1, writes: 0 })
    expect(store.rec(shopName(0)).refresh).toBe('r0')
  })

  it('batches with a KV cursor, covers every shop, then starts again', async () => {
    const n = CRON_BATCH * 2 + 3
    const store = kv()
    await seed(store, Array.from({ length: n }, () => paid()))
    const seen = new Set<string>()
    const runs = []
    for (let run = 0; run < 3; run++) {
      const sh = shopify()
      runs.push(await rotateSync(env(store), { fetchImpl: sh.fetchImpl }))
      sh.calls.filter((c) => c.kind === 'query').forEach((c) => seen.add(c.shop))
    }
    expect(runs.map((r) => r.checked)).toEqual([CRON_BATCH, CRON_BATCH, 3])
    expect(seen.size).toBe(n)
    expect(runs[2].complete).toBe(true)
    expect(store.m.has(CURSOR_KEY)).toBe(false) // wrapped around
    const sh = shopify()
    await rotateSync(env(store), { fetchImpl: sh.fetchImpl })
    expect(sh.calls.find((c) => c.kind === 'query')!.shop).toBe(shopName(0))
  })

  it('one page holding every shop writes no cursor', async () => {
    const store = kv()
    await seed(store, [paid(), paid()])
    const r = await rotateSync(env(store), { fetchImpl: shopify().fetchImpl })
    expect(r.writes).toBe(2) // two rotated refresh tokens, no cursor
    expect(store.m.has(CURSOR_KEY)).toBe(false)
  })

  it('worst case (every shop paid and changing) stays within the subrequest and write budget', async () => {
    const store = kv()
    await seed(store, Array.from({ length: CRON_BATCH * 3 }, () => paid('starter')))
    const sh = shopify(business)
    const r = await rotateSync(env(store), { fetchImpl: sh.fetchImpl })
    expect(SUBREQ_BUDGET).toBeLessThanOrEqual(45)
    expect(ops(store, sh)).toBeLessThanOrEqual(SUBREQ_BUDGET)
    expect(r.subrequests).toBe(ops(store, sh))
    expect(r.checked).toBe(CRON_BATCH)
    // Writes per run ≤ batch + cursor, so 24 hourly runs ≤ 264 writes/day.
    expect(store.writes).toBeLessThanOrEqual(CRON_BATCH + 1)
    expect(24 * (CRON_BATCH + 1)).toBeLessThanOrEqual(300)
  })

  it('legacy records (no metadata) need a get each; the budget stops the run and keeps the cursor', async () => {
    const store = kv()
    await seed(store, Array.from({ length: CRON_BATCH * 2 }, () => paid('starter')), { legacy: true })
    const sh = shopify(business)
    const r = await rotateSync(env(store), { fetchImpl: sh.fetchImpl })
    expect(ops(store, sh)).toBeLessThanOrEqual(SUBREQ_BUDGET)
    expect(r.checked).toBeLessThan(CRON_BATCH)
    expect(store.m.has(CURSOR_KEY)).toBe(false) // page not finished: cursor not advanced
    // Next run: the shops already done now carry metadata (one call fewer each), so the page finishes.
    store.writes = 0; store.gets = 0; store.lists = 0
    const sh2 = shopify(business)
    const r2 = await rotateSync(env(store), { fetchImpl: sh2.fetchImpl })
    expect(ops(store, sh2)).toBeLessThanOrEqual(SUBREQ_BUDGET)
    expect(r2.checked).toBe(CRON_BATCH)
    expect(store.m.get(CURSOR_KEY)?.v).toBe(String(CRON_BATCH))
  })

  it('a tighter budget is honoured exactly', async () => {
    const store = kv()
    await seed(store, Array.from({ length: CRON_BATCH }, () => paid()))
    const sh = shopify()
    const r = await rotateSync(env(store), { fetchImpl: sh.fetchImpl, budget: 12 })
    expect(ops(store, sh)).toBeLessThanOrEqual(12)
    expect(r.checked).toBe(2) // 2 fixed + 2 × 4 + 1 cursor reserve = 11
  })
})
