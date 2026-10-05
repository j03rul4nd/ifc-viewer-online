import { describe, expect, it } from 'vitest'
import { errorTargetFor, lodResolution, lowerQuality, MAX_LOD_PIXELS, stylePixelScale } from './tile-quality'

describe('lodResolution', () => {
  it('plans LOD in device pixels, not CSS pixels', () => {
    expect(lodResolution(1000, 600, 2)).toEqual({ width: 2000, height: 1200, effectiveDpr: 2 })
  })
  it('caps the effective DPR at 2', () => {
    expect(lodResolution(800, 600, 3).effectiveDpr).toBe(2)
  })
  it('never plans for less than one device pixel per CSS pixel', () => {
    expect(lodResolution(800, 600, 0.5).width).toBe(800)
    expect(lodResolution(800, 600, NaN).width).toBe(800)
  })
  it('caps the pixel count at a 4K frame', () => {
    const r = lodResolution(3840, 2160, 2)
    expect(r.width * r.height).toBeLessThanOrEqual(MAX_LOD_PIXELS * 1.001)
    expect(r.width / r.height).toBeCloseTo(3840 / 2160, 2)
  })
})

describe('errorTargetFor', () => {
  it('asks for a texel of at most 2 device px unless economising', () => {
    expect(errorTargetFor('balanced', 'raster')).toBe(2)
    expect(errorTargetFor('high', 'raster')).toBe(1.5)
    expect(errorTargetFor('high', 'vector')).toBe(2)
    expect(errorTargetFor('economy', 'vector')).toBeGreaterThan(2)
  })
  it('stays far below the old CSS-pixel target of 6 (about 12 device px at DPR 2)', () => {
    expect(errorTargetFor('economy', 'raster')).toBeLessThan(6)
  })
})

describe('lowerQuality', () => {
  it('steps down to the bottom and stops', () => {
    expect(lowerQuality('high')).toBe('balanced')
    expect(lowerQuality('balanced')).toBe('economy')
    expect(lowerQuality('economy')).toBeNull()
  })
})

describe('stylePixelScale', () => {
  it('maps authored CSS px to canvas texels so they read at about 1 CSS px', () => {
    expect(stylePixelScale(2, 2)).toBeCloseTo(Math.SQRT2, 5)
    expect(stylePixelScale(1, 2)).toBeCloseTo(Math.SQRT1_2, 5)
  })
})
