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
  groupPositionUpdates, groupReferencePosition,
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

describe('the ladder merges rather than short-circuits', () => {
  // Read off the three real files in public/models/hotel-vela: their authoring
  // tool minted a different IfcProject GlobalId for each, and all three agree on
  // project and site name. This is the case the feature exists for, so it is
  // pinned to the actual values rather than to a plausible-looking fixture.
  const vela = [
    m('a', { projectGuid: '28rVpZtUPPz8uNKGH3H9YJ', projectName: 'Hotel Vela', siteName: 'Placa de la Rosa dels Vents' }),
    m('s', { projectGuid: '1onHx4drnVV93_YTjbSOlC', projectName: 'Hotel Vela', siteName: 'Placa de la Rosa dels Vents' }),
    m('mep', { projectGuid: '1DPBBMtxvILPs67GX4x_2B', projectName: 'Hotel Vela', siteName: 'Placa de la Rosa dels Vents' }),
  ]

  it('groups files whose GUIDs differ but whose project and site names agree', () => {
    const groups = groupModels(vela)
    expect(groups).toHaveLength(1)
    expect(groups[0].memberIds.sort()).toEqual(['a', 'mep', 's'])
  })

  it('reports the weaker basis it actually used, not the GUID rung', () => {
    expect(groupModels(vela)[0].basis).toBe('projectName')
  })

  it('still keeps a differently-named project apart, GUIDs or not', () => {
    const groups = groupModels([
      ...vela,
      m('other', { projectGuid: 'ZZZ', projectName: 'Torre Poblenou', siteName: 'Poblenou' }),
    ])
    expect(groups).toHaveLength(2)
    expect(groupOf(groups, 'other')?.memberIds).toEqual(['other'])
  })

  it('does not coalesce on a project name neither file states', () => {
    const groups = groupModels([
      m('x', { projectGuid: 'G1', siteName: 'Same Site' }),
      m('y', { projectGuid: 'G2', siteName: 'Same Site' }),
    ])
    expect(groups).toHaveLength(2)
  })

  it('leaves a user override alone when an automatic rule would merge it away', () => {
    const groups = groupModels([
      m('a', { projectName: 'Hotel Vela', siteName: 'S' }),
      m('b', { projectName: 'Hotel Vela', siteName: 'S' }),
      m('c', { projectName: 'Hotel Vela', siteName: 'S', userGroupId: 'mine' }),
    ])
    expect(groupOf(groups, 'c')?.memberIds).toEqual(['c'])
    expect(groupOf(groups, 'a')?.memberIds).toEqual(['a', 'b'])
  })

  it('still prefers the GUID when it is the only agreement', () => {
    const groups = groupModels([
      m('a', { projectGuid: 'SHARED' }),
      m('b', { projectGuid: 'SHARED' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].basis).toBe('projectGuid')
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

describe('groupPositionUpdates', () => {
  const members = [
    { id: 'a', position: { x: 0, y: 0, z: 0 } },
    { id: 'b', position: { x: 10, y: 0, z: 5 } },
    { id: 'c', position: { x: -4, y: 2, z: 0 } },
  ]

  it('moves every member by the SAME delta', () => {
    // THE SAFETY PROPERTY. The offsets between files are the information; only
    // their common origin is being edited.
    const out = groupPositionUpdates(members, 'a', 'x', 100)
    expect(out.map((m) => m.position.x)).toEqual([100, 110, 96])
  })

  it('lands the reference exactly on the typed value', () => {
    // The user is reading and typing into one file's number. It must end up
    // being that number, not near it.
    expect(groupPositionUpdates(members, 'b', 'x', 42).find((m) => m.id === 'b')!
      .position.x).toBe(42)
  })

  it('preserves relative offsets, which is what makes it a federation', () => {
    const out = groupPositionUpdates(members, 'a', 'z', 30)
    const by = Object.fromEntries(out.map((m) => [m.id, m.position]))
    expect(by.b.z - by.a.z).toBe(5)
    expect(by.c.z - by.a.z).toBe(0)
  })

  it('never touches the other axes', () => {
    const out = groupPositionUpdates(members, 'a', 'x', 100)
    expect(out.map((m) => m.position.y)).toEqual([0, 0, 2])
    expect(out.map((m) => m.position.z)).toEqual([0, 5, 0])
  })

  it('is a no-op for a zero delta, and still returns fresh objects', () => {
    // Returning the caller's objects would let a later mutation reach into the
    // store's state.
    const out = groupPositionUpdates(members, 'a', 'x', 0)
    expect(out.map((m) => m.position.x)).toEqual([0, 10, -4])
    expect(out[0].position).not.toBe(members[0].position)
  })

  it('falls back to the first member when the reference is gone', () => {
    // A model removed mid-edit must not make the whole group unmovable.
    expect(groupPositionUpdates(members, 'ghost', 'x', 5)[0].position.x).toBe(5)
  })

  it('survives an empty group', () => {
    expect(groupPositionUpdates([], 'a', 'x', 5)).toEqual([])
  })
})

describe('groupReferencePosition', () => {
  const members = [
    { id: 'a', position: { x: 0, y: 0, z: 0 } },
    { id: 'b', position: { x: 10, y: 0, z: 0 } },
  ]

  it('shows a real member position, not a centroid', () => {
    // A centroid is a number that belongs to nothing: nudge it and no file ends
    // up there, and a user checking against one file finds a value they cannot
    // account for.
    expect(groupReferencePosition(members, 'b')).toEqual({ x: 10, y: 0, z: 0 })
  })

  it('copies rather than aliasing the member', () => {
    const p = groupReferencePosition(members, 'a')
    expect(p).not.toBe(members[0].position)
  })

  it('survives an empty group', () => {
    expect(groupReferencePosition([], 'a')).toEqual({ x: 0, y: 0, z: 0 })
  })
})
