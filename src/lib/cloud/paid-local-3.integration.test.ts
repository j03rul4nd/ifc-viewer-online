// @vitest-environment node
// ─── Paid workspace against the LOCAL backend, part 3: robustness ────────────
// One member of each role tries every write; the backend dies in the middle of
// an action (the request lands, the answer never comes back) and a retry must
// not duplicate or lose anything; two people edit the same thing and the
// second gets a visible conflict instead of a silent overwrite; Pro client
// links and branded certificates end to end. Skipped without PAID_LOCAL_API.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createServer, request as httpRequest, type Server } from 'node:http'
import { resolve } from 'node:path'
import { deliverFile, openClientLink, paidApi, type PaidResult } from './paid-client'
import { saveSet, loadLibrary } from '../../components/workspace/sections/rules/library-sync'
import type { RuleSet } from '../../components/workspace/sections/rules/rules-lib'
import { buildCertifyPayload } from '../certify/build-payload'
import { certify, getCertificate } from './api-client'
import { DEFAULT_RULES } from '../../types'

const API = process.env.PAID_LOCAL_API ?? ''
const ORG = 'org_localdemo'
const SMALL = resolve('public/models/port-bcn/APBCN-URB-CER-Cerramiento_Malla_Mepsa.ifc')
const run = Math.random().toString(36).slice(2, 8)
type Role = 'owner' | 'admin' | 'editor' | 'reviewer' | 'viewer' | 'guest'
const ROLES: Role[] = ['owner', 'admin', 'editor', 'reviewer', 'viewer', 'guest']
const as = (role: Role) => vi.stubEnv('VITE_PAID_DEV_SESSION', `dev:user_local${role}:${ORG}`)
const code = (r: PaidResult<unknown>) => (r.ok ? 'ok' : r.error.code)

// 1×1 transparent PNG.
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

/**
 * A proxy in front of the API that can "die" mid-action: it forwards the
 * request, lets the backend commit, then drops the connection instead of
 * answering — the worst case for a client.
 */
function crashProxy(port: number) {
  let dropNext = false
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const target = new URL(API)
      const fwd = httpRequest({ host: target.hostname, port: target.port, path: req.url, method: req.method, headers: { ...req.headers, host: target.host } }, (up) => {
        const body: Buffer[] = []
        up.on('data', (c) => body.push(c))
        up.on('end', () => {
          if (dropNext) { dropNext = false; req.socket.destroy(); return }
          res.writeHead(up.statusCode ?? 502, up.headers); res.end(Buffer.concat(body))
        })
      })
      fwd.end(Buffer.concat(chunks))
    })
  })
  return { server, url: `http://127.0.0.1:${port}`, dropNext: () => { dropNext = true }, listen: () => new Promise<void>((r) => server.listen(port, '127.0.0.1', () => r())) }
}

describe.skipIf(!API)('paid workspace on the local backend (part 3: robustness)', () => {
  const proxy = crashProxy(Number(process.env.PAID_LOCAL_PROXY_PORT ?? 9913))
  let deliveryId = ''
  let issueNumber = 0

  beforeAll(async () => {
    vi.stubEnv('VITE_API_URL', API)
    as('owner')
    await proxy.listen()
    const set = await paidApi.createRequirementSet(`Robust ${run}`, 50, 'rules:default')
    const sup = await paidApi.createSupplier(`Robust supplier ${run}`, 'URB')
    if (!set.ok || !sup.ok) throw new Error('setup failed')
    const bytes = new TextEncoder().encode(`ISO-10303-21;\nFILE_SCHEMA(('IFC4'));\n/* ${run} */`)
    const d = await deliverFile(sup.value.token, set.value.requirement_set.slug, `R-${run}.ifc`, bytes.buffer as ArrayBuffer)
    if (!d.ok) throw new Error('delivery failed')
    deliveryId = d.value.deliveryId
    const i = await paidApi.createIssue({ title: `Robust ${run}` })
    if (!i.ok) throw new Error('issue failed')
    issueNumber = i.value.issue.number
  })
  afterAll(() => { proxy.server.close() })
  afterEach(() => { as('owner'); vi.stubEnv('VITE_API_URL', API) })

  it('every role can do exactly what its role allows, and nothing else', async () => {
    // Expected from lib/team.ts PERMISSIONS (owner/admin: all; editor: reception
    // + issues; reviewer: raise issues; viewer: read; guest: read and comment).
    const can: Record<string, Role[]> = {
      decide: ['owner', 'admin', 'editor'],
      supplier: ['owner', 'admin', 'editor'],
      raiseIssue: ['owner', 'admin', 'editor', 'reviewer'],
      editIssue: ['owner', 'admin', 'editor'],
      ruleLibrary: ['owner', 'admin'],
      certificateLogo: ['owner', 'admin'],
      clientLink: ['owner', 'admin', 'editor'],
      queueMail: ['owner', 'admin', 'editor'],
      contact: ['owner', 'admin', 'editor'],
      webhook: ['owner', 'admin'],
    }
    const tries: Record<keyof typeof can, (role: Role) => Promise<PaidResult<unknown>>> = {
      decide: () => paidApi.decide(deliveryId, 'rejected', 'role sweep'),
      supplier: (role) => paidApi.createSupplier(`Sweep ${role} ${run}`),
      raiseIssue: (role) => paidApi.createIssue({ title: `Sweep ${role} ${run}` }),
      editIssue: () => paidApi.patchIssue(issueNumber, { priority: 'high' }),
      ruleLibrary: (role) => paidApi.createRuleset(`Sweep ${role} ${run}`, 'validator_profile', '{}'),
      certificateLogo: () => paidApi.setBranding(LOGO),
      clientLink: (role) => paidApi.createLink({ label: `Sweep ${role}`, project: 'P', version: 'v1', expires_in_days: 7 }),
      queueMail: (role) => paidApi.queueMail({ to: `sweep-${role}-${run}@example.com`, subject: 's', body: 'b' }, `sweep-${role}-${run}`),
      contact: (role) => paidApi.saveContact({ email: `sweep-${role}-${run}@example.com` }),
      webhook: () => paidApi.createEndpoint(`https://example.com/hook-${run}`, ['issue.created']),
    }
    const wrong: string[] = []
    for (const role of ROLES) {
      as(role)
      for (const [action, allowed] of Object.entries(can)) {
        const r = await tries[action as keyof typeof can](role)
        const want = allowed.includes(role) ? 'ok' : 'forbidden'
        if (code(r) !== want) wrong.push(`${role} ${action}: ${code(r)} (want ${want})`)
      }
    }
    expect(wrong).toEqual([])
  }, 120_000)

  it('the backend dies mid-action: retrying never duplicates and nothing is lost', async () => {
    vi.stubEnv('VITE_API_URL', proxy.url)
    // Mail: the request lands, the answer is lost, the person retries.
    const msg = { to: `crash-${run}@example.com`, subject: 'Crash test', body: 'Once only.' }
    proxy.dropNext()
    expect(code(await paidApi.queueMail(msg, `crash-${run}`))).toBe('network')
    const retry = await paidApi.queueMail(msg, `crash-${run}`)
    expect(retry.ok && retry.value.replayed).toBe(true)
    vi.stubEnv('VITE_API_URL', API)
    const box = await paidApi.outbox()
    expect(box.ok && box.value.messages.filter((m) => m.subject === 'Crash test' && m.to === msg.to)).toHaveLength(1)

    // Issue edit with the version it loaded: the lost answer is visible on retry as a conflict whose
    // current value already is the change, so the screen shows "already saved", never a double write.
    const before = await paidApi.issues()
    const issue = before.ok ? before.value.issues.find((i) => i.number === issueNumber) : undefined
    vi.stubEnv('VITE_API_URL', proxy.url)
    proxy.dropNext()
    expect(code(await paidApi.patchIssue(issueNumber, { status: 'in_progress', if_updated_at: issue!.updated_at }))).toBe('network')
    const again = await paidApi.patchIssue(issueNumber, { status: 'in_progress', if_updated_at: issue!.updated_at })
    expect(code(again)).toBe('conflict')
    expect(!again.ok && again.error.current?.status).toBe('in_progress')

    // A rule set saved while the answer is lost: the retry sees the server copy is already its own.
    vi.stubEnv('VITE_API_URL', API)
    const set: RuleSet = { id: `rs-${run}`, name: `Crash rules ${run}`, discipline: 'ARC', versions: [{ version: 1, author: 'me', date: '2026-11-12', status: 'draft', note: 'first', rules: [] }], comments: [] } as unknown as RuleSet
    const first = await saveSet(set)
    expect(first.ok).toBe(true)
    if (!first.ok || !('synced' in first)) return
    const edited = { ...set, name: `Crash rules ${run} (edited)` }
    vi.stubEnv('VITE_API_URL', proxy.url)
    proxy.dropNext()
    const lost = await saveSet(edited, first.synced)
    expect(!lost.ok && 'error' in lost && lost.error.code).toBe('network')
    const retried = await saveSet(edited, first.synced)
    expect(!retried.ok && 'conflict' in retried && retried.conflict.name).toBe(edited.name)
  }, 60_000)

  it('two people edit the same thing: the second sees a conflict, nothing is overwritten', async () => {
    const list = await paidApi.issues()
    const issue = list.ok ? list.value.issues.find((i) => i.number === issueNumber) : undefined
    as('admin')
    const a = await paidApi.patchIssue(issueNumber, { priority: 'critical', if_updated_at: issue!.updated_at })
    expect(a.ok).toBe(true)
    as('editor')
    const b = await paidApi.patchIssue(issueNumber, { priority: 'low', if_updated_at: issue!.updated_at })
    expect(code(b)).toBe('conflict')
    expect(!b.ok && b.error.current?.priority).toBe('critical')
    as('owner')
    const after = await paidApi.issues()
    expect(after.ok && after.value.issues.find((i) => i.number === issueNumber)?.priority).toBe('critical')

    // Same in the rule library: both admins loaded the same copy.
    const base: RuleSet = { id: `rs2-${run}`, name: `Shared rules ${run}`, discipline: 'ARC', versions: [{ version: 1, author: 'a', date: '2026-11-12', status: 'draft', note: 'v1', rules: [] }], comments: [] } as unknown as RuleSet
    const created = await saveSet(base)
    if (!created.ok || !('synced' in created)) throw new Error('save failed')
    const mine = await saveSet({ ...base, name: `${base.name} — owner` }, created.synced)
    expect(mine.ok).toBe(true)
    as('admin')
    const theirs = await saveSet({ ...base, name: `${base.name} — admin` }, created.synced)
    expect(!theirs.ok && 'conflict' in theirs && theirs.conflict.name).toBe(`${base.name} — owner`)
    const lib = await loadLibrary()
    expect(lib.ok && lib.sets.find((s) => s.id === base.id)?.name).toBe(`${base.name} — owner`)
  }, 30_000)

  it('Pro client links: password, wrong password, view count, revoke, lock after 10 tries', async () => {
    const l = await paidApi.createLink({ label: `Client ${run}`, project: 'MDT', version: 'v3', expires_in_days: 30, password: 'correct-horse' })
    expect(l.ok).toBe(true)
    if (!l.ok) return
    expect(code(await openClientLink(l.value.token))).toBe('password_required')
    expect(code(await openClientLink(l.value.token, 'wrong-pass'))).toBe('wrong_password')
    const ok = await openClientLink(l.value.token, 'correct-horse')
    expect(ok.ok && ok.value.version).toBe('v3')
    const listed = await paidApi.links()
    expect(listed.ok && listed.value.links.find((x) => x.id === l.value.link.id)?.views).toBe(1)
    expect((await paidApi.revokeLink(l.value.link.id)).ok).toBe(true)
    expect(code(await openClientLink(l.value.token, 'correct-horse'))).toBe('gone')

    const k = await paidApi.createLink({ label: `Brute ${run}`, project: 'MDT', version: 'v3', expires_in_days: null, password: 'correct-horse' })
    if (!k.ok) throw new Error('link failed')
    for (let i = 0; i < 10; i++) await openClientLink(k.value.token, `guess-${i}`)
    expect(code(await openClientLink(k.value.token, 'correct-horse'))).toBe('gone')
    expect(code(await paidApi.createLink({ label: 'Bad', project: 'P', version: 'v', expires_in_days: 0 }))).toBe('invalid_payload')
  }, 60_000)

  it('a certificate from a real validation carries the company logo and verifies publicly', async () => {
    expect((await paidApi.setBranding(LOGO)).ok).toBe(true)
    const out = execFileSync(process.execPath, ['scripts/local-runner/dist/runner.mjs', '--validate', SMALL], { encoding: 'utf8', timeout: 120_000 })
    const v = JSON.parse(out) as { healthScore: number; issues: never[]; fileHash: string }
    const payload = await buildCertifyPayload({ result: { issues: v.issues, qualityScore: v.healthScore }, rules: DEFAULT_RULES, profileId: null, fileHashSha256: v.fileHash })
    const signed = await certify(payload, `dev:user_localowner:${ORG}`)
    expect(signed.ok).toBe(true)
    if (!signed.ok) return
    const found = await getCertificate(signed.value.cert_hash)
    expect(found.ok && found.value.certificates[0]?.issuer_logo).toBe(LOGO)
    expect(found.ok && found.value.certificates[0]?.payload.file_hash_sha256).toBe(v.fileHash)
  }, 150_000)
})
