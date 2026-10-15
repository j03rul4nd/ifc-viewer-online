import { describe, it, expect } from 'vitest'
import {
  IDENTITY_PALETTE, NO_TOPIC_GREY, mixedValue, pickIdentityColor, requestedStyle, resolveCloudStyle,
} from './pc-style'
import { CLOUD_STYLE_KEYS, DEFAULT_DISPLAY } from './pc-types'

const ALL = { color: true, intensity: true, classification: true, confidence: false }

describe('pc-style', () => {
  it('lets the override win per key and inherits the rest', () => {
    const r = requestedStyle({ ...DEFAULT_DISPLAY, pointSize: 2, opacity: 0.8 }, { pointSize: 5 })
    expect(r.pointSize).toBe(5)
    expect(r.opacity).toBe(0.8)
    expect(r.colorMode).toBe(DEFAULT_DISPLAY.colorMode)
  })

  it("resolves 'scan' to the identity colour", () => {
    const r = resolveCloudStyle({ display: { ...DEFAULT_DISPLAY, colorMode: 'scan' }, identityColor: 0x123456, attributes: ALL })
    expect(r).toMatchObject({ colorMode: 'flat', flatColor: 0x123456 })
  })

  it("resolves 'topic' to the topic colour, or grey without one", () => {
    const d = { ...DEFAULT_DISPLAY, colorMode: 'topic' as const }
    expect(resolveCloudStyle({ display: d, topicColor: 0xabcdef }).flatColor).toBe(0xabcdef)
    expect(resolveCloudStyle({ display: d, topicColor: null })).toMatchObject({ colorMode: 'flat', flatColor: NO_TOPIC_GREY })
  })

  it('falls back per scan to its best mode, without mutating the input', () => {
    const display = Object.freeze({ ...DEFAULT_DISPLAY, colorMode: 'rgb' as const })
    expect(resolveCloudStyle({ display, attributes: { color: false, intensity: false, classification: true, confidence: false } }).colorMode)
      .toBe('classification')
    expect(resolveCloudStyle({ display, attributes: { color: false, intensity: false, classification: false, confidence: false } }).colorMode)
      .toBe('elevation')
    expect(display.colorMode).toBe('rgb')
  })

  it('returns exactly the four style keys', () => {
    const r = resolveCloudStyle({ display: DEFAULT_DISPLAY, attributes: ALL })
    expect(Object.keys(r).sort()).toEqual([...CLOUD_STYLE_KEYS].sort())
  })

  it('picks unused identity colours, then cycles', () => {
    expect(pickIdentityColor([])).toBe(0x4C9AFF)
    expect(pickIdentityColor([IDENTITY_PALETTE[0]])).toBe(0xFF8B3D)
    expect(pickIdentityColor([...IDENTITY_PALETTE])).toBe(IDENTITY_PALETTE[0])
  })

  it('reports mixed values', () => {
    expect(mixedValue([2, 2]).mixed).toBe(false)
    expect(mixedValue([2, 2]).value).toBe(2)
    expect(mixedValue([2, 3]).mixed).toBe(true)
  })
})
