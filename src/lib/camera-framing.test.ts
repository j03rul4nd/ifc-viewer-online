import { describe, it, expect } from 'vitest'
import { resolveFraming, presetPose, SPREAD_LIMIT_M, type FramingItem } from './camera-framing'

function item(id: string, x: number, opts: Partial<FramingItem> = {}): FramingItem {
  return {
    id,
    kind: 'model',
    groupId: null,
    visible: true,
    box: { min: { x, y: 0, z: 0 }, max: { x: x + 10, y: 10, z: 10 } },
    ...opts,
  }
}

describe('resolveFraming', () => {
  it('returns null when nothing is visible — presets disable instead of inventing a box', () => {
    expect(resolveFraming({ items: [], activeModelId: null, scope: 'auto' })).toBeNull()
    expect(resolveFraming({ items: [item('a', 0, { visible: false })], activeModelId: 'a', scope: 'all' })).toBeNull()
  })

  it('frames only clouds when there is no model', () => {
    const r = resolveFraming({ items: [item('c', 0, { kind: 'cloud' })], activeModelId: null, scope: 'active' })
    expect(r?.scope).toBe('all')
    expect(r?.itemIds).toEqual(['c'])
  })

  it('group scope takes every member of the active model group and nothing else', () => {
    const items = [item('a', 0, { groupId: 'g1' }), item('b', 20, { groupId: 'g1' }), item('c', 40, { groupId: 'g2' })]
    const r = resolveFraming({ items, activeModelId: 'a', scope: 'group' })
    expect(r?.itemIds).toEqual(['a', 'b'])
    expect(r?.box.max.x).toBe(30)
  })

  it('group scope includes the clouds of that group', () => {
    const items = [item('a', 0, { groupId: 'g1' }), item('c', 20, { kind: 'cloud', groupId: 'g1' }), item('d', 90, { kind: 'cloud' })]
    const r = resolveFraming({ items, activeModelId: 'a', scope: 'group' })
    expect(r?.itemIds).toEqual(['a', 'c'])
  })

  it('all scope includes models and clouds', () => {
    const items = [item('a', 0), item('c', 50, { kind: 'cloud' })]
    const r = resolveFraming({ items, activeModelId: 'a', scope: 'all' })
    expect(r?.itemIds).toEqual(['a', 'c'])
  })

  it('auto narrows to the active group when the scene is spread across sites', () => {
    const items = [item('a', 0, { groupId: 'g1' }), item('b', 5, { groupId: 'g1' }), item('far', SPREAD_LIMIT_M * 3, { groupId: 'g2' })]
    const r = resolveFraming({ items, activeModelId: 'a', scope: 'auto' })
    expect(r?.narrowed).toBe(true)
    expect(r?.itemIds).toEqual(['a', 'b'])
  })

  it('auto keeps everything when it is compact', () => {
    const items = [item('a', 0, { groupId: 'g1' }), item('far', 100, { groupId: 'g2' })]
    const r = resolveFraming({ items, activeModelId: 'a', scope: 'auto' })
    expect(r?.narrowed).toBe(false)
    expect(r?.scope).toBe('all')
  })

  it('active scope falls back to the group/all when the active model is hidden', () => {
    const items = [item('a', 0, { visible: false }), item('b', 20)]
    const r = resolveFraming({ items, activeModelId: 'a', scope: 'active' })
    expect(r?.itemIds).toEqual(['b'])
  })

  it('ignores non-finite boxes (an empty model box)', () => {
    const bad = item('x', 0, { box: { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } } })
    const r = resolveFraming({ items: [bad, item('b', 0)], activeModelId: 'x', scope: 'auto' })
    expect(r?.itemIds).toEqual(['b'])
  })
})

describe('presetPose', () => {
  const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } }

  it('targets the box centre and looks from above for top', () => {
    const p = presetPose(box, 'top')
    expect(p.target).toEqual({ x: 5, y: 5, z: 5 })
    expect(p.position.y).toBeGreaterThan(5)
    expect(Math.abs(p.position.x - 5)).toBeLessThan(0.01)
  })

  it('scales distance with the scene size', () => {
    const small = presetPose(box, 'front')
    const big = presetPose({ min: { x: 0, y: 0, z: 0 }, max: { x: 1000, y: 10, z: 10 } }, 'front')
    expect(big.position.z - big.target.z).toBeGreaterThan((small.position.z - small.target.z) * 50)
  })

  it('backs off further in portrait so the width still fits', () => {
    const wide = presetPose(box, 'front', 45, 16 / 9)
    const tall = presetPose(box, 'front', 45, 0.5)
    expect(tall.position.z).toBeGreaterThan(wide.position.z)
  })
})
