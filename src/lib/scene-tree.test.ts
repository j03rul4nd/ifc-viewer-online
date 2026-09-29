import { describe, it, expect } from 'vitest'
import { buildSceneTree, moveGroup, nextOrder, LOOSE, type SceneModelDesc } from './scene-tree'

const m = (id: string, extra: Partial<SceneModelDesc> = {}): SceneModelDesc => ({
  id, fileName: `${id}.ifc`, fileKey: `${id}.ifc`, ...extra,
})

describe('buildSceneTree', () => {
  it('falls back to automatic grouping with no user input', () => {
    const t = buildSceneTree({ models: [m('a', { projectName: 'Vela' }), m('b', { projectName: 'Vela' }), m('c')] })
    expect(t.groups.map((g) => g.memberIds)).toEqual([['a', 'b'], ['c']])
    expect(t.groups.every((g) => !g.user)).toBe(true)
  })

  it('a user assignment beats the file identity and user groups list first, in order', () => {
    const t = buildSceneTree({
      models: [m('a', { projectName: 'Vela' }), m('b', { projectName: 'Vela' }), m('c')],
      userGroups: [{ id: 'u2', name: 'Two', order: 1 }, { id: 'u1', name: 'One', order: 0 }],
      modelAssign: { 'b.ifc': 'u2', 'c.ifc': 'u2' },
    })
    expect(t.groups[0]).toMatchObject({ id: 'u1', label: 'One', memberIds: [], user: true })
    expect(t.groups[1]).toMatchObject({ id: 'u2', memberIds: ['b', 'c'], basis: 'user' })
    expect(t.groups[2].memberIds).toEqual(['a'])
  })

  it('LOOSE pulls a file out of its automatic family for good', () => {
    const t = buildSceneTree({
      models: [m('a', { projectName: 'Vela' }), m('b', { projectName: 'Vela' })],
      modelAssign: { 'b.ifc': LOOSE },
    })
    expect(t.groups.map((g) => g.memberIds)).toEqual([['a'], ['b']])
  })

  it('an assignment to a deleted group falls back to automatic', () => {
    const t = buildSceneTree({ models: [m('a')], modelAssign: { 'a.ifc': 'gone' } })
    expect(t.groups).toHaveLength(1)
    expect(t.groups[0].user).toBe(false)
  })

  it('places clouds: explicit group, else aligned model group, else loose', () => {
    const t = buildSceneTree({
      models: [m('a'), m('b')],
      userGroups: [{ id: 'u', name: 'U', order: 0 }],
      modelAssign: { 'a.ifc': 'u' },
      clouds: [
        { id: 'c1', fileKey: 'k1', alignedToModelId: 'b' },
        { id: 'c2', fileKey: 'k2', alignedToModelId: null },
        { id: 'c3', fileKey: 'k3', alignedToModelId: 'a' },
        { id: 'c4', fileKey: 'k4', alignedToModelId: 'a' },
      ],
      cloudAssign: { k2: 'u', k4: LOOSE },
    })
    const u = t.groups.find((g) => g.id === 'u')!
    expect(u.cloudIds).toEqual(['c2', 'c3'])
    expect(t.groupIdOf.c1).toBe(t.groupIdOf.b)
    expect(t.looseCloudIds).toEqual(['c4'])
  })
})

describe('group ordering', () => {
  const gs = [{ id: 'a', name: 'A', order: 0 }, { id: 'b', name: 'B', order: 1 }]
  it('moves a group down and up', () => {
    const down = moveGroup(gs, 'a', 1)
    expect([...down].sort((x, y) => x.order - y.order).map((g) => g.id)).toEqual(['b', 'a'])
  })
  it('does nothing off the ends', () => {
    expect(moveGroup(gs, 'a', -1)).toEqual(gs)
  })
  it('nextOrder appends', () => {
    expect(nextOrder(gs)).toBe(2)
    expect(nextOrder([])).toBe(0)
  })
})
