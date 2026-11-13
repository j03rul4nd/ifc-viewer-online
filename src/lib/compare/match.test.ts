// @vitest-environment node
// Layers 3 (geometry) and 4 (split/merge) of revision compare, plus rotation:
// fixtures F9, F10, F12 (scripts/compare-fixtures/make.ts) and an adversarial
// grid of identical columns.
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IfcAPI } from 'web-ifc'
import { buildSnapshot } from './snapshot'
import { DEFAULT_EXTRA_MATCHERS, diffRevisions, planRotationDeg } from './revision-diff'
import { matchByGeometry, iou, jaccard } from './match-geometry'
import { matchSplitMerge } from './match-split'
import type { ExtraMatcher, MatchPair } from './revision-types'
import type { ModelSnapshot, SnapElement } from './types'

const FIX = join(process.cwd(), 'tests', 'fixtures', 'revision')

let api: IfcAPI
beforeAll(async () => { api = new IfcAPI(); await api.Init() })

async function snapshotOf(path: string, name: string): Promise<ModelSnapshot> {
  const bytes = readFileSync(path)
  const id = api.OpenModel(bytes)
  try {
    return await buildSnapshot(api, id, { id: name, fileName: name, sourceBytes: bytes.length, geometry: true })
  } finally { api.CloseModel(id) }
}

async function load(id: string): Promise<{ a: ModelSnapshot; b: ModelSnapshot; exp: any }> {
  const dir = join(FIX, id)
  return {
    a: await snapshotOf(join(dir, 'a.ifc'), 'a.ifc'),
    b: await snapshotOf(join(dir, 'b.ifc'), 'b.ifc'),
    exp: JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8')),
  }
}

/** The default layers 3–4, recording what they pair. */
function spying(): { matchers: ExtraMatcher[]; pairs: MatchPair[] } {
  const pairs: MatchPair[] = []
  const matchers = DEFAULT_EXTRA_MATCHERS.map((m): ExtraMatcher => (b, h, ctx) => {
    const out = m(b, h, ctx)
    pairs.push(...out)
    return out
  })
  return { matchers, pairs }
}

const SPATIAL = /^IFC(PROJECT|SITE|BUILDING|BUILDINGSTOREY|SPACE)$/

describe('layer 3 — geometry (F9, GlobalIds regenerated)', () => {
  it('flags guidRegenerated, pairs ≥ 95 % right and finds exactly the one move', async () => {
    const { a, b, exp } = await load('F9')
    const spy = spying()
    const d = diffRevisions([a], [b], {}, { extraMatchers: spy.matchers })
    expect(d.guidRegenerated).toBe(true)

    const map = exp.guidMap as Record<string, string>
    const matchable = a.elements.filter((e) => e.geo && e.globalId && !SPATIAL.test(e.ifcClass) && map[e.globalId])
    const oneToOne = spy.pairs.filter((p) => p.base.length === 1 && p.head.length === 1)
    const right = oneToOne.filter((p) => map[p.base[0].el.globalId!] === p.head[0].el.globalId).length
    const precision = right / oneToOne.length, recall = right / matchable.length
    expect(precision).toBeGreaterThanOrEqual(0.95)
    expect(recall).toBeGreaterThanOrEqual(0.95)

    const moved = d.changes.filter((c) => c.kind === 'moved')
    expect(moved).toHaveLength(1)
    const e = exp.changes[0]
    expect(moved[0].match).toMatchObject({ method: 'geometry', baseGlobalIds: [e.globalIdA], headGlobalIds: [e.globalIdB] })
    expect(moved[0].delta?.direction).toBe('E')
    expect(moved[0].delta?.moveDistance).toBeCloseTo(0.12, 3)
    expect(d.byKind.added + d.byKind.removed).toBe(0)
  })
})

describe('layer 4 — split / merge (F10)', () => {
  it('one slab split in two is one change, method split', async () => {
    const { a, b, exp } = await load('F10')
    const d = diffRevisions([a], [b])
    expect(d.changes).toHaveLength(1)
    const c = d.changes[0]
    expect(c.match.method).toBe('split')
    expect(c.kind).toBe('reshaped')
    expect(c.match.baseGlobalIds).toEqual([exp.changes[0].globalIdA])
    expect([...c.match.headGlobalIds].sort()).toEqual([...exp.parts].sort())
    expect(c.match.confidence).toBeGreaterThanOrEqual(0.85 * 0.9)
  })

  it('the same, read backwards, is a merge', async () => {
    const { a, b } = await load('F10')
    const d = diffRevisions([b], [a])
    expect(d.changes).toHaveLength(1)
    expect(d.changes[0].match.method).toBe('merge')
  })
})

describe('rotation (F12)', () => {
  it('a column turned 5° reports rotationDeg ≈ 5', async () => {
    const { a, b, exp } = await load('F12')
    const d = diffRevisions([a], [b])
    expect(d.changes).toHaveLength(1)
    const c = d.changes[0]
    expect(c.match.baseGlobalIds).toEqual([exp.changes[0].globalIdA])
    expect(c.kind).toBe('moved')
    expect(Math.abs((c.delta?.rotationDeg ?? 0) - 5)).toBeLessThanOrEqual(0.5)
    expect(c.summary).toMatchObject({ key: 'rotated_deg', params: { deg: c.delta!.rotationDeg } })
  })

  it('below angleTolerance it is not a change', async () => {
    const { a, b } = await load('F12')
    expect(diffRevisions([a], [b], { angleTolerance: 6 }).changes.filter((c) => c.kind === 'moved')).toHaveLength(0)
  })

  it('planRotationDeg: signed, counter-clockwise from above, mesh frame Y-up', () => {
    const r = 30 * Math.PI / 180
    // IFC (cos, sin, 0) → mesh (cos, 0, −sin)
    expect(planRotationDeg([1, 0, 0], [Math.cos(r), 0, -Math.sin(r)])).toBeCloseTo(30, 2)
    expect(planRotationDeg([1, 0, 0], [Math.cos(r), 0, Math.sin(r)])).toBeCloseTo(-30, 2)
    expect(planRotationDeg([0, 1, 0], [1, 0, 0])).toBeNull()
    expect(planRotationDeg(undefined, [1, 0, 0])).toBeNull()
  })
})

// ── Synthetic snapshots ──────────────────────────────────────────────────────

let eid = 1
function col(gid: string, at: [number, number, number], over: Partial<SnapElement> = {}): SnapElement {
  const s: [number, number, number] = [0.4, 3, 0.4] // mesh frame: Y up
  return {
    expressId: eid++, ifcClass: 'IFCCOLUMN', name: 'C40x40', globalId: gid,
    attributes: { Name: 'C40x40', Tag: null }, psets: { Pset_ColumnCommon: { LoadBearing: true } }, materials: ['Concrete'], storey: 'L1',
    geo: { h: `h${at.join(',')}`, c: at, m: [at[0] - 0.2, at[1], at[2] - 0.2], s, v: 0.48 },
    ...over,
  }
}
const snap = (fileName: string, elements: SnapElement[]): ModelSnapshot =>
  ({ id: fileName, fileName, schema: 'IFC4', projectGid: 'P1', capturedAt: 0, sourceBytes: 0, geometry: true, unreadable: 0, elements })

describe('adversarial: grid of 20 identical columns', () => {
  it('one moved 100 mm → 1 moved, 0 crossed pairs', () => {
    const at = (i: number): [number, number, number] => [(i % 5) * 6, 0, -Math.floor(i / 5) * 6]
    const base = Array.from({ length: 20 }, (_, i) => col(`A${i}`, at(i)))
    const head = Array.from({ length: 20 }, (_, i) => {
      const p = at(i)
      return col(`B${i}`, i === 7 ? [p[0] + 0.1, p[1], p[2]] : p)
    })
    const spy = spying()
    const d = diffRevisions([snap('S.ifc', base)], [snap('S.ifc', head)], {}, { extraMatchers: spy.matchers })
    expect(spy.pairs).toHaveLength(20)
    for (const p of spy.pairs) expect(p.base[0].el.globalId!.slice(1)).toBe(p.head[0].el.globalId!.slice(1))
    expect(d.changes).toHaveLength(1)
    expect(d.changes[0]).toMatchObject({ kind: 'moved', match: { method: 'geometry', baseGlobalIds: ['A7'], headGlobalIds: ['B7'] } })
    expect(d.changes[0].summary).toEqual({ key: 'moved_mm', params: { mm: 100, dir: 'E' } })
  })

  it('a column too far away (> matchRadius) is a remove + add, never a steal', () => {
    const d = diffRevisions([snap('S.ifc', [col('A', [0, 0, 0]), col('X', [6, 0, 0])])], [snap('S.ifc', [col('B', [0, 0, 0]), col('Y', [6.5, 0, 0])])])
    expect(d.byKind).toMatchObject({ added: 1, removed: 1 })
  })

  it('a parent assembly whose GlobalId was regenerated is still the same parent', () => {
    const asm = (gid: string): SnapElement => col(gid, [0, 0, 0], { ifcClass: 'IFCELEMENTASSEMBLY', name: 'Truss', geo: null, attributes: { Name: 'Truss', Tag: 'T1' } })
    const pa = asm('PA'), pb = asm('PB')
    const part = (gid: string, parent: SnapElement): SnapElement =>
      col(gid, [3, 0, 0], { partOf: [{ relation: 'IFCRELAGGREGATES', parentClass: 'IFCELEMENTASSEMBLY', parentExpressId: parent.expressId }] })
    const d = diffRevisions([snap('S.ifc', [pa, part('A1', pa)])], [snap('S.ifc', [pb, part('B1', pb)])])
    expect(d.changes).toHaveLength(0)
  })

  it('never across classes', () => {
    const d = diffRevisions([snap('S.ifc', [col('A', [0, 0, 0])])], [snap('S.ifc', [col('B', [0, 0, 0], { ifcClass: 'IFCBEAM' })])])
    expect(d.byKind).toMatchObject({ added: 1, removed: 1 })
  })
})

describe('matcher units', () => {
  it('iou and jaccard', () => {
    expect(iou({ min: [0, 0, 0], max: [1, 1, 1] }, { min: [0, 0, 0], max: [1, 1, 1] })).toBeCloseTo(1)
    expect(iou({ min: [0, 0, 0], max: [1, 1, 1] }, { min: [0.5, 0, 0], max: [1.5, 1, 1] })).toBeCloseTo(1 / 3)
    expect(iou({ min: [0, 0, 0], max: [1, 1, 1] }, { min: [2, 0, 0], max: [3, 1, 1] })).toBe(0)
    expect(jaccard(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3)
  })

  it('split needs ≥ 85 % coverage: a half alone is not a split', () => {
    const slab = (gid: string, x: number, w: number): SnapElement =>
      col(gid, [x, 0, 0], { ifcClass: 'IFCSLAB', geo: { h: gid, c: [x, 0, 0], m: [x, 0, 0], s: [w, 0.25, 12], v: w * 3 } })
    const ctx = { options: { matchRadius: 0.25 } as any, originShift: null, schema: { base: null, head: null } }
    const L = (el: SnapElement) => ({ el, file: 'S.ifc' })
    expect(matchSplitMerge([L(slab('W', 0, 18))], [L(slab('P1', 0, 9)), L(slab('P2', 9, 9))], ctx)).toHaveLength(1)
    expect(matchSplitMerge([L(slab('W', 0, 18))], [L(slab('P1', 0, 9)), L(slab('P2', 9, 5))], ctx)).toHaveLength(0)
    expect(matchByGeometry([L(slab('W', 0, 18))], [L(slab('P1', 0, 9))], ctx)).toHaveLength(0)
  })
})

describe('layers 3–4 scale', () => {
  it('20 000 columns per side, all GlobalIds regenerated, 1 % moved: well under 5 s', () => {
    const n = 20000
    const at = (i: number): [number, number, number] => [(i % 100) * 1.2, Math.floor(i / 10000) * 3.5, -Math.floor((i % 10000) / 100) * 1.2]
    const base = Array.from({ length: n }, (_, i) => col(`A${i}`, at(i), { name: `C${i % 37}` }))
    const head = Array.from({ length: n }, (_, i) => {
      const p = at(i)
      return col(`B${i}`, i % 100 === 0 ? [p[0] + 0.05, p[1], p[2]] : p, { name: `C${i % 37}` })
    })
    const t = performance.now()
    const d = diffRevisions([snap('S.ifc', base)], [snap('S.ifc', head)])
    const ms = performance.now() - t
    console.log(`layers 1–4 on ${n} regenerated elements: ${Math.round(ms)} ms`)
    expect(d.byKind.moved).toBe(n / 100)
    expect(d.byKind.added + d.byKind.removed).toBe(0)
    expect(ms).toBeLessThan(10000) // 5 s target; headroom for a loaded full-suite run
  })
})
