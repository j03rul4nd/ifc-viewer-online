// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { pinchView } from './pinch'

const fingers = (ax: number, ay: number, bx: number, by: number) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } })

describe('pinchView', () => {
  it('keeps what is between the fingers under them', () => {
    const view = { x: 10, y: 20, zoom: 0.5 }
    const next = pinchView(view, fingers(100, 100, 200, 100), fingers(50, 100, 250, 100))
    expect(next.zoom).toBeCloseTo(1)
    // The world point at the midpoint (150, 100) stays there.
    expect((150 - view.x) / view.zoom).toBeCloseTo((150 - next.x) / next.zoom)
    expect((100 - view.y) / view.zoom).toBeCloseTo((100 - next.y) / next.zoom)
  })
  it('moves with the fingers and respects the limits', () => {
    const moved = pinchView({ x: 0, y: 0, zoom: 1 }, fingers(0, 0, 100, 0), fingers(30, 40, 130, 40))
    expect(moved).toEqual({ x: 30, y: 40, zoom: 1 })
    expect(pinchView({ x: 0, y: 0, zoom: 2.9 }, fingers(0, 0, 10, 0), fingers(0, 0, 500, 0)).zoom).toBe(3)
  })
})
