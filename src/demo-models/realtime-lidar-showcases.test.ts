import { describe, expect, it } from 'vitest'
import { TEMPORAL_LIDAR_SHOWCASES } from './realtime-lidar-showcases'

describe('realtime LiDAR showcase catalogue', () => {
  it('keeps every IFC, cloud and downloadable replay identity unique', () => {
    expect(new Set(TEMPORAL_LIDAR_SHOWCASES.map((item) => item.id)).size)
      .toBe(TEMPORAL_LIDAR_SHOWCASES.length)
    expect(new Set(TEMPORAL_LIDAR_SHOWCASES.map((item) => item.cloudId)).size)
      .toBe(TEMPORAL_LIDAR_SHOWCASES.length)
    expect(new Set(TEMPORAL_LIDAR_SHOWCASES.map((item) => item.modelFileName)).size)
      .toBe(TEMPORAL_LIDAR_SHOWCASES.length)
  })

  // Generating three full frames of a showcase cloud is CPU-bound work: ~1.6 s
  // for the heaviest scene on an idle machine, against vitest's 5 s default. The
  // margin looks comfortable and is not — the suite runs files in parallel, so
  // the budget is whatever is left over, and this timed out once the geo suite
  // grew. Raised well clear of the load rather than left to flake; nothing about
  // what is asserted changes, and a genuine hang still fails.
  it.each(TEMPORAL_LIDAR_SHOWCASES)('$id stays inside its bounded reusable GPU buffer', (showcase) => {
    const source = showcase.createSource()
    const first = source.sample(0, 1)
    const positions = first.positions
    const middle = source.sample(showcase.durationMs / 2, 2)
    const latest = source.sample(showcase.durationMs, 3)

    expect(middle.positions).toBe(positions)
    expect(latest.positions).toBe(positions)
    expect(source.capacity).toBeLessThan(100_000)
    expect(source.basePointCount).toBeGreaterThan(10_000)
    expect(first.count).toBeLessThanOrEqual(source.capacity)
    expect(middle.count).toBeLessThanOrEqual(source.capacity)
    expect(latest.count).toBeLessThanOrEqual(source.capacity)
    expect(latest.timestampMs).toBe(showcase.durationMs)

    for (const value of latest.positions.subarray(0, latest.count * 3)) {
      expect(Number.isFinite(value)).toBe(true)
    }
  }, 30_000)

  it('gives every new exhibition scene a deliberate first camera pose', () => {
    const newScenes = TEMPORAL_LIDAR_SHOWCASES.filter((item) => item.id !== 'operations-pavilion')
    expect(newScenes.every((item) => item.camera)).toBe(true)
    for (const scene of newScenes) {
      expect(scene.camera?.position).not.toEqual(scene.camera?.target)
      expect(scene.camera?.position.y).toBeGreaterThan(scene.camera?.target.y ?? 0)
    }
  })

  it.each(TEMPORAL_LIDAR_SHOWCASES.filter((item) => item.id !== 'operations-pavilion'))(
    '$id is deterministic and changes across time',
    (showcase) => {
      const a = showcase.createSource().sample(showcase.durationMs * 0.42, 7)
      const b = showcase.createSource().sample(showcase.durationMs * 0.42, 7)
      const later = showcase.createSource().sample(showcase.durationMs * 0.78, 8)

      expect(a.count).toBe(b.count)
      expect([...a.positions.subarray(0, a.count * 3)])
        .toEqual([...b.positions.subarray(0, b.count * 3)])
      const dynamicStart = showcase.createSource().basePointCount * 3
      expect([...a.positions.subarray(dynamicStart, dynamicStart + 12)])
        .not.toEqual([...later.positions.subarray(dynamicStart, dynamicStart + 12)])
    },
  )
})
