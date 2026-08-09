// ─── pointCloudStore tests ────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest'
import { usePointCloudStore, parseDisplay } from './pointCloudStore'
import { DEFAULT_DISPLAY, type PointCloudEntry, type PointCloudAlignment } from '../lib/pointcloud/pc-types'

function entry(id: string, patch: Partial<PointCloudEntry> = {}): PointCloudEntry {
  return {
    id, fileName: `${id}.las`, fileSize: 1024, format: 'las',
    status: 'parsing', errorKey: null, progress: 0,
    pointCount: 0, declaredCount: null, truncated: false, visible: true,
    frame: null,
    attributes: { color: false, intensity: false, classification: false, confidence: false },
    alignment: null, alignedToModelId: null, fileKey: `${id}.las:1024:1`, loadedAt: 1,
    ...patch,
  }
}

const ALIGNMENT: PointCloudAlignment = {
  rung: 'local', confidence: 'high',
  origin: { x: 1, y: 2, z: 3 }, yawRad: 0.5, scale: 1, upAxis: 'z',
  reasons: [], offset: { x: 0, y: 0, z: 0, yawDeg: 0, pitchDeg: 0, rollDeg: 0, scaleMul: 1 },
}

beforeEach(() => {
  usePointCloudStore.setState({
    clouds: [], activeCloudId: null, panelOpen: false, display: { ...DEFAULT_DISPLAY }, epoch: 0,
  })
})

describe('pointCloudStore', () => {
  it('makes a newly added cloud active', () => {
    usePointCloudStore.getState().addCloud(entry('a'))
    usePointCloudStore.getState().addCloud(entry('b'))
    expect(usePointCloudStore.getState().activeCloudId).toBe('b')
    expect(usePointCloudStore.getState().clouds).toHaveLength(2)
  })

  it('replaces rather than duplicates a cloud re-added under the same id', () => {
    usePointCloudStore.getState().addCloud(entry('a'))
    usePointCloudStore.getState().addCloud(entry('a', { fileSize: 9 }))
    expect(usePointCloudStore.getState().clouds).toHaveLength(1)
    expect(usePointCloudStore.getState().clouds[0].fileSize).toBe(9)
  })

  it('bumps the epoch on removal so in-flight worker output is discarded', () => {
    usePointCloudStore.getState().addCloud(entry('a'))
    const before = usePointCloudStore.getState().epoch
    usePointCloudStore.getState().removeCloud('a')
    expect(usePointCloudStore.getState().epoch).toBe(before + 1)
    expect(usePointCloudStore.getState().activeCloudId).toBeNull()
  })

  it('promotes another cloud when the active one is removed', () => {
    usePointCloudStore.getState().addCloud(entry('a'))
    usePointCloudStore.getState().addCloud(entry('b'))
    usePointCloudStore.getState().removeCloud('b')
    expect(usePointCloudStore.getState().activeCloudId).toBe('a')
  })

  it('bumps the epoch on clearClouds but keeps display preferences', () => {
    usePointCloudStore.getState().addCloud(entry('a'))
    usePointCloudStore.getState().setDisplay({ pointSize: 8 })
    usePointCloudStore.getState().clearClouds()
    expect(usePointCloudStore.getState().clouds).toHaveLength(0)
    expect(usePointCloudStore.getState().epoch).toBeGreaterThan(0)
    expect(usePointCloudStore.getState().display.pointSize).toBe(8)
  })

  it('merges and clamps a manual offset without disturbing the derived transform', () => {
    usePointCloudStore.getState().addCloud(entry('a', { alignment: ALIGNMENT }))
    usePointCloudStore.getState().setOffset('a', { x: 5 })
    usePointCloudStore.getState().setOffset('a', { yawDeg: 45, pitchDeg: 0, rollDeg: 0, scaleMul: 0 })

    const cloud = usePointCloudStore.getState().clouds[0]
    expect(cloud.alignment!.offset.x).toBe(5)          // earlier nudge survives
    expect(cloud.alignment!.offset.yawDeg).toBe(45)
    expect(cloud.alignment!.offset.scaleMul).toBeGreaterThan(0)  // clamped away from zero
    expect(cloud.alignment!.origin).toEqual(ALIGNMENT.origin)
    expect(cloud.alignment!.yawRad).toBe(ALIGNMENT.yawRad)
  })

  it('resets an offset back to identity', () => {
    usePointCloudStore.getState().addCloud(entry('a', { alignment: ALIGNMENT }))
    usePointCloudStore.getState().setOffset('a', { x: 5, yawDeg: 30 })
    usePointCloudStore.getState().resetOffset('a')
    expect(usePointCloudStore.getState().clouds[0].alignment!.offset)
      .toEqual({ x: 0, y: 0, z: 0, yawDeg: 0, pitchDeg: 0, rollDeg: 0, scaleMul: 1 })
  })

  it('ignores an offset on a cloud with no alignment yet', () => {
    usePointCloudStore.getState().addCloud(entry('a'))
    expect(() => usePointCloudStore.getState().setOffset('a', { x: 1 })).not.toThrow()
    expect(usePointCloudStore.getState().clouds[0].alignment).toBeNull()
  })

  it('clamps the render budget to a sane window', () => {
    usePointCloudStore.getState().setRenderBudget(10)
    expect(usePointCloudStore.getState().renderBudget).toBe(250_000)
    usePointCloudStore.getState().setRenderBudget(999_000_000)
    expect(usePointCloudStore.getState().renderBudget).toBe(20_000_000)
  })
})

describe('parseDisplay', () => {
  it('falls back to defaults for missing or corrupt storage', () => {
    expect(parseDisplay(null)).toEqual(DEFAULT_DISPLAY)
    expect(parseDisplay('not json')).toEqual(DEFAULT_DISPLAY)
    expect(parseDisplay('[1,2,3]')).toEqual(DEFAULT_DISPLAY)
  })

  it('clamps out-of-range values instead of trusting them', () => {
    const d = parseDisplay(JSON.stringify({ pointSize: 9999, opacity: -5, density: 40 }))
    expect(d.pointSize).toBe(20)
    expect(d.opacity).toBe(0.05)
    expect(d.density).toBe(1)
  })

  it('rejects an unknown colour mode', () => {
    expect(parseDisplay(JSON.stringify({ colorMode: 'thermal' })).colorMode).toBe(DEFAULT_DISPLAY.colorMode)
  })

  it('round-trips a valid settings object', () => {
    const source = { ...DEFAULT_DISPLAY, pointSize: 3.5, colorMode: 'elevation' as const, attenuate: true }
    expect(parseDisplay(JSON.stringify(source))).toEqual(source)
  })
})
