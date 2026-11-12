// @vitest-environment node
// ─── Paid workspace against the LOCAL backend ────────────────────────────────
// End to end with real IFC files: ifc-cloud-api under `wrangler dev`, Postgres
// and the S3 stand-in in docker, the local runner validating with the viewer's
// own engine. Skipped unless PAID_LOCAL_API is set — see docs/PAID_LOCAL.md.
//
//   PAID_LOCAL_API=http://127.0.0.1:8787 RUNNER_TOKEN=… npx vitest run src/lib/cloud/paid-local.integration.test.ts
//   (+ PAID_LOCAL_BIG=1 to also push the 94 MB Shanghai Tower through)

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deliverFile, paidApi, paidDataSource } from './paid-client'

const API = process.env.PAID_LOCAL_API ?? ''
const ORG = 'org_localdemo'
const SMALL = resolve('public/models/port-bcn/APBCN-URB-CER-Cerramiento_Horizontal_Tubular.ifc')
const BIG = resolve('public/models/shanghai-tower/SHA-IVO-SHANGHAI-TOWER-A-0001.ifc')
const run = Math.random().toString(36).slice(2, 8)

/** Act as one seeded member (scripts/seed-local-roles.mjs in ifc-cloud-api). */
function as(role: 'owner' | 'admin' | 'editor' | 'reviewer' | 'viewer' | 'guest') {
  vi.stubEnv('VITE_PAID_DEV_SESSION', `dev:user_local${role}:${ORG}`)
}

/** One runner pass with the real engine (built by scripts/local-runner/build.mjs). */
function runnerOnce(timeoutMs = 120_000) {
  execFileSync(process.execPath, ['scripts/local-runner/dist/runner.mjs', '--drain'], { env: { ...process.env, IFC_API_URL: API }, stdio: 'pipe', timeout: timeoutMs })
}

function bytesOf(path: string, salt = ''): ArrayBuffer {
  // A trailing comment makes a distinct file (new hash) with the same model.
  const b = Buffer.concat([readFileSync(path), Buffer.from(salt ? `\n/* ${salt} */\n` : '')])
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

describe.skipIf(!API)('paid workspace on the local backend', () => {
  let slug = ''
  let supplierToken = ''

  beforeAll(async () => {
    vi.stubEnv('VITE_API_URL', API)
    as('owner')
    const set = await paidApi.createRequirementSet(`Local IT ${run}`, 60, 'rules:default')
    expect(set.ok).toBe(true)
    if (set.ok) slug = set.value.requirement_set.slug
    const sup = await paidApi.createSupplier(`Supplier ${run}`, 'ARC')
    expect(sup.ok).toBe(true)
    if (sup.ok) supplierToken = sup.value.token
  })
  afterEach(() => { as('owner') })

  it('a dev build pointed at localhost reads and writes the local backend', () => {
    expect(paidDataSource(false)).toBe('local')
  })

  it('Reception: deliver a real IFC → real validation → decision sealed with its hash', async () => {
    const d = await deliverFile(supplierToken, slug, `A-${run}.ifc`, bytesOf(SMALL, run))
    expect(d.ok).toBe(true)
    if (!d.ok) return
    runnerOnce()
    const list = await paidApi.deliveries()
    expect(list.ok).toBe(true)
    const row = list.ok ? list.value.deliveries.find((x) => x.id === d.value.deliveryId) : undefined
    expect(row?.score).toBeTypeOf('number')
    expect(row?.file_hash).toBe(d.value.fileHash)
    expect(['accepted', 'rejected']).toContain(row?.verdict)

    // A person overrides the automatic verdict; the decision is sealed.
    const decided = await paidApi.decide(d.value.deliveryId, 'rejected', 'Wrong coordinates for this site')
    expect(decided.ok).toBe(true)
    const after = await paidApi.deliveries()
    const sealed = after.ok ? after.value.deliveries.find((x) => x.id === d.value.deliveryId) : undefined
    expect(sealed?.verdict).toBe('rejected')
    expect(sealed?.sealed_at).toBeTruthy()
  }, 180_000)

  it('the same file twice is one delivery (idempotent on the hash)', async () => {
    const bytes = bytesOf(SMALL, `${run}-again`)
    const a = await deliverFile(supplierToken, slug, `B-${run}.ifc`, bytes)
    const b = await deliverFile(supplierToken, slug, `B-${run}.ifc`, bytes)
    expect(a.ok && b.ok).toBe(true)
    if (a.ok && b.ok) {
      expect(b.value.deliveryId).toBe(a.value.deliveryId)
      expect(b.value.replayed).toBe(true)
    }
    runnerOnce()
  }, 180_000)

  it('a file that is not an IFC is rejected before validation', async () => {
    const junk = new TextEncoder().encode(`not an ifc ${run}`).buffer as ArrayBuffer
    const d = await deliverFile(supplierToken, slug, `junk-${run}.ifc`, junk)
    expect(d.ok).toBe(true)
    runnerOnce()
    const list = await paidApi.deliveries()
    const row = list.ok && d.ok ? list.value.deliveries.find((x) => x.id === d.value.deliveryId) : undefined
    expect(row?.verdict).toBe('rejected')
    expect(row?.reason).toMatch(/not an IFC/)
  }, 60_000)

  it('Team issues: create from a clash, two users edit at once, both changes land', async () => {
    const c = await paidApi.createIssue({ title: `Clash: duct × beam ${run}`, element_guids: ['2O2Fr$t4X7Zf8NOew3FLOH', '1hOSvn6df7F8_7GcBWlRGQ'], priority: 'high' })
    expect(c.ok).toBe(true)
    if (!c.ok) return
    const n = c.value.issue.number
    as('editor')
    const p1 = paidApi.patchIssue(n, { status: 'in_progress' })
    as('admin')
    const p2 = paidApi.patchIssue(n, { priority: 'critical' })
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1.ok && r2.ok).toBe(true)
    const list = await paidApi.issues()
    const issue = list.ok ? list.value.issues.find((i) => i.number === n) : undefined
    expect(issue?.status).toBe('in_progress')
    expect(issue?.priority).toBe('critical')
    expect(issue?.element_guids).toHaveLength(2)
  })

  it('roles: a reviewer cannot decide deliveries, a guest cannot see them, a viewer cannot queue mail', async () => {
    const list = await paidApi.deliveries()
    const id = list.ok ? list.value.deliveries[0]?.id : undefined
    expect(id).toBeTruthy()
    as('reviewer')
    const r = await paidApi.decide(id!, 'accepted')
    expect(r.ok ? 'ok' : r.error.code).toBe('forbidden')
    as('guest')
    const g = await paidApi.deliveries()
    expect(g.ok ? 'ok' : g.error.code).toBe('forbidden')
    as('viewer')
    const m = await paidApi.queueMail({ to: 'client@example.com', subject: 's', body: 'b' }, `viewer-${run}`)
    expect(m.ok ? 'ok' : m.error.code).toBe('forbidden')
  })

  it('mail: queued and kept, never sent; same key → same message; cancel works once', async () => {
    const msg = { to: 'client@example.com', subject: `Delivery rejected ${run}`, body: 'Please fix the coordinates.', kind: 'delivery_rejected' as const }
    const [a, b] = await Promise.all([paidApi.queueMail(msg, `key-${run}`), paidApi.queueMail(msg, `key-${run}`)])
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(b.value.message.id).toBe(a.value.message.id)
    expect(a.value.message.status).toBe('queued')
    const c = await paidApi.cancelMail(a.value.message.id)
    expect(c.ok && c.value.message.status).toBe('cancelled')
    const box = await paidApi.outbox()
    expect(box.ok && box.value.messages.filter((m) => m.id === a.value.message.id)).toHaveLength(1)
  })

  it('network errors come back as a code, not an exception', async () => {
    vi.stubEnv('VITE_API_URL', 'http://127.0.0.1:9')
    const r = await paidApi.issues()
    expect(r.ok ? 'ok' : r.error.code).toBe('network')
    vi.stubEnv('VITE_API_URL', API)
  })

  it.skipIf(!process.env.PAID_LOCAL_BIG)('a 94 MB model (Shanghai Tower) goes through upload and validation', async () => {
    const d = await deliverFile(supplierToken, slug, `SHA-${run}.ifc`, bytesOf(BIG, run))
    expect(d.ok).toBe(true)
    runnerOnce(900_000)
    const list = await paidApi.deliveries()
    const row = list.ok && d.ok ? list.value.deliveries.find((x) => x.id === d.value.deliveryId) : undefined
    expect(row?.score).toBeTypeOf('number')
  }, 1_000_000)
})
