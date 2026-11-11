import { describe, it, expect } from 'vitest'
import { triTriIntersect, triTriDistance, buildBvh, bvhIntersect, pointInside, type V3 } from './geometry'
import { runClashTests, broadPhase, elementBoxes } from './engine'
import { assemblyGroups, reconcile, groupClashes, defaultMatrix, parseMatrix, clashKey, selectIndexes, ANY, type ClashElement, type ClashResult, type ClashRecord } from './model'
import { clashesToBcfTopics, coordinationReportHtml } from './export'
import { clashText, CLASH_TEXTS } from './i18n'

/** Closed box as a triangle soup (12 triangles). */
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Float32Array {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [0, 4, 7], [0, 7, 3]]
  return Float32Array.from(f.flatMap((t) => t.flatMap((i) => v[i])))
}

function soup(...items: Float32Array[]) {
  const offsets = [0]
  let n = 0
  for (const it of items) { n += it.length; offsets.push(n) }
  const positions = new Float32Array(n)
  let o = 0
  for (const it of items) { positions.set(it, o); o += it.length }
  return { positions, offsets: Uint32Array.from(offsets) }
}

const el = (index: number, over: Partial<ClashElement> = {}): ClashElement => ({
  index, modelId: 'm', fileName: 'f.ifc', discipline: 'A', localId: index, category: 'IFCWALL', storey: 'L1', system: '—', guid: `g${index}`, ...over,
})

describe('triangle kernel', () => {
  const T1 = [0, 0, 0, 1, 0, 0, 0, 1, 0]
  it('crossing triangles intersect', () => {
    expect(triTriIntersect(T1, 0, [0.2, 0.2, -0.5, 0.2, 0.2, 0.5, 0.8, 0.2, 0], 0)).toBe(true)
  })
  it('separated triangles do not', () => {
    expect(triTriIntersect(T1, 0, [0, 0, 1, 1, 0, 1, 0, 1, 1], 0)).toBe(false)
  })
  it('touching (coplanar, shared edge) is not a clash', () => {
    expect(triTriIntersect(T1, 0, [1, 0, 0, 0, 1, 0, 1, 1, 0], 0)).toBe(false)
  })
  it('distance between parallel triangles', () => {
    const mid: V3 = [0, 0, 0]
    expect(triTriDistance(T1, 0, [0, 0, 0.3, 1, 0, 0.3, 0, 1, 0.3], 0, mid)).toBeCloseTo(0.3, 5)
    expect(mid[2]).toBeCloseTo(0.15, 5)
  })
  it('point inside a closed box', () => {
    const b = buildBvh(box(0, 0, 0, 1, 1, 1))
    expect(pointInside(b, 0.5, 0.5, 0.5)).toBe(true)
    expect(pointInside(b, 1.5, 0.5, 0.5)).toBe(false)
  })
  it('boxes overlapping intersect, stacked boxes do not', () => {
    const a = buildBvh(box(0, 0, 0, 1, 1, 1))
    expect(bvhIntersect(a, buildBvh(box(0.5, 0.5, 0.5, 2, 2, 2)))).not.toBeNull()
    expect(bvhIntersect(a, buildBvh(box(0, 1, 0, 1, 2, 1)))).toBeNull() // wall on slab
  })
})

describe('engine', () => {
  it('finds hard, contained and clearance clashes and skips touching', () => {
    const { positions, offsets } = soup(
      box(0, 0, 0, 10, 0.3, 10),      // 0 slab
      box(2, -1, 2, 2.2, 1, 2.2),     // 1 pipe through the slab
      box(5, 0.3, 5, 6, 3, 6),        // 2 column standing on the slab (touching)
      box(8, 0.35, 8, 9, 1, 9),       // 3 duct 50 mm above the slab
      box(4, 0.1, 4, 4.1, 0.2, 4.1),  // 4 sleeve fully inside the slab
    )
    const tests = [
      { id: 'h', kind: 'hard' as const, tolerance: 0.01, a: [0], b: [1, 2, 3, 4] },
      { id: 'c', kind: 'clearance' as const, tolerance: 0.1, a: [0], b: [3] },
    ]
    const r = runClashTests({ positions, offsets, modelIndex: [0, 1, 1, 1, 1], tests })
    const hard = r.filter((c) => c.test === 'h').map((c) => c.b).sort()
    expect(hard).toEqual([1, 4])
    const clear = r.filter((c) => c.test === 'c')
    expect(clear).toHaveLength(1)
    expect(clear[0].distance).toBeCloseTo(0.05, 3)
  })

  it('respects skipSameModel and the hard tolerance', () => {
    const { positions, offsets } = soup(box(0, 0, 0, 1, 1, 1), box(0.995, 0, 0, 2, 1, 1))
    const t = (o: object) => runClashTests({ positions, offsets, modelIndex: [0, 0], tests: [{ id: 't', kind: 'hard', tolerance: 0.01, a: [0], b: [1], ...o }] })
    expect(t({})).toHaveLength(0) // 5 mm overlap < 10 mm
    expect(t({ tolerance: 0.001 })).toHaveLength(1)
    expect(t({ tolerance: 0.001, skipSameModel: true })).toHaveLength(0)
  })

  it('broad phase on all-against-all reports each pair once', () => {
    const { positions, offsets } = soup(box(0, 0, 0, 1, 1, 1), box(0.5, 0, 0, 1.5, 1, 1), box(1, 0, 0, 2, 1, 1))
    const boxes = elementBoxes(positions, offsets)
    const pairs = broadPhase(boxes, [0, 1, 2], [0, 1, 2], 0)
    expect(pairs.map(([a, b]) => [Math.min(a, b), Math.max(a, b)].join('-')).sort()).toEqual(['0-1', '0-2', '1-2'])
  })

  it('stays fast on a grid of 4,000 elements crossed by 400 pipes', () => {
    const items: Float32Array[] = []
    for (let i = 0; i < 60; i++) for (let j = 0; j < 60; j++) if (items.length < 3600) items.push(box(i, 0, j, i + 0.4, 3, j + 0.4))
    const columns = items.length
    for (let k = 0; k < 400; k++) items.push(box(-1, 1 + (k % 4) * 0.5, (k % 60) + 0.1, 61, 1.2 + (k % 4) * 0.5, (k % 60) + 0.3))
    const { positions, offsets } = soup(...items)
    const a = Array.from({ length: columns }, (_, i) => i)
    const b = Array.from({ length: 400 }, (_, i) => columns + i)
    const t0 = performance.now()
    const r = runClashTests({ positions, offsets, modelIndex: new Uint16Array(items.length), tests: [{ id: 'p', kind: 'hard', tolerance: 0.01, a, b }] })
    const ms = performance.now() - t0
    expect(r.length).toBe(400 * 60)
    expect(ms).toBeLessThan(15000)
  })
})

describe('assemblies', () => {
  it('a curtain wall and its mullions share a group; lone elements have none', () => {
    const els = [el(0, { localId: 10 }), el(1, { localId: 11, assembly: 10 }), el(2, { localId: 12, assembly: 10 }), el(3, { localId: 13 }), el(4, { localId: 10, modelId: 'other' })]
    const g = assemblyGroups(els)
    expect(g[0]).toBeGreaterThanOrEqual(0)
    expect(g[1]).toBe(g[0]); expect(g[2]).toBe(g[0])
    expect(g[3]).toBe(-1); expect(g[4]).toBe(-1)
  })
  it('the engine skips pairs inside one assembly', () => {
    const { positions, offsets } = soup(box(0, 0, 0, 1, 1, 1), box(0.5, 0, 0, 1.5, 1, 1))
    const run = (group?: number[]) => runClashTests({ positions, offsets, modelIndex: [0, 0], group, tests: [{ id: 't', kind: 'hard', tolerance: 0.01, a: [0], b: [1] }] })
    expect(run()).toHaveLength(1)
    expect(run([3, 3])).toHaveLength(0)
  })
})

describe('statuses across versions', () => {
  const res = (key: string, test = 't1'): ClashResult => ({ key, test, kind: 'hard', a: el(0), b: el(1), distance: 0, depth: 0.1, point: [0, 0, 0] })
  it('new → active → resolved → reopened, approved kept', () => {
    let rec: Record<string, ClashRecord> = {}
    rec = reconcile(rec, [res('t1|a|b'), res('t1|c|d')], new Set(['t1']), 'v1')
    expect(rec['t1|a|b'].status).toBe('new')
    rec['t1|c|d'] = { ...rec['t1|c|d'], status: 'approved' }
    rec = reconcile(rec, [res('t1|a|b'), res('t1|c|d')], new Set(['t1']), 'v2')
    expect(rec['t1|a|b'].status).toBe('active')
    expect(rec['t1|c|d'].status).toBe('approved')
    rec = reconcile(rec, [], new Set(['t1']), 'v3')
    expect(rec['t1|a|b'].status).toBe('resolved')
    expect(rec['t1|c|d'].status).toBe('approved')
    rec = reconcile(rec, [res('t1|a|b')], new Set(['t1']), 'v4')
    expect(rec['t1|a|b'].status).toBe('active')
    expect(rec['t1|a|b'].firstSeen).toBe('v1')
  })
  it('records of tests that did not run are untouched', () => {
    const rec = reconcile({ 't2|x|y': { status: 'active', firstSeen: 'v1', lastSeen: 'v1' } }, [], new Set(['t1']), 'v2')
    expect(rec['t2|x|y'].status).toBe('active')
  })
  it('key is order-independent and uses GlobalIds', () => {
    expect(clashKey('t', el(0, { guid: 'B' }), el(1, { guid: 'A' }))).toBe('t|A|B')
    expect(clashKey('t', el(1, { guid: 'A' }), el(0, { guid: 'B' }))).toBe('t|A|B')
  })
})

describe('grouping', () => {
  const duct = el(99, { name: 'Duct 1', category: 'IFCDUCTSEGMENT', storey: '', system: 'Supply' })
  const results: ClashResult[] = Array.from({ length: 12 }, (_, i) => ({
    key: `k${i}`, test: 't', kind: 'hard', a: duct, b: el(i, { category: 'IFCBEAM', storey: i < 8 ? 'L2' : 'L3' }), distance: 0, depth: 0.1, point: [0, 0, 0],
  }))
  results.push({ key: 'z', test: 't', kind: 'hard', a: el(50), b: el(51), distance: 0, depth: 0.1, point: [0, 0, 0] })
  it('element grouping folds one duct through twelve beams into one group', () => {
    const g = groupClashes(results, 'element')
    expect(g[0].clashes).toHaveLength(12)
    expect(g[0].label).toContain('Duct 1')
    expect(g).toHaveLength(2)
  })
  it('storey and system grouping', () => {
    expect(groupClashes(results, 'storey').map((g) => [g.label, g.clashes.length])).toEqual([['L2', 8], ['L3', 4], ['L1', 1]])
    expect(groupClashes(results, 'system')[0].label).toBe('Supply')
  })
})

describe('matrix', () => {
  it('default matrix pairs every discipline and adds MEP↔S clearance', () => {
    const m = defaultMatrix(['A', 'S', 'M'])
    expect(m.tests.map((t) => t.name)).toEqual(['A × M', 'A × S', 'M × S', 'M ↔ S 50 mm'])
  })
  it('round-trips through JSON and rejects junk', () => {
    const m = defaultMatrix(['A', 'S'])
    expect(parseMatrix(JSON.stringify(m))?.tests).toHaveLength(1)
    expect(parseMatrix('{"x":1}')).toBeNull()
    expect(parseMatrix('nope')).toBeNull()
  })
  it('selectors filter by discipline, class and system, never spaces', () => {
    const els = [el(0, { discipline: 'S', category: 'IFCBEAM' }), el(1, { discipline: 'M', category: 'IFCPIPESEGMENT', system: 'Hot water' }), el(2, { category: 'IFCSPACE' })]
    expect(selectIndexes(ANY, els)).toEqual([0, 1])
    expect(selectIndexes({ ...ANY, systems: ['Hot water'] }, els)).toEqual([1])
    expect(selectIndexes({ ...ANY, models: ['S'], classes: ['IFCBEAM'] }, els)).toEqual([0])
  })
})

describe('export', () => {
  const r: ClashResult = { key: 't|A|B', test: 't', kind: 'hard', a: el(0, { guid: 'A', name: 'Beam' }), b: el(1, { guid: 'B', name: 'Pipe' }), distance: 0, depth: 0.05, point: [1, 2, 3] }
  it('BCF topic carries both GUIDs, a camera aimed at the clash and Team fields', () => {
    const [topic] = clashesToBcfTopics([r], { 't|A|B': { status: 'active', firstSeen: '', lastSeen: '', assignee: 'ana@x.com', due: '2026-12-01' } }, () => 'A × S')
    expect(topic.topicType).toBe('Clash')
    expect(topic.assignedTo).toBe('ana@x.com')
    const vp = topic.viewpoints[0]
    expect(vp.componentGuids).toEqual(['A', 'B'])
    const p = vp.cameraPosition!, d = vp.cameraDirection!
    const along = (1 - p.x) / d.x
    expect(p.y + d.y * along).toBeCloseTo(2, 5)
    expect(vp.cameraUp!.y).toBeGreaterThan(0)
  })
  it('report lists open clashes with escaped names', () => {
    const html = coordinationReportHtml({ lang: 'es', project: 'Hotel <Vela>', results: [r], records: {}, testName: () => 'A × S', now: new Date('2026-11-11T10:00:00Z') })
    expect(html).toContain('Hotel &lt;Vela&gt;')
    expect(html).toContain('Informe de coordinación de colisiones')
    expect(html).toContain('Beam × Pipe')
  })
})

describe('texts', () => {
  it('every locale has every key and keeps placeholders', () => {
    const keys = Object.keys(CLASH_TEXTS.en)
    for (const [lang, dict] of Object.entries(CLASH_TEXTS)) {
      for (const k of keys) {
        expect(dict[k as keyof typeof dict], `${lang}.${k}`).toBeTruthy()
        const want = (CLASH_TEXTS.en[k as keyof typeof dict]!.match(/{{\w+}}/g) ?? []).sort()
        expect((dict[k as keyof typeof dict]!.match(/{{\w+}}/g) ?? []).sort(), `${lang}.${k}`).toEqual(want)
      }
    }
    expect(clashText('de-DE', 'summary', { n: 3, groups: 1, el: 9, s: 2 })).toContain('3 Kollisionen')
  })
  it('never mentions AI', () => {
    for (const dict of Object.values(CLASH_TEXTS)) for (const v of Object.values(dict)) expect(v).not.toMatch(/\b(AI|IA|KI)\b/)
  })
})
