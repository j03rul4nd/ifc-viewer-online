import { describe, expect, it, vi } from 'vitest'
import {
  createPavilionLidarReplay, pavilionReplayAlignment, PAVILION_LIDAR_DURATION_MS,
} from '../../demo-models/pavilion-lidar-replay'
import { TemporalReplayController } from './temporal-replay'

describe('pavilion LiDAR replay source', () => {
  it('anchors its authored floor to the imported IFC scene bounds', () => {
    const alignment = pavilionReplayAlignment({
      center: { x: 120, y: 22.475, z: -40 },
      size: { x: 18, y: 5.45, z: 12 },
    })
    expect(alignment.origin).toEqual({ x: 120, y: 20, z: -40 })
    expect(alignment.confidence).toBe('exact')
  })

  it('reuses its typed arrays while the accumulated scan grows', () => {
    const source = createPavilionLidarReplay()
    const early = source.sample(1_000, 1)
    const positions = early.positions
    const middle = source.sample(8_000, 2)
    const latest = source.sample(PAVILION_LIDAR_DURATION_MS, 3)

    expect(middle.positions).toBe(positions)
    expect(latest.positions).toBe(positions)
    expect(early.count).toBeLessThan(middle.count)
    expect(middle.count).toBeLessThan(latest.count)
    expect(latest.count).toBeLessThanOrEqual(source.capacity)
    expect(latest.timestampMs).toBe(PAVILION_LIDAR_DURATION_MS)
  })

  it('is deterministic for the same playback timestamp', () => {
    const a = createPavilionLidarReplay().sample(7_500, 10)
    const b = createPavilionLidarReplay().sample(7_500, 10)
    expect(a.count).toBe(b.count)
    expect([...a.positions.subarray(0, 120)]).toEqual([...b.positions.subarray(0, 120)])
  })
})

describe('TemporalReplayController', () => {
  it('supports play, throttled frame emission, seek, speed and latest', () => {
    let now = 0
    const scheduled: FrameRequestCallback[] = []
    const onFrame = vi.fn()
    const makeFrame = (positionMs: number, sequence: number) => ({
      sequence, timestampMs: positionMs, count: 0,
      origin: { x: 0, y: 0, z: 0 }, radius: 1,
      positions: new Float32Array(), colors: null, intensity: null,
      classification: null, confidence: null,
    })
    const controller = new TemporalReplayController({
      durationMs: 1_000,
      frameRate: 10,
      createFrame: makeFrame,
      onFrame,
      now: () => now,
      requestFrame: (callback) => { scheduled.push(callback); return 7 },
      cancelFrame: vi.fn(),
    })

    controller.play()
    expect(controller.snapshot().status).toBe('playing')
    expect(onFrame).toHaveBeenCalledTimes(1)

    now = 50
    scheduled.shift()!(now)
    expect(onFrame).toHaveBeenCalledTimes(1)
    now = 120
    scheduled.shift()!(now)
    expect(onFrame).toHaveBeenCalledTimes(2)

    controller.pause()
    expect(controller.snapshot().status).toBe('paused')
    controller.seek(500)
    expect(controller.snapshot().positionMs).toBe(500)
    controller.setSpeed(2)
    expect(controller.snapshot().speed).toBe(2)
    controller.jumpToLatest()
    expect(controller.snapshot().status).toBe('ended')
    expect(controller.snapshot().positionMs).toBe(1_000)
  })
})
