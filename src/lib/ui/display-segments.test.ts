import { describe, it, expect } from 'vitest'
import { readSegments, resolveDualLayout, canOfferSplit, segmentAt, foldableVerdict, type ResolveInput } from './display-segments'

// Surface Duo spanned, book posture: two 540px panes and a 34px hinge.
const DUO = [
  { x: 0, y: 0, width: 540, height: 720 },
  { x: 574, y: 0, width: 540, height: 720 },
]
// Foldable in tabletop posture: top and bottom halves.
const TABLETOP = [
  { x: 0, y: 0, width: 884, height: 400 },
  { x: 0, y: 420, width: 884, height: 400 },
]

const base: ResolveInput = { segments: [], viewportWidth: 390, viewportHeight: 844, pref: 'auto', coarsePointer: true, swap: false }

describe('readSegments', () => {
  it('prefers the Viewport Segments API', () => {
    expect(readSegments({ viewport: { segments: DUO } })).toEqual(DUO)
  })
  it('falls back to the legacy getWindowSegments', () => {
    expect(readSegments({ getWindowSegments: () => DUO })).toEqual(DUO)
  })
  it('survives an API that throws, and no API at all', () => {
    expect(readSegments({ getWindowSegments: () => { throw new Error('x') } })).toEqual([])
    expect(readSegments({})).toEqual([])
    expect(readSegments(undefined)).toEqual([])
  })
})

describe('resolveDualLayout', () => {
  it('keeps the single-screen app when there is one segment', () => {
    expect(resolveDualLayout({ ...base, segments: [{ x: 0, y: 0, width: 390, height: 844 }] })).toBeNull()
  })

  it('uses both panels side by side, viewer first, hinge between', () => {
    const l = resolveDualLayout({ ...base, segments: DUO, viewportWidth: 1114, viewportHeight: 720 })!
    expect(l.posture).toBe('side-by-side')
    expect(l.source).toBe('hardware')
    expect(l.viewer).toEqual(DUO[0])
    expect(l.pane).toEqual(DUO[1])
    expect(l.hinge).toEqual({ x: 540, y: 0, width: 34, height: 720 })
  })

  it('swaps which panel holds the viewer', () => {
    const l = resolveDualLayout({ ...base, segments: DUO, swap: true })!
    expect(l.viewer).toEqual(DUO[1])
    expect(l.pane).toEqual(DUO[0])
  })

  it('stacks in tabletop posture, whatever order the segments arrive in', () => {
    const l = resolveDualLayout({ ...base, segments: [TABLETOP[1], TABLETOP[0]] })!
    expect(l.posture).toBe('stacked')
    expect(l.viewer).toEqual(TABLETOP[0])
    expect(l.hinge).toEqual({ x: 0, y: 400, width: 884, height: 20 })
  })

  it('honours "off" even on dual hardware', () => {
    expect(resolveDualLayout({ ...base, segments: DUO, pref: 'off' })).toBeNull()
  })

  it('refuses a split that would leave a sliver', () => {
    const sliver = [{ x: 0, y: 0, width: 800, height: 600 }, { x: 820, y: 0, width: 200, height: 600 }]
    expect(resolveDualLayout({ ...base, segments: sliver })).toBeNull()
  })

  it('never splits without hardware unless asked', () => {
    expect(resolveDualLayout({ ...base, viewportWidth: 1024, viewportHeight: 768 })).toBeNull()
  })

  it('splits a wide touch screen on request, viewer keeping the larger share', () => {
    const l = resolveDualLayout({ ...base, pref: 'split', viewportWidth: 1000, viewportHeight: 700 })!
    expect(l.source).toBe('manual')
    expect(l.viewer.width + l.pane.width).toBe(1000)
    expect(l.viewer.width).toBeGreaterThan(l.pane.width)
    expect(l.pane.x).toBe(l.viewer.width)
    const s = resolveDualLayout({ ...base, pref: 'split', swap: true, viewportWidth: 1000, viewportHeight: 700 })!
    expect(s.pane.x).toBe(0)
    expect(s.viewer.x).toBe(s.pane.width)
  })

  it('does not split a phone or a mouse-driven desktop on request', () => {
    expect(resolveDualLayout({ ...base, pref: 'split' })).toBeNull()
    expect(resolveDualLayout({ ...base, pref: 'split', viewportWidth: 1400, viewportHeight: 900, coarsePointer: false })).toBeNull()
  })
})

describe('foldableVerdict', () => {
  it('follows what the browser reports, not a device', () => {
    expect(foldableVerdict({ segments: DUO, viewportWidth: 1114, coarsePointer: true })).toBe('two-screens')
    expect(foldableVerdict({ segments: [], viewportWidth: 884, coarsePointer: true })).toBe('manual')
    expect(foldableVerdict({ segments: [], viewportWidth: 412, coarsePointer: true })).toBe('phone')
    expect(foldableVerdict({ segments: [], viewportWidth: 1440, coarsePointer: false })).toBe('desktop')
  })
})

describe('segmentAt', () => {
  it('finds the segment under a point, and the nearer one on the hinge', () => {
    expect(segmentAt(DUO, 100, 100)).toEqual(DUO[0])
    expect(segmentAt(DUO, 800, 100)).toEqual(DUO[1])
    expect(segmentAt(DUO, 545, 100)).toEqual(DUO[0])
    expect(segmentAt(DUO, 570, 100)).toEqual(DUO[1])
    expect(segmentAt([], 1, 1)).toBeNull()
  })
})

describe('canOfferSplit', () => {
  it('offers on dual hardware and on wide touch screens only', () => {
    expect(canOfferSplit({ segments: DUO, viewportWidth: 1114, coarsePointer: false })).toBe(true)
    expect(canOfferSplit({ segments: [], viewportWidth: 1024, coarsePointer: true })).toBe(true)
    expect(canOfferSplit({ segments: [], viewportWidth: 390, coarsePointer: true })).toBe(false)
    expect(canOfferSplit({ segments: [], viewportWidth: 1920, coarsePointer: false })).toBe(false)
  })
})
