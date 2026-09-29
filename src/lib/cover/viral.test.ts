import { describe, it, expect } from 'vitest'
import { RECIPES, missingSteps } from './recipes'
import { alphaBounds, blurChannel, composeNight, evolutionSteps, layerAnchor, paddedUnion, posterize, tiltShift, windowLighting, NIGHT_DEFAULTS } from './viral'

function rgba(w: number, h: number, px: (x: number, y: number) => [number, number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(px(x, y), (y * w + x) * 4)
  return { data, width: w, height: h }
}

describe('alphaBounds / layerAnchor', () => {
  it('boxes the opaque pixels and anchors on the right edge, mid-height', () => {
    const img = rgba(10, 10, (x, y) => [0, 0, 0, x >= 2 && x <= 6 && y >= 3 && y <= 5 ? 255 : 0])
    expect(alphaBounds(img)).toEqual({ x0: 2, y0: 3, x1: 6, y1: 5 })
    expect(layerAnchor(img)).toEqual({ x: 0.6, y: 0.4 })
    expect(alphaBounds(rgba(4, 4, () => [0, 0, 0, 0]))).toBeNull()
  })
})

describe('blurChannel', () => {
  it('spreads a spike and keeps the total roughly constant', () => {
    const ch = new Float32Array(21 * 21)
    ch[10 * 21 + 10] = 100
    blurChannel(ch, 21, 21, 2)
    expect(ch[10 * 21 + 10]).toBeLessThan(100)
    expect(ch[10 * 21 + 12]).toBeGreaterThan(0)
    expect(ch.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0)
  })
})

describe('composeNight', () => {
  it('darkens the facade to night and lights the windows warm', () => {
    const base = rgba(20, 20, () => [200, 200, 200, 255])
    const mask = rgba(20, 20, (x, y) => (x >= 8 && x <= 11 && y >= 8 && y <= 11 ? [255, 255, 255, 255] : [0, 0, 0, 255]))
    composeNight(base, mask, { ...NIGHT_DEFAULTS, bloom: 0.05 })
    const px = (x: number, y: number) => [...base.data.slice((y * 20 + x) * 4, (y * 20 + x) * 4 + 3)]
    const wall = px(0, 0)
    const window = px(10, 10)
    expect(wall[2]).toBeGreaterThan(wall[0]) // blue-hour cast
    expect(wall[0]).toBeLessThan(120)
    expect(window[0]).toBeGreaterThan(window[2]) // warm
    expect(window[0]).toBeGreaterThan(200)
    expect(px(13, 10)[0]).toBeGreaterThan(wall[0]) // bloom spills past the frame
  })
})

describe('tiltShift', () => {
  it('keeps the band sharp and blurs the edges', () => {
    const img = rgba(40, 40, (x) => (x % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]))
    tiltShift(img, { center: 0.5, band: 0.1, blur: 0.05, saturation: 1 })
    const contrast = (y: number) => Math.abs(img.data[(y * 40) * 4] - img.data[(y * 40 + 1) * 4])
    expect(contrast(20)).toBeGreaterThan(200)
    expect(contrast(1)).toBeLessThan(60)
  })
})

describe('posterize', () => {
  it('maps luminance to the tones and hardens the cut-out edge', () => {
    const img = rgba(3, 1, (x) => (x === 0 ? [10, 10, 10, 255] : x === 1 ? [250, 250, 250, 200] : [128, 128, 128, 50]))
    posterize(img, ['#111111', '#777777', '#EEEEEE'])
    expect([...img.data.slice(0, 4)]).toEqual([0x11, 0x11, 0x11, 255])
    expect([...img.data.slice(4, 8)]).toEqual([0xee, 0xee, 0xee, 255])
    expect(img.data[11]).toBe(0)
  })
})

describe('evolutionSteps', () => {
  it('two to four steps', () => {
    expect(evolutionSteps(1)).toBe(0)
    expect(evolutionSteps(3)).toBe(3)
    expect(evolutionSteps(30)).toBe(4)
  })
})

describe('viral recipes', () => {
  it('run their tagged capture even when other shots exist, and not twice', () => {
    const plain = { id: 'a', label: 'x', image: {} as never }
    expect(missingSteps(RECIPES.nocturne, 3, 1, [plain, plain, plain]).map((s) => s.kind)).toEqual(['night'])
    expect(missingSteps(RECIPES.nocturne, 1, 1, [{ ...plain, night: true }])).toEqual([])
    expect(missingSteps(RECIPES.collage, 1, 1, [{ ...plain, cutout: true }])).toEqual([])
    expect(missingSteps(RECIPES.miniature, 2, 1, [plain, plain]).map((s) => s.kind)).toEqual(['view'])
    expect(missingSteps(RECIPES.miniature, 1, 1, [{ ...plain, look: 'miniature' }])).toEqual([])
    // Plain recipes still top up by count.
    expect(missingSteps(RECIPES.board, 1, 4)).toHaveLength(3)
  })
})

describe('windowLighting', () => {
  it('leaves roughly a quarter off and a quarter dim, the same every time', () => {
    const ids = Array.from({ length: 2000 }, (_, i) => i + 1)
    const a = windowLighting(ids)
    expect(a.off.length / ids.length).toBeGreaterThan(0.2)
    expect(a.off.length / ids.length).toBeLessThan(0.32)
    expect(a.dim.length / ids.length).toBeGreaterThan(0.18)
    expect(windowLighting(ids)).toEqual(a)
    expect(a.off.some((id) => a.dim.includes(id))).toBe(false)
  })
})

describe('paddedUnion', () => {
  it('wraps every box with a margin and stays inside the frame', () => {
    expect(paddedUnion([{ x0: 10, y0: 10, x1: 20, y1: 40 }, { x0: 30, y0: 5, x1: 35, y1: 15 }], 100, 100, 0.1))
      .toEqual({ x: 6, y: 1, w: 34, h: 44 })
    expect(paddedUnion([{ x0: 0, y0: 0, x1: 99, y1: 99 }], 100, 100, 0.2)).toEqual({ x: 0, y: 0, w: 100, h: 100 })
    expect(paddedUnion([], 10, 10, 0)).toBeNull()
  })
})

describe('posterize under any light', () => {
  it('spreads the tones over the cut-out’s own range', () => {
    const dark = rgba(2, 1, (x) => (x === 0 ? [10, 10, 10, 255] : [40, 40, 40, 255]))
    posterize(dark, ['#000000', '#FFFFFF'])
    expect(dark.data[0]).toBe(0)
    expect(dark.data[4]).toBe(255)
  })
})
