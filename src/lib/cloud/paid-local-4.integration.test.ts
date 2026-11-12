// @vitest-environment node
// ─── Paid workspace against the LOCAL backend, part 4 ────────────────────────
// The screens that moved to server data in the fourth batch: Reception tabs
// (projects, suppliers, register with real file hashes, project edits), Team
// clash statuses shared between two people, issues from a clash, and the
// certificate logo — each with its role checks. Skipped without PAID_LOCAL_API.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { deliverFile, paidApi, getPaidToken, paidApiBase, type PaidResult } from './paid-client'
import { cloudSync } from '../clash/sync'
import { deliveryFromApi, projectsFromApi, suppliersFromApi } from '../../components/workspace/sections/reception/live'
import { buildChain, draftsFrom } from '../../components/workspace/sections/reception/register'

const API = process.env.PAID_LOCAL_API ?? ''
const ORG = 'org_localdemo'
const run = Math.random().toString(36).slice(2, 8)
type Role = 'owner' | 'admin' | 'editor' | 'reviewer' | 'viewer' | 'guest'
const as = (role: Role) => vi.stubEnv('VITE_PAID_DEV_SESSION', `dev:user_local${role}:${ORG}`)
const code = (r: PaidResult<unknown>) => (r.ok ? 'ok' : r.error.code)
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

describe.skipIf(!API)('paid workspace on the local backend (part 4)', () => {
  let setId = ''
  let deliveryId = ''
  let fileHash = ''

  beforeAll(async () => {
    vi.stubEnv('VITE_API_URL', API)
    as('owner')
    const set = await paidApi.createRequirementSet(`Tabs ${run}`, 60, JSON.stringify({ project: 'TAB', due_day: 2, due_hour: 10, profile: 'EIR', profile_version: 1 }))
    const sup = await paidApi.createSupplier(`Tabs supplier ${run}`, 'MEP')
    if (!set.ok || !sup.ok) throw new Error('setup failed')
    setId = set.value.requirement_set.id
    const bytes = new TextEncoder().encode(`ISO-10303-21;\nFILE_SCHEMA(('IFC4'));\n/* tabs ${run} */`)
    const d = await deliverFile(sup.value.token, set.value.requirement_set.slug, `TAB-${run}.ifc`, bytes.buffer as ArrayBuffer)
    if (!d.ok) throw new Error('delivery failed')
    deliveryId = d.value.deliveryId; fileHash = d.value.fileHash
    await paidApi.decide(deliveryId, 'rejected', 'Wrong origin')
  })
  afterEach(() => { as('owner') })

  it('Reception tabs read projects, suppliers and the register from the server', async () => {
    const [sets, sups, dels] = await Promise.all([paidApi.requirementSets(), paidApi.suppliers(), paidApi.deliveries()])
    if (!sets.ok || !sups.ok || !dels.ok) throw new Error('load failed')
    const projects = projectsFromApi(sets.value.requirement_sets)
    const p = projects.find((x) => x.id === setId)
    expect(p).toMatchObject({ code: 'TAB', dueDay: 2, dueHour: 10, minScore: 60 })
    const suppliers = suppliersFromApi(sups.value.suppliers, dels.value.deliveries, projects)
    const mine = suppliers.find((s) => s.name === `Tabs supplier ${run}`)
    expect(mine?.projectId).toBe(setId)
    const deliveries = dels.value.deliveries.map(deliveryFromApi).filter((d) => d.projectId === setId)
    expect(deliveries[0]).toMatchObject({ id: deliveryId, verdict: 'returned', fileHash })
    // The register: invited → received (real SHA-256) → returned, hash-chained.
    const chain = await buildChain(await draftsFrom(suppliers.filter((s) => s.projectId === setId), deliveries))
    expect(chain.find((e) => e.event === 'received')?.fileHash).toBe(fileHash)
    expect(chain.find((e) => e.event === 'returned')?.detail).toContain('Wrong origin')
    for (let i = 1; i < chain.length; i++) expect(chain[i].prevHash).toBe(chain[i - 1].hash)
  })

  it('project edits save on the server; only roles that manage Reception may edit', async () => {
    const r = await paidApi.updateRequirementSet(setId, { name: `Tabs ${run} (edited)`, min_score: 75 })
    expect(r.ok && r.value.requirement_set.min_score).toBe(75)
    for (const role of ['reviewer', 'viewer', 'guest'] as Role[]) {
      as(role)
      expect(code(await paidApi.updateRequirementSet(setId, { min_score: 10 })), role).toBe('forbidden')
    }
    as('editor')
    expect(code(await paidApi.updateRequirementSet(setId, { min_score: 80 }))).toBe('ok')
  })

  it('clash statuses are shared in the Team workspace; a later decision wins, viewers only read', async () => {
    const sync = () => cloudSync({ baseUrl: paidApiBase(), getToken: getPaidToken })
    const project = `Clash ${run}`
    const key = `t1|GUID-A-${run}|GUID-B-${run}`
    as('editor')
    await sync().save(project, { [key]: { status: 'active', assignee: 'Marc', updatedAt: '2026-11-12T10:00:00.000Z' } as never })
    as('admin')
    expect((await sync().load(project))[key]).toMatchObject({ status: 'active', assignee: 'Marc' })
    await sync().save(project, { [key]: { status: 'resolved', updatedAt: '2026-11-12T11:00:00.000Z' } as never })
    // An older copy arriving late never overwrites the newer decision.
    as('editor')
    await sync().save(project, { [key]: { status: 'new', updatedAt: '2026-11-12T09:00:00.000Z' } as never })
    expect((await sync().load(project))[key]).toMatchObject({ status: 'resolved' })
    as('viewer')
    await expect(sync().save(project, { [key]: { status: 'approved', updatedAt: '2026-11-12T12:00:00.000Z' } as never })).rejects.toThrow()
    expect((await sync().load(project))[key]).toMatchObject({ status: 'resolved' })
  })

  it('an issue from a clash carries both GlobalIds; reviewers may raise it, viewers may not', async () => {
    as('reviewer')
    const i = await paidApi.createIssue({ title: `Duct × beam ${run}`, element_guids: ['2O2Fr$t4X7Zf8NOew3FLOH', '1hOSvn6df7F8_7GcBWlRGQ'], priority: 'high' })
    expect(i.ok && i.value.issue.element_guids).toHaveLength(2)
    as('viewer')
    expect(code(await paidApi.createIssue({ title: `Nope ${run}` }))).toBe('forbidden')
  })

  it('certificate logo: admins set and remove it, guests and editors cannot touch it', async () => {
    as('admin')
    expect((await paidApi.setBranding(LOGO)).ok).toBe(true)
    for (const role of ['editor', 'guest'] as Role[]) {
      as(role)
      expect(code(await paidApi.clearBranding()), role).toBe('forbidden')
      expect(code(await paidApi.setBranding(LOGO)), role).toBe('forbidden')
    }
    as('owner')
    const b = await paidApi.branding()
    expect(b.ok && b.value.logo).toBe(LOGO)
    expect((await paidApi.clearBranding()).ok).toBe(true)
    const after = await paidApi.branding()
    expect(after.ok && after.value.logo).toBeNull()
  })
})
