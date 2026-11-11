// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { GestureArbiter } from './gestures'
import { extractPalette, facingAxis, filterPixels, isNeutral } from './filters'

const pixel = (r: number, g: number, b: number, a = 255) => Uint8ClampedArray.from([r, g, b, a])
const touch = (id: number, x: number, y: number, timeMs: number) => ({ id, kind: 'touch' as const, x, y, timeMs })

describe('filters', () => {
  it('knows when there is nothing to do', () => {
    expect(isNeutral(undefined)).toBe(true)
    expect(isNeutral({ saturation: 1 })).toBe(true)
    expect(isNeutral({ grain: 0.2 })).toBe(false)
  })
  it('saturation 0 is grey', () => {
    const p = pixel(200, 50, 50)
    filterPixels(p, 1, 1, { saturation: 0 })
    expect(p[0]).toBe(p[1])
  })
  it('hue 120 turns red to green', () => {
    const p = pixel(255, 0, 0)
    filterPixels(p, 1, 1, { hue: 120 })
    expect(p[1]).toBeGreaterThan(200)
    expect(p[0]).toBeLessThan(30)
  })
  it('duotone maps black to the dark colour', () => {
    const p = pixel(0, 0, 0)
    filterPixels(p, 1, 1, { duotone: ['#102030', '#ffffff'] })
    expect([p[0], p[1], p[2]]).toEqual([16, 32, 48])
  })
  it('soft spreads a line into its neighbours; glow keeps the line itself', () => {
    const line = () => { const d = new Uint8ClampedArray(9 * 4); d.set([0, 0, 0, 255], 4 * 4); return d }
    const soft = line()
    filterPixels(soft, 9, 1, { soft: 1 })
    expect(soft[3 * 4 + 3]).toBeGreaterThan(0)
    expect(soft[4 * 4 + 3]).toBeLessThan(255)
    const glow = line()
    filterPixels(glow, 9, 1, { glow: 1 })
    expect(glow[4 * 4 + 3]).toBe(255)
    expect(glow[3 * 4 + 3]).toBeGreaterThan(0)
  })
  it('leaves empty pixels empty', () => {
    const p = pixel(0, 0, 0, 0)
    filterPixels(p, 1, 1, { brightness: 2, grain: 0.5 })
    expect(p[3]).toBe(0)
  })
})

describe('palette', () => {
  it('orders by amount and merges near colours', () => {
    const data: number[] = []
    for (let i = 0; i < 30; i++) data.push(250, 10, 10, 255)
    for (let i = 0; i < 20; i++) data.push(245, 15, 12, 255)
    for (let i = 0; i < 10; i++) data.push(10, 10, 240, 255)
    const out = extractPalette(data, 5)
    expect(out).toHaveLength(2)
    expect(out[1]).toBe('#0a0af0')
  })
})

describe('touch', () => {
  it('auto picks the plane most facing the view', () => {
    expect(facingAxis([0.1, -0.9, 0.2])).toBe('ground')
    expect(facingAxis([0.8, -0.1, 0.2])).toBe('side')
    expect(facingAxis([0.1, -0.1, -0.9])).toBe('front')
  })
  const two = () => {
    const g = new GestureArbiter()
    g.fingerDraw = false
    g.down(touch(1, 0, 0, 0)); g.down(touch(2, 100, 0, 5))
    return g
  }
  it('a pinch stays a pinch: it never orbits on the way', () => {
    const g = two()
    const seen: string[] = []
    for (let i = 1; i < 8; i++) {
      seen.push(...g.move(touch(1, -i * 6, 1, 10 + i)).map((a) => a.type))
      seen.push(...g.move(touch(2, 100 + i * 6, 1, 10 + i)).map((a) => a.type))
    }
    expect(seen).toContain('zoom')
    expect(seen).not.toContain('orbit')
  })
  it('a two-finger drag stays an orbit: no accidental zoom', () => {
    const g = two()
    const seen: string[] = []
    for (let i = 1; i < 8; i++) {
      seen.push(...g.move(touch(1, i * 6, 0, 10 + i)).map((a) => a.type))
      seen.push(...g.move(touch(2, 100 + i * 6, i % 2, 10 + i)).map((a) => a.type))
    }
    expect(seen).toContain('orbit')
    expect(seen).not.toContain('zoom')
  })
})
