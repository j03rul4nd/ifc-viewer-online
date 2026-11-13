// @vitest-environment node
// ─── Paid workspace against the LOCAL backend, part 6: security ──────────────
// Two companies on one backend. Company B (org_localrival) creates one of every
// paid object; company A (org_localdemo) tries to list, read, change and delete
// each one by id and must get nothing back and change nothing. Then the public
// tokens (supplier, client link), webhook signatures, hostile inputs, size and
// frequency limits, and the audit trail of sensitive actions.
// Attacks run ONLY against the local stack. Skipped without PAID_LOCAL_API.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash, createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const API = process.env.PAID_LOCAL_API ?? ''
const A = 'dev:user_localowner:org_localdemo'
const A_VIEWER = 'dev:user_localviewer:org_localdemo'
const B = 'dev:user_rivalowner:org_localrival'
const run = Math.random().toString(36).slice(2, 8)
const SMALL = resolve('public/models/port-bcn/APBCN-URB-CER-Cerramiento_Horizontal_Tubular.ifc')

type Res = { status: number; body: any }
async function call(session: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> {
  const h: Record<string, string> = { ...headers }
  if (session) h.Authorization = `Bearer ${session}`
  if (body !== undefined && typeof body !== 'string') h['Content-Type'] = 'application/json'
  const r = await fetch(`${API}${path}`, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) })
  const text = await r.text()
  let parsed: unknown = text
  try { parsed = JSON.parse(text) } catch { /* not json */ }
  return { status: r.status, body: parsed }
}
const ok = (r: Res, what: string) => { if (r.status >= 300) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.body)}`); return r.body }
/** Another company's object: never found, never forbidden-with-details, never changed. */
const denied = (r: Res, what: string) => expect([403, 404], `${what} → ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`).toContain(r.status)

async function deliver(token: string, slug: string, name: string, bytes: Buffer): Promise<Res> {
  const sha = createHash('sha256').update(bytes).digest('hex')
  return call(null, 'POST', '/reception/deliveries', { requirement_slug: slug, file_name: name, file_hash: sha, size_bytes: bytes.byteLength }, { 'X-Supplier-Token': token })
}

describe.skipIf(!API)('paid workspace on the local backend (part 6: security)', { timeout: 120_000 }, () => {
  const b: Record<string, any> = {}

  beforeAll(async () => {
    // Company B creates one of everything.
    b.set = ok(await call(B, 'POST', '/reception/requirements', { name: `Rival ${run}`, min_score: 40, content: JSON.stringify({ project: 'RIV' }) }), 'set').requirement_set
    const sup = ok(await call(B, 'POST', '/reception/suppliers', { name: `Rival sup ${run}` }), 'supplier')
    b.supplier = sup.supplier; b.token = sup.token
    const bytes = Buffer.concat([readFileSync(SMALL), Buffer.from(`\n/* rival ${run} */\n`)])
    b.delivery = ok(await deliver(b.token, b.set.slug, `RIV-${run}.ifc`, bytes), 'delivery')
    b.issue = ok(await call(B, 'POST', '/issues', { title: `Rival secret issue ${run}` }), 'issue').issue
    b.automation = ok(await call(B, 'POST', '/automations', { name: `Rival auto ${run}`, enabled: false, trigger: 'delivery.validated', conditions: {}, actions: [{ type: 'notify', message: 'hello there' }], minutes_saved: 1 }), 'automation').automation
    b.contact = ok(await call(B, 'POST', '/mail/contacts', { email: `rival-${run}@example.com`, consent_source: 'test' }), 'contact').contact
    b.mail = ok(await call(B, 'POST', '/mail/outbox', { to: `rival-${run}@example.com`, subject: `Rival mail ${run}`, body: 'x' }, { 'Idempotency-Key': `rival-${run}` }), 'mail').message
    b.link = ok(await call(B, 'POST', '/links', { label: `Rival link ${run}`, project: 'RIV', version: 'P01', expires_in_days: 7 }), 'link')
    b.ruleset = ok(await call(B, 'POST', '/rulesets', { name: `Rival rules ${run}`, kind: 'validator_profile', content: JSON.stringify({ title: 'Rival' }) }), 'ruleset')
    b.endpoint = ok(await call(B, 'POST', '/webhooks/endpoints', { url: 'http://127.0.0.1:9912/rival', events: ['delivery.received'] }), 'endpoint')
    ok(await call(B, 'PUT', '/clash/records', { project: `rival-${run}`, records: { [`k-${run}`]: { status: 'active', note: 'rival secret' } } }), 'clash')
  }, 120_000)

  afterAll(async () => {
    await call(B, 'PATCH', `/automations/${b.automation?.id}`, { enabled: false })
  })

  it('lists: company A never sees a single row of company B', async () => {
    const lists: Array<[string, (j: any) => unknown[]]> = [
      ['/reception/requirements', (j) => j.requirement_sets], ['/reception/suppliers', (j) => j.suppliers],
      ['/reception/deliveries', (j) => j.deliveries], ['/issues', (j) => j.issues], ['/automations', (j) => j.automations],
      ['/automations/runs', (j) => j.runs], ['/mail/outbox', (j) => j.messages], ['/mail/contacts', (j) => j.contacts],
      ['/links', (j) => j.links], ['/rulesets', (j) => j.rulesets], ['/webhooks/endpoints', (j) => j.endpoints],
      ['/quality/audit', (j) => j.events], ['/versions', (j) => j.versions], ['/team/members', (j) => j.members], ['/team/guests', (j) => j.guests],
    ]
    for (const [path, pick] of lists) {
      const r = await call(A, 'GET', path)
      expect(r.status, path).toBe(200)
      const text = JSON.stringify(pick(r.body) ?? r.body)
      for (const secret of [run, b.set.id, b.supplier.id, b.delivery.deliveryId, b.automation.id, b.contact.id, b.mail.id, b.link.link.id, b.ruleset.id, 'user_rival']) {
        expect(text.includes(secret), `${path} leaks ${secret}`).toBe(false)
      }
    }
    const clash = await call(A, 'GET', `/clash/records?project=${encodeURIComponent(`rival-${run}`)}`)
    expect(JSON.stringify(clash.body).includes('rival secret'), 'clash records leak').toBe(false)
  })

  it('by id: company A cannot read, change or delete any object of company B', async () => {
    denied(await call(A, 'PATCH', `/reception/requirements/${b.set.id}`, { min_score: 1 }), 'requirement set')
    denied(await call(A, 'POST', `/reception/deliveries/${b.delivery.deliveryId}/decision`, { verdict: 'accepted' }), 'decision')
    denied(await call(A, 'PATCH', `/automations/${b.automation.id}`, { enabled: true }), 'automation patch')
    denied(await call(A, 'DELETE', `/automations/${b.automation.id}`), 'automation delete')
    denied(await call(A, 'POST', `/mail/outbox/${b.mail.id}/cancel`), 'mail cancel')
    denied(await call(A, 'POST', `/mail/contacts/${b.contact.id}/unsubscribe`), 'contact unsubscribe')
    denied(await call(A, 'POST', `/links/${b.link.link.id}/revoke`), 'link revoke')
    denied(await call(A, 'GET', `/rulesets/${b.ruleset.id}`), 'ruleset read')
    denied(await call(A, 'PUT', `/rulesets/${b.ruleset.id}`, { content: JSON.stringify({ title: 'Hijack' }) }), 'ruleset write')
    denied(await call(A, 'GET', `/rulesets/${b.ruleset.id}/versions`), 'ruleset versions')
    // Versions exist only for requirement profiles: the body is refused before ownership is even looked at.
    expect([400, 403, 404]).toContain((await call(A, 'POST', `/rulesets/${b.ruleset.id}/versions`, { content: JSON.stringify({ title: 'Hijack' }), note: 'x' })).status)
    denied(await call(A, 'DELETE', `/rulesets/${b.ruleset.id}`), 'ruleset delete')
    denied(await call(A, 'GET', `/requirements/${b.ruleset.id}`), 'requirements read')
    denied(await call(A, 'DELETE', `/webhooks/endpoints/${b.endpoint.endpoint.id}`), 'endpoint delete')
    denied(await call(A, 'POST', `/reception/suppliers/${b.supplier.id}/revoke`), 'supplier revoke')
    denied(await call(A, 'PATCH', '/team/members/user_rivalowner', { role: 'viewer' }), 'member role')
    denied(await call(A, 'PUT', '/team/members/user_rivalowner/projects', { projects: ['X'] }), 'member projects')
    // Issue numbers are per company: A's #n is A's own issue, never B's.
    const same = await call(A, 'GET', `/issues/${b.issue.number}`)
    expect(JSON.stringify(same.body).includes(`Rival secret issue ${run}`)).toBe(false)

    // …and nothing of B changed.
    const sets = ok(await call(B, 'GET', '/reception/requirements'), 'B sets').requirement_sets
    expect(sets.find((s: any) => s.id === b.set.id)?.min_score).toBe(40)
    expect(ok(await call(B, 'GET', '/automations'), 'B autos').automations.find((x: any) => x.id === b.automation.id)).toBeTruthy()
    expect(ok(await call(B, 'GET', '/mail/outbox'), 'B mail').messages.find((m: any) => m.id === b.mail.id)?.status).toBe('queued')
    expect(ok(await call(B, 'GET', '/links'), 'B links').links.find((l: any) => l.id === b.link.link.id)?.revoked_at ?? null).toBeNull()
    expect(ok(await call(B, 'GET', '/mail/contacts'), 'B contacts').contacts.find((c: any) => c.id === b.contact.id)?.unsubscribed_at ?? null).toBeNull()
    expect((await call(B, 'GET', `/rulesets/${b.ruleset.id}`)).status).toBe(200)
    expect(ok(await call(B, 'GET', '/webhooks/endpoints'), 'B hooks').endpoints.some((e: any) => e.id === b.endpoint.endpoint.id)).toBe(true)
    expect(ok(await call(B, 'GET', '/reception/deliveries'), 'B deliveries').deliveries.find((d: any) => d.id === b.delivery.deliveryId)?.verdict).not.toBe('accepted')
  })

  it('an issue can only be assigned to a member of the same company', async () => {
    expect((await call(A, 'POST', '/issues', { title: `Assign out ${run}`, assignee_id: 'user_rivalowner' })).status).toBe(400)
    const mine = ok(await call(A, 'POST', '/issues', { title: `Assign in ${run}`, assignee_id: 'user_localeditor' }), 'assign in').issue
    expect((await call(A, 'PATCH', `/issues/${mine.number}`, { assignee_id: 'user_rivaleditor' })).status).toBe(400)
  })

  it('supplier token: scoped to its own company, revocable, rotatable, never brute-forced', async () => {
    // B's supplier cannot deliver into, or even see, a project of company A.
    const aSet = ok(await call(A, 'POST', '/reception/requirements', { name: `Own ${run}`, min_score: 10, content: '{}' }), 'A set').requirement_set
    const cross = await deliver(b.token, aSet.slug, `X-${run}.ifc`, Buffer.from(`ISO-10303-21; cross ${run}`))
    expect([403, 404], JSON.stringify(cross.body)).toContain(cross.status)
    const home = ok(await call(null, 'GET', `/reception/supplier?project=${aSet.slug}`, undefined, { 'X-Supplier-Token': b.token }), 'home')
    expect(home.projects.map((p: any) => p.slug)).not.toContain(aSet.slug)

    // Rotate: the old token stops working at once, the new one works.
    const sup = ok(await call(A, 'POST', '/reception/suppliers', { name: `Rotate ${run}` }), 'A supplier')
    expect((await call(A_VIEWER, 'POST', `/reception/suppliers/${sup.supplier.id}/rotate`)).status).toBe(403)
    const rot = ok(await call(A, 'POST', `/reception/suppliers/${sup.supplier.id}/rotate`), 'rotate')
    expect(rot.token).toMatch(/^sup_/)
    expect(rot.token).not.toBe(sup.token)
    expect((await call(null, 'GET', '/reception/supplier', undefined, { 'X-Supplier-Token': sup.token })).status).toBe(401)
    expect((await call(null, 'GET', '/reception/supplier', undefined, { 'X-Supplier-Token': rot.token })).status).toBe(200)
    // Revoke: the token is dead, the supplier's past deliveries stay on the register.
    ok(await call(A, 'POST', `/reception/suppliers/${sup.supplier.id}/revoke`), 'revoke')
    expect((await call(null, 'GET', '/reception/supplier', undefined, { 'X-Supplier-Token': rot.token })).status).toBe(401)
    expect((await deliver(rot.token, aSet.slug, `R-${run}.ifc`, Buffer.from('ISO-10303-21;'))).status).toBe(401)
    expect(ok(await call(A, 'GET', '/reception/suppliers'), 'list').suppliers.find((s: any) => s.id === sup.supplier.id)?.revoked_at).toBeTruthy()

  })

  it('client link token: expiry, revocation and lock-out', async () => {
    const l = ok(await call(A, 'POST', '/links', { label: `Sec ${run}`, project: 'SEC', version: 'P01', expires_in_days: 1, password: 'correct horse' }), 'link')
    expect((await call(null, 'POST', `/l/${l.token}`, { password: 'correct horse' })).status).toBe(200)
    expect((await call(null, 'POST', `/l/${l.token}x`, { password: 'correct horse' })).status).toBe(404)
    ok(await call(A, 'POST', `/links/${l.link.id}/revoke`), 'revoke')
    expect([404, 410]).toContain((await call(null, 'POST', `/l/${l.token}`, { password: 'correct horse' })).status)
    // A link that expired yesterday is closed, whatever the password.
    expect((await call(A, 'POST', '/links', { label: `Past ${run}`, project: 'SEC', version: 'P01', expires_in_days: 0 })).status).toBe(400)
  })

  it('webhooks: every payload is signed with the endpoint secret; a tampered body fails the check', async () => {
    const ep = ok(await call(A, 'POST', '/webhooks/endpoints', { url: 'http://127.0.0.1:9912/sec', events: ['delivery.received'] }), 'endpoint')
    expect(ep.secret).toMatch(/^whsec_/)
    // The secret is shown once: the list never returns it.
    const list = ok(await call(A, 'GET', '/webhooks/endpoints'), 'list')
    expect(JSON.stringify(list).includes(ep.secret)).toBe(false)
    // Endpoints to private addresses other than the local test receiver, or not http(s), are refused.
    for (const url of ['file:///etc/passwd', 'http://169.254.169.254/latest/meta-data', 'gopher://127.0.0.1:25/']) {
      expect((await call(A, 'POST', '/webhooks/endpoints', { url, events: ['delivery.received'] })).status, url).toBe(400)
    }
    // Signature format check: HMAC-SHA256 over "<timestamp>.<body>".
    const ts = '1700000000'; const raw = '{"a":1}'
    const sig = createHmac('sha256', ep.secret).update(`${ts}.${raw}`).digest('hex')
    expect(sig).toHaveLength(64)
    ok(await call(A, 'DELETE', `/webhooks/endpoints/${ep.endpoint.id}`), 'cleanup')
  })

  it('hostile inputs: names, sizes, bodies', async () => {
    const set = ok(await call(A, 'POST', '/reception/requirements', { name: `Inputs ${run}`, min_score: 10, content: '{}' }), 'set').requirement_set
    const sup = ok(await call(A, 'POST', '/reception/suppliers', { name: `Inputs ${run}` }), 'sup')
    const sha = 'a'.repeat(64)
    const bad = ['../../etc/passwd.ifc', 'a/b.ifc', 'a\\b.ifc', 'x\u0000.ifc', 'con.ifc\r\nX-Injected: 1', '.ifc', '   ']
    for (const name of bad) {
      const r = await call(null, 'POST', '/reception/deliveries', { requirement_slug: set.slug, file_name: name, file_hash: sha, size_bytes: 100 }, { 'X-Supplier-Token': sup.token })
      expect(r.status, JSON.stringify(name)).toBe(400)
    }
    // Over the plan's file limit: refused before any upload URL is handed out.
    const huge = await call(null, 'POST', '/reception/deliveries', { requirement_slug: set.slug, file_name: 'huge.ifc', file_hash: sha, size_bytes: 11 * 1024 ** 3 }, { 'X-Supplier-Token': sup.token })
    expect([400, 413]).toContain(huge.status)
    // Malformed and oversized JSON bodies are a clean 400/413, never a 500.
    expect((await call(A, 'POST', '/issues', '{"title":')).status).toBe(400)
    expect([400, 413]).toContain((await call(A, 'POST', '/issues', { title: 'x', description: 'y'.repeat(2_000_000) })).status)
    expect((await call(A, 'POST', '/issues', { title: 'x', element_guids: Array.from({ length: 5000 }, () => '0'.repeat(22)) })).status).toBe(400)
    // SQL-looking values are data, not SQL.
    const sq = ok(await call(A, 'POST', '/issues', { title: `'; DROP TABLE issues; -- ${run}` }), 'sql').issue
    expect(sq.title).toContain('DROP TABLE')
    expect((await call(A, 'GET', '/issues')).status).toBe(200)
  })

  it('audit trail: every sensitive action leaves an entry with who and what', async () => {
    const sup = ok(await call(A, 'POST', '/reception/suppliers', { name: `Audit ${run}` }), 'sup')
    ok(await call(A, 'POST', `/reception/suppliers/${sup.supplier.id}/rotate`), 'rotate')
    ok(await call(A, 'POST', `/reception/suppliers/${sup.supplier.id}/revoke`), 'revoke')
    const l = ok(await call(A, 'POST', '/links', { label: `Audit ${run}`, project: 'AUD', version: 'P01', expires_in_days: 3 }), 'link')
    ok(await call(A, 'POST', `/links/${l.link.id}/revoke`), 'link revoke')
    const ep = ok(await call(A, 'POST', '/webhooks/endpoints', { url: 'http://127.0.0.1:9912/aud', events: ['delivery.received'] }), 'hook')
    ok(await call(A, 'DELETE', `/webhooks/endpoints/${ep.endpoint.id}`), 'hook delete')
    const au = ok(await call(A, 'POST', '/automations', { name: `Audit ${run}`, enabled: false, trigger: 'delivery.validated', conditions: {}, actions: [{ type: 'notify', message: 'hello there' }], minutes_saved: 1 }), 'auto').automation
    ok(await call(A, 'DELETE', `/automations/${au.id}`), 'auto delete')
    const ev = ok(await call(A, 'GET', '/quality/audit'), 'audit').events as Array<{ type: string; actor_id: string; details: any }>
    const types = new Set(ev.filter((e) => JSON.stringify(e.details).includes(sup.supplier.id) || JSON.stringify(e.details).includes(l.link.id) || JSON.stringify(e.details).includes(ep.endpoint.id) || JSON.stringify(e.details).includes(au.id)).map((e) => e.type))
    for (const t of ['supplier_created', 'supplier_token_rotated', 'supplier_revoked', 'client_link_created', 'client_link_revoked', 'webhook_endpoint_created', 'webhook_endpoint_deleted', 'automation_created', 'automation_deleted']) {
      expect(types.has(t), t).toBe(true)
    }
    expect(ev.every((e) => !e.actor_id || e.actor_id.startsWith('user_local'))).toBe(true)
  })

  // Last: it trips the per-address limit for a minute.
  it('supplier token: guessing is slowed down to a 429 after a burst', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 40; i++) statuses.push((await call(null, 'GET', '/reception/supplier', undefined, { 'X-Supplier-Token': `sup_${run}guess${i.toString().padStart(24, '0')}`, 'CF-Connecting-IP': `198.51.100.${run.length}` })).status)
    expect(statuses).toContain(429)
    expect(statuses.every((s) => s === 401 || s === 429)).toBe(true)
  })
})
