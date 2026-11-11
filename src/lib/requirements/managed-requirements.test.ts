import { describe, it, expect, vi } from 'vitest'
import { publicFetcher, resolveManagedRequirements, type PublicRequirements } from './managed-requirements'
import { buildRequirementsUrl, decodeRequirements, evaluateRequirements, requirementsFromHash, sanitizeRequirements, REQUIREMENTS_LINK_VERSION, type RequirementsPayload } from './requirements-link'
import { checkNaming, isoPreset } from './iso-naming'

const ID = '0f9c2a3e-1b2c-4d5e-8f90-123456789abc'
const V1: RequirementsPayload = { v: REQUIREMENTS_LINK_VERSION, t: 'Structural model', s: 70, pr: { id: ID, v: 1, nm: 'Hospital EIR' } }
const V2_CONTENT = JSON.stringify({ v: 1, t: 'Structural model', s: 80, n: isoPreset(['P', 'O', 'V', 'L', 'T', 'R', 'N']) })

const remote = (over: Partial<PublicRequirements> = {}): PublicRequirements => ({
  id: ID, name: 'Hospital EIR', version: 2, latest: 2, note: 'Score 80 and ISO naming', content: V2_CONTENT, published_at: '2026-11-11T10:00:00Z', ...over,
})

describe('managed requirements link (B2)', () => {
  it('a link without a profile is left alone', async () => {
    const plain = { v: 1, t: 'x', s: 50 }
    expect(await resolveManagedRequirements(plain, async () => remote())).toEqual({ req: plain, version: null })
  })

  it('a v1 link is checked against the current v2 and says so', async () => {
    const r = await resolveManagedRequirements(V1, async () => remote())
    expect(r.req.s).toBe(80)
    expect(r.req.n?.f).toHaveLength(7)
    expect(r.req.pr).toEqual({ id: ID, v: 2, nm: 'Hospital EIR' })
    expect(r.version).toEqual({ linked: 1, checked: 2, name: 'Hospital EIR', note: 'Score 80 and ISO naming', live: true })
  })

  it('the v1 link still works when the service is off, down or returns garbage', async () => {
    const snap = { req: V1, version: { linked: 1, checked: 1, name: 'Hospital EIR', live: false } }
    expect(await resolveManagedRequirements(V1, null)).toEqual(snap)
    expect(await resolveManagedRequirements(V1, async () => null)).toEqual(snap)
    expect(await resolveManagedRequirements(V1, async () => { throw new Error('down') })).toEqual(snap)
    expect(await resolveManagedRequirements(V1, async () => remote({ content: 'not json' }))).toEqual(snap)
    expect(await resolveManagedRequirements(V1, async () => remote({ content: '{"v":1,"t":"x"}' }))).toEqual(snap)
    expect(await resolveManagedRequirements(V1, async () => remote({ version: 0 }))).toEqual(snap)
  })

  it('the profile reference survives the link codec; a bad one is dropped', async () => {
    const r = await buildRequirementsUrl('https://example.com/app', V1)
    if (!r.ok) throw new Error('no url')
    const back = await decodeRequirements(requirementsFromHash(new URL(r.url).hash) ?? '')
    expect(back).toEqual(V1)
    expect(sanitizeRequirements({ ...V1, pr: { id: 'nope', v: 1 } })?.pr).toBeUndefined()
    expect(sanitizeRequirements({ ...V1, pr: { id: ID, v: 0 } })?.pr).toBeUndefined()
  })

  it('publicFetcher calls the public endpoint without a token and fails soft', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(remote()), { status: 200 }))
    const got = await publicFetcher('https://api.example.com/', fetchImpl as unknown as typeof fetch)(ID)
    expect(got?.version).toBe(2)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.example.com/requirements/${ID}`)
    expect((init.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined()
    expect(await publicFetcher('https://x', async () => new Response('', { status: 404 }))(ID)).toBeNull()
    expect(await publicFetcher('', fetchImpl as unknown as typeof fetch)(ID)).toBeNull()
  })
})

describe('naming in the requirements verdict (N1)', () => {
  const rule = isoPreset(['Project', 'Originator', 'Volume', 'Level', 'Type', 'Role', 'Number'])
  const req = { n: rule }

  it('a naming-only link is a valid requirement', () => {
    expect(sanitizeRequirements({ v: 1, t: 'Delivery', n: rule })?.n).toEqual(rule)
  })

  it('pending without a model, pass / fail with one', () => {
    expect(evaluateRequirements(req, { score: null, ids: null }).state).toBe('pending')
    const good = checkNaming(rule, 'HUCA-CPZ-ZZ-00-M3-A-0001-S2-P01.ifc')
    expect(evaluateRequirements(req, { score: null, ids: null, naming: good }).state).toBe('pass')
    const bad = checkNaming(rule, 'modelo final.ifc')
    const v = evaluateRequirements({ ...req, s: 50 }, { score: 90, ids: null, naming: bad })
    expect(v.state).toBe('fail')
    expect(v.naming?.state).toBe('fail')
    expect(v.score?.state).toBe('pass')
  })
})
