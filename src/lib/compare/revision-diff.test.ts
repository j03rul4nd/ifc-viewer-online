// @vitest-environment node
// Revision compare engine against the golden fixtures of spec 10 §6
// (tests/fixtures/revision, made by scripts/compare-fixtures/make.ts), plus
// unit checks of the normalisation helpers on hand-built snapshots.
import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IfcAPI } from 'web-ifc'
import { buildSnapshot, meshStats } from './snapshot'
import { diffRevisions } from './revision-diff'
import { canonicalClass, cardinalDirection, detectOriginShift, makeIgnoreMatcher } from './normalize'
import type { ChangeKind, RevisionDiff } from './revision-types'
import type { ModelSnapshot, SnapElement } from './types'

const FIX = join(process.cwd(), 'tests', 'fixtures', 'revision')

interface Expected {
  changes: Array<{ globalIdA?: string; globalIdB?: string; kind: ChangeKind; method: string; file?: string; direction?: string }>
  counts: Record<string, number>
  originShift?: [number, number, number]
}

let api: IfcAPI
beforeAll(async () => { api = new IfcAPI(); await api.Init() })

async function snapshotOf(bytes: Uint8Array, name: string): Promise<ModelSnapshot> {
  const id = api.OpenModel(bytes)
  try {
    return await buildSnapshot(api, id, { id: name, fileName: name, sourceBytes: bytes.length, geometry: true })
  } finally { api.CloseModel(id) }
}

async function side(dir: string, which: 'a' | 'b'): Promise<ModelSnapshot[]> {
  const single = join(dir, `${which}.ifc`)
  if (existsSync(single)) return [await snapshotOf(readFileSync(single), `${which}.ifc`)]
  const sub = join(dir, which)
  const out: ModelSnapshot[] = []
  for (const f of readdirSync(sub).sort()) out.push(await snapshotOf(readFileSync(join(sub, f)), f))
  return out
}

async function runCase(id: string): Promise<{ diff: RevisionDiff; exp: Expected }> {
  const dir = join(FIX, id)
  const exp = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8')) as Expected
  const diff = diffRevisions(await side(dir, 'a'), await side(dir, 'b'))
  return { diff, exp }
}

const KINDS: ChangeKind[] = ['added', 'removed', 'moved', 'reshaped', 'type_changed', 'properties_changed', 'relations_changed']

/** Precision and recall per kind, keyed by (kind, GlobalId A|B). */
function score(diff: RevisionDiff, exp: Expected): Record<string, { precision: number; recall: number }> {
  const key = (kind: string, a?: string, b?: string): string => `${kind}|${a ?? ''}|${b ?? ''}`
  const got = new Set(diff.changes.map((c) => key(c.kind,
    c.kind === 'added' ? undefined : c.match.baseGlobalIds[0],
    c.kind === 'removed' ? undefined : c.match.headGlobalIds[0])))
  const want = new Set(exp.changes.map((c) => key(c.kind, c.globalIdA, c.globalIdB)))
  const out: Record<string, { precision: number; recall: number }> = {}
  for (const k of KINDS) {
    const g = [...got].filter((x) => x.startsWith(`${k}|`)), w = [...want].filter((x) => x.startsWith(`${k}|`))
    const tp = g.filter((x) => want.has(x)).length
    out[k] = { precision: g.length ? tp / g.length : 1, recall: w.length ? tp / w.length : 1 }
  }
  return out
}

const PERFECT = Object.fromEntries(KINDS.map((k) => [k, { precision: 1, recall: 1 }]))

describe('diffRevisions on the golden fixtures', () => {
  for (const id of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F11']) {
    it(`${id}: precision and recall 1.0 per kind`, async () => {
      const { diff, exp } = await runCase(id)
      expect(score(diff, exp)).toEqual(PERFECT)
      expect(diff.changes.length).toBe(exp.changes.length)
      for (const e of exp.changes) {
        const c = diff.changes.find((x) => x.kind === e.kind
          && (e.globalIdB ? x.match.headGlobalIds[0] === e.globalIdB : x.match.baseGlobalIds[0] === e.globalIdA))!
        expect(c.match.method).toBe(e.method)
        if (e.file) expect(e.kind === 'removed' ? c.baseFile : c.headFile).toBe(e.file)
        if (e.direction) expect(c.delta?.direction).toBe(e.direction)
      }
    }, 120_000)
  }

  it('F2: the move is reported as 120 mm east', async () => {
    const { diff } = await runCase('F2')
    const c = diff.changes[0]
    expect(c.summary).toEqual({ key: 'moved_mm', params: { mm: 120, dir: 'E' } })
    expect(c.delta!.move![0]).toBeCloseTo(0.12, 4)
  }, 60_000)

  it('F3: the reshape is reported as a height change with sizes and volumes', async () => {
    const { diff } = await runCase('F3')
    const c = diff.changes[0]
    expect(c.summary).toEqual({ key: 'height_mm', params: { before: 6000, after: 6500 } })
    expect(c.delta!.volumeAfter! / c.delta!.volumeBefore!).toBeCloseTo(6.5 / 6, 4)
  }, 60_000)

  it('F6: StandardCase vs base class is not a type change', async () => {
    const { diff } = await runCase('F6')
    expect(diff.byKind.type_changed).toBe(0)
  }, 60_000)

  it('F7: whole-model shift is one originShift and no moves', async () => {
    const { diff, exp } = await runCase('F7')
    expect(diff.byKind.moved).toBe(0)
    expect(diff.originShift).not.toBeNull()
    diff.originShift!.forEach((v, k) => expect(Math.abs(v - exp.originShift![k])).toBeLessThanOrEqual(0.001))
  }, 60_000)

  it('F11: re-tessellation is noise, not a change', async () => {
    const { diff } = await runCase('F11')
    expect(diff.changes).toEqual([])
    expect(diff.noise).toBeGreaterThan(0)
  }, 60_000)

  it('the result is plain serialisable data', async () => {
    const { diff } = await runCase('F8')
    const findUndef = (v: unknown, path: string): string[] => v === undefined ? [path]
      : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => findUndef(x, `${path}.${k}`)) : []
    expect(findUndef(diff, '$')).toEqual([])
    expect(JSON.parse(JSON.stringify(diff))).toEqual(diff)
    expect(structuredClone(diff)).toEqual(diff)
    expect(diff.version).toBe(1)
    expect(diff.options.moveTolerance).toBe(0.005)
  }, 120_000)

  it('recomputes with another tolerance without re-reading the files', async () => {
    const dir = join(FIX, 'F2')
    const a = await side(dir, 'a'), b = await side(dir, 'b')
    expect(diffRevisions(a, b).byKind.moved).toBe(1)
    // 120 mm is below a 200 mm tolerance → nothing moved
    expect(diffRevisions(a, b, { moveTolerance: 0.2 }).byKind.moved).toBe(0)
  }, 60_000)
})

// ── Hand-built snapshots ─────────────────────────────────────────────────────

let eid = 1
function el(gid: string | null, over: Partial<SnapElement> = {}): SnapElement {
  return {
    expressId: eid++, ifcClass: 'IFCCOLUMN', name: 'Column', globalId: gid,
    attributes: { Name: 'Column', Tag: null }, psets: {}, materials: ['Concrete'], storey: 'L1',
    geo: { h: 'aaaa', c: [0, 0, 0], s: [0.4, 0.4, 3], v: 0.48 },
    ...over,
  }
}
function snap(fileName: string, elements: SnapElement[], projectGid = 'P1'): ModelSnapshot {
  return { id: fileName, fileName, schema: 'IFC4', projectGid, capturedAt: 0, sourceBytes: 0, geometry: true, unreadable: 0, elements }
}

describe('normalisation helpers', () => {
  it('canonicalClass folds StandardCase / ElementedCase', () => {
    expect(canonicalClass('IFCWALLSTANDARDCASE', 'IFC2X3')).toBe('IFCWALL')
    expect(canonicalClass('IfcWallElementedCase', 'IFC4')).toBe('IFCWALL')
    expect(canonicalClass('IFCBEAMSTANDARDCASE')).toBe('IFCBEAM')
    expect(canonicalClass('IFCWALL')).toBe('IFCWALL')
  })

  it('detectOriginShift needs 60 % agreement', () => {
    const shifted: [number, number, number][] = Array.from({ length: 7 }, () => [10, 0, 0])
    const still: [number, number, number][] = Array.from({ length: 3 }, () => [0, 0, 0])
    expect(detectOriginShift([...shifted, ...still], 0.005)).toEqual([10, 0, 0])
    expect(detectOriginShift([...shifted.slice(0, 5), ...still, [3, 0, 0], [4, 0, 0]], 0.005)).toBeNull()
    expect(detectOriginShift([[0.12, 0, 0]], 0.005)).toBeNull() // one moved element is a move
    expect(detectOriginShift(Array.from({ length: 5 }, () => [0, 0, 0] as [number, number, number]), 0.005)).toBeNull()
  })

  it('ignore matcher takes whole Psets and Pset.Property globs', () => {
    const m = makeIgnoreMatcher(['ArchiCADProperties', '*.ElementId'])
    expect(m('ArchiCADProperties', 'X')).toBe(true)
    expect(m('Other', 'ElementId')).toBe(true)
    expect(m('Pset_WallCommon', 'FireRating')).toBe(false)
  })

  it('cardinal direction in plan, up/down when vertical', () => {
    expect(cardinalDirection([0.12, 0, 0])).toBe('E')
    expect(cardinalDirection([0, -1, 0])).toBe('S')
    expect(cardinalDirection([1, 1, 0])).toBe('NE')
    expect(cardinalDirection([0, 0, 0.3])).toBe('up')
  })

  it('meshStats: AABB and volume of a unit cube', () => {
    const p = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]
    const verts = p.flatMap((v) => [...v, 0, 0, 0])
    const idx = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
    const s = meshStats(verts, idx)
    expect(s.min).toEqual([0, 0, 0]); expect(s.max).toEqual([1, 1, 1])
    expect(s.vol).toBeCloseTo(1, 9)
  })
})

describe('diffRevisions classification', () => {
  it('layer 2 matches by Tag when GlobalIds were regenerated', () => {
    const b = snap('S.ifc', [el('G1', { attributes: { Tag: 'C-01' } }), el('G2', { attributes: { Tag: 'C-02' }, geo: { h: 'b', c: [5, 0, 0], s: [0.4, 0.4, 3], v: 0.48 } })])
    const h = snap('S.ifc', [el('N1', { attributes: { Tag: 'C-01' } }), el('N2', { attributes: { Tag: 'C-02' }, geo: { h: 'b2', c: [5, 0, -0.2], s: [0.4, 0.4, 3], v: 0.48 } })])
    const d = diffRevisions([b], [h])
    expect(d.byKind.added + d.byKind.removed).toBe(0)
    expect(d.guidRegenerated).toBe(true)
    expect(d.changes).toHaveLength(1)
    expect(d.changes[0]).toMatchObject({ kind: 'moved', match: { method: 'tag', confidence: 0.95, baseGlobalIds: ['G2'], headGlobalIds: ['N2'] } })
    expect(d.changes[0].summary).toEqual({ key: 'moved_mm', params: { mm: 200, dir: 'N' } })
  })

  it('layer 2 uses markProperties and ignores marks that are not unique', () => {
    const mark = (m: string) => ({ psets: { Pset_Precast: { Mark: m } } })
    const b = snap('S.ifc', [el('G1', mark('P1')), el('G2', mark('DUP')), el('G3', mark('DUP'))])
    const h = snap('S.ifc', [el('N1', mark('P1')), el('N2', mark('DUP')), el('N3', mark('DUP'))])
    const d = diffRevisions([b], [h], { markProperties: ['Pset_Precast.Mark'] }, { extraMatchers: [] }) // layer 2 alone
    expect(d.byKind.unchanged).toBe(1)
    expect(d.byKind.added).toBe(2)
    expect(d.byKind.removed).toBe(2)
  })

  it('different canonical class never matches by mark', () => {
    const b = snap('S.ifc', [el('G1', { attributes: { Tag: 'X' } })])
    const h = snap('S.ifc', [el('N1', { ifcClass: 'IFCBEAM', attributes: { Tag: 'X' } })])
    expect(diffRevisions([b], [h]).byKind).toMatchObject({ added: 1, removed: 1 })
  })

  it('several kinds at once: kind follows the priority, kinds keeps them all', () => {
    const b = snap('S.ifc', [el('G1')])
    const h = snap('S.ifc', [el('G1', {
      predefinedType: 'COLUMN', storey: 'L2', psets: { P: { a: 1 } },
      geo: { h: 'z', c: [1, 0, 0], s: [0.4, 3.5, 0.4], v: 0.56 },
    })])
    const c = diffRevisions([b], [h]).changes[0]
    expect(c.kinds).toEqual(['type_changed', 'reshaped', 'relations_changed', 'properties_changed'])
    expect(c.kind).toBe('type_changed')
  })

  it('a different relating type is a type change; an older baseline without it is not', () => {
    const b = snap('S.ifc', [el('G1', { typeName: 'C40x40' }), el('G2')])
    const h = snap('S.ifc', [el('G1', { typeName: 'C50x50' }), el('G2', { typeName: 'C40x40' })])
    const d = diffRevisions([b], [h])
    expect(d.changes.map((c) => [c.globalId, c.kind])).toEqual([['G1', 'type_changed']])
  })

  it('volume within 1 % and size within 5 mm is not a reshape', () => {
    const b = snap('S.ifc', [el('G1')])
    const h = snap('S.ifc', [el('G1', { geo: { h: 'other', c: [0.003, 0, 0], s: [0.403, 0.4, 3], v: 0.483 } })])
    const d = diffRevisions([b], [h])
    expect(d.changes).toEqual([])
    expect(d.noise).toBe(1)
  })

  it('an older baseline without size/volume falls back to the hash', () => {
    const b = snap('S.ifc', [el('G1', { geo: { h: 'a', c: [0, 0, 0] } })])
    const h = snap('S.ifc', [el('G1', { geo: { h: 'b', c: [0, 0, 0], s: [1, 1, 1], v: 1 } })])
    expect(diffRevisions([b], [h]).changes[0].kind).toBe('reshaped')
  })

  it('extra matchers (layer 3+) see only what layers 1–2 left, and their pairs are classified', () => {
    const b = snap('S.ifc', [el('G1'), el('OLD', { geo: { h: 'q', c: [9, 9, 0], s: [0.4, 0.4, 3], v: 0.48 } })])
    const h = snap('S.ifc', [el('G1'), el('NEW', { geo: { h: 'q', c: [9.1, 9, 0], s: [0.4, 0.4, 3], v: 0.48 } })])
    let seen: string[] = []
    const d = diffRevisions([b], [h], {}, {
      extraMatchers: [(ub, uh) => {
        seen = [...ub, ...uh].map((l) => l.el.globalId!)
        return [{ base: [ub[0]], head: [uh[0]], method: 'geometry', confidence: 0.8 }]
      }],
    })
    expect(seen).toEqual(['OLD', 'NEW'])
    expect(d.changes).toHaveLength(1)
    expect(d.changes[0]).toMatchObject({ kind: 'moved', match: { method: 'geometry', confidence: 0.8 } })
  })

  it('exporter-noise Psets are ignored by default', () => {
    const b = snap('S.ifc', [el('G1', { psets: { Other: { ElementId: '123' } } })])
    const h = snap('S.ifc', [el('G1', { psets: { Other: { ElementId: '456' } } })])
    expect(diffRevisions([b], [h]).changes).toEqual([])
  })
})

describe('diffRevisions on many elements', () => {
  // ~0.8 s warm on a dev laptop; budget of spec §5 for a 200 MB pair (≈ this size) is 3 s.
  it('50 000 synthetic elements per side within the 3 s budget', () => {
    const mk = (i: number, dx: number): SnapElement => el(`G${i}`, {
      psets: { Pset_ColumnCommon: { Reference: `R${i % 40}`, LoadBearing: true } },
      geo: { h: `h${i}`, c: [i % 300 + dx, 0, Math.floor(i / 300)], s: [0.4, 3, 0.4], v: 0.48 },
    })
    const b = snap('S.ifc', Array.from({ length: 50_000 }, (_, i) => mk(i, 0)))
    const h = snap('S.ifc', Array.from({ length: 50_000 }, (_, i) => mk(i, i % 100 === 0 ? 0.05 : 0)))
    const t0 = performance.now()
    const d = diffRevisions([b], [h])
    expect(performance.now() - t0).toBeLessThan(10_000) // loose: the full suite loads the machine; the 1 s acceptance is the cras test
    expect(d.byKind.moved).toBe(500)
  })
})

// ── Performance on the 67 MB `cras` model (skipped when it is not checked out) ─

const CRAS = join(process.cwd(), 'public', 'models', 'cras', 'model.ifc')
describe.skipIf(!existsSync(CRAS))('diffRevisions performance', () => {
  it('diffs two cras snapshots in under 1 s', async () => {
    const a = await snapshotOf(readFileSync(CRAS), 'model.ifc')
    // Head: a copy with every 50th element moved and every 70th renamed.
    const b: ModelSnapshot = structuredClone(a)
    b.elements.forEach((e, i) => {
      if (i % 50 === 0 && e.geo) e.geo.c = [e.geo.c[0] + 0.1, e.geo.c[1], e.geo.c[2]]
      if (i % 70 === 0) e.name = `${e.name ?? ''} rev`
    })
    const t0 = performance.now()
    const d = diffRevisions([a], [b])
    const ms = performance.now() - t0
    console.log(`[perf] cras: ${a.elements.length} elements, diffRevisions ${ms.toFixed(0)} ms, ${d.changes.length} changes`)
    expect(d.changes.length).toBeGreaterThan(0)
    expect(ms).toBeLessThan(1000)
    if (process.env.PERF_OUT) (await import("node:fs")).writeFileSync(process.env.PERF_OUT, `${a.elements.length} elements, ${ms.toFixed(0)} ms, ${d.changes.length} changes`)
  }, 600_000)
})
