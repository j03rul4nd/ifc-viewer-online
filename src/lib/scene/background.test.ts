import { describe, it, expect } from 'vitest'
import {
  BACKGROUND_PRESETS, DEFAULT_BACKGROUND,
  normalizeHex, hexToRgb, relativeLuminance, isLightBackground, gridColorFor,
  presetById, settingsFromPreset, resolveBackground,
  parseStoredBackground, serializeBackground,
  type BackgroundSettings,
} from './background'

describe('normalizeHex', () => {
  it('expands the 3-digit form and lowercases', () => {
    expect(normalizeHex('#FFF')).toBe('#ffffff')
    expect(normalizeHex('#A1b')).toBe('#aa11bb')
  })

  it('accepts a missing # and surrounding whitespace', () => {
    expect(normalizeHex('  0a0a0c ')).toBe('#0a0a0c')
  })

  it('rejects anything that is not a hex colour', () => {
    for (const bad of ['', '#', 'white', '#12345', '#gggggg', 'rgb(1,2,3)', '#1234567']) {
      expect(normalizeHex(bad)).toBeNull()
    }
  })
})

describe('hexToRgb', () => {
  it('splits channels', () => {
    expect(hexToRgb('#ff8000')).toEqual({ r: 255, g: 128, b: 0 })
  })

  it('returns null for invalid input', () => {
    expect(hexToRgb('nope')).toBeNull()
  })
})

describe('relativeLuminance', () => {
  it('anchors black at 0 and white at 1', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
  })

  it('treats an invalid colour as black rather than throwing', () => {
    expect(relativeLuminance('bogus')).toBe(0)
  })
})

describe('isLightBackground / gridColorFor', () => {
  it('flags white and paper as light', () => {
    expect(isLightBackground({ mode: 'solid', top: '#ffffff', bottom: '#ffffff' })).toBe(true)
    expect(isLightBackground({ mode: 'gradient', top: '#ffffff', bottom: '#e4e8ef' })).toBe(true)
  })

  it('flags the shipped studio backdrop as dark', () => {
    expect(isLightBackground(DEFAULT_BACKGROUND)).toBe(false)
  })

  it('ignores the bottom stop in solid mode', () => {
    // A stale bottom colour left over from a gradient must not flip the verdict.
    expect(isLightBackground({ mode: 'solid', top: '#0a0a0c', bottom: '#ffffff' })).toBe(false)
  })

  it('gives dark ink over light backdrops and light ink over dark ones', () => {
    expect(gridColorFor({ mode: 'solid', top: '#ffffff', bottom: '#ffffff' })).toBe('#9aa3b2')
    expect(gridColorFor(DEFAULT_BACKGROUND)).toBe('#2a2d36')
  })
})

describe('presets', () => {
  it('ships studio first and unchanged — the default must not move', () => {
    expect(BACKGROUND_PRESETS[0].id).toBe('studio')
    expect(BACKGROUND_PRESETS[0].top).toBe('#0a0a0c')
    expect(DEFAULT_BACKGROUND.preset).toBe('studio')
  })

  it('declares only normalised hex colours', () => {
    for (const p of BACKGROUND_PRESETS) {
      expect(normalizeHex(p.top)).toBe(p.top)
      expect(normalizeHex(p.bottom)).toBe(p.bottom)
    }
  })

  it('resolves a preset id to its colours', () => {
    expect(settingsFromPreset('white')).toEqual({
      preset: 'white', mode: 'solid', top: '#ffffff', bottom: '#ffffff',
    })
  })

  it('keeps the current colours when switching to custom', () => {
    const current: BackgroundSettings = { preset: 'white', mode: 'solid', top: '#ffffff', bottom: '#ffffff' }
    expect(settingsFromPreset('custom', current)).toEqual({ ...current, preset: 'custom' })
  })

  it('has no preset entry for custom', () => {
    expect(presetById('custom')).toBeNull()
  })
})

describe('resolveBackground', () => {
  it('collapses both stops to top in solid mode', () => {
    const r = resolveBackground({ preset: 'custom', mode: 'solid', top: '#ff0000', bottom: '#00ff00' })
    expect(r.bottom).toBe('#ff0000')
    expect(r.fog).toBe('#ff0000')
  })

  it('fogs into the horizon (bottom) stop of a gradient', () => {
    const r = resolveBackground({ preset: 'paper', mode: 'gradient', top: '#ffffff', bottom: '#e4e8ef' })
    expect(r.fog).toBe('#e4e8ef')
    expect(r.light).toBe(true)
  })

  it('normalises input colours', () => {
    const r = resolveBackground({ preset: 'custom', mode: 'gradient', top: 'FFF', bottom: '#ABC' })
    expect(r.top).toBe('#ffffff')
    expect(r.bottom).toBe('#aabbcc')
  })

  it('falls back to the default rather than pushing an invalid colour into the scene', () => {
    const r = resolveBackground({ preset: 'custom', mode: 'solid', top: 'not-a-colour', bottom: '' })
    expect(r.top).toBe(DEFAULT_BACKGROUND.top)
  })

  it('falls back the gradient bottom to the top stop when invalid', () => {
    const r = resolveBackground({ preset: 'custom', mode: 'gradient', top: '#112233', bottom: 'oops' })
    expect(r.bottom).toBe('#112233')
  })
})

describe('persistence', () => {
  it('round-trips a custom gradient', () => {
    const settings: BackgroundSettings = { preset: 'custom', mode: 'gradient', top: '#101020', bottom: '#303048' }
    expect(parseStoredBackground(serializeBackground(settings))).toEqual(settings)
  })

  it('re-derives preset colours instead of trusting stored hexes', () => {
    // A user who picked "white" gets the CURRENT white, even if the stored blob
    // carries colours from an older release.
    const stale = JSON.stringify({ preset: 'white', mode: 'solid', top: '#eeeeee', bottom: '#eeeeee' })
    expect(parseStoredBackground(stale)).toEqual(settingsFromPreset('white'))
  })

  it('returns the default for missing, malformed or foreign values', () => {
    for (const raw of [null, '', 'not json', '[]', '"str"', '{}', '{"preset":"neon"}', '{"preset":"custom"}']) {
      expect(parseStoredBackground(raw)).toEqual(DEFAULT_BACKGROUND)
    }
  })

  it('defaults a custom entry with no explicit mode to solid', () => {
    expect(parseStoredBackground('{"preset":"custom","top":"#123456"}')).toEqual({
      preset: 'custom', mode: 'solid', top: '#123456', bottom: '#123456',
    })
  })
})
