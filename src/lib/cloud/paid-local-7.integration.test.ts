// @vitest-environment node
// ─── Paid workspace against the LOCAL backend, part 7 ────────────────────────
// Row-level security on its own (no WHERE to help), damaged STEP files, the
// automatic verdict apart from a person's review, clear 429s on every kind of
// route, and the upload page jumping the validation queue.
// Skipped without PAID_LOCAL_API — see docs/PAID_LOCAL.md. The RLS checks run SQL as
// the ifc_api_local role through psql in the database container (PAID_LOCAL_DB_CONTAINER).

import { beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const API = process.env.PAID_LOCAL_API ?? ''
const DB = process.env.PAID_LOCAL_DB_CONTAINER ?? ''
const A = 'dev:user_localowner:org_localdemo'
const B = 'dev:user_rivalowner:org_localrival'
const run = Math.random().toString(36).slice(2, 8)
const SMALL = resolve('public/models/port-bcn/APBCN-URB-CER-Cerramiento_Horizontal_Tubular.ifc')

type Res = { status: number; body: any; headers: Headers }
async function call(session: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> {
  const h: Record<string, string> = { ...headers }
  if (session) h.Authorization = `Bearer ${session}`
  if (body !== undefined) h['Content-Type'] = 'application/json'
  const r = await fetch(`${API}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await r.text()
  let parsed: unknown = text
  try { parsed = JSON.parse(text) } catch { /* not json */ }
  return { status: r.status, body: parsed, headers: r.headers }
}
const ok = (r: Res, what: string) => { if (r.status >= 300) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.body)}`); return r.body }
function drain() {
  execFileSync(process.execPath, ['scripts/local-runner/dist/runner.mjs', '--drain'], { env: { ...process.env, IFC_API_URL: API }, stdio: 'pipe', timeout: 300_000 })
}
/** Full delivery from a supplier token: register, PUT to storage, confirm. */
async function deliver(token: string, slug: string, name: string, bytes: Buffer, source?: 'page' | 'folder'): Promise<string> {
  const sha = createHash('sha256').update(bytes).digest('hex')
  const reg = ok(await call(null, 'POST', '/reception/deliveries', { requirement_slug: slug, file_name: name, file_hash: sha, size_bytes: bytes.byteLength, ...(source ? { source } : {}) }, { 'X-Supplier-Token': token }), 'register')
  if (reg.upload) { const put = await fetch(reg.upload.url, { method: 'PUT', body: bytes }); if (!put.ok) throw new Error(`put ${put.status}`) }
  ok(await call(null, 'POST', `/reception/deliveries/${reg.delivery.id}/uploaded`, {}, { 'X-Supplier-Token': token }), 'uploaded')
  return reg.delivery.id as string
}

describe.skipIf(!API)('paid workspace on the local backend (part 7)', { timeout: 300_000 }, () => {
  let slug = ''
  let token = ''
  let setId = ''
  const real = readFileSync(SMALL)

  beforeAll(async () => {
    const set = ok(await call(A, 'POST', '/reception/requirements', { name: `Part 7 ${run}`, min_score: 50, content: JSON.stringify({ naming: false }) }), 'set').requirement_set
    slug = set.slug; setId = set.id
    token = ok(await call(A, 'POST', '/reception/suppliers', { name: `Part 7 ${run}` }), 'sup').token
  }, 120_000)

  it('a STEP file cut short is "damaged" with its reason — never a low score', async () => {
    const cut = real.subarray(0, Math.floor(real.byteLength * 0.6))
    const good = Buffer.concat([real, Buffer.from(`\n/* ${run} */\n`)])
    const dCut = await deliver(token, slug, `cut-${run}.ifc`, Buffer.from(cut))
    const dGood = await deliver(token, slug, `good-${run}.ifc`, good)
    drain()
    const list = ok(await call(A, 'GET', `/reception/deliveries?requirement_set=${setId}`), 'list').deliveries as any[]
    const c = list.find((d) => d.id === dCut)
    expect(c).toMatchObject({ file_status: 'damaged', score: null, verdict: 'rejected', auto: { verdict: 'rejected' }, review: null })
    expect(c.reason).toMatch(/^Damaged file: the file is cut short/)
    const g = list.find((d) => d.id === dGood)
    expect(g).toMatchObject({ file_status: 'ok', review: null })
    expect(g.score).toBeGreaterThan(0)
    expect(g.auto.verdict).toBe(g.verdict)
  })

  it('the automatic verdict and a person\'s review stay apart; old fields keep working', async () => {
    const id = await deliver(token, slug, `review-${run}.ifc`, Buffer.concat([real, Buffer.from(`\n/* review ${run} */\n`)]))
    drain()
    const before = ok(await call(A, 'GET', `/reception/deliveries?requirement_set=${setId}`), 'list').deliveries.find((d: any) => d.id === id)
    expect(before.auto.verdict).toBe('accepted')
    expect(before.review).toBeNull()
    // A person returns it anyway: the effective verdict follows the person, the automatic one stays.
    ok(await call(A, 'POST', `/reception/deliveries/${id}/decision`, { verdict: 'rejected', reason: 'Wrong level naming' }), 'decide')
    const after = ok(await call(A, 'GET', `/reception/deliveries?requirement_set=${setId}`), 'list').deliveries.find((d: any) => d.id === id)
    expect(after).toMatchObject({ verdict: 'rejected', reason: 'Wrong level naming', auto: { verdict: 'accepted' }, review: { verdict: 'rejected', reason: 'Wrong level naming', by: 'user_localowner' } })
    expect(after.sealed_at).toBeTruthy()
    expect(after.decided_by).toBe('user_localowner')
  })

  it('the upload page jumps the queue: a page delivery is validated before an older folder drop', async () => {
    const folder: string[] = []
    for (let i = 0; i < 4; i++) folder.push(await deliver(token, slug, `bulk-${i}-${run}.ifc`, Buffer.concat([real, Buffer.from(`\n/* bulk ${i} ${run} */\n`)]), 'folder'))
    const page = await deliver(token, slug, `page-${run}.ifc`, Buffer.concat([real, Buffer.from(`\n/* page ${run} */\n`)]), 'page')
    // One job only: the runner's single claim must pick the page delivery.
    execFileSync(process.execPath, ['scripts/local-runner/dist/runner.mjs', '--once'], { env: { ...process.env, IFC_API_URL: API }, stdio: 'pipe', timeout: 120_000 })
    const list = ok(await call(A, 'GET', `/reception/deliveries?requirement_set=${setId}`), 'list').deliveries as any[]
    expect(list.find((d) => d.id === page)?.file_status).toBe('ok')
    expect(folder.filter((id) => list.find((d) => d.id === id)?.file_status === 'ok')).toHaveLength(0)
    drain()
  })

  // Fixed one-minute windows (local simulator and Cloudflare): hammer up to two windows' worth.
  it('every kind of route answers a clear 429 with Retry-After when hammered', async () => {
    const ip = { 'CF-Connecting-IP': `203.0.113.${(run.charCodeAt(0) % 200) + 1}` }
    const hit = async (n: number, f: () => Promise<Res>) => { let last: Res | null = null; for (let i = 0; i < n; i++) { last = await f(); if (last.status === 429) return last } return last! }
    const pub = await hit(140, () => call(null, 'POST', `/l/lnk_${run}nope000000000000000000000000`, { password: 'x' }, ip))
    expect(pub.status).toBe(429)
    expect(pub.headers.get('retry-after')).toBe('60')
    expect(pub.body.error).toMatchObject({ code: 'rate_limited', retry_after: 60, limit_per_minute: 60 })
    const paid = await hit(1300, () => call(A, 'GET', '/team/me', undefined, { 'CF-Connecting-IP': `198.18.0.${(run.charCodeAt(1) % 200) + 1}` }))
    expect(paid.status).toBe(429)
    expect(paid.body.error).toMatchObject({ code: 'rate_limited', limit_per_minute: 600 })
    // Another caller from another address is not affected.
    expect((await call(B, 'GET', '/team/me', undefined, { 'CF-Connecting-IP': '192.0.2.77' })).status).toBe(200)
  })

  describe.skipIf(!DB)('row-level security on its own', () => {
    /** One transaction as ifc_api_local (no superuser, no BYPASSRLS), optionally bound to a company; always rolled back. */
    const sql = (ws: string | null, query: string): string => {
      const bind = ws ? `SELECT set_config('app.workspace_id', '${ws}', true);` : ''
      return execFileSync('docker', ['exec', DB, 'psql', 'postgresql://ifc_api_local:local@localhost:5432/ifc_real', '-v', 'ON_ERROR_STOP=1', '-tAq', '-c', `BEGIN; ${bind} ${query}; ROLLBACK;`], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim().split(/\r?\n/).filter((l) => l && l !== 'set_config' && !/^[0-9a-f-]{36}$/.test(l)).join('\n')
    }
    let wsA = '', wsB = ''
    beforeAll(() => {
      expect(sql(null, "SELECT rolsuper::text || ',' || rolbypassrls::text FROM pg_roles WHERE rolname = current_user")).toBe('false,false')
      const ids = execFileSync('docker', ['exec', DB, 'psql', '-U', 'ifc', '-d', 'ifc_real', '-tAc', "SELECT org_id || '=' || id FROM workspaces WHERE org_id IN ('org_localdemo', 'org_localrival') AND owner_user_id IS NULL"]).toString().trim().split(/\r?\n/)
      wsA = ids.find((l) => l.startsWith('org_localdemo='))!.split('=')[1]
      wsB = ids.find((l) => l.startsWith('org_localrival='))!.split('=')[1]
    })
    it('bound to company A, not one row of company B is visible in any tenant table — even when asked for B by id', () => {
      const tables = ['deliveries', 'suppliers', 'requirement_sets', 'issues', 'automations', 'mail_outbox', 'mail_contacts', 'client_links', 'webhook_endpoints', 'audit_log', 'saved_rulesets', 'clash_records']
      for (const t of tables) expect(sql(wsA, `SELECT count(*) FROM ${t} WHERE workspace_id = '${wsB}'`), t).toBe('0')
      expect(Number(sql(wsA, 'SELECT count(*) FROM deliveries'))).toBeGreaterThan(0)
      // The same query bound to B does see B's rows: the filter is the policy, not the data.
      expect(Number(sql(wsB, `SELECT count(*) FROM deliveries WHERE workspace_id = '${wsB}'`))).toBeGreaterThan(0)
    })
    it('unbound, nothing is visible; writing into another company is refused by the database', () => {
      expect(sql(null, 'SELECT count(*) FROM deliveries')).toBe('0')
      expect(() => sql(wsA, `INSERT INTO issues (id, workspace_id, number, title, updated_at) VALUES (gen_random_uuid(), '${wsB}', 999999, 'rls', now())`)).toThrow(/row-level security/)
      expect(sql(wsA, `WITH u AS (UPDATE suppliers SET name = 'hijack' WHERE workspace_id = '${wsB}' RETURNING 1) SELECT count(*) FROM u`)).toBe('0')
    })
  })
})
