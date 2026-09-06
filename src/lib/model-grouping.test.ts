// ─── model-grouping tests ─────────────────────────────────────────────────────
// THE RULE THIS FILE EXISTS FOR:
//
//   grouping too eagerly is worse than not grouping at all.
//
// A federation that fails to group costs a user three drags instead of one. A
// grouping that swallows the neighbouring building moves someone else's model
// when you drag yours, and they will not notice until it is in a client
// meeting. Every test below that looks paranoid is guarding that asymmetry.

import { describe, it, expect } from 'vitest'
import {
  groupModels, groupOf, moveTargets, sharedPrefix, identityFromTree, SITE_PROXIMITY_M,
  type ModelDescriptor,
} from './model-grouping'

const m = (id: string, extra: Partial<ModelDescriptor> = {}): ModelDescriptor => ({
  id, fileName: `${id}.ifc`, ...extra,
})

describe('groupModels', () => {
  it('joins a federation on its shared project GUID', () => {
    // Architecture, structure and MEP of one building, authored against one
    // IfcProject. This is the case the feature exists for.
    const groups = groupModels([
      m('arc', { projectGuid: 'P1', fileName: 'HOTEL-A.ifc' }),
      m('str', { projectGuid: 'P1', fileName: 'HOTEL-S.ifc' }),
      m('mep', { projectGuid: 'P1', fileName: 'HOTEL-M.ifc' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].memberIds).toEqual(['arc', 'str', 'mep'])
    expect(groups[0].basis).toBe('projectGuid')
  })

  it('keeps two different buildings apart even on the same site', () => {
    // THE FAILURE THAT MATTERS. Two buildings on one block are metres apart.
    // Anything that joins them moves a model the user did not select.
    const groups = groupModels([
      m('hotel', { projectGuid: 'P1', lat: 41.3851, lon: 2.1734 }),
      m('tower', { projectGuid: 'P2', lat: 41.3851, lon: 2.1735 }),
    ])
    expect(groups).toHaveLength(2)
  })

  it('falls back to project + site name when GUIDs disagree', () => {
    // Different tools mint different GUIDs for the same delivery. The names
    // usually still agree, and that is worth something — just less.
    const groups = groupModels([
      m('a', { projectName: 'Hotel Vela', siteName: 'Barceloneta' }),
      m('b', { projectName: 'Hotel Vela', siteName: 'Barceloneta' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].basis).toBe('projectName')
    expect(groups[0].label).toBe('Hotel Vela')
  })

  it('does not join two projects that share only a site', () => {
    // A site name is a place, not a delivery. Half a city can share one.
    const groups = groupModels([
      m('a', { projectName: 'Hotel Vela', siteName: 'Barceloneta' }),
      m('b', { projectName: 'Torre Poblenou', siteName: 'Barceloneta' }),
    ])
    expect(groups).toHaveLength(2)
  })

  it('joins files that carry only coordinates, and only if truly co-located', () => {
    const near = groupModels([
      m('a', { lat: 41.3851, lon: 2.17340 }),
      m('b', { lat: 41.3851, lon: 2.17341 }),
    ])
    expect(near).toHaveLength(1)
    expect(near[0].basis).toBe('proximity')

    // A hundred metres is the building next door, not another file of this one.
    const far = groupModels([
      m('a', { lat: 41.3851, lon: 2.1734 }),
      m('b', { lat: 41.3860, lon: 2.1734 }),
    ])
    expect(far).toHaveLength(2)
  })

  it('never absorbs an anonymous file into a named project', () => {
    // A file that states no project must not join one on the strength of being
    // nearby: that is proximity deciding a question proximity cannot answer.
    const groups = groupModels([
      m('named', { projectGuid: 'P1', lat: 41.3851, lon: 2.1734 }),
      m('anon', { lat: 41.3851, lon: 2.1734 }),
    ])
    expect(groups).toHaveLength(2)
  })

  it('lets a hand-made group beat every automatic rule', () => {
    // No rule is right every time, and being wrong means someone cannot move
    // their model. The override is the escape hatch.
    const groups = groupModels([
      m('a', { projectGuid: 'P1', userGroupId: 'mine' }),
      m('b', { projectGuid: 'P2', userGroupId: 'mine' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].basis).toBe('user')
  })

  it('gives a lone file its own group, reported as single', () => {
    // The ordinary case, and not a failure to group.
    const groups = groupModels([m('solo', { projectGuid: 'P1' })])
    expect(groups).toHaveLength(1)
    expect(groups[0].basis).toBe('single')
  })

  it('is stable in input order so the tree does not reshuffle', () => {
    const input = [
      m('z', { projectGuid: 'P2' }),
      m('a', { projectGuid: 'P1' }),
      m('b', { projectGuid: 'P1' }),
    ]
    expect(groupModels(input).map((g) => g.memberIds[0])).toEqual(['z', 'a'])
    expect(groupModels(input)).toEqual(groupModels(input))
  })

  it('handles the scene the request described', () => {
    // Three files of one hotel, one file of another building, two of a third.
    const groups = groupModels([
      m('v1', { projectGuid: 'VELA' }), m('v2', { projectGuid: 'VELA' }),
      m('v3', { projectGuid: 'VELA' }),
      m('other', { projectGuid: 'OTHER' }),
      m('t1', { projectGuid: 'TORRE' }), m('t2', { projectGuid: 'TORRE' }),
    ])
    expect(groups.map((g) => g.memberIds.length)).toEqual([3, 1, 2])
  })

  it('survives an empty scene', () => {
    expect(groupModels([])).toEqual([])
  })
})

describe('sharedPrefix', () => {
  it('labels a group from what its file names agree on', () => {
    expect(sharedPrefix(['BCN-IVO-A-0002.ifc', 'BCN-IVO-S-0002.ifc'])).toBe('BCN-IVO')
  })

  it('declines when the agreement is too short to mean anything', () => {
    expect(sharedPrefix(['a.ifc', 'b.ifc'])).toBeNull()
  })

  it('declines for a single name — a prefix of one is the name', () => {
    expect(sharedPrefix(['only.ifc'])).toBeNull()
  })
})

describe('moveTargets', () => {
  const groups = groupModels([
    m('a', { projectGuid: 'P1' }), m('b', { projectGuid: 'P1' }),
    m('c', { projectGuid: 'P2' }),
  ])

  it('moves the whole federation when the group is dragged', () => {
    // The same delta to every member, so relative positions — which is what a
    // federation IS — survive the move.
    expect(moveTargets(groups, 'g-a', 'group')).toEqual(['a', 'b'])
  })

  it('moves one file when one file was selected', () => {
    expect(moveTargets(groups, 'a', 'model')).toEqual(['a'])
  })

  it('accepts a member id as a stand-in for its group', () => {
    expect(moveTargets(groups, 'b', 'group')).toEqual(['a', 'b'])
  })

  it('never returns nothing, whatever it is handed', () => {
    // A move that silently targets no model looks like a broken drag.
    expect(moveTargets(groups, 'unknown', 'group')).toEqual(['unknown'])
    expect(moveTargets([], 'x', 'group')).toEqual(['x'])
  })
})

describe('groupOf', () => {
  it('finds the group holding a model', () => {
    const groups = groupModels([m('a', { projectGuid: 'P1' }), m('b', { projectGuid: 'P1' })])
    expect(groupOf(groups, 'b')?.memberIds).toEqual(['a', 'b'])
    expect(groupOf(groups, 'nope')).toBeNull()
  })
})

describe('SITE_PROXIMITY_M', () => {
  it('is tight enough to exclude the building next door', () => {
    // Buildings on one block are tens of metres apart. A threshold in the
    // hundreds would join a hotel to its neighbour.
    expect(SITE_PROXIMITY_M).toBeLessThan(50)
  })
})

describe('identityFromTree', () => {
  const tree = [{
    ifcClass: 'IfcProject', globalId: 'P-GUID', name: 'Hotel Vela',
    children: [{
      ifcClass: 'IfcSite', globalId: 'S-GUID', name: 'Barceloneta',
      children: [{ ifcClass: 'IfcBuilding', globalId: 'B', name: 'Tower' }],
    }],
  }]

  it('reads the project and site the validator already parsed', () => {
    // No new extraction: every model gets a spatial tree built anyway, and an
    // IFC tree begins at IfcProject and runs through IfcSite.
    expect(identityFromTree(tree)).toEqual({
      projectGuid: 'P-GUID', projectName: 'Hotel Vela', siteName: 'Barceloneta',
    })
  })

  it('answers nulls before the tree exists, rather than throwing', () => {
    // Trees are built in the background. Grouping just falls to a weaker rung
    // until one arrives, and re-runs when it does.
    expect(identityFromTree(null)).toEqual({
      projectGuid: null, projectName: null, siteName: null,
    })
    expect(identityFromTree([])).toEqual({
      projectGuid: null, projectName: null, siteName: null,
    })
  })

  it('takes the FIRST project, because a tree is a containment hierarchy', () => {
    expect(identityFromTree([
      { ifcClass: 'IfcProject', globalId: 'A', name: 'First' },
      { ifcClass: 'IfcProject', globalId: 'B', name: 'Second' },
    ]).projectGuid).toBe('A')
  })

  it('treats an empty name as absent rather than as a group key', () => {
    // Grouping on '' would join every unnamed file in the scene into one.
    expect(identityFromTree([
      { ifcClass: 'IfcProject', globalId: '  ', name: '   ' },
    ])).toEqual({ projectGuid: null, projectName: null, siteName: null })
  })

  it('is case-insensitive about the class name', () => {
    expect(identityFromTree([
      { ifcClass: 'IFCPROJECT', globalId: 'X', name: 'P' },
    ]).projectGuid).toBe('X')
  })

  it('groups two files of one federation from their trees alone', () => {
    // End to end: the tree is the only input, and the two files land together.
    const a = identityFromTree(tree)
    const groups = groupModels([
      { id: 'a', fileName: 'A.ifc', ...a },
      { id: 'b', fileName: 'B.ifc', ...identityFromTree(tree) },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].basis).toBe('projectGuid')
    expect(groups[0].label).toBe('Hotel Vela')
  })
})
