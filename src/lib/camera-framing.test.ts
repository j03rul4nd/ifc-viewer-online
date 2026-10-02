import { describe, it, expect } from 'vitest'
import { resolveFraming, presetPose, fitPose, PRESET_VIEW, SPREAD_LIMIT_M, type FramingItem } from './camera-framing'

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

describe('fitPose', () => {
  // A long, low building: 60 × 12 × 20 m, centred at the origin.
  const box = { min: { x: -30, y: -6, z: -10 }, max: { x: 30, y: 6, z: 10 } }

  /** Largest |tan| of the corners seen from the pose, per screen axis. */
  function extent(pose: ReturnType<typeof fitPose>) {
    const f = { x: pose.target.x - pose.position.x, y: pose.target.y - pose.position.y, z: pose.target.z - pose.position.z }
    const fl = Math.hypot(f.x, f.y, f.z)
    const fwd = { x: f.x / fl, y: f.y / fl, z: f.z / fl }
    let r = { x: -fwd.z, y: 0, z: fwd.x }
    const rl = Math.hypot(r.x, r.z); r = { x: r.x / rl, y: 0, z: r.z / rl }
    const u = { x: r.y * fwd.z - r.z * fwd.y, y: r.z * fwd.x - r.x * fwd.z, z: r.x * fwd.y - r.y * fwd.x }
    let h = 0, v = 0
    for (const x of [-30, 30]) for (const y of [-6, 6]) for (const z of [-10, 10]) {
      const d = { x: x - pose.position.x, y: y - pose.position.y, z: z - pose.position.z }
      const depth = d.x * fwd.x + d.y * fwd.y + d.z * fwd.z
      h = Math.max(h, Math.abs(d.x * r.x + d.y * r.y + d.z * r.z) / depth)
      v = Math.max(v, Math.abs(d.x * u.x + d.y * u.y + d.z * u.z) / depth)
    }
    return { h, v }
  }

  it('fills the frame to the requested ratio on the tighter axis', () => {
    const fov = 45, aspect = 16 / 9, fill = 0.8
    const pose = fitPose(box, PRESET_VIEW.iso, fov, aspect, fill)
    const tanV = Math.tan((fov * Math.PI) / 360)
    const { h, v } = extent(pose)
    const used = Math.max(h / (tanV * aspect), v / tanV)
    expect(used).toBeCloseTo(fill, 2)
  })

  it('is closer than the bounding-sphere preset for a long low building', () => {
    const tight = fitPose(box, PRESET_VIEW.iso, 45, 16 / 9, 0.85)
    const loose = presetPose(box, 'iso', 45, 16 / 9)
    const d = (p: { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } }) =>
      Math.hypot(p.position.x - p.target.x, p.position.y - p.target.y, p.position.z - p.target.z)
    expect(d(tight)).toBeLessThan(d(loose) * 0.8)
  })

  it('looks from the requested angles', () => {
    const pose = fitPose(box, { azimuthDeg: 0, elevationDeg: 30 })
    const dx = pose.position.x - pose.target.x, dy = pose.position.y - pose.target.y, dz = pose.position.z - pose.target.z
    expect(Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI).toBeCloseTo(30, 6)
    expect(dz).toBeCloseTo(0, 6)
    expect(dx).toBeGreaterThan(0)
  })

  it('a top view stays defined, and fill is clamped', () => {
    const pose = fitPose(box, PRESET_VIEW.top, 45, 1, 5)
    expect(Number.isFinite(pose.position.x + pose.position.y + pose.position.z)).toBe(true)
    expect(pose.position.y).toBeGreaterThan(6)
  })
})
