// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import type { ModelSnapshot, SnapElement } from './types'
import { diffSnapshotSets, diffElement, churnPercent } from './model-diff'
import { normalizeFileName, pairSnapshots } from './pairing'
import { deriveIdsFromSnapshots } from './ids-from-model'
import { runIdsOnSet, diffIdsAcrossVersions } from './ids-versions'
import { planTopicUpdates, buildNewTopics, type BcfSyncText } from './bcf-sync'
import { diffToCsv } from './report'
import { writeIds } from '../ids/ids-writer'
import { parseIds } from '../ids/ids-parser'
import type { BcfTopic } from '../../types'

let eid = 1
function el(gid: string, over: Partial<SnapElement> = {}): SnapElement {
  return {
    expressId: eid++, ifcClass: 'IFCWALL', name: `Wall ${gid}`, globalId: gid,
    attributes: { Name: `Wall ${gid}`, Description: null, Tag: 'T1' },
    psets: { Pset_WallCommon: { IsExternal: true, FireRating: 'EI60' } },
    materials: ['Concrete'], storey: 'Level 1',
    geo: { h: 'aaaa', c: [0, 0, 0] },
    ...over,
  }
}
function snap(fileName: string, elements: SnapElement[], projectGid = 'P1'): ModelSnapshot {
  return { id: fileName, fileName, schema: 'IFC4', projectGid, capturedAt: 0, sourceBytes: 0, geometry: true, unreadable: 0, elements }
}

describe('diffElement', () => {
  it('reports nothing for identical elements', () => {
    expect(diffElement(el('A'), el('A')).changes).toEqual([])
  })
  it('detects property, name, material, container and class changes', () => {
    const b = el('A')
    const h = el('A', {
      name: 'Renamed', ifcClass: 'IFCWALLSTANDARDCASE', storey: 'Level 2', materials: ['Brick'],
      psets: { Pset_WallCommon: { IsExternal: false, AcousticRating: '45dB' } },
    })
    const cats = diffElement(b, h).changes.map((c) => `${c.category}:${c.key}`)
    expect(cats).toEqual(expect.arrayContaining([
      'class:', 'name:Name', 'property:Pset_WallCommon.IsExternal', 'property:Pset_WallCommon.FireRating',
      'property:Pset_WallCommon.AcousticRating', 'material:', 'container:',
    ]))
  })
  it('treats a pure move as placement, not as a shape change', () => {
    const r = diffElement(el('A'), el('A', { geo: { h: 'bbbb', c: [3, 4, 0] } }))
    expect(r.changes.map((c) => c.category)).toEqual(['placement'])
    expect(r.moveDistance).toBeCloseTo(5)
  })
  it('ignores numeric noise and number-vs-string spellings', () => {
    const b = el('A', { psets: { Q: { Length: 3.0000000001, Count: 3 } } })
    const h = el('A', { psets: { Q: { Length: 3, Count: '3' } } })
    expect(diffElement(b, h).changes).toEqual([])
  })
})

describe('diffSnapshotSets', () => {
  it('diffs a set by GlobalId and follows elements across files', () => {
    const base = [snap('ARQ_v1.ifc', [el('A'), el('B'), el('C')]), snap('EST_v1.ifc', [el('S1', { ifcClass: 'IFCBEAM' })])]
    const head = [
      snap('ARQ_v2.ifc', [el('A'), el('B', { name: 'B2' }), el('D')]),
      snap('EST_v2.ifc', [el('S1', { ifcClass: 'IFCBEAM' }), el('C')]), // C moved file
    ]
    const d = diffSnapshotSets(base, head, { base: 'W38', head: 'W39' })
    expect(d.counts).toEqual({ added: 1, removed: 0, modified: 2, unchanged: 2 })
    const c = d.elements.find((e) => e.globalId === 'C')!
    expect(c.changes[0]).toMatchObject({ category: 'file', before: 'ARQ_v1.ifc', after: 'EST_v2.ifc' })
    expect(d.files.map((f) => [f.base, f.head])).toEqual(expect.arrayContaining([['ARQ_v1.ifc', 'ARQ_v2.ifc'], ['EST_v1.ifc', 'EST_v2.ifc']]))
    expect(churnPercent(d.counts)).toBe(60)
  })
  it('does not report geometry when one side has no fingerprints', () => {
    const b = snap('a.ifc', [el('A')])
    const h = { ...snap('a.ifc', [el('A', { geo: { h: 'x', c: [9, 9, 9] } })]), geometry: false }
    expect(diffSnapshotSets([b], [h]).counts.modified).toBe(0)
  })
  it('counts duplicate GlobalIds instead of diffing them', () => {
    const d = diffSnapshotSets([snap('a.ifc', [el('A'), el('A')])], [snap('a.ifc', [el('A')])])
    expect(d.duplicateGuids.base).toBe(1)
  })
})

describe('pairing', () => {
  it('normalizes versions, dates and revisions out of file names', () => {
    expect(normalizeFileName('ARQ_Edificio-A_v03 2026-09-21.ifc')).toBe('arq edificio a')
    expect(normalizeFileName('ARQ Edificio A rev B.ifc')).toBe('arq edificio a')
  })
  it('prefers GlobalId overlap over names', () => {
    const base = [snap('one.ifc', [el('A'), el('B')]), snap('two.ifc', [el('X'), el('Y')])]
    const head = [snap('two.ifc', [el('A'), el('B')]), snap('one.ifc', [el('X'), el('Y')])]
    const p = pairSnapshots(base, head)
    expect(p.find((x) => x.base === 'one.ifc')).toMatchObject({ head: 'two.ifc', reason: 'guid-overlap' })
  })
  it('reports unmatched files on both sides', () => {
    const p = pairSnapshots([snap('a.ifc', [el('A')])], [snap('z.ifc', [el('Z')], 'P2')])
    expect(p.map((x) => x.reason)).toEqual(['unmatched', 'unmatched'])
  })
})

describe('derive IDS + writer round-trip + IDS across versions', () => {
  const base = [snap('a.ifc', [el('A'), el('B'), el('C')])]
  it('derives required properties present on every instance', () => {
    const { doc, summary } = deriveIdsFromSnapshots(base, { minInstances: 2 })
    expect(summary.classes).toBe(1)
    const facets = doc.specifications[0].requirements.map((r) => r.facet)
    expect(facets).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'property', baseName: { simpleValue: 'FireRating' } }),
      expect.objectContaining({ kind: 'material' }),
      expect.objectContaining({ kind: 'attribute', name: { simpleValue: 'Name' } }),
    ]))
  })
  it('writes an IDS that the parser reads back to the same specifications', () => {
    const { doc } = deriveIdsFromSnapshots(base, { minInstances: 2, lockValues: true })
    const back = parseIds(writeIds(doc, { title: 'T', author: 'bim@example.com' }))
    expect(back.specifications.length).toBe(doc.specifications.length)
    expect(back.specifications[0].requirements.map((r) => r.facet)).toEqual(doc.specifications[0].requirements.map((r) => r.facet))
    expect(back.specifications[0].applicability).toEqual(doc.specifications[0].applicability)
  })
  it('keys IDS failures by GlobalId, so a renumbered export is not a new failure', () => {
    const { doc } = deriveIdsFromSnapshots(base, { minInstances: 2 })
    const head = [snap('a.ifc', [
      el('A'),                                         // new express id, same element: still passes
      el('B', { psets: { Pset_WallCommon: { IsExternal: true } } }), // lost FireRating → introduced
      el('C'),
    ])]
    const d = diffSnapshotSets(base, head)
    const v = diffIdsAcrossVersions(runIdsOnSet(doc, base), runIdsOnSet(doc, head), d)
    expect(v.introduced.map((f) => f.globalId)).toEqual(['B'])
    expect(v.introduced[0].elementChanged).toBe(true)
    expect(v.resolved).toEqual([])
    expect(v.headScore).toBeLessThan(v.baseScore)
  })
})

describe('BCF sync', () => {
  const text: BcfSyncText = {
    removed: (n, l) => `removed ${n} in ${l}`, modified: (n, w, l) => `modified ${n}: ${w} in ${l}`,
    unchanged: (l) => `unchanged in ${l}`, idsResolved: (s, l) => `resolved ${s} in ${l}`,
    proposeClose: 'propose close', changeGroupTitle: (s, n, c, st) => `${s} ${n} ${c} ${st}`,
    idsTopicTitle: (s, n) => `${s} ${n}`, author: 'tester',
  }
  const topicFor = (gids: string[], status = 'Open'): BcfTopic => ({
    guid: gids.join('-'), title: 't', status, viewpoints: [{ guid: 'v', componentGuids: gids }], comments: [], source: 'imported',
  })
  const d = diffSnapshotSets([snap('a.ifc', [el('A'), el('B'), el('C')])], [snap('a.ifc', [el('A', { name: 'X' }), el('C')])])

  it('comments open topics and proposes closing when every element is gone', () => {
    const patches = planTopicUpdates([topicFor(['B']), topicFor(['A']), topicFor(['C']), topicFor(['A'], 'Closed')], d, text)
    expect(patches).toHaveLength(3)
    expect(patches[0]).toMatchObject({ topicGuid: 'B', proposedStatus: 'Resolved' })
    expect(patches[1].comment.text).toContain('modified')
    expect(patches[1].proposedStatus).toBeUndefined()
    expect(patches[2].comment.text).toBe('unchanged in Head')
  })
  it('creates change-review topics grouped by class and storey', () => {
    const topics = buildNewTopics(d, text, null, { changeStatuses: ['removed', 'modified'] })
    expect(topics.map((t) => t.title).sort()).toEqual(['modified 1 IFCWALL Level 1', 'removed 1 IFCWALL Level 1'])
    expect(topics[0].viewpoints[0].componentGuids).toHaveLength(1)
  })
})

describe('report', () => {
  it('writes one CSV row per field change with a BOM', () => {
    const d = diffSnapshotSets([snap('a.ifc', [el('A')])], [snap('a.ifc', [el('A', { name: 'N', psets: {} })])])
    const csv = diffToCsv(d)
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.trim().split('\r\n').length).toBe(1 + d.elements[0].changes.length)
  })
})

describe('BCF sync does not loop on its own topics', () => {
  it('skips topics created by the same comparison', () => {
    const text: BcfSyncText = {
      removed: () => 'r', modified: () => 'm', unchanged: () => 'u', idsResolved: () => 'i',
      proposeClose: 'p', changeGroupTitle: () => 'g', idsTopicTitle: () => 't', author: 'a',
    }
    const d = diffSnapshotSets([snap('a.ifc', [el('A'), el('B')])], [snap('a.ifc', [el('A')])])
    const created = buildNewTopics(d, text)
    expect(created).toHaveLength(1)
    expect(planTopicUpdates(created, d, text)).toEqual([])
  })
})
