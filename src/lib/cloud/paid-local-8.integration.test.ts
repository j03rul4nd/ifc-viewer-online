// @vitest-environment node
// ─── Paid workspace against the LOCAL backend, part 8 ────────────────────────
// A pilot customer starting alone and leaving cleanly: the first-use checklist
// read from real data (and saved marks), the test delivery a new company sends
// itself, the full export of a project, and deleting a project (only with its
// name typed, only by Owner/Admin, files removed, the audit line kept).
// Skipped without PAID_LOCAL_API — see docs/PAID_LOCAL.md.

import { beforeAll, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deliverFile, paidApi, type PaidResult } from './paid-client'

const API = process.env.PAID_LOCAL_API ?? ''
const run = Math.random().toString(36).slice(2, 8)
const SMALL = resolve('public/models/port-bcn/APBCN-URB-CER-Cerramiento_Horizontal_Tubular.ifc')
/** A brand-new company for every run, so the checklist starts empty. */
const ORG = `org_new${run}`
const as = (user: string, org = ORG) => vi.stubEnv('VITE_PAID_DEV_SESSION', `dev:${user}:${org}`)
const code = (r: PaidResult<unknown>) => (r.ok ? 'ok' : r.error.code)
const bytes = (salt: string) => { const b = Buffer.concat([readFileSync(SMALL), Buffer.from(`\n/* ${salt} */\n`)]); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }
const drain = () => execFileSync(process.execPath, ['scripts/local-runner/dist/runner.mjs', '--drain'], { env: { ...process.env, IFC_API_URL: API }, stdio: 'pipe', timeout: 180_000 })

describe.skipIf(!API)('paid workspace on the local backend (part 8)', { timeout: 300_000 }, () => {
  beforeAll(() => {
    vi.stubEnv('VITE_API_URL', API)
    // A fresh company with an owner and an editor (docker only; the same SQL the seed uses).
    const sql = `INSERT INTO organizations (id, name, plan, plan_status, seats, status, updated_at) VALUES ('${ORG}', 'New ${run}', 'enterprise', 'active', 10, 'active', now()) ON CONFLICT DO NOTHING;
      INSERT INTO users (id, updated_at) VALUES ('user_new${run}o', now()), ('user_new${run}e', now()) ON CONFLICT DO NOTHING;
      INSERT INTO org_members (org_id, user_id, role) VALUES ('${ORG}', 'user_new${run}o', 'owner'), ('${ORG}', 'user_new${run}e', 'editor') ON CONFLICT DO NOTHING;`
    execFileSync('docker', ['exec', process.env.PAID_LOCAL_DB_CONTAINER ?? 'ifc-cloud-api-db-1', 'psql', '-U', 'ifc', '-d', 'ifc_real', '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql])
  })

  it('the checklist starts empty and fills from real data, one step at a time', async () => {
    as(`user_new${run}o`)
    let o = await paidApi.onboarding()
    if (!o.ok) throw new Error(o.error.code)
    expect(o.value).toMatchObject({ done: 0, total: 5, dismissed: false })
    expect(o.value.steps.map((s) => s.key)).toEqual(['project', 'requirements', 'suppliers', 'connect', 'first_delivery'])

    const set = await paidApi.createRequirementSet(`Obra ${run}`, 50, JSON.stringify({ project: 'NEW', profile: 'EIR Residencial (company)', profile_version: 5 }))
    if (!set.ok) throw new Error(set.error.code)
    o = await paidApi.onboarding()
    expect(o.ok && o.value.steps.filter((s) => s.done).map((s) => s.key)).toEqual(['project', 'requirements'])

    // "Connect" can be ticked by hand (a folder is set up outside); "suppliers" cannot.
    expect(code(await paidApi.markOnboarding('suppliers', true))).toBe('invalid_payload')
    expect(code(await paidApi.markOnboarding('connect', true))).toBe('ok')
    // An editor can tick, a guest-like viewer could not (reception.manage); the mark is saved for everyone.
    as(`user_new${run}e`)
    o = await paidApi.onboarding()
    expect(o.ok && o.value.steps.find((s) => s.key === 'connect')).toMatchObject({ done: true, by: 'mark' })

    // The test delivery: a "Test supplier" delivers a real sample with a valid ISO name.
    as(`user_new${run}o`)
    const sup = await paidApi.createSupplier('Test supplier', 'TEST')
    if (!sup.ok) throw new Error(sup.error.code)
    const d = await deliverFile(sup.value.token, set.value.requirement_set.slug, 'NEW-TESTSU-ZZ-XX-M3-A-0001-S2-P01.ifc', bytes(`t-${run}`), 'page')
    expect(code(d)).toBe('ok')
    drain()
    o = await paidApi.onboarding()
    expect(o.ok && o.value).toMatchObject({ done: 5, total: 5 })

    // Hide and show again; saved on the server.
    expect(code(await paidApi.dismissOnboarding(true))).toBe('ok')
    expect((await paidApi.onboarding()).ok && (await paidApi.onboarding() as { ok: true; value: { dismissed: boolean } }).value.dismissed).toBe(true)
    await paidApi.dismissOnboarding(false)
  })

  it('export: everything of one project, both verdicts apart, the register and the issues; recorded in the audit log', async () => {
    as(`user_new${run}o`)
    const sets = await paidApi.requirementSets()
    const set = sets.ok ? sets.value.requirement_sets.find((s) => s.name === `Obra ${run}`) : undefined
    if (!set) throw new Error('no set')
    const del = await paidApi.deliveries({ requirementSet: set.id })
    const d0 = del.ok ? del.value.deliveries[0] : undefined
    if (!d0) throw new Error('no delivery')
    await paidApi.decide(d0.id, 'rejected', 'Export test')
    await paidApi.createIssue({ title: `Export issue ${run}` })
    const x = await paidApi.exportProject(set.id)
    if (!x.ok) throw new Error(x.error.code)
    expect(x.value.format).toBe('ifcviewer.project-export/1')
    expect(x.value.project).toMatchObject({ id: set.id, name: `Obra ${run}`, min_score: 50 })
    expect(x.value.suppliers.map((s) => s.name)).toEqual(['Test supplier'])
    expect(x.value.deliveries[0]).toMatchObject({ id: d0.id, file_status: 'ok', source: 'page', auto: { verdict: 'accepted' }, review: { verdict: 'rejected', reason: 'Export test' } })
    expect(x.value.register.some((r) => r.type === 'delivery_decided')).toBe(true)
    const audit = await paidApi.audit()
    expect(audit.ok && audit.value.events.some((e) => e.type === 'project_exported')).toBe(true)
    // Another company cannot export it.
    as('user_rivalowner', 'org_localrival')
    expect(code(await paidApi.exportProject(set.id))).toBe('not_found')
  })

  it('delete: Owner/Admin only, only with the project name typed, files gone, the audit line kept', async () => {
    as(`user_new${run}o`)
    const sets = await paidApi.requirementSets()
    const set = sets.ok ? sets.value.requirement_sets.find((s) => s.name === `Obra ${run}`) : undefined
    if (!set) throw new Error('no set')
    as(`user_new${run}e`)
    expect(code(await paidApi.deleteProject(set.id, `Obra ${run}`))).toBe('forbidden')
    as('user_rivalowner', 'org_localrival')
    expect(code(await paidApi.deleteProject(set.id, `Obra ${run}`))).toBe('not_found')
    as(`user_new${run}o`)
    expect(code(await paidApi.deleteProject(set.id, 'obra'))).toBe('confirmation_required')
    expect((await paidApi.requirementSets()).ok).toBe(true)
    const r = await paidApi.deleteProject(set.id, `Obra ${run}`)
    if (!r.ok) throw new Error(r.error.code)
    expect(r.value).toMatchObject({ project: `Obra ${run}`, deliveries: 1, files_deleted: 1, files_left: 0 })
    const after = await paidApi.requirementSets()
    expect(after.ok && after.value.requirement_sets.some((s) => s.id === set.id)).toBe(false)
    expect((await paidApi.deliveries({ requirementSet: set.id })).ok && ((await paidApi.deliveries({ requirementSet: set.id })) as { ok: true; value: { deliveries: unknown[] } }).value.deliveries).toEqual([])
    const audit = await paidApi.audit()
    expect(audit.ok && audit.value.events.find((e) => e.type === 'project_deleted')).toMatchObject({ details: { name: `Obra ${run}`, deliveries: 1 } })
    // The checklist reflects it: no project any more.
    const o = await paidApi.onboarding()
    expect(o.ok && o.value.steps[0]).toMatchObject({ key: 'project', done: false })
  })
})
