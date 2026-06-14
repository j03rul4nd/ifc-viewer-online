// ─── elevation tests (pure parts) ─────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import { decodeTerrarium, pixelOffset, terrariumTileUrl } from './elevation'

describe('decodeTerrarium', () => {
  it('decodes sea level (0 m): R=128 G=0 B=0', () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0)
  })

  it('decodes positive elevations', () => {
    // 443.25 m → 32768 + 443.25 = 33211.25 → R=129, G=187, B=64 (0.25×256)
    expect(decodeTerrarium(129, 187, 64)).toBeCloseTo(443.25, 6)
  })

  it('decodes negative elevations (below sea level)', () => {
    // −86 m (Death Valley-ish) → 32682 → R=127, G=170, B=0
    expect(decodeTerrarium(127, 170, 0)).toBe(-86)
  })

  it('round-trips the encoding formula', () => {
    for (const elev of [-415, -10.5, 0, 8.25, 1234, 8848]) {
      const v = elev + 32768
      const r = Math.floor(v / 256)
      const g = Math.floor(v % 256)
      const b = Math.round((v - Math.floor(v)) * 256)
      expect(decodeTerrarium(r, g, b)).toBeCloseTo(elev, 6)
    }
  })
})

describe('pixelOffset', () => {
  it('addresses RGBA rows correctly', () => {
    expect(pixelOffset(0, 0)).toBe(0)
    expect(pixelOffset(1, 0)).toBe(4)
    expect(pixelOffset(0, 1)).toBe(256 * 4)
    expect(pixelOffset(255, 255)).toBe((255 * 256 + 255) * 4)
  })
})

describe('terrariumTileUrl', () => {
  it('expands the AWS open-data template', () => {
    expect(terrariumTileUrl(13, 4093, 3050)).toBe(
      'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/13/4093/3050.png',
    )
  })
})
