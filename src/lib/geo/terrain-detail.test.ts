import { describe, it, expect } from 'vitest'
import {
  planDetailLevels, detailFrames, detailRectUv, detailTexelN, detailBudget,
  DETAIL_MAX_ZOOM, DETAIL_DATA_MAX_Z, MIN_STREET_NAME_ANGLE_RAD,
} from './terrain-detail'

// A z15 3×3 patch around Plaça de Catalunya, as the app builds it.
const TILE = 1 / 2 ** 15
const patch = { minNx: 0.006 - 1.5 * TILE, maxNx: 0.006 + 1.5 * TILE, minNy: 0.12 - 1.5 * TILE, maxNy: 0.12 + 1.5 * TILE }
/** 3 072 px across the patch — what the single big texture is. */
const baseTexelN = (3 * TILE) / 3072
const focus = { nx: 0.006, ny: 0.12 }
const plan = (texelN: number, extra: Partial<Parameters<typeof planDetailLevels>[0]> = {}) =>
  planDetailLevels({ focus, texelN, patch, baseTexelN, size: 2048, maxLevels: 3, ...extra })

describe('planDetailLevels', () => {
  it('asks for nothing while the big texture is as sharp as the screen', () => {
    expect(plan(baseTexelN)).toEqual([])
    expect(plan(baseTexelN * 4)).toEqual([])
  })

  it('asks for nothing when the view is centred off the relief', () => {
    expect(plan(baseTexelN / 8, { focus: { nx: patch.maxNx + TILE, ny: 0.12 } })).toEqual([])
  })

  it('gives the innermost square about one texel per device pixel', () => {
    for (const k of [2, 3, 5, 8, 13, 20]) {
      const wanted = baseTexelN / k
      const [inner] = plan(wanted)
      const ratio = detailTexelN(inner.z) / wanted
      // Never more than 1.23 px per texel, never finer than half a pixel.
      expect(ratio).toBeLessThanOrEqual(2 ** 0.3 + 1e-9)
      expect(ratio).toBeGreaterThan(0.5 * 2 ** 0.3 - 1e-9)
    }
  })

  it('nests squares one zoom apart, sharpest first, never coarser than needed', () => {
    const levels = plan(baseTexelN / 16)
    expect(levels.map((l) => l.z)).toEqual([20, 19, 18])
    for (let i = 1; i < levels.length; i++) expect(levels[i].half).toBeCloseTo(levels[i - 1].half * 2, 15)
    // One zoom sharper than the base is the coarsest square worth painting.
    expect(plan(baseTexelN / 2.2).map((l) => l.z)).toEqual([17])
  })

  it('stops at the sharpest zoom the data supports', () => {
    expect(plan(baseTexelN / 4000)[0].z).toBe(DETAIL_MAX_ZOOM)
  })

  it('keeps every square over the focus, with at least 3/8 of its side to spare', () => {
    for (const dx of [0, 0.13, 0.37, 0.5, 0.77]) {
      const f = { nx: focus.nx + dx * TILE, ny: focus.ny - dx * 0.6 * TILE }
      for (const l of plan(baseTexelN / 16, { focus: f })) {
        expect(Math.abs(f.nx - l.cx)).toBeLessThanOrEqual(l.half / 4 + 1e-15)
        expect(Math.abs(f.ny - l.cy)).toBeLessThanOrEqual(l.half / 4 + 1e-15)
      }
    }
  })

  it('does not repaint for a small camera move', () => {
    const a = plan(baseTexelN / 16)
    const step = a[0].half / 2 // the snap grid of the innermost square
    const b = plan(baseTexelN / 16, { focus: { nx: focus.nx + step * 0.2, ny: focus.ny } })
    // The coarser squares snap on a coarser grid: they are certainly the same.
    expect(b[2].key).toBe(a[2].key)
    expect(b[1].key).toBe(a[1].key)
  })

  it('writes street names into the innermost square only', () => {
    const levels = plan(baseTexelN / 16)
    expect(levels.map((l) => l.labels)).toEqual([true, false, false])
    // The same square without names is a different picture.
    expect(levels[0].key).not.toBe(levels[0].key.replace('/n', ''))
  })

  it('honours the device budget', () => {
    expect(plan(baseTexelN / 16, detailBudget(true))).toHaveLength(2)
    expect(detailBudget(false).size).toBeGreaterThan(detailBudget(true).size)
  })
})

describe('detailFrames', () => {
  it('covers the square with the z14 tiles under it, edges shared exactly', () => {
    const [inner, , outer] = plan(baseTexelN / 16)
    for (const level of [inner, outer]) {
      const frames = detailFrames(level, 2048)
      expect(frames.length).toBeGreaterThanOrEqual(1)
      expect(frames.every((f) => f.z === DETAIL_DATA_MAX_Z)).toBe(true)
      // Together they cover the whole canvas…
      expect(Math.min(...frames.map((f) => f.left))).toBeLessThanOrEqual(0)
      expect(Math.max(...frames.map((f) => f.right))).toBeGreaterThanOrEqual(2048)
      expect(Math.min(...frames.map((f) => f.top))).toBeLessThanOrEqual(0)
      expect(Math.max(...frames.map((f) => f.bottom))).toBeGreaterThanOrEqual(2048)
      // …and neighbours meet on the same pixel column.
      for (const a of frames) {
        const right = frames.find((b) => b.y === a.y && b.x === a.x + 1)
        if (right) expect(right.left).toBe(a.right)
      }
    }
  })

  it('places a tile where the map says it is', () => {
    // A square exactly one z14 tile wide, centred on it: one frame, the canvas.
    const n = 2 ** 14
    const level = { cx: (4321 + 0.5) / n - 0.5, cy: 0.5 - (2987 + 0.5) / n, half: 0.5 / n }
    expect(detailFrames(level, 1024)).toEqual([
      { z: 14, x: 4321, y: 2987, left: 0, top: 0, right: 1024, bottom: 1024 },
    ])
  })
})

describe('detailRectUv', () => {
  it('maps a square to the patch texture, v growing north', () => {
    const level = { cx: patch.minNx + 0.25 * 3 * TILE, cy: patch.minNy + 0.75 * 3 * TILE, half: 0.1 * 3 * TILE }
    const r = detailRectUv(level, patch)
    expect(r.u).toBeCloseTo(0.25, 9)
    expect(r.v).toBeCloseTo(0.75, 9)
    // (uv − centre) × scale = ±1 at the square's edge.
    expect(0.1 * r.scale).toBeCloseTo(1, 9)
  })
})

describe('street names on the ground (WP5)', () => {
  it('leaves them out of the innermost square when the ground is seen at under 20°', () => {
    const deg = (d: number) => (d * Math.PI) / 180
    expect(MIN_STREET_NAME_ANGLE_RAD).toBeCloseTo(deg(20), 12)
    const low = plan(baseTexelN / 8, { viewAngleRad: deg(15) })
    const high = plan(baseTexelN / 8, { viewAngleRad: deg(30) })
    expect(low.some((l) => l.labels)).toBe(false)
    expect(high[0].labels).toBe(true)
    // Different pixels, different identity: the square is repainted.
    expect(low[0].key).not.toBe(high[0].key)
    // Unknown angle keeps the old behaviour.
    expect(plan(baseTexelN / 8)[0].labels).toBe(true)
  })
})
