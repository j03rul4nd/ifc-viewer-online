// @vitest-environment node
// ─── Paid workspace against the LOCAL backend, part 2 ────────────────────────
// Watched folder → Reception delivery → signed webhook; mail contacts with
// consent and unsubscribe; the rule library with roles and versions.
// Skipped unless PAID_LOCAL_API is set — see docs/PAID_LOCAL.md. Needs
// `wrangler dev --test-scheduled` (to run the webhook dispatch on demand) and
// WEBHOOKS_ALLOW_LOCAL=true in .dev.vars.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { paidApi, unsubscribeByToken } from './paid-client'
import { receptionValidator } from './watch-reception'
import { pollFolder } from '../connectors/watch'
import { verifySignature } from '../connectors/webhooks'
import type { Connector, RemoteFile, ResultUpload, WatchedFolder } from '../connectors/types'

const API = process.env.PAID_LOCAL_API ?? ''
const ORG = 'org_localdemo'
const SMALL = resolve('public/models/port-bcn/APBCN-URB-CER-Cerramiento_Malla_Simple_Torsion.ifc')
const run = Math.random().toString(36).slice(2, 8)

function as(role: 'owner' | 'admin' | 'editor' | 'reviewer' | 'viewer' | 'guest') {
  vi.stubEnv('VITE_PAID_DEV_SESSION', `dev:user_local${role}:${ORG}`)
}

/** Runner pass in the background, so the caller can wait for the verdict meanwhile. */
function runnerInBackground(): Promise<void> {
  return new Promise((res) => {
    const p = spawn(process.execPath, ['scripts/local-runner/dist/runner.mjs', '--once'], { env: { ...process.env, IFC_API_URL: API }, stdio: 'ignore' })
    p.on('exit', () => res())
  })
}

/** Contract mock of a SharePoint/Drive folder: one IFC, results written back in memory. */
function mockFolder(file: RemoteFile, bytes: ArrayBuffer) {
  const written: ResultUpload[] = []
  const connector: Connector = {
    id: 'sharepoint', name: 'Mock folder',
    oauth: { authorizeUrl: '', tokenUrl: '', scopes: [] } as unknown as Connector['oauth'],
    startCursor: async () => 'c0',
    changes: async (_f, cursor) => ({ files: cursor === 'c0' ? [file] : [], cursor: 'c1' }),
    download: async () => bytes,
    upload: async (_f, r) => { written.push(r); return `res-${written.length}` },
  }
  return { connector, written }
}

describe.skipIf(!API)('paid workspace on the local backend (part 2)', () => {
  let server: Server
  let hookUrl = ''
  const received: { path: string; body: string; signature: string; event: string }[] = []

  beforeAll(async () => {
    vi.stubEnv('VITE_API_URL', API)
    as('owner')
    server = createServer((req, res) => {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => { received.push({ path: String(req.url), body, signature: String(req.headers['x-signature'] ?? ''), event: String(req.headers['x-event'] ?? '') }); res.end('ok') })
    })
    await new Promise<void>((r) => server.listen(Number(process.env.PAID_LOCAL_HOOK_PORT ?? 9912), '127.0.0.1', () => r()))
    const addr = server.address()
    hookUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/hook-${run}`
  })
  afterAll(() => { server?.close() })
  afterEach(() => { as('owner') })

  it('a new IFC in a watched folder becomes a real delivery, and the signed webhooks arrive', async () => {
    const hook = await paidApi.createEndpoint(hookUrl, ['delivery.received', 'validation.completed', 'delivery.accepted', 'delivery.rejected'])
    expect(hook.ok).toBe(true)
    if (!hook.ok) return
    const set = await paidApi.createRequirementSet(`Folder ${run}`, 50, 'rules:default')
    const sup = await paidApi.createSupplier(`Folder supplier ${run}`, 'URB')
    expect(set.ok && sup.ok).toBe(true)
    if (!set.ok || !sup.ok) return

    const raw = readFileSync(SMALL)
    const bytes = Buffer.concat([raw, Buffer.from(`\n/* ${run} */\n`)])
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const file: RemoteFile = { id: `f-${run}`, name: `Fence-${run}.ifc`, size: ab.byteLength, version: '1', modifiedAt: new Date().toISOString(), parentId: 'root' }
    const { connector, written } = mockFolder(file, ab)
    const folder: WatchedFolder = { connector: 'sharepoint', folderId: 'root', folderName: 'Deliveries', state: 'watching', seen: [], failures: 0 } as unknown as WatchedFolder

    const runner = runnerInBackground()
    const polled = await pollFolder(connector, folder, 'token', receptionValidator({ supplierToken: sup.value.token, requirementSlug: set.value.requirement_set.slug }, { intervalMs: 500, timeoutMs: 90_000 }))
    await runner
    expect(polled.results[0]?.status).toBe('validated')
    expect(polled.results[0]?.outcome?.score).toBeGreaterThan(0)
    const report = JSON.parse(written[0].body) as { report: { delivery_id: string; verdict: string } }
    expect(['accepted', 'rejected']).toContain(report.report.verdict)

    // A second poll sees nothing new: the same file is never delivered twice.
    const again = await pollFolder(connector, polled.folder, 'token', receptionValidator({ supplierToken: sup.value.token, requirementSlug: set.value.requirement_set.slug }))
    expect(again.results).toHaveLength(0)

    // Run the 5-minute dispatch cron on demand until the events arrive. Workerd
    // cannot reach ephemeral ports, hence the fixed PAID_LOCAL_HOOK_PORT.
    const mineNow = () => received.filter((r) => r.path === `/hook-${run}` && r.body.includes(report.report.delivery_id))
    const events = () => new Set(mineNow().map((r) => r.event))
    for (let i = 0; i < 45 && !(events().has('delivery.received') && events().has('validation.completed')); i++) {
      await fetch(`${API}/__scheduled?cron=${encodeURIComponent('*/5 * * * *')}`)
      await new Promise((r) => setTimeout(r, 1000))
    }
    const mine = mineNow()
    expect(mine.map((r) => r.event)).toEqual(expect.arrayContaining(['delivery.received', 'validation.completed']))
    const now = Math.floor(Date.now() / 1000)
    for (const r of mine) expect(await verifySignature(hook.value.secret, r.body, r.signature, now)).toBe(true)
    expect(await verifySignature('wrong-secret', mine[0].body, mine[0].signature, now)).toBe(false)
    await paidApi.deleteEndpoint(hook.value.endpoint.id)
  }, 180_000)

  it('mail contacts: consent recorded, unsubscribe by link stops the queue, no consent → refused', async () => {
    const email = `client-${run}@example.com`
    const [a, b] = await Promise.all([
      paidApi.saveContact({ email, name: 'Client', lang: 'es', consent_source: 'Signed contract 2026-11' }),
      paidApi.saveContact({ email: email.toUpperCase(), name: 'Client', lang: 'es', consent_source: 'Signed contract 2026-11' }),
    ])
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(b.value.contact.id).toBe(a.value.contact.id)
    const token = a.value.unsubscribe_token ?? b.value.unsubscribe_token
    expect(token).toMatch(/^uns_/)
    expect(a.value.contact.consent_at).toBeTruthy()

    const q1 = await paidApi.queueMail({ to: email, subject: 'Update', body: 'Model accepted.' }, `c1-${run}`)
    expect(q1.ok).toBe(true)
    const un = await unsubscribeByToken(token!)
    expect(un.ok).toBe(true)
    const q2 = await paidApi.queueMail({ to: email, subject: 'Update', body: 'Again.' }, `c2-${run}`)
    expect(q2.ok ? 'ok' : q2.error.code).toBe('unsubscribed')
    // Adding them again never re-subscribes.
    const again = await paidApi.saveContact({ email, consent_source: 'form' })
    expect(again.ok && again.value.contact.unsubscribed_at).toBeTruthy()

    const noConsent = `noconsent-${run}@example.com`
    expect((await paidApi.saveContact({ email: noConsent })).ok).toBe(true)
    const q3 = await paidApi.queueMail({ to: noConsent, subject: 's', body: 'b' }, `c3-${run}`)
    expect(q3.ok ? 'ok' : q3.error.code).toBe('consent_required')

    as('viewer')
    const v = await paidApi.saveContact({ email: `v-${run}@example.com` })
    expect(v.ok ? 'ok' : v.error.code).toBe('forbidden')
  })

  it('rule library: admins save and version; editors, reviewers and guests cannot change it', async () => {
    // standard.edit belongs to Owner/Admin; a company can grant it to Editors (team policies).
    as('editor')
    const e = await paidApi.createRuleset(`Editor ${run}`, 'validator_profile', '{}')
    expect(e.ok ? 'ok' : e.error.code).toBe('forbidden')
    as('admin')
    const created = await paidApi.createRuleset(`Doors ${run}`, 'validator_profile', JSON.stringify({ rules: { 'missing-name': true } }))
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const id = created.value.id
    expect((await paidApi.updateRuleset(id, { content: JSON.stringify({ rules: { 'missing-name': false } }) })).ok).toBe(true)
    const read = await paidApi.ruleset(id)
    expect(read.ok && JSON.parse(read.value.content).rules['missing-name']).toBe(false)

    as('reviewer')
    const r = await paidApi.createRuleset(`Nope ${run}`, 'validator_profile', '{}')
    expect(r.ok ? 'ok' : r.error.code).toBe('forbidden')
    as('guest')
    const g = await paidApi.updateRuleset(id, { name: 'hijacked' })
    expect(g.ok ? 'ok' : g.error.code).toBe('forbidden')
    as('viewer')
    const d = await paidApi.deleteRuleset(id)
    expect(d.ok ? 'ok' : d.error.code).toBe('forbidden')

    // Managed requirements: numbered versions, two publishes at once never make two "v2".
    as('owner')
    const req = await paidApi.createRuleset(`EIR ${run}`, 'requirements', JSON.stringify({ t: `EIR ${run}`, s: 70 }))
    expect(req.ok).toBe(true)
    if (!req.ok) return
    const content = (n: number) => JSON.stringify({ t: `EIR ${run}`, s: 70 + n })
    expect((await paidApi.publishRequirementVersion(req.value.id, content(1), 'First issue')).ok).toBe(true)
    const [p2, p3] = await Promise.all([
      paidApi.publishRequirementVersion(req.value.id, content(2), 'Adds doors'),
      paidApi.publishRequirementVersion(req.value.id, content(3), 'Adds walls'),
    ])
    const versions = await paidApi.requirementVersions(req.value.id)
    const numbers = versions.ok ? versions.value.versions.map((v) => v.version).sort() : []
    expect(new Set(numbers).size).toBe(numbers.length)
    expect(numbers.length).toBe(1 + [p2, p3].filter((p) => p.ok).length)
    for (const p of [p2, p3]) if (!p.ok) expect(p.error.code).toBe('conflict')

    await paidApi.deleteRuleset(id)
  })
})
