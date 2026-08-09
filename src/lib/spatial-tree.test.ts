// ─── spatial-tree ─────────────────────────────────────────────────────────────
// Every fixture here loads TWO models whose expressIds deliberately collide,
// because that is the only shape in which the bug this file exists to prevent
// is visible. A single-model test passes just as happily with expansion,
// selection and issue counts all keyed on a bare expressId — and that is exactly
// how the federated tree ended up opening rows nobody clicked.
//
// The Poblenou set is the real case: three files, each numbering from #1, so
// #348 is a column, a glazed panel and a duct segment at the same time.

import { describe, it, expect } from 'vitest'
import {
  scopedElementKey, flattenTrees, flattenTreesFiltered, collectSpatialKeys,
  nextExpansion, locateElement, resolveRevealTarget, invertDecomposition,
  buildIssueIndex, fileNameFromModelId,
  type ModelTreeSource,
} from './spatial-tree'
import { makeHiddenKey } from './visibility'
import type { SpatialNode, SpatialElement, ValidationIssue } from '../types'

function element(expressId: number, name: string, ifcClass = 'IfcWall'): SpatialElement {
  return { expressId, name, ifcClass, globalId: `G${expressId}` } as SpatialElement
}

function node(
  expressId: number,
  name: string,
  ifcClass: string,
  children: SpatialNode[] = [],
  containedElements: SpatialElement[] = [],
): SpatialNode {
  return { expressId, name, ifcClass, globalId: `G${expressId}`, children, containedElements } as SpatialNode
}

/**
 * Two models that share every id in their spatial chain. Storey #30 exists in
 * both; so do elements #40 and #41. Nothing below may treat them as one thing.
 */
function twoCollidingModels(): ModelTreeSource[] {
  const arc = node(10, 'Project A', 'IfcProject', [
    node(20, 'Site A', 'IfcSite', [
      node(30, 'Storey A', 'IfcBuildingStorey', [], [element(40, 'Wall A'), element(41, 'Wall A2')]),
    ]),
  ])
  const str = node(10, 'Project S', 'IfcProject', [
    node(20, 'Site S', 'IfcSite', [
      node(30, 'Storey S', 'IfcBuildingStorey', [], [element(40, 'Beam S', 'IfcBeam'), element(41, 'Beam S2', 'IfcBeam')]),
    ]),
  ])
  return [{ modelId: 'arc-1', tree: [arc] }, { modelId: 'str-1', tree: [str] }]
}

const opts = (expanded: Set<string>, collapsedModels = new Set<string>(), showHeaders = true) => ({
  expanded, collapsedModels, showHeaders, fileNameOf: (id: string) => id,
})

describe('scopedElementKey', () => {
  it('is the same key the hidden-elements set already uses', () => {
    // Two spellings of one idea would drift; the tree and the visibility set
    // must agree about what identifies an element.
    expect(scopedElementKey('arc-1', 348)).toBe(makeHiddenKey('arc-1', 348))
  })

  it('tells apart the same number in two models', () => {
    expect(scopedElementKey('arc-1', 348)).not.toBe(scopedElementKey('str-1', 348))
  })
})

describe('flattenTrees', () => {
  it('opens only the model whose node was expanded', () => {
    // THE BUG, in one assertion. Storey #30 exists in both models; expanding
    // the one in arc-1 must not open the one in str-1.
    const expanded = new Set([
      scopedElementKey('arc-1', 10), scopedElementKey('arc-1', 20), scopedElementKey('arc-1', 30),
      scopedElementKey('str-1', 10), scopedElementKey('str-1', 20),
    ])
    const flat = flattenTrees(twoCollidingModels(), opts(expanded))

    const elementsOf = (modelId: string) =>
      flat.filter((f) => f.kind === 'element' && f.modelId === modelId)
    expect(elementsOf('arc-1')).toHaveLength(2)
    expect(elementsOf('str-1')).toHaveLength(0)
  })

  it('gives every row a key unique across the whole list', () => {
    const expanded = collectSpatialKeys(twoCollidingModels())
    const flat = flattenTrees(twoCollidingModels(), opts(expanded))
    const keys = flat.map((f) => (f.kind === 'model-header' ? `header:${f.modelId}` : f.key))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('folds a model away behind its header without touching the other', () => {
    const expanded = collectSpatialKeys(twoCollidingModels())
    const flat = flattenTrees(twoCollidingModels(), opts(expanded, new Set(['arc-1'])))
    expect(flat.filter((f) => f.modelId === 'arc-1' && f.kind !== 'model-header')).toHaveLength(0)
    expect(flat.filter((f) => f.modelId === 'str-1' && f.kind === 'spatial').length).toBeGreaterThan(0)
    // The header stays, or there is no way to unfold it again.
    expect(flat.some((f) => f.kind === 'model-header' && f.modelId === 'arc-1')).toBe(true)
  })

  it('drops the headers when there is only one model to head', () => {
    const [arc] = twoCollidingModels()
    const flat = flattenTrees([arc], opts(new Set(), new Set(), false))
    expect(flat.some((f) => f.kind === 'model-header')).toBe(false)
  })
})

describe('flattenTreesFiltered', () => {
  it('finds the match in each model separately, and says which is which', () => {
    const flat = flattenTreesFiltered(twoCollidingModels(), 'beam', {
      showHeaders: true, fileNameOf: (id) => id,
    })
    const matched = flat.filter((f) => f.kind === 'element')
    expect(matched).toHaveLength(2)
    expect(matched.every((f) => f.modelId === 'str-1')).toBe(true)
    // Only the model that has a hit gets a header — a header over nothing reads
    // as "this model has no results", which is not what it means.
    expect(flat.filter((f) => f.kind === 'model-header')).toHaveLength(1)
  })

  it('keeps the path to a hit, not just the hit', () => {
    const flat = flattenTreesFiltered(twoCollidingModels(), 'wall a2', {
      showHeaders: false, fileNameOf: (id) => id,
    })
    const classes = flat.filter((f) => f.kind === 'spatial').map((f) => (f as { node: SpatialNode }).node.ifcClass)
    expect(classes).toEqual(['IfcProject', 'IfcSite', 'IfcBuildingStorey'])
  })
})

describe('nextExpansion', () => {
  it('opens the top two levels of every model', () => {
    const next = nextExpansion(twoCollidingModels(), new Set())
    expect(next.has(scopedElementKey('arc-1', 10))).toBe(true)
    expect(next.has(scopedElementKey('arc-1', 20))).toBe(true)
    expect(next.has(scopedElementKey('str-1', 20))).toBe(true)
    // Third level stays shut, or loading a big model dumps every storey open.
    expect(next.has(scopedElementKey('arc-1', 30))).toBe(false)
  })

  it('keeps what the user opened', () => {
    const previous = new Set([scopedElementKey('str-1', 30)])
    expect(nextExpansion(twoCollidingModels(), previous).has(scopedElementKey('str-1', 30))).toBe(true)
  })

  it('drops expansion belonging to a model that is gone', () => {
    // The trap: ids restart at #1 in every file, so a stale key survives into
    // the NEXT model unless it is pruned by scope, not by number.
    const [arc] = twoCollidingModels()
    const previous = new Set([scopedElementKey('str-1', 30), scopedElementKey('arc-1', 30)])
    const next = nextExpansion([arc], previous)
    expect(next.has(scopedElementKey('str-1', 30))).toBe(false)
    expect(next.has(scopedElementKey('arc-1', 30))).toBe(true)
  })
})

describe('locateElement', () => {
  it('honours the model the caller names', () => {
    const found = locateElement(twoCollidingModels(), 40, 'str-1')
    expect(found?.modelId).toBe('str-1')
    expect(found?.exact).toBe(true)
    expect(found?.ancestorKeys).toEqual([
      scopedElementKey('str-1', 10), scopedElementKey('str-1', 20), scopedElementKey('str-1', 30),
    ])
  })

  it('admits it is guessing when the caller does not know', () => {
    // A guess that presents itself as fact is what puts the highlight on the
    // wrong building.
    const found = locateElement(twoCollidingModels(), 40)
    expect(found?.modelId).toBe('arc-1')
    expect(found?.exact).toBe(false)
  })

  it('falls back to searching everywhere when the named model has no such id', () => {
    const trees = twoCollidingModels()
    const found = locateElement(trees, 41, 'nonexistent-model')
    expect(found?.modelId).toBe('arc-1')
    expect(found?.exact).toBe(false)
  })

  it('returns nothing rather than something for an id in no model', () => {
    expect(locateElement(twoCollidingModels(), 9999)).toBeNull()
  })
})

describe('buildIssueIndex', () => {
  const issue = (expressId: number, modelId: string | undefined, severity: string, ruleId = 'RULE_EMPTY_NAME') =>
    ({ expressId, modelId, severity, ruleId, id: `${modelId}-${expressId}-${ruleId}` } as unknown as ValidationIssue)

  it('keeps every model’s issues to itself', () => {
    const index = buildIssueIndex(
      [issue(40, 'arc-1', 'error'), issue(40, 'str-1', 'warning'), issue(41, 'str-1', 'warning')],
      twoCollidingModels(),
    )
    expect(index.get('arc-1')!.direct.get(40)).toEqual({ errors: 1, warnings: 0, info: 0 })
    expect(index.get('str-1')!.direct.get(40)).toEqual({ errors: 0, warnings: 1, info: 0 })
  })

  it('rolls a subtree up within its own model only', () => {
    const index = buildIssueIndex(
      [issue(40, 'arc-1', 'error'), issue(41, 'arc-1', 'warning'), issue(40, 'str-1', 'error')],
      twoCollidingModels(),
    )
    // The architectural storey owns both of its elements' issues and none of
    // the structural model's, even though the storey shares its expressId.
    expect(index.get('arc-1')!.rollup.get(30)).toEqual({ errors: 1, warnings: 1, info: 0 })
    expect(index.get('str-1')!.rollup.get(30)).toEqual({ errors: 1, warnings: 0, info: 0 })
    expect(index.get('arc-1')!.rollup.get(10)).toEqual({ errors: 1, warnings: 1, info: 0 })
  })

  it('flags GUID issues per model, so only the right row offers to fix one', () => {
    const index = buildIssueIndex(
      [issue(40, 'str-1', 'error', 'RULE_INVALID_GUID_FORMAT'), issue(41, 'arc-1', 'error')],
      twoCollidingModels(),
    )
    expect(index.get('str-1')!.guidIssues.has(40)).toBe(true)
    expect(index.get('arc-1')!.guidIssues.has(40)).toBe(false)
    expect(index.get('arc-1')!.guidIssues.has(41)).toBe(false)
  })

  it('attributes unstamped issues to the only model there is', () => {
    const [arc] = twoCollidingModels()
    const index = buildIssueIndex([issue(40, undefined, 'error')], [arc])
    expect(index.get('arc-1')!.direct.get(40)).toEqual({ errors: 1, warnings: 0, info: 0 })
  })

  it('does not spread an unstamped issue across every model', () => {
    // Counting it once per model is how a badge ends up saying three when the
    // panel says one.
    const index = buildIssueIndex([issue(40, undefined, 'error')], twoCollidingModels())
    expect(index.get('arc-1')!.direct.size).toBe(0)
    expect(index.get('str-1')!.direct.size).toBe(0)
  })
})

describe('fileNameFromModelId', () => {
  it('strips the loader timestamp', () => {
    expect(fileNameFromModelId('BCN-IVO-ZZ-XX-M3-A-0001.ifc-1754765432100'))
      .toBe('BCN-IVO-ZZ-XX-M3-A-0001.ifc')
  })

  it('leaves an id it does not recognise alone', () => {
    expect(fileNameFromModelId('model-a')).toBe('model-a')
  })
})

// ── resolveRevealTarget ──────────────────────────────────────────────────────
// The tree lists what a storey CONTAINS. Anything that is a PART of something
// else is aggregated into its host and appears nowhere — which in the Poblenou
// architectural model is all 102 glazed panels and all 3 stair flights.
// "Reveal in tree" on one of those used to do nothing whatsoever.

describe('resolveRevealTarget', () => {
  /** A curtain wall listed in the storey, with panels that are not. */
  function withParts(): { trees: ModelTreeSource[]; hostOf: (m: string, id: number) => number | undefined } {
    const wall = element(50, 'Curtain Wall North', 'IfcCurtainWall')
    const arc = node(10, 'Project A', 'IfcProject', [
      node(20, 'Site A', 'IfcSite', [
        node(30, 'Storey A', 'IfcBuildingStorey', [], [wall]),
      ]),
    ])
    const trees = [{ modelId: 'arc-1', tree: [arc] }, ...twoCollidingModels().slice(1)]
    // 51 and 52 are panels of wall 50; 53 is a part of panel 51 (two hops).
    const hosts: Record<string, Map<number, number>> = {
      'arc-1': new Map([[51, 50], [52, 50], [53, 51], [90, 91], [91, 90]]),
      'str-1': new Map(),
    }
    return { trees, hostOf: (m, id) => hosts[m]?.get(id) }
  }

  it('returns the element itself when the tree lists it', () => {
    const { trees, hostOf } = withParts()
    const target = resolveRevealTarget(trees, 50, 'arc-1', hostOf)
    expect(target).toMatchObject({ modelId: 'arc-1', expressId: 50, viaHost: false })
  })

  it('shows the host when the element is a part — the panel case', () => {
    const { trees, hostOf } = withParts()
    const target = resolveRevealTarget(trees, 51, 'arc-1', hostOf)
    expect(target).toMatchObject({ modelId: 'arc-1', expressId: 50, viaHost: true })
    // And it opens the path down to the host, not to nothing.
    expect(target!.ancestorKeys).toEqual([
      scopedElementKey('arc-1', 10), scopedElementKey('arc-1', 20), scopedElementKey('arc-1', 30),
    ])
  })

  it('climbs more than one hop', () => {
    const { trees, hostOf } = withParts()
    expect(resolveRevealTarget(trees, 53, 'arc-1', hostOf))
      .toMatchObject({ expressId: 50, viaHost: true })
  })

  it('climbs within the named model, never through another one', () => {
    // str-1 has no aggregation at all. Asking for a part of arc-1's wall while
    // naming str-1 must not resolve through arc-1's chain and land in str-1.
    const { trees, hostOf } = withParts()
    const target = resolveRevealTarget(trees, 51, 'str-1', hostOf)
    expect(target?.modelId).toBe('arc-1')
    expect(target?.viaHost).toBe(true)
  })

  it('gives up rather than looping on circular aggregation', () => {
    // 90 hosts 91 hosts 90. Real files contain this; an unguarded walk hangs.
    const { trees, hostOf } = withParts()
    expect(resolveRevealTarget(trees, 90, 'arc-1', hostOf)).toBeNull()
  })

  it('returns null for something in no model and part of nothing', () => {
    const { trees, hostOf } = withParts()
    expect(resolveRevealTarget(trees, 9999, 'arc-1', hostOf)).toBeNull()
  })
})

describe('invertDecomposition', () => {
  it('turns host → parts into part → host', () => {
    const inverted = invertDecomposition(new Map([[50, [51, 52]], [10, [20]]]))
    expect(inverted.get(51)).toBe(50)
    expect(inverted.get(52)).toBe(50)
    expect(inverted.get(20)).toBe(10)
    expect(inverted.get(50)).toBeUndefined()
  })

  it('keeps the first host when a part is claimed twice', () => {
    // Malformed but real: an element listed under two aggregates. Picking one
    // deterministically beats letting the last writer win.
    expect(invertDecomposition(new Map([[1, [9]], [2, [9]]])).get(9)).toBe(1)
  })

  it('handles no map at all', () => {
    expect(invertDecomposition(undefined).size).toBe(0)
  })
})
