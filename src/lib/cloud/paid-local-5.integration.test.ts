// @vitest-environment node
// ─── Paid workspace against the LOCAL backend, part 5 ────────────────────────
// The supplier's own upload page (token only, no account), issues raised from a
// validation result, and automations whose "send" action lands in the mail
// queue (never sent) after a real delivery is validated by the real engine.
// Skipped without PAID_LOCAL_API — see docs/PAID_LOCAL.md.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deliverFile, paidApi, supplierHome, type PaidResult } from './paid-client'
import { supplierProjectFromApi } from '../../components/workspace/sections/reception/live'
import { namingOf } from '../../components/workspace/sections/reception/sample'

const API = process.env.PAID_LOCAL_API ?? ''
const ORG = 'org_localdemo'
const SMALL = resolve('public/models/port-bcn/APBCN-URB-CER-Cerramiento_Horizontal_Tubular.ifc')
const run = Math.random().toString(36).slice(2, 8)
type Role = 'owner' | 'admin' | 'editor' | 'reviewer' | 'viewer' | 'guest'
const as = (role: Role) => vi.stubEnv('VITE_PAID_DEV_SESSION', `dev:user_local${role}:${ORG}`)
const code = (r: PaidResult<unknown>) => (r.ok ? 'ok' : r.error.code)

function drain() {
  execFileSync(process.execPath, ['scripts/local-runner/dist/runner.mjs', '--drain'], { env: { ...process.env, IFC_API_URL: API }, stdio: 'pipe', timeout: 180_000 })
}
function ifc(salt: string): ArrayBuffer {
  const b = Buffer.concat([readFileSync(SMALL), Buffer.from(`\n/* ${salt} */\n`)])
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

describe.skipIf(!API)('paid workspace on the local backend (part 5)', () => {
  let slug = ''
  let tokenA = ''
  let tokenB = ''
  const automations: string[] = []

  beforeAll(async () => {
    vi.stubEnv('VITE_API_URL', API)
    as('owner')
    const set = await paidApi.createRequirementSet(`Upload page ${run}`, 50, JSON.stringify({ project: 'UPL', due_day: 4, due_hour: 9, profile: 'EIR', profile_version: 2, client: 'Promotora Demo' }))
    const a = await paidApi.createSupplier(`Upload A ${run}`, 'ARC')
    const b = await paidApi.createSupplier(`Upload B ${run}`, 'MEP')
    if (!set.ok || !a.ok || !b.ok) throw new Error('setup failed')
    slug = set.value.requirement_set.slug; tokenA = a.value.token; tokenB = b.value.token
  })
  afterEach(() => { as('owner') })
  afterAll(async () => {
    as('owner')
    for (const id of automations) await paidApi.patchAutomation(id, { enabled: false })
  })

  it('supplier page: the token alone shows the projects and requirements; a wrong token shows nothing', async () => {
    // Without the project from the link (and nothing delivered yet) the token shows no project at all:
    // a supplier never learns the names of the company's other projects.
    const bare = await supplierHome(tokenB)
    expect(bare.ok && bare.value.projects).toEqual([])
    const h = await supplierHome(tokenA, slug)
    if (!h.ok) throw new Error(h.error.code)
    expect(h.value.supplier.name).toBe(`Upload A ${run}`)
    expect(h.value.projects).toHaveLength(1)
    const p = h.value.projects.find((x) => x.slug === slug)
    expect(p).toMatchObject({ min_score: 50, project: 'UPL', due_day: 4, due_hour: 9, client: 'Promotora Demo' })
    expect(h.value.max_file_mb).toBeGreaterThan(0)
    // The naming rule the page checks accepts only this supplier's originator.
    const project = supplierProjectFromApi(p!, h.value.supplier.name)
    expect(namingOf(project, { fileName: `UPL-UPLOAD-ZZ-02-M3-A-0001-S2-P01.ifc` }).ok).toBe(true)
    expect(namingOf(project, { fileName: `UPL-OTHER-ZZ-02-M3-A-0001-S2-P01.ifc` }).ok).toBe(false)
    expect(code(await supplierHome('sup_doesnotexist0000000000000000'))).toBe('unauthorized')
    expect(code(await supplierHome('not-a-token'))).toBe('unauthorized')
  })

  it('supplier page: deliver, see the real verdict, never another supplier\'s deliveries', async () => {
    const d = await deliverFile(tokenA, slug, `UPL-A-${run}.ifc`, ifc(`a-${run}`))
    const other = await deliverFile(tokenB, slug, `UPL-B-${run}.ifc`, ifc(`b-${run}`))
    if (!d.ok || !other.ok) throw new Error('delivery failed')
    let h = await supplierHome(tokenA)
    expect(h.ok && h.value.deliveries.find((x) => x.id === d.value.deliveryId)).toMatchObject({ uploaded: true, verdict: 'pending', score: null, file_hash: d.value.fileHash })
    drain()
    // Once it has delivered, the project stays on its page even without the link's project.
    h = await supplierHome(tokenA)
    if (!h.ok) throw new Error(h.error.code)
    expect(h.value.projects.map((x) => x.slug)).toEqual([slug])
    const mine = h.value.deliveries.find((x) => x.id === d.value.deliveryId)
    expect(mine?.score).toBeTypeOf('number')
    expect(['accepted', 'rejected', 'pending']).toContain(mine?.verdict)
    expect(h.value.deliveries.some((x) => x.id === other.value.deliveryId)).toBe(false)
    // Sending the same file again is the same delivery and the same receipt.
    const again = await deliverFile(tokenA, slug, `UPL-A-${run}.ifc`, ifc(`a-${run}`))
    expect(again.ok && again.value).toMatchObject({ deliveryId: d.value.deliveryId, replayed: true })
  }, 240_000)

  it('issue from a validation result: rule + GlobalId; the same one twice is one issue; viewers and guests may not', async () => {
    as('editor')
    const body = { title: `IFC_NAME_EMPTY: wall — empty Name ${run}`, rule_id: 'RULE_EMPTY_NAME', element_guids: [`3vB2YO$MX4xv5uCqZZG0${run.slice(0, 2).padEnd(2, 'x')}`.slice(0, 22)], priority: 'high' as const }
    const a = await paidApi.createIssue(body)
    if (!a.ok) throw new Error(a.error.code)
    expect(a.value.issue).toMatchObject({ rule_id: 'RULE_EMPTY_NAME', element_guids: body.element_guids })
    as('reviewer')
    const b = await paidApi.createIssue(body)
    expect(b.ok && b.value).toMatchObject({ replayed: true, issue: { number: a.value.issue.number } })
    for (const role of ['viewer', 'guest'] as Role[]) {
      as(role)
      expect(code(await paidApi.createIssue({ ...body, title: `${body.title} (${role})` })), role).toBe('forbidden')
    }
  })

  it('automations: an e-mail action queues in /mail/outbox after a real delivery is validated — never sent', async () => {
    const to = `coord-${run}@example.com`
    const subj = 'Delivery {{name}} scored {{score}}'
    // Editors and viewers cannot create automations; owners can.
    as('viewer')
    expect(code(await paidApi.createAutomation({ name: `Mail ${run}`, enabled: true, trigger: 'delivery.validated', conditions: { name_contains: `mail-${run}` }, actions: [{ type: 'queue_mail', to, subject: subj, body: subj }], minutes_saved: 5 }))).toBe('forbidden')
    as('owner')
    const au = await paidApi.createAutomation({ name: `Mail ${run}`, enabled: true, trigger: 'delivery.validated', conditions: { name_contains: `mail-${run}` }, actions: [{ type: 'queue_mail', to, subject: subj, body: subj }], minutes_saved: 5 })
    if (!au.ok) throw new Error(au.error.code)
    automations.push(au.value.automation.id)
    // A queue_mail action that does not fit the trigger contract is refused.
    expect(code(await paidApi.createAutomation({ name: `Bad ${run}`, enabled: true, trigger: 'delivery.validated', conditions: {}, actions: [{ type: 'queue_mail', to: 'not an email', subject: subj, body: subj }], minutes_saved: 5 }))).toBe('invalid_payload')

    const d = await deliverFile(tokenA, slug, `mail-${run}.ifc`, ifc(`mail-${run}`))
    if (!d.ok) throw new Error('delivery failed')
    drain()
    const box = await paidApi.outbox()
    if (!box.ok) throw new Error(box.error.code)
    const mail = box.value.messages.filter((m) => m.ref_id === d.value.deliveryId)
    expect(mail).toHaveLength(1)
    expect(mail[0]).toMatchObject({ to, status: 'queued', ref_type: 'delivery', created_by: 'automation' })
    expect(mail[0].subject).toContain(`mail-${run}.ifc`)
    const runs = await paidApi.automationRuns()
    const mineRun = runs.ok ? runs.value.runs.find((r) => r.subject === `delivery:${d.value.deliveryId}`) : undefined
    expect(mineRun?.results?.[0]).toMatchObject({ type: 'queue_mail' })
  }, 240_000)

  it('automations: a contact who unsubscribed is skipped, and the run says why', async () => {
    const to = `gone-${run}@example.com`
    const c = await paidApi.saveContact({ email: to, name: 'Gone', lang: 'es', consent_source: 'test' })
    if (!c.ok) throw new Error(c.error.code)
    expect((await paidApi.unsubscribeContact(c.value.contact.id)).ok).toBe(true)
    const au = await paidApi.createAutomation({ name: `Gone ${run}`, enabled: true, trigger: 'delivery.validated', conditions: { name_contains: `gone-${run}` }, actions: [{ type: 'queue_mail', to, subject: 'Hello {{name}}', body: 'Hello {{name}}' }], minutes_saved: 5 })
    if (!au.ok) throw new Error(au.error.code)
    automations.push(au.value.automation.id)
    const d = await deliverFile(tokenA, slug, `gone-${run}.ifc`, ifc(`gone-${run}`))
    if (!d.ok) throw new Error('delivery failed')
    drain()
    const box = await paidApi.outbox()
    expect(box.ok && box.value.messages.filter((m) => m.ref_id === d.value.deliveryId)).toHaveLength(0)
    const runs = await paidApi.automationRuns()
    const r = runs.ok ? runs.value.runs.find((x) => x.subject === `delivery:${d.value.deliveryId}`) : undefined
    expect(r?.results?.[0]).toMatchObject({ type: 'queue_mail', skipped: 'unsubscribed' })
  }, 240_000)
})
