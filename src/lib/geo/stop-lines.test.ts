// ─── stop-lines tests ─────────────────────────────────────────────────────────
// THE RULE THIS FILE EXISTS FOR:
//
//   a stop bar is a claim about who has priority.
//
// An absent bar leaves a junction looking plain. A bar on the wrong side of it
// tells a client that traffic stops where it does not — and priority is the one
// thing at a crossroads that a viewer will act on. Most of what follows tests
// that no bar appears where the data does not put one.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  approachEnd, isSignalised, stopBarQuad,
  STOP_LINE_M, STOP_SETBACK_M, SIGNAL_SEARCH_M,
  type ApproachRibbon,
} from './stop-lines'

const v = (x: number, y: number) => new THREE.Vector2(x, y)

/** A straight ribbon east along y=0, half-width 4, from x=0 to x=100. */
const ribbon = (over: Partial<ApproachRibbon> = {}): ApproachRibbon => ({
  centre: [v(0, 0), v(50, 0), v(100, 0)],
  left: [v(0, 4), v(50, 4), v(100, 4)],
  right: [v(0, -4), v(50, -4), v(100, -4)],
  trimmedStart: true,
  trimmedEnd: true,
  oneway: true,
  ...over,
})

describe('approachEnd', () => {
  it('takes the downstream end of a one-way ribbon', () => {
    expect(approachEnd(ribbon())).toBe('end')
  })

  it('takes the other end when the way is drawn against the traffic', () => {
    expect(approachEnd(ribbon({ onewayReverse: true }))).toBe('start')
  })

  it('holds nothing where the ribbon does not meet a junction', () => {
    // An untrimmed end is a dangling way, not an approach.
    expect(approachEnd(ribbon({ trimmedEnd: false }))).toBeNull()
    expect(approachEnd(ribbon({ onewayReverse: true, trimmedStart: false }))).toBeNull()
  })

  it('refuses two-way roads rather than guessing the driving side', () => {
    // A bar across the full width would hold traffic LEAVING the junction. The
    // approaching half is the driving side of the country, which is not tagged.
    expect(approachEnd(ribbon({ oneway: false }))).toBeNull()
    expect(approachEnd(ribbon({ oneway: undefined }))).toBeNull()
  })

  it('ignores a ribbon with no direction of its own', () => {
    expect(approachEnd(ribbon({ centre: [v(0, 0)] }))).toBeNull()
  })
})

describe('isSignalised', () => {
  it('accepts a signal inside the radius and rejects one beyond it', () => {
    expect(isSignalised(v(0, 0), [v(20, 0)], SIGNAL_SEARCH_M)).toBe(true)
    expect(isSignalised(v(0, 0), [v(60, 0)], SIGNAL_SEARCH_M)).toBe(false)
  })

  it('clears the junction pullback of a wide avenue', () => {
    // The ribbon end is pulled back by the half-width of the road it crosses —
    // ~20 m on an avenue — while the signal node sits at the junction.
    expect(isSignalised(v(0, 0), [v(20, 0)], SIGNAL_SEARCH_M)).toBe(true)
  })

  it('does not reach the next junction down a dense grid', () => {
    expect(isSignalised(v(0, 0), [v(100, 0)], SIGNAL_SEARCH_M)).toBe(false)
  })

  it('has nothing to find with no signals mapped', () => {
    expect(isSignalised(v(0, 0), [], SIGNAL_SEARCH_M)).toBe(false)
  })
})

describe('stopBarQuad', () => {
  it('spans kerb to kerb across the approach', () => {
    const q = stopBarQuad(ribbon(), 'end', STOP_SETBACK_M, STOP_LINE_M)!
    expect(q).toHaveLength(4)
    const ys = q.map((p) => p.y)
    expect(Math.min(...ys)).toBeCloseTo(-4, 10)
    expect(Math.max(...ys)).toBeCloseTo(4, 10)
  })

  it('sits back from the end, on the approach side of it', () => {
    // Held back so a stopped vehicle does not overhang the crossing traffic —
    // and never beyond the end, which would paint inside the junction.
    const q = stopBarQuad(ribbon(), 'end', STOP_SETBACK_M, STOP_LINE_M)!
    for (const p of q) expect(p.x).toBeLessThan(100)
    const xs = q.map((p) => p.x)
    expect(Math.max(...xs)).toBeCloseTo(100 - STOP_SETBACK_M, 10)
    expect(Math.min(...xs)).toBeCloseTo(100 - STOP_SETBACK_M - STOP_LINE_M, 10)
  })

  it('lays the bar at the other end, pointing the other way', () => {
    const q = stopBarQuad(ribbon(), 'start', STOP_SETBACK_M, STOP_LINE_M)!
    const xs = q.map((p) => p.x)
    expect(Math.min(...xs)).toBeCloseTo(STOP_SETBACK_M, 10)
    expect(Math.max(...xs)).toBeCloseTo(STOP_SETBACK_M + STOP_LINE_M, 10)
  })

  it('follows a skewed end instead of squaring off the centreline', () => {
    // An oblique junction trims the arm at an angle. A bar squared off the
    // centreline leaves a wedge unpainted on one side and overhangs the other.
    const skew: ApproachRibbon = {
      centre: [v(0, 0), v(100, 0)],
      left: [v(0, 4), v(106, 4)],
      right: [v(0, -4), v(94, -4)],
      trimmedStart: false, trimmedEnd: true, oneway: true,
    }
    const q = stopBarQuad(skew, 'end', 0, STOP_LINE_M)!
    // The two ends of the bar keep the borders' own offset, 12 m apart in x.
    expect(Math.abs(q[0].x - q[1].x)).toBeCloseTo(12, 10)
    expect(q[0].y).toBeCloseTo(4, 10)
    expect(q[1].y).toBeCloseTo(-4, 10)
  })

  it('has a real thickness along the road', () => {
    const q = stopBarQuad(ribbon(), 'end', STOP_SETBACK_M, STOP_LINE_M)!
    expect(Math.abs(q[0].x - q[3].x)).toBeCloseTo(STOP_LINE_M, 10)
  })

  it('declines a degenerate end rather than emitting a stripe of nothing', () => {
    expect(stopBarQuad(ribbon({ centre: [v(0, 0)] }), 'end', 1, 0.5)).toBeNull()
    expect(stopBarQuad(
      { ...ribbon(), left: [v(0, 0), v(50, 0), v(100, 0)], right: [v(0, 0), v(50, 0), v(100, 0)] },
      'end', 1, 0.5,
    )).toBeNull()
    expect(stopBarQuad(
      { ...ribbon(), centre: [v(100, 0), v(100, 0), v(100, 0)] }, 'end', 1, 0.5,
    )).toBeNull()
  })

  it('tolerates border arrays shorter than the centreline', () => {
    expect(stopBarQuad({ ...ribbon(), left: [v(0, 4)] }, 'end', 1, 0.5)).toBeNull()
  })
})
