import { describe, expect, it } from 'vitest'
import { clipLineToBox } from './way-clip'

const box = { south: 0, north: 10, west: 0, east: 10 }
const p = (lon: number, lat: number): { lat: number; lon: number } => ({ lat, lon })

describe('clipLineToBox', () => {
  it('hands back a line that is wholly inside, untouched', () => {
    const line = [p(1, 1), p(5, 5), p(9, 2)]
    const runs = clipLineToBox(line, box)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toHaveLength(3)
    runs[0].forEach((q, i) => expect(q).toBe(line[i]))
  })

  it('drops a line that never enters', () => {
    expect(clipLineToBox([p(-5, -5), p(-1, 20)], box)).toEqual([])
    expect(clipLineToBox([p(12, 1), p(15, 9)], box)).toEqual([])
  })

  it('cuts a way that leaves the box exactly on its edge', () => {
    const runs = clipLineToBox([p(5, 5), p(15, 5)], box)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toEqual([p(5, 5), p(10, 5)])
  })

  it('cuts both ends of a way that crosses straight through', () => {
    const runs = clipLineToBox([p(-10, 4), p(20, 4)], box)
    expect(runs).toEqual([[p(0, 4), p(10, 4)]])
  })

  it('gives a way that leaves and comes back two runs, in order', () => {
    const runs = clipLineToBox([p(2, 2), p(2, 14), p(8, 14), p(8, 2)], box)
    expect(runs).toHaveLength(2)
    expect(runs[0]).toEqual([p(2, 2), p(2, 10)])
    expect(runs[1]).toEqual([p(8, 10), p(8, 2)])
  })

  it('keeps the interior vertices of a run that starts and ends outside', () => {
    const runs = clipLineToBox([p(-4, 5), p(3, 5), p(6, 8), p(6, 30)], box)
    expect(runs).toEqual([[p(0, 5), p(3, 5), p(6, 8), p(6, 10)]])
  })

  it('carries the extra fields of a point onto the vertex it adds', () => {
    const line = [{ lat: 5, lon: 5, tag: 'a' }, { lat: 5, lon: 15, tag: 'b' }]
    const runs = clipLineToBox(line, box)
    expect(runs[0][1]).toEqual({ lat: 5, lon: 10, tag: 'a' })
  })

  it('does not invent a run from a corner touch', () => {
    // Passes through the corner (10, 10) only: a single point is not a way.
    expect(clipLineToBox([p(5, 15), p(15, 5)], box)).toEqual([])
  })
})
