// ─── pc-gpu-sync tests ────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePointCloudStore } from '../../stores/pointCloudStore'
import { applyCloudOffset } from './pc-gpu-sync'
import { DEFAULT_DISPLAY, type PointCloudEntry, type PointCloudAlignment } from './pc-types'

function entry(id: string, patch: Partial<PointCloudEntry> = {}): PointCloudEntry {
  return {
    id, fileName: `${id}.las`, fileSize: 1024, format: 'las',
    status: 'ready', errorKey: null, progress: 100,
    pointCount: 10, declaredCount: null, truncated: false, streamErrorKey: null, visible: true,
    frame: null,
    attributes: { color: true, intensity: false, classification: false, confidence: false },
    alignment: null, alignedToModelId: null, fileKey: `url:/${id}.las`, loadedAt: 1,
    ...patch,
  }
}

const ALIGNMENT: PointCloudAlignment = {
  rung: 'local', confidence: 'high',
  origin: { x: 0, y: 0, z: 0 }, yawRad: 0, scale: 1, upAxis: 'z',
  reasons: [], offset: { x: 0, y: 0, z: 0, yawDeg: 0, pitchDeg: 0, rollDeg: 0, scaleMul: 1 },
}

beforeEach(() => {
  localStorage.clear()
  usePointCloudStore.setState({
    clouds: [entry('a', { alignment: ALIGNMENT }), entry('b')],
    activeCloudId: 'a', panelOpen: false, display: { ...DEFAULT_DISPLAY }, epoch: 0,
  })
})

describe('applyCloudOffset', () => {
  it('writes the store and applies the new alignment to the GPU synchronously', () => {
    const system = { setAlignment: vi.fn() }
    const result = applyCloudOffset(system, 'a', { yawDeg: 10 })
    expect(result?.offset.yawDeg).toBe(10)
    expect(system.setAlignment).toHaveBeenCalledTimes(1)
    expect(system.setAlignment.mock.calls[0][0]).toBe('a')
    expect(system.setAlignment.mock.calls[0][1].offset.yawDeg).toBe(10)
    expect(usePointCloudStore.getState().clouds[0].alignment?.offset.yawDeg).toBe(10)
  })

  it('returns null for an unknown cloud and for one not placed yet', () => {
    const system = { setAlignment: vi.fn() }
    expect(applyCloudOffset(system, 'nope', { x: 1 })).toBeNull()
    expect(applyCloudOffset(system, 'b', { x: 1 })).toBeNull()
    expect(system.setAlignment).not.toHaveBeenCalled()
  })

  it('still updates the store without a system', () => {
    expect(applyCloudOffset(null, 'a', { x: 3 })?.offset.x).toBe(3)
    expect(usePointCloudStore.getState().clouds[0].alignment?.offset.x).toBe(3)
  })
})
