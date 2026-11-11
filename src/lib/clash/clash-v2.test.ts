import { describe, it, expect } from 'vitest'
import { applySuppression, SUPPRESS_PRESETS, ruleMatches, type SuppressRule } from './suppress'
import { estimateCost, sortByCost, classWeight } from './cost'
import { templateMatrix, TEMPLATE_IDS } from './templates'
import { trendPoint, pushTrend, trendPolyline, trendSvg, MAX_POINTS, type TrendPoint } from './trend'
import { cloudSync, mergeRecords, changedKeys, projectKey } from './sync'
import { groupClashes, type ClashElement, type ClashRecord, type ClashResult } from './model'
import { coordinationReportHtml } from './export'

const el = (over: Partial<ClashElement> = {}): ClashElement => ({
  index: 0, modelId: 'm', fileName: 'f.ifc', discipline: 'A', localId: 1, category: 'IFCWALL', storey: 'L1', system: '—', guid: 'g', ...over,
})
let n = 0
const clash = (a: Partial<ClashElement>, b: Partial<ClashElement>, o: Partial<ClashResult> = {}): ClashResult => {
  n++
  return { key: `k${n}`, test: 't', kind: 'hard', a: el({ localId: n * 2, ...a }), b: el({ localId: n * 2 + 1, ...b }), distance: 0, depth: 0.1, point: [0, 0, 0], ...o }
}
const rec = (status: ClashRecord['status'], updatedAt?: string): ClashRecord => ({ status, firstSeen: '', lastSeen: '', updatedAt })

describe('suppression', () => {
  const rules = SUPPRESS_PRESETS.map((r) => ({ ...r, enabled: true }))
  it('insulation against wall is hidden in either order; pipe against beam is not', () => {
    const ins = clash({ category: 'IFCCOVERING', name: 'Insulation 60 mm' }, { category: 'IFCWALL' })
    const rev = clash({ category: 'IFCWALL' }, { category: 'IFCCOVERING', name: 'Aislamiento' })
    const pipe = clash({ category: 'IFCPIPESEGMENT', name: 'DN100' }, { category: 'IFCBEAM' }, { depth: 0.2 })
    const r = applySuppression([ins, rev, pipe], rules.filter((x) => x.preset === 'insulation_wall'))
    expect(r.shown).toEqual([pipe])
    expect(r.suppressed).toBe(2)
  })
  it('facade frame only inside one model; same class; small overlap', () => {
    const fac = SUPPRESS_PRESETS.find((r) => r.preset === 'facade_frame')!
    expect(ruleMatches(fac, clash({ category: 'IFCCURTAINWALL' }, { category: 'IFCMEMBER' }))).toBe(true)
    expect(ruleMatches(fac, clash({ category: 'IFCCURTAINWALL' }, { category: 'IFCMEMBER', modelId: 'x' }))).toBe(false)
    const same = { ...SUPPRESS_PRESETS.find((r) => r.preset === 'same_class')!, enabled: true }
    expect(ruleMatches(same, clash({ category: 'IFCMEMBER' }, { category: 'IFCMEMBER' }))).toBe(true)
    expect(ruleMatches(same, clash({ category: 'IFCMEMBER' }, { category: 'IFCBEAM' }))).toBe(false)
    const small = { ...SUPPRESS_PRESETS.find((r) => r.preset === 'small_overlap')!, enabled: true }
    expect(ruleMatches(small, clash({}, {}, { depth: 0.015 }))).toBe(true)
    expect(ruleMatches(small, clash({}, {}, { depth: 0.05 }))).toBe(false)
  })
  it('disabled rules hide nothing; custom name rules work', () => {
    const custom: SuppressRule = { id: 'c', name: 'x', a: { classes: [], names: ['temporal'] }, b: { classes: ['IFCSLAB'], names: [] }, sameModelOnly: false, maxDepth: 0, enabled: true }
    const c = clash({ name: 'Puntal TEMPORAL' }, { category: 'IFCSLAB' })
    expect(applySuppression([c], [{ ...custom, enabled: false }]).shown).toHaveLength(1)
    expect(applySuppression([c], [custom]).byRule).toEqual({ c: 1 })
  })
})

describe('estimated cost', () => {
  it('pipe through a beam costs more than a cable near a ceiling', () => {
    const pipeBeam = clash({ category: 'IFCPIPESEGMENT' }, { category: 'IFCBEAM' }, { depth: 0.2 })
    const cable = clash({ category: 'IFCCABLECARRIERSEGMENT' }, { category: 'IFCCOVERING' }, { kind: 'clearance', depth: 0, distance: 0.02 })
    expect(estimateCost(pipeBeam)).toBeGreaterThan(estimateCost(cable) * 5)
    expect(sortByCost([cable, pipeBeam])[0]).toBe(pipeBeam)
    expect(classWeight('IFCUNKNOWNTHING')).toBe(200)
    expect(estimateCost(cable) % 10).toBe(0)
  })
})

describe('templates', () => {
  it('only keep tests whose disciplines are loaded', () => {
    const office = templateMatrix('office', ['A', 'S', 'M'])
    expect(office.tests.map((t) => t.name)).toEqual(['S × MEP', 'Ducts × pipes', 'MEP ↔ ceiling 50 mm', 'A × S'])
    expect(office.tests[2].kind).toBe('clearance')
    expect(office.tests[2].tolerance).toBeCloseTo(0.05)
    expect(templateMatrix('hospital', ['A']).tests).toHaveLength(0)
    for (const id of TEMPLATE_IDS) expect(templateMatrix(id, ['A', 'S', 'M', 'E', 'P', 'C', 'X']).tests.length).toBeGreaterThan(0)
  })
})

describe('trend', () => {
  it('counts open/new/approved/resolved and caps history', () => {
    const a = clash({}, {}), b = clash({}, {}), c = clash({}, {})
    const recs = { [a.key]: rec('active'), [b.key]: rec('approved'), old: rec('resolved') }
    const p = trendPoint('t1', ['b.ifc', 'a.ifc'], [a, b, c], recs, 7)
    expect(p).toMatchObject({ open: 2, new: 1, approved: 1, resolved: 1, suppressed: 7, files: ['a.ifc', 'b.ifc'] })
    let h: TrendPoint[] = []
    for (let i = 0; i < MAX_POINTS + 5; i++) h = pushTrend(h, { ...p, at: String(i) })
    expect(h).toHaveLength(MAX_POINTS)
    expect(trendPolyline([{ ...p, open: 10, resolved: 0 }, { ...p, open: 0, resolved: 0 }], 100, 50)).toBe('0.0,0.0 100.0,50.0')
    expect(trendSvg(h)).toContain('<polyline')
  })
})

describe('sync', () => {
  it('merge is last-write-wins and changedKeys sends only differences', () => {
    const a = { k: rec('active', '2026-01-01') }
    const b = { k: rec('approved', '2026-02-01'), j: rec('new') }
    expect(mergeRecords(a, b).k.status).toBe('approved')
    expect(mergeRecords(b, a).k.status).toBe('approved')
    expect(Object.keys(changedKeys(a, { ...a, j: b.j }))).toEqual(['j'])
    expect(projectKey(['B.ifc', 'A.IFC'])).toBe('A+B')
  })
  it('cloud adapter calls the API with the token and chunks saves', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ records: { x: { status: 'new' } } }), { status: 200 })
    }) as unknown as typeof fetch
    const s = cloudSync({ baseUrl: 'https://api', getToken: async () => 'tok', fetchImpl })
    expect(Object.keys(await s.load('P 1'))).toEqual(['x'])
    expect(calls[0].url).toBe('https://api/clash/records?project=P%201')
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    const many = Object.fromEntries(Array.from({ length: 1200 }, (_, i) => [`k${i}`, rec('new')]))
    await s.save('P 1', many)
    expect(calls.filter((c) => c.init?.method === 'PUT')).toHaveLength(3)
    const noTok = cloudSync({ baseUrl: '', getToken: async () => null, fetchImpl })
    await expect(noTok.load('p')).rejects.toThrow()
  })
})

describe('scale', () => {
  it('groups 6,000 clashes by element in well under 100 ms', () => {
    const res: ClashResult[] = []
    for (let i = 0; i < 6000; i++) res.push(clash({ localId: i % 700, modelId: 'S' }, { localId: 10000 + i, modelId: 'M' }))
    const t0 = performance.now()
    const g = groupClashes(res, 'element')
    expect(performance.now() - t0).toBeLessThan(400) // was O(n²): seconds; generous under a loaded machine
    expect(g.reduce((a, x) => a + x.clashes.length, 0)).toBe(6000)
    expect(g).toHaveLength(700)
  })
})

describe('report v2', () => {
  it('includes trend, cost ranking marked as estimate, and images', () => {
    const r = clash({ name: 'Beam', guid: 'A' }, { name: 'Pipe', guid: 'B' })
    const p = trendPoint('t', [], [r], {}, 0)
    const html = coordinationReportHtml({ lang: 'es', project: 'P', results: [r], records: {}, testName: () => 'T', shots: { [r.key]: 'data:image/png;base64,AAA' }, trend: [p, { ...p, open: 0 }], suppressed: 3 })
    expect(html).toContain('<img src="data:image/png;base64,AAA"')
    expect(html).toContain('estimación')
    expect(html).toContain('3 ocultas por reglas')
    expect(html).toContain('<svg')
  })
})

describe('clash framing', () => {
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } })
  it('sizes on the small element, not on a 60 m slab, and aims at the clash', async () => {
    const { clashShot } = await import('./frame')
    const slab = box(0, 0, 0, 60, 0.3, 40)
    const pipe = box(10, -1, 10, 10.2, 1.5, 10.2)
    const s = clashShot([10.1, 0.15, 10.1], slab, pipe)
    const d = Math.hypot(s.position.x - 10.1, s.position.y - 0.15, s.position.z - 10.1)
    expect(d).toBeGreaterThan(2)
    expect(d).toBeLessThan(8)
    expect(s.position.y).toBeGreaterThan(0.15)
    expect(s.target).toEqual({ x: 10.1, y: 0.15, z: 10.1 })
  })
  it('looks across a long duct run, and never further than 18 m', async () => {
    const { clashShot } = await import('./frame')
    const duct = box(0, 3, 5, 40, 3.4, 5.4) // runs along X
    const s = clashShot([20, 3.2, 5.2], duct, null)
    expect(Math.abs(s.position.z - 5.2)).toBeGreaterThan(Math.abs(s.position.x - 20)) // camera off to the side (Z)
    const huge = clashShot([0, 0, 0], box(-500, -500, -500, 500, 500, 500), box(-400, -400, -400, 400, 400, 400))
    expect(Math.hypot(huge.position.x, huge.position.y, huge.position.z)).toBeLessThanOrEqual(18.001)
    expect(clashShot([1, 2, 3], null, null).target).toEqual({ x: 1, y: 2, z: 3 })
  })
})

describe('clash framing between two big elements', () => {
  it('frames the strip where a facade meets a slab, a few metres away', async () => {
    const { clashShot } = await import('./frame')
    const b = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } })
    const facade = b(0, 0, 0, 30, 40, 0.3)
    const slab = b(0, 12, -20, 30, 12.3, 0.2)
    const s = clashShot([15, 12.15, 0.1], facade, slab)
    const d = Math.hypot(s.position.x - 15, s.position.y - 12.15, s.position.z - 0.1)
    expect(d).toBeLessThan(8)
    expect(Math.abs(s.position.z - 0.1)).toBeGreaterThan(Math.abs(s.position.x - 15)) // looking at the facade, not along it
  })
})

describe('clash framing side', () => {
  it('stands outside the slab, on the facade side', async () => {
    const { clashShot } = await import('./frame')
    const b = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } })
    // Slab runs from the facade (z≈0) inwards to z = -20.
    const s = clashShot([15, 12.15, 0.1], b(0, 0, 0, 30, 40, 0.3), b(0, 12, -20, 30, 12.3, 0.2))
    expect(s.position.z).toBeGreaterThan(0.1)
  })
})
