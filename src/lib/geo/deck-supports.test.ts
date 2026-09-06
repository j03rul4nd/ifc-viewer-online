// ─── deck-supports tests ──────────────────────────────────────────────────────
// THE RULE THIS FILE EXISTS FOR:
//
//   a pier must never appear where there is no room for one.
//
// The failure that matters is not "too few piers" — a span with one support
// short still reads as carried. It is a shaft standing in the open on a ramp,
// or one driven up through the deck it is meant to hold, both of which are
// worse than the floating deck they replaced.

import { describe, it, expect } from 'vitest'
import {
  placePiers, PIER_SPACING_M, PIER_WIDTH_M, MIN_SUPPORTED_CLEARANCE_M,
  type ProfilePoint,
} from './deck-supports'

/** A straight run: `lengthM` long, deck at `deckM`, ground at `groundM`. */
function run(lengthM: number, deckM: number, groundM = 0, step = 10): ProfilePoint[] {
  const out: ProfilePoint[] = []
  for (let s = 0; s <= lengthM; s += step) {
    out.push({ x: s, y: 0, stationM: s, elevationM: deckM, groundM })
  }
  return out
}

describe('placePiers', () => {
  it('carries a long span at roughly its own spacing', () => {
    const piers = placePiers(run(240, 12), 'pedestrian', 0.65)
    expect(piers.length).toBeGreaterThan(6)
    for (let i = 1; i < piers.length; i++) {
      const gap = piers[i].x - piers[i - 1].x
      expect(gap).toBeCloseTo(PIER_SPACING_M.pedestrian, 6)
    }
  })

  it('builds a road viaduct on a longer rhythm than a footbridge', () => {
    // Different objects. One spacing for both makes every elevated thing read
    // as the same thing — the mistake the deck depth used to make.
    const foot = placePiers(run(240, 12), 'pedestrian', 0.65)
    const road = placePiers(run(240, 12), 'vehicular', 1.1)
    expect(road.length).toBeLessThan(foot.length)
    expect(PIER_SPACING_M.vehicular).toBeGreaterThan(PIER_SPACING_M.pedestrian)
  })

  it('never places a pier where the deck is on the ground', () => {
    // THE FAILURE THAT MATTERS. A shaft standing in the open on a ramp is worse
    // than the floating deck it replaced.
    expect(placePiers(run(240, 0.2), 'pedestrian', 0.65)).toHaveLength(0)
  })

  it('leaves the ramps alone and supports only the raised middle', () => {
    // A real crossing: up a ramp, across, down again. Piers belong under the
    // span, not under the approach where the deck meets the ground.
    const pts: ProfilePoint[] = []
    for (let s = 0; s <= 300; s += 5) {
      const deck = s < 100 ? (s / 100) * 12 : s > 200 ? ((300 - s) / 100) * 12 : 12
      pts.push({ x: s, y: 0, stationM: s, elevationM: deck, groundM: 0 })
    }
    const piers = placePiers(pts, 'pedestrian', 0.65)
    expect(piers.length).toBeGreaterThan(0)
    for (const p of piers) {
      expect(p.topM - p.baseM).toBeGreaterThanOrEqual(MIN_SUPPORTED_CLEARANCE_M)
    }
  })

  it('stops the shaft at the soffit, not inside the deck', () => {
    // A pier that runs up into the deck pokes through the walking surface.
    const piers = placePiers(run(120, 12), 'pedestrian', 0.65)
    expect(piers.length).toBeGreaterThan(0)
    for (const p of piers) expect(p.topM).toBeCloseTo(12 - 0.65, 6)
  })

  it('follows the ground it stands on, not a flat datum', () => {
    // Over a bank, one pier is shorter than the next. Basing them all at zero
    // buries the uphill ones and floats the downhill ones.
    const pts: ProfilePoint[] = []
    for (let s = 0; s <= 200; s += 10) {
      pts.push({ x: s, y: 0, stationM: s, elevationM: 20, groundM: s * 0.03 })
    }
    const piers = placePiers(pts, 'pedestrian', 0.65)
    const bases = piers.map((p) => p.baseM)
    expect(new Set(bases).size).toBeGreaterThan(1)
    for (let i = 1; i < bases.length; i++) expect(bases[i]).toBeGreaterThan(bases[i - 1])
  })

  it('interpolates rather than snapping to the surveyor\'s vertices', () => {
    // A way's own vertices can be 80 m apart. Taking only those puts piers
    // wherever somebody happened to click.
    const coarse: ProfilePoint[] = [
      { x: 0, y: 0, stationM: 0, elevationM: 12, groundM: 0 },
      { x: 200, y: 0, stationM: 200, elevationM: 12, groundM: 0 },
    ]
    const piers = placePiers(coarse, 'pedestrian', 0.65)
    expect(piers.length).toBeGreaterThan(3)
    expect(piers.some((p) => p.x > 10 && p.x < 190)).toBe(true)
  })

  it('opens and closes a span without a pier against its abutment', () => {
    const piers = placePiers(run(240, 12), 'pedestrian', 0.65)
    expect(piers[0].x).toBeGreaterThan(5)
    expect(piers[piers.length - 1].x).toBeLessThan(240 - 5)
  })

  it('gives every class a width, and a footbridge a slimmer one than a road', () => {
    expect(PIER_WIDTH_M.pedestrian).toBeLessThan(PIER_WIDTH_M.vehicular)
    for (const cls of ['vehicular', 'pedestrian', 'track'] as const) {
      expect(PIER_WIDTH_M[cls], cls).toBeGreaterThan(0)
    }
  })

  it('survives a degenerate profile', () => {
    expect(placePiers([], 'pedestrian', 0.65)).toEqual([])
    expect(placePiers(run(0, 12), 'pedestrian', 0.65)).toEqual([])
    // Repeated stations must not spin the placement loop.
    const flat: ProfilePoint[] = [
      { x: 0, y: 0, stationM: 5, elevationM: 12, groundM: 0 },
      { x: 1, y: 0, stationM: 5, elevationM: 12, groundM: 0 },
    ]
    expect(placePiers(flat, 'pedestrian', 0.65)).toEqual([])
  })
})
