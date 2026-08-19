// ─── Output frame geometry tests ───────────────────────────────────────────────
// The property that matters for social export: 'fit' must never lose picture,
// and 'crop' must always fill the frame. Everything else (even dimensions, no
// upscaling) is an encoder constraint the compositor depends on.

import { describe, it, expect } from 'vitest'
import { computeFrameLayout, computeBackdropRect, padFillColor, backdropBlurPx } from './frame-layout'
import type { CaptureAspect } from './replay-buffer-core'

const LANDSCAPE = { w: 1920, h: 1080 }

describe('computeFrameLayout — source', () => {
  it('keeps the source ratio and ignores the fit mode', () => {
    const crop = computeFrameLayout(1920, 1080, 'source', 'crop', 480)
    const fit = computeFrameLayout(1920, 1080, 'source', 'fit', 480)
    expect(crop).toEqual(fit)
    expect(crop.width).toBe(852)
    expect(crop.height).toBe(480)
    expect(crop.padded).toBe(false)
  })
})

describe('computeFrameLayout — crop', () => {
  it('fills the frame exactly, with no padding', () => {
    for (const aspect of ['square', 'vertical', 'story', 'wide'] as CaptureAspect[]) {
      const l = computeFrameLayout(LANDSCAPE.w, LANDSCAPE.h, aspect, 'crop', 1080)
      expect(l.dst, `${aspect} must fill`).toEqual({ dx: 0, dy: 0, dw: l.width, dh: l.height })
      expect(l.padded).toBe(false)
    }
  })

  it('9:16 from landscape keeps only a narrow slice — the reason fit exists', () => {
    const l = computeFrameLayout(1920, 1080, 'story', 'crop', 1080)
    expect(l.src.sw).toBeLessThan(700)
    expect(l.src.sh).toBe(1080)
  })
})

describe('computeFrameLayout — fit', () => {
  it('produces the requested ratio at the requested height', () => {
    const l = computeFrameLayout(1920, 1080, 'story', 'fit', 1080)
    expect(l.height).toBe(1080)
    expect(l.width / l.height).toBeCloseTo(9 / 16, 2)
  })

  it('contains the whole source frame — nothing is cropped away', () => {
    for (const aspect of ['square', 'vertical', 'story', 'wide'] as CaptureAspect[]) {
      const l = computeFrameLayout(LANDSCAPE.w, LANDSCAPE.h, aspect, 'fit', 720)
      expect(l.src, `${aspect} must sample the full frame`)
        .toEqual({ sx: 0, sy: 0, sw: LANDSCAPE.w, sh: LANDSCAPE.h })
      // Drawn rect stays inside the canvas and preserves the source ratio.
      expect(l.dst.dw).toBeLessThanOrEqual(l.width)
      expect(l.dst.dh).toBeLessThanOrEqual(l.height)
      expect(l.dst.dw / l.dst.dh).toBeCloseTo(LANDSCAPE.w / LANDSCAPE.h, 1)
      expect(l.dst.dx).toBeGreaterThanOrEqual(0)
      expect(l.dst.dy).toBeGreaterThanOrEqual(0)
    }
  })

  it('flags padding for a landscape source in a vertical frame', () => {
    expect(computeFrameLayout(1920, 1080, 'story', 'fit', 1080).padded).toBe(true)
  })

  it('does not flag padding when the source already matches the ratio', () => {
    expect(computeFrameLayout(1080, 1080, 'square', 'fit', 1080).padded).toBe(false)
  })

  it('never upscales past the source height', () => {
    const l = computeFrameLayout(640, 360, 'story', 'fit', 1080)
    expect(l.height).toBe(360)
  })

  it('always returns even dimensions', () => {
    for (const h of [null, 480, 720, 1080]) {
      for (const aspect of ['square', 'vertical', 'story', 'wide'] as CaptureAspect[]) {
        const l = computeFrameLayout(1919, 1079, aspect, 'fit', h)
        expect(l.width % 2, `${aspect}@${h} width`).toBe(0)
        expect(l.height % 2, `${aspect}@${h} height`).toBe(0)
        expect(l.dst.dw % 2).toBe(0)
        expect(l.dst.dh % 2).toBe(0)
      }
    }
  })
})

describe('computeBackdropRect', () => {
  it('covers the whole canvas with overscan on every side', () => {
    const l = computeFrameLayout(1920, 1080, 'story', 'fit', 1080)
    const b = computeBackdropRect(l)
    expect(b.dx).toBeLessThanOrEqual(0)
    expect(b.dy).toBeLessThanOrEqual(0)
    expect(b.dx + b.dw).toBeGreaterThanOrEqual(l.width)
    expect(b.dy + b.dh).toBeGreaterThanOrEqual(l.height)
  })

  it('scales the blur with the output size', () => {
    const small = computeFrameLayout(640, 360, 'story', 'fit', 360)
    const large = computeFrameLayout(1920, 1080, 'story', 'fit', 1080)
    expect(backdropBlurPx(large)).toBeGreaterThan(backdropBlurPx(small))
  })
})

describe('padFillColor', () => {
  it('is null for blur (the backdrop is the frame itself) and a colour otherwise', () => {
    expect(padFillColor('blur')).toBeNull()
    expect(padFillColor('dark')).toBeTruthy()
    expect(padFillColor('light')).toBeTruthy()
  })
})
