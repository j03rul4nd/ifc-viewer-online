// ─── Integration test — gifenc encode pattern ──────────────────────────────────
// Exercises the exact per-frame quantize → applyPalette → writeFrame sequence
// used by gif-export.worker.ts (the worker file itself binds self.onmessage, so
// the encode pattern is validated here against the real gifenc library).

import { describe, it, expect } from 'vitest'
import { GIFEncoder, quantize, applyPalette } from 'gifenc'

function syntheticFrame(width: number, height: number, seed: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = (seed * 40 + (i % width)) % 256      // R gradient per frame
    rgba[i * 4 + 1] = (seed * 90) % 256                 // G varies per frame
    rgba[i * 4 + 2] = Math.floor(i / width) % 256       // B gradient by row
    rgba[i * 4 + 3] = 255
  }
  return rgba
}

describe('gif-export worker encode pattern', () => {
  it('produces a valid animated GIF from streamed RGBA frames', () => {
    const width = 64
    const height = 36
    const delayMs = Math.max(20, Math.round(1000 / 10)) // 10 fps → 100 ms

    const gif = GIFEncoder()
    for (let frame = 0; frame < 3; frame++) {
      const rgba = syntheticFrame(width, height, frame)
      const palette = quantize(rgba, 256, { format: 'rgb444' })
      const index = applyPalette(rgba, palette, 'rgb444')
      expect(index).toHaveLength(width * height)
      expect(palette.length).toBeGreaterThan(1)
      expect(palette.length).toBeLessThanOrEqual(256)
      gif.writeFrame(index, width, height, { palette, delay: delayMs })
    }
    gif.finish()

    const bytes = gif.bytes()
    // GIF89a magic header
    expect(Array.from(bytes.slice(0, 6)).map((b) => String.fromCharCode(b)).join('')).toBe('GIF89a')
    // Logical screen descriptor: width/height, little-endian
    expect(bytes[6] | (bytes[7] << 8)).toBe(width)
    expect(bytes[8] | (bytes[9] << 8)).toBe(height)
    // Trailer byte
    expect(bytes[bytes.length - 1]).toBe(0x3b)
    // 3 image descriptors (0x2C separators) — one per frame
    let imageDescriptors = 0
    for (const b of bytes) if (b === 0x2c) imageDescriptors++
    expect(imageDescriptors).toBeGreaterThanOrEqual(3)
  })
})
