// ─── depth range tests ────────────────────────────────────────────────────────
// THE RULE THIS FILE EXISTS FOR:
//
//   assert the DEPTH RESOLUTION, never the far/near ratio.
//
// The first version of this module optimised the ratio, and these tests caught
// it: with a fixed 60 km far plane, moving the camera closer makes the ratio
// WORSE while making the picture better, so a ratio target is satisfied by
// exactly the wrong changes. Resolution at the focused distance is the quantity
// that decides whether two surfaces flicker, and it is the one asserted here.

import { describe, it, expect } from 'vitest'
import {
  depthRangeFor, depthRangeChanged, depthResolutionM,
  MIN_NEAR_M, MAX_NEAR_FRACTION, TARGET_RESOLUTION_M,
} from './depth-range'

const FAR = 60_000
/** What map mode set statically before this module existed. */
const OLD_NEAR = 0.5

describe('depthRangeFor', () => {
  it('hits the precision goal at close range, where it is reachable', () => {
    const r = depthRangeFor(50, FAR)
    expect(r.clipLimited).toBe(false)
    expect(r.resolutionAtM(50)).toBeLessThanOrEqual(TARGET_RESOLUTION_M * 1.001)
  })

  it('admits when the clipping rail, not the goal, decided the plane', () => {
    // THE TWO CONSTRAINTS GENUINELY CONFLICT past about 100 m: resolving a
    // tenth of a millimetre would need a near plane beyond the safety rail.
    // The rail wins — clipping the model is worse than flicker on it — and the
    // limit is reported rather than quietly missed.
    const r = depthRangeFor(500, FAR)
    expect(r.clipLimited).toBe(true)
    expect(r.resolutionAtM(500)).toBeGreaterThan(TARGET_RESOLUTION_M)
  })

  it('beats the static near plane it replaces, at every distance that matters', () => {
    // At 300 m the old range resolved about a centimetre — wider than the gap
    // between a curtain wall and its spandrel, so they shared a depth value.
    for (const d of [200, 500, 1_000]) {
      const now = depthRangeFor(d, FAR).resolutionAtM(d)
      expect(now, `at ${d} m`).toBeLessThan(depthResolutionM(OLD_NEAR, d))
    }
  })

  it('never clips what the camera is standing next to', () => {
    // Too near costs precision; too far costs GEOMETRY. A model that vanishes
    // into its own near plane is unrecoverable for a user who does not know why.
    for (const d of [1, 10, 100, 5_000]) {
      // The floor outranks the cap at very close range: at 1 m from a surface
      // there is nothing behind it whose precision is worth losing it for.
      const cap = Math.max(MIN_NEAR_M, d * MAX_NEAR_FRACTION)
      expect(depthRangeFor(d, FAR).nearM, `at ${d} m`).toBeLessThanOrEqual(cap)
    }
  })

  it('holds the floor when the camera is right against a wall', () => {
    expect(depthRangeFor(0.4, FAR).nearM).toBe(MIN_NEAR_M)
  })

  it('grows the near plane with distance, monotonically', () => {
    const near = [10, 100, 1_000, 10_000].map((d) => depthRangeFor(d, FAR).nearM)
    for (let i = 1; i < near.length; i++) expect(near[i]).toBeGreaterThanOrEqual(near[i - 1])
  })

  it('leaves the horizon where it is', () => {
    // Pulling the far plane in would buy almost no precision — far enters the
    // formula only as a vanishing correction — and would cut off the map, which
    // is a worse picture than a little flicker.
    expect(depthRangeFor(500, FAR).farM).toBe(FAR)
  })

  it('never returns a near plane past its own far plane', () => {
    const r = depthRangeFor(1_000, 1)
    expect(r.nearM).toBeLessThan(r.farM)
  })

  it('survives a degenerate distance rather than producing NaN planes', () => {
    for (const d of [0, -5, NaN, Infinity]) {
      const r = depthRangeFor(d, FAR)
      expect(Number.isFinite(r.nearM), `${d}`).toBe(true)
      expect(r.nearM).toBeGreaterThanOrEqual(MIN_NEAR_M)
    }
  })
})

describe('depthResolutionM', () => {
  it('degrades with the square of distance, which is why near has to move', () => {
    const a = depthResolutionM(1, 100)
    const b = depthResolutionM(1, 200)
    expect(b / a).toBeCloseTo(4, 3)
  })
})

describe('depthRangeChanged', () => {
  it('always accepts the first range', () => {
    expect(depthRangeChanged(null, depthRangeFor(100, FAR))).toBe(true)
  })

  it('ignores jitter far below what a depth test can notice', () => {
    const a = depthRangeFor(1_000, FAR)
    expect(depthRangeChanged(a, depthRangeFor(1_000.4, FAR))).toBe(false)
  })

  it('reacts to a real camera move', () => {
    const a = depthRangeFor(1_000, FAR)
    expect(depthRangeChanged(a, depthRangeFor(2_000, FAR))).toBe(true)
  })
})
