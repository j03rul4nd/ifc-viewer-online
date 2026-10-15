// ─── pc-gpu-sync tests ────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePointCloudStore } from '../../stores/pointCloudStore'
import { useTopicStore } from '../../stores/topicStore'
import { applyCloudOffset, startPointCloudGpuSync } from './pc-gpu-sync'
import { NO_TOPIC_GREY } from './pc-style'
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

function fakeSystem() {
  return {
    setDisplay: vi.fn(), setRenderBudget: vi.fn(), setAlignment: vi.fn(), setVisible: vi.fn(), setCloudStyle: vi.fn(),
  }
}

describe('startPointCloudGpuSync', () => {
  beforeEach(() => {
    useTopicStore.setState({ topics: [], members: {} })
    usePointCloudStore.setState({
      clouds: [entry('a', { alignment: ALIGNMENT, color: 0x111111 }), entry('b', { alignment: ALIGNMENT, color: 0x222222 })],
    })
  })

  function start() {
    const fake = fakeSystem()
    const stop = startPointCloudGpuSync(() => ({
      peekPointClouds: () => fake as never, getPointClouds: async () => fake as never,
    }))
    for (const fn of Object.values(fake)) fn.mockClear()
    return { fake, stop }
  }

  it('pushes a store placement to the GPU (the SDK bug)', () => {
    const { fake, stop } = start()
    usePointCloudStore.getState().setOffset('a', { x: 5 })
    expect(fake.setAlignment).toHaveBeenCalledTimes(1)
    expect(fake.setAlignment.mock.calls[0][1].offset.x).toBe(5)
    stop()
  })

  it('pushes visibility', () => {
    const { fake, stop } = start()
    usePointCloudStore.getState().setVisible('a', false)
    expect(fake.setVisible).toHaveBeenCalledWith('a', false)
    stop()
  })

  it('pushes a resolved per-scan style', () => {
    const { fake, stop } = start()
    usePointCloudStore.getState().setCloudStyle(['a'], { colorMode: 'flat', flatColor: 0xff0000 })
    expect(fake.setCloudStyle).toHaveBeenCalledWith('a', { colorMode: 'flat', flatColor: 0xff0000, pointSize: 2, opacity: 1 })
    stop()
  })

  it('pushes nothing for progress-only updates', () => {
    const { fake, stop } = start()
    usePointCloudStore.getState().updateCloud('a', { pointCount: 123, progress: 40 })
    for (const fn of Object.values(fake)) expect(fn).not.toHaveBeenCalled()
    stop()
  })

  it("'One colour per scan' restyles every cloud in its identity colour", () => {
    const { fake, stop } = start()
    usePointCloudStore.getState().setDisplayAll({ colorMode: 'scan' })
    expect(fake.setDisplay).toHaveBeenCalledTimes(1)
    expect(fake.setCloudStyle).toHaveBeenCalledWith('a', expect.objectContaining({ colorMode: 'flat', flatColor: 0x111111 }))
    expect(fake.setCloudStyle).toHaveBeenCalledWith('b', expect.objectContaining({ colorMode: 'flat', flatColor: 0x222222 }))
    stop()
  })

  it("'Colour by topic' follows a recolour, and topic-less clouds draw grey", () => {
    usePointCloudStore.getState().setDisplay({ colorMode: 'topic' })
    const id = useTopicStore.getState().createTopic({ name: 'T', color: 0x00ff00 }, ['cloud:url:/a.las'])!
    const { fake, stop } = start()
    useTopicStore.getState().recolorTopic(id, 0x0000ff)
    expect(fake.setCloudStyle).toHaveBeenCalledWith('a', expect.objectContaining({ flatColor: 0x0000ff }))
    expect(fake.setCloudStyle).toHaveBeenCalledWith('b', expect.objectContaining({ flatColor: NO_TOPIC_GREY }))
    stop()
  })

  it('attaches lazily and pushes everything on attach', async () => {
    usePointCloudStore.setState({ clouds: [] })
    const fake = fakeSystem()
    let attached = false
    const getPointClouds = vi.fn(async () => { attached = true; return fake as never })
    const stop = startPointCloudGpuSync(() => ({ peekPointClouds: () => (attached ? fake as never : null), getPointClouds }))
    expect(getPointClouds).not.toHaveBeenCalled()
    usePointCloudStore.getState().addCloud(entry('c', { alignment: ALIGNMENT }))
    usePointCloudStore.getState().updateCloud('c', { progress: 3 })
    expect(getPointClouds).toHaveBeenCalledTimes(1)
    await Promise.resolve(); await Promise.resolve()
    expect(fake.setDisplay).toHaveBeenCalledTimes(1)
    expect(fake.setRenderBudget).toHaveBeenCalledTimes(1)
    expect(fake.setAlignment).toHaveBeenCalledWith('c', ALIGNMENT)
    expect(fake.setCloudStyle).toHaveBeenCalledWith('c', expect.anything())
    stop()
  })

  it('stops pushing once unsubscribed', () => {
    const { fake, stop } = start()
    stop()
    usePointCloudStore.getState().setVisible('a', false)
    usePointCloudStore.getState().setDisplay({ pointSize: 9 })
    for (const fn of Object.values(fake)) expect(fn).not.toHaveBeenCalled()
  })
})
