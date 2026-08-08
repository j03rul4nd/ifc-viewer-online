// ─── surface-textures tests ───────────────────────────────────────────────────
// The map only earns its place if it TILES. A seam in a baked detail map is not
// a subtle artefact — it draws a grid across every lawn in the scene.

import { describe, it, expect } from 'vitest'
import { surfaceTexture, disposeSurfaceTextures, TILE_M, type TextureFamily } from './surface-textures'

const FAMILIES: TextureFamily[] = ['grass', 'shrub', 'sand', 'rock', 'water']

/**
 * Families whose roughness channel is actually used. Water's is not: its
 * material derives roughness from its own foam and chop, so the baked band sits
 * far below the granular ones and testing it against them would be meaningless.
 */
const GRANULAR: TextureFamily[] = ['grass', 'shrub', 'sand', 'rock']

/**
 * Mean absolute difference between adjacent texels ALONG ONE AXIS.
 *
 * The axis matters: grass blades are stretched about eight to one, so the field
 * genuinely steps harder down the tile than across it. Comparing a vertical
 * seam against a horizontal baseline flagged a perfectly good anisotropic
 * texture as seamed — the test was wrong, not the bake.
 */
function interiorStep(
  data: Uint8Array, size: number, channel: number, vertical: boolean,
): number {
  let sum = 0
  let n = 0
  for (let a = 0; a < size; a += 4) {
    for (let b = 0; b < size - 1; b++) {
      const i = vertical ? (b * size + a) : (a * size + b)
      const j = vertical ? ((b + 1) * size + a) : (a * size + b + 1)
      sum += Math.abs(data[i * 4 + channel] - data[j * 4 + channel])
      n++
    }
  }
  return sum / n
}

/** Mean absolute difference across the wrap, per channel. */
function seamStep(data: Uint8Array, size: number, channel: number, vertical: boolean): number {
  let sum = 0
  for (let i = 0; i < size; i++) {
    const a = vertical ? i : (i * size + size - 1)
    const b = vertical ? (size - 1) * size + i : i * size
    sum += Math.abs(data[a * 4 + channel] - data[b * 4 + channel])
  }
  return sum / size
}

describe('surfaceTexture', () => {
  it('wraps seamlessly — the edge is no more of a step than the interior', () => {
    // This is the whole point of the periodic noise. If the lattice did not
    // wrap, the two edges would carry unrelated values and the seam step would
    // be many times the interior step instead of comparable to it.
    for (const family of FAMILIES) {
      const t = surfaceTexture(family)
      const data = t.image.data as Uint8Array
      const size = t.image.width
      for (const channel of [0, 1, 3]) {
        // Each seam is judged against the interior step along its OWN axis.
        // Generous factor: one texel across a seam is a real step, just not a
        // discontinuity. A non-wrapping lattice scores 10-30× here.
        expect(seamStep(data, size, channel, false))
          .toBeLessThan(interiorStep(data, size, channel, false) * 4 + 3)
        expect(seamStep(data, size, channel, true))
          .toBeLessThan(interiorStep(data, size, channel, true) * 4 + 3)
      }
    }
  })

  it('uses the byte range instead of a washed-out sliver of it', () => {
    // The first version differentiated a unit-less field per texel and produced
    // normals spanning 20 values out of 255 — visually flat whatever the
    // multiplier said. This is the guard on that.
    for (const family of FAMILIES) {
      const data = surfaceTexture(family).image.data as Uint8Array
      const range = (c: number): number => {
        let lo = 255
        let hi = 0
        for (let i = c; i < data.length; i += 4) {
          lo = Math.min(lo, data[i])
          hi = Math.max(hi, data[i])
        }
        return hi - lo
      }
      // The height field is normalized, so its channel must span nearly all of it.
      expect(range(3)).toBeGreaterThan(240)
      // And at least one normal axis has to carry real slope.
      expect(Math.max(range(0), range(1))).toBeGreaterThan(30)
    }
  })

  it('encodes normals that can be unpacked to a unit vector', () => {
    // Z is reconstructed in the shader as sqrt(1 - x² - y²), which needs the
    // encoded pair to stay inside the unit disc.
    for (const family of FAMILIES) {
      const data = surfaceTexture(family).image.data as Uint8Array
      for (let i = 0; i < data.length; i += 4 * 97) {
        const x = (data[i] / 255) * 2 - 1
        const y = (data[i + 1] / 255) * 2 - 1
        expect(x * x + y * y).toBeLessThanOrEqual(1.0001)
      }
    }
  })

  it('keeps roughness inside its family band', () => {
    for (const family of GRANULAR) {
      const data = surfaceTexture(family).image.data as Uint8Array
      for (let i = 2; i < data.length; i += 4 * 53) {
        expect(data[i]).toBeGreaterThan(0.55 * 255)
        expect(data[i]).toBeLessThanOrEqual(255)
      }
    }
  })

  it('closes the wave field on itself, like every other tile', () => {
    // Water is baked too — the map is a wave field sampled twice at different
    // scales and scroll rates. A seam here would draw a grid on every river.
    const t = surfaceTexture('water')
    const data = t.image.data as Uint8Array
    const size = t.image.width
    expect(seamStep(data, size, 0, false))
      .toBeLessThan(interiorStep(data, size, 0, false) * 4 + 3)
    expect(seamStep(data, size, 0, true))
      .toBeLessThan(interiorStep(data, size, 0, true) * 4 + 3)
  })

  it('bakes once and shares the result', () => {
    // Every ground layer and the terrain all want the same three maps; baking
    // per material would be ~70 ms each time a layer rebuilt.
    expect(surfaceTexture('grass')).toBe(surfaceTexture('grass'))
    expect(surfaceTexture('grass')).not.toBe(surfaceTexture('rock'))
  })

  it('is set up for mipmapped, anisotropic, non-colour sampling', () => {
    // Mipmaps are the entire filtering argument for baking this at all, and an
    // sRGB decode on packed normal/roughness data would corrupt every channel.
    const t = surfaceTexture('grass')
    expect(t.generateMipmaps).toBe(true)
    expect(t.anisotropy).toBeGreaterThan(1)
    expect(t.colorSpace).toBe('')          // THREE.NoColorSpace
    expect(TILE_M).toBeGreaterThan(0)
  })

  it('can be disposed and rebuilt identically', () => {
    const before = Uint8Array.from(surfaceTexture('sand').image.data as Uint8Array)
    disposeSurfaceTextures()
    const after = surfaceTexture('sand').image.data as Uint8Array
    // Deterministic: the same site renders the same way in every session.
    expect(Array.from(after.slice(0, 512))).toEqual(Array.from(before.slice(0, 512)))
  })
})
