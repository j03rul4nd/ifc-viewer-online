// ─── tunnel-portal tests ──────────────────────────────────────────────────────
// THE RULE THIS FILE EXISTS FOR:
//
//   a way that goes under and comes back up has TWO ends, and both of them are
//   holes in the road until something is drawn there.
//
// The tempting version of this module finds "the tunnel" and returns one
// portal. A pedestrian underpass — which is most of what Lujiazui's 72
// below-ground ways are — dips under a plaza and surfaces on the far side, so
// the one-portal version fixes half of each and leaves the other half as the
// slot it was meant to remove.

import { describe, it, expect } from 'vitest'
import {
  findPortals, portalOpening, PORTAL_HEADROOM_M, type ProfileStation,
} from './tunnel-portal'

const MARGIN = 0.5

/** A way that dips: down from `s0`, under between `s1` and `s2`, up by `s3`. */
function underpass(): ProfileStation[] {
  const out: ProfileStation[] = []
  for (let s = 0; s <= 200; s += 10) {
    // Ground flat at 0; the way dives to -6 in the middle.
    const e = s < 60 ? -(s / 60) * 6 : s > 140 ? -((200 - s) / 60) * 6 : -6
    out.push({ x: s, y: 0, elevationM: e, groundM: 0 })
  }
  return out
}

describe('findPortals', () => {
  it('finds BOTH ends of an underpass', () => {
    const p = findPortals(underpass(), MARGIN)
    expect(p).toHaveLength(2)
    expect(p[0].x).toBeLessThan(60)
    expect(p[1].x).toBeGreaterThan(140)
  })

  it('points each portal into the ground, not along the way', () => {
    // So a caller can orient a headwall without working out which side is
    // daylight. The two ends of one tunnel therefore face opposite ways.
    const [entry, exit] = findPortals(underpass(), MARGIN)
    expect(entry.dx).toBeCloseTo(1, 6)
    expect(exit.dx).toBeCloseTo(-1, 6)
  })

  it('returns a unit direction', () => {
    for (const p of findPortals(underpass(), MARGIN)) {
      expect(Math.hypot(p.dx, p.dy)).toBeCloseTo(1, 9)
    }
  })

  it('interpolates the crossing instead of snapping to a vertex', () => {
    // A way's vertices are wherever the surveyor clicked. Rounding to the
    // nearest moves a tunnel mouth by the vertex spacing, routinely tens of
    // metres on an OSM way.
    const coarse: ProfileStation[] = [
      { x: 0, y: 0, elevationM: 0, groundM: 0 },
      { x: 100, y: 0, elevationM: -10, groundM: 0 },
    ]
    const [p] = findPortals(coarse, MARGIN)
    expect(p.x).toBeGreaterThan(0)
    expect(p.x).toBeLessThan(50)
    // Ground - margin - elevation = 0 at the crossing.
    expect(p.groundM - MARGIN - p.elevationM).toBeCloseTo(0, 6)
  })

  it('solves against a moving ground, not just a moving way', () => {
    // A level way passing under a rising bank crosses too, and the crossing is
    // where the two meet — nothing to do with the way's own gradient.
    const bank: ProfileStation[] = []
    for (let s = 0; s <= 100; s += 10) bank.push({ x: s, y: 0, elevationM: 0, groundM: s * 0.2 })
    const [p] = findPortals(bank, MARGIN)
    expect(p).toBeDefined()
    expect(p.groundM - MARGIN - p.elevationM).toBeCloseTo(0, 6)
  })

  it('finds nothing on a way that never goes under', () => {
    const surface: ProfileStation[] = []
    for (let s = 0; s <= 100; s += 10) surface.push({ x: s, y: 0, elevationM: 0, groundM: 0 })
    expect(findPortals(surface, MARGIN)).toEqual([])
  })

  it('finds nothing on a way that is under for its whole length', () => {
    // A metro running end to end below the surface has no portal in this box.
    // Inventing one at the edge of the data would put a tunnel mouth in the
    // middle of a street.
    const deep: ProfileStation[] = []
    for (let s = 0; s <= 100; s += 10) deep.push({ x: s, y: 0, elevationM: -20, groundM: 0 })
    expect(findPortals(deep, MARGIN)).toEqual([])
  })

  it('survives a degenerate profile', () => {
    expect(findPortals([], MARGIN)).toEqual([])
    expect(findPortals([{ x: 0, y: 0, elevationM: -5, groundM: 0 }], MARGIN)).toEqual([])
    // Two stations at the same point cannot give a direction, so they give
    // nothing rather than a NaN one.
    expect(findPortals([
      { x: 3, y: 3, elevationM: 0, groundM: 0 },
      { x: 3, y: 3, elevationM: -9, groundM: 0 },
    ], MARGIN)).toEqual([])
  })
})

describe('portalOpening', () => {
  it('gives the traffic the headroom it needs when there is cover for it', () => {
    const portal = { x: 0, y: 0, dx: 1, dy: 0, groundM: 12, elevationM: 0 }
    expect(portalOpening(portal, 'road', 10).heightM).toBe(PORTAL_HEADROOM_M.road)
    expect(portalOpening(portal, 'pedestrian', 4).heightM).toBe(PORTAL_HEADROOM_M.pedestrian)
  })

  it('never opens a hole taller than the ground above it', () => {
    // THE FAILURE THAT MATTERS. On a shallow crossing the ground is barely over
    // the invert, and a full-height opening punches through the surface above.
    const shallow = { x: 0, y: 0, dx: 1, dy: 0, groundM: 1.8, elevationM: 0 }
    expect(portalOpening(shallow, 'road', 10).heightM).toBeCloseTo(1.8, 6)
  })

  it('stays positive on a degenerate crossing', () => {
    const flat = { x: 0, y: 0, dx: 1, dy: 0, groundM: 0, elevationM: 0 }
    expect(portalOpening(flat, 'road', 10).heightM).toBeGreaterThan(0)
  })

  it('takes the width from the way, which is the one thing the survey knows', () => {
    const portal = { x: 0, y: 0, dx: 1, dy: 0, groundM: 12, elevationM: 0 }
    expect(portalOpening(portal, 'road', 9.5).widthM).toBe(9.5)
  })
})
