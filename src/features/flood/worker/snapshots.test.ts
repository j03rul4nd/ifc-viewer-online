// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { SnapshotStore, snapshotInterval } from './snapshots'
import { fromHalf, toHalf } from '../core/half'

const frame = (cells: number, h: (c: number) => number, u = 0, v = 0, hMax = 0): Uint16Array => {
  const f = new Uint16Array(cells * 4)
  for (let c = 0; c < cells; c++) { f[c * 4] = toHalf(h(c)); f[c * 4 + 1] = toHalf(u); f[c * 4 + 2] = toHalf(v); f[c * 4 + 3] = toHalf(hMax) }
  return f
}

describe('snapshot store', () => {
  it('interpolates between the two snapshots around a time', () => {
    const s = new SnapshotStore(10, 60)
    s.add(0, frame(10, () => 0))
    s.add(60, frame(10, (c) => c * 0.1, 1, 0, 0.9))
    const mid = s.frameAt(30)!
    expect(fromHalf(mid[5 * 4])).toBeCloseTo(0.25, 2)
    expect(fromHalf(mid[5 * 4 + 1])).toBeCloseTo(0.5, 2)
    // Running max: at least the interpolated depth.
    expect(fromHalf(mid[5 * 4 + 3])).toBeGreaterThanOrEqual(fromHalf(mid[5 * 4]))
    expect(s.frameAt(-1)).toBeNull()
    expect(fromHalf(s.frameAt(1000)![9 * 4])).toBeCloseTo(0.9, 2)
  })

  it('compresses dry cells to almost nothing', () => {
    const cells = 250_000
    const s = new SnapshotStore(cells, 60)
    s.add(0, frame(cells, (c) => (c % 1000 < 20 ? 0.3 : 0)))
    expect(s.bytes).toBeLessThan(cells * 8 * 0.1)
  })

  it('drops every other snapshot when over budget, keeping the whole span', () => {
    const cells = 1000
    const s = new SnapshotStore(cells, 10, 40_000)
    let seed = 1
    const noisy = (): Uint16Array => frame(cells, () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 2 ** 32) * 3 })
    for (let k = 0; k <= 40; k++) s.add(k * 10, noisy())
    expect(s.bytes).toBeLessThanOrEqual(40_000)
    expect(s.interval).toBeGreaterThan(10)
    const t = s.times()
    expect(t[0]).toBe(0)
    expect(t[t.length - 1]).toBe(400)
  })

  it('gives one cell\'s depth and speed over the event', () => {
    const s = new SnapshotStore(4, 60)
    for (let k = 0; k < 5; k++) s.add(k * 60, frame(4, (c) => (c === 2 ? k * 0.1 : 0), 0.3, 0.4))
    const series = s.cellSeries(2)
    expect([...series.t]).toEqual([0, 60, 120, 180, 240])
    expect(series.h[3]).toBeCloseTo(0.3, 2)
    expect(series.speed[0]).toBeCloseTo(0.5, 2)
  })

  it('picks ~200 snapshots per event', () => {
    expect(snapshotInterval(7200)).toBe(40)
    expect(snapshotInterval(600)).toBe(10)
    expect(snapshotInterval(500_000)).toBe(600)
  })
})
